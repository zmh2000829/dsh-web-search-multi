import type { WebSearchRequest, WebSearchResult, WebSearchSource } from '@deepseek-ai/dsh-web'
import { DEFAULT_REQUEST_TIMEOUT_MS, decodeResponse, fetchJson, isRecord, optionalString, requiredHttpUrl, resolveCredential, resultLimit } from './http.ts'
import type { SearchBackend, TavilyConfig } from './types.ts'

const ENDPOINT = 'https://api.tavily.com/search'

/** Tavily Search API backend. */
export class TavilyBackend implements SearchBackend {
  readonly id = 'configurable-search'
  readonly kind = 'tavily'

  constructor(
    private readonly resolveApiKey: () => Promise<string | undefined>,
    private readonly apiKeyReference: string,
    private readonly config: TavilyConfig,
    private readonly requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  ) {}

  available(): boolean {
    return true
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const apiKey = await resolveCredential('Tavily', this.apiKeyReference, this.resolveApiKey, signal)
    const value = await fetchJson('Tavily', ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query: request.query,
        search_depth: this.config.searchDepth ?? 'basic',
        topic: this.config.topic ?? 'general',
        max_results: resultLimit(request.maxResults, 20, 8),
        include_answer: false,
        include_raw_content: false,
      }),
    }, { ...signal === undefined ? {} : { signal }, timeoutMs: this.requestTimeoutMs })
    return decodeResponse('Tavily', value, input => {
      if (!isRecord(input) || !Array.isArray(input.results)) throw new TypeError('response.results must be an array')
      return { sources: input.results.map(mapResult), truncated: false }
    })
  }
}

function mapResult(value: unknown, index: number): WebSearchSource {
  if (!isRecord(value)) throw new TypeError(`Tavily results[${index}] must be an object`)
  const title = optionalString(value.title, `Tavily results[${index}].title`)
  const snippet = optionalString(value.content, `Tavily results[${index}].content`)
  const publishedAt = optionalString(value.published_date, `Tavily results[${index}].published_date`)
  return {
    url: requiredHttpUrl(value.url, `Tavily results[${index}].url`),
    ...title === undefined ? {} : { title },
    ...snippet === undefined ? {} : { snippet },
    ...publishedAt === undefined ? {} : { publishedAt },
  }
}
