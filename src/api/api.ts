import { Hono } from "hono";
import githubConfig from "./github-config.json";

// ============================================================================
// GitHub device-flow configuration
// ============================================================================

// The public client ID is shared with Cloudflare configuration.
// OAuth Apps use scopes; GitHub Apps use their configured permissions and installations.
type Bindings = { GITHUB_CLIENT_ID?: string };

// ============================================================================
// API Routes
// ============================================================================

const api = new Hono<{
  Bindings: Bindings;
  Variables: { githubClientId: string };
}>()
  .basePath("/api")
  .use("/auth/device/*", async (c, next) => {
    // Workers supply bindings; the local and desktop servers use environment variables.
    const clientId =
      c.env?.GITHUB_CLIENT_ID ??
      (typeof process !== "undefined"
        ? process.env.GITHUB_CLIENT_ID
        : undefined) ??
      githubConfig.clientId;
    if (!clientId?.trim()) {
      return c.json(
        {
          error:
            "GitHub device login is not configured. Use a personal access token or configure GITHUB_CLIENT_ID.",
        },
        503
      );
    }
    c.set("githubClientId", clientId.trim());
    c.header("Cache-Control", "no-store");
    await next();
  })

  // Device Authorization - Step 1: Request device code
  // Proxies to GitHub since their endpoint doesn't support CORS
  // For OAuth Apps, we request scopes here. 'repo' gives full access to
  // private repos - same as what the GitHub CLI uses.
  .post("/auth/device/code", async (c) => {
    try {
      const response = await fetch("https://github.com/login/device/code", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: c.get("githubClientId"),
          scope: "repo read:user",
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return c.json(
          { error: "Failed to initiate device authorization", details: error },
          500
        );
      }

      const data = await response.json();
      return c.json(data);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500);
    }
  })

  // Device Authorization - Step 2: Poll for access token
  // Proxies to GitHub since their endpoint doesn't support CORS
  .post("/auth/device/token", async (c) => {
    try {
      const body = await c.req.json();
      const { device_code } = body;

      if (!device_code) {
        return c.json({ error: "device_code is required" }, 400);
      }

      const response = await fetch(
        "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            client_id: c.get("githubClientId"),
            device_code,
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        return c.json(
          { error: "Failed to get access token", details: error },
          500
        );
      }

      const data = await response.json();
      return c.json(data);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500);
    }
  });

export default api;
export type AppType = typeof api;
