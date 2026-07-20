import { logger } from '../logger.js'
import { loadConfig } from '../config.js'
import { saveCredentials } from '../credentials.js'
import { ensureFreshCredentials } from '../oauth.js'

/**
 * `AccountResource` returned by the SSO (`GET /api/v1/accounts`, Stripe-shape).
 */
export interface SsoAccount {
  id: string
  object: 'account'
  organization_id: string
  environment: 'test' | 'live'
  type: string
  name: string
  status: string
}

/**
 * Stripe-shape cursor list envelope (SSO `CursorCollection`)
 */
export interface SsoListResponse<T> {
  object: 'list'
  data: T[]
  has_more: boolean
  next_cursor: string | null
}

/**
 * Defensive cap on cursor pagination so a misbehaving cursor can't spin forever
 */
const MAX_PAGES = 50

/**
 * Fetch every account the user can read from the SSO, following the
 * Stripe-shape cursor pagination (`starting_after` / `next_cursor`).
 */
export async function fetchAllAccounts(ssoUrl: string, accessToken: string): Promise<SsoAccount[]> {
  const baseUrl = ssoUrl.replace(/\/$/, '')
  const accounts: SsoAccount[] = []
  let cursor: string | null = null

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${baseUrl}/api/v1/accounts`)
    if (cursor) {
      url.searchParams.set('starting_after', cursor)
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { message?: string; error?: { message?: string } }
      const message = body.error?.message || body.message
      throw new Error(message || `Failed to get accounts: ${response.status}`)
    }

    const list = (await response.json()) as SsoListResponse<SsoAccount>
    accounts.push(...(list.data ?? []))

    if (!list.has_more || !list.next_cursor) {
      return accounts
    }
    cursor = list.next_cursor
  }

  return accounts
}

/**
 * List all accounts accessible to the CLI user
 */
export async function listAccounts(): Promise<void> {
  const config = loadConfig()
  const credentials = await ensureFreshCredentials(config)

  if (!credentials) {
    logger.error('Not logged in. Please run "yabetoo login" first.')
    process.exit(1)
  }

  const ssoUrl = credentials.ssoUrl || config.ssoUrl

  try {
    const accounts = await fetchAllAccounts(ssoUrl, credentials.accessToken)

    if (accounts.length === 0) {
      logger.info('No accounts found.')
      return
    }

    logger.banner()
    logger.info('Your accounts:')
    logger.dim('')

    for (const account of accounts) {
      const isCurrent = account.id === credentials.accountId
      const currentMarker = isCurrent ? ' (current)' : ''
      const modeMarker = `[${account.environment}]`

      if (isCurrent) {
        console.log(`  * ${account.name} ${modeMarker}${currentMarker}`)
        console.log(`    ${account.id}`)
      } else {
        console.log(`    ${account.name} ${modeMarker}`)
        console.log(`    ${account.id}`)
      }
      logger.dim('')
    }

    logger.dim('Use "yabetoo switch <account-id>" to switch accounts.')
  } catch (error) {
    logger.error(`Failed to get accounts: ${error instanceof Error ? error.message : error}`)
    process.exit(1)
  }
}

/**
 * Switch to a different account (selection is stored locally — the SSO has no
 * server-side "current account" notion)
 */
export async function switchAccount(accountId: string): Promise<void> {
  const config = loadConfig()

  if (!accountId) {
    logger.error('Account ID is required.')
    logger.dim('Usage: yabetoo switch <account-id>')
    logger.dim('Run "yabetoo accounts" to see available accounts.')
    process.exit(1)
  }

  const credentials = await ensureFreshCredentials(config)

  if (!credentials) {
    logger.error('Not logged in. Please run "yabetoo login" first.')
    process.exit(1)
  }

  const ssoUrl = credentials.ssoUrl || config.ssoUrl

  try {
    const accounts = await fetchAllAccounts(ssoUrl, credentials.accessToken)
    const account = accounts.find((candidate) => candidate.id === accountId)

    if (!account) {
      logger.error(`Account "${accountId}" not found among your accounts.`)
      logger.dim('Run "yabetoo accounts" to see available accounts.')
      process.exit(1)
    }

    saveCredentials({
      ...credentials,
      accountId: account.id,
    })

    logger.success(`Switched to account: ${account.name}`)
    logger.dim(`Account ID: ${account.id}`)
    logger.dim(`Environment: ${account.environment}`)
  } catch (error) {
    logger.error(`Failed to switch account: ${error instanceof Error ? error.message : error}`)
    process.exit(1)
  }
}
