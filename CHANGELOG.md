# Changelog

## 0.2.2

- Add a default-on Web Search switch below the DSH composer, stored independently for each conversation.
- Hide `web_search` and its prompt guidance when disabled, and deny direct search calls for that conversation; leave `web_fetch` and Grok Build unchanged.

## 0.2.1

- Support DSH 0.1.5-rc.2 by using the current settings service and browser slot APIs.
- Remove the retired client-runtime dependency and declare the browser renderer dependency.
- Verify both keyless Wikipedia and saved-credential Gemini searches against DSH 0.1.5-rc.2.

## 0.2.0

- Add one selectable DSH-native search provider for SearXNG, Wikipedia, Tavily, Brave, and Gemini.
- Add bilingual Web settings, credential-backed API-key editing, and live draft testing.
- Add Gemini Search Grounding with URL Context for explicit HTTP(S) URLs.
- Default new installations to keyless Wikipedia and bound external JSON responses to 2 MiB.
- Align the package and browser client with DSH 0.1.1-rc.2.
