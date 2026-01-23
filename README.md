# Yabetoo CLI

A command-line tool for local development and webhook testing with Yabetoo.

## Installation

```bash
# From npm (when published)
npm install -g @yabetoo/cli

# Or from source
git clone <repo>
cd CLI
pnpm install
pnpm build
```

## Usage

### Listen for Webhooks

Forward webhook events to your local development server:

```bash
yabetoo listen --forward-to http://localhost:3333/webhooks
```

**Example output:**
```
  Yabetoo Webhook Listener
  ────────────────────────

info Environment: test
info Webhook service: https://webhook.yabetoo.com

info Registering dev listener...
Ready! Listening for webhook events...

  Forward URL: http://localhost:3333/webhooks
  Events: all

  Your local webhook signing secret is:
  whsec_dev_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6

  Use this secret to verify webhook signatures locally.
  Press Ctrl+C to stop listening.

✔ delivered evt_lz5k8x_abc123 payment.succeeded -> 200 (45ms)
✔ delivered evt_lz5k8y_def456 checkout.session.completed -> 200 (32ms)
✖ failed    evt_lz5k8z_ghi789 payment.failed -> 500 (128ms) [Internal Server Error]
```

### Options

```
--forward-to <url>           Local URL to forward webhooks (required)
--events <events>            Filter events (comma-separated, e.g., payment.succeeded,payment.failed)
--api-key <key>              API key (or set YABETOO_API_KEY env var)
--webhook-service-url <url>  Custom webhook service URL
--no-heartbeat               Disable heartbeat (session expires sooner)
```

### Examples

```bash
# Listen for all events
yabetoo listen --forward-to http://localhost:3333/webhooks

# Listen for specific events
yabetoo listen --forward-to http://localhost:3333/webhooks --events payment.succeeded,payment.failed

# Use specific API key
yabetoo listen --forward-to http://localhost:3333/webhooks --api-key sk_test_xxx

# Use local webhook service (development)
yabetoo listen --forward-to http://localhost:3333/webhooks --webhook-service-url http://localhost:3000
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `YABETOO_API_KEY` | Your Yabetoo API key (sk_test_xxx or sk_live_xxx) |
| `YABETOO_WEBHOOK_SERVICE_URL` | Custom webhook service URL |
| `YABETOO_ACCOUNT_ID` | Account ID (optional, extracted from API key) |

## Verifying Webhook Signatures

In your local webhook handler, verify signatures using the dev webhook secret:

```typescript
import crypto from 'node:crypto'

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const [tPart, v1Part] = signature.split(',')
  const timestamp = parseInt(tPart.slice(2), 10)
  const sig = v1Part.slice(3)

  // Check timestamp (5 min tolerance)
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) return false

  // Verify signature
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex')

  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
}

// Usage in Express
app.post('/webhooks', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['yabetoo-signature']

  if (!verifySignature(req.body.toString(), signature, process.env.WEBHOOK_SECRET)) {
    return res.status(400).send('Invalid signature')
  }

  // Process webhook...
})
```

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run locally
node dist/yabetoo.js listen --forward-to http://localhost:3333/webhooks

# Watch mode
pnpm dev
```

## How It Works

1. **CLI registers** with Yabetoo Webhook Service via API
2. **Service returns** a session ID, SSE stream URL, and dev webhook secret
3. **CLI connects** to SSE stream and waits for events
4. **When events arrive**, CLI forwards them to your local endpoint as HTTP POST
5. **Your handler** verifies the signature and processes the webhook
6. **CLI logs** success/failure for each webhook delivery

## License

MIT
