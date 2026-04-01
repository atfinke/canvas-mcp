import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { CanvasClient } from "../canvas/client.js";
import { extractTextFromCanvasFile, preferredCanvasFileName } from "../canvas/fileContent.js";
import { identifierParam, limitItems, limitParam, registerJsonTool } from "./helpers.js";

const maxBytesParam = z.number().int().positive().max(25_000_000).default(10_000_000);
const maxCharactersParam = z.number().int().positive().max(200_000).default(50_000);

export function registerContentTools(server: McpServer, client: CanvasClient): void {
  registerJsonTool(
    server,
    "list_modules",
    "List modules in a course.",
    {
      courseId: identifierParam,
      limit: limitParam,
    },
    async ({ courseId, limit }) => {
      const items = await client.listModules(courseId);

      return {
        courseId,
        count: items.length,
        items: limitItems(items, limit),
      };
    },
  );

  registerJsonTool(
    server,
    "get_module_items",
    "List items inside a specific module.",
    {
      courseId: identifierParam,
      moduleId: identifierParam,
      limit: limitParam,
    },
    async ({ courseId, moduleId, limit }) => {
      const items = await client.listModuleItems(courseId, moduleId);

      return {
        courseId,
        moduleId,
        count: items.length,
        items: limitItems(items, limit),
      };
    },
  );

  registerJsonTool(
    server,
    "list_pages",
    "List wiki pages in a course.",
    {
      courseId: identifierParam,
      limit: limitParam,
    },
    async ({ courseId, limit }) => {
      const items = await client.listPages(courseId);

      return {
        courseId,
        count: items.length,
        items: limitItems(items, limit),
      };
    },
  );

  registerJsonTool(
    server,
    "get_page",
    "Return a course wiki page by page ID or URL slug. Use `front_page` to resolve the course wiki front page through Canvas's dedicated endpoint.",
    {
      courseId: identifierParam,
      pageIdOrUrl: z.string().min(1),
    },
    async ({ courseId, pageIdOrUrl }) => {
      const page = await client.getPage(courseId, pageIdOrUrl);

      return {
        courseId,
        page,
      };
    },
  );

  registerJsonTool(
    server,
    "get_front_page",
    "Return the Canvas wiki front page for a course, if one is set.",
    {
      courseId: identifierParam,
    },
    async ({ courseId }) => {
      const page = await client.getFrontPage(courseId);

      return {
        courseId,
        page,
      };
    },
  );

  registerJsonTool(
    server,
    "get_syllabus",
    "Return the syllabus HTML for a course when Canvas exposes it on the course record.",
    {
      courseId: identifierParam,
    },
    async ({ courseId }) => {
      const syllabusBody = await client.getSyllabus(courseId);

      return {
        courseId,
        syllabusBody,
      };
    },
  );

  registerJsonTool(
    server,
    "get_home_content",
    "Return the effective Canvas Home tab content for a course based on its default view.",
    {
      courseId: identifierParam,
    },
    async ({ courseId }) => {
      const home = await client.getHomeContent(courseId);

      return {
        courseId,
        ...home,
      };
    },
  );

  registerJsonTool(
    server,
    "list_files",
    "List files in a course.",
    {
      courseId: identifierParam,
      limit: limitParam,
      searchTerm: z.string().optional(),
    },
    async ({ courseId, limit, searchTerm }) => {
      const items = await client.listFiles(courseId, searchTerm);

      return {
        courseId,
        count: items.length,
        items: limitItems(items, limit),
      };
    },
  );

  registerJsonTool(
    server,
    "get_file",
    "Return metadata for a single Canvas file.",
    {
      fileId: identifierParam,
    },
    async ({ fileId }) => {
      const file = await client.getFile(fileId);

      return {
        file,
      };
    },
  );

  registerJsonTool(
    server,
    "download_file",
    "Download a Canvas file to a local temporary path and return the saved location plus metadata.",
    {
      fileId: identifierParam,
      maxBytes: maxBytesParam,
    },
    async ({ fileId, maxBytes }) => {
      const download = await client.downloadFile(fileId, { maxBytes });
      const fileName = preferredCanvasFileName(download.file) ?? `canvas-file-${download.file.id}`;
      const downloadedPath = await writeDownloadedFile(fileName, download.bytes);

      return {
        file: download.file,
        contentType: download.contentType,
        byteCount: download.size,
        sha256: createHash("sha256").update(download.bytes).digest("hex"),
        downloadedPath,
        sourceUrl: download.sourceUrl,
      };
    },
    {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
  );

  registerJsonTool(
    server,
    "read_text_file",
    "Read text content from a Canvas file. Supports text-like files and PDFs.",
    {
      fileId: identifierParam,
      maxBytes: maxBytesParam,
      maxCharacters: maxCharactersParam,
    },
    async ({ fileId, maxBytes, maxCharacters }) => {
      const download = await client.downloadFile(fileId, { maxBytes });
      const extracted = await extractTextFromCanvasFile({
        bytes: download.bytes,
        contentType: download.contentType,
        fileName: preferredCanvasFileName(download.file),
        maxCharacters,
      });

      return {
        file: download.file,
        contentType: download.contentType,
        byteCount: download.size,
        extractedAs: extracted.extractedAs,
        characterCount: extracted.characterCount,
        truncated: extracted.truncated,
        text: extracted.text,
      };
    },
  );

  registerJsonTool(
    server,
    "list_tabs",
    "List visible course navigation tabs for a course.",
    {
      courseId: identifierParam,
    },
    async ({ courseId }) => {
      const items = await client.listTabs(courseId);

      return {
        courseId,
        count: items.length,
        items,
      };
    },
  );
}

async function writeDownloadedFile(fileName: string, bytes: Uint8Array): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "canvas-mcp-"));
  const targetPath = join(directory, sanitizeFileName(fileName));
  await writeFile(targetPath, bytes);
  return targetPath;
}

function sanitizeFileName(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9._-]+/gu, "-").replace(/-+/gu, "-").replace(/^-|-$/gu, "");
  return sanitized.length > 0 ? sanitized : "canvas-file";
}
