import { describe, it, expect } from 'vitest'
import {
  verifySignature,
  parseSignatureHeader,
  generateSignature,
} from '../signature.js'

describe('parseSignatureHeader', () => {
  it('parses a valid header', () => {
    const result = parseSignatureHeader('t=1234567890,v1=abcdef')
    expect(result).toEqual({ timestamp: 1234567890, signature: 'abcdef' })
  })

  it('returns null when timestamp is missing', () => {
    expect(parseSignatureHeader('v1=abcdef')).toBeNull()
  })

  it('returns null when signature is missing', () => {
    expect(parseSignatureHeader('t=1234567890')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseSignatureHeader('')).toBeNull()
  })

  it('returns null when timestamp is not a number', () => {
    expect(parseSignatureHeader('t=abc,v1=sig')).toBeNull()
  })
})

describe('generateSignature', () => {
  it('generates a valid signature header', () => {
    const result = generateSignature('{"test":true}', 'secret123', 1000000)
    expect(result.timestamp).toBe(1000000)
    expect(result.signature).toBeTypeOf('string')
    expect(result.header).toBe(`t=1000000,v1=${result.signature}`)
  })

  it('uses current time when no timestamp provided', () => {
    const before = Math.floor(Date.now() / 1000)
    const result = generateSignature('payload', 'secret')
    const after = Math.floor(Date.now() / 1000)
    expect(result.timestamp).toBeGreaterThanOrEqual(before)
    expect(result.timestamp).toBeLessThanOrEqual(after)
  })
})

describe('verifySignature', () => {
  const secret = 'whsec_test_secret'
  const payload = '{"event":"payment.succeeded"}'

  it('verifies a valid signature', () => {
    const { header } = generateSignature(payload, secret)
    expect(verifySignature(payload, header, secret)).toBe(true)
  })

  it('rejects a tampered payload', () => {
    const { header } = generateSignature(payload, secret)
    expect(verifySignature('{"event":"tampered"}', header, secret)).toBe(false)
  })

  it('rejects a wrong secret', () => {
    const { header } = generateSignature(payload, secret)
    expect(verifySignature(payload, header, 'wrong_secret')).toBe(false)
  })

  it('rejects an expired signature', () => {
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600 // 10 min ago
    const { header } = generateSignature(payload, secret, oldTimestamp)
    expect(verifySignature(payload, header, secret, 300)).toBe(false)
  })

  it('accepts a signature within tolerance', () => {
    const recentTimestamp = Math.floor(Date.now() / 1000) - 100
    const { header } = generateSignature(payload, secret, recentTimestamp)
    expect(verifySignature(payload, header, secret, 300)).toBe(true)
  })

  it('rejects an invalid header format', () => {
    expect(verifySignature(payload, 'invalid', secret)).toBe(false)
  })
})
