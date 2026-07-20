import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  requestDeviceCode,
  pollForDeviceToken,
  refreshAccessToken,
  credentialsFromTokenResponse,
  OAuthError,
  DEVICE_CODE_GRANT_TYPE,
} from '../oauth.js'

const SSO_URL = 'http://localhost:8000'
const CLIENT_ID = 'oauthc_test'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('oauth', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('requestDeviceCode', () => {
    it('posts client_id and scope as form data and parses the response', async () => {
      const deviceResponse = {
        device_code: 'dc_123',
        user_code: 'BCDFGHJK',
        verification_uri: 'http://localhost:8000/oauth/device',
        verification_uri_complete: 'http://localhost:8000/oauth/device?user_code=BCDFGHJK',
        expires_in: 600,
        interval: 5,
      }
      fetchMock.mockResolvedValueOnce(jsonResponse(deviceResponse))

      const result = await requestDeviceCode(SSO_URL, CLIENT_ID)

      expect(result).toEqual(deviceResponse)
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/oauth/device/code',
        expect.objectContaining({ method: 'POST' })
      )

      const body = fetchMock.mock.calls[0][1].body as URLSearchParams
      expect(body.get('client_id')).toBe(CLIENT_ID)
      expect(body.get('scope')).toBe('read write')
    })

    it('throws an OAuthError on an error response', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'invalid_client' }, 401))

      await expect(requestDeviceCode(SSO_URL, CLIENT_ID)).rejects.toMatchObject({
        name: 'OAuthError',
        code: 'invalid_client',
      })
    })
  })

  describe('pollForDeviceToken', () => {
    const tokenResponse = {
      access_token: 'jwt_access',
      refresh_token: 'refresh_1',
      expires_in: 900,
      token_type: 'Bearer',
    }

    it('keeps polling through authorization_pending then returns the tokens', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ error: 'authorization_pending' }, 400))
        .mockResolvedValueOnce(jsonResponse({ error: 'authorization_pending' }, 400))
        .mockResolvedValueOnce(jsonResponse(tokenResponse))

      const onPending = vi.fn()
      const result = await pollForDeviceToken(SSO_URL, CLIENT_ID, 'dc_123', 0, 600, { onPending })

      expect(result).toEqual(tokenResponse)
      expect(onPending).toHaveBeenCalledTimes(2)

      const body = fetchMock.mock.calls[0][1].body as URLSearchParams
      expect(body.get('grant_type')).toBe(DEVICE_CODE_GRANT_TYPE)
      expect(body.get('client_id')).toBe(CLIENT_ID)
      expect(body.get('device_code')).toBe('dc_123')
    })

    it('adds 5 seconds to the interval on slow_down', async () => {
      vi.useFakeTimers()

      try {
        fetchMock
          .mockResolvedValueOnce(jsonResponse({ error: 'slow_down' }, 400))
          .mockResolvedValueOnce(jsonResponse(tokenResponse))

        const onSlowDown = vi.fn()
        const promise = pollForDeviceToken(SSO_URL, CLIENT_ID, 'dc_123', 0, 600, { onSlowDown })

        // first poll (interval 0) → slow_down bumps the interval to 5s
        await vi.advanceTimersByTimeAsync(0)
        // second poll after the increased 5s interval → tokens
        await vi.advanceTimersByTimeAsync(5000)

        const result = await promise
        expect(result).toEqual(tokenResponse)
        expect(onSlowDown).toHaveBeenCalledWith(5)
      } finally {
        vi.useRealTimers()
      }
    })

    it('throws on access_denied', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'access_denied' }, 401))

      await expect(
        pollForDeviceToken(SSO_URL, CLIENT_ID, 'dc_123', 0, 600)
      ).rejects.toMatchObject({ name: 'OAuthError', code: 'access_denied' })
    })

    it('throws on expired_token', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'expired_token' }, 400))

      await expect(
        pollForDeviceToken(SSO_URL, CLIENT_ID, 'dc_123', 0, 600)
      ).rejects.toMatchObject({ name: 'OAuthError', code: 'expired_token' })
    })

    it('throws expired_token when the device code TTL runs out', async () => {
      await expect(
        pollForDeviceToken(SSO_URL, CLIENT_ID, 'dc_123', 0, 0)
      ).rejects.toMatchObject({ name: 'OAuthError', code: 'expired_token' })

      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('refreshAccessToken', () => {
    it('exchanges the refresh token and returns the rotated pair', async () => {
      const rotated = {
        access_token: 'jwt_access_2',
        refresh_token: 'refresh_2',
        expires_in: 900,
      }
      fetchMock.mockResolvedValueOnce(jsonResponse(rotated))

      const result = await refreshAccessToken(SSO_URL, CLIENT_ID, 'refresh_1')

      expect(result).toEqual(rotated)

      const body = fetchMock.mock.calls[0][1].body as URLSearchParams
      expect(body.get('grant_type')).toBe('refresh_token')
      expect(body.get('client_id')).toBe(CLIENT_ID)
      expect(body.get('refresh_token')).toBe('refresh_1')
    })

    it('throws an OAuthError when the refresh token is rejected', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'invalid_grant' }, 401))

      await expect(refreshAccessToken(SSO_URL, CLIENT_ID, 'refresh_old')).rejects.toMatchObject({
        name: 'OAuthError',
        code: 'invalid_grant',
      })
    })
  })

  describe('credentialsFromTokenResponse', () => {
    it('maps the token response to stored credentials', () => {
      const before = Date.now()
      const credentials = credentialsFromTokenResponse(
        { access_token: 'jwt', refresh_token: 'refresh', expires_in: 900 },
        SSO_URL
      )

      expect(credentials.accessToken).toBe('jwt')
      expect(credentials.refreshToken).toBe('refresh')
      expect(credentials.ssoUrl).toBe(SSO_URL)

      const expiresAt = new Date(credentials.expiresAt).getTime()
      expect(expiresAt).toBeGreaterThanOrEqual(before + 900_000)
      expect(expiresAt).toBeLessThanOrEqual(Date.now() + 900_000)
    })
  })

  describe('OAuthError', () => {
    it('uses the description as message when provided', () => {
      const error = new OAuthError('slow_down', 'Polling too fast')
      expect(error.code).toBe('slow_down')
      expect(error.message).toBe('Polling too fast')
    })

    it('falls back to the code as message', () => {
      expect(new OAuthError('access_denied').message).toBe('access_denied')
    })
  })
})
