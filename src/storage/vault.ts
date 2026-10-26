/**
 * Opt-in "remember on this device": the Story, encrypted with a passphrase
 * (PBKDF2-SHA256 → AES-GCM-256), kept in localStorage. Only the Story (an
 * aggregate, never message text) is stored, and only ciphertext touches disk.
 */
import type { Story } from '../analysis/story'
import { decryptJson, encryptJson, parseEnvelope, safeJsonParse, type Envelope } from './crypto'
import { validateStory } from './sharefile'

export const VAULT_KEY = 'duet.vault.v1'

interface VaultRecord {
  format: 'duet-vault'
  version: 1
  savedAt: number
  envelope: Envelope
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null // e.g. disabled cookies / sandboxed iframe
  }
}

function readRecord(): VaultRecord | null {
  try {
    const raw = storage()?.getItem(VAULT_KEY)
    if (!raw) return null
    const x = safeJsonParse(raw) as Partial<VaultRecord> | null
    if (!x || typeof x !== 'object' || x.format !== 'duet-vault' || x.version !== 1) return null
    return { format: 'duet-vault', version: 1, savedAt: typeof x.savedAt === 'number' ? x.savedAt : 0, envelope: parseEnvelope(x.envelope) }
  } catch {
    return null
  }
}

export function hasSavedStory(): boolean {
  return readRecord() !== null
}

/** When the saved story was written (epoch ms), or null. */
export function savedAt(): number | null {
  return readRecord()?.savedAt ?? null
}

export async function saveStory(story: Story, passphrase: string): Promise<void> {
  const envelope = await encryptJson(validateStory(story), passphrase)
  const record: VaultRecord = { format: 'duet-vault', version: 1, savedAt: Date.now(), envelope }
  const s = storage()
  if (!s) throw new Error('This browser does not allow saving on this device.')
  try {
    s.setItem(VAULT_KEY, JSON.stringify(record))
  } catch {
    throw new Error('Could not save on this device (storage is full or blocked).')
  }
}

/** Decrypts the saved story. Throws Error('Wrong passphrase') on auth failure. */
export async function loadStory(passphrase: string): Promise<Story> {
  const record = readRecord()
  if (!record) throw new Error('No saved story on this device.')
  const value = await decryptJson(record.envelope, passphrase)
  return validateStory(value)
}

export function forgetSaved(): void {
  try {
    storage()?.removeItem(VAULT_KEY)
  } catch {
    /* nothing to forget */
  }
}
