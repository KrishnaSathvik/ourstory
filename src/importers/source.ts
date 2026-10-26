import type { ImportOptions, ParsedChat, Platform } from '../core/types'

/**
 * A file to import: either a user-selected File or an entry inside a zip.
 * Reading is lazy so we never decompress media we don't need.
 */
export interface SourceFile {
  /** Full path (zip entries: "archive.zip/inner/path.json"). */
  path: string
  /** Base name. */
  name: string
  size: number
  text(): Promise<string>
  bytes(): Promise<Uint8Array>
}

export interface Parser {
  platform: Platform
  /**
   * Cheap format detection. `head` is the first ~4KB decoded as UTF-8.
   * Return a confidence 0..1 (0 = definitely not this format).
   */
  sniff(file: SourceFile, head: string): number
  parse(file: SourceFile, opts: ImportOptions): Promise<ParsedChat[]>
}

let counter = 0
export const chatId = (platform: Platform) => `${platform}-${Date.now().toString(36)}-${(counter++).toString(36)}`

export function fromBlob(blob: Blob, path: string): SourceFile {
  const name = path.split('/').pop() ?? path
  return {
    path,
    name,
    size: blob.size,
    text: () => blob.text(),
    bytes: async () => new Uint8Array(await blob.arrayBuffer()),
  }
}

export function fromString(text: string, path: string): SourceFile {
  const bytes = new TextEncoder().encode(text)
  return {
    path,
    name: path.split('/').pop() ?? path,
    size: bytes.length,
    text: async () => text,
    bytes: async () => bytes,
  }
}

export function fromBytes(bytes: Uint8Array, path: string): SourceFile {
  return {
    path,
    name: path.split('/').pop() ?? path,
    size: bytes.length,
    text: async () => new TextDecoder().decode(bytes),
    bytes: async () => bytes,
  }
}
