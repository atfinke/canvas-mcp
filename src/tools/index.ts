import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { CanvasClient } from "../canvas/client.js";
import { registerCollaborationTools } from "./collaborationTools.js";
import { registerContentTools } from "./contentTools.js";
import { registerCourseworkTools } from "./courseworkTools.js";
import { registerIdentityTools } from "./identityTools.js";
import { registerPlanningTools } from "./planningTools.js";
import { registerProgressTools } from "./progressTools.js";

export function registerTools(server: McpServer, client: CanvasClient): void {
  registerIdentityTools(server, client);
  registerPlanningTools(server, client);
  registerCourseworkTools(server, client);
  registerContentTools(server, client);
  registerProgressTools(server, client);
  registerCollaborationTools(server, client);
}
