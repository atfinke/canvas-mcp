# Canvas MCP

Minimal TypeScript MCP server for validating a Canvas token and proving out a small read-only Canvas tool surface.

## Attribution

This project was built entirely by OpenAI GPT-5.4 via Codex.

## Current Scope

Read-only student-facing tools across identity, planning, coursework, content, progress, and collaboration.

### Identity

- `get_self`
- `list_courses`
- `get_course`
- `list_enrollments`

### Planning

- `get_dashboard`
- `list_planner_items`
- `list_todo`
- `list_announcements`

### Coursework

- `list_assignments`
- `get_assignment`
- `list_submissions`
- `get_submission`

### Content

- `list_modules`
- `get_module_items`
- `list_pages`
- `get_page`
- `get_syllabus`
- `list_files`
- `get_file`
- `download_file`
- `read_text_file`
- `list_tabs`

### Progress

- `get_course_grades`
- `get_assignment_grade`
- `get_missing_submissions`
- `get_upcoming_assignments`

### Collaboration And Schedule

- `list_discussions`
- `get_discussion`
- `list_groups`
- `get_group`
- `list_calendar_events`
- `get_course_schedule`
- `list_conversations`
- `get_conversation`
- `list_quizzes`
- `get_quiz`
- `list_external_tools`

## Requirements

- Node.js 20+
- A Canvas domain, for example `canvas.northwestern.edu`
- A Canvas bearer token

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in:

   ```bash
   CANVAS_DOMAIN=canvas.northwestern.edu
   CANVAS_API_TOKEN=your-token-here
   ```

3. Start the server in development:

   ```bash
   npm run dev
   ```

4. Build production output:

   ```bash
   npm run build
   npm start
   ```

5. Run local quality checks:

   ```bash
   npm run verify
   ```

6. Run a real Canvas smoke test against a live token:

   ```bash
   npm run test:live
   ```

   To force a preferred validation course for the primary course-scoped checks, set:

   ```bash
   CANVAS_SMOKE_PRIMARY_COURSE_ID=235497
   ```

7. Run a live MCP smoke for file download and text extraction:

   ```bash
   npm run test:live:mcp-files
   ```

## MCP Bundles

The canonical developer path for this project remains local stdio, but the repo also supports MCP Bundle packaging for one-click installation in Claude Desktop and other MCPB-capable desktop clients.

Validate the MCPB manifest:

```bash
npm run mcpb:validate
```

Build a release-ready `.mcpb` artifact:

```bash
npm run mcpb:pack
```

That command builds the server, stages a lean bundle with production dependencies only, validates the manifest, and writes a versioned artifact to `releases/canvas-mcp-<version>.mcpb`.

## GitHub Actions

The repo includes GitHub Actions for both verification and bundle distribution:

- `CI` runs on pushes to `main` and on pull requests. It runs `npm run verify`, validates the MCPB manifest, builds the `.mcpb`, and uploads the bundle as a workflow artifact.
- `Release` runs on tags matching `v*`. It verifies the tag matches `package.json` version, rebuilds the bundle, uploads it as a workflow artifact, and publishes the `.mcpb` to the corresponding GitHub release.

To publish version `0.1.0`, create and push tag `v0.1.0`.

## Notes

- `CANVAS_DOMAIN` should be just the host, not `https://` and not `/api/v1`.
- The server does a startup auth check against `GET /api/v1/users/self?include[]=uuid`.
- The client uses a request timeout and normalizes a few Canvas-specific edge cases such as disabled course features and explicit empty filters.
- `get_course` requests `include[]=syllabus_body`, so course responses include `syllabus_body` when the Canvas course has syllabus content.
- `download_file` saves the file to a local temporary directory and returns the absolute path, checksum, and metadata.
- `read_text_file` supports text-like formats plus PDFs. Other binary formats continue to work through `get_file` and `download_file`.
- `manifest.json` defines the MCPB install flow and prompts users for `CANVAS_DOMAIN` and `CANVAS_API_TOKEN` during desktop extension setup.
- Some Canvas course features are optional. For list-style tools such as pages, discussions, and quizzes, disabled course features are normalized to empty lists instead of hard failures.
- `npm run test:live` probes across active courses so course-specific permissions or disabled features do not create false negatives for unrelated endpoints. `CANVAS_SMOKE_PRIMARY_COURSE_ID` lets you pin the primary course used for the course-scoped checks.
- If you are using an OAuth token captured from the iOS app, it may expire. For a more durable setup, switch to a stable Canvas-issued token or add refresh handling later.

## Example MCP Config

```json
{
  "mcpServers": {
    "canvas": {
      "command": "npm",
      "args": ["run", "start", "--prefix", "/absolute/path/to/canvas-mcp"],
      "env": {
        "CANVAS_DOMAIN": "canvas.northwestern.edu",
        "CANVAS_API_TOKEN": "your-token-here"
      }
    }
  }
}
```
