import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { CanvasClient } from "../canvas/client.js";
import { identifierParam, limitItems, limitParam, registerJsonTool } from "./helpers.js";

const defaultMaxSubmissionFileBytes = 25_000_000;

export interface SubmitAssignmentFileToolInput {
  courseId: string;
  assignmentId: string;
  filePath: string;
  comment?: string;
  contentType?: string;
  maxBytes?: number;
  confirmSubmission?: boolean;
}

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

  registerJsonTool(
    server,
    "submit_assignment_file",
    "Submit a local file to an assignment that accepts Canvas online_upload submissions. Requires confirmSubmission=true.",
    {
      courseId: identifierParam,
      assignmentId: identifierParam,
      filePath: z.string().min(1),
      comment: z.string().optional(),
      contentType: z.string().optional(),
      maxBytes: z.number().int().positive().max(100_000_000).default(defaultMaxSubmissionFileBytes),
      confirmSubmission: z.boolean().default(false),
    },
    async (args) => handleSubmitAssignmentFileTool(client, args),
    {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  );
}

export async function handleSubmitAssignmentFileTool(
  client: CanvasClient,
  input: SubmitAssignmentFileToolInput,
): Promise<Record<string, unknown>> {
  const localFile = await readLocalSubmissionFile(
    input.filePath,
    input.maxBytes ?? defaultMaxSubmissionFileBytes,
    input.contentType,
  );

  if (input.confirmSubmission !== true) {
    const assignment = await client.getAssignment(input.courseId, input.assignmentId);

    return {
      dryRun: true,
      requiresConfirmation: true,
      confirmationField: "confirmSubmission",
      message: "Set confirmSubmission to true to upload and submit this file.",
      courseId: input.courseId,
      assignmentId: input.assignmentId,
      acceptsOnlineUpload: assignment.submission_types?.includes("online_upload") ?? false,
      assignment,
      file: {
        path: input.filePath,
        name: localFile.fileName,
        size: localFile.bytes.byteLength,
        contentType: localFile.contentType,
      },
    };
  }

  const result = await client.submitAssignmentFile({
    courseId: input.courseId,
    assignmentId: input.assignmentId,
    fileName: localFile.fileName,
    bytes: localFile.bytes,
    contentType: localFile.contentType,
    comment: input.comment,
  });

  return {
    dryRun: false,
    courseId: input.courseId,
    assignmentId: input.assignmentId,
    assignment: result.assignment,
    file: result.file,
    submission: result.submission,
  };
}

async function readLocalSubmissionFile(
  filePath: string,
  maxBytes: number,
  contentTypeOverride?: string,
): Promise<{
  fileName: string;
  bytes: Uint8Array;
  contentType: string | null;
}> {
  const fileStats = await stat(filePath);

  if (!fileStats.isFile()) {
    throw new Error(`Submission path is not a file: ${filePath}`);
  }

  if (fileStats.size > maxBytes) {
    throw new Error(`Submission file is ${fileStats.size} bytes, which exceeds the ${maxBytes}-byte limit`);
  }

  const bytes = await readFile(filePath);

  if (bytes.byteLength > maxBytes) {
    throw new Error(`Submission file is ${bytes.byteLength} bytes, which exceeds the ${maxBytes}-byte limit`);
  }

  return {
    fileName: basename(filePath),
    bytes: new Uint8Array(bytes),
    contentType: contentTypeOverride ?? guessContentType(filePath),
  };
}

function guessContentType(filePath: string): string | null {
  switch (extname(filePath).toLowerCase()) {
    case ".csv":
      return "text/csv";
    case ".htm":
    case ".html":
      return "text/html";
    case ".json":
      return "application/json";
    case ".md":
      return "text/markdown";
    case ".pdf":
      return "application/pdf";
    case ".txt":
      return "text/plain";
    case ".xml":
      return "application/xml";
    default:
      return null;
  }
}
