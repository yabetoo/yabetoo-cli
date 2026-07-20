import type { Config } from "./types.js";

/**
 * Default URLs
 */
const DEFAULT_WEBHOOK_SERVICE_URL = "https://webhook.yabetoo.com";
const DEFAULT_ACCOUNT_SERVICE_URL = "https://account.api.yabetoopay.com";
const DEFAULT_SSO_URL = "https://sso.yabetoo.com";

/**
 * OAuth client id used for the device authorization grant (RFC 8628).
 *
 * This default is the DEV client id — production builds must override it via
 * the YABETOO_CLI_OAUTH_CLIENT_ID environment variable.
 */
const DEFAULT_OAUTH_CLIENT_ID = "oauthc_01KY0GYNMD0D7HVAD87YB0Z804";

/**
 * Load configuration from environment variables
 */
export function loadConfig(): Config {
  return {
    apiKey: process.env.YABETOO_API_KEY || process.env.YABETOO_SECRET_KEY,
    webhookServiceUrl:
      process.env.YABETOO_WEBHOOK_SERVICE_URL || DEFAULT_WEBHOOK_SERVICE_URL,
    accountServiceUrl:
      process.env.YABETOO_ACCOUNT_SERVICE_URL || DEFAULT_ACCOUNT_SERVICE_URL,
    ssoUrl: process.env.YABETOO_SSO_URL || DEFAULT_SSO_URL,
    oauthClientId:
      process.env.YABETOO_CLI_OAUTH_CLIENT_ID || DEFAULT_OAUTH_CLIENT_ID,
    accountId: process.env.YABETOO_ACCOUNT_ID,
  };
}

/**
 * Validate that an API key has the correct format
 */
export function validateApiKey(apiKey: string): boolean {
  return apiKey.startsWith("sk_test_") || apiKey.startsWith("sk_live_");
}

/**
 * Determine environment from API key
 */
export function getEnvironment(apiKey: string): "test" | "live" {
  return apiKey.startsWith("sk_test_") ? "test" : "live";
}
