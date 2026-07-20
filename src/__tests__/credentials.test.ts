import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import {
  saveCredentials,
  loadCredentials,
  deleteCredentials,
  hasValidCredentials,
  type CliCredentials,
} from '../credentials.js'

describe('credentials', () => {
  let parentDir: string

  beforeEach(() => {
    parentDir = path.join(os.tmpdir(), 'yabetoo-home-' + crypto.randomUUID())
    fs.mkdirSync(parentDir, { recursive: true })
    vi.spyOn(os, 'homedir').mockReturnValue(parentDir)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(parentDir, { recursive: true, force: true })
  })

  const validCredentials: CliCredentials = {
    accessToken: 'access_abc',
    refreshToken: 'refresh_abc',
    expiresAt: new Date(Date.now() + 900_000).toISOString(),
    ssoUrl: 'https://sso.yabetoo.com',
  }

  it('saves and loads credentials', () => {
    saveCredentials(validCredentials)
    const loaded = loadCredentials()
    expect(loaded).toEqual(validCredentials)
  })

  it('returns null when no credentials exist', () => {
    expect(loadCredentials()).toBeNull()
  })

  it('still loads credentials with an expired access token (refresh token handles renewal)', () => {
    const expired: CliCredentials = {
      ...validCredentials,
      expiresAt: new Date(Date.now() - 900_000).toISOString(),
    }
    saveCredentials(expired)
    expect(loadCredentials()).toEqual(expired)
  })

  it('deletes legacy cliToken credentials and returns null', () => {
    const credentialsPath = path.join(parentDir, '.yabetoo', 'credentials.json')
    fs.mkdirSync(path.dirname(credentialsPath), { recursive: true })
    fs.writeFileSync(
      credentialsPath,
      JSON.stringify({
        cliToken: 'token_old',
        accountId: 'acct_123',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      })
    )

    expect(loadCredentials()).toBeNull()
    expect(fs.existsSync(credentialsPath)).toBe(false)
  })

  it('deletes credentials', () => {
    saveCredentials(validCredentials)
    deleteCredentials()
    expect(loadCredentials()).toBeNull()
  })

  it('deleteCredentials does not throw when no file exists', () => {
    expect(() => deleteCredentials()).not.toThrow()
  })

  it('hasValidCredentials returns true when valid', () => {
    saveCredentials(validCredentials)
    expect(hasValidCredentials()).toBe(true)
  })

  it('hasValidCredentials returns false when none exist', () => {
    expect(hasValidCredentials()).toBe(false)
  })
})
