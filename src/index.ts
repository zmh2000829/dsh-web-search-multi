/** Configurable web search provider for DeepSeek Harness. */

import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import type { WebSearchProvider } from '@deepseek-ai/dsh-web'
import { BraveBackend } from './brave.ts'
import { GeminiBackend } from './gemini.ts'
import { DEFAULT_REQUEST_TIMEOUT_MS } from './http.ts'
import { SETTINGS_PATH, settingsHandler } from './settings-route.ts'
import { SearxngBackend, endpointFor } from './searxng.ts'
import { TavilyBackend } from './tavily.ts'
import type { BraveConfig, CredentialReader, GeminiConfig, ProviderKind, SearchBackend, SearxngConfig, TavilyConfig, WikipediaConfig } from './types.ts'
import { WikipediaBackend } from './wikipedia.ts'

export { BraveBackend } from './brave.ts'
export { GeminiBackend } from './gemini.ts'
export { SearxngBackend, endpointFor } from './searxng.ts'
export { TavilyBackend } from './tavily.ts'
export type { BraveConfig, CredentialReader, GeminiConfig, ProviderKind, SearchBackend, SearxngConfig, TavilyConfig, WikipediaConfig } from './types.ts'
export { WikipediaBackend } from './wikipedia.ts'

/** Stable provider id selected by the host `web` service. */
export const PROVIDER_ID = 'configurable-search'
/** Default key environment variable for Brave Search. */
export const BRAVE_API_KEY_ENV = 'BRAVE_SEARCH_API_KEY'
/** Default key environment variable for Tavily. */
export const TAVILY_API_KEY_ENV = 'TAVILY_API_KEY'
/** Default key environment variable for the Gemini Developer API. */
export const GEMINI_API_KEY_ENV = 'GEMINI_API_KEY'
/** Cost-conscious Gemini model used for Google Search grounding. */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite'
/** Default SearXNG instance configured by the shipped bundle. */
export const SEARXNG_BASE_URL_ENV = 'SEARXNG_BASE_URL'
/** Settings namespace consumed by the browser card and Host provider. */
export const WEB_SEARCH_MULTI_SETTINGS_NAMESPACE = settingsNamespace('web-search-multi')

/** Cordis plugin name used in loader diagnostics. */
export const name = 'web-search-multi'
/** Host service required by this provider. */
export const inject = ['web', 'credentials']

/** Plugin configuration. Exactly one backend is active for each plugin row. */
export interface Config {
  readonly provider?: ProviderKind
  readonly requestTimeoutMs?: number
  readonly searxng?: SearxngConfig
  readonly brave?: BraveConfig
  readonly tavily?: TavilyConfig
  readonly gemini?: GeminiConfig
  readonly wikipedia?: WikipediaConfig
}

const SearxngSchema: z<SearxngConfig> = z.object({
  baseURL: z.string(),
  language: z.string().default('all'),
  categories: z.string(),
  safeSearch: z.union([0, 1, 2] as const).default(1),
})

const BraveSchema: z<BraveConfig> = z.object({
  apiKeyEnv: z.string().role('credential-ref').default(BRAVE_API_KEY_ENV),
  country: z.string(),
  searchLanguage: z.string(),
  safeSearch: z.union(['off', 'moderate', 'strict'] as const).default('moderate'),
})

const TavilySchema: z<TavilyConfig> = z.object({
  apiKeyEnv: z.string().role('credential-ref').default(TAVILY_API_KEY_ENV),
  searchDepth: z.union(['basic', 'advanced', 'fast', 'ultra-fast'] as const).default('basic'),
  topic: z.union(['general', 'news', 'finance'] as const).default('general'),
})

const GeminiSchema: z<GeminiConfig> = z.object({
  apiKeyEnv: z.string().role('credential-ref').default(GEMINI_API_KEY_ENV),
  model: z.string().default(DEFAULT_GEMINI_MODEL),
})

const WikipediaSchema: z<WikipediaConfig> = z.object({
  language: z.string().default('en'),
})

export const Config: z<Config> = z.object({
  provider: z.union(['searxng', 'brave', 'tavily', 'gemini', 'wikipedia'] as const).default('wikipedia'),
  requestTimeoutMs: z.number().min(1_000).max(55_000).step(1_000).default(DEFAULT_REQUEST_TIMEOUT_MS),
  searxng: SearxngSchema,
  brave: BraveSchema,
  tavily: TavilySchema,
  gemini: GeminiSchema,
  wikipedia: WikipediaSchema,
})

/** Environment lookup used to keep credentials out of Cordis config. */
export type EnvironmentReader = (name: string) => string | undefined

/** Resolve and validate the selected external backend. */
export function createBackend(config: Config, environment: EnvironmentReader, credentials: CredentialReader): SearchBackend {
  const requestTimeoutMs = config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1_000 || requestTimeoutMs > 55_000) {
    throw new TypeError('requestTimeoutMs must be an integer from 1000 through 55000')
  }
  switch (config.provider ?? 'wikipedia') {
    case 'searxng': {
      const settings = config.searxng ?? {}
      const baseURL = settings.baseURL ?? environment(SEARXNG_BASE_URL_ENV) ?? ''
      if (endpointFor(baseURL) === undefined) {
        throw new TypeError('searxng.baseURL or SEARXNG_BASE_URL must be an absolute HTTP(S) URL')
      }
      const language = settings.language ?? 'all'
      if (language.trim().length === 0) throw new TypeError('searxng.language must not be blank')
      if (settings.categories !== undefined && settings.categories.trim().length === 0) {
        throw new TypeError('searxng.categories must not be blank')
      }
      return new SearxngBackend({
        ...settings,
        baseURL,
        language,
        safeSearch: settings.safeSearch ?? 1,
      }, requestTimeoutMs)
    }
    case 'brave': {
      const settings = config.brave ?? {}
      const apiKeyEnv = resolveCredentialReference(settings.apiKeyEnv ?? BRAVE_API_KEY_ENV, 'brave.apiKeyEnv')
      return new BraveBackend(() => credentials(apiKeyEnv), apiKeyEnv, settings, requestTimeoutMs)
    }
    case 'tavily': {
      const settings = config.tavily ?? {}
      const apiKeyEnv = resolveCredentialReference(settings.apiKeyEnv ?? TAVILY_API_KEY_ENV, 'tavily.apiKeyEnv')
      return new TavilyBackend(() => credentials(apiKeyEnv), apiKeyEnv, settings, requestTimeoutMs)
    }
    case 'gemini': {
      const settings = config.gemini ?? {}
      const apiKeyEnv = resolveCredentialReference(settings.apiKeyEnv ?? GEMINI_API_KEY_ENV, 'gemini.apiKeyEnv')
      const model = settings.model ?? DEFAULT_GEMINI_MODEL
      if (!/^[a-z0-9][a-z0-9._-]{0,99}$/.test(model)) {
        throw new TypeError('gemini.model must be a Gemini model id without a path')
      }
      return new GeminiBackend(() => credentials(apiKeyEnv), apiKeyEnv, model, requestTimeoutMs)
    }
    case 'wikipedia': {
      const language = config.wikipedia?.language ?? 'en'
      if (!/^[a-z][a-z0-9-]{0,19}$/.test(language)) {
        throw new TypeError('wikipedia.language must be a lowercase Wikimedia language subdomain')
      }
      return new WikipediaBackend(language, requestTimeoutMs)
    }
  }
}

/** Register the selected backend under the stable provider id. */
export function apply(ctx: Context, config: Config): void {
  const environment: EnvironmentReader = key => launchEnvironmentOf(ctx).get(key)?.value
  const credentials: CredentialReader = async reference => (await ctx.credentials.resolve(credentialRef(reference)))?.value
  let current: () => Config = () => config
  let backend = createBackend(config, environment, credentials)
  const provider: WebSearchProvider = {
    id: PROVIDER_ID,
    available: () => backend.available(),
    search: (request, signal) => backend.search(request, signal),
  }
  ctx.effect(() => ctx.web.registerSearchProvider(provider))

  installSettingsSection(ctx, WEB_SEARCH_MULTI_SETTINGS_NAMESPACE, Config, config, {
    setSource: (source) => {
      current = source
    },
    validate: (candidate) => {
      createBackend(candidate, environment, credentials)
    },
    onChange: () => {
      backend = createBackend(current(), environment, credentials)
    },
  })

  ctx.inject(['webServer', 'settings'], (webCtx) => {
    const snapshot = async () => {
      const active = current()
      return {
        config: configForBrowser(active, environment),
        credentials: {
          brave: await credentialStatus(webCtx, active.brave?.apiKeyEnv ?? BRAVE_API_KEY_ENV),
          tavily: await credentialStatus(webCtx, active.tavily?.apiKeyEnv ?? TAVILY_API_KEY_ENV),
          gemini: await credentialStatus(webCtx, active.gemini?.apiKeyEnv ?? GEMINI_API_KEY_ENV),
        },
      }
    }
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: SETTINGS_PATH,
      handler: settingsHandler({
        read: snapshot,
        test: async (value, apiKey) => {
          const candidate = value as Config
          const key = apiKey?.trim()
          const reference = credentialReferenceFor(candidate)
          if (key !== undefined && key.length > 0 && reference === undefined) {
            throw new TypeError('an API key can only be tested with Brave, Tavily, or Gemini')
          }
          const testCredentials: CredentialReader = async requested => (
            key !== undefined && key.length > 0 && requested === reference ? key : credentials(requested)
          )
          const candidateBackend = createBackend(candidate, environment, testCredentials)
          const startedAt = Date.now()
          const testQuery = (candidate.provider ?? 'wikipedia') === 'gemini'
            ? 'Inspect https://ai.google.dev/gemini-api/docs/url-context'
            : 'DeepSeek'
          const result = await candidateBackend.search({ query: testQuery, maxResults: 1 })
          const firstTitle = result.sources[0]?.title?.slice(0, 120)
          return {
            provider: candidateBackend.kind,
            resultCount: result.sources.length,
            durationMs: Date.now() - startedAt,
            ...firstTitle === undefined ? {} : { firstTitle },
          }
        },
        write: async (value, apiKey) => {
          await webCtx.settings.update(WEB_SEARCH_MULTI_SETTINGS_NAMESPACE, value as Config)
          if (apiKey !== undefined && apiKey.trim().length > 0) {
            const reference = credentialReferenceFor(current())
            if (reference === undefined) throw new TypeError('an API key can only be stored for Brave, Tavily, or Gemini')
            await webCtx.credentials.set(credentialRef(reference), apiKey.trim())
          }
          return snapshot()
        },
      }),
    }), 'web-search-multi: browser settings route')
  })
}

function configForBrowser(config: Config, environment: EnvironmentReader): Config {
  return {
    provider: config.provider ?? 'wikipedia',
    requestTimeoutMs: config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    searxng: {
      baseURL: config.searxng?.baseURL ?? environment(SEARXNG_BASE_URL_ENV) ?? '',
      language: config.searxng?.language ?? 'all',
      safeSearch: config.searxng?.safeSearch ?? 1,
      ...config.searxng?.categories === undefined ? {} : { categories: config.searxng.categories },
    },
    brave: {
      apiKeyEnv: config.brave?.apiKeyEnv ?? BRAVE_API_KEY_ENV,
      safeSearch: config.brave?.safeSearch ?? 'moderate',
      ...config.brave?.country === undefined ? {} : { country: config.brave.country },
      ...config.brave?.searchLanguage === undefined ? {} : { searchLanguage: config.brave.searchLanguage },
    },
    tavily: {
      apiKeyEnv: config.tavily?.apiKeyEnv ?? TAVILY_API_KEY_ENV,
      searchDepth: config.tavily?.searchDepth ?? 'basic',
      topic: config.tavily?.topic ?? 'general',
    },
    gemini: {
      apiKeyEnv: config.gemini?.apiKeyEnv ?? GEMINI_API_KEY_ENV,
      model: config.gemini?.model ?? DEFAULT_GEMINI_MODEL,
    },
    wikipedia: { language: config.wikipedia?.language ?? 'en' },
  }
}

function credentialReferenceFor(config: Config): string | undefined {
  switch (config.provider ?? 'wikipedia') {
    case 'brave': return config.brave?.apiKeyEnv ?? BRAVE_API_KEY_ENV
    case 'tavily': return config.tavily?.apiKeyEnv ?? TAVILY_API_KEY_ENV
    case 'gemini': return config.gemini?.apiKeyEnv ?? GEMINI_API_KEY_ENV
    case 'searxng':
    case 'wikipedia': return undefined
  }
}

async function credentialStatus(ctx: Context, reference: string): Promise<{ configured: boolean; writable: boolean }> {
  const status = await ctx.credentials.describe(credentialRef(reference))
  return { configured: status.configured, writable: status.writable }
}

function resolveCredentialReference(value: string, path: string): string {
  try {
    return credentialRef(value)
  } catch (error: unknown) {
    throw new TypeError(`${path} must be a valid DSH credential reference`, { cause: error })
  }
}
