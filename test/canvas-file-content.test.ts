import assert from "node:assert/strict";
import test from "node:test";

import { extractTextFromCanvasFile } from "../src/canvas/fileContent.js";

test("extractTextFromCanvasFile strips HTML down to readable text", async () => {
  const bytes = new TextEncoder().encode("<html><body><h1>Hello</h1><p>Canvas <strong>files</strong></p></body></html>");

  const result = await extractTextFromCanvasFile({
    bytes,
    contentType: "text/html; charset=utf-8",
    fileName: "overview.html",
    maxCharacters: 100,
  });

  assert.equal(result.extractedAs, "html");
  assert.equal(result.truncated, false);
  assert.equal(result.text, "Hello Canvas files");
  assert.equal(result.characterCount, "Hello Canvas files".length);
});

test("extractTextFromCanvasFile truncates long text responses", async () => {
  const bytes = new TextEncoder().encode("Canvas MCP keeps the response concise.");

  const result = await extractTextFromCanvasFile({
    bytes,
    contentType: "text/plain; charset=utf-8",
    fileName: "notes.txt",
    maxCharacters: 12,
  });

  assert.equal(result.extractedAs, "text");
  assert.equal(result.truncated, true);
  assert.equal(result.characterCount, "Canvas MCP keeps the response concise.".length);
  assert.equal(result.text, "Canvas MC...");
});

test("extractTextFromCanvasFile rejects unsupported binary formats", async () => {
  await assert.rejects(
    () =>
      extractTextFromCanvasFile({
        bytes: Uint8Array.of(0, 1, 2, 3),
        contentType: "application/zip",
        fileName: "archive.zip",
        maxCharacters: 100,
      }),
    /not a supported text-readable format/u,
  );
});
