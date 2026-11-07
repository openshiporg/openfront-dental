// SecretBox (SCHEMA G10): adapter credentials, inference keys and TOTP seeds are AES-256-GCM
// encrypted with DENTAL_SECRET_KEY (32 bytes, hex or base64). Ciphertext never leaves the server; the
// list is serverOnly. The purpose string is bound as additional authenticated data, so a ciphertext
// copied to another purpose fails to decrypt.
// adapted from openfront-hospital@d1b1180 features/keystone/integrations/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import type { Tx } from './db'

export const SECRET_KEY_VERSION = 1

function decodeKey(value: string | undefined) {
  const text = String(value || '').trim()
  if (!text) throw new Error('DENTAL_SECRET_KEY is not set: secrets cannot be stored or read.')
  const key = /^[a-f0-9]{64}$/i.test(text) ? Buffer.from(text, 'hex') : Buffer.from(text, 'base64')
  if (key.length !== 32) throw new Error('DENTAL_SECRET_KEY must decode to exactly 32 bytes')
  return key
}

export function sealSecret(plaintext: string, purpose: string, keyText = process.env.DENTAL_SECRET_KEY) {
  const key = decodeKey(keyText)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(purpose, 'utf8'))
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return { purpose, ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64'), keyVersion: SECRET_KEY_VERSION }
}

export function openSecret(box: { purpose: string; ciphertext: string; iv: string; authTag: string }, keyText = process.env.DENTAL_SECRET_KEY) {
  const decipher = createDecipheriv('aes-256-gcm', decodeKey(keyText), Buffer.from(box.iv, 'base64'))
  decipher.setAAD(Buffer.from(box.purpose, 'utf8'))
  decipher.setAuthTag(Buffer.from(box.authTag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(box.ciphertext, 'base64')), decipher.final()]).toString('utf8')
}

export async function storeSecret(tx: Tx, purpose: string, plaintext: string) {
  const sealed = sealSecret(plaintext, purpose)
  return tx.secretBox.create({ data: sealed, select: { id: true } })
}

export async function readSecret(tx: Tx, id: string) {
  const box = await tx.secretBox.findUnique({ where: { id } })
  if (!box) throw new Error('Secret not found')
  return openSecret(box)
}
