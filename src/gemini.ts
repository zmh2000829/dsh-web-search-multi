import type { WebSearchRequest, WebSearchResult, WebSearchSource } from '@deepseek-ai/dsh-web'
import { DEFAULT_REQUEST_TIMEOUT_MS, decodeResponse, fetchJson, isRecord, optionalString, requiredHttpUrl, resolveCredential, resultLimit } from './http.ts'
import type { SearchBackend } from './types.ts'

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models/'

/** Gemini API backend grounded with Google Search. */
export class GeminiBackend implements SearchBackend {
  readonly id = 'configurable-search'
  readonly kind = 'gemini'

  constructor(
    private readonly resolveApiKey: () => Promise<string | undefined>,
    private readonly apiKeyReference: string,
    private readonly model: string,
    private readonly requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  ) {}

  available(): boolean {
    return true
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const apiKey = await resolveCredential('Gemini', this.apiKeyReference, this.resolveApiKey, signal)
    const value = await fetchJson('Gemini', `${API_ROOT}${encodeURIComponent(this.model)}:generateContent`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Search the web for this query and answer with grounded citations: ${request.query}` }] }],
        tools: [{ google_search: {} }],
        generationConfig: { maxOutputTokens: 256, temperature: 0 },
      }),
    }, { ...signal === undefined ? {} : { signal }, timeoutMs: this.requestTimeoutMs })
    const maximum = resultLimit(request.maxResults, 20, 8)
    return decodeResponse('Gemini', value, input => decodeGroundedSources(input, maximum))
  }
}

function decodeGroundedSources(input: unknown, maximum: number): WebSearchResult {
  if (!isRecord(input) || !Array.isArray(input.candidates) || !isRecord(input.candidates[0])) {
    throw new TypeError('response.candidates[0] must be an object')
  }
  const metadata = input.candidates[0].groundingMetadata
  if (!isRecord(metadata) || !Array.isArray(metadata.groundingChunks)) {
    throw new TypeError('response.candidates[0].groundingMetadata.groundingChunks must be an array')
  }
  const unique = new Map<string, WebSearchSource>()
  for (const [index, chunk] of metadata.groundingChunks.entries()) {
    if (!isRecord(chunk) || !isRecord(chunk.web)) continue
    const url = requiredHttpUrl(chunk.web.uri, `Gemini groundingChunks[${String(index)}].web.uri`)
    const title = optionalString(chunk.web.title, `Gemini groundingChunks[${String(index)}].web.title`)
    if (!unique.has(url)) unique.set(url, { url, ...title === undefined ? {} : { title } })
  }
  const sources = [...unique.values()]
  return { sources: sources.slice(0, maximum), truncated: sources.length > maximum }
}
