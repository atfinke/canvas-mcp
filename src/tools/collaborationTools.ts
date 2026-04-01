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

export function registerCollaborationTools(server: McpServer, client: CanvasClient): void {
  registerJsonTool(
    server,
    "list_discussions",
    "List discussion topics in a course.",
    {
      courseId: identifierParam,
      limit: limitParam,
    },
    async ({ courseId, limit }) => {
      const items = await client.listDiscussions(courseId);

      return {
        courseId,
        count: items.length,
        items: limitItems(items, limit),
      };
    },
  );

  registerJsonTool(
    server,
    "get_discussion",
    "Return a single discussion topic.",
    {
      courseId: identifierParam,
      topicId: identifierParam,
    },
    async ({ courseId, topicId }) => {
      const discussion = await client.getDiscussion(courseId, topicId);

      return {
        courseId,
        discussion,
      };
    },
  );

  registerJsonTool(
    server,
    "list_groups",
    "List groups for the current user.",
    {
      limit: limitParam,
    },
    async ({ limit }) => {
      const items = await client.listGroups();

      return {
        count: items.length,
        items: limitItems(items, limit),
      };
    },
  );

  registerJsonTool(
    server,
    "get_group",
    "Return a single group.",
    {
      groupId: identifierParam,
    },
    async ({ groupId }) => {
      const group = await client.getGroup(groupId);

      return {
        group,
      };
    },
  );

  registerJsonTool(
    server,
    "list_calendar_events",
    "List calendar events or assignments for the current user.",
    {
      limit: limitParam,
      type: z.enum(["event", "assignment", "sub_assignment"]).default("event"),
      startDate: optionalDateParam,
      endDate: optionalDateParam,
      courseIds: z.array(identifierParam).optional(),
    },
    async ({ limit, type, startDate, endDate, courseIds }) => {
      const items = await client.listCalendarEvents({
        type,
        startDate: startDate ?? startOfTodayIso(),
        endDate: endDate ?? daysFromNowIso(30),
        contextCodes: courseIds?.map((courseId) => `course_${courseId}`),
      });

      return {
        type,
        count: items.length,
        items: limitItems(items, limit),
      };
    },
  );

  registerJsonTool(
    server,
    "get_course_schedule",
    "Return course-scoped calendar events and assignments for a date range.",
    {
      courseId: identifierParam,
      startDate: optionalDateParam,
      endDate: optionalDateParam,
      limit: limitParam,
    },
    async ({ courseId, startDate, endDate, limit }) => {
      const items = await client.getCourseSchedule({
        courseId,
        startDate: startDate ?? startOfTodayIso(),
        endDate: endDate ?? daysFromNowIso(30),
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
    "list_conversations",
    "List conversations for the current user.",
    {
      limit: limitParam,
    },
    async ({ limit }) => {
      const items = await client.listConversations();

      return {
        count: items.length,
        items: limitItems(items, limit),
      };
    },
  );

  registerJsonTool(
    server,
    "get_conversation",
    "Return a single conversation thread.",
    {
      conversationId: identifierParam,
    },
    async ({ conversationId }) => {
      const conversation = await client.getConversation(conversationId);

      return {
        conversation,
      };
    },
  );

  registerJsonTool(
    server,
    "list_quizzes",
    "List quizzes for a course.",
    {
      courseId: identifierParam,
      limit: limitParam,
    },
    async ({ courseId, limit }) => {
      const items = await client.listQuizzes(courseId);

      return {
        courseId,
        count: items.length,
        items: limitItems(items, limit),
      };
    },
  );

  registerJsonTool(
    server,
    "get_quiz",
    "Return a single quiz.",
    {
      courseId: identifierParam,
      quizId: identifierParam,
    },
    async ({ courseId, quizId }) => {
      const quiz = await client.getQuiz(courseId, quizId);

      return {
        courseId,
        quiz,
      };
    },
  );

  registerJsonTool(
    server,
    "list_external_tools",
    "List external tools configured for a course.",
    {
      courseId: identifierParam,
      limit: limitParam,
      includeParents: z.boolean().default(true),
    },
    async ({ courseId, limit, includeParents }) => {
      const items = await client.listExternalTools({
        courseId,
        includeParents,
      });

      return {
        courseId,
        count: items.length,
        items: limitItems(items, limit),
      };
    },
  );
}
