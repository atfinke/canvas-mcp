import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { writeStoredOAuthToken } from "../src/auth/tokenStore.js";
import { loadConfig } from "../src/config.js";

test("loadConfig normalizes CANVAS_DOMAIN and reads OAuth tokens from the local token store", () => {
  const directory = mkdtempSync(join(tmpdir(), "canvas-mcp-config-"));
  const tokenPath = join(directory, "token.json");

  try {
    writeStoredOAuthToken(tokenPath, {
      domain: "canvas.northwestern.edu",
      baseUrl: "https://canvas.northwestern.edu",
      accessToken: "stored-access-token",
      refreshToken: "stored-refresh-token",
    });

    const config = loadConfig({
      CANVAS_DOMAIN: "https://canvas.northwestern.edu/api/v1/courses",
      CANVAS_OAUTH_TOKEN_PATH: tokenPath,
    });

    assert.deepEqual(config, {
      domain: "canvas.northwestern.edu",
      baseUrl: "https://canvas.northwestern.edu/api/v1",
      apiToken: "stored-access-token",
      refreshToken: "stored-refresh-token",
      tokenPath,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("loadConfig rejects missing required environment values", () => {
  assert.throws(
    () =>
      loadConfig({
        CANVAS_DOMAIN: "",
      }),
    /Invalid Canvas MCP configuration/u,
  );
});

test("loadConfig rejects missing OAuth tokens", () => {
  const directory = mkdtempSync(join(tmpdir(), "canvas-mcp-config-missing-"));
  const tokenPath = join(directory, "missing.json");

  try {
    assert.throws(
      () =>
        loadConfig({
          CANVAS_DOMAIN: "canvas.northwestern.edu",
          CANVAS_OAUTH_TOKEN_PATH: tokenPath,
        }),
      /OAuth tokens not found/u,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
