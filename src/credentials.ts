import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

/**
 * Stored CLI credentials
 */
export interface CliCredentials {
  cliToken: string
  accountId: string
  expiresAt: string
  accountServiceUrl?: string
  webhookServiceUrl?: string
}

/**
 * Get the config directory path
 */
function getConfigDir(): string {
  const homeDir = os.homedir()
  return path.join(homeDir, '.yabetoo')
}

/**
 * Get the credentials file path
 */
function getCredentialsPath(): string {
  return path.join(getConfigDir(), 'credentials.json')
}

/**
 * Ensure the config directory exists
 */
function ensureConfigDir(): void {
  const configDir = getConfigDir()
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { mode: 0o700, recursive: true })
  }
}

/**
 * Save credentials to disk
 */
export function saveCredentials(credentials: CliCredentials): void {
  ensureConfigDir()
  const credentialsPath = getCredentialsPath()

  fs.writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2), {
    mode: 0o600, // Only owner can read/write
  })
}

/**
 * Load credentials from disk
 */
export function loadCredentials(): CliCredentials | null {
  const credentialsPath = getCredentialsPath()

  if (!fs.existsSync(credentialsPath)) {
    return null
  }

  try {
    const content = fs.readFileSync(credentialsPath, 'utf-8')
    const credentials = JSON.parse(content) as CliCredentials

    // Check if expired
    if (new Date(credentials.expiresAt) < new Date()) {
      // Token expired, delete credentials
      deleteCredentials()
      return null
    }

    return credentials
  } catch {
    return null
  }
}

/**
 * Delete stored credentials
 */
export function deleteCredentials(): void {
  const credentialsPath = getCredentialsPath()

  if (fs.existsSync(credentialsPath)) {
    fs.unlinkSync(credentialsPath)
  }
}

/**
 * Check if credentials exist and are valid
 */
export function hasValidCredentials(): boolean {
  const credentials = loadCredentials()
  return credentials !== null
}

/**
 * Get the config directory path (for display)
 */
export function getCredentialsFilePath(): string {
  return getCredentialsPath()
}
