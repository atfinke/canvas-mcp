import "dotenv/config";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { CanvasClient } from "./canvas/client.js";
import { loadConfig } from "./config.js";
import { APP_NAME } from "./meta.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new CanvasClient(config);

  const self = await client.getSelf();
  console.error(
    `Authenticated to ${config.domain} as ${self.name} (Canvas user ${self.id})`,
  );

  const server = createServer(client);
  const transport = new StdioServerTransport();

  await server.connect(transport);
  console.error(`${APP_NAME} is running on stdio`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
