# Security and privacy review

Reviewed on 2026-10-14 for the internal Cloudflare deployment at
`code.internal.fiet.finance`. This document records the current protections and
open hardening work; it is not a penetration test or a guarantee of security.

## Telemetry and data recipients

- PostHog was removed from the application and dependencies. Telemetry calls are
  no-ops in `src/browser/contexts/telemetry.tsx`. No other analytics SDK or
  intentional reporting to the upstream Pulldash operators was found in the
  reviewed source or locally built frontend assets.
- GitHub API requests for PRs, reviews, and file contents go directly from the
  browser to GitHub. Diff parsing and highlighting happen locally in browser
  workers. The application has no server-side repository database.
- Device authorization is proxied through the team's Cloudflare Worker to
  GitHub. The access token returned by GitHub passes through that Worker to the
  browser. Authentication responses use `Cache-Control: no-store`; the
  application does not persist tokens server-side.
- Cloudflare Worker logs and traces remain enabled in the team's account.
  Request URLs, status codes, timings, and related metadata may be recorded.
  Repository identifiers can appear in application URLs. No external
  observability export, Logpush, or tail consumer was configured for this Worker
  at review time. See [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
  and [Workers traces](https://developers.cloudflare.com/workers/observability/traces/).
- PR descriptions and comments can contain external images. Rendering an image
  can send the viewer's IP address and request metadata to its host. The
  application does not intentionally attach GitHub authorization headers to
  those image requests. Some GitHub images are proxied, but the application does
  not enforce a GitHub-only image policy.

## Confirmed deployment protections

- Cloudflare Access protects the Worker, including the site and authentication
  API. Anonymous HTTP probes redirect to the Access login page.
- The configured allow policy requires an email address under `usher.so`.
  The Access session duration is seven days.
- `workers.dev` access and preview URLs are disabled.
- GitHub and the application use HTTPS. Repository permissions are still
  enforced by GitHub independently of the Cloudflare Access policy.
- The configured GitHub client ID is public configuration, not a client secret.

## Open hardening work

1. **Protect GitHub tokens in the browser.** Tokens are stored in `localStorage`
   in `src/browser/contexts/auth.tsx`. JavaScript running on the application's
   origin can read them; an XSS vulnerability could expose them. Tokens can
   remain stored after a Cloudflare Access session ends. Consider memory-only
   storage, or a server-side session with an HttpOnly cookie if stronger token
   isolation is required. See [OWASP storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html#storage-apis).
2. **Clear or isolate private local state.** Normal logout clears the token and
   GitHub request cache. Draft comments, review text, viewed filenames, and tab
   state persist separately in `localStorage`. Their keys are not scoped to the
   GitHub account. Clear sensitive state on logout or isolate it by user, and
   handle token replacement/account switching explicitly.
3. **Restrict rendered content and outbound resources.** Add a Content Security
   Policy and an explicit referrer policy, restrict external images or require
   user consent before loading them, and sanitize GitHub-rendered HTML locally.
   The Markdown path uses `rehype-sanitize`; the pre-rendered HTML path currently
   relies on GitHub's sanitization instead of applying a local sanitizer.
4. **Review permissions and logging.** Verify the team's GitHub App ownership,
   device-flow setting, permissions, and installations. Prefer the minimum
   repository access needed. Decide whether full Worker log/trace sampling is
   necessary and whether URL query strings should be redacted.

## Review scope and limitations

The review covered application source, locally built frontend assets, the active
Worker's API module, Cloudflare deployment settings, Access policy, and anonymous
HTTP probes. It did not inspect an authenticated browser's live network traffic,
download the deployed frontend assets, or verify the GitHub App's permissions in
its management settings. Findings should be revisited after deployment,
authentication, rendering, or dependency changes.
