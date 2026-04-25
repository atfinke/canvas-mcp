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
        id: "course-123",
        name: "DSGN 465",
        default_view: "syllabus",
        syllabus_body: "<p>Baiju Shah</p>",
      });
    },
  });

  const course = await client.getCourse("course-123");

  assert.equal(requests.length, 1);
  assert.match(requests[0]?.url ?? "", /include%5B%5D=syllabus_body/u);
  assert.equal(course.default_view, "syllabus");
  assert.equal(course.syllabus_body, "<p>Baiju Shah</p>");
});

test("getSyllabus returns the syllabus html field", async () => {
  const requests: string[] = [];
  const client = new CanvasClient(config, {
    fetch: async (input) => {
      const url = String(input);
      requests.push(url);

      return jsonResponse({
        id: "course-123",
        name: "DSGN 465",
        syllabus_body: "<p>Teaching team: Baiju Shah</p>",
      });
    },
  });

  const syllabusBody = await client.getSyllabus("course-123");

  assert.equal(requests.length, 1);
  assert.match(requests[0] ?? "", /\/courses\/course-123\?include%5B%5D=syllabus_body$/u);
  assert.equal(syllabusBody, "<p>Teaching team: Baiju Shah</p>");
});

test("getPage uses the dedicated front_page endpoint when requested", async () => {
  const requests: string[] = [];
  const client = new CanvasClient(config, {
    fetch: async (input) => {
      const url = String(input);
      requests.push(url);

      return jsonResponse({
        page_id: "42",
        title: "Home page",
        url: "home-page",
        front_page: true,
      });
    },
  });

  const page = await client.getPage("235515", "front_page");

  assert.equal(requests.length, 1);
  assert.match(requests[0] ?? "", /\/courses\/235515\/front_page$/u);
  assert.equal(page.front_page, true);
  assert.equal(page.title, "Home page");
});

test("getHomeContent resolves syllabus-backed home views from the course payload", async () => {
  const requests: string[] = [];
  const client = new CanvasClient(config, {
    fetch: async (input) => {
      const url = String(input);
      requests.push(url);

      return jsonResponse({
        id: "course-123",
        name: "DSGN 465",
        default_view: "syllabus",
        syllabus_body: "<p>Baiju Shah</p>",
      });
    },
  });

  const home = await client.getHomeContent("course-123");

  assert.equal(requests.length, 1);
  assert.equal(home.defaultView, "syllabus");
  assert.equal(home.resolvedAs, "syllabus");
  assert.equal(home.syllabusBody, "<p>Baiju Shah</p>");
  assert.equal(home.page, null);
});

test("getHomeContent resolves wiki-backed home views through the front page endpoint", async () => {
  const requests: string[] = [];
  const client = new CanvasClient(config, {
    fetch: async (input) => {
      const url = String(input);
      requests.push(url);

      if (url.includes("/front_page")) {
        return jsonResponse({
          page_id: "99",
          title: "Home page",
          url: "home-page",
          front_page: true,
          body: "<p>Welcome</p>",
        });
      }

      return jsonResponse({
        id: "235515",
        name: "Venture Lab",
        default_view: "wiki",
      });
    },
  });

  const home = await client.getHomeContent("235515");

  assert.equal(requests.length, 2);
  assert.match(requests[0] ?? "", /\/courses\/235515\?/u);
  assert.match(requests[1] ?? "", /\/courses\/235515\/front_page$/u);
  assert.equal(home.defaultView, "wiki");
  assert.equal(home.resolvedAs, "front_page");
  assert.equal(home.page?.front_page, true);
  assert.equal(home.page?.title, "Home page");
  assert.equal(home.syllabusBody, null);
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

test("submitAssignmentFile uploads bytes and submits the uploaded file id", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new CanvasClient(config, {
    fetch: async (input, init) => {
      const url = String(input);
      requests.push({ url, init });

      if (url.includes("/assignments/assignment-123?")) {
        return jsonResponse({
          id: "assignment-123",
          name: "Dev upload test",
          submission_types: ["online_upload"],
        });
      }

      if (url.endsWith("/assignments/assignment-123/submissions/self/files")) {
        assert.equal(init?.method, "POST");
        assert.equal(
          (init.headers as Record<string, string> | undefined)?.Authorization,
          "Bearer test-token",
        );
        const body = init.body as URLSearchParams;
        assert.equal(body.get("name"), "submission.txt");
        assert.equal(body.get("size"), "12");
        assert.equal(body.get("content_type"), "text/plain");

        return jsonResponse({
          upload_url: "https://uploads.example.test/upload",
          upload_params: {
            key: "opaque-key",
            policy: "opaque-policy",
          },
        });
      }

      if (url === "https://uploads.example.test/upload") {
        assert.equal(init?.method, "POST");
        assert.equal(
          (init.headers as Record<string, string> | undefined)?.Authorization,
          undefined,
        );
        const body = init.body as FormData;
        assert.equal(body.get("key"), "opaque-key");
        assert.equal(body.get("policy"), "opaque-policy");
        assert.ok(body.get("file") instanceof Blob);

        return new Response(null, {
          status: 201,
          headers: {
            location:
              "https://canvas.northwestern.edu/api/v1/files/999/create_success?uuid=abc",
          },
        });
      }

      if (url.endsWith("/files/999/create_success?uuid=abc")) {
        assert.equal(init?.method, "GET");
        assert.equal(
          (init.headers as Record<string, string> | undefined)?.Authorization,
          "Bearer test-token",
        );

        return jsonResponse({
          id: "999",
          filename: "submission.txt",
          display_name: "submission.txt",
          content_type: "text/plain",
          size: 12,
        });
      }

      if (url.endsWith("/assignments/assignment-123/submissions")) {
        assert.equal(init?.method, "POST");
        const body = init.body as URLSearchParams;
        assert.equal(body.get("submission[submission_type]"), "online_upload");
        assert.equal(body.get("submission[file_ids][]"), "999");
        assert.equal(body.get("comment[text_comment]"), "timestamp test");

        return jsonResponse({
          assignment_id: "assignment-123",
          user_id: "self",
          submission_type: "online_upload",
          submitted_at: "2026-04-25T20:30:00Z",
          attempt: 1,
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    },
  });

  const result = await client.submitAssignmentFile({
    courseId: "course-123",
    assignmentId: "assignment-123",
    fileName: "submission.txt",
    bytes: new TextEncoder().encode("hello canvas"),
    contentType: "text/plain",
    comment: "timestamp test",
  });

  assert.equal(requests.length, 5);
  assert.equal(result.assignment.id, "assignment-123");
  assert.equal(result.file.id, "999");
  assert.equal(result.submission.submission_type, "online_upload");
  assert.equal(result.submission.submitted_at, "2026-04-25T20:30:00Z");
});

test("submitAssignmentFile rejects assignments that do not accept file uploads", async () => {
  let requestCount = 0;
  const client = new CanvasClient(config, {
    fetch: async () => {
      requestCount += 1;
      return jsonResponse({
        id: "assignment-123",
        name: "Text-only assignment",
        submission_types: ["online_text_entry"],
      });
    },
  });

  await assert.rejects(
    () =>
      client.submitAssignmentFile({
        courseId: "course-123",
        assignmentId: "assignment-123",
        fileName: "submission.txt",
        bytes: new TextEncoder().encode("hello canvas"),
        contentType: "text/plain",
      }),
    /does not accept online_upload submissions/u,
  );
  assert.equal(requestCount, 1);
});
