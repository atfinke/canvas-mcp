import { spawn } from "node:child_process";
import { stdin as input, stderr as output } from "node:process";
import { createInterface } from "node:readline/promises";

import {
  buildCanvasAuthorizationUrl,
  CANVAS_MOBILE_REDIRECT_URI,
  exchangeCanvasAuthorizationCode,
  extractAuthorizationCode,
  verifyCanvasMobileDomain,
} from "../src/auth/oauth.js";
import { resolveTokenPath, writeStoredOAuthToken } from "../src/auth/tokenStore.js";
import { normalizeCanvasDomain } from "../src/config.js";

function openBrowser(url: string): void {
  const command =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
  });
  child.on("error", () => {
    output.write("Could not open a browser automatically; use the URL above.\n");
  });
  child.unref();
}

async function main(): Promise<void> {
  const rawDomain = process.argv[2] ?? process.env.CANVAS_DOMAIN;

  if (!rawDomain) {
    throw new Error("Usage: npm run auth:login -- <canvas-domain>");
  }

  const domain = normalizeCanvasDomain(rawDomain);
  const mobileConfig = await verifyCanvasMobileDomain(domain);
  const authorizationUrl = buildCanvasAuthorizationUrl(mobileConfig);

  output.write(`Opening Canvas login for ${domain}\n`);
  output.write(`${authorizationUrl}\n\n`);
  openBrowser(authorizationUrl);

  const readline = createInterface({ input, output });

  try {
    output.write("\nAfter login, Safari may show a Canvas \"Page Not Found\" page.\n");
    output.write("Copy the full address bar URL from that page. It should start with:\n");
    output.write(`${CANVAS_MOBILE_REDIRECT_URI}?code=...\n\n`);
    const pastedValue = await readline.question(
      "Paste that URL or just the code here: ",
    );
    const code = extractAuthorizationCode(pastedValue);
    const tokenResponse = await exchangeCanvasAuthorizationCode(mobileConfig, code);

    if (!tokenResponse.refresh_token) {
      throw new Error("Canvas OAuth response did not include a refresh token");
    }

    const tokenPath = resolveTokenPath(process.env.CANVAS_OAUTH_TOKEN_PATH, domain);
    writeStoredOAuthToken(tokenPath, {
      domain,
      baseUrl: mobileConfig.baseUrl,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      canvasRegion: tokenResponse.canvas_region,
      user: tokenResponse.user,
    });

    const userLabel = tokenResponse.user ? ` as ${tokenResponse.user.name}` : "";
    output.write(`Authenticated to ${domain}${userLabel}\n`);
    output.write(`Stored OAuth tokens at ${tokenPath}\n`);
  } finally {
    readline.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  output.write(`${message}\n`);
  process.exit(1);
});
