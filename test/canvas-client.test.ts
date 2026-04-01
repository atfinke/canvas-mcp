import assert from "node:assert/strict";
import test from "node:test";

import { CanvasClient } from "../src/canvas/client.js";
import type { CanvasConfig } from "../src/config.js";
import { USER_AGENT } from "../src/meta.js";

const config: CanvasConfig = {
  domain: "canvas.northwestern.edu",
  baseUrl: "https://canvas.northwestern.edu/api/v1",
  apiToken: "test-token",
};

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
}

test("listCourses follows Canvas pagination links", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new CanvasClient(config, {
    fetch: async (input, init) => {
      const url = String(input);
      requests.push({ url, init });

      if (url.endsWith("page=2")) {
        return jsonResponse([{ id: "2", name: "Course 2" }]);
      }

      return jsonResponse([{ id: "1", name: "Course 1" }], {
        headers: {
          link: '<https://canvas.northwestern.edu/api/v1/courses?page=2>; rel="next"',
        },
      });
    },
  });

  const courses = await client.listCourses("active");

  assert.equal(courses.length, 2);
  assert.equal(courses[0]?.id, "1");
  assert.equal(courses[1]?.id, "2");
  assert.equal(requests.length, 2);
  assert.match(requests[0]?.url ?? "", /enrollment_state=active/u);
  assert.equal(
    (requests[0]?.init?.headers as Record<string, string> | undefined)?.Authorization,
    "Bearer test-token",
  );
  assert.equal(
    (requests[0]?.init?.headers as Record<string, string> | undefined)?.["User-Agent"],
    USER_AGENT,
  );
});

test("getCourse requests syllabus_body and returns it when available", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new CanvasClient(config, {
    fetch: async (input, init) => {
      const url = String(input);
      requests.push({ url, init });

      return jsonResponse({
        id: "251315",
        name: "DSGN 465",
        syllabus_body: "<p>Baiju Shah</p>",
      });
    },
  });

  const course = await client.getCourse("251315");

  assert.equal(requests.length, 1);
  assert.match(requests[0]?.url ?? "", /include%5B%5D=syllabus_body/u);
  assert.equal(course.syllabus_body, "<p>Baiju Shah</p>");
});

test("getSyllabus returns the syllabus html field", async () => {
  const requests: string[] = [];
  const client = new CanvasClient(config, {
    fetch: async (input) => {
      const url = String(input);
      requests.push(url);

      return jsonResponse({
        id: "251315",
        name: "DSGN 465",
        syllabus_body: "<p>Teaching team: Baiju Shah</p>",
      });
    },
  });

  const syllabusBody = await client.getSyllabus("251315");

  assert.equal(requests.length, 1);
  assert.match(requests[0] ?? "", /\/courses\/251315\?include%5B%5D=syllabus_body$/u);
  assert.equal(syllabusBody, "<p>Teaching team: Baiju Shah</p>");
});

test("listAnnouncements returns an empty result when there are no active courses", async () => {
  let requestCount = 0;
  const client = new CanvasClient(config, {
    fetch: async () => {
      requestCount += 1;
      return jsonResponse([]);
    },
  });

  const announcements = await client.listAnnouncements({});

  assert.deepEqual(announcements, []);
  assert.equal(requestCount, 1);
});

test("listQuizzes normalizes disabled course features to an empty list", async () => {
  const client = new CanvasClient(config, {
    fetch: async () =>
      new Response("Not found", {
        status: 404,
        statusText: "Not Found",
      }),
  });

  const quizzes = await client.listQuizzes("123");

  assert.deepEqual(quizzes, []);
});

test("listPlannerItems treats an explicit empty course filter as an empty result", async () => {
  let called = false;
  const client = new CanvasClient(config, {
    fetch: async () => {
      called = true;
      return jsonResponse([]);
    },
  });

  const items = await client.listPlannerItems({
    courseIds: [],
  });

  assert.deepEqual(items, []);
  assert.equal(called, false);
});

test("CanvasClient surfaces request timeouts clearly", async () => {
  const client = new CanvasClient(config, {
    requestTimeoutMs: 5,
    fetch: (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      }),
  });

  await assert.rejects(() => client.getSelf(), /timed out after 5ms/u);
});

test("downloadFile fetches metadata and file bytes", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fileBytes = Uint8Array.of(1, 2, 3, 4);
  const client = new CanvasClient(config, {
    fetch: async (input, init) => {
      const url = String(input);
      requests.push({ url, init });

      if (url.endsWith("/files/123")) {
        return jsonResponse({
          id: "123",
          filename: "syllabus.pdf",
          content_type: "application/pdf",
          size: 4,
          url: "https://canvas-files.example.test/download/123",
        });
      }

      return new Response(fileBytes, {
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-length": String(fileBytes.byteLength),
        },
      });
    },
  });

  const download = await client.downloadFile("123", { maxBytes: 10 });

  assert.equal(requests.length, 2);
  assert.equal(
    (requests[1]?.init?.headers as Record<string, string> | undefined)?.Accept,
    "*/*",
  );
  assert.deepEqual(Array.from(download.bytes), [1, 2, 3, 4]);
  assert.equal(download.contentType, "application/pdf");
  assert.equal(download.size, 4);
  assert.equal(download.sourceUrl, "https://canvas-files.example.test/download/123");
});

test("downloadFile rejects files that exceed the byte limit", async () => {
  const client = new CanvasClient(config, {
    fetch: async (input) => {
      const url = String(input);

      if (url.endsWith("/files/123")) {
        return jsonResponse({
          id: "123",
          filename: "large.pdf",
          content_type: "application/pdf",
          size: 50,
          url: "https://canvas-files.example.test/download/123",
        });
      }

      return new Response(Uint8Array.of(1, 2, 3, 4), {
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-length": "50",
        },
      });
    },
  });

  await assert.rejects(
    () => client.downloadFile("123", { maxBytes: 10 }),
    /exceeds the 10-byte limit/u,
  );
});
