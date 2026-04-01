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

type CalendarEvent = {
  id?: string;
  title?: string;
  start_at?: string | null;
  end_at?: string | null;
  html_url?: string | null;
  context_code?: string | null;
  effective_context_code?: string | null;
  location_name?: string | null;
  all_day?: boolean | null;
};

function parseToolJson<TPayload>(result: unknown): TPayload {
  const content = (result as { content?: TextContent[] }).content;
  const text = content?.find((item) => item.type === "text")?.text;

  if (!text) {
    throw new Error("Tool result did not contain text content");
  }

  return JSON.parse(text) as TPayload;
}

function toCourseId(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const match = value.match(/^course_(.+)$/u);
  return match?.[1] ?? null;
}

function formatLocal(value: string | null | undefined): string | null {
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
      name: `${APP_NAME}-class-times`,
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

    const coursesResult = await client.callTool({
      name: "list_courses",
      arguments: {
        state: "active",
        limit: 100,
      },
    });

    const coursesPayload = parseToolJson<{ items?: Course[] }>(coursesResult);
    const activeCourses = coursesPayload.items ?? [];
    const grouped = new Map<
      string,
      {
        courseId: string;
        courseName: string;
        events: Array<{
          eventId: string | null;
          title: string | null;
          startAt: string | null;
          startAtLocal: string | null;
          endAt: string | null;
          endAtLocal: string | null;
          locationName: string | null;
          allDay: boolean | null;
          htmlUrl: string | null;
        }>;
      }
    >();

    for (const course of activeCourses) {
      const eventsResult = await client.callTool({
        name: "list_calendar_events",
        arguments: {
          limit: 100,
          type: "event",
          courseIds: [course.id],
          startDate: now.toISOString(),
          endDate: end.toISOString(),
        },
      });

      const eventsPayload = parseToolJson<{ items?: CalendarEvent[] }>(eventsResult);
      const events = (eventsPayload.items ?? []).filter((event) => {
        const courseId = toCourseId(event.effective_context_code) ?? toCourseId(event.context_code);
        return courseId === course.id;
      });

      if (events.length === 0) {
        continue;
      }

      grouped.set(course.id, {
        courseId: course.id,
        courseName: course.name,
        events: events.map((event) => ({
          eventId: event.id ?? null,
          title: event.title ?? null,
          startAt: event.start_at ?? null,
          startAtLocal: formatLocal(event.start_at),
          endAt: event.end_at ?? null,
          endAtLocal: formatLocal(event.end_at),
          locationName: event.location_name ?? null,
          allDay: event.all_day ?? null,
          htmlUrl: event.html_url ?? null,
        })),
      });
    }

    const coursesWithEvents = Array.from(grouped.values())
      .map((course) => ({
        ...course,
        events: course.events.sort((left, right) => {
          if (!left.startAt || !right.startAt) {
            return 0;
          }

          return Date.parse(left.startAt) - Date.parse(right.startAt);
        }),
      }))
      .sort((left, right) => {
        const leftDate = left.events[0]?.startAt;
        const rightDate = right.events[0]?.startAt;

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
          courseCount: coursesWithEvents.length,
          eventCount: coursesWithEvents.reduce((sum, course) => sum + course.events.length, 0),
          courses: coursesWithEvents,
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
