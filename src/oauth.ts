import { loadCredentials, saveCredentials, deleteCredentials, type CliCredentials } from './credentials.js'
import type { Config } from './types.js'

/**
 * OAuth 2.0 Device Authorization Grant client (RFC 8628) against the Yabetoo SSO.
 */

/**
 * Grant type for the device code exchange (RFC 8628 §3.4)
 */
export const DEVICE_CODE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'

/**
 * Response from POST {sso}/oauth/device/code
 */
export interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete?: string
  expires_in: number
  interval: number
}

/**
 * Response from POST {sso}/oauth/token
 */
export interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type?: string
}

/**
 * OAuth error body (RFC 6749 §5.2)
 */
interface OAuthErrorBody {
  error?: string
  error_description?: string
  message?: string
}

/**
 * Error thrown when the SSO returns an OAuth error response
 */
export class OAuthError extends Error {
  readonly code: string

  constructor(code: string, message?: string) {
    super(message || code)
    this.name = 'OAuthError'
    this.code = code
  }
}

/**
 * Callbacks invoked while polling the token endpoint
 */
export interface PollCallbacks {
  /** Called on each `authorization_pending` response */
  onPending?: () => void
  /** Called when the server asks to slow down (new interval in seconds) */
  onSlowDown?: (intervalSeconds: number) => void
}

/**
 * Start the device authorization flow (RFC 8628 §3.1-3.2)
 */
export async function requestDeviceCode(
  ssoUrl: string,
  clientId: string,
  scope: string = 'read write'
): Promise<DeviceCodeResponse> {
  const response = await fetch(`${normalizeUrl(ssoUrl)}/oauth/device/code`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      client_id: clientId,
      scope,
    }),
  })

  if (!response.ok) {
    throw await toOAuthError(response)
  }

  return (await response.json()) as DeviceCodeResponse
}

/**
 * Poll the token endpoint until the user approves, denies, or the device code
 * expires (RFC 8628 §3.4-3.5).
 *
 * Handles the standard OAuth polling errors:
 * - `authorization_pending` → keep polling
 * - `slow_down`             → add 5 seconds to the polling interval
 * - `access_denied`         → throw (user refused)
 * - `expired_token`         → throw (device code expired)
 */
export async function pollForDeviceToken(
  ssoUrl: string,
  clientId: string,
  deviceCode: string,
  intervalSeconds: number,
  expiresInSeconds: number,
  callbacks: PollCallbacks = {}
): Promise<TokenResponse> {
  let interval = Number.isFinite(intervalSeconds) && intervalSeconds >= 0 ? intervalSeconds : 5
  const deadline = Date.now() + expiresInSeconds * 1000

  while (Date.now() < deadline) {
    await sleep(interval * 1000)

    let response: Response
    try {
      response = await fetch(`${normalizeUrl(ssoUrl)}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({
          grant_type: DEVICE_CODE_GRANT_TYPE,
          client_id: clientId,
          device_code: deviceCode,
        }),
      })
    } catch {
      // Network error: keep polling until the device code expires
      continue
    }

    if (response.ok) {
      return (await response.json()) as TokenResponse
    }

    const body = (await response.json().catch(() => ({}))) as OAuthErrorBody

    switch (body.error) {
      case 'authorization_pending':
        callbacks.onPending?.()
        continue
      case 'slow_down':
        // RFC 8628 §3.5: increase the polling interval by 5 seconds
        interval += 5
        callbacks.onSlowDown?.(interval)
        continue
      default:
        throw new OAuthError(body.error || `http_${response.status}`, body.error_description || body.message)
    }
  }

  throw new OAuthError('expired_token', 'Device authorization timed out.')
}

/**
 * Exchange a refresh token for a new token pair (the SSO rotates the refresh
 * token on every refresh — always persist the returned one).
 */
export async function refreshAccessToken(
  ssoUrl: string,
  clientId: string,
  refreshToken: string
): Promise<TokenResponse> {
  const response = await fetch(`${normalizeUrl(ssoUrl)}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: refreshToken,
    }),
  })

  if (!response.ok) {
    throw await toOAuthError(response)
  }

  return (await response.json()) as TokenResponse
}

/**
 * Build credentials from a token response
 */
export function credentialsFromTokenResponse(token: TokenResponse, ssoUrl: string): CliCredentials {
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    ssoUrl,
  }
}

/**
 * Load stored credentials, refreshing the access token if it is expired (or
 * about to expire). Returns null when not logged in or when the session can no
 * longer be refreshed (credentials are then deleted).
 */
export async function ensureFreshCredentials(config: Config): Promise<CliCredentials | null> {
  const credentials = loadCredentials()

  if (!credentials) {
    return null
  }

  // 30s leeway so a token does not expire mid-request
  const leewayMs = 30_000
  if (new Date(credentials.expiresAt).getTime() - leewayMs > Date.now()) {
    return credentials
  }

  const ssoUrl = credentials.ssoUrl || config.ssoUrl

  try {
    const token = await refreshAccessToken(ssoUrl, config.oauthClientId, credentials.refreshToken)
    const updated: CliCredentials = {
      ...credentials,
      ...credentialsFromTokenResponse(token, ssoUrl),
    }
    saveCredentials(updated)
    return updated
  } catch (error) {
    if (error instanceof OAuthError) {
      // Refresh token revoked, expired, or reused — the session is over
      deleteCredentials()
      return null
    }
    throw error
  }
}

async function toOAuthError(response: Response): Promise<OAuthError> {
  const body = (await response.json().catch(() => ({}))) as OAuthErrorBody
  return new OAuthError(body.error || `http_${response.status}`, body.error_description || body.message)
}

function normalizeUrl(url: string): string {
  return url.replace(/\/$/, '')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
