import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Story } from '../../src/analysis/story'
import { forgetSaved, hasSavedStory, loadStory, saveStory, VAULT_KEY } from '../../src/storage/vault'
import { base64ToBytes, bytesToBase64, decryptJson, encryptJson, KDF_ITERATIONS } from '../../src/storage/crypto'
import { Pipeline } from '../../src/worker/pipeline'

let cached: Story | null = null

/** The real demo story, built once per test file. */
async function demoStory(): Promise<Story> {
  if (!cached) {
    const p = new Pipeline()
    const r = await p.importDemo()
    cached = p.analyze(r.suggestion, r.chats.map((c) => c.id))
  }
  return structuredClone(cached)
}

/** Minimal in-memory Storage for Node. */
class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  clear() {
    this.map.clear()
  }
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null
  }
  removeItem(k: string) {
    this.map.delete(k)
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v))
  }
}


let story: Story
const mem = new MemoryStorage()

beforeAll(async () => {
  Object.defineProperty(globalThis, 'localStorage', { value: mem, configurable: true, writable: true })
  story = await demoStory()
}, 60_000)
beforeEach(() => mem.clear())

describe('crypto helpers', () => {
  it('base64 roundtrips arbitrary bytes, including large buffers', () => {
    const bytes = new Uint8Array(100_000).map((_, i) => (i * 31) & 255)
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes)
    expect(() => base64ToBytes('not base64!')).toThrow()
  })

  it('uses fresh salt and IV and the required iteration count', async () => {
    const e1 = await encryptJson({ x: 1 }, 'pw')
    const e2 = await encryptJson({ x: 1 }, 'pw')
    expect(e1.iter).toBeGreaterThanOrEqual(310_000)
    expect(e1.iter).toBe(KDF_ITERATIONS)
    expect(base64ToBytes(e1.salt)).toHaveLength(16)
    expect(base64ToBytes(e1.iv)).toHaveLength(12)
    expect(e1.salt).not.toBe(e2.salt)
    expect(e1.iv).not.toBe(e2.iv)
    expect(e1.ct).not.toBe(e2.ct)
    expect(await decryptJson(e1, 'pw')).toEqual({ x: 1 })
  })

  it('rejects envelopes that demand absurd work or are tampered', async () => {
    const e = await encryptJson({ x: 1 }, 'pw')
    await expect(decryptJson({ ...e, iter: 1e12 }, 'pw')).rejects.toThrow(/damaged/)
    await expect(decryptJson({ ...e, iter: 10 }, 'pw')).rejects.toThrow(/damaged/)
    const ct = base64ToBytes(e.ct)
    ct[0] ^= 1
    await expect(decryptJson({ ...e, ct: bytesToBase64(ct) }, 'pw')).rejects.toThrow('Wrong passphrase')
  })
})

describe('vault', () => {
  it('starts empty', () => {
    expect(hasSavedStory()).toBe(false)
  })

  it('roundtrips a story with the right passphrase', async () => {
    await saveStory(story, 'correct horse battery staple')
    expect(hasSavedStory()).toBe(true)
    const back = await loadStory('correct horse battery staple')
    expect(back).toEqual(story)
  }, 30_000)

  it('stores only ciphertext in a versioned envelope', async () => {
    await saveStory(story, 'pw-123')
    const raw = mem.getItem(VAULT_KEY)!
    const rec = JSON.parse(raw)
    expect(rec).toMatchObject({ format: 'duet-vault', version: 1, envelope: { v: 1, kdf: 'PBKDF2-SHA256', cipher: 'AES-GCM-256' } })
    expect(raw).not.toContain('Maya')
    expect(raw).not.toContain('pickle')
  }, 30_000)

  it('throws "Wrong passphrase" for the wrong passphrase', async () => {
    await saveStory(story, 'right')
    await expect(loadStory('wrong')).rejects.toThrow('Wrong passphrase')
  }, 30_000)

  it('forgets', async () => {
    await saveStory(story, 'pw')
    forgetSaved()
    expect(hasSavedStory()).toBe(false)
    await expect(loadStory('pw')).rejects.toThrow(/No saved story/)
  }, 30_000)

  it('treats corrupt storage as nothing saved', () => {
    mem.setItem(VAULT_KEY, '{not json')
    expect(hasSavedStory()).toBe(false)
    mem.setItem(VAULT_KEY, JSON.stringify({ format: 'duet-vault', version: 1, envelope: { v: 1 } }))
    expect(hasSavedStory()).toBe(false)
  })

  it('survives a storage that throws', async () => {
    const throwing = {
      getItem() {
        throw new Error('SecurityError')
      },
      setItem() {
        throw new Error('QuotaExceeded')
      },
      removeItem() {
        throw new Error('SecurityError')
      },
    }
    Object.defineProperty(globalThis, 'localStorage', { value: throwing, configurable: true, writable: true })
    try {
      expect(hasSavedStory()).toBe(false)
      expect(() => forgetSaved()).not.toThrow()
      await expect(saveStory(story, 'pw')).rejects.toThrow(/Could not save/)
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { value: mem, configurable: true, writable: true })
    }
  }, 30_000)
})
