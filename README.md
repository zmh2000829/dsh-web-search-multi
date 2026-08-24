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
| [`gemini`](https://ai.google.dev/gemini-api/docs/google-search) | Yes | Yes | Google AI Pro can redeem monthly Cloud credits | API billing is separate and requires Cloud Billing |

Pricing and quotas can change. Check the provider's current terms before deployment. The plugin sends each query only to the selected provider; it has no implicit fallback or fan-out.

## Requirements

- `dsh` `0.1.1-rc.2`
- Node.js `^22.19` or `>=24`
- No credential for the default Wikipedia backend; a JSON-enabled SearXNG instance or API credential for the other backends

## Install

Recommended npm installation:

```sh
dsh plugin --profile web add dsh-web-search-multi@0.2.0
```

From a local clone for development:

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

The package is a DSH bundle. Installation adds its `cordis.patch.yml`, selects the stable provider id `configurable-search`, and starts with keyless English Wikipedia so the first test works without another service. Select SearXNG, Brave, Tavily, or Gemini in the Web UI when broader web coverage is needed. **The plugin does not install or start SearXNG.**

## Free local SearXNG

The included Compose deployment binds only to localhost and enables JSON output. Start it once from this repository checkout; the container uses `restart: unless-stopped`:

```sh
docker compose -f deploy/searxng/compose.yml up -d
curl -fsS -X POST http://127.0.0.1:8080/search \
  -d 'q=DeepSeek&format=json'
```

If the plugin was installed from GitHub and no checkout exists locally, clone `https://github.com/zmh2000829/dsh-web-search-multi.git`, enter that directory, and run the Compose command above. Stop it with `docker compose -f deploy/searxng/compose.yml down`. Enabling, disabling, or removing the DSH plugin does not start or stop this service.

Do not expose this configuration publicly without adding authentication, rate limiting, a unique secret, and the other protections required by the SearXNG deployment guide.

## Configure

Edit `$DSH_HOME/profiles/web/cordis.patch.yml` (`~/.dsh` is the default home). A profile patch replaces the complete `config` value, so keep every required key shown in the selected example.

All providers accept the top-level `requestTimeoutMs` setting from `1000` through `55000`; its default is `25000`, below the Harness tool deadline.

The same configurations are available as ready-to-use files under `examples/`; use `dsh --profile web --patch examples/wikipedia.patch.yml` for a temporary override.

### Web UI

Open **Settings → Plugins → Plugin configuration → Multi-provider web search**. The card lets you select all five providers, edit provider-specific options, and save Brave, Tavily, or Gemini keys without putting a secret in settings. A saved key goes through DSH credentials and the card receives only its configured/writable status. **Test configuration** runs one real `DeepSeek` query against the current draft without saving first; success reports latency, result count, and the first title, while failure reports the provider error. Provider and option changes apply to the next search without restarting DSH.

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

### Gemini Google Search

The consumer Google AI Pro plan and Gemini API usage tiers are separate. A personal subscription does include Google Developer Program benefits that can grant $10 in monthly Google Cloud credits usable with Cloud services including the Gemini API:

1. Open [Google Developer Program My Benefits](https://developers.google.com/profile/u/me/my-benefits), activate the benefit with the same account as Google AI Pro, and redeem the monthly credit to a Cloud Billing account.
2. In [Google AI Studio](https://aistudio.google.com/app/apikey), create or import a project linked to that billing account, then create an API key.
3. For Prepay billing, AI Studio requires a positive paid balance before promotional credits activate; Google currently commonly requires a minimum $10 prepayment.
4. Select **Gemini (AI Grounded Search)** in the Web card, enter the key, test the draft, then save it.

```yaml
- id: web-search-multi
  config:
    provider: gemini
    gemini:
      apiKeyEnv: GEMINI_API_KEY
      model: gemini-3.5-flash-lite
```

This backend combines a Gemini model with Google Search; it is not a traditional search API. Plain queries enable `google_search`. A query containing a complete HTTP(S) URL also enables `url_context`, so Gemini reads the specified page and uses Google Search only for necessary supporting material. The plugin puts the model's concise answer in DSH search `content` and maps citation text from `groundingSupports` into each source `snippet`, so the Agent receives more than domains and redirect links. The browser test reads Google's official URL Context documentation to verify the key, URL Context, and Search Grounding together.

Google Grounding may return `vertexaisearch.cloud.google.com/grounding-api-redirect/...` citation links. Those are clickable provider citations, not evidence that the plugin selected a different search source. The plugin preserves them instead of bypassing Google's attribution redirect on the server. For file-by-file GitHub comparisons, the Agent should still read or clone the repository; a search summary is not source evidence.

The default model limits token cost. Google currently includes a shared monthly allowance for Gemini 3.x Google Search grounding on the paid tier; model input/output tokens and URL Context page content remain billable, and one API call can issue multiple search queries.

SuperGrok does not include xAI API credit. Grok and the xAI API may share an account, but their billing is separate; the API requires a separately funded `XAI_API_KEY`, so this plugin does not treat a SuperGrok login or subscription quota as an API credential.

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
- External JSON responses are stopped at 2 MiB before parsing.
- API keys are sent only in provider-defined authorization headers and are not included in URLs or results.
- API keys remain in DSH-managed credential storage and are resolved once per search.
- The browser settings and test endpoint accepts only loopback same-origin requests, rejects cross-site writes, caps request bodies, and never returns key values. A newly entered key is used only for that test request and is not written to credential storage.
- The plugin implements search only; it does not enable arbitrary URL fetching.

## Positioning among search plugins

Several marketplace plugins specialize in SearXNG or Tavily, while projects such as [`dsh-websearch`](https://github.com/240xu/dsh-websearch), [`dsh-search-failover`](https://github.com/Walvez/dsh-search-failover), and [`dsh-free-search`](https://github.com/DDDMUC/dsh-free-search) emphasize concurrent fan-out or automatic failover. This plugin deliberately sends each query to exactly one selected backend. That makes network disclosure, quota use, and failure behavior predictable while preserving DSH's native `web_search` tool.

Its distinct combination is self-hosted SearXNG, keyless Wikipedia, Brave, Tavily, and Gemini Search Grounding in one settings card. Gemini queries containing a complete URL additionally use URL Context and map grounded support text into DSH citation snippets. The plugin intentionally provides search only—no hidden fallback, provider-specific model tool, or arbitrary `web_fetch` capability.

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
