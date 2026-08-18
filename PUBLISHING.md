# Publishing

1. Update `version` in `package.json` and the client version in `src/http.ts` together.
2. Run `npm ci && npm run check` on a clean checkout.
3. Review `npm pack --dry-run` and confirm that no credentials or local configuration are included.
4. Create an annotated Git tag such as `v0.1.0` from the tested commit.
5. Publish with `npm publish --access public` after configuring npm authentication.

GitHub users can install a release tag with:

```sh
dsh plugin --profile web add github:zmh2000829/dsh-web-search-multi#v0.1.0
```
