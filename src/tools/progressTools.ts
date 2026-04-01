import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { CanvasClient } from "../canvas/client.js";
import {
  limitItems,
  limitParam,
  registerJsonTool,
  summarizeDate,
  identifierParam,
} from "./helpers.js";

export function registerProgressTools(server: McpServer, client: CanvasClient): void {
  registerJsonTool(
    server,
    "get_course_grades",
    "Return the current student's grade and score summary for a single course.",
    {
      courseId: identifierParam,
    },
    async ({ courseId }) => {
      const [course, enrollments] = await Promise.all([
        client.getCourse(courseId),
        client.listEnrollments({
          states: ["active", "completed", "current_and_future"],
        }),
      ]);

      const enrollment = enrollments.find((item) => item.course_id === courseId) ?? null;

      return {
        course,
        enrollment,
        grades: enrollment?.grades ?? null,
      };
    },
  );

  registerJsonTool(
    server,
    "get_assignment_grade",
    "Return grade-related fields for the current student's submission on an assignment.",
    {
      courseId: identifierParam,
      assignmentId: identifierParam,
    },
    async ({ courseId, assignmentId }) => {
      const submission = await client.getSubmission(courseId, assignmentId);

      return {
        courseId,
        assignmentId,
        grade: submission.grade ?? null,
        score: submission.score ?? null,
        submittedAt: summarizeDate(submission.submitted_at),
        workflowState: submission.workflow_state ?? null,
        late: submission.late ?? null,
        missing: submission.missing ?? null,
        excused: submission.excused ?? null,
        submission,
      };
    },
  );

  registerJsonTool(
    server,
    "get_missing_submissions",
    "Return assignments that are past due and currently missing for the student.",
    {
      limit: limitParam,
      includePlannerOverrides: z.boolean().default(true),
      includeCourse: z.boolean().default(true),
    },
    async ({ limit, includePlannerOverrides, includeCourse }) => {
      const items = await client.listMissingSubmissions({
        includePlannerOverrides,
        includeCourse,
      });

      return {
        count: items.length,
        items: limitItems(items, limit),
      };
    },
  );

  registerJsonTool(
    server,
    "get_upcoming_assignments",
    "Return the current user's upcoming assignments and calendar-driven coursework.",
    {
      limit: limitParam,
    },
    async ({ limit }) => {
      const items = await client.listUpcomingEvents();

      return {
        count: items.length,
        items: limitItems(items, limit),
      };
    },
  );
}
