# Agent installation guide

This guide is for an agent installing the plugin on a user's existing DSH profile. Preserve the profile's other dependencies and bundle order.

## Safety rules

- Do not clone or edit DeepSeek Harness source code.
- Do not read, print, or copy credential values. Configuration contains credential references only.
- Inspect the current profile before editing it, and verify that unrelated bundle entries remain unchanged afterward.
- Prefer a pinned release or commit for reproducible installations. `main` is suitable for development only.

## Install from GitHub

```sh
dsh plugin --profile web add github:zmh2000829/dsh-web-search-multi
```

If pnpm reports that the Git dependency's build script was blocked, follow its `allowBuilds` instruction and repeat the command. Do not enable unrelated package build scripts.

The bundle selects `configurable-search` and starts with the local SearXNG endpoint `http://127.0.0.1:8080`. Start the included service from a checkout when that endpoint is not already available:

```sh
docker compose -f deploy/searxng/compose.yml up -d
```

## Configure a provider

Edit `$DSH_HOME/profiles/web/cordis.patch.yml` and use one complete configuration from `examples/`. Brave and Tavily use DSH credential references such as `BRAVE_SEARCH_API_KEY`; never insert a literal key into Cordis YAML.

## Verify

```sh
dsh --profile web --dump-config | grep -E 'configurable-search|web-search-multi'
dsh web
```

Confirm that the selected provider returns results, then compare the profile dependency and bundle lists with their pre-install values. Only the `dsh-web-search-multi` entries should be new.

## Remove

Remove profile overrides that target `web-search-multi`, then run:

```sh
dsh plugin --profile web remove dsh-web-search-multi
```
