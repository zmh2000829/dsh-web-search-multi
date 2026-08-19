import { afterEach, describe, expect, it, vi } from 'vitest'
import { BraveBackend, GeminiBackend, TavilyBackend } from '../src/index.ts'

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

describe('GeminiBackend', () => {
  it('uses Google Search grounding and maps the answer, citation snippets, and unique sources', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent')
      expect(new Headers(init?.headers).get('x-goog-api-key')).toBe('gemini-secret')
      expect(JSON.parse(String(init?.body))).toEqual({
        contents: [{ parts: [{ text: 'Search the web for this query and answer concisely with grounded citations: agent harness' }] }],
        tools: [{ google_search: {} }],
        generationConfig: { maxOutputTokens: 256, temperature: 0 },
      })
      return jsonResponse({
        candidates: [{
          content: { parts: [{ text: 'A grounded answer.' }] },
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: 'https://example.com/one', title: 'First source' } },
              { web: { uri: 'https://example.com/one', title: 'Duplicate source' } },
              { web: { uri: 'https://example.com/two', title: 'Second source' } },
            ],
            groundingSupports: [
              { segment: { text: 'First cited fact.' }, groundingChunkIndices: [0] },
              { segment: { text: 'Additional fact.' }, groundingChunkIndices: [1] },
              { segment: { text: 'Second cited fact.' }, groundingChunkIndices: [2] },
            ],
          },
        }],
      })
    }))
    const result = await new GeminiBackend(async () => 'gemini-secret', 'GEMINI_API_KEY', 'gemini-3.5-flash-lite')
      .search({ query: 'agent harness', maxResults: 1 })
    expect(result).toEqual({
      content: 'A grounded answer.',
      sources: [{ url: 'https://example.com/one', title: 'First source', snippet: 'First cited fact. Additional fact.' }],
      truncated: true,
    })
  })

  it('combines URL Context with Google Search for explicit URLs', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        contents: [{ parts: [{ text: 'Inspect every explicit URL with URL context, use Google Search only for necessary supporting information, and answer concisely with citations: inspect https://github.com/volcengine/OpenViking' }] }],
        tools: [{ url_context: {} }, { google_search: {} }],
        generationConfig: { maxOutputTokens: 256, temperature: 0 },
      })
      return jsonResponse({
        candidates: [{
          content: { parts: [{ text: 'The repository contains a DSH example.' }] },
          groundingMetadata: {
            groundingChunks: [{ web: { uri: 'https://github.com/volcengine/OpenViking', title: 'OpenViking' } }],
          },
        }],
      })
    }))
    const result = await new GeminiBackend(async () => 'gemini-secret', 'GEMINI_API_KEY', 'gemini-3.5-flash-lite')
      .search({ query: 'inspect https://github.com/volcengine/OpenViking' })
    expect(result.content).toBe('The repository contains a DSH example.')
  })
})

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
}
