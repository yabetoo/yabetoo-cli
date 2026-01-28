import type { Config } from "./types.js";

/**
 * Default URLs
 */
const DEFAULT_WEBHOOK_SERVICE_URL = "https://webhook.yabetoo.com";
const DEFAULT_ACCOUNT_SERVICE_URL = "https://account.api.yabetoopay.com";

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
