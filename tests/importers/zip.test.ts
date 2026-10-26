import { strToU8, zipSync } from 'fflate'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openZip } from '../../src/importers/zip'

const blobOf = (u8: Uint8Array) => new Blob([u8 as Uint8Array<ArrayBuffer>])

afterEach(() => vi.restoreAllMocks())

describe('openZip', () => {
  it('reads stored and deflated entries lazily, skipping directories', async () => {
    const big = 'hello world\n'.repeat(5000)
    const zip = zipSync({
      'chat/_chat.txt': [strToU8(big), { level: 9 }],
      'stored.json': [strToU8('{"a":1}'), { level: 0 }],
      'empty/': new Uint8Array(0),
      'Ünïcode name.txt': [strToU8('ok'), { level: 6 }],
    })
    const files = await openZip(blobOf(zip), 'export.zip')
    const byName = Object.fromEntries(files.map((f) => [f.path, f]))
    expect(Object.keys(byName).sort()).toEqual(
      ['export.zip/chat/_chat.txt', 'export.zip/stored.json', 'export.zip/Ünïcode name.txt'].sort(),
    )
    const chat = byName['export.zip/chat/_chat.txt']
    expect(chat.name).toBe('_chat.txt')
    expect(chat.size).toBe(big.length)
    expect(await chat.text()).toBe(big)
    expect(await byName['export.zip/stored.json'].text()).toBe('{"a":1}')
    expect(await byName['export.zip/Ünïcode name.txt'].text()).toBe('ok')
  })

  it('never slices the whole archive when reading one small entry', async () => {
    const media = new Uint8Array(2_000_000)
    for (let i = 0; i < media.length; i++) media[i] = (i * 2654435761) >>> 24
    const zip = zipSync({ 'media/video.mp4': [media, { level: 0 }], 'result.json': strToU8('{"x":true}') })
    const sizes: number[] = []
    const orig = Blob.prototype.slice
    vi.spyOn(Blob.prototype, 'slice').mockImplementation(function (this: Blob, start?: number, end?: number, ct?: string) {
      sizes.push((end ?? this.size) - (start ?? 0))
      return orig.call(this, start, end, ct)
    })
    const files = await openZip(blobOf(zip), 'a.zip')
    const json = files.find((f) => f.name === 'result.json')!
    expect(await json.text()).toBe('{"x":true}')
    expect(Math.max(...sizes)).toBeLessThan(100_000)
  })

  it('throws clear errors for non-zips, encrypted and unsupported entries', async () => {
    await expect(openZip(new Blob(['not a zip at all, definitely not']), 'x.zip')).rejects.toThrow(/not a zip/)

    const zip = zipSync({ 'a.txt': [strToU8('aaaa'), { level: 0 }], 'b.txt': [strToU8('bbbb'), { level: 0 }] })
    const patched = zip.slice()
    const dv = new DataView(patched.buffer)
    // Find central directory headers and patch flags/method.
    const cens: number[] = []
    for (let i = 0; i < patched.length - 4; i++) if (dv.getUint32(i, true) === 0x02014b50) cens.push(i)
    dv.setUint16(cens[0] + 8, dv.getUint16(cens[0] + 8, true) | 1, true) // encrypted
    dv.setUint16(cens[1] + 10, 14, true) // LZMA
    const files = await openZip(blobOf(patched), 'p.zip')
    await expect(files[0].text()).rejects.toThrow(/encrypted/)
    await expect(files[1].text()).rejects.toThrow(/unsupported zip compression method 14/)
  })

  it('decodes non-UTF-8 names as CP437', async () => {
    const zip = zipSync({ 'XX.txt': [strToU8('hi'), { level: 0 }] })
    const dv = new DataView(zip.buffer)
    for (let i = 0; i < zip.length - 4; i++) {
      const sig = dv.getUint32(i, true)
      if (sig === 0x02014b50) {
        dv.setUint16(i + 8, dv.getUint16(i + 8, true) & ~0x800, true)
        zip[i + 46] = 0x81 // ü
        zip[i + 47] = 0xe1 // ß
      }
    }
    const [f] = await openZip(blobOf(zip), 'z.zip')
    expect(f.name).toBe('üß.txt')
  })

  it('reads a hand-crafted Zip64 archive', async () => {
    const name = strToU8('big/result.json')
    const data = strToU8('{"zip64":"yes"}')
    const parts: number[] = []
    const u16 = (v: number) => parts.push(v & 0xff, (v >>> 8) & 0xff)
    const u32 = (v: number) => {
      u16(v & 0xffff)
      u16(v >>> 16)
    }
    const u64 = (v: number) => {
      u32(v % 0x1_0000_0000)
      u32(Math.floor(v / 0x1_0000_0000))
    }
    const bytes = (b: Uint8Array) => parts.push(...b)

    // local header
    const localOffset = parts.length
    u32(0x04034b50); u16(45); u16(0x800); u16(0); u16(0); u16(0); u32(0)
    u32(0xffffffff); u32(0xffffffff); u16(name.length); u16(20)
    bytes(name)
    u16(1); u16(16); u64(data.length); u64(data.length)
    bytes(data)
    // central directory
    const cdOffset = parts.length
    u32(0x02014b50); u16(45); u16(45); u16(0x800); u16(0); u16(0); u16(0); u32(0)
    u32(0xffffffff); u32(0xffffffff); u16(name.length); u16(28); u16(0); u16(0); u16(0); u32(0)
    u32(0xffffffff)
    bytes(name)
    u16(1); u16(24); u64(data.length); u64(data.length); u64(localOffset)
    const cdSize = parts.length - cdOffset
    // zip64 EOCD record
    const rec64 = parts.length
    u32(0x06064b50); u64(44); u16(45); u16(45); u32(0); u32(0); u64(1); u64(1); u64(cdSize); u64(cdOffset)
    // locator
    u32(0x07064b50); u32(0); u64(rec64); u32(1)
    // EOCD
    u32(0x06054b50); u16(0); u16(0); u16(0xffff); u16(0xffff); u32(0xffffffff); u32(0xffffffff); u16(0)

    const files = await openZip(blobOf(new Uint8Array(parts)), 'z64.zip')
    expect(files).toHaveLength(1)
    expect(files[0].path).toBe('z64.zip/big/result.json')
    expect(files[0].size).toBe(data.length)
    expect(await files[0].text()).toBe('{"zip64":"yes"}')
  })
})
