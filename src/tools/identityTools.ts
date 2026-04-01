import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { CanvasClient } from "../canvas/client.js";
import { identifierParam, limitItems, limitParam, registerJsonTool } from "./helpers.js";

export function registerIdentityTools(server: McpServer, client: CanvasClient): void {
  registerJsonTool(
    server,
    "get_self",
    "Return the current Canvas user associated with the configured token.",
    {},
    async () => {
      const user = await client.getSelf();

      return {
        user,
      };
    },
  );

  registerJsonTool(
    server,
    "list_courses",
    "List courses for the current user.",
    {
      state: z.enum(["active", "completed", "all"]).default("active"),
      limit: limitParam,
    },
    async ({ state, limit }) => {
      const courses = await client.listCourses(state);

      return {
        state,
        count: courses.length,
        items: limitItems(courses, limit),
      };
    },
  );

  registerJsonTool(
    server,
    "get_course",
    "Return detailed information for a single course.",
    {
      courseId: identifierParam.describe("Canvas course ID."),
    },
    async ({ courseId }) => {
      const course = await client.getCourse(courseId);
      return {
        course,
      };
    },
  );

  registerJsonTool(
    server,
    "list_enrollments",
    "List enrollments for the current user across courses.",
    {
      limit: limitParam,
      states: z
        .array(z.string())
        .default(["active", "invited", "current_and_future", "completed"])
        .describe("Enrollment states to include."),
    },
    async ({ limit, states }) => {
      const enrollments = await client.listEnrollments({ states });

      return {
        count: enrollments.length,
        items: limitItems(enrollments, limit),
      };
    },
  );
}
