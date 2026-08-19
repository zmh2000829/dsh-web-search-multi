# dsh-web-search-multi

English | [中文](README.zh.md)

A configurable [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web-search plugin. It keeps the model-facing `web_search` tool stable while selecting one external backend at configuration time.

## Providers

| Provider | General web | API key | Cost profile | Main limitation |
|---|---:|---:|---|---|
| [`searxng`](https://docs.searxng.org/admin/installation-docker.html) | Yes | No | Free when self-hosted | You operate the instance and its upstream engines |
| [`wikipedia`](https://www.mediawiki.org/wiki/API:Search) | No | No | Free public Wikimedia API | Encyclopedic knowledge only |
| [`tavily`](https://docs.tavily.com/documentation/api-reference/endpoint/search) | Yes | Yes | Free monthly credits, then paid | Account and usage quota |
| [`brave`](https://api-dashboard.search.brave.com/documentation) | Yes | Yes | Monthly credits, then paid | Subscription setup and usage quota |

Pricing and quotas can change. Check the provider's current terms before deployment. The plugin sends each query only to the selected provider; it has no implicit fallback or fan-out.

## Requirements

- `dsh` `0.1.0-rc.7` or newer compatible release
- Node.js `^22.19` or `>=24`
- A JSON-enabled SearXNG instance, or credentials for the selected API provider

## Install

From this checkout:

```sh
npm install
npm run check
dsh plugin --profile web add link:$PWD
```

From GitHub:

```sh
dsh plugin --profile web add github:zmh2000829/dsh-web-search-multi
```

For a Git source install, pnpm may initially block the package's `prepare` build. Follow the `allowBuilds` instruction printed by `dsh`, then repeat the install command.

The package is a DSH bundle. Installation adds its `cordis.patch.yml`, selects the stable provider id `configurable-search`, and defaults to SearXNG at `http://127.0.0.1:8080`.

## Free local SearXNG

The included Compose deployment binds only to localhost and enables JSON output:

```sh
docker compose -f deploy/searxng/compose.yml up -d
curl -fsS -X POST http://127.0.0.1:8080/search \
  -d 'q=DeepSeek&format=json'
```

Do not expose this configuration publicly without adding authentication, rate limiting, a unique secret, and the other protections required by the SearXNG deployment guide.

## Configure

Edit `$DSH_HOME/profiles/web/cordis.patch.yml` (`~/.dsh` is the default home). A profile patch replaces the complete `config` value, so keep every required key shown in the selected example.

All providers accept the top-level `requestTimeoutMs` setting from `1000` through `55000`; its default is `25000`, below the Harness tool deadline.

The same configurations are available as ready-to-use files under `examples/`; use `dsh --profile web --patch examples/wikipedia.patch.yml` for a temporary override.

### Web UI

Open **Settings → Plugins → Plugin configuration → Multi-provider web search**. The card lets you select all four providers, edit provider-specific options, and save Brave or Tavily keys without putting a secret in settings. A saved key goes through DSH credentials and the card receives only its configured/writable status. Provider and option changes apply to the next search without restarting DSH.

The stock **Web search** card belongs to the bundled DeepSeek provider. Use the separately named **Multi-provider web search** card for this plugin.

### SearXNG

```yaml
- id: web-search-multi
  config:
    provider: searxng
    searxng:
      baseURL: http://127.0.0.1:8080
      language: all
      safeSearch: 1
```

`baseURL` can be omitted when `SEARXNG_BASE_URL` is set. Optional `categories` is passed through as a comma-separated SearXNG category list.

### Wikipedia

```yaml
- id: web-search-multi
  config:
    provider: wikipedia
    wikipedia:
      language: zh
```

This uses `https://<language>.wikipedia.org/w/api.php`. It is useful for stable reference knowledge, not current or general web coverage.

### Tavily

```sh
export TAVILY_API_KEY='tvly-...'
```

```yaml
- id: web-search-multi
  config:
    provider: tavily
    tavily:
      apiKeyEnv: TAVILY_API_KEY
      searchDepth: basic
      topic: general
```

`basic` costs fewer credits than `advanced`. The plugin requests neither generated answers nor raw page content.

### Brave Search

```sh
export BRAVE_SEARCH_API_KEY='...'
```

```yaml
- id: web-search-multi
  config:
    provider: brave
    brave:
      apiKeyEnv: BRAVE_SEARCH_API_KEY
      country: US
      searchLanguage: en
      safeSearch: moderate
```

`apiKeyEnv` is a DSH credential reference, not a literal secret. Its value can come from the inherited environment, `$DSH_HOME/.credentials.yaml`, or the DSH provider settings UI. It is resolved for every search, so a rotated key is used without restarting DSH.

## Enable and disable

The bundle enables itself on installation. To disable it without uninstalling:

```yaml
- id: web
  config:
    searchProvider: deepseek-official

- id: web-search-multi
  disabled: true
```

Remove those two overrides to enable the bundle again. To uninstall, first remove profile entries targeting `web-search-multi`, then run:

```sh
dsh plugin --profile web remove dsh-web-search-multi
```

## Verify

```sh
npm run check
dsh --profile web --dump-config | grep -E 'configurable-search|web-search-multi'
dsh web
```

The tests mock every paid API request and verify authentication, credential rotation, request limits, cancellation, internal timeout, response validation, result mapping, and missing-key failures. SearXNG and Wikipedia can also be exercised live without credentials.

## Security and privacy

- Queries leave the machine and are subject to the selected provider's privacy policy.
- Redirects are rejected so a configured or fixed endpoint cannot silently forward a query elsewhere.
- Returned JSON is validated before it reaches DSH.
- API keys are sent only in provider-defined authorization headers and are not included in URLs or results.
- API keys remain in DSH-managed credential storage and are resolved once per search.
- The browser settings endpoint accepts only loopback same-origin requests, rejects cross-site writes, caps request bodies, and never returns key values.
- The plugin implements search only; it does not enable arbitrary URL fetching.

## Compared with AnySearch DSH

[`anysearch-dsh`](https://github.com/anysearch-team/anysearch-dsh) integrates one hosted service and adds service-specific capability and batch-search tools. This plugin instead keeps DSH's native `web_search` surface and lets the operator select among self-hosted, keyless, and API-backed providers. It adopts the same useful operational patterns—per-request DSH credential resolution, bounded HTTP requests, package-content checks, a Node.js CI matrix, and secret scanning—without adding provider-specific tools to the model context.

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
npm run check:package
```

Source files are ESM TypeScript under `src/`; publishable output is generated under `lib/`. CI runs the complete check on Node.js 22.19 and 24, plus a full-history secret scan.

## License

MIT
