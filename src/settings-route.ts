/** Same-origin HTTP bridge used by the plugin's browser settings card. */

import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http'

/** Exact same-origin route owned by this plugin. */
export const SETTINGS_PATH = '/web-search-multi/settings'

/** Credential status safe to render in a browser. */
export interface CredentialStatus {
  readonly configured: boolean
  readonly writable: boolean
}

/** Complete browser settings snapshot; it never contains credential values. */
export interface BrowserSettingsSnapshot {
  readonly config: unknown
  readonly credentials: {
    readonly brave: CredentialStatus
    readonly tavily: CredentialStatus
  }
}

/** Safe summary returned after exercising one provider with a real query. */
export interface SettingsTestResult {
  readonly provider: string
  readonly resultCount: number
  readonly durationMs: number
  readonly firstTitle?: string | undefined
}

/** Server operations exposed through the same-origin settings route. */
export interface SettingsApi {
  readonly read: () => Promise<BrowserSettingsSnapshot>
  readonly write: (config: unknown, apiKey: string | undefined) => Promise<BrowserSettingsSnapshot>
  readonly test: (config: unknown, apiKey: string | undefined) => Promise<SettingsTestResult>
}

interface RequestHeaders {
  readonly headers: IncomingHttpHeaders
}

/** True when a request came from the same loopback DSH Web origin. */
export function isTrustedSettingsRequest(request: RequestHeaders, requireOrigin: boolean): boolean {
  const rawHost = singleHeader(request.headers, 'host')
  if (rawHost === undefined) return false
  let host: URL
  try {
    host = new URL(`http://${rawHost}`)
  } catch {
    return false
  }
  if (!loopback(host.hostname) || singleHeader(request.headers, 'sec-fetch-site') === 'cross-site') return false
  const origin = singleHeader(request.headers, 'origin')
  if (origin === undefined) return !requireOrigin
  try {
    return new URL(origin).host === host.host
  } catch {
    return false
  }
}

/** Build the GET/PUT route handler without exposing DSH services to HTTP code. */
export function settingsHandler(api: SettingsApi) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (request.method === 'GET') {
      if (!isTrustedSettingsRequest(request, false)) return forbidden(response)
      return json(response, 200, await api.read())
    }
    if (request.method !== 'PUT' && request.method !== 'POST') {
      response.writeHead(405, { allow: 'GET, POST, PUT' })
      response.end()
      return
    }
    if (!isTrustedSettingsRequest(request, true)) return forbidden(response)
    if (singleHeader(request.headers, 'content-type')?.split(';', 1)[0] !== 'application/json') {
      return json(response, 415, { error: 'content-type must be application/json' })
    }
    let input: unknown
    try {
      input = JSON.parse(await readBody(request, 16 * 1024))
    } catch (error: unknown) {
      return json(response, 400, { error: error instanceof Error ? error.message : String(error) })
    }
    if (!isRecord(input) || !('config' in input) || !isRecord(input.config)) {
      return json(response, 400, { error: 'config must be an object' })
    }
    const apiKey = input.apiKey
    if (apiKey !== undefined && (typeof apiKey !== 'string' || apiKey.length > 8_192)) {
      return json(response, 400, { error: 'apiKey must be a string of at most 8192 characters' })
    }
    try {
      const value = request.method === 'POST'
        ? await api.test(input.config, apiKey)
        : await api.write(input.config, apiKey)
      return json(response, 200, value)
    } catch (error: unknown) {
      return json(response, 400, { error: error instanceof Error ? error.message : String(error) })
    }
  }
}

async function readBody(request: IncomingMessage, maximum: number): Promise<string> {
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    length += buffer.length
    if (length > maximum) throw new Error(`request body exceeds ${String(maximum)} bytes`)
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function singleHeader(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name]
  return typeof value === 'string' ? value : undefined
}

function loopback(hostname: string): boolean {
  const value = hostname.toLocaleLowerCase('en-US')
  if (value === 'localhost' || value.endsWith('.localhost') || value === '[::1]') return true
  const parts = value.split('.')
  return parts.length === 4 && parts[0] === '127' && parts.every(part => /^\d{1,3}$/.test(part))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function forbidden(response: ServerResponse): void {
  response.writeHead(403)
  response.end('forbidden')
}

function json(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'x-content-type-options': 'nosniff',
  })
  response.end(body)
}
