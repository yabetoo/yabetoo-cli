import { logger } from '../logger.js'
import { loadConfig } from '../config.js'
import { saveCredentials, loadCredentials, deleteCredentials } from '../credentials.js'

/**
 * Options for the login command
 */
export interface LoginOptions {
  accountServiceUrl?: string
}

/**
 * Response from initiating device auth
 */
interface InitiateResponse {
  deviceCode: string
  userCode: string
  verificationUrl: string
  expiresIn: number
  interval: number
}

/**
 * Response from polling
 */
interface PollResponse {
  error?: string
  message?: string
  cliToken?: string
  accountId?: string
  expiresAt?: string
}

/**
 * Open a URL in the default browser
 */
async function openBrowser(url: string): Promise<void> {
  const { exec } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const execAsync = promisify(exec)

  const platform = process.platform

  try {
    if (platform === 'darwin') {
      await execAsync(`open "${url}"`)
    } else if (platform === 'win32') {
      await execAsync(`start "" "${url}"`)
    } else {
      // Linux
      await execAsync(`xdg-open "${url}"`)
    }
  } catch {
    // Silently fail - user can manually open the URL
  }
}

/**
 * Execute the login command
 */
export async function login(options: LoginOptions): Promise<void> {
  const config = loadConfig()
  const accountServiceUrl = options.accountServiceUrl || config.accountServiceUrl

  // Check if already logged in
  const existingCredentials = loadCredentials()
  if (existingCredentials) {
    logger.info('You are already logged in.')
    logger.dim(`Account ID: ${existingCredentials.accountId}`)
    logger.dim('')
    logger.dim('Run "yabetoo logout" to log out.')
    return
  }

  logger.banner()
  logger.info('Logging in to Yabetoo...')
  logger.dim('')

  // Step 1: Initiate device auth
  let initResponse: InitiateResponse
  try {
    const response = await fetch(`${accountServiceUrl}/v1/cli/auth/device`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deviceName: `Yabetoo CLI - ${process.platform}`,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to initiate login: ${error}`)
    }

    initResponse = await response.json() as InitiateResponse
  } catch (error) {
    logger.error(`Failed to connect to Yabetoo: ${error instanceof Error ? error.message : error}`)
    process.exit(1)
  }

  // Step 2: Display user code and open browser
  logger.dim('  Your authentication code is:')
  logger.dim('')
  console.log(`    ${initResponse.userCode}`)
  logger.dim('')
  logger.info('Opening browser to complete authentication...')
  logger.dim(`  ${initResponse.verificationUrl}`)
  logger.dim('')

  await openBrowser(initResponse.verificationUrl)

  logger.dim('Waiting for authorization...')

  // Step 3: Poll for authorization
  const pollInterval = (initResponse.interval || 5) * 1000
  const maxAttempts = Math.ceil((initResponse.expiresIn || 300) / (initResponse.interval || 5))

  let attempts = 0
  let authorized = false

  while (attempts < maxAttempts && !authorized) {
    await sleep(pollInterval)

    try {
      const response = await fetch(
        `${accountServiceUrl}/v1/cli/auth/device/${initResponse.deviceCode}/poll`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )

      const result = await response.json() as PollResponse

      if (response.ok && result.cliToken) {
        // Authorization successful!
        authorized = true

        // Save credentials
        saveCredentials({
          cliToken: result.cliToken,
          accountId: result.accountId!,
          expiresAt: result.expiresAt!,
          accountServiceUrl,
        })

        logger.dim('')
        logger.success('Successfully logged in!')
        logger.dim('')
        logger.dim(`  Account ID: ${result.accountId}`)
        logger.dim(`  Credentials saved to ~/.yabetoo/credentials.json`)
        logger.dim('')
        logger.info('You can now use:')
        logger.dim('  yabetoo listen --forward-to http://localhost:3333/webhooks')
        logger.dim('')
        return
      }

      if (result.error === 'authorization_pending') {
        // Still waiting, continue polling
        attempts++
        process.stdout.write('.')
        continue
      }

      if (result.error === 'expired_token') {
        logger.dim('')
        logger.error('Authorization expired. Please try again.')
        process.exit(1)
      }

      // Other error
      logger.dim('')
      logger.error(`Authorization failed: ${result.message || result.error}`)
      process.exit(1)
    } catch {
      attempts++
      // Network error, continue trying
      continue
    }
  }

  if (!authorized) {
    logger.dim('')
    logger.error('Authorization timed out. Please try again.')
    process.exit(1)
  }
}

/**
 * Execute the logout command
 */
export async function logout(): Promise<void> {
  const credentials = loadCredentials()

  if (!credentials) {
    logger.info('You are not logged in.')
    return
  }

  // Delete local credentials
  deleteCredentials()

  // Optionally revoke token on server (best effort)
  try {
    const accountServiceUrl = credentials.accountServiceUrl || 'https://account.yabetoo.com'
    await fetch(`${accountServiceUrl}/v1/cli/auth/logout`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${credentials.cliToken}`,
      },
    })
  } catch {
    // Ignore errors - local logout is sufficient
  }

  logger.success('Logged out successfully.')
}

/**
 * Show login status
 */
export async function status(): Promise<void> {
  const credentials = loadCredentials()

  if (!credentials) {
    logger.info('Not logged in.')
    logger.dim('Run "yabetoo login" to authenticate.')
    return
  }

  const expiresAt = new Date(credentials.expiresAt)
  const now = new Date()
  const daysRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  logger.info('Logged in to Yabetoo')
  logger.dim('')
  logger.dim(`  Account ID: ${credentials.accountId}`)
  logger.dim(`  Expires in: ${daysRemaining} days`)
  logger.dim('')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
