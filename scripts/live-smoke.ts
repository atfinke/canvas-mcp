import type {
  CanvasAssignment,
  CanvasDiscussionTopic,
  CanvasFile,
  CanvasModule,
  CanvasPage,
  CanvasQuiz,
  CanvasTab,
} from "../src/canvas/types.js";
import { CanvasClient } from "../src/canvas/client.js";
import { loadConfig } from "../src/config.js";

type ActiveCourse = {
  id: string;
  name: string;
};

type StepResult = {
  step: string;
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
  [key: string]: unknown;
};

type CourseItems<TItem> = {
  course: ActiveCourse;
  items: TItem[];
};

const client = new CanvasClient(loadConfig(process.env), { requestTimeoutMs: 20_000 });
const results: StepResult[] = [];

async function step(
  name: string,
  fn: () => Promise<Record<string, unknown>>,
): Promise<Record<string, unknown> | null> {
  try {
    const value = await fn();
    results.push({ step: name, ok: true, ...value });
    return value;
  } catch (error) {
    results.push({
      step: name,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function skip(name: string, reason: string): void {
  results.push({ step: name, ok: true, skipped: true, reason });
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatProbeError(feature: string, errors: string[]): Error {
  const preview = errors.slice(0, 5).join("; ");
  return new Error(`Unable to validate ${feature} on any active course: ${preview}`);
}

function selectPrimaryCourse(courses: ActiveCourse[]): ActiveCourse | null {
  if (courses.length === 0) {
    return null;
  }

  const preferredCourseIds = [
    process.env.CANVAS_SMOKE_PRIMARY_COURSE_ID,
    "235497",
    "251315",
    "247006",
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  for (const courseId of preferredCourseIds) {
    const match = courses.find((course) => course.id === courseId);
    if (match) {
      return match;
    }
  }

  return courses[0] ?? null;
}

async function findCourseItems<TItem>(
  courses: ActiveCourse[],
  feature: string,
  loader: (course: ActiveCourse) => Promise<TItem[]>,
): Promise<CourseItems<TItem>> {
  let firstAccessible: CourseItems<TItem> | null = null;
  const errors: string[] = [];

  for (const course of courses) {
    try {
      const items = await loader(course);
      const match = { course, items };

      if (items.length > 0) {
        return match;
      }

      if (!firstAccessible) {
        firstAccessible = match;
      }
    } catch (error) {
      errors.push(`${course.id}: ${messageFor(error)}`);
    }
  }

  if (firstAccessible) {
    return firstAccessible;
  }

  throw formatProbeError(feature, errors);
}

async function findCourseWithItems<TItem>(
  courses: ActiveCourse[],
  loader: (course: ActiveCourse) => Promise<TItem[]>,
): Promise<CourseItems<TItem> | null> {
  for (const course of courses) {
    try {
      const items = await loader(course);
      if (items.length > 0) {
        return { course, items };
      }
    } catch {
      continue;
    }
  }

  return null;
}

let activeCourses: ActiveCourse[] = [];
let primaryCourse: ActiveCourse | null = null;
let assignmentProbe: CourseItems<CanvasAssignment> | null = null;
let moduleProbe: CourseItems<CanvasModule> | null = null;
let pageProbe: CourseItems<CanvasPage> | null = null;
let fileProbe: CourseItems<CanvasFile> | null = null;
let discussionProbe: CourseItems<CanvasDiscussionTopic> | null = null;
let tabsProbe: CourseItems<CanvasTab> | null = null;
let quizProbe: CourseItems<CanvasQuiz> | null = null;
let externalToolsProbe: CourseItems<unknown> | null = null;
let calendarProbe: CourseItems<unknown> | null = null;
let firstGroupId: string | null = null;
let firstConversationId: string | null = null;

await step("getSelf", async () => {
  const user = await client.getSelf();
  return { userId: user.id, userName: user.name };
});

await step("listCourses(active)", async () => {
  const courses = await client.listCourses("active");
  activeCourses = courses.map((course) => ({ id: course.id, name: course.name }));
  primaryCourse = selectPrimaryCourse(activeCourses);

  return {
    count: activeCourses.length,
    primaryCourseId: primaryCourse?.id ?? null,
    primaryCourseName: primaryCourse?.name ?? null,
  };
});

if (primaryCourse) {
  await step("getCourse", async () => {
    const course = await client.getCourse(primaryCourse!.id);
    return { courseId: course.id, courseName: course.name };
  });

  await step("getHomeContent", async () => {
    const home = await client.getHomeContent(primaryCourse!.id);
    return {
      courseId: home.course.id,
      courseName: home.course.name,
      defaultView: home.defaultView,
      resolvedAs: home.resolvedAs,
    };
  });
} else {
  skip("getCourse", "No active course available");
  skip("getHomeContent", "No active course available");
}

await step("listEnrollments", async () => {
  const items = await client.listEnrollments({ states: ["active", "completed", "current_and_future"] });
  return { count: items.length };
});

await step("listPlannerItems", async () => {
  const items = await client.listPlannerItems({});
  return { count: items.length };
});

await step("listTodo", async () => {
  const items = await client.listTodo({ includeUngradedQuizzes: true });
  return { count: items.length };
});

await step("getTodoCount", async () => {
  const counts = await client.getTodoCount({ includeUngradedQuizzes: true });
  return counts;
});

await step("listUpcomingEvents", async () => {
  const items = await client.listUpcomingEvents();
  return { count: items.length };
});

await step("listAnnouncements", async () => {
  const items = await client.listAnnouncements({
    courseIds: primaryCourse ? [primaryCourse.id] : undefined,
  });
  return {
    courseId: primaryCourse?.id ?? null,
    courseName: primaryCourse?.name ?? null,
    count: items.length,
  };
});

if (activeCourses.length > 0) {
  await step("listAssignments", async () => {
    assignmentProbe = await findCourseItems(activeCourses, "list assignments", (course) =>
      client.listAssignments({ courseId: course.id, upcomingOnly: false }),
    );

    return {
      courseId: assignmentProbe.course.id,
      courseName: assignmentProbe.course.name,
      count: assignmentProbe.items.length,
      firstAssignmentId: assignmentProbe.items[0]?.id ?? null,
    };
  });
} else {
  skip("listAssignments", "No active course available");
}

const assignmentProbeValue = assignmentProbe as CourseItems<CanvasAssignment> | null;
const firstAssignment = assignmentProbeValue ? assignmentProbeValue.items[0] ?? null : null;

if (assignmentProbeValue && firstAssignment) {
  await step("getAssignment", async () => {
    const assignment = await client.getAssignment(assignmentProbeValue.course.id, firstAssignment.id);
    return {
      courseId: assignmentProbeValue.course.id,
      courseName: assignmentProbeValue.course.name,
      assignmentId: assignment.id,
      assignmentName: assignment.name,
    };
  });

  await step("listSubmissions", async () => {
    const items = await client.listSubmissions(assignmentProbeValue.course.id);
    return {
      courseId: assignmentProbeValue.course.id,
      courseName: assignmentProbeValue.course.name,
      count: items.length,
    };
  });

  await step("getSubmission", async () => {
    const submission = await client.getSubmission(assignmentProbeValue.course.id, firstAssignment.id);
    return {
      courseId: assignmentProbeValue.course.id,
      courseName: assignmentProbeValue.course.name,
      assignmentId: firstAssignment.id,
      workflowState: submission.workflow_state ?? null,
      grade: submission.grade ?? null,
    };
  });
} else {
  skip("getAssignment", "No assignment available on any active course");
  skip("listSubmissions", "No assignment-bearing course available");
  skip("getSubmission", "No assignment available on any active course");
}

if (activeCourses.length > 0) {
  await step("listModules", async () => {
    moduleProbe = await findCourseItems(activeCourses, "list modules", (course) => client.listModules(course.id));

    return {
      courseId: moduleProbe.course.id,
      courseName: moduleProbe.course.name,
      count: moduleProbe.items.length,
      firstModuleId: moduleProbe.items[0]?.id ?? null,
    };
  });
} else {
  skip("listModules", "No active course available");
}

const moduleProbeValue = moduleProbe as CourseItems<CanvasModule> | null;
const firstModule = moduleProbeValue ? moduleProbeValue.items[0] ?? null : null;

if (moduleProbeValue && firstModule) {
  await step("listModuleItems", async () => {
    const items = await client.listModuleItems(moduleProbeValue.course.id, firstModule.id);
    return {
      courseId: moduleProbeValue.course.id,
      courseName: moduleProbeValue.course.name,
      moduleId: firstModule.id,
      count: items.length,
    };
  });
} else {
  skip("listModuleItems", "No module available on any active course");
}

if (activeCourses.length > 0) {
  await step("listPages", async () => {
    pageProbe = await findCourseItems(activeCourses, "list pages", (course) => client.listPages(course.id));

    return {
      courseId: pageProbe.course.id,
      courseName: pageProbe.course.name,
      count: pageProbe.items.length,
      firstPageIdOrUrl: pageProbe.items[0]?.url ?? pageProbe.items[0]?.page_id ?? null,
    };
  });
} else {
  skip("listPages", "No active course available");
}

const pageWithContent = activeCourses.length > 0 ? await findCourseWithItems(activeCourses, (course) => client.listPages(course.id)) : null;
if (pageWithContent?.items[0]) {
  await step("getPage", async () => {
    const pageIdOrUrl = String(pageWithContent.items[0]!.url ?? pageWithContent.items[0]!.page_id);
    const page = await client.getPage(pageWithContent.course.id, pageIdOrUrl);

    return {
      courseId: pageWithContent.course.id,
      courseName: pageWithContent.course.name,
      pageIdOrUrl,
      title: page.title ?? null,
    };
  });
} else {
  skip("getPage", "No page available on any active course");
}

if (activeCourses.length > 0) {
  await step("listFiles", async () => {
    fileProbe = await findCourseItems(activeCourses, "list files", (course) => client.listFiles(course.id));

    return {
      courseId: fileProbe.course.id,
      courseName: fileProbe.course.name,
      count: fileProbe.items.length,
      firstFileId: fileProbe.items[0]?.id ?? null,
    };
  });
} else {
  skip("listFiles", "No active course available");
}

const filesWithContent = activeCourses.length > 0 ? await findCourseWithItems(activeCourses, (course) => client.listFiles(course.id)) : null;
if (filesWithContent?.items[0]) {
  await step("getFile", async () => {
    const file = await client.getFile(filesWithContent.items[0]!.id);
    return {
      courseId: filesWithContent.course.id,
      courseName: filesWithContent.course.name,
      fileId: file.id,
      displayName: file.display_name ?? null,
    };
  });
} else {
  skip("getFile", "No file available on any active course");
}

if (activeCourses.length > 0) {
  await step("listTabs", async () => {
    tabsProbe = await findCourseItems(activeCourses, "list tabs", (course) => client.listTabs(course.id));

    return {
      courseId: tabsProbe.course.id,
      courseName: tabsProbe.course.name,
      count: tabsProbe.items.length,
    };
  });
} else {
  skip("listTabs", "No active course available");
}

if (activeCourses.length > 0) {
  await step("listDiscussions", async () => {
    discussionProbe = await findCourseItems(activeCourses, "list discussions", (course) => client.listDiscussions(course.id));

    return {
      courseId: discussionProbe.course.id,
      courseName: discussionProbe.course.name,
      count: discussionProbe.items.length,
      firstDiscussionId: discussionProbe.items[0]?.id ?? null,
    };
  });
} else {
  skip("listDiscussions", "No active course available");
}

const discussionWithContent = activeCourses.length > 0
  ? await findCourseWithItems(activeCourses, (course) => client.listDiscussions(course.id))
  : null;
if (discussionWithContent?.items[0]) {
  await step("getDiscussion", async () => {
    const discussion = await client.getDiscussion(discussionWithContent.course.id, discussionWithContent.items[0]!.id);
    return {
      courseId: discussionWithContent.course.id,
      courseName: discussionWithContent.course.name,
      topicId: discussion.id,
      title: discussion.title ?? null,
    };
  });
} else {
  skip("getDiscussion", "No discussion available on any active course");
}

if (activeCourses.length > 0) {
  await step("listCalendarEvents", async () => {
    calendarProbe = await findCourseItems(activeCourses, "list calendar events", (course) =>
      client.listCalendarEvents({ contextCodes: [`course_${course.id}`], type: "event" }),
    );

    return {
      courseId: calendarProbe.course.id,
      courseName: calendarProbe.course.name,
      count: calendarProbe.items.length,
    };
  });
} else {
  skip("listCalendarEvents", "No active course available");
}

if (calendarProbe) {
  await step("getCourseSchedule", async () => {
    const items = await client.getCourseSchedule({
      courseId: calendarProbe!.course.id,
      startDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });

    return {
      courseId: calendarProbe!.course.id,
      courseName: calendarProbe!.course.name,
      count: items.length,
    };
  });
} else {
  skip("getCourseSchedule", "No calendar-capable course available");
}

if (activeCourses.length > 0) {
  await step("listQuizzes", async () => {
    quizProbe = await findCourseItems(activeCourses, "list quizzes", (course) => client.listQuizzes(course.id));

    return {
      courseId: quizProbe.course.id,
      courseName: quizProbe.course.name,
      count: quizProbe.items.length,
      firstQuizId: quizProbe.items[0]?.id ?? null,
    };
  });
} else {
  skip("listQuizzes", "No active course available");
}

const quizWithContent = activeCourses.length > 0 ? await findCourseWithItems(activeCourses, (course) => client.listQuizzes(course.id)) : null;
if (quizWithContent?.items[0]) {
  await step("getQuiz", async () => {
    const quiz = await client.getQuiz(quizWithContent.course.id, quizWithContent.items[0]!.id);
    return {
      courseId: quizWithContent.course.id,
      courseName: quizWithContent.course.name,
      quizId: quiz.id,
      title: quiz.title ?? null,
    };
  });
} else {
  skip("getQuiz", "No quiz available on any active course");
}

if (activeCourses.length > 0) {
  await step("listExternalTools", async () => {
    externalToolsProbe = await findCourseItems(activeCourses, "list external tools", (course) =>
      client.listExternalTools({ courseId: course.id, includeParents: true }),
    );

    return {
      courseId: externalToolsProbe.course.id,
      courseName: externalToolsProbe.course.name,
      count: externalToolsProbe.items.length,
    };
  });
} else {
  skip("listExternalTools", "No active course available");
}

await step("listGroups", async () => {
  const items = await client.listGroups();
  firstGroupId = items[0]?.id ?? null;
  return { count: items.length, firstGroupId };
});

if (firstGroupId) {
  await step("getGroup", async () => {
    const group = await client.getGroup(firstGroupId!);
    return { groupId: group.id, groupName: group.name ?? null };
  });
} else {
  skip("getGroup", "No group available");
}

await step("listConversations", async () => {
  const items = await client.listConversations();
  firstConversationId = items[0]?.id ?? null;
  return { count: items.length, firstConversationId };
});

if (firstConversationId) {
  await step("getConversation", async () => {
    const conversation = await client.getConversation(firstConversationId!);
    return { conversationId: conversation.id, subject: conversation.subject ?? null };
  });
} else {
  skip("getConversation", "No conversation available");
}

await step("listMissingSubmissions", async () => {
  const items = await client.listMissingSubmissions({ includePlannerOverrides: true, includeCourse: true });
  return { count: items.length };
});

const primaryCourseValue = primaryCourse as ActiveCourse | null;
const primaryCourseId = primaryCourseValue ? primaryCourseValue.id : null;
const primaryCourseName = primaryCourseValue ? primaryCourseValue.name : null;

const summary = {
  primaryCourseId,
  primaryCourseName,
  activeCourseCount: activeCourses.length,
  passed: results.filter((result) => result.ok && !result.skipped).length,
  failed: results.filter((result) => !result.ok).length,
  skipped: results.filter((result) => result.skipped).length,
  results,
};

console.log(JSON.stringify(summary, null, 2));

if (summary.failed > 0) {
  process.exitCode = 1;
}
