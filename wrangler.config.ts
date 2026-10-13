import { defineWranglerConfig } from "wrangler/experimental-config";

// cf uses Wrangler to bundle the API; the browser assets are built separately with Bun.
export default defineWranglerConfig({
  assetsDirectory: "./dist/browser",
  types: { generate: false },
  sendMetrics: false,
});
