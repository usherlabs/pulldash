<h1>
  <img src="src/browser/logo.svg" alt="pulldash logo" width="40" height="40" align="center">
  Pulldash
</h1>

![GitHub Release](https://img.shields.io/github/v/release/coder/pulldash) ![GitHub License](https://img.shields.io/github/license/coder/pulldash) ![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/coder/pulldash/ci.yml)

Fast, filterable PR review. Entirely client-side.

> [!WARNING]
> Pulldash is WIP. Expect bugs.

## Try It

**Browser**: [pulldash.com](https://pulldash.com). Replace `github.com` with `pulldash.com` in any PR URL.

**Desktop**: [Latest release](https://github.com/coder/pulldash/releases) for Linux, macOS, Windows.

[![Example](./docs/screenshots/overview.png)](https://pulldash.com)

## Features

- **Custom filters**: Add repos and filter by review requests, authored PRs, or all activity.

  ![Filtering PRs](./docs/screenshots/filtering.png)

- **Keyboard-driven**: `j`/`k` to navigate files, arrows for lines, `c` to comment, `s` to submit.

  ![Keybinds](./docs/screenshots/keybind-driven.png)

- **Fast file search**: `Ctrl+K` to fuzzy-find across hundreds of changed files.

  ![Search](./docs/screenshots/search.png)

## Why

- GitHub's review UI is slow (especially for large diffs)
- No central view to filter PRs you care about
- AI tooling has produced more PRs than ever before—making a snappy review UI essential

## How It Works

GitHub's API supports [CORS](https://docs.github.com/en/rest/using-the-rest-api/using-cors-and-jsonp-to-make-cross-origin-requests), so Pulldash runs entirely client-side. No backend proxying your requests.

- **Web Worker pool**: Diff parsing and syntax highlighting run in workers sized to `navigator.hardwareConcurrency`. The main thread stays free for scrolling.

- **Pre-computed navigation**: When a diff loads, we index all navigable lines. Arrow keys are O(1)—no DOM queries.

- **External store**: State lives outside React ([`useSyncExternalStore`](https://react.dev/reference/react/useSyncExternalStore)). Focusing line 5000 doesn't re-render the file tree.

- **Virtualized rendering**: Diffs, file lists, and the command palette only render visible rows.

## Development

```bash
bun install
bun dev
```

## Internal Cloudflare deployment

The internal site runs at **code.internal.fiet.finance** on Worker
`pulldash-internal`, behind the team's existing Cloudflare Access policy.
PostHog is disabled. GitHub requests still go directly from the browser to GitHub;
only device authentication uses the Worker API.

Use Bun 1.4.0 for installs, builds, and tests. Cloudflare's `cf` CLI must run under
Node 22.22.2; do not force it to use the Bun interpreter. The pinned Wrangler
dependency is only the build backend for `cf`, with no Vite migration.

```bash
bun install --frozen-lockfile
bun run check:cloudflare
```

This builds the browser and API, then validates the production deployment without
uploading it or requiring Cloudflare credentials. Build output lives in
`.cloudflare/`. `cloudflare.config.ts` defines the Worker and runtime settings;
`wrangler.config.ts` selects `dist/browser` as the asset source.

### GitHub login

The team's public client ID, `Iv23li2VXQV3ynTftTS5`, lives in
`src/api/github-config.json`. Set `GITHUB_CLIENT_ID` before building to override
it; local and desktop servers also accept that environment variable.
Device flow must be enabled in the app's GitHub settings. No client secret,
private key, or shared GitHub token belongs in the Worker.

For a GitHub App, install it on the repositories the team reviews and grant the
required repository permissions: contents, pull requests, issues, and actions
read/write; checks and commit statuses read. User tokens are limited by both the app's and the user's
permissions; OAuth scopes do not replace GitHub App permissions. See
[GitHub's user access token documentation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app).
The existing personal access token login remains available.
Expiring device-flow tokens are stored with their expiry; once expired, users
sign in again. This deployment does not add automatic token refresh.

### First deployment

1. Authenticate `cf` using a scoped `CLOUDFLARE_API_TOKEN`, or run
   `bun run cf auth login --no-browser` and complete sign-in from your own browser.
   Set `CLOUDFLARE_ACCOUNT_ID` to the account owning the active `fiet.finance` zone.
   Keep tokens in an ignored environment file or your secret manager.
2. Check the account, zone, existing Access policies, identity provider, and any
   existing DNS record for `code.internal.fiet.finance`. Reuse the team's current
   policy; do not replace it with an unrestricted allow policy.
3. Run `bun run deploy:cloudflare:bootstrap`. Bootstrap creates the Worker with no
   custom domain, `workers.dev` route, or preview URL. Omitting `--mode` also
   defaults to this unpublished configuration.
4. Create or reuse a self-hosted Access application protecting this Worker for
   **all traffic**, and attach the existing reusable team policy. Preserve the
   existing identity provider and session settings. Use the Worker ID returned by
   Cloudflare, not its name, for the Access destination. Use `cf cli search` and
   `cf schema` to verify the resource commands before changing account settings.
5. Once Access is attached, run `bun run deploy:cloudflare`. Production mode
   attaches `code.internal.fiet.finance`; Cloudflare provisions its HTTPS
   certificate. Check authorized and unauthorized access before sharing the URL.

The initial bootstrap deployment is in the **Usher Labs** account
(`a8794e19e02cedc4d87baf4008265dd7`). Its initial version is
`5dbf604a-09f4-483d-b7b7-cc6c0253e1fd`, and its Worker ID is
`88d47ee0269d4952a17d1639cf641f12`. Its reserved
`pulldash-internal.usherlabs.workers.dev` hostname and previews are disabled, and
it has no attached custom domains. The supplied
staging token can deploy Workers, but currently exposes no DNS zones, and that
account reports that Access is not enabled.

To wire DNS later, ensure `fiet.finance` is an active zone in this same account
and use a credential with the required zone/domain permissions. Enable Zero
Trust and attach the team Access policy to `pulldash-internal` before publishing.
Then add `code.internal.fiet.finance` under the Worker's **Domains & Routes → Add
Custom Domain**, or run the production deployment command. Cloudflare creates
the DNS record and certificate automatically; no server IP or manual CNAME to
`workers.dev` is needed. If the zone is owned by a different account, deploy the
Worker in that account before attaching the domain. See
[Cloudflare's Custom Domain requirements](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

For the provided dotenvx credential source, inject the token only into the child
process; do not copy it into this repository:

```bash
dotenvx run --redact --strict -f "$HOME/.env" -- bash -c '
  export CLOUDFLARE_API_TOKEN="$USHER_LABS_CLOUDFLARE_STAGING_API_TOKEN"
  export CLOUDFLARE_ACCOUNT_ID="a8794e19e02cedc4d87baf4008265dd7"
  bun run cf auth whoami
'
```

Cloudflare Access admits teammates to the site. Each teammate then authorizes
their own GitHub access. Access protection covers static files and the login API;
the alternative public Worker URLs stay disabled.

### Manual releases and rollback

Add `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` as secrets on
`usherlabs/pulldash`. Scope the token to the deployment account and the Worker and
domain permissions needed to publish it. Access setup is a separate first-release
step; routine deployments must preserve that application and its policies.

After the changes reach `main`, trigger the manual workflow:

```bash
gh workflow run deploy-cloudflare.yml --repo usherlabs/pulldash --ref main
gh run list --repo usherlabs/pulldash --workflow deploy-cloudflare.yml --limit 1
gh run watch <run-id> --repo usherlabs/pulldash --exit-status
```

The workflow runs formatting checks, type checks, tests, a browser/API build, and a
packaging dry run before deploying that exact prebuilt output. Only the publishing
step receives Cloudflare credentials. Pushes and PRs validate packaging but never
publish. Production releases are serialized and restricted to `main`.

After publishing, verify a direct PR URL, `/lib/diff-worker.js`, device login, PAT
login, private PR loading, and rejection of an unauthorized user. No browser
automation is used for this project; browser authentication and review checks
are human smoke tests.

For rollback, use `cf workers deployments list` to identify the previous healthy
Worker version and `cf workers deployments create` to deploy it at 100 percent.
Inspect the installed command help/schema and dry-run the request before applying
it. Rollback changes Worker code and assets; it must leave the domain and Access
policy intact. Keep the previous version ID in the release notes and inspect
Cloudflare Worker/Access logs after a release.

```bash
bun run cf workers deployments list --worker pulldash-internal
bun run cf workers deployments create --worker pulldash-internal \
  --strategy percentage \
  --versions '[{"version_id":"<previous-version-id>","percentage":100}]' \
  --dry-run
```

After reviewing the dry run, repeat the create command without `--dry-run`.

## License

[AGPL](./LICENSE)
