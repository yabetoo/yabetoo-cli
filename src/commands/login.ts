import { logger } from '../logger.js'
import { loadConfig } from '../config.js'
import { saveCredentials, loadCredentials, deleteCredentials } from '../credentials.js'
import {
  requestDeviceCode,
  pollForDeviceToken,
  credentialsFromTokenResponse,
  OAuthError,
  type DeviceCodeResponse,
} from '../oauth.js'

/**
 * Options for the login command
 */
export interface LoginOptions {
  ssoUrl?: string
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
 * Execute the login command (OAuth 2.0 device authorization grant, RFC 8628)
 */
export async function login(options: LoginOptions): Promise<void> {
  const config = loadConfig()
  const ssoUrl = options.ssoUrl || config.ssoUrl

  // Check if already logged in
  const existingCredentials = loadCredentials()
  if (existingCredentials) {
    logger.info('You are already logged in.')
    logger.dim('')
    logger.dim('Run "yabetoo logout" to log out.')
    return
  }

  logger.banner()
  logger.info('Logging in to Yabetoo...')
  logger.dim('')

  // Step 1: Request a device code from the SSO
  let device: DeviceCodeResponse
  try {
    device = await requestDeviceCode(ssoUrl, config.oauthClientId)
  } catch (error) {
    logger.error(`Failed to connect to Yabetoo: ${error instanceof Error ? error.message : error}`)
    process.exit(1)
  }

  // Step 2: Display user code and open browser
  logger.dim('  Your authentication code is:')
  logger.dim('')
  console.log(`    ${device.user_code}`)
  logger.dim('')
  logger.info('Opening browser to complete authentication...')
  logger.dim(`  ${device.verification_uri}`)
  logger.dim('')

  await openBrowser(device.verification_uri_complete || device.verification_uri)

  logger.dim('Waiting for authorization...')

  // Step 3: Poll the token endpoint until approval
  try {
    const token = await pollForDeviceToken(
      ssoUrl,
      config.oauthClientId,
      device.device_code,
      device.interval,
      device.expires_in,
      {
        onPending: () => process.stdout.write('.'),
      }
    )

    saveCredentials(credentialsFromTokenResponse(token, ssoUrl))

    logger.dim('')
    logger.success('Successfully logged in!')
    logger.dim('')
    logger.dim('  Credentials saved to ~/.yabetoo/credentials.json')
    logger.dim('')
    logger.info('You can now use:')
    logger.dim('  yabetoo listen --forward-to http://localhost:3333/webhooks')
    logger.dim('')
  } catch (error) {
    logger.dim('')

    if (error instanceof OAuthError && error.code === 'access_denied') {
      logger.error('Authorization was denied.')
    } else if (error instanceof OAuthError && error.code === 'expired_token') {
      logger.error('Authorization expired. Run "yabetoo login" to try again.')
    } else {
      logger.error(`Authorization failed: ${error instanceof Error ? error.message : error}`)
    }

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

  // Delete local credentials. The refresh token becomes unusable on the next
  // rotation; the short-lived access token simply expires.
  deleteCredentials()

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
  const minutesRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60)))

  logger.info('Logged in to Yabetoo')
  logger.dim('')
  if (credentials.ssoUrl) {
    logger.dim(`  SSO: ${credentials.ssoUrl}`)
  }
  logger.dim(`  Access token expires in: ${minutesRemaining} min (auto-refreshed)`)
  logger.dim('')
}
