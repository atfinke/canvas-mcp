import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { z } from "zod";

import type { CanvasOAuthUser } from "./oauth.js";

const StoredOAuthTokenSchema = z.object({
  domain: z.string().min(1),
  baseUrl: z.string().url(),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  canvasRegion: z.string().optional(),
  user: z
    .object({
      id: z.coerce.string(),
      name: z.string(),
      global_id: z.coerce.string().optional(),
      effective_locale: z.string().optional(),
      fake_student: z.boolean().optional(),
    })
    .optional(),
  updatedAt: z.string(),
});

export type StoredOAuthToken = z.infer<typeof StoredOAuthTokenSchema>;

export interface WriteStoredOAuthTokenInput {
  domain: string;
  baseUrl: string;
  accessToken: string;
  refreshToken: string;
  canvasRegion?: string;
  user?: CanvasOAuthUser;
}

export function defaultTokenPathForDomain(domain: string): string {
  const safeDomain = domain.replace(/[^A-Za-z0-9.-]/gu, "_");
  return join(homedir(), ".canvas-mcp", "tokens", `${safeDomain}.json`);
}

export function resolveTokenPath(pathValue: string | undefined, domain: string): string {
  if (!pathValue?.trim()) {
    return defaultTokenPathForDomain(domain);
  }

  return resolve(pathValue.trim());
}

export function readStoredOAuthToken(tokenPath: string): StoredOAuthToken | null {
  if (!existsSync(tokenPath)) {
    return null;
  }

  const raw = readFileSync(tokenPath, "utf8");
  return StoredOAuthTokenSchema.parse(JSON.parse(raw) as unknown);
}

export function writeStoredOAuthToken(tokenPath: string, input: WriteStoredOAuthTokenInput): void {
  mkdirSync(dirname(tokenPath), { recursive: true, mode: 0o700 });

  const token: StoredOAuthToken = {
    ...input,
    updatedAt: new Date().toISOString(),
  };

  writeFileSync(tokenPath, `${JSON.stringify(token, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  chmodSync(tokenPath, 0o600);
}
