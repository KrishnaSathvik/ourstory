/**
 * Shared WebCrypto helpers: passphrase → key (PBKDF2-SHA256) → AES-GCM-256.
 *
 * Everything here is local. Nothing is ever sent anywhere; the envelope is
 * just JSON that can live in localStorage or inside a .duet file.
 */

export const KDF_ITERATIONS = 310_000
/** Bounds accepted when *reading* an envelope. A hostile file could otherwise
 * ask for 10^12 iterations and freeze the tab. */
const MIN_ITERATIONS = 100_000
const MAX_ITERATIONS = 5_000_000
const SALT_BYTES = 16
const IV_BYTES = 12
/** ~7 MB of base64; comfortably above the 5 MB file limit. */
const MAX_CIPHERTEXT_B64 = 7_500_000

export interface Envelope {
  v: 1
  kdf: 'PBKDF2-SHA256'
  iter: number
  cipher: 'AES-GCM-256'
  salt: string // base64
  iv: string // base64
  ct: string // base64 ciphertext + tag
}

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle
  if (!s) throw new Error('This browser cannot encrypt (WebCrypto is unavailable). Try a recent browser over https.')
  return s
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(n)
  globalThis.crypto.getRandomValues(out)
  return out
}

// ------------------------------------------------------------ base64 ---
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/

export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  if (typeof b64 !== 'string' || b64.length % 4 !== 0 || !B64_RE.test(b64)) throw new Error('Invalid base64 data.')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// --------------------------------------------------------------- keys ---
async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', new TextEncoder().encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey'])
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

function checkPassphrase(passphrase: unknown): asserts passphrase is string {
  if (typeof passphrase !== 'string' || passphrase.length === 0) throw new Error('Enter a passphrase.')
  if (passphrase.length > 1024) throw new Error('That passphrase is too long.')
}

// ----------------------------------------------------------- envelope ---
export async function encryptJson(value: unknown, passphrase: string): Promise<Envelope> {
  checkPassphrase(passphrase)
  const salt = randomBytes(SALT_BYTES)
  const iv = randomBytes(IV_BYTES)
  const key = await deriveKey(passphrase, salt, KDF_ITERATIONS)
  const plain = new TextEncoder().encode(JSON.stringify(value))
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, plain))
  return { v: 1, kdf: 'PBKDF2-SHA256', iter: KDF_ITERATIONS, cipher: 'AES-GCM-256', salt: bytesToBase64(salt), iv: bytesToBase64(iv), ct: bytesToBase64(ct) }
}

/** Structural check of an untrusted envelope. Returns a clean copy. */
export function parseEnvelope(x: unknown): Envelope {
  const bad = () => new Error('The encrypted data is damaged or was not made by Duet.')
  if (!x || typeof x !== 'object' || Array.isArray(x)) throw bad()
  const e = x as Record<string, unknown>
  if (e.v !== 1 || e.kdf !== 'PBKDF2-SHA256' || e.cipher !== 'AES-GCM-256') throw bad()
  if (typeof e.iter !== 'number' || !Number.isInteger(e.iter) || e.iter < MIN_ITERATIONS || e.iter > MAX_ITERATIONS) throw bad()
  if (typeof e.salt !== 'string' || e.salt.length > 64) throw bad()
  if (typeof e.iv !== 'string' || e.iv.length > 32) throw bad()
  if (typeof e.ct !== 'string' || e.ct.length > MAX_CIPHERTEXT_B64) throw bad()
  let salt: Uint8Array, iv: Uint8Array
  try {
    salt = base64ToBytes(e.salt)
    iv = base64ToBytes(e.iv)
    base64ToBytes(e.ct.slice(0, 64 - (64 % 4)))
  } catch {
    throw bad()
  }
  if (salt.length !== SALT_BYTES || iv.length !== IV_BYTES) throw bad()
  return { v: 1, kdf: 'PBKDF2-SHA256', iter: e.iter, cipher: 'AES-GCM-256', salt: e.salt, iv: e.iv, ct: e.ct }
}

/** Decrypts an envelope. Throws Error('Wrong passphrase') on auth failure. */
export async function decryptJson(envelope: unknown, passphrase: string): Promise<unknown> {
  checkPassphrase(passphrase)
  const env = parseEnvelope(envelope)
  let ct: Uint8Array<ArrayBuffer>
  try {
    ct = base64ToBytes(env.ct)
  } catch {
    throw new Error('The encrypted data is damaged or was not made by Duet.')
  }
  const key = await deriveKey(passphrase, base64ToBytes(env.salt), env.iter)
  let plain: ArrayBuffer
  try {
    plain = await subtle().decrypt({ name: 'AES-GCM', iv: base64ToBytes(env.iv) }, key, ct)
  } catch {
    // GCM authentication failure: wrong passphrase (or tampered data).
    throw new Error('Wrong passphrase')
  }
  return safeJsonParse(new TextDecoder().decode(plain))
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/** JSON.parse that refuses prototype-pollution keys anywhere in the tree. */
export function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text, (k, v) => {
      if (FORBIDDEN_KEYS.has(k)) throw new Error('forbidden-key')
      return v
    })
  } catch {
    throw new Error('This file is not valid Duet data.')
  }
}
