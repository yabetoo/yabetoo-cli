import { Command } from 'commander'
import { listen } from '../commands/listen.js'
import { login, logout, status } from '../commands/login.js'
import { listAccounts, switchAccount } from '../commands/accounts.js'

const program = new Command()

program
  .name('yabetoo')
  .description('Yabetoo CLI for local development and webhook testing')
  .version('0.1.0')

// Login command
program
  .command('login')
  .description('Authenticate with Yabetoo via browser')
  .option(
    '--account-service-url <url>',
    'Account service URL (for local development)'
  )
  .action(async (options) => {
    await login({
      accountServiceUrl: options.accountServiceUrl,
    })
  })

// Logout command
program
  .command('logout')
  .description('Log out and remove stored credentials')
  .action(async () => {
    await logout()
  })

// Status command
program
  .command('status')
  .description('Show current login status')
  .action(async () => {
    await status()
  })

// Accounts command
program
  .command('accounts')
  .description('List all accounts you have access to')
  .action(async () => {
    await listAccounts()
  })

// Switch command
program
  .command('switch <account-id>')
  .description('Switch to a different account')
  .action(async (accountId: string) => {
    await switchAccount(accountId)
  })

// Listen command
program
  .command('listen')
  .description('Listen for webhook events and forward them to a local endpoint')
  .requiredOption(
    '--forward-to <url>',
    'Local URL to forward webhook events to (e.g., http://localhost:3333/webhooks)'
  )
  .option(
    '--events <events>',
    'Comma-separated list of events to listen for (e.g., payment.succeeded,payment.failed)',
    (value) => value.split(',').map((e) => e.trim())
  )
  .option(
    '--api-key <key>',
    'Yabetoo API key (overrides stored credentials)'
  )
  .option(
    '--webhook-service-url <url>',
    'Webhook service URL (default: https://webhook.yabetoo.com)'
  )
  .option(
    '--no-heartbeat',
    'Disable heartbeat (session may expire sooner)'
  )
  .action(async (options) => {
    await listen({
      forwardTo: options.forwardTo,
      events: options.events,
      apiKey: options.apiKey,
      webhookServiceUrl: options.webhookServiceUrl,
      noHeartbeat: options.noHeartbeat,
    })
  })

program.parse()
