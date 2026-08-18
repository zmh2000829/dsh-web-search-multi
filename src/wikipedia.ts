import type { WebSearchRequest, WebSearchResult, WebSearchSource } from '@deepseek-ai/dsh-web'
import { DEFAULT_REQUEST_TIMEOUT_MS, decodeResponse, fetchJson, isRecord, optionalString, plainText, resultLimit } from './http.ts'
import type { SearchBackend } from './types.ts'

/** Keyless Wikipedia full-text search backend. */
export class WikipediaBackend implements SearchBackend {
  readonly id = 'configurable-search'
  readonly kind = 'wikipedia'

  constructor(private readonly language: string, private readonly requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {}

  available(): boolean {
    return /^[a-z][a-z0-9-]{0,19}$/.test(this.language)
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const url = new URL(`https://${this.language}.wikipedia.org/w/api.php`)
    url.search = new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: request.query,
      srlimit: String(resultLimit(request.maxResults, 50, 8)),
      srprop: 'snippet|timestamp',
      format: 'json',
      formatversion: '2',
    }).toString()
    const value = await fetchJson('Wikipedia', url, { method: 'GET' }, {
      ...signal === undefined ? {} : { signal },
      timeoutMs: this.requestTimeoutMs,
    })
    return decodeResponse('Wikipedia', value, input => {
      if (!isRecord(input) || !isRecord(input.query) || !Array.isArray(input.query.search)) {
        throw new TypeError('response.query.search must be an array')
      }
      return { sources: input.query.search.map((entry, index) => mapResult(entry, index, this.language)), truncated: false }
    })
  }
}

function mapResult(value: unknown, index: number, language: string): WebSearchSource {
  if (!isRecord(value)) throw new TypeError(`Wikipedia results[${index}] must be an object`)
  const title = optionalString(value.title, `Wikipedia results[${index}].title`)
  if (title === undefined) throw new TypeError(`Wikipedia results[${index}].title must not be blank`)
  const rawSnippet = optionalString(value.snippet, `Wikipedia results[${index}].snippet`)
  const publishedAt = optionalString(value.timestamp, `Wikipedia results[${index}].timestamp`)
  return {
    url: `https://${language}.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(' ', '_'))}`,
    title,
    ...rawSnippet === undefined ? {} : { snippet: plainText(rawSnippet) },
    ...publishedAt === undefined ? {} : { publishedAt },
  }
}
