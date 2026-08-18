import { WebError } from '@deepseek-ai/dsh-web'
import type { WebSearchRequest, WebSearchResult, WebSearchSource } from '@deepseek-ai/dsh-web'
import { DEFAULT_REQUEST_TIMEOUT_MS, decodeResponse, fetchJson, isRecord, optionalString, requiredHttpUrl, resultLimit } from './http.ts'
import type { SearchBackend, SearxngConfig } from './types.ts'

/** SearXNG backend using a configured instance's keyless JSON endpoint. */
export class SearxngBackend implements SearchBackend {
  readonly id = 'configurable-search'
  readonly kind = 'searxng'

  constructor(
    private readonly config: Required<Pick<SearxngConfig, 'baseURL' | 'language' | 'safeSearch'>> & SearxngConfig,
    private readonly requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  ) {}

  available(): boolean {
    return endpointFor(this.config.baseURL) !== undefined
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const endpoint = endpointFor(this.config.baseURL)
    if (endpoint === undefined) throw new WebError('SearXNG baseURL must be an absolute HTTP(S) URL', 'WEB_PROVIDER_ERROR')
    const body = new URLSearchParams({
      q: request.query,
      format: 'json',
      language: this.config.language,
      safesearch: String(this.config.safeSearch),
    })
    if (this.config.categories !== undefined) body.set('categories', this.config.categories)
    const value = await fetchJson('SearXNG', endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    }, { ...signal === undefined ? {} : { signal }, timeoutMs: this.requestTimeoutMs })
    const maximum = resultLimit(request.maxResults, 20, 8)
    return decodeResponse('SearXNG', value, input => {
      if (!isRecord(input) || !Array.isArray(input.results)) throw new TypeError('response.results must be an array')
      const sources = input.results.map(mapResult)
      return { sources: sources.slice(0, maximum), truncated: sources.length > maximum }
    })
  }
}

/** Resolve the configured instance root to its search endpoint. */
export function endpointFor(baseURL: string): string | undefined {
  try {
    const url = new URL(baseURL)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    if (url.username.length > 0 || url.password.length > 0) return undefined
    url.search = ''
    url.hash = ''
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/search`
    return url.href
  } catch {
    return undefined
  }
}

function mapResult(value: unknown, index: number): WebSearchSource {
  if (!isRecord(value)) throw new TypeError(`SearXNG results[${index}] must be an object`)
  const title = optionalString(value.title, `SearXNG results[${index}].title`)
  const snippet = optionalString(value.content, `SearXNG results[${index}].content`)
  const publishedAt = optionalString(value.publishedDate, `SearXNG results[${index}].publishedDate`)
  return {
    url: requiredHttpUrl(value.url, `SearXNG results[${index}].url`),
    ...title === undefined ? {} : { title },
    ...snippet === undefined ? {} : { snippet },
    ...publishedAt === undefined ? {} : { publishedAt },
  }
}
