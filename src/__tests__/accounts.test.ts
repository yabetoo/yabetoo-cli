import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fetchAllAccounts, type SsoAccount } from '../commands/accounts.js'

const SSO_URL = 'http://localhost:8000'
const ACCESS_TOKEN = 'jwt_access_token'

function account(id: string, overrides: Partial<SsoAccount> = {}): SsoAccount {
  return {
    id,
    object: 'account',
    organization_id: 'org_1',
    environment: 'test',
    type: 'business',
    name: `Account ${id}`,
    status: 'active',
    ...overrides,
  }
}

function listResponse(
  data: SsoAccount[],
  hasMore = false,
  nextCursor: string | null = null,
  status = 200
): Response {
  return new Response(
    JSON.stringify({ object: 'list', data, has_more: hasMore, next_cursor: nextCursor }),
    { status, headers: { 'Content-Type': 'application/json' } }
  )
}

describe('fetchAllAccounts', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('calls GET {sso}/api/v1/accounts with the Bearer access token', async () => {
    fetchMock.mockResolvedValueOnce(listResponse([account('acct_1')]))

    const accounts = await fetchAllAccounts(SSO_URL, ACCESS_TOKEN)

    expect(accounts).toHaveLength(1)
    expect(accounts[0].id).toBe('acct_1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8000/api/v1/accounts')
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`)
  })

  it('strips a trailing slash from the SSO url', async () => {
    fetchMock.mockResolvedValueOnce(listResponse([]))

    await fetchAllAccounts(`${SSO_URL}/`, ACCESS_TOKEN)

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8000/api/v1/accounts')
  })

  it('follows the Stripe-shape cursor pagination via starting_after', async () => {
    fetchMock
      .mockResolvedValueOnce(listResponse([account('acct_1')], true, 'acct_1'))
      .mockResolvedValueOnce(listResponse([account('acct_2')], false, null))

    const accounts = await fetchAllAccounts(SSO_URL, ACCESS_TOKEN)

    expect(accounts.map((a) => a.id)).toEqual(['acct_1', 'acct_2'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toBe(
      'http://localhost:8000/api/v1/accounts?starting_after=acct_1'
    )
  })

  it('returns an empty array when the user has no accounts', async () => {
    fetchMock.mockResolvedValueOnce(listResponse([]))

    await expect(fetchAllAccounts(SSO_URL, ACCESS_TOKEN)).resolves.toEqual([])
  })

  it('throws with the server message on an error response', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Unauthenticated.' }), { status: 401 })
    )

    await expect(fetchAllAccounts(SSO_URL, ACCESS_TOKEN)).rejects.toThrow('Unauthenticated.')
  })

  it('throws a generic message when the error body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }))

    await expect(fetchAllAccounts(SSO_URL, ACCESS_TOKEN)).rejects.toThrow(
      'Failed to get accounts: 500'
    )
  })
})
