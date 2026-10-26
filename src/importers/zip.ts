import { inflateSync } from 'fflate'
import type { SourceFile } from './source'

/**
 * Random-access ZIP reader over a Blob.
 *
 * Only the end-of-central-directory region, the central directory, and (on
 * demand) each entry's local header + compressed data are ever sliced from
 * the blob, so multi-GB exports full of media never get loaded wholesale.
 *
 * Supports stored (0) and deflate (8) entries and Zip64 archives. Encrypted
 * entries and other compression methods throw when read. Directory entries
 * and macOS `__MACOSX/` resource-fork shadows are skipped.
 */

const SIG_EOCD = 0x06054b50
const SIG_EOCD64 = 0x06064b50
const SIG_EOCD64_LOC = 0x07064b50
const SIG_CEN = 0x02014b50
const SIG_LOC = 0x04034b50

const EOCD_MIN = 22
const MAX_COMMENT = 0xffff

// CP437 upper half (0x80–0xFF), the historical default zip name encoding.
const CP437_HIGH =
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ '

const utf8Fatal = new TextDecoder('utf-8', { fatal: true })
const utf8 = new TextDecoder('utf-8')

function decodeName(bytes: Uint8Array, utf8Flag: boolean): string {
  let ascii = true
  for (let i = 0; i < bytes.length; i++) if (bytes[i] >= 0x80) ascii = false
  if (ascii || utf8Flag) return utf8.decode(bytes)
  // Many tools (macOS Archive Utility, Meta/Telegram exports) write UTF-8
  // without setting bit 11; accept it when it decodes cleanly.
  try {
    return utf8Fatal.decode(bytes)
  } catch {
    let s = ''
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i]
      s += b < 0x80 ? String.fromCharCode(b) : CP437_HIGH[b - 0x80]
    }
    return s
  }
}

async function readRange(blob: Blob, start: number, end: number): Promise<DataView> {
  const buf = await blob.slice(start, end).arrayBuffer()
  return new DataView(buf)
}

const u64 = (v: DataView, o: number) => v.getUint32(o, true) + v.getUint32(o + 4, true) * 0x1_0000_0000

interface Entry {
  name: string
  flags: number
  method: number
  compressedSize: number
  size: number
  localOffset: number
}

export async function openZip(blob: Blob, archivePath: string): Promise<SourceFile[]> {
  const size = blob.size
  if (size < EOCD_MIN) throw new Error(`${archivePath}: not a zip archive (file too small)`)

  // ---- locate EOCD in the trailing 64KB + 22 bytes
  const tailStart = Math.max(0, size - (MAX_COMMENT + EOCD_MIN))
  const tail = await readRange(blob, tailStart, size)
  let eocd = -1
  for (let i = tail.byteLength - EOCD_MIN; i >= 0; i--) {
    if (tail.getUint32(i, true) === SIG_EOCD) {
      // Sanity: comment length must fit exactly within the file.
      const commentLen = tail.getUint16(i + 20, true)
      if (i + EOCD_MIN + commentLen <= tail.byteLength) {
        eocd = i
        break
      }
    }
  }
  if (eocd < 0) throw new Error(`${archivePath}: not a zip archive (no end-of-central-directory record)`)

  let total = tail.getUint16(eocd + 10, true)
  let cdSize = tail.getUint32(eocd + 12, true)
  let cdOffset = tail.getUint32(eocd + 16, true)

  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    // ---- Zip64: locator sits immediately before the EOCD.
    const locPos = eocd - 20
    if (locPos < 0 || tail.getUint32(locPos, true) !== SIG_EOCD64_LOC) {
      throw new Error(`${archivePath}: Zip64 archive is missing its locator record`)
    }
    const rec64Offset = u64(tail, locPos + 8)
    const rec = await readRange(blob, rec64Offset, rec64Offset + 56)
    if (rec.byteLength < 56 || rec.getUint32(0, true) !== SIG_EOCD64) {
      throw new Error(`${archivePath}: corrupt Zip64 end-of-central-directory record`)
    }
    total = u64(rec, 32)
    cdSize = u64(rec, 40)
    cdOffset = u64(rec, 48)
  }

  if (cdOffset + cdSize > size) throw new Error(`${archivePath}: truncated zip (central directory out of range)`)

  // ---- central directory
  const cd = await readRange(blob, cdOffset, cdOffset + cdSize)
  const bytes = new Uint8Array(cd.buffer, cd.byteOffset, cd.byteLength)
  const entries: Entry[] = []
  let p = 0
  for (let n = 0; n < total && p + 46 <= cd.byteLength; n++) {
    if (cd.getUint32(p, true) !== SIG_CEN) throw new Error(`${archivePath}: corrupt central directory`)
    const flags = cd.getUint16(p + 8, true)
    const method = cd.getUint16(p + 10, true)
    let compressedSize = cd.getUint32(p + 20, true)
    let uncompressed = cd.getUint32(p + 24, true)
    const nameLen = cd.getUint16(p + 28, true)
    const extraLen = cd.getUint16(p + 30, true)
    const commentLen = cd.getUint16(p + 32, true)
    let localOffset = cd.getUint32(p + 42, true)
    const name = decodeName(bytes.subarray(p + 46, p + 46 + nameLen), (flags & 0x800) !== 0)

    // Zip64 extended information extra field (0x0001).
    let e = p + 46 + nameLen
    const extraEnd = e + extraLen
    while (e + 4 <= extraEnd) {
      const id = cd.getUint16(e, true)
      const len = cd.getUint16(e + 2, true)
      if (id === 0x0001) {
        let q = e + 4
        if (uncompressed === 0xffffffff && q + 8 <= e + 4 + len) {
          uncompressed = u64(cd, q)
          q += 8
        }
        if (compressedSize === 0xffffffff && q + 8 <= e + 4 + len) {
          compressedSize = u64(cd, q)
          q += 8
        }
        if (localOffset === 0xffffffff && q + 8 <= e + 4 + len) {
          localOffset = u64(cd, q)
          q += 8
        }
      }
      e += 4 + len
    }
    p = extraEnd + commentLen

    if (name.endsWith('/') || name.endsWith('\\')) continue
    if (name.startsWith('__MACOSX/') || name.split('/').pop()!.startsWith('._')) continue
    entries.push({ name, flags, method, compressedSize, size: uncompressed, localOffset })
  }

  return entries.map((entry) => makeSource(blob, archivePath, entry))
}

function makeSource(blob: Blob, archivePath: string, entry: Entry): SourceFile {
  const path = `${archivePath}/${entry.name}`
  let dataOffset: number | undefined

  const bytes = async (): Promise<Uint8Array> => {
    if (entry.flags & 0x1) throw new Error(`${path}: entry is encrypted; re-export without a password`)
    if (entry.method !== 0 && entry.method !== 8) {
      throw new Error(`${path}: unsupported zip compression method ${entry.method}`)
    }
    if (dataOffset === undefined) {
      const lh = await readRange(blob, entry.localOffset, entry.localOffset + 30)
      if (lh.byteLength < 30 || lh.getUint32(0, true) !== SIG_LOC) {
        throw new Error(`${path}: corrupt local file header`)
      }
      dataOffset = entry.localOffset + 30 + lh.getUint16(26, true) + lh.getUint16(28, true)
    }
    const end = dataOffset + entry.compressedSize
    if (end > blob.size) throw new Error(`${path}: truncated zip entry`)
    const raw = new Uint8Array(await blob.slice(dataOffset, end).arrayBuffer())
    if (entry.method === 0) return raw
    try {
      return inflateSync(raw)
    } catch (err) {
      throw new Error(`${path}: failed to inflate entry (${(err as Error).message})`)
    }
  }

  return {
    path,
    name: entry.name.split('/').pop() ?? entry.name,
    size: entry.size,
    bytes,
    text: async () => utf8.decode(await bytes()),
  }
}
