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
    cliToken: 'token_abc',
    accountId: 'acct_123',
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  }

  const expiredCredentials: CliCredentials = {
    cliToken: 'token_old',
    accountId: 'acct_456',
    expiresAt: new Date(Date.now() - 86400000).toISOString(),
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
    expect(loadCredentials()).toBeNull()
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
