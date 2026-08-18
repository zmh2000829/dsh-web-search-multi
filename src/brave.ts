import type { WebSearchRequest, WebSearchResult, WebSearchSource } from '@deepseek-ai/dsh-web'
import { DEFAULT_REQUEST_TIMEOUT_MS, decodeResponse, fetchJson, isRecord, optionalString, requiredHttpUrl, resolveCredential, resultLimit } from './http.ts'
import type { BraveConfig, SearchBackend } from './types.ts'

const ENDPOINT = 'https://api.search.brave.com/res/v1/web/search'

/** Brave Web Search API backend. */
export class BraveBackend implements SearchBackend {
  readonly id = 'configurable-search'
  readonly kind = 'brave'

  constructor(
    private readonly resolveApiKey: () => Promise<string | undefined>,
    private readonly apiKeyReference: string,
    private readonly config: BraveConfig,
    private readonly requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  ) {}

  available(): boolean {
    return true
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const apiKey = await resolveCredential('Brave', this.apiKeyReference, this.resolveApiKey, signal)
    const url = new URL(ENDPOINT)
    url.searchParams.set('q', request.query)
    url.searchParams.set('count', String(resultLimit(request.maxResults, 20, 8)))
    url.searchParams.set('safesearch', this.config.safeSearch ?? 'moderate')
    if (this.config.country !== undefined) url.searchParams.set('country', this.config.country)
    if (this.config.searchLanguage !== undefined) url.searchParams.set('search_lang', this.config.searchLanguage)
    const value = await fetchJson('Brave', url, {
      method: 'GET',
      headers: { 'x-subscription-token': apiKey },
    }, { ...signal === undefined ? {} : { signal }, timeoutMs: this.requestTimeoutMs })
    return decodeResponse('Brave', value, input => {
      if (!isRecord(input) || !isRecord(input.web) || !Array.isArray(input.web.results)) {
        throw new TypeError('response.web.results must be an array')
      }
      return { sources: input.web.results.map(mapResult), truncated: false }
    })
  }
}

function mapResult(value: unknown, index: number): WebSearchSource {
  if (!isRecord(value)) throw new TypeError(`Brave results[${index}] must be an object`)
  const title = optionalString(value.title, `Brave results[${index}].title`)
  const snippet = optionalString(value.description, `Brave results[${index}].description`)
  return {
    url: requiredHttpUrl(value.url, `Brave results[${index}].url`),
    ...title === undefined ? {} : { title },
    ...snippet === undefined ? {} : { snippet },
  }
}
