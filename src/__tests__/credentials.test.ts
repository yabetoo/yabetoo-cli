import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  saveCredentials,
  loadCredentials,
  deleteCredentials,
  hasValidCredentials,
  type CliCredentials,
} from '../credentials.js'

describe('credentials', () => {
  const testDir = path.join(os.tmpdir(), '.yabetoo-test-' + Date.now())
  const credPath = path.join(testDir, 'credentials.json')

  // Mock os.homedir to use temp dir
  beforeEach(() => {
    vi.spyOn(os, 'homedir').mockReturnValue(
      path.dirname(testDir) // parent so getConfigDir appends .yabetoo
    )
    // We need the config dir to match our test path, so let's use a different approach
    vi.restoreAllMocks()

    // Create test directory
    fs.mkdirSync(testDir, { recursive: true })

    // Override homedir so ~/.yabetoo maps to our test dir
    const parentDir = path.join(os.tmpdir(), 'yabetoo-home-' + Date.now())
    fs.mkdirSync(parentDir, { recursive: true })
    vi.spyOn(os, 'homedir').mockReturnValue(parentDir)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const validCredentials: CliCredentials = {
    cliToken: 'token_abc',
    accountId: 'acct_123',
    expiresAt: new Date(Date.now() + 86400000).toISOString(), // +1 day
  }

  const expiredCredentials: CliCredentials = {
    cliToken: 'token_old',
    accountId: 'acct_456',
    expiresAt: new Date(Date.now() - 86400000).toISOString(), // -1 day
  }

  it('saves and loads credentials', () => {
    saveCredentials(validCredentials)
    const loaded = loadCredentials()
    expect(loaded).toEqual(validCredentials)
  })

  it('returns null when no credentials exist', () => {
    expect(loadCredentials()).toBeNull()
  })

  it('returns null for expired credentials', () => {
    saveCredentials(expiredCredentials)
    const loaded = loadCredentials()
    expect(loaded).toBeNull()
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
