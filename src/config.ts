import { z } from "zod";

import { readStoredOAuthToken, resolveTokenPath } from "./auth/tokenStore.js";

const envSchema = z.object({
  CANVAS_DOMAIN: z.string().trim().min(1, "CANVAS_DOMAIN is required"),
  CANVAS_OAUTH_TOKEN_PATH: z.string().trim().optional(),
});

export interface CanvasConfig {
  domain: string;
  baseUrl: string;
  apiToken: string;
  refreshToken: string;
  tokenPath: string;
}

export function normalizeCanvasDomain(rawValue: string): string {
  const trimmed = rawValue.trim();

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const url = new URL(trimmed);
    return url.host;
  }

  return trimmed
    .replace(/^https?:\/\//u, "")
    .replace(/\/.*$/u, "")
    .replace(/\/+$/u, "");
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): CanvasConfig {
  const parsed = envSchema.safeParse(env);

  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid Canvas MCP configuration: ${message}`);
  }

  const domain = normalizeCanvasDomain(parsed.data.CANVAS_DOMAIN);

  if (!domain) {
    throw new Error("Invalid Canvas MCP configuration: CANVAS_DOMAIN resolved to an empty value");
  }

  const tokenPath = resolveTokenPath(parsed.data.CANVAS_OAUTH_TOKEN_PATH, domain);
  const storedToken = readStoredOAuthToken(tokenPath);

  if (!storedToken) {
    throw new Error(
      `Invalid Canvas MCP configuration: OAuth tokens not found. Run npm run auth:login -- ${domain}`,
    );
  }

  if (storedToken.domain !== domain) {
    throw new Error(
      `Invalid Canvas MCP configuration: OAuth token store is for ${storedToken.domain}, not ${domain}`,
    );
  }

  return {
    domain,
    baseUrl: `${storedToken.baseUrl.replace(/\/+$/u, "")}/api/v1`,
    apiToken: storedToken.accessToken,
    refreshToken: storedToken.refreshToken,
    tokenPath,
  };
}
