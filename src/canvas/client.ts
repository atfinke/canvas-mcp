import { z } from "zod";

import type { CanvasConfig } from "../config.js";
import { USER_AGENT } from "../meta.js";
import { buildCanvasPath, compareCanvasDates, parseNextLink, toCanvasUrl } from "./http.js";
import {
  CanvasAssignmentSchema,
  CanvasAnnouncementSchema,
  CanvasCalendarEventSchema,
  CanvasConversationSchema,
  CanvasCourseSchema,
  CanvasDiscussionTopicSchema,
  CanvasEnrollmentSchema,
  CanvasExternalToolSchema,
  CanvasFileSchema,
  CanvasFileUploadTargetSchema,
  CanvasGroupSchema,
  CanvasMissingSubmissionSchema,
  CanvasModuleItemSchema,
  CanvasModuleSchema,
  CanvasPageSchema,
  CanvasPlannerItemSchema,
  CanvasQuizSchema,
  CanvasSubmissionSchema,
  CanvasTabSchema,
  CanvasTodoCountSchema,
  CanvasTodoItemSchema,
  CanvasUpcomingEventSchema,
  CanvasUserSchema,
  type CanvasAnnouncement,
  type CanvasCalendarEvent,
  type CanvasAssignment,
  type CanvasConversation,
  type CanvasCourse,
  type CanvasDiscussionTopic,
  type CanvasEnrollment,
  type CanvasExternalTool,
  type CanvasFile,
  type CanvasFileUploadTarget,
  type CanvasGroup,
  type CanvasMissingSubmission,
  type CanvasModule,
  type CanvasModuleItem,
  type CanvasPage,
  type CanvasPlannerItem,
  type CanvasQuiz,
  type CanvasSubmission,
  type CanvasTab,
  type CanvasTodoCount,
  type CanvasTodoItem,
  type CanvasUpcomingEvent,
  type CanvasUser,
  type CourseState,
} from "./types.js";

export class CanvasApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "CanvasApiError";
  }
}

export interface CanvasClientOptions {
  fetch?: typeof fetch;
  requestTimeoutMs?: number;
}

export interface DownloadCanvasFileOptions {
  maxBytes?: number;
}

export interface DownloadedCanvasFile {
  file: CanvasFile;
  bytes: Uint8Array;
  size: number;
  contentType: string | null;
  sourceUrl: string;
}

export interface SubmitAssignmentFileInput {
  courseId: string;
  assignmentId: string;
  fileName: string;
  bytes: Uint8Array;
  contentType?: string | null;
  comment?: string;
}

export interface SubmittedAssignmentFile {
  assignment: CanvasAssignment;
  file: CanvasFile;
  submission: CanvasSubmission;
}

export type CanvasHomeContent =
  | {
      course: CanvasCourse;
      defaultView: string | null;
      resolvedAs: "syllabus";
      syllabusBody: string | null;
      page: null;
      note?: undefined;
    }
  | {
      course: CanvasCourse;
      defaultView: string | null;
      resolvedAs: "front_page";
      syllabusBody: null;
      page: CanvasPage;
      note?: undefined;
    }
  | {
      course: CanvasCourse;
      defaultView: string | null;
      resolvedAs: null;
      syllabusBody: null;
      page: null;
      note: string;
    };

const DEFAULT_MAX_DOWNLOAD_BYTES = 10_000_000;

export class CanvasClient {
  private readonly fetchImpl: typeof fetch;
  private readonly requestTimeoutMs: number;

  constructor(
    private readonly config: CanvasConfig,
    options: CanvasClientOptions = {},
  ) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
  }

  async getSelf(): Promise<CanvasUser> {
    return this.requestJson("/users/self?include[]=uuid", CanvasUserSchema);
  }

  async listCourses(state: CourseState): Promise<CanvasCourse[]> {
    return this.requestAllPages(
      buildCanvasPath("/courses", {
        per_page: 100,
        ...(state !== "all" ? { enrollment_state: state } : {}),
        "include[]": ["term"],
      }),
      CanvasCourseSchema,
    );
  }

  async getCourse(courseId: string): Promise<CanvasCourse> {
    return this.getCourseWithIncludes(courseId, [
      "term",
      "permissions",
      "sections",
      "tabs",
      "total_scores",
      "current_grading_period_scores",
      "syllabus_body",
    ]);
  }

  async getSyllabus(courseId: string): Promise<string | null> {
    const course = await this.getCourseWithIncludes(courseId, ["syllabus_body"]);
    return course.syllabus_body ?? null;
  }

  async getHomeContent(courseId: string): Promise<CanvasHomeContent> {
    const course = await this.getCourse(courseId);
    const defaultView = course.default_view ?? null;

    if (defaultView === "syllabus") {
      return {
        course,
        defaultView,
        resolvedAs: "syllabus",
        syllabusBody: course.syllabus_body ?? null,
        page: null,
      };
    }

    if (defaultView === "wiki") {
      const page = await this.getFrontPage(courseId);

      return {
        course,
        defaultView,
        resolvedAs: "front_page",
        syllabusBody: null,
        page,
      };
    }

    return {
      course,
      defaultView,
      resolvedAs: null,
      syllabusBody: null,
      page: null,
      note:
        "Canvas home is configured to a non-document view. Use the course's default_view to decide whether to inspect modules, assignments, or activity instead.",
    };
  }

  async listEnrollments(input: {
    states?: string[];
  }): Promise<CanvasEnrollment[]> {
    return this.requestAllPages(
      buildCanvasPath("/users/self/enrollments", {
        per_page: 100,
        ...(input.states ? { "state[]": input.states } : {}),
      }),
      CanvasEnrollmentSchema,
    );
  }

  async listPlannerItems(input: {
    courseIds?: string[];
    startDate?: string;
    endDate?: string;
  }): Promise<CanvasPlannerItem[]> {
    if (input.courseIds?.length === 0) {
      return [];
    }

    return this.requestAllPages(
      buildCanvasPath("/planner/items", {
        per_page: 100,
        ...(input.startDate ? { start_date: input.startDate } : {}),
        ...(input.endDate ? { end_date: input.endDate } : {}),
        ...(input.courseIds ? { "context_codes[]": input.courseIds.map((courseId) => `course_${courseId}`) } : {}),
      }),
      CanvasPlannerItemSchema,
    );
  }

  async listTodo(input: {
    includeUngradedQuizzes: boolean;
  }): Promise<CanvasTodoItem[]> {
    return this.requestAllPages(
      buildCanvasPath("/users/self/todo", {
        ...(input.includeUngradedQuizzes ? { "include[]": ["ungraded_quizzes"] } : {}),
      }),
      CanvasTodoItemSchema,
    );
  }

  async getTodoCount(input: {
    includeUngradedQuizzes: boolean;
  }): Promise<CanvasTodoCount> {
    return this.requestJson(
      buildCanvasPath("/users/self/todo_item_count", {
        ...(input.includeUngradedQuizzes ? { "include[]": ["ungraded_quizzes"] } : {}),
      }),
      CanvasTodoCountSchema,
    );
  }

  async listUpcomingEvents(): Promise<CanvasUpcomingEvent[]> {
    return this.requestAllPages("/users/self/upcoming_events", CanvasUpcomingEventSchema);
  }

  async listAnnouncements(input: {
    courseIds?: string[];
    startDate?: string;
    endDate?: string;
  }): Promise<CanvasAnnouncement[]> {
    const courseIds = input.courseIds ?? (await this.listCourses("active")).map((course) => course.id);

    if (courseIds.length === 0) {
      return [];
    }

    return this.requestAllPages(
      buildCanvasPath("/announcements", {
        per_page: 100,
        "context_codes[]": courseIds.map((courseId) => `course_${courseId}`),
        ...(input.startDate ? { start_date: input.startDate } : {}),
        ...(input.endDate ? { end_date: input.endDate } : {}),
      }),
      CanvasAnnouncementSchema,
    );
  }

  async listAssignments(input: {
    courseId: string;
    upcomingOnly: boolean;
  }): Promise<CanvasAssignment[]> {
    const assignments = await this.requestAllPages(
      buildCanvasPath(`/courses/${encodeURIComponent(input.courseId)}/assignments`, {
        per_page: 100,
        order_by: "due_at",
        scope_assignments_to_student: true,
        "include[]": ["submission"],
      }),
      CanvasAssignmentSchema,
    );

    const now = Date.now();

    const filtered = input.upcomingOnly
      ? assignments.filter((assignment) => {
          if (!assignment.due_at) {
            return false;
          }

          const dueAt = Date.parse(assignment.due_at);
          return Number.isFinite(dueAt) && dueAt >= now;
        })
      : assignments;

    return filtered.sort((left, right) => compareCanvasDates(left.due_at, right.due_at));
  }

  async getAssignment(courseId: string, assignmentId: string): Promise<CanvasAssignment> {
    return this.requestJson(
      buildCanvasPath(`/courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(assignmentId)}`, {
        "include[]": ["submission", "score_statistics", "checkpoints", "can_submit"],
      }),
      CanvasAssignmentSchema,
    );
  }

  async listSubmissions(courseId: string): Promise<CanvasSubmission[]> {
    return this.requestAllPages(
      buildCanvasPath(`/courses/${encodeURIComponent(courseId)}/students/submissions`, {
        per_page: 100,
        "student_ids[]": ["self"],
      }),
      CanvasSubmissionSchema,
    );
  }

  async getSubmission(courseId: string, assignmentId: string): Promise<CanvasSubmission> {
    return this.requestJson(
      buildCanvasPath(
        `/courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(assignmentId)}/submissions/self`,
        {
          "include[]": ["submission_comments", "submission_history", "user", "rubric_assessment", "group"],
        },
      ),
      CanvasSubmissionSchema,
    );
  }

  async submitAssignmentFile(input: SubmitAssignmentFileInput): Promise<SubmittedAssignmentFile> {
    const assignment = await this.getAssignment(input.courseId, input.assignmentId);

    if (!assignment.submission_types?.includes("online_upload")) {
      const assignmentLabel = assignment.name ? `${assignment.name} (${assignment.id})` : assignment.id;
      throw new Error(`Canvas assignment ${assignmentLabel} does not accept online_upload submissions`);
    }

    const file = await this.uploadAssignmentSubmissionFile(input);
    const submission = await this.submitUploadedAssignmentFiles({
      courseId: input.courseId,
      assignmentId: input.assignmentId,
      fileIds: [file.id],
      comment: input.comment,
    });

    return {
      assignment,
      file,
      submission,
    };
  }

  async listModules(courseId: string): Promise<CanvasModule[]> {
    return this.requestAllPages(
      buildCanvasPath(`/courses/${encodeURIComponent(courseId)}/modules`, {
        per_page: 100,
      }),
      CanvasModuleSchema,
    );
  }

  async listModuleItems(courseId: string, moduleId: string): Promise<CanvasModuleItem[]> {
    return this.requestAllPages(
      buildCanvasPath(`/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(moduleId)}/items`, {
        per_page: 100,
        "include[]": ["content_details"],
      }),
      CanvasModuleItemSchema,
    );
  }

  async listPages(courseId: string): Promise<CanvasPage[]> {
    return this.requestAllPagesOrEmpty(
      buildCanvasPath(`/courses/${encodeURIComponent(courseId)}/pages`, {
        per_page: 100,
      }),
      CanvasPageSchema,
    );
  }

  async getFrontPage(courseId: string): Promise<CanvasPage> {
    return this.requestJson(`/courses/${encodeURIComponent(courseId)}/front_page`, CanvasPageSchema);
  }

  async getPage(courseId: string, pageIdOrUrl: string): Promise<CanvasPage> {
    if (pageIdOrUrl === "front_page") {
      return this.getFrontPage(courseId);
    }

    return this.requestJson(
      `/courses/${encodeURIComponent(courseId)}/pages/${encodeURIComponent(pageIdOrUrl)}`,
      CanvasPageSchema,
    );
  }

  async listFiles(courseId: string, searchTerm?: string): Promise<CanvasFile[]> {
    return this.requestAllPages(
      buildCanvasPath(`/courses/${encodeURIComponent(courseId)}/files`, {
        per_page: 100,
        sort: "updated_at",
        order: "desc",
        ...(searchTerm ? { search_term: searchTerm } : {}),
      }),
      CanvasFileSchema,
    );
  }

  async getFile(fileId: string): Promise<CanvasFile> {
    return this.requestJson(`/files/${encodeURIComponent(fileId)}`, CanvasFileSchema);
  }

  async downloadFile(
    fileId: string,
    options: DownloadCanvasFileOptions = {},
  ): Promise<DownloadedCanvasFile> {
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_DOWNLOAD_BYTES;
    const file = await this.getFile(fileId);

    if (typeof file.size === "number" && file.size > maxBytes) {
      throw new Error(
        `Canvas file ${fileId} is ${file.size} bytes, which exceeds the ${maxBytes}-byte limit`,
      );
    }

    const downloadUrl = file.url ?? `/files/${encodeURIComponent(fileId)}/download`;
    const response = await this.sendRequest(downloadUrl, {
      accept: "*/*",
    });

    if (!response.ok) {
      throw await this.toApiError(response);
    }

    const bytes = await this.readResponseBytes(response, maxBytes);

    return {
      file,
      bytes,
      size: bytes.byteLength,
      contentType: response.headers.get("content-type") ?? file.content_type ?? null,
      sourceUrl: response.url || toCanvasUrl(this.config.baseUrl, downloadUrl),
    };
  }

  async listTabs(courseId: string): Promise<CanvasTab[]> {
    return this.requestJson(
      `/courses/${encodeURIComponent(courseId)}/tabs`,
      z.array(CanvasTabSchema),
    );
  }

  async listDiscussions(courseId: string): Promise<CanvasDiscussionTopic[]> {
    return this.requestAllPagesOrEmpty(
      buildCanvasPath(`/courses/${encodeURIComponent(courseId)}/discussion_topics`, {
        per_page: 100,
      }),
      CanvasDiscussionTopicSchema,
    );
  }

  async getDiscussion(courseId: string, topicId: string): Promise<CanvasDiscussionTopic> {
    return this.requestJson(
      `/courses/${encodeURIComponent(courseId)}/discussion_topics/${encodeURIComponent(topicId)}`,
      CanvasDiscussionTopicSchema,
    );
  }

  async listGroups(): Promise<CanvasGroup[]> {
    return this.requestAllPages(
      buildCanvasPath("/users/self/groups", {
        per_page: 100,
        "include[]": ["favorites", "can_access"],
      }),
      CanvasGroupSchema,
    );
  }

  async getGroup(groupId: string): Promise<CanvasGroup> {
    return this.requestJson(`/groups/${encodeURIComponent(groupId)}`, CanvasGroupSchema);
  }

  async listCalendarEvents(input: {
    contextCodes?: string[];
    type: "event" | "assignment" | "sub_assignment";
    startDate?: string;
    endDate?: string;
  }): Promise<CanvasCalendarEvent[]> {
    if (input.contextCodes?.length === 0) {
      return [];
    }

    return this.requestAllPages(
      buildCanvasPath("/calendar_events", {
        per_page: 100,
        type: input.type,
        ...(input.startDate ? { start_date: input.startDate } : {}),
        ...(input.endDate ? { end_date: input.endDate } : {}),
        ...(input.contextCodes ? { "context_codes[]": input.contextCodes } : {}),
      }),
      CanvasCalendarEventSchema,
    );
  }

  async getCourseSchedule(input: {
    courseId: string;
    startDate: string;
    endDate: string;
  }): Promise<CanvasCalendarEvent[]> {
    const contextCodes = [`course_${input.courseId}`];
    const [events, assignments] = await Promise.all([
      this.listCalendarEvents({
        contextCodes,
        type: "event",
        startDate: input.startDate,
        endDate: input.endDate,
      }),
      this.listCalendarEvents({
        contextCodes,
        type: "assignment",
        startDate: input.startDate,
        endDate: input.endDate,
      }),
    ]);

    return [...events, ...assignments].sort((left, right) =>
      compareCanvasDates(left.start_at ?? left.assignment?.due_at, right.start_at ?? right.assignment?.due_at),
    );
  }

  async listConversations(): Promise<CanvasConversation[]> {
    return this.requestAllPages(
      buildCanvasPath("/conversations", {
        per_page: 100,
        "include[]": ["participant_avatars"],
      }),
      CanvasConversationSchema,
    );
  }

  async getConversation(conversationId: string): Promise<CanvasConversation> {
    return this.requestJson(
      buildCanvasPath(`/conversations/${encodeURIComponent(conversationId)}`, {
        "include[]": ["participant_avatars"],
      }),
      CanvasConversationSchema,
    );
  }

  async listQuizzes(courseId: string): Promise<CanvasQuiz[]> {
    return this.requestAllPagesOrEmpty(
      buildCanvasPath(`/courses/${encodeURIComponent(courseId)}/quizzes`, {
        per_page: 100,
      }),
      CanvasQuizSchema,
    );
  }

  async getQuiz(courseId: string, quizId: string): Promise<CanvasQuiz> {
    return this.requestJson(
      `/courses/${encodeURIComponent(courseId)}/quizzes/${encodeURIComponent(quizId)}`,
      CanvasQuizSchema,
    );
  }

  async listExternalTools(input: {
    courseId: string;
    includeParents: boolean;
  }): Promise<CanvasExternalTool[]> {
    return this.requestAllPages(
      buildCanvasPath(`/courses/${encodeURIComponent(input.courseId)}/external_tools`, {
        per_page: 100,
        include_parents: input.includeParents,
      }),
      CanvasExternalToolSchema,
    );
  }

  async listMissingSubmissions(input: {
    includePlannerOverrides: boolean;
    includeCourse: boolean;
  }): Promise<CanvasMissingSubmission[]> {
    const include: string[] = [];

    if (input.includePlannerOverrides) {
      include.push("planner_overrides");
    }

    if (input.includeCourse) {
      include.push("course");
    }

    return this.requestAllPages(
      buildCanvasPath("/users/self/missing_submissions", {
        per_page: 100,
        ...(include.length > 0 ? { "include[]": include } : {}),
      }),
      CanvasMissingSubmissionSchema,
    );
  }

  private async getCourseWithIncludes(courseId: string, include: string[]): Promise<CanvasCourse> {
    return this.requestJson(
      buildCanvasPath(`/courses/${encodeURIComponent(courseId)}`, {
        "include[]": include,
      }),
      CanvasCourseSchema,
    );
  }

  private async requestJson<TSchema extends z.ZodTypeAny>(
    pathOrUrl: string,
    schema: TSchema,
  ): Promise<z.infer<TSchema>> {
    const response = await this.sendRequest(pathOrUrl);

    if (!response.ok) {
      throw await this.toApiError(response);
    }

    const payload = (await response.json()) as unknown;
    return schema.parse(payload);
  }

  private async requestFormJson<TSchema extends z.ZodTypeAny>(
    pathOrUrl: string,
    fields: Record<string, string | number | boolean | Array<string | number | boolean> | null | undefined>,
    schema: TSchema,
  ): Promise<z.infer<TSchema>> {
    const response = await this.sendRequest(pathOrUrl, {
      method: "POST",
      contentType: "application/x-www-form-urlencoded",
      body: buildFormBody(fields),
    });

    if (!response.ok) {
      throw await this.toApiError(response);
    }

    const payload = (await response.json()) as unknown;
    return schema.parse(payload);
  }

  private async requestAllPages<TSchema extends z.ZodTypeAny>(
    pathOrUrl: string,
    itemSchema: TSchema,
  ): Promise<Array<z.infer<TSchema>>> {
    const results: Array<z.infer<TSchema>> = [];
    let nextUrl: string | null = toCanvasUrl(this.config.baseUrl, pathOrUrl);

    while (nextUrl) {
      const response = await this.sendRequest(nextUrl);

      if (!response.ok) {
        throw await this.toApiError(response);
      }

      const payload = (await response.json()) as unknown;
      const page = z.array(itemSchema).parse(payload);
      results.push(...page);
      nextUrl = parseNextLink(response.headers.get("link"));
    }

    return results;
  }

  private async requestAllPagesOrEmpty<TSchema extends z.ZodTypeAny>(
    pathOrUrl: string,
    itemSchema: TSchema,
  ): Promise<Array<z.infer<TSchema>>> {
    try {
      return await this.requestAllPages(pathOrUrl, itemSchema);
    } catch (error) {
      if (error instanceof CanvasApiError && error.status === 404) {
        return [];
      }

      throw error;
    }
  }

  private requestHeaders(
    accept = "application/json+canvas-string-ids",
    contentType?: string,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: accept,
      Authorization: `Bearer ${this.config.apiToken}`,
      "User-Agent": USER_AGENT,
    };

    if (contentType) {
      headers["Content-Type"] = contentType;
    }

    return headers;
  }

  private async sendRequest(
    pathOrUrl: string,
    options: {
      accept?: string;
      body?: URLSearchParams;
      contentType?: string;
      method?: string;
    } = {},
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      return await this.fetchImpl(toCanvasUrl(this.config.baseUrl, pathOrUrl), {
        method: options.method ?? "GET",
        headers: this.requestHeaders(options.accept, options.contentType),
        body: options.body,
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`Canvas API request timed out after ${this.requestTimeoutMs}ms`);
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async sendUnauthenticatedRequest(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      return await this.fetchImpl(url, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`Canvas upload request timed out after ${this.requestTimeoutMs}ms`);
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async uploadAssignmentSubmissionFile(input: SubmitAssignmentFileInput): Promise<CanvasFile> {
    const uploadTarget = await this.requestFormJson(
      `/courses/${encodeURIComponent(input.courseId)}/assignments/${encodeURIComponent(input.assignmentId)}/submissions/self/files`,
      {
        name: input.fileName,
        size: input.bytes.byteLength,
        content_type: input.contentType,
      },
      CanvasFileUploadTargetSchema,
    );
    const uploadResponse = await this.postFileToUploadTarget(uploadTarget, input);
    const successLocation = uploadResponse.headers.get("location");

    if (!successLocation) {
      throw new Error("Canvas file upload did not return a success location");
    }

    const confirmResponse = await this.sendRequest(successLocation);

    if (!confirmResponse.ok) {
      throw await this.toApiError(confirmResponse);
    }

    const payload = (await confirmResponse.json()) as unknown;
    return CanvasFileSchema.parse(payload);
  }

  private async postFileToUploadTarget(
    uploadTarget: CanvasFileUploadTarget,
    input: SubmitAssignmentFileInput,
  ): Promise<Response> {
    const body = new FormData();

    for (const [key, value] of Object.entries(uploadTarget.upload_params)) {
      body.append(key, String(value));
    }

    const uploadBytes = new Uint8Array(input.bytes.byteLength);
    uploadBytes.set(input.bytes);

    body.append(
      "file",
      new Blob([uploadBytes], { type: input.contentType ?? "application/octet-stream" }),
      input.fileName,
    );

    const response = await this.sendUnauthenticatedRequest(uploadTarget.upload_url, {
      method: "POST",
      body,
      redirect: "manual",
    });

    if (response.status < 200 || response.status >= 400) {
      throw new Error(`Canvas file upload failed with ${response.status} ${response.statusText}`);
    }

    return response;
  }

  private async submitUploadedAssignmentFiles(input: {
    courseId: string;
    assignmentId: string;
    fileIds: string[];
    comment?: string;
  }): Promise<CanvasSubmission> {
    return this.requestFormJson(
      `/courses/${encodeURIComponent(input.courseId)}/assignments/${encodeURIComponent(input.assignmentId)}/submissions`,
      {
        "submission[submission_type]": "online_upload",
        "submission[file_ids][]": input.fileIds,
        "comment[text_comment]": input.comment,
      },
      CanvasSubmissionSchema,
    );
  }

  private async readResponseBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
    const headerLength = response.headers.get("content-length");
    const contentLength = headerLength ? Number.parseInt(headerLength, 10) : Number.NaN;

    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new Error(
        `Canvas file download is ${contentLength} bytes, which exceeds the ${maxBytes}-byte limit`,
      );
    }

    if (!response.body) {
      const buffer = new Uint8Array(await response.arrayBuffer());

      if (buffer.byteLength > maxBytes) {
        throw new Error(
          `Canvas file download is ${buffer.byteLength} bytes, which exceeds the ${maxBytes}-byte limit`,
        );
      }

      return buffer;
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      totalBytes += value.byteLength;

      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error(`Canvas file download is larger than the ${maxBytes}-byte limit`);
      }

      chunks.push(value);
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;

    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return bytes;
  }

  private async toApiError(response: Response): Promise<CanvasApiError> {
    const body = await response.text();
    const trimmedBody = body.length > 500 ? `${body.slice(0, 500)}...` : body;
    return new CanvasApiError(
      `Canvas API request failed with ${response.status} ${response.statusText}`,
      response.status,
      trimmedBody,
    );
  }
}

function buildFormBody(
  fields: Record<string, string | number | boolean | Array<string | number | boolean> | null | undefined>,
): URLSearchParams {
  const body = new URLSearchParams();

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        body.append(key, String(entry));
      }
      continue;
    }

    body.append(key, String(value));
  }

  return body;
}
