import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { CanvasApiError } from "../canvas/client.js";

type ToolSchema = z.ZodRawShape;
type ToolArgs<TSchema extends ToolSchema> = z.output<z.ZodObject<TSchema>>;
type JsonToolResult = ReturnType<typeof jsonResponse> | ReturnType<typeof errorResponse>;

export const identifierParam = z.union([z.string(), z.number()]).transform((value) => String(value));
export const limitParam = z.number().int().positive().max(100).default(25);
export const optionalDateParam = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/u, "Expected YYYY-MM-DD or ISO-8601 datetime")
  .optional();

export function registerJsonTool<TSchema extends ToolSchema>(
  server: McpServer,
  name: string,
  description: string,
  schema: TSchema,
  handler: (args: ToolArgs<TSchema>) => Promise<unknown>,
  annotations: ToolAnnotations = {
    readOnlyHint: true,
    openWorldHint: true,
  },
): void {
  const registerTool = server.registerTool.bind(server) as <
    TArgs extends ToolSchema,
  >(
    toolName: string,
    config: {
      description: string;
      inputSchema: TArgs;
      annotations: ToolAnnotations;
    },
    callback: (args: ToolArgs<TArgs>) => Promise<JsonToolResult>,
  ) => void;

  registerTool(name, { description, inputSchema: schema, annotations }, async (args) => {
    try {
      const payload = await handler(args);
      return jsonResponse(payload);
    } catch (error) {
      return errorResponse(error);
    }
  });
}

export function jsonResponse(payload: unknown): {
  content: Array<{ type: "text"; text: string }>;
} {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

export function errorResponse(error: unknown): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  if (error instanceof CanvasApiError) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: error.message,
              status: error.status,
              body: error.body,
            },
            null,
            2,
          ),
        },
      ],
      isError: true,
    };
  }

  if (error instanceof Error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: error.message,
            },
            null,
            2,
          ),
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            error: String(error),
          },
          null,
          2,
        ),
      },
    ],
    isError: true,
  };
}

export function limitItems<TItem>(items: TItem[], limit: number): TItem[] {
  return items.slice(0, limit);
}

export function summarizeDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toISOString();
}

export function startOfTodayIso(): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

export function daysFromNowIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}
