import crypto from 'node:crypto'

/**
 * Verify a Yabetoo webhook signature
 *
 * @param payload - The raw request body as a string
 * @param signatureHeader - The Yabetoo-Signature header value
 * @param secret - Your webhook signing secret (whsec_dev_xxx or whsec_xxx)
 * @param toleranceSeconds - Maximum age of the signature in seconds (default: 300)
 * @returns true if the signature is valid, false otherwise
 *
 * @example
 * ```typescript
 * import { verifySignature } from '@yabetoo/cli/signature'
 *
 * app.post('/webhooks', (req, res) => {
 *   const payload = JSON.stringify(req.body)
 *   const signature = req.headers['yabetoo-signature']
 *
 *   if (!verifySignature(payload, signature, process.env.WEBHOOK_SECRET)) {
 *     return res.status(400).send('Invalid signature')
 *   }
 *
 *   // Process the webhook...
 * })
 * ```
 */
export function verifySignature(
  payload: string,
  signatureHeader: string,
  secret: string,
  toleranceSeconds: number = 300
): boolean {
  const parsed = parseSignatureHeader(signatureHeader)

  if (!parsed) {
    return false
  }

  const { timestamp, signature } = parsed

  // Check timestamp tolerance
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    return false
  }

  // Compute expected signature
  const signedPayload = `${timestamp}.${payload}`
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex')

  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

/**
 * Parse the Yabetoo-Signature header
 */
export function parseSignatureHeader(
  header: string
): { timestamp: number; signature: string } | null {
  const elements = header.split(',')
  const timestampElement = elements.find((e) => e.startsWith('t='))
  const signatureElement = elements.find((e) => e.startsWith('v1='))

  if (!timestampElement || !signatureElement) {
    return null
  }

  const timestamp = parseInt(timestampElement.slice(2), 10)
  const signature = signatureElement.slice(3)

  if (isNaN(timestamp) || !signature) {
    return null
  }

  return { timestamp, signature }
}

/**
 * Generate a webhook signature (for testing purposes)
 */
export function generateSignature(
  payload: string,
  secret: string,
  timestamp?: number
): { timestamp: number; signature: string; header: string } {
  const ts = timestamp ?? Math.floor(Date.now() / 1000)
  const signedPayload = `${ts}.${payload}`
  const signature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex')

  return {
    timestamp: ts,
    signature,
    header: `t=${ts},v1=${signature}`,
  }
}
