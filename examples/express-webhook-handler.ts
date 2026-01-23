/**
 * Example Express webhook handler with signature verification
 *
 * This example shows how to receive and verify webhooks from Yabetoo
 * when using the `yabetoo listen` command for local development.
 */
import express from 'express'
import crypto from 'node:crypto'

const app = express()

// Use raw body parser for webhook signature verification
app.use('/webhooks', express.raw({ type: 'application/json' }))

// Your dev webhook secret (from `yabetoo listen` output)
const WEBHOOK_SECRET = process.env.YABETOO_WEBHOOK_SECRET || 'whsec_dev_xxx'

/**
 * Verify webhook signature
 */
function verifySignature(
  payload: string,
  signatureHeader: string,
  secret: string
): boolean {
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
    return false
  }

  // Compute expected signature
  const signedPayload = `${timestamp}.${payload}`
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex')

  // Constant-time comparison
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

// Webhook endpoint
app.post('/webhooks', (req, res) => {
  const payload = req.body.toString()
  const signature = req.headers['yabetoo-signature'] as string
  const eventId = req.headers['yabetoo-event-id'] as string
  const eventType = req.headers['yabetoo-event-type'] as string

  // Verify signature
  if (!verifySignature(payload, signature, WEBHOOK_SECRET)) {
    console.log('Invalid webhook signature')
    return res.status(400).json({ error: 'Invalid signature' })
  }

  // Parse payload
  const event = JSON.parse(payload)

  console.log(`Received webhook: ${eventType} (${eventId})`)
  console.log('Payload:', JSON.stringify(event, null, 2))

  // Handle different event types
  switch (eventType) {
    case 'payment.succeeded':
      console.log('Payment succeeded:', event.data.payment_id)
      // Handle successful payment
      break

    case 'payment.failed':
      console.log('Payment failed:', event.data.payment_id)
      // Handle failed payment
      break

    case 'checkout.session.completed':
      console.log('Checkout completed:', event.data.session_id)
      // Handle checkout completion
      break

    default:
      console.log('Unhandled event type:', eventType)
  }

  // Acknowledge receipt
  res.status(200).json({ received: true })
})

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

const PORT = process.env.PORT || 3333
app.listen(PORT, () => {
  console.log(`Webhook server listening on port ${PORT}`)
  console.log('')
  console.log('To test with Yabetoo CLI:')
  console.log(`  yabetoo listen --forward-to http://localhost:${PORT}/webhooks`)
})
