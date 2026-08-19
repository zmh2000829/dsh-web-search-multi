import type { WebSearchRequest, WebSearchResult, WebSearchSource } from '@deepseek-ai/dsh-web'
import { DEFAULT_REQUEST_TIMEOUT_MS, decodeResponse, fetchJson, isRecord, optionalString, requiredHttpUrl, resolveCredential, resultLimit } from './http.ts'
import type { SearchBackend } from './types.ts'

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models/'
const HTTP_URL_PATTERN = /https?:\/\/[^\s<>"'`]+/i

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
        contents: [{ parts: [{ text: promptFor(request.query) }] }],
        tools: toolsFor(request.query),
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
  const snippets = snippetsByChunk(metadata.groundingSupports)
  const unique = new Map<string, WebSearchSource>()
  for (const [index, chunk] of metadata.groundingChunks.entries()) {
    if (!isRecord(chunk) || !isRecord(chunk.web)) continue
    const url = requiredHttpUrl(chunk.web.uri, `Gemini groundingChunks[${String(index)}].web.uri`)
    const title = optionalString(chunk.web.title, `Gemini groundingChunks[${String(index)}].web.title`)
    const snippet = snippets.get(index)
    const previous = unique.get(url)
    if (previous === undefined) {
      unique.set(url, { url, ...title === undefined ? {} : { title }, ...snippet === undefined ? {} : { snippet } })
      continue
    }
    const mergedSnippet = mergeText(previous.snippet, snippet)
    unique.set(url, { ...previous, ...mergedSnippet === undefined ? {} : { snippet: mergedSnippet } })
  }
  const sources = [...unique.values()]
  const content = candidateText(input.candidates[0])
  return {
    ...content === undefined ? {} : { content },
    sources: sources.slice(0, maximum),
    truncated: sources.length > maximum,
  }
}

function promptFor(query: string): string {
  if (HTTP_URL_PATTERN.test(query)) {
    return `Inspect every explicit URL with URL context, use Google Search only for necessary supporting information, and answer concisely with citations: ${query}`
  }
  return `Search the web for this query and answer concisely with grounded citations: ${query}`
}

function toolsFor(query: string): Array<Record<string, Record<string, never>>> {
  return HTTP_URL_PATTERN.test(query)
    ? [{ url_context: {} }, { google_search: {} }]
    : [{ google_search: {} }]
}

function candidateText(candidate: Record<string, unknown>): string | undefined {
  if (!isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) return undefined
  const parts: string[] = []
  for (const part of candidate.content.parts) {
    if (!isRecord(part)) continue
    const text = optionalString(part.text, 'Gemini candidates[0].content.parts[].text')
    if (text !== undefined) parts.push(text)
  }
  return parts.length === 0 ? undefined : parts.join('\n').trim()
}

function snippetsByChunk(value: unknown): Map<number, string> {
  const snippets = new Map<number, string>()
  if (!Array.isArray(value)) return snippets
  for (const support of value) {
    if (!isRecord(support) || !isRecord(support.segment) || !Array.isArray(support.groundingChunkIndices)) continue
    const text = optionalString(support.segment.text, 'Gemini groundingSupports[].segment.text')
    if (text === undefined) continue
    for (const index of support.groundingChunkIndices) {
      if (!Number.isInteger(index) || (index as number) < 0) continue
      snippets.set(index as number, mergeText(snippets.get(index as number), text) ?? text)
    }
  }
  return snippets
}

function mergeText(first: string | undefined, second: string | undefined): string | undefined {
  if (first === undefined) return second
  if (second === undefined || first.includes(second)) return first
  return `${first} ${second}`
}
