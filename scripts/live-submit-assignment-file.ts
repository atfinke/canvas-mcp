import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { CanvasClient } from "../src/canvas/client.js";
import { loadConfig } from "../src/config.js";
import { handleSubmitAssignmentFileTool } from "../src/tools/courseworkTools.js";

const [courseId, assignmentId, providedFilePath] = process.argv.slice(2);

if (!courseId || !assignmentId) {
  throw new Error(
    "Usage: npm run test:live:submit-file -- <courseId> <assignmentId> [filePath]",
  );
}

const filePath = providedFilePath ?? (await createTimestampFile(courseId, assignmentId));
const client = new CanvasClient(loadConfig(process.env), { requestTimeoutMs: 30_000 });
const result = await handleSubmitAssignmentFileTool(client, {
  courseId,
  assignmentId,
  filePath,
  comment: `Canvas MCP live submission test at ${new Date().toISOString()}`,
  confirmSubmission: true,
});

console.log(
  JSON.stringify(
    {
      submittedFilePath: filePath,
      submittedFileName: basename(filePath),
      ...result,
    },
    null,
    2,
  ),
);

async function createTimestampFile(courseId: string, assignmentId: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "canvas-mcp-submit-"));
  const timestamp = new Date();
  const filePath = join(
    directory,
    `canvas-mcp-submission-${timestamp.toISOString().replace(/[:.]/gu, "-")}.txt`,
  );

  await writeFile(
    filePath,
    [
      "Canvas MCP local file submission test",
      `Created at: ${timestamp.toISOString()}`,
      `Local time: ${timestamp.toString()}`,
      `Course ID: ${courseId}`,
      `Assignment ID: ${assignmentId}`,
      "",
    ].join("\n"),
  );

  return filePath;
}
