import { z } from "zod";

const envSchema = z.object({
  CANVAS_DOMAIN: z.string().trim().min(1, "CANVAS_DOMAIN is required"),
  CANVAS_API_TOKEN: z.string().trim().min(1, "CANVAS_API_TOKEN is required"),
});

export interface CanvasConfig {
  domain: string;
  baseUrl: string;
  apiToken: string;
}

function normalizeDomain(rawValue: string): string {
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

  const domain = normalizeDomain(parsed.data.CANVAS_DOMAIN);

  if (!domain) {
    throw new Error("Invalid Canvas MCP configuration: CANVAS_DOMAIN resolved to an empty value");
  }

  return {
    domain,
    baseUrl: `https://${domain}/api/v1`,
    apiToken: parsed.data.CANVAS_API_TOKEN,
  };
}
