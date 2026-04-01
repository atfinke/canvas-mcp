import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig } from "../src/config.js";

test("loadConfig normalizes CANVAS_DOMAIN and builds the API base URL", () => {
  const config = loadConfig({
    CANVAS_DOMAIN: "https://canvas.northwestern.edu/api/v1/courses",
    CANVAS_API_TOKEN: "test-token",
  });

  assert.deepEqual(config, {
    domain: "canvas.northwestern.edu",
    baseUrl: "https://canvas.northwestern.edu/api/v1",
    apiToken: "test-token",
  });
});

test("loadConfig rejects missing required environment values", () => {
  assert.throws(
    () =>
      loadConfig({
        CANVAS_DOMAIN: "",
        CANVAS_API_TOKEN: "",
      }),
    /Invalid Canvas MCP configuration/u,
  );
});
