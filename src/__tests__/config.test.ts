import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { loadConfig, validateApiKey, getEnvironment } from '../config.js'

describe('loadConfig', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.YABETOO_API_KEY
    delete process.env.YABETOO_SECRET_KEY
    delete process.env.YABETOO_WEBHOOK_SERVICE_URL
    delete process.env.YABETOO_ACCOUNT_SERVICE_URL
    delete process.env.YABETOO_ACCOUNT_ID
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns defaults when no env vars are set', () => {
    const config = loadConfig()
    expect(config.apiKey).toBeUndefined()
    expect(config.webhookServiceUrl).toBe('https://webhook.yabetoo.com')
    expect(config.accountServiceUrl).toBe('https://account.api.yabetoopay.com')
    expect(config.accountId).toBeUndefined()
  })

  it('reads YABETOO_API_KEY', () => {
    process.env.YABETOO_API_KEY = 'sk_test_123'
    expect(loadConfig().apiKey).toBe('sk_test_123')
  })

  it('falls back to YABETOO_SECRET_KEY', () => {
    process.env.YABETOO_SECRET_KEY = 'sk_live_abc'
    expect(loadConfig().apiKey).toBe('sk_live_abc')
  })

  it('YABETOO_API_KEY takes precedence over YABETOO_SECRET_KEY', () => {
    process.env.YABETOO_API_KEY = 'sk_test_first'
    process.env.YABETOO_SECRET_KEY = 'sk_live_second'
    expect(loadConfig().apiKey).toBe('sk_test_first')
  })

  it('reads custom URLs from env', () => {
    process.env.YABETOO_WEBHOOK_SERVICE_URL = 'http://localhost:4000'
    process.env.YABETOO_ACCOUNT_SERVICE_URL = 'http://localhost:5000'
    process.env.YABETOO_ACCOUNT_ID = 'acct_123'

    const config = loadConfig()
    expect(config.webhookServiceUrl).toBe('http://localhost:4000')
    expect(config.accountServiceUrl).toBe('http://localhost:5000')
    expect(config.accountId).toBe('acct_123')
  })
})

describe('validateApiKey', () => {
  it('accepts sk_test_ prefix', () => {
    expect(validateApiKey('sk_test_abc123')).toBe(true)
  })

  it('accepts sk_live_ prefix', () => {
    expect(validateApiKey('sk_live_abc123')).toBe(true)
  })

  it('rejects invalid prefixes', () => {
    expect(validateApiKey('pk_test_abc')).toBe(false)
    expect(validateApiKey('random_key')).toBe(false)
    expect(validateApiKey('')).toBe(false)
  })
})

describe('getEnvironment', () => {
  it('returns test for sk_test_ keys', () => {
    expect(getEnvironment('sk_test_abc')).toBe('test')
  })

  it('returns live for sk_live_ keys', () => {
    expect(getEnvironment('sk_live_abc')).toBe('live')
  })
})
