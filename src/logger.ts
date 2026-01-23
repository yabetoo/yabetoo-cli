import chalk from 'chalk'

/**
 * Logger utility with colored output
 */
export const logger = {
  info(message: string): void {
    console.log(chalk.blue('info'), message)
  },

  success(message: string): void {
    console.log(chalk.green('✔'), message)
  },

  error(message: string): void {
    console.log(chalk.red('✖'), message)
  },

  warn(message: string): void {
    console.log(chalk.yellow('⚠'), message)
  },

  dim(message: string): void {
    console.log(chalk.dim(message))
  },

  /**
   * Log webhook delivery result
   */
  webhookDelivered(
    eventId: string,
    eventType: string,
    statusCode: number,
    durationMs: number
  ): void {
    const status = statusCode >= 200 && statusCode < 300 ? chalk.green(statusCode) : chalk.red(statusCode)
    console.log(
      chalk.green('✔'),
      chalk.dim('delivered'),
      chalk.cyan(eventId),
      chalk.white(eventType),
      chalk.dim('->'),
      status,
      chalk.dim(`(${durationMs}ms)`)
    )
  },

  /**
   * Log webhook delivery failure
   */
  webhookFailed(
    eventId: string,
    eventType: string,
    statusCode: number | null,
    durationMs: number,
    error?: string
  ): void {
    const status = statusCode !== null ? chalk.red(statusCode) : chalk.red('ERR')
    console.log(
      chalk.red('✖'),
      chalk.dim('failed'),
      chalk.cyan(eventId),
      chalk.white(eventType),
      chalk.dim('->'),
      status,
      chalk.dim(`(${durationMs}ms)`),
      error ? chalk.red(`[${error.slice(0, 50)}]`) : ''
    )
  },

  /**
   * Log reconnection attempt
   */
  reconnecting(attempt: number, maxAttempts: number): void {
    console.log(
      chalk.yellow('⟳'),
      chalk.dim(`Reconnecting... (${attempt}/${maxAttempts})`)
    )
  },

  /**
   * Log banner for startup
   */
  banner(): void {
    console.log('')
    console.log(chalk.bold.cyan('  Yabetoo Webhook Listener'))
    console.log(chalk.dim('  ────────────────────────'))
    console.log('')
  },

  /**
   * Log session ready message (like Stripe)
   */
  ready(devWebhookSecret: string, forwardTo: string, events: string[]): void {
    console.log(chalk.green.bold('Ready!'), 'Listening for webhook events...')
    console.log('')
    console.log(chalk.dim('  Forward URL:'), chalk.white(forwardTo))

    if (events.length > 0) {
      console.log(chalk.dim('  Events:'), chalk.white(events.join(', ')))
    } else {
      console.log(chalk.dim('  Events:'), chalk.white('all'))
    }

    console.log('')
    console.log(chalk.dim('  Your local webhook signing secret is:'))
    console.log(chalk.yellow.bold(`  ${devWebhookSecret}`))
    console.log('')
    console.log(chalk.dim('  Use this secret to verify webhook signatures locally.'))
    console.log(chalk.dim('  Press Ctrl+C to stop listening.'))
    console.log('')
  },
}
