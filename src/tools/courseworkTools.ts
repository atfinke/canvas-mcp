import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { CanvasClient } from "../canvas/client.js";
import { identifierParam, limitItems, limitParam, registerJsonTool } from "./helpers.js";

export function registerCourseworkTools(server: McpServer, client: CanvasClient): void {
  registerJsonTool(
    server,
    "list_assignments",
    "List assignments for a course.",
    {
      courseId: identifierParam,
      limit: limitParam,
      upcomingOnly: z.boolean().default(false),
    },
    async ({ courseId, limit, upcomingOnly }) => {
      const items = await client.listAssignments({
        courseId,
        upcomingOnly,
      });

      return {
        courseId,
        count: items.length,
        items: limitItems(items, limit),
      };
    },
  );

  registerJsonTool(
    server,
    "get_assignment",
    "Return a single assignment with student-relevant details and current submission state when available.",
    {
      courseId: identifierParam,
      assignmentId: identifierParam,
    },
    async ({ courseId, assignmentId }) => {
      const assignment = await client.getAssignment(courseId, assignmentId);

      return {
        courseId,
        assignment,
      };
    },
  );

  registerJsonTool(
    server,
    "list_submissions",
    "List the current student's submissions for assignments in a course.",
    {
      courseId: identifierParam,
      limit: limitParam,
    },
    async ({ courseId, limit }) => {
      const items = await client.listSubmissions(courseId);

      return {
        courseId,
        count: items.length,
        items: limitItems(items, limit),
      };
    },
  );

  registerJsonTool(
    server,
    "get_submission",
    "Return the current student's submission for a specific assignment.",
    {
      courseId: identifierParam,
      assignmentId: identifierParam,
    },
    async ({ courseId, assignmentId }) => {
      const submission = await client.getSubmission(courseId, assignmentId);

      return {
        courseId,
        assignmentId,
        submission,
      };
    },
  );
}
