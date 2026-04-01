const TEXT_FILE_EXTENSIONS = [
  ".csv",
  ".css",
  ".htm",
  ".html",
  ".ics",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".sql",
  ".svg",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
];

const TEXT_MIME_FRAGMENTS = [
  "application/javascript",
  "application/json",
  "application/ld+json",
  "application/sql",
  "application/xml",
  "application/x-httpd-php",
  "application/x-javascript",
  "application/x-sh",
  "application/xhtml+xml",
  "image/svg+xml",
  "text/",
];

export interface ExtractCanvasFileTextInput {
  bytes: Uint8Array;
  contentType: string | null;
  fileName: string | null;
  maxCharacters: number;
}

export interface ExtractCanvasFileTextResult {
  text: string;
  extractedAs: "html" | "pdf" | "text";
  truncated: boolean;
  characterCount: number;
}

export function preferredCanvasFileName(file: {
  id?: string;
  filename?: string | null;
  display_name?: string | null;
}): string | null {
  return file.filename ?? file.display_name ?? file.id ?? null;
}

export async function extractTextFromCanvasFile(
  input: ExtractCanvasFileTextInput,
): Promise<ExtractCanvasFileTextResult> {
  if (isPdfFile(input.contentType, input.fileName)) {
    const text = normalizeExtractedText(await extractPdfText(input.bytes));
    return finalizeExtractedText(text, "pdf", input.maxCharacters);
  }

  if (isHtmlFile(input.contentType, input.fileName)) {
    const text = stripHtml(decodeTextBytes(input.bytes, input.contentType));
    return finalizeExtractedText(text, "html", input.maxCharacters);
  }

  if (isTextLikeFile(input.contentType, input.fileName)) {
    const text = normalizeExtractedText(decodeTextBytes(input.bytes, input.contentType));
    return finalizeExtractedText(text, "text", input.maxCharacters);
  }

  const fileLabel = input.fileName ?? "unknown file";
  const typeLabel = input.contentType ?? "unknown content type";
  throw new Error(`Canvas file ${fileLabel} is not a supported text-readable format (${typeLabel})`);
}

function isPdfFile(contentType: string | null, fileName: string | null): boolean {
  return normalizeContentType(contentType) === "application/pdf" || fileName?.toLowerCase().endsWith(".pdf") === true;
}

function isHtmlFile(contentType: string | null, fileName: string | null): boolean {
  const normalizedContentType = normalizeContentType(contentType);
  return (
    normalizedContentType === "text/html" ||
    normalizedContentType === "application/xhtml+xml" ||
    fileName?.toLowerCase().endsWith(".html") === true ||
    fileName?.toLowerCase().endsWith(".htm") === true
  );
}

function isTextLikeFile(contentType: string | null, fileName: string | null): boolean {
  const normalizedContentType = normalizeContentType(contentType);

  if (normalizedContentType && TEXT_MIME_FRAGMENTS.some((fragment) => normalizedContentType.startsWith(fragment))) {
    return true;
  }

  if (!fileName) {
    return false;
  }

  const normalizedFileName = fileName.toLowerCase();
  return TEXT_FILE_EXTENSIONS.some((extension) => normalizedFileName.endsWith(extension));
}

function normalizeContentType(contentType: string | null): string | null {
  if (!contentType) {
    return null;
  }

  const [mimeType] = contentType.split(";", 1);
  return mimeType?.trim().toLowerCase() ?? null;
}

function decodeTextBytes(bytes: Uint8Array, contentType: string | null): string {
  const charset = parseCharset(contentType) ?? "utf-8";

  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function parseCharset(contentType: string | null): string | null {
  if (!contentType) {
    return null;
  }

  const match = contentType.match(/charset=([^;]+)/iu);
  return match?.[1]?.trim().replace(/^"|"$/gu, "").toLowerCase() ?? null;
}

function normalizeExtractedText(value: string): string {
  return value.replace(/\r\n/gu, "\n").replace(/\r/gu, "\n").replace(/[ \t]+\n/gu, "\n").trim();
}

function stripHtml(value: string): string {
  return normalizeExtractedText(
    value
      .replace(/<style[\s\S]*?<\/style>/giu, " ")
      .replace(/<script[\s\S]*?<\/script>/giu, " ")
      .replace(/<[^>]+>/gu, " ")
      .replace(/&nbsp;/gu, " ")
      .replace(/&amp;/gu, "&")
      .replace(/&quot;/gu, "\"")
      .replace(/&#39;/gu, "'")
      .replace(/\s+/gu, " "),
  );
}

function finalizeExtractedText(
  text: string,
  extractedAs: ExtractCanvasFileTextResult["extractedAs"],
  maxCharacters: number,
): ExtractCanvasFileTextResult {
  const characterCount = text.length;

  if (characterCount <= maxCharacters) {
    return {
      text,
      extractedAs,
      truncated: false,
      characterCount,
    };
  }

  const truncatedText =
    maxCharacters <= 3 ? text.slice(0, maxCharacters) : `${text.slice(0, maxCharacters - 3)}...`;

  return {
    text: truncatedText,
    extractedAs,
    truncated: true,
    characterCount,
  };
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: bytes });

  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}
