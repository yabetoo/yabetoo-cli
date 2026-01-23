import { logger } from '../logger.js'
import { loadConfig } from '../config.js'
import { loadCredentials, saveCredentials } from '../credentials.js'

/**
 * Account info from API
 */
interface AccountInfo {
  id: string
  name: string
  isLive: boolean
  isCurrent: boolean
}

/**
 * Response from get accounts endpoint
 */
interface GetAccountsResponse {
  currentAccountId: string
  accounts: AccountInfo[]
}

/**
 * Response from switch account endpoint
 */
interface SwitchAccountResponse {
  message: string
  account: {
    id: string
    name: string
    isLive: boolean
  }
}

/**
 * List all accounts accessible to the CLI user
 */
export async function listAccounts(): Promise<void> {
  const config = loadConfig()
  const credentials = loadCredentials()

  if (!credentials) {
    logger.error('Not logged in. Please run "yabetoo login" first.')
    process.exit(1)
  }

  const accountServiceUrl = credentials.accountServiceUrl || config.accountServiceUrl

  try {
    const response = await fetch(`${accountServiceUrl}/v1/cli/auth/accounts`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${credentials.cliToken}`,
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }))
      throw new Error(error.message || `Failed to get accounts: ${response.status}`)
    }

    const data = (await response.json()) as GetAccountsResponse

    if (data.accounts.length === 0) {
      logger.info('No accounts found.')
      return
    }

    logger.banner()
    logger.info('Your accounts:')
    logger.dim('')

    for (const account of data.accounts) {
      const currentMarker = account.isCurrent ? ' (current)' : ''
      const modeMarker = account.isLive ? '[live]' : '[test]'

      if (account.isCurrent) {
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
 * Switch to a different account
 */
export async function switchAccount(accountId: string): Promise<void> {
  const config = loadConfig()
  const credentials = loadCredentials()

  if (!credentials) {
    logger.error('Not logged in. Please run "yabetoo login" first.')
    process.exit(1)
  }

  if (!accountId) {
    logger.error('Account ID is required.')
    logger.dim('Usage: yabetoo switch <account-id>')
    logger.dim('Run "yabetoo accounts" to see available accounts.')
    process.exit(1)
  }

  const accountServiceUrl = credentials.accountServiceUrl || config.accountServiceUrl

  try {
    const response = await fetch(`${accountServiceUrl}/v1/cli/auth/accounts/switch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${credentials.cliToken}`,
      },
      body: JSON.stringify({ accountId }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }))
      throw new Error(error.message || `Failed to switch account: ${response.status}`)
    }

    const data = (await response.json()) as SwitchAccountResponse

    // Update local credentials with new account ID
    saveCredentials({
      ...credentials,
      accountId: data.account.id,
    })

    logger.success(`Switched to account: ${data.account.name}`)
    logger.dim(`Account ID: ${data.account.id}`)
    logger.dim(`Mode: ${data.account.isLive ? 'live' : 'test'}`)
  } catch (error) {
    logger.error(`Failed to switch account: ${error instanceof Error ? error.message : error}`)
    process.exit(1)
  }
}
