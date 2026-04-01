import { access, stat } from "node:fs/promises";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { APP_NAME, APP_VERSION } from "../src/meta.js";

type TextContent = {
  type: string;
  text?: string;
};

type Course = {
  id: string;
  name: string;
};

type CanvasFile = {
  id: string;
  filename?: string | null;
  display_name?: string | null;
  content_type?: string | null;
  size?: number | null;
};

type DownloadFilePayload = {
  downloadedPath?: string;
  byteCount?: number;
  contentType?: string | null;
  sha256?: string;
};

type ReadTextFilePayload = {
  extractedAs?: string;
  characterCount?: number;
  truncated?: boolean;
  text?: string;
};

function isToolError(result: unknown): boolean {
  return (result as { isError?: boolean }).isError === true;
}

function parseToolJson<TPayload>(result: unknown): TPayload {
  const content = (result as { content?: TextContent[] }).content;
  const text = content?.find((item) => item.type === "text")?.text;

  if (!text) {
    throw new Error("Tool result did not contain text content");
  }

  return JSON.parse(text) as TPayload;
}

function isTextReadable(file: CanvasFile): boolean {
  const contentType = file.content_type?.toLowerCase() ?? "";
  const fileName = (file.filename ?? file.display_name ?? "").toLowerCase();

  return (
    contentType === "application/pdf" ||
    contentType.startsWith("text/") ||
    contentType.includes("json") ||
    contentType.includes("xml") ||
    contentType.includes("javascript") ||
    contentType.includes("html") ||
    /\.(csv|html?|json|md|pdf|svg|txt|xml|ya?ml)$/u.test(fileName)
  );
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
      name: `${APP_NAME}-mcp-file-smoke`,
      version: APP_VERSION,
    },
    {
      capabilities: {},
    },
  );

  try {
    await client.connect(transport);

    const courseStates = ["active", "completed"] as const;
    const courseMap = new Map<string, Course>();

    for (const state of courseStates) {
      const coursesResult = await client.callTool({
        name: "list_courses",
        arguments: {
          state,
          limit: 100,
        },
      });

      if (isToolError(coursesResult)) {
        continue;
      }

      const coursesPayload = parseToolJson<{ items?: Course[] }>(coursesResult);

      for (const course of coursesPayload.items ?? []) {
        courseMap.set(course.id, course);
      }
    }

    const preferredCourseIds = [
      process.env.CANVAS_FILE_SMOKE_COURSE_ID,
      "65807",
      "235497",
    ].filter((value): value is string => typeof value === "string" && value.length > 0);

    for (const courseId of preferredCourseIds) {
      if (!courseMap.has(courseId)) {
        courseMap.set(courseId, {
          id: courseId,
          name: `Course ${courseId}`,
        });
      }
    }

    const courses = Array.from(courseMap.values());

    let downloadProbe: { course: Course; file: CanvasFile } | null = null;
    let readableProbe: { course: Course; file: CanvasFile } | null = null;

    for (const course of courses) {
      const filesResult = await client.callTool({
        name: "list_files",
        arguments: {
          courseId: course.id,
          limit: 50,
        },
      });

      if (isToolError(filesResult)) {
        continue;
      }

      const filesPayload = parseToolJson<{ items?: CanvasFile[] }>(filesResult);
      const files = filesPayload.items ?? [];

      if (!downloadProbe && files[0]) {
        downloadProbe = {
          course,
          file: files[0],
        };
      }

      if (!readableProbe) {
        const readableFile = files.find(isTextReadable);
        if (readableFile) {
          readableProbe = {
            course,
            file: readableFile,
          };
        }
      }

      if (downloadProbe && readableProbe) {
        break;
      }
    }

    if (!downloadProbe) {
      throw new Error("Unable to find any Canvas files to validate");
    }

    const downloadResult = await client.callTool({
      name: "download_file",
      arguments: {
        fileId: downloadProbe.file.id,
        maxBytes: 10_000_000,
      },
    });

    if (isToolError(downloadResult)) {
      throw new Error("download_file failed");
    }

    const downloadPayload = parseToolJson<DownloadFilePayload>(downloadResult);

    if (!downloadPayload.downloadedPath) {
      throw new Error("download_file did not return a downloadedPath");
    }

    await access(downloadPayload.downloadedPath);
    const downloadedStats = await stat(downloadPayload.downloadedPath);

    if (downloadedStats.size <= 0) {
      throw new Error("download_file saved an empty file");
    }

    let textReadSummary: Record<string, unknown> | null = null;

    if (readableProbe) {
      const readResult = await client.callTool({
        name: "read_text_file",
        arguments: {
          fileId: readableProbe.file.id,
          maxBytes: 10_000_000,
          maxCharacters: 4_000,
        },
      });

      if (isToolError(readResult)) {
        throw new Error("read_text_file failed");
      }

      const readPayload = parseToolJson<ReadTextFilePayload>(readResult);

      if (!readPayload.text || readPayload.text.trim().length === 0) {
        throw new Error("read_text_file returned no text content");
      }

      textReadSummary = {
        courseId: readableProbe.course.id,
        courseName: readableProbe.course.name,
        fileId: readableProbe.file.id,
        fileName: readableProbe.file.filename ?? readableProbe.file.display_name ?? null,
        extractedAs: readPayload.extractedAs ?? null,
        characterCount: readPayload.characterCount ?? null,
        truncated: readPayload.truncated ?? null,
        preview: readPayload.text.slice(0, 240),
      };
    }

    console.log(
      JSON.stringify(
        {
          downloadFile: {
            courseId: downloadProbe.course.id,
            courseName: downloadProbe.course.name,
            fileId: downloadProbe.file.id,
            fileName: downloadProbe.file.filename ?? downloadProbe.file.display_name ?? null,
            contentType: downloadPayload.contentType ?? null,
            byteCount: downloadPayload.byteCount ?? downloadedStats.size,
            sha256: downloadPayload.sha256 ?? null,
            downloadedPath: downloadPayload.downloadedPath,
            savedByteCount: downloadedStats.size,
          },
          readTextFile: textReadSummary,
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
