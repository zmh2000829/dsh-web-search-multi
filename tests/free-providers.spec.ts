import { afterEach, describe, expect, it, vi } from 'vitest'
import { SearxngBackend, WikipediaBackend, endpointFor } from '../src/index.ts'

afterEach(() => vi.unstubAllGlobals())

describe('SearxngBackend', () => {
  it('posts the JSON query and maps results', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe('POST')
      expect(String(init?.body)).toContain('q=DeepSeek+Harness')
      expect(String(init?.body)).toContain('format=json')
      return jsonResponse({ results: [
        { url: 'https://example.com/a', title: ' A ', content: ' Result ', publishedDate: '2026-08-18T00:00:00Z' },
        { url: 'https://example.com/b', title: 'B' },
      ] })
    })
    vi.stubGlobal('fetch', fetchMock)
    const provider = new SearxngBackend({ baseURL: 'http://localhost:8080', language: 'all', safeSearch: 1 })
    await expect(provider.search({ query: 'DeepSeek Harness', maxResults: 1 })).resolves.toEqual({
      sources: [{ url: 'https://example.com/a', title: 'A', snippet: 'Result', publishedAt: '2026-08-18T00:00:00Z' }],
      truncated: true,
    })
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/search', expect.any(Object))
  })

  it('normalizes the instance endpoint and rejects credentials', () => {
    expect(endpointFor('https://search.example/base/')).toBe('https://search.example/base/search')
    const credentialed = new URL('https://search.example')
    credentialed.username = 'account'
    credentialed.password = ['not', 'a', 'credential'].join('-')
    expect(endpointFor(credentialed.href)).toBeUndefined()
  })
})

describe('WikipediaBackend', () => {
  it('uses the language-specific Action API and strips result markup', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      expect(url.hostname).toBe('zh.wikipedia.org')
      expect(url.searchParams.get('srlimit')).toBe('4')
      return jsonResponse({ query: { search: [{ title: '深度求索', snippet: '<span class="searchmatch">深度</span>求索 &amp; AI', timestamp: '2026-08-18T00:00:00Z' }] } })
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await new WikipediaBackend('zh').search({ query: 'DeepSeek', maxResults: 4 })
    expect(result.sources).toEqual([{
      url: 'https://zh.wikipedia.org/wiki/%E6%B7%B1%E5%BA%A6%E6%B1%82%E7%B4%A2',
      title: '深度求索',
      snippet: '深度求索 & AI',
      publishedAt: '2026-08-18T00:00:00Z',
    }])
  })
})

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
}
