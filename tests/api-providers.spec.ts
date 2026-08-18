import { afterEach, describe, expect, it, vi } from 'vitest'
import { BraveBackend, TavilyBackend } from '../src/index.ts'

afterEach(() => vi.unstubAllGlobals())

describe('BraveBackend', () => {
  it('authenticates, caps result count, and maps web results', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input))
      expect(url.origin + url.pathname).toBe('https://api.search.brave.com/res/v1/web/search')
      expect(url.searchParams.get('count')).toBe('20')
      expect(new Headers(init?.headers).get('x-subscription-token')).toBe('brave-secret')
      return jsonResponse({ web: { results: [{ url: 'https://example.com/brave', title: 'Brave result', description: 'Snippet' }] } })
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await new BraveBackend(async () => 'brave-secret', 'BRAVE_SEARCH_API_KEY', { country: 'US', searchLanguage: 'en', safeSearch: 'strict' })
      .search({ query: 'agent harness', maxResults: 100 })
    expect(result.sources).toEqual([{ url: 'https://example.com/brave', title: 'Brave result', snippet: 'Snippet' }])
  })
})

describe('TavilyBackend', () => {
  it('uses bearer authentication and cost-bounded defaults', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.tavily.com/search')
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer tavily-secret')
      expect(JSON.parse(String(init?.body))).toEqual({
        query: 'agent harness',
        search_depth: 'basic',
        topic: 'general',
        max_results: 8,
        include_answer: false,
        include_raw_content: false,
      })
      return jsonResponse({ results: [{ url: 'https://example.com/tavily', title: 'Tavily result', content: 'Ranked snippet', published_date: '2026-08-18T00:00:00Z' }] })
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await new TavilyBackend(async () => 'tavily-secret', 'TAVILY_API_KEY', {}).search({ query: 'agent harness', maxResults: 8 })
    expect(result.sources).toEqual([{
      url: 'https://example.com/tavily',
      title: 'Tavily result',
      snippet: 'Ranked snippet',
      publishedAt: '2026-08-18T00:00:00Z',
    }])
  })

  it('resolves the current credential for every request', async () => {
    let key = 'first-key'
    const seen: Array<string | null> = []
    vi.stubGlobal('fetch', vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      seen.push(new Headers(init?.headers).get('authorization'))
      return jsonResponse({ results: [] })
    }))
    const backend = new TavilyBackend(async () => key, 'TAVILY_API_KEY', {})
    await backend.search({ query: 'first' })
    key = 'rotated-key'
    await backend.search({ query: 'second' })
    expect(seen).toEqual(['Bearer first-key', 'Bearer rotated-key'])
  })

  it('fails at request time when the credential is absent', async () => {
    const backend = new TavilyBackend(async () => undefined, 'TAVILY_API_KEY', {})
    await expect(backend.search({ query: 'agent harness' })).rejects.toThrow('TAVILY_API_KEY is not configured')
  })
})

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
}
