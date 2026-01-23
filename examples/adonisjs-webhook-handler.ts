/**
 * Example AdonisJS webhook handler with signature verification
 *
 * Add this controller to your AdonisJS application to receive webhooks.
 */
import type { HttpContext } from '@adonisjs/core/http'
import crypto from 'node:crypto'

export default class WebhooksController {
  /**
   * Your dev webhook secret (from `yabetoo listen` output)
   * In production, use your account's webhook secret
   */
  private readonly webhookSecret = process.env.YABETOO_WEBHOOK_SECRET || 'whsec_dev_xxx'

  /**
   * Handle incoming webhook
   * POST /webhooks
   */
  async handle({ request, response }: HttpContext) {
    // Get raw body for signature verification
    const rawBody = request.raw() || JSON.stringify(request.body())
    const signature = request.header('Yabetoo-Signature')
    const eventId = request.header('Yabetoo-Event-Id')
    const eventType = request.header('Yabetoo-Event-Type')

    if (!signature) {
      return response.badRequest({ error: 'Missing signature header' })
    }

    // Verify signature
    if (!this.verifySignature(rawBody, signature)) {
      return response.badRequest({ error: 'Invalid signature' })
    }

    // Parse the event payload
    const event = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody

    console.log(`Received webhook: ${eventType} (${eventId})`)

    // Handle different event types
    try {
      switch (eventType) {
        case 'payment.succeeded':
          await this.handlePaymentSucceeded(event.data)
          break

        case 'payment.failed':
          await this.handlePaymentFailed(event.data)
          break

        case 'checkout.session.completed':
          await this.handleCheckoutCompleted(event.data)
          break

        case 'disbursement.completed':
          await this.handleDisbursementCompleted(event.data)
          break

        default:
          console.log('Unhandled event type:', eventType)
      }
    } catch (error) {
      console.error('Error handling webhook:', error)
      // Still return 200 to acknowledge receipt
      // Failed processing should be handled asynchronously
    }

    return response.ok({ received: true })
  }

  /**
   * Verify webhook signature
   */
  private verifySignature(payload: string, signatureHeader: string): boolean {
    const elements = signatureHeader.split(',')
    const timestampElement = elements.find((e) => e.startsWith('t='))
    const signatureElement = elements.find((e) => e.startsWith('v1='))

    if (!timestampElement || !signatureElement) {
      return false
    }

    const timestamp = parseInt(timestampElement.slice(2), 10)
    const signature = signatureElement.slice(3)

    // Check timestamp tolerance (5 minutes)
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - timestamp) > 300) {
      console.warn('Webhook signature timestamp expired')
      return false
    }

    // Compute expected signature
    const signedPayload = `${timestamp}.${payload}`
    const expected = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(signedPayload)
      .digest('hex')

    // Constant-time comparison
    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    } catch {
      return false
    }
  }

  /**
   * Handle payment.succeeded event
   */
  private async handlePaymentSucceeded(data: Record<string, unknown>) {
    console.log('Payment succeeded:', data.payment_id)
    // Update order status, send confirmation email, etc.
  }

  /**
   * Handle payment.failed event
   */
  private async handlePaymentFailed(data: Record<string, unknown>) {
    console.log('Payment failed:', data.payment_id)
    // Notify customer, update order status, etc.
  }

  /**
   * Handle checkout.session.completed event
   */
  private async handleCheckoutCompleted(data: Record<string, unknown>) {
    console.log('Checkout completed:', data.session_id)
    // Create order, send confirmation, etc.
  }

  /**
   * Handle disbursement.completed event
   */
  private async handleDisbursementCompleted(data: Record<string, unknown>) {
    console.log('Disbursement completed:', data.disbursement_id)
    // Update payout status, notify recipient, etc.
  }
}
