import { EventSource } from 'eventsource'
import type { DevListenerWebhookMessage } from './types.js'

/**
 * Options for SSE client
 */
export interface SSEClientOptions {
  url: string
  headers: Record<string, string>
  onWebhook: (message: DevListenerWebhookMessage) => void
  onConnected: () => void
  onDisconnected: (error?: Error) => void
  onReconnecting: (attempt: number) => void
  lastEventId?: string
}

/**
 * SSE Client for receiving webhook events
 * Handles reconnection with Last-Event-ID for resume support
 */
export class SSEClient {
  private eventSource: EventSource | null = null
  private options: SSEClientOptions
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectBaseDelay = 1000
  private isClosing = false
  private lastEventId: string | undefined

  constructor(options: SSEClientOptions) {
    this.options = options
    this.lastEventId = options.lastEventId
  }

  /**
   * Connect to the SSE stream
   */
  connect(): void {
    this.isClosing = false
    this.createEventSource()
  }

  /**
   * Close the SSE connection
   */
  close(): void {
    this.isClosing = true

    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }
  }

  /**
   * Get the last event ID for resume support
   */
  getLastEventId(): string | undefined {
    return this.lastEventId
  }

  private createEventSource(): void {
    const headers: Record<string, string> = {
      ...this.options.headers,
    }

    // Add Last-Event-ID header for resume support
    if (this.lastEventId) {
      headers['Last-Event-ID'] = this.lastEventId
    }

    // Create a custom fetch that includes our headers
    const customFetch: typeof fetch = (url, init) => {
      return fetch(url, {
        ...init,
        headers: {
          ...init?.headers,
          ...headers,
        },
      })
    }

    // Create EventSource with custom fetch for headers support
    this.eventSource = new EventSource(this.options.url, {
      fetch: customFetch,
    })

    this.eventSource.onopen = () => {
      this.reconnectAttempts = 0
      this.options.onConnected()
    }

    this.eventSource.onerror = (error) => {
      if (this.isClosing) {
        return
      }

      const err = error instanceof Error ? error : new Error('SSE connection error')
      this.options.onDisconnected(err)

      // Attempt to reconnect
      this.reconnect()
    }

    // Listen for webhook events
    this.eventSource.addEventListener('webhook', (event) => {
      try {
        const messageEvent = event as MessageEvent
        const message = JSON.parse(messageEvent.data) as DevListenerWebhookMessage

        // Update last event ID for resume support
        if (messageEvent.lastEventId) {
          this.lastEventId = messageEvent.lastEventId
        } else if (message.id) {
          this.lastEventId = message.id
        }

        this.options.onWebhook(message)
      } catch (error) {
        console.error('Failed to parse webhook message:', error)
      }
    })
  }

  private reconnect(): void {
    if (this.isClosing) {
      return
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.options.onDisconnected(new Error('Max reconnection attempts reached'))
      return
    }

    this.reconnectAttempts++
    this.options.onReconnecting(this.reconnectAttempts)

    // Exponential backoff with jitter
    const delay = Math.min(
      this.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts - 1) +
        Math.random() * 1000,
      30000 // Max 30s
    )

    setTimeout(() => {
      if (!this.isClosing) {
        this.createEventSource()
      }
    }, delay)
  }
}
