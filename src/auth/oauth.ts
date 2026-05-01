import { z } from "zod";

export const CANVAS_MOBILE_VERIFY_URL = "https://sso.canvaslms.com/api/v1/mobile_verify.json";
export const CANVAS_MOBILE_REDIRECT_URI = "https://sso.canvaslms.com/canvas/login";
export const CANVAS_STUDENT_USER_AGENT = "iCanvas/8.9.0 (31072) iPhone/iOS 26.4.2";

const MobileVerifyResponseSchema = z.object({
  authorized: z.boolean(),
  result: z.number(),
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
  base_url: z.string().url(),
});

const OAuthUserSchema = z.object({
  id: z.coerce.string(),
  name: z.string(),
  global_id: z.coerce.string().optional(),
  effective_locale: z.string().optional(),
  fake_student: z.boolean().optional(),
});

export const CanvasOAuthTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  refresh_token: z.string().min(1).optional(),
  canvas_region: z.string().optional(),
  user: OAuthUserSchema.optional(),
});

export type CanvasOAuthTokenResponse = z.infer<typeof CanvasOAuthTokenResponseSchema>;
export type CanvasOAuthUser = z.infer<typeof OAuthUserSchema>;

export interface CanvasMobileConfig {
  domain: string;
  clientId: string;
  clientSecret: string;
  baseUrl: string;
}

export interface CanvasOAuthRequestOptions {
  fetch?: typeof fetch;
  requestTimeoutMs?: number;
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Canvas OAuth request timed out after ${timeoutMs}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function verifyCanvasMobileDomain(
  domain: string,
  options: CanvasOAuthRequestOptions = {},
): Promise<CanvasMobileConfig> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const url = new URL(CANVAS_MOBILE_VERIFY_URL);
  url.searchParams.set("domain", domain);

  const response = await fetchWithTimeout(fetchImpl, url.toString(), {
    headers: {
      Accept: "application/json",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      "User-Agent": CANVAS_STUDENT_USER_AGENT,
    },
  }, options.requestTimeoutMs ?? 15_000);

  if (!response.ok) {
    throw new Error(`Canvas mobile verification failed with ${response.status} ${response.statusText}`);
  }

  const payload = MobileVerifyResponseSchema.parse(await response.json());

  if (!payload.authorized) {
    throw new Error(`Canvas mobile verification rejected ${domain} with result ${payload.result}`);
  }

  return {
    domain,
    clientId: payload.client_id,
    clientSecret: payload.client_secret,
    baseUrl: payload.base_url.replace(/\/+$/u, ""),
  };
}

export function buildCanvasAuthorizationUrl(config: CanvasMobileConfig): string {
  const url = new URL("/login/oauth2/auth", config.baseUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", CANVAS_MOBILE_REDIRECT_URI);
  url.searchParams.set("mobile", "1");
  return url.toString();
}

export function extractAuthorizationCode(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("Authorization code is required");
  }

  try {
    const url = new URL(trimmed);
    const code = url.searchParams.get("code");

    if (code) {
      return code;
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

export async function exchangeCanvasAuthorizationCode(
  config: CanvasMobileConfig,
  code: string,
  options: CanvasOAuthRequestOptions = {},
): Promise<CanvasOAuthTokenResponse> {
  return requestCanvasOAuthToken(
    config,
    {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
    },
    options,
  );
}

export async function refreshCanvasAccessToken(
  config: CanvasMobileConfig,
  refreshToken: string,
  options: CanvasOAuthRequestOptions = {},
): Promise<CanvasOAuthTokenResponse> {
  return requestCanvasOAuthToken(
    config,
    {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    },
    options,
  );
}

async function requestCanvasOAuthToken(
  config: CanvasMobileConfig,
  body: Record<string, string>,
  options: CanvasOAuthRequestOptions,
): Promise<CanvasOAuthTokenResponse> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const url = new URL("/login/oauth2/token", config.baseUrl);
  url.searchParams.set("no_verifiers", "1");

  const response = await fetchWithTimeout(fetchImpl, url.toString(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }, options.requestTimeoutMs ?? 15_000);

  if (!response.ok) {
    const responseText = await response.text();
    const trimmed = responseText.length > 500 ? `${responseText.slice(0, 500)}...` : responseText;
    throw new Error(`Canvas OAuth token request failed with ${response.status} ${response.statusText}: ${trimmed}`);
  }

  return CanvasOAuthTokenResponseSchema.parse(await response.json());
}
