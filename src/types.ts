import type { WebSearchProvider } from '@deepseek-ai/dsh-web'

/** Search backends supported by this plugin. */
export type ProviderKind = 'searxng' | 'brave' | 'tavily' | 'wikipedia'

/** Internal provider selected by the plugin configuration. */
export interface SearchBackend extends WebSearchProvider {
  /** Configured external service, used in diagnostics and tests. */
  readonly kind: ProviderKind
}

/** Resolve the current value of a DSH-managed credential reference. */
export type CredentialReader = (reference: string) => Promise<string | undefined>

/** SearXNG configuration. */
export interface SearxngConfig {
  readonly baseURL?: string
  readonly language?: string
  readonly categories?: string
  readonly safeSearch?: 0 | 1 | 2
}

/** Brave Search API configuration. */
export interface BraveConfig {
  readonly apiKeyEnv?: string
  readonly country?: string
  readonly searchLanguage?: string
  readonly safeSearch?: 'off' | 'moderate' | 'strict'
}

/** Tavily Search API configuration. */
export interface TavilyConfig {
  readonly apiKeyEnv?: string
  readonly searchDepth?: 'basic' | 'advanced' | 'fast' | 'ultra-fast'
  readonly topic?: 'general' | 'news' | 'finance'
}

/** Wikipedia Action API configuration. */
export interface WikipediaConfig {
  readonly language?: string
}
