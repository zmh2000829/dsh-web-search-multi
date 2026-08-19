import { WebError } from '@deepseek-ai/dsh-web'

/** Default deadline kept below the Harness web-search tool deadline. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 25_000

const USER_AGENT = 'dsh-web-search-multi/0.5.0 (+https://github.com/zmh2000829/dsh-web-search-multi)'

/** Per-request transport controls shared by every backend. */
export interface FetchJsonOptions {
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
}

/** Fetch and parse an untrusted JSON response with shared web error codes. */
export async function fetchJson(
  provider: string,
  url: string | URL,
  init: RequestInit,
  options: FetchJsonOptions = {},
): Promise<unknown> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  const timeoutController = new AbortController()
  const timeout = setTimeout(() => {
    timeoutController.abort(new DOMException(`${provider} request timed out`, 'TimeoutError'))
  }, timeoutMs)
  const requestSignal = options.signal === undefined
    ? timeoutController.signal
    : AbortSignal.any([options.signal, timeoutController.signal])

  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      redirect: 'error',
      headers: {
        accept: 'application/json',
        'user-agent': USER_AGENT,
        ...init.headers,
      },
      signal: requestSignal,
    })
  } catch (error: unknown) {
    clearTimeout(timeout)
    if (options.signal?.aborted === true || (isAbortError(error) && !timeoutController.signal.aborted)) {
      throw new WebError(`${provider} search aborted`, 'WEB_ABORTED', { cause: error })
    }
    if (timeoutController.signal.aborted) {
      throw new WebError(`${provider} request timed out after ${String(timeoutMs)}ms`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
    throw new WebError(`${provider} request failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
  }

  if (!response.ok) {
    clearTimeout(timeout)
    throw new WebError(`${provider} API error (HTTP ${response.status})`, 'WEB_PROVIDER_ERROR')
  }

  try {
    return await response.json()
  } catch (error: unknown) {
    if (options.signal?.aborted === true) throw new WebError(`${provider} search aborted`, 'WEB_ABORTED', { cause: error })
    if (timeoutController.signal.aborted) {
      throw new WebError(`${provider} request timed out after ${String(timeoutMs)}ms`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
    throw new WebError(`${provider} returned invalid JSON: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
  } finally {
    clearTimeout(timeout)
  }
}

/** Resolve a non-empty credential for one API request without caching it. */
export async function resolveCredential(
  provider: string,
  reference: string,
  resolve: () => Promise<string | undefined>,
  signal?: AbortSignal,
): Promise<string> {
  if (isSignalAborted(signal)) throw new WebError(`${provider} search aborted`, 'WEB_ABORTED')
  let value: string | undefined
  try {
    value = await resolve()
  } catch (error: unknown) {
    if (isSignalAborted(signal) || isAbortError(error)) {
      throw new WebError(`${provider} search aborted`, 'WEB_ABORTED', { cause: error })
    }
    throw new WebError(`${provider} credential resolution failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
  }
  if (isSignalAborted(signal)) throw new WebError(`${provider} search aborted`, 'WEB_ABORTED')
  const trimmed = value?.trim()
  if (trimmed === undefined || trimmed.length === 0 || trimmed === reference) {
    throw new WebError(`${provider} credential ${reference} is not configured`, 'WEB_PROVIDER_ERROR')
  }
  return trimmed
}

/** True when a parsed JSON value is a plain record. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Validate one absolute HTTP(S) URL returned by an external provider. */
export function requiredHttpUrl(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new TypeError(`${path} must be a string`)
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new TypeError()
    return value
  } catch {
    throw new TypeError(`${path} must be an absolute HTTP(S) URL`)
  }
}

/** Return a trimmed optional string or omit blank values. */
export function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new TypeError(`${path} must be a string or null`)
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}

/** Cap a provider request to its supported result-count range. */
export function resultLimit(value: number | undefined, maximum: number, fallback: number): number {
  if (value === undefined) return fallback
  return Math.max(1, Math.min(maximum, Math.floor(value)))
}

/** Convert a validated provider response and normalize all field errors. */
export function decodeResponse<T>(provider: string, value: unknown, decode: (input: unknown) => T): T {
  try {
    return decode(value)
  } catch (error: unknown) {
    throw new WebError(`${provider} returned an unprocessable response body: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
  }
}

/** Remove MediaWiki result markup and decode its common entities. */
export function plainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replaceAll('&quot;', '"')
    .replaceAll('&#039;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .trim()
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function isSignalAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true
}
