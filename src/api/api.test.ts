import { expect, spyOn, test } from "bun:test";
import api from "./api";

test("device login uses the configured OAuth app and preserves GitHub responses", async () => {
  const requests: { url: string; body: unknown }[] = [];
  const upstream = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1]
      ) => {
        requests.push({
          url: String(input),
          body: JSON.parse(String(init?.body)),
        });
        return Response.json(
          requests.length === 1
            ? {
                device_code: "device-code",
                user_code: "TEAM-CODE",
                interval: 5,
              }
            : requests.length === 2
              ? { error: "authorization_pending" }
              : { access_token: "test-token", expires_in: 28800 }
        );
      },
      { preconnect: () => {} }
    )
  );
  try {
    const env = { GITHUB_CLIENT_ID: "team-client-id" };
    const code = await api.request(
      "/api/auth/device/code",
      { method: "POST" },
      env
    );
    expect(code.status).toBe(200);
    expect(await code.json()).toEqual({
      device_code: "device-code",
      user_code: "TEAM-CODE",
      interval: 5,
    });
    const token = await api.request(
      "/api/auth/device/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_code: "device-code" }),
      },
      env
    );
    expect(token.status).toBe(200);
    expect(await token.json()).toEqual({ error: "authorization_pending" });
    const authorized = await api.request(
      "/api/auth/device/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_code: "device-code" }),
      },
      env
    );
    expect(authorized.status).toBe(200);
    expect(authorized.headers.get("Cache-Control")).toBe("no-store");
    expect(await authorized.json()).toEqual({
      access_token: "test-token",
      expires_in: 28800,
    });
    expect(requests).toEqual([
      {
        url: "https://github.com/login/device/code",
        body: { client_id: "team-client-id", scope: "repo read:user" },
      },
      {
        url: "https://github.com/login/oauth/access_token",
        body: {
          client_id: "team-client-id",
          device_code: "device-code",
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        },
      },
      {
        url: "https://github.com/login/oauth/access_token",
        body: {
          client_id: "team-client-id",
          device_code: "device-code",
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        },
      },
    ]);
    const invalid = await api.request(
      "/api/auth/device/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
      env
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: "device_code is required" });
    expect(requests).toHaveLength(3);
  } finally {
    upstream.mockRestore();
  }
});

test("device login fails clearly without an OAuth client ID", async () => {
  const upstream = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(async () => Response.json({}), { preconnect: () => {} })
  );
  try {
    const response = await api.request(
      "/api/auth/device/code",
      { method: "POST" },
      { GITHUB_CLIENT_ID: "" }
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error:
        "GitHub device login is not configured. Use a personal access token or configure GITHUB_CLIENT_ID.",
    });
    expect(upstream).not.toHaveBeenCalled();
  } finally {
    upstream.mockRestore();
  }
});
