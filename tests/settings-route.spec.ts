import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SEARCH_TOGGLE_PATH, SETTINGS_PATH, searchToggleHandler, settingsHandler } from '../src/settings-route.ts'

const servers: Array<ReturnType<typeof createServer>> = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.close(() => { resolve() }) })))
})

describe('browser settings route', () => {
  it('returns credential status without returning values', async () => {
    const api = {
      read: vi.fn(async () => snapshot()),
      write: vi.fn(async () => snapshot()),
      test: vi.fn(async () => testResult()),
    }
    const origin = await serve(api)
    const response = await fetch(`${origin}${SETTINGS_PATH}`)
    expect(response.status).toBe(200)
    const text = await response.text()
    expect(text).toContain('configured')
    expect(text).not.toContain('secret-value')
  })

  it('accepts a same-origin update and rejects cross-site writes', async () => {
    const api = {
      read: vi.fn(async () => snapshot()),
      write: vi.fn(async () => snapshot()),
      test: vi.fn(async () => testResult()),
    }
    const origin = await serve(api)
    const body = JSON.stringify({ config: { provider: 'tavily' }, apiKey: 'secret-value' })
    const accepted = await fetch(`${origin}${SETTINGS_PATH}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', origin, 'sec-fetch-site': 'same-origin' },
      body,
    })
    expect(accepted.status).toBe(200)
    expect(api.write).toHaveBeenCalledWith({ provider: 'tavily' }, 'secret-value')
    expect(await accepted.text()).not.toContain('secret-value')

    const rejected = await fetch(`${origin}${SETTINGS_PATH}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', origin: 'https://attacker.example', 'sec-fetch-site': 'cross-site' },
      body,
    })
    expect(rejected.status).toBe(403)
    expect(api.write).toHaveBeenCalledTimes(1)
  })

  it('tests a draft without writing settings or returning the API key', async () => {
    const api = {
      read: vi.fn(async () => snapshot()),
      write: vi.fn(async () => snapshot()),
      test: vi.fn(async () => testResult()),
    }
    const origin = await serve(api)
    const body = JSON.stringify({ config: { provider: 'brave' }, apiKey: 'secret-value' })
    const response = await fetch(`${origin}${SETTINGS_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin, 'sec-fetch-site': 'same-origin' },
      body,
    })
    expect(response.status).toBe(200)
    expect(api.test).toHaveBeenCalledWith({ provider: 'brave' }, 'secret-value')
    expect(api.write).not.toHaveBeenCalled()
    const text = await response.text()
    expect(text).toContain('Brave result')
    expect(text).not.toContain('secret-value')
  })
})

describe('conversation search toggle route', () => {
  it('reads and writes one session while rejecting cross-origin and invalid input', async () => {
    const state = new Map<string, boolean>()
    const api = {
      read: (sessionId: string) => state.get(sessionId) ?? true,
      write: vi.fn(async (sessionId: string, enabled: boolean) => {
        state.set(sessionId, enabled)
        return enabled
      }),
    }
    const origin = await serveToggle(api)
    const path = `${origin}${SEARCH_TOGGLE_PATH}`
    const initial = await fetch(`${path}?sessionId=session-one`)
    expect(await initial.json()).toEqual({ enabled: true })
    const headers = { 'content-type': 'application/json', origin }
    const changed = await fetch(path, {
      method: 'PUT', headers, body: JSON.stringify({ sessionId: 'session-one', enabled: false }),
    })
    expect(await changed.json()).toEqual({ enabled: false })
    expect(await (await fetch(`${path}?sessionId=session-one`)).json()).toEqual({ enabled: false })
    expect(await (await fetch(`${path}?sessionId=session-two`)).json()).toEqual({ enabled: true })
    expect((await fetch(path, { method: 'PUT', headers: { ...headers, origin: 'https://other.example' }, body: '{}' })).status).toBe(403)
    expect((await fetch(path, { method: 'PUT', headers, body: JSON.stringify({ sessionId: '__proto__', enabled: false }) })).status).toBe(400)
    expect(api.write).toHaveBeenCalledTimes(1)
  })
})

function snapshot() {
  return {
    config: { provider: 'searxng' },
    credentials: {
      brave: { configured: false, writable: true },
      tavily: { configured: true, writable: true },
      gemini: { configured: false, writable: true },
    },
  }
}

function testResult() {
  return { provider: 'brave', resultCount: 1, durationMs: 42, firstTitle: 'Brave result' }
}

async function serve(api: Parameters<typeof settingsHandler>[0]): Promise<string> {
  const server = createServer(settingsHandler(api))
  servers.push(server)
  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve) })
  const port = (server.address() as AddressInfo).port
  return `http://127.0.0.1:${String(port)}`
}

async function serveToggle(api: Parameters<typeof searchToggleHandler>[0]): Promise<string> {
  const server = createServer(searchToggleHandler(api))
  servers.push(server)
  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve) })
  const port = (server.address() as AddressInfo).port
  return `http://127.0.0.1:${String(port)}`
}
