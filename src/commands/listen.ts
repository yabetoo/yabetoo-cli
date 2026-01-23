import { HttpClient, forwardWebhook } from '../http-client.js'
import { SSEClient } from '../sse-client.js'
import { logger } from '../logger.js'
import { loadConfig, validateApiKey, getEnvironment } from '../config.js'
import { loadCredentials } from '../credentials.js'
import type { ListenOptions, DevListenerWebhookMessage } from '../types.js'

/**
 * Execute the listen command
 */
export async function listen(options: ListenOptions): Promise<void> {
  // Load config and merge with options
  const config = loadConfig()
  const credentials = loadCredentials()

  // Determine authentication method
  let apiKey = options.apiKey || config.apiKey
  let accountId = config.accountId
  let authMethod: 'api_key' | 'cli_token' = 'api_key'
  let cliToken: string | undefined

  // If no API key provided, try to use stored credentials
  if (!apiKey && credentials) {
    cliToken = credentials.cliToken
    accountId = credentials.accountId
    authMethod = 'cli_token'
  }

  const webhookServiceUrl = options.webhookServiceUrl || config.webhookServiceUrl
  const forwardTo = options.forwardTo
  const events = options.events || []

  // Validate authentication
  if (!apiKey && !cliToken) {
    logger.error('Not authenticated. Please run "yabetoo login" first or provide --api-key.')
    process.exit(1)
  }

  if (apiKey && !validateApiKey(apiKey)) {
    logger.error('Invalid API key format. API key must start with sk_test_ or sk_live_.')
    process.exit(1)
  }

  // Log environment
  logger.banner()
  if (authMethod === 'cli_token') {
    logger.info('Using stored credentials')
    logger.dim(`Account ID: ${accountId}`)
  } else {
    const env = getEnvironment(apiKey!)
    logger.info(`Environment: ${env}`)
  }
  logger.info(`Webhook service: ${webhookServiceUrl}`)
  logger.dim('')

  // Create HTTP client with appropriate auth
  const httpClient = new HttpClient(
    webhookServiceUrl,
    apiKey || cliToken!,
    accountId
  )

  // Register dev listener
  logger.info('Registering dev listener...')

  let session: {
    sessionId: string
    devWebhookSecret: string
    streamUrl: string
    expiresAt: string
  }

  try {
    session = await httpClient.registerDevListener(forwardTo, events)
  } catch (error) {
    logger.error(`Failed to register: ${error instanceof Error ? error.message : error}`)
    process.exit(1)
  }

  // Log ready message (like Stripe)
  logger.ready(session.devWebhookSecret, forwardTo, events)

  // Set up heartbeat interval (if not disabled)
  let heartbeatInterval: NodeJS.Timeout | null = null

  if (!options.noHeartbeat) {
    heartbeatInterval = setInterval(async () => {
      try {
        await httpClient.heartbeat(session.sessionId)
      } catch (error) {
        logger.warn(`Heartbeat failed: ${error instanceof Error ? error.message : error}`)
      }
    }, 25000) // 25s heartbeat (less than 30s server timeout)
  }

  // Track statistics
  let deliveredCount = 0
  let failedCount = 0

  // Create SSE client
  const sseClient = new SSEClient({
    url: session.streamUrl,
    headers: httpClient.getAuthHeaders(),
    onWebhook: async (message: DevListenerWebhookMessage) => {
      // Forward webhook to local endpoint
      const result = await forwardWebhook(
        forwardTo,
        message.id,
        message.type,
        message.payload,
        message.signature
      )

      if (result.success) {
        deliveredCount++
        logger.webhookDelivered(
          message.id,
          message.type,
          result.statusCode!,
          result.durationMs
        )
      } else {
        failedCount++
        logger.webhookFailed(
          message.id,
          message.type,
          result.statusCode ?? null,
          result.durationMs,
          result.error
        )
      }
    },
    onConnected: () => {
      // Already logged in ready()
    },
    onDisconnected: (error) => {
      if (error) {
        logger.warn(`Disconnected: ${error.message}`)
      }
    },
    onReconnecting: (attempt) => {
      logger.reconnecting(attempt, 10)
    },
  })

  // Connect to SSE stream
  sseClient.connect()

  // Handle graceful shutdown
  const cleanup = async () => {
    logger.dim('')
    logger.info('Shutting down...')

    // Clear heartbeat
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval)
    }

    // Close SSE connection
    sseClient.close()

    // Unregister session
    try {
      await httpClient.unregister(session.sessionId)
      logger.info('Session unregistered.')
    } catch {
      // Ignore errors
    }

    // Print statistics
    logger.dim('')
    logger.info(`Statistics: ${deliveredCount} delivered, ${failedCount} failed`)

    process.exit(0)
  }

  // Handle SIGINT (Ctrl+C)
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)

  // Keep process running
  // The SSE client will keep the connection open
}
