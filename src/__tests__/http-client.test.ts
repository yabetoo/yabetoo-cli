import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { HttpClient, forwardWebhook } from '../http-client.js'

describe('HttpClient', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('registers a dev listener', async () => {
    const responseData = {
      sessionId: 'sess_1',
      devWebhookSecret: 'whsec_dev_abc',
      streamUrl: 'https://webhook.yabetoo.com/stream/sess_1',
      expiresAt: '2026-02-01T00:00:00Z',
    }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(responseData),
    })

    const client = new HttpClient('https://webhook.yabetoo.com', 'sk_test_key', 'acct_1')
    const result = await client.registerDevListener('http://localhost:3000', ['payment.succeeded'])

    expect(result).toEqual(responseData)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://webhook.yabetoo.com/v1/dev/listeners',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'ApiKey sk_test_key',
          'X-Account-Id': 'acct_1',
        }),
      })
    )
  })

  it('throws on registration failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    })

    const client = new HttpClient('https://webhook.yabetoo.com', 'bad_key')
    await expect(client.registerDevListener('http://localhost:3000', []))
      .rejects.toThrow('Failed to register dev listener: 401 Unauthorized')
  })

  it('sends heartbeat', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204 })

    const client = new HttpClient('https://webhook.yabetoo.com', 'sk_test_key')
    await client.heartbeat('sess_1')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://webhook.yabetoo.com/v1/dev/listeners/sess_1/heartbeat',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('throws on heartbeat failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })

    const client = new HttpClient('https://webhook.yabetoo.com', 'sk_test_key')
    await expect(client.heartbeat('sess_1')).rejects.toThrow('Heartbeat failed: 500')
  })

  it('unregisters without throwing on error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'))

    const client = new HttpClient('https://webhook.yabetoo.com', 'sk_test_key')
    await expect(client.unregister('sess_1')).resolves.toBeUndefined()
  })

  it('strips trailing slash from base URL', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204 })

    const client = new HttpClient('https://webhook.yabetoo.com/', 'sk_test_key')
    await client.heartbeat('sess_1')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://webhook.yabetoo.com/v1/dev/listeners/sess_1/heartbeat',
      expect.anything()
    )
  })

  it('returns auth headers', () => {
    const client = new HttpClient('https://webhook.yabetoo.com', 'sk_test_key')
    expect(client.getAuthHeaders()).toEqual({
      Authorization: 'ApiKey sk_test_key',
      Accept: 'text/event-stream',
    })
  })
})

describe('forwardWebhook', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('forwards webhook successfully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('OK'),
    })

    const result = await forwardWebhook(
      'http://localhost:3000/webhooks',
      'evt_1',
      'payment.succeeded',
      { amount: 1000 },
      { t: 123456, v1: 'sig_abc' },
      0 // no retries for test
    )

    expect(result.success).toBe(true)
    expect(result.statusCode).toBe(200)
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/webhooks',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Yabetoo-Event-Id': 'evt_1',
          'Yabetoo-Event-Type': 'payment.succeeded',
          'Yabetoo-Signature': 't=123456,v1=sig_abc',
        }),
      })
    )
  })

  it('returns failure on 4xx', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: () => Promise.resolve('Not Found'),
    })

    const result = await forwardWebhook(
      'http://localhost:3000/webhooks',
      'evt_1',
      'payment.succeeded',
      {},
      { t: 123456, v1: 'sig' },
      0
    )

    expect(result.success).toBe(false)
    expect(result.statusCode).toBe(404)
  })

  it('returns failure on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const result = await forwardWebhook(
      'http://localhost:3000/webhooks',
      'evt_1',
      'payment.succeeded',
      {},
      { t: 123456, v1: 'sig' },
      0
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('ECONNREFUSED')
  })
})
