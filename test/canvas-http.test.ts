import assert from "node:assert/strict";
import test from "node:test";

import { buildCanvasPath, compareCanvasDates, parseNextLink, toCanvasUrl } from "../src/canvas/http.js";

test("buildCanvasPath serializes arrays and omits nullish values", () => {
  const path = buildCanvasPath("/courses", {
    per_page: 100,
    "include[]": ["term", "tabs"],
    search_term: undefined,
    published: true,
  });

  assert.equal(path, "/courses?per_page=100&include%5B%5D=term&include%5B%5D=tabs&published=true");
});

test("toCanvasUrl preserves absolute URLs and prefixes relative paths", () => {
  assert.equal(
    toCanvasUrl("https://canvas.northwestern.edu/api/v1", "/users/self"),
    "https://canvas.northwestern.edu/api/v1/users/self",
  );

  assert.equal(
    toCanvasUrl("https://canvas.northwestern.edu/api/v1", "https://example.com/next"),
    "https://example.com/next",
  );
});

test("parseNextLink extracts the next pagination URL", () => {
  const linkHeader =
    '<https://canvas.northwestern.edu/api/v1/courses?page=2>; rel="next", <https://canvas.northwestern.edu/api/v1/courses?page=4>; rel="last"';

  assert.equal(
    parseNextLink(linkHeader),
    "https://canvas.northwestern.edu/api/v1/courses?page=2",
  );
  assert.equal(parseNextLink(null), null);
});

test("compareCanvasDates sorts earlier dates first and null values last", () => {
  assert.ok(compareCanvasDates("2026-04-01T12:00:00Z", "2026-04-02T12:00:00Z") < 0);
  assert.ok(compareCanvasDates(null, "2026-04-02T12:00:00Z") > 0);
  assert.equal(compareCanvasDates(null, null), 0);
});
