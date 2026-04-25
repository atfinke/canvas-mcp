import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { CanvasClient } from "../src/canvas/client.js";
import { handleSubmitAssignmentFileTool } from "../src/tools/courseworkTools.js";

test("handleSubmitAssignmentFileTool returns a dry-run summary without submitting", async () => {
  const directory = await mkdtemp(join(tmpdir(), "canvas-mcp-submit-test-"));
  const filePath = join(directory, "submission.txt");
  await writeFile(filePath, "dry run");

  const client = {
    getAssignment: async () => ({
      id: "assignment-123",
      name: "Dev upload test",
      submission_types: ["online_upload"],
    }),
    submitAssignmentFile: async () => {
      throw new Error("submitAssignmentFile should not be called without confirmation");
    },
  } as unknown as CanvasClient;

  const result = await handleSubmitAssignmentFileTool(client, {
    courseId: "course-123",
    assignmentId: "assignment-123",
    filePath,
    confirmSubmission: false,
  });
  const file = result.file as {
    name: string;
    size: number;
    contentType: string | null;
  };
  const assignment = result.assignment as { id: string };

  assert.equal(result.dryRun, true);
  assert.equal(result.requiresConfirmation, true);
  assert.equal(file.name, "submission.txt");
  assert.equal(file.size, 7);
  assert.equal(file.contentType, "text/plain");
  assert.equal(assignment.id, "assignment-123");
});

test("handleSubmitAssignmentFileTool reads a local file before confirmed submission", async () => {
  const directory = await mkdtemp(join(tmpdir(), "canvas-mcp-submit-test-"));
  const filePath = join(directory, "submission.txt");
  await writeFile(filePath, "confirmed upload");

  let submittedFileText: string | null = null;
  const client = {
    submitAssignmentFile: async (input: {
      fileName: string;
      bytes: Uint8Array;
      contentType?: string | null;
    }) => {
      submittedFileText = new TextDecoder().decode(input.bytes);

      return {
        assignment: {
          id: "assignment-123",
          name: "Dev upload test",
          submission_types: ["online_upload"],
        },
        file: {
          id: "999",
          filename: input.fileName,
          content_type: input.contentType ?? undefined,
          size: input.bytes.byteLength,
        },
        submission: {
          assignment_id: "assignment-123",
          submission_type: "online_upload",
          submitted_at: "2026-04-25T20:30:00Z",
          attempt: 1,
        },
      };
    },
  } as unknown as CanvasClient;

  const result = await handleSubmitAssignmentFileTool(client, {
    courseId: "course-123",
    assignmentId: "assignment-123",
    filePath,
    comment: "timestamp test",
    confirmSubmission: true,
  });
  const file = result.file as { id: string };
  const submission = result.submission as { submitted_at: string };

  assert.equal(result.dryRun, false);
  assert.equal(submittedFileText, "confirmed upload");
  assert.equal(file.id, "999");
  assert.equal(submission.submitted_at, "2026-04-25T20:30:00Z");
});
