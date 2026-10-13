import { bindings, defineConfig } from "cf/config";
import githubConfig from "./src/api/github-config.json" with { type: "json" };

export default defineConfig(({ mode }) => {
  if (mode && mode !== "bootstrap" && mode !== "production") {
    throw new Error(`Unsupported Cloudflare mode: ${mode}`);
  }

  return {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    worker: {
      name: "pulldash-internal",
      compatibilityDate: "2026-10-13",
      entrypoint: "./src/api/api.ts",
      assets: {
        notFoundHandling: "single-page-application",
        runWorkerFirst: ["/api/*"],
      },
      env: {
        GITHUB_CLIENT_ID: bindings.text(
          process.env.GITHUB_CLIENT_ID ?? githubConfig.clientId
        ),
      },
      // Publish a domain only after Access has been attached to the bootstrap Worker.
      domains: mode === "production" ? ["code.internal.fiet.finance"] : [],
      workersDev: false,
      previewUrls: false,
      observability: {
        enabled: true,
        traces: { enabled: true },
      },
    },
  };
});
