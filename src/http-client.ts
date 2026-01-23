import type { RegisterDevListenerResponse, ForwardResult } from './types.js'

/**
 * HTTP client for communicating with Yabetoo Webhook Service
 */
export class HttpClient {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly accountId?: string

  constructor(baseUrl: string, apiKey: string, accountId?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.apiKey = apiKey
    this.accountId = accountId
  }

  /**
   * Register a dev listener session
   */
  async registerDevListener(
    forwardTo: string,
    events: string[]
  ): Promise<RegisterDevListenerResponse> {
    const response = await fetch(`${this.baseUrl}/v1/dev/listeners`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `ApiKey ${this.apiKey}`,
        ...(this.accountId ? { 'X-Account-Id': this.accountId } : {}),
      },
      body: JSON.stringify({ forwardTo, events }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to register dev listener: ${response.status} ${error}`)
    }

    return response.json() as Promise<RegisterDevListenerResponse>
  }

  /**
   * Send heartbeat to keep session alive
   */
  async heartbeat(sessionId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/v1/dev/listeners/${sessionId}/heartbeat`, {
      method: 'POST',
      headers: {
        Authorization: `ApiKey ${this.apiKey}`,
      },
    })

    if (!response.ok && response.status !== 204) {
      throw new Error(`Heartbeat failed: ${response.status}`)
    }
  }

  /**
   * Unregister dev listener session
   */
  async unregister(sessionId: string): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/v1/dev/listeners/${sessionId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `ApiKey ${this.apiKey}`,
        },
      })
    } catch {
      // Ignore errors on unregister (we're shutting down anyway)
    }
  }

  /**
   * Get auth headers for SSE connection
   */
  getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `ApiKey ${this.apiKey}`,
      Accept: 'text/event-stream',
    }
  }
}

/**
 * Forward a webhook to a local endpoint
 */
export async function forwardWebhook(
  url: string,
  eventId: string,
  eventType: string,
  payload: Record<string, unknown>,
  signature: { t: number; v1: string },
  maxRetries: number = 3
): Promise<ForwardResult> {
  const body = JSON.stringify(payload)
  const retryDelays = [250, 1000, 3000] // ms

  let lastError: string | undefined
  let lastStatusCode: number | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const startTime = Date.now()

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Yabetoo-Event-Id': eventId,
          'Yabetoo-Event-Type': eventType,
          'Yabetoo-Signature': `t=${signature.t},v1=${signature.v1}`,
        },
        body,
        signal: AbortSignal.timeout(30000), // 30s timeout
      })

      const durationMs = Date.now() - startTime
      const responseBody = await response.text().catch(() => '')

      if (response.ok) {
        return {
          success: true,
          statusCode: response.status,
          durationMs,
          responseBody: responseBody.slice(0, 500),
        }
      }

      lastStatusCode = response.status
      lastError = responseBody.slice(0, 200)

      // Retry on server errors
      if (response.status >= 500 && attempt < maxRetries) {
        await sleep(retryDelays[attempt] || 3000)
        continue
      }

      // Don't retry on client errors (4xx)
      return {
        success: false,
        statusCode: response.status,
        durationMs,
        responseBody: responseBody.slice(0, 500),
        error: lastError,
      }
    } catch (error) {
      const durationMs = Date.now() - startTime
      lastError = error instanceof Error ? error.message : 'Unknown error'

      // Retry on network errors
      if (attempt < maxRetries) {
        await sleep(retryDelays[attempt] || 3000)
        continue
      }

      return {
        success: false,
        statusCode: undefined,
        durationMs,
        error: lastError,
      }
    }
  }

  // Should not reach here, but just in case
  return {
    success: false,
    statusCode: lastStatusCode,
    durationMs: 0,
    error: lastError || 'Max retries exceeded',
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
