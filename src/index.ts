/** Configurable web search provider for DeepSeek Harness. */

import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-web'
import { BraveBackend } from './brave.ts'
import { DEFAULT_REQUEST_TIMEOUT_MS } from './http.ts'
import { SearxngBackend, endpointFor } from './searxng.ts'
import { TavilyBackend } from './tavily.ts'
import type { BraveConfig, CredentialReader, ProviderKind, SearchBackend, SearxngConfig, TavilyConfig, WikipediaConfig } from './types.ts'
import { WikipediaBackend } from './wikipedia.ts'

export { BraveBackend } from './brave.ts'
export { SearxngBackend, endpointFor } from './searxng.ts'
export { TavilyBackend } from './tavily.ts'
export type { BraveConfig, CredentialReader, ProviderKind, SearchBackend, SearxngConfig, TavilyConfig, WikipediaConfig } from './types.ts'
export { WikipediaBackend } from './wikipedia.ts'

/** Stable provider id selected by the host `web` service. */
export const PROVIDER_ID = 'configurable-search'
/** Default key environment variable for Brave Search. */
export const BRAVE_API_KEY_ENV = 'BRAVE_SEARCH_API_KEY'
/** Default key environment variable for Tavily. */
export const TAVILY_API_KEY_ENV = 'TAVILY_API_KEY'
/** Default SearXNG instance configured by the shipped bundle. */
export const SEARXNG_BASE_URL_ENV = 'SEARXNG_BASE_URL'

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

const WikipediaSchema: z<WikipediaConfig> = z.object({
  language: z.string().default('en'),
})

export const Config: z<Config> = z.object({
  provider: z.union(['searxng', 'brave', 'tavily', 'wikipedia'] as const).default('searxng'),
  requestTimeoutMs: z.number().min(1_000).max(55_000).step(1_000).default(DEFAULT_REQUEST_TIMEOUT_MS),
  searxng: SearxngSchema,
  brave: BraveSchema,
  tavily: TavilySchema,
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
  switch (config.provider ?? 'searxng') {
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
  const backend = createBackend(
    config,
    key => launchEnvironmentOf(ctx).get(key)?.value,
    async reference => (await ctx.credentials.resolve(credentialRef(reference)))?.value,
  )
  ctx.effect(() => ctx.web.registerSearchProvider(backend))
}

function resolveCredentialReference(value: string, path: string): string {
  try {
    return credentialRef(value)
  } catch (error: unknown) {
    throw new TypeError(`${path} must be a valid DSH credential reference`, { cause: error })
  }
}
