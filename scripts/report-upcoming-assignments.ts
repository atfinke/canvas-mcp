import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { APP_NAME, APP_VERSION } from "../src/meta.js";

type TextContent = {
  type: string;
  text?: string;
};

type PlannerItem = {
  course_id?: string | null;
  plannable_id?: string | null;
  plannable_type?: string | null;
  plannable_date?: string | null;
  context_name?: string | null;
};

type AssignmentToolPayload = {
  assignment?: {
    id: string;
    name: string;
    due_at?: string | null;
    unlock_at?: string | null;
    lock_at?: string | null;
    description?: string | null;
    points_possible?: number | null;
    html_url?: string | null;
    submission_types?: string[];
    grading_type?: string | null;
    allowed_attempts?: number | null;
    published?: boolean | null;
    locked_for_user?: boolean | null;
    has_group_assignment?: boolean | null;
    peer_reviews?: boolean | null;
  };
};

type SubmissionToolPayload = {
  submission?: {
    workflow_state?: string | null;
    submission_type?: string | null;
    submitted_at?: string | null;
    score?: number | null;
    grade?: string | null;
    attempt?: number | null;
    late?: boolean | null;
    missing?: boolean | null;
    excused?: boolean | null;
    posted_at?: string | null;
    preview_url?: string | null;
    submission_comments?: Array<{
      comment?: string;
    }>;
  };
};

type AssignmentSummary = {
  assignmentId: string;
  assignmentName: string;
  dueAt: string | null;
  dueAtLocal: string | null;
  unlockAt: string | null;
  lockAt: string | null;
  htmlUrl: string | null;
  descriptionPreview: string | null;
  pointsPossible: number | null;
  submissionTypes: string[];
  gradingType: string | null;
  allowedAttempts: number | null;
  published: boolean | null;
  lockedForUser: boolean | null;
  peerReviews: boolean | null;
  groupAssignment: boolean | null;
  submission: {
    workflowState: string | null;
    submissionType: string | null;
    submittedAt: string | null;
    score: number | null;
    grade: string | null;
    attempt: number | null;
    late: boolean | null;
    missing: boolean | null;
    excused: boolean | null;
    postedAt: string | null;
    previewUrl: string | null;
    commentsCount: number;
    latestComment: string | null;
  };
};

function parseToolJson<TPayload>(result: unknown): TPayload {
  const content = (result as { content?: TextContent[] }).content;
  const text = content?.find((item) => item.type === "text")?.text;
  if (!text) {
    throw new Error("Tool result did not contain text content");
  }

  return JSON.parse(text) as TPayload;
}

function stripHtml(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return value
    .replace(/<style[\s\S]*?<\/style>/giu, " ")
    .replace(/<script[\s\S]*?<\/script>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/gu, " ")
    .replace(/&amp;/gu, "&")
    .replace(/&quot;/gu, "\"")
    .replace(/&#39;/gu, "'")
    .replace(/\s+/gu, " ")
    .trim();
}

function previewText(value: string | null, maxLength = 220): string | null {
  if (!value) {
    return null;
  }

  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

function formatLocal(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

async function main(): Promise<void> {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    cwd: process.cwd(),
    env: {
      CANVAS_DOMAIN: process.env.CANVAS_DOMAIN ?? "",
      CANVAS_API_TOKEN: process.env.CANVAS_API_TOKEN ?? "",
    },
    stderr: "pipe",
  });

  const client = new Client(
    {
      name: `${APP_NAME}-reporter`,
      version: APP_VERSION,
    },
    {
      capabilities: {},
    },
  );

  const now = new Date();
  const end = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  try {
    await client.connect(transport);

    const plannerResult = await client.callTool({
      name: "list_planner_items",
      arguments: {
        limit: 100,
        startDate: now.toISOString(),
        endDate: end.toISOString(),
      },
    });

    const plannerPayload = parseToolJson<{ items?: PlannerItem[] }>(plannerResult);
    const plannerItems = plannerPayload.items ?? [];
    const assignmentItems = plannerItems.filter(
      (item) =>
        item.plannable_type === "assignment" &&
        typeof item.plannable_id === "string" &&
        typeof item.course_id === "string",
    );

    const grouped = new Map<string, { courseId: string; courseName: string; assignments: AssignmentSummary[] }>();

    for (const item of assignmentItems) {
      const courseId = item.course_id as string;
      const assignmentId = item.plannable_id as string;
      const courseName = item.context_name ?? "Unknown course";

      const [assignmentResult, submissionResult] = await Promise.all([
        client.callTool({
          name: "get_assignment",
          arguments: {
            courseId,
            assignmentId,
          },
        }),
        client.callTool({
          name: "get_submission",
          arguments: {
            courseId,
            assignmentId,
          },
        }),
      ]);

      const assignmentPayload = parseToolJson<AssignmentToolPayload>(assignmentResult);
      const submissionPayload = parseToolJson<SubmissionToolPayload>(submissionResult);
      const assignment = assignmentPayload.assignment;
      const submission = submissionPayload.submission;

      if (!assignment) {
        continue;
      }

      const summary: AssignmentSummary = {
        assignmentId,
        assignmentName: assignment.name,
        dueAt: assignment.due_at ?? null,
        dueAtLocal: formatLocal(assignment.due_at ?? null),
        unlockAt: assignment.unlock_at ?? null,
        lockAt: assignment.lock_at ?? null,
        htmlUrl: assignment.html_url ?? null,
        descriptionPreview: previewText(stripHtml(assignment.description ?? null)),
        pointsPossible: assignment.points_possible ?? null,
        submissionTypes: assignment.submission_types ?? [],
        gradingType: assignment.grading_type ?? null,
        allowedAttempts: assignment.allowed_attempts ?? null,
        published: assignment.published ?? null,
        lockedForUser: assignment.locked_for_user ?? null,
        peerReviews: assignment.peer_reviews ?? null,
        groupAssignment: assignment.has_group_assignment ?? null,
        submission: {
          workflowState: submission?.workflow_state ?? null,
          submissionType: submission?.submission_type ?? null,
          submittedAt: submission?.submitted_at ?? null,
          score: submission?.score ?? null,
          grade: submission?.grade ?? null,
          attempt: submission?.attempt ?? null,
          late: submission?.late ?? null,
          missing: submission?.missing ?? null,
          excused: submission?.excused ?? null,
          postedAt: submission?.posted_at ?? null,
          previewUrl: submission?.preview_url ?? null,
          commentsCount: submission?.submission_comments?.length ?? 0,
          latestComment: submission?.submission_comments?.at(-1)?.comment ?? null,
        },
      };

      const existing = grouped.get(courseId) ?? {
        courseId,
        courseName,
        assignments: [],
      };

      existing.assignments.push(summary);
      grouped.set(courseId, existing);
    }

    const courses = Array.from(grouped.values())
      .map((course) => ({
        ...course,
        assignments: course.assignments.sort((left, right) => {
          if (!left.dueAt || !right.dueAt) {
            return 0;
          }

          return Date.parse(left.dueAt) - Date.parse(right.dueAt);
        }),
      }))
      .sort((left, right) => {
        const leftDate = left.assignments[0]?.dueAt;
        const rightDate = right.assignments[0]?.dueAt;

        if (!leftDate || !rightDate) {
          return 0;
        }

        return Date.parse(leftDate) - Date.parse(rightDate);
      });

    console.log(
      JSON.stringify(
        {
          rangeStartIso: now.toISOString(),
          rangeEndIso: end.toISOString(),
          timezone: "America/Chicago",
          courseCount: courses.length,
          assignmentCount: courses.reduce((sum, course) => sum + course.assignments.length, 0),
          courses,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.close();
  }
}

await main();
