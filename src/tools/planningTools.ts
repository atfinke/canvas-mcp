import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { CanvasClient } from "../canvas/client.js";
import {
  daysFromNowIso,
  identifierParam,
  limitItems,
  limitParam,
  optionalDateParam,
  registerJsonTool,
  startOfTodayIso,
} from "./helpers.js";

export function registerPlanningTools(server: McpServer, client: CanvasClient): void {
  registerJsonTool(
    server,
    "get_dashboard",
    "Return a student-focused dashboard summary with active courses, TODO counts, and upcoming events.",
    {
      courseLimit: limitParam.default(10),
      eventLimit: limitParam.default(10),
    },
    async ({ courseLimit, eventLimit }) => {
      const [user, courses, todoCount, upcomingEvents] = await Promise.all([
        client.getSelf(),
        client.listCourses("active"),
        client.getTodoCount({ includeUngradedQuizzes: true }),
        client.listUpcomingEvents(),
      ]);

      return {
        user,
        activeCourseCount: courses.length,
        activeCourses: limitItems(courses, courseLimit),
        todoCount,
        upcomingEvents: limitItems(upcomingEvents, eventLimit),
      };
    },
  );

  registerJsonTool(
    server,
    "list_planner_items",
    "List planner items for the current user, optionally filtered to specific courses and dates.",
    {
      limit: limitParam,
      courseIds: z.array(identifierParam).optional(),
      startDate: optionalDateParam,
      endDate: optionalDateParam,
    },
    async ({ limit, courseIds, startDate, endDate }) => {
      const items = await client.listPlannerItems({
        courseIds,
        startDate: startDate ?? startOfTodayIso(),
        endDate: endDate ?? daysFromNowIso(30),
      });

      return {
        count: items.length,
        items: limitItems(items, limit),
      };
    },
  );

  registerJsonTool(
    server,
    "list_todo",
    "List the current user's Canvas TODO items.",
    {
      limit: limitParam,
      includeUngradedQuizzes: z.boolean().default(true),
    },
    async ({ limit, includeUngradedQuizzes }) => {
      const items = await client.listTodo({
        includeUngradedQuizzes,
      });

      return {
        count: items.length,
        items: limitItems(items, limit),
      };
    },
  );

  registerJsonTool(
    server,
    "list_announcements",
    "List announcements across the user's active courses or for specific course IDs.",
    {
      limit: limitParam,
      courseIds: z.array(identifierParam).optional(),
      startDate: optionalDateParam,
      endDate: optionalDateParam,
    },
    async ({ limit, courseIds, startDate, endDate }) => {
      const items = await client.listAnnouncements({
        courseIds,
        startDate: startDate ?? daysFromNowIso(-30),
        endDate: endDate ?? daysFromNowIso(30),
      });

      return {
        count: items.length,
        items: limitItems(items, limit),
      };
    },
  );
}
