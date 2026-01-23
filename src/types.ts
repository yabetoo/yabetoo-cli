/**
 * Types for Yabetoo CLI
 */

/**
 * Response from registering a dev listener
 */
export interface RegisterDevListenerResponse {
  sessionId: string
  devWebhookSecret: string
  streamUrl: string
  expiresAt: string
}

/**
 * SSE message format for webhook events
 */
export interface DevListenerWebhookMessage {
  id: string
  type: string
  createdAt: string
  payload: Record<string, unknown>
  signature: {
    t: number
    v1: string
  }
}

/**
 * Options for the listen command
 */
export interface ListenOptions {
  forwardTo: string
  events?: string[]
  apiKey?: string
  noHeartbeat?: boolean
  webhookServiceUrl?: string
}

/**
 * Configuration loaded from environment or config file
 */
export interface Config {
  apiKey?: string
  webhookServiceUrl: string
  accountServiceUrl: string
  accountId?: string
}

/**
 * Result of forwarding a webhook to local endpoint
 */
export interface ForwardResult {
  success: boolean
  statusCode?: number
  durationMs: number
  responseBody?: string
  error?: string
}
