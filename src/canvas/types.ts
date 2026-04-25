import { z } from "zod";

const CanvasIdSchema = z.union([z.string(), z.number()]).transform((value) => String(value));
const OptionalCanvasIdSchema = CanvasIdSchema.nullable().optional();
const OptionalUrlSchema = z.string().nullable().optional();
const OptionalDateSchema = z.string().nullable().optional();
const OptionalNumberSchema = z.number().nullable().optional();
const OptionalBooleanSchema = z.boolean().nullable().optional();

export const CanvasUserSchema = z.object({
  id: CanvasIdSchema,
  name: z.string(),
  created_at: z.string().optional(),
  sortable_name: z.string().optional(),
  short_name: z.string().optional(),
  avatar_url: OptionalUrlSchema,
  last_name: z.string().optional(),
  first_name: z.string().optional(),
  locale: z.string().nullable().optional(),
  effective_locale: z.string().nullable().optional(),
  uuid: z.string().optional(),
  account_uuid: z.string().optional(),
});

export type CanvasUser = z.infer<typeof CanvasUserSchema>;

export const CanvasEnrollmentGradesSchema = z.object({
  html_url: OptionalUrlSchema,
  current_grade: z.string().nullable().optional(),
  final_grade: z.string().nullable().optional(),
  current_score: OptionalNumberSchema,
  final_score: OptionalNumberSchema,
  unposted_current_grade: z.string().nullable().optional(),
  unposted_final_grade: z.string().nullable().optional(),
  unposted_current_score: OptionalNumberSchema,
  unposted_final_score: OptionalNumberSchema,
});

export type CanvasEnrollmentGrades = z.infer<typeof CanvasEnrollmentGradesSchema>;

export const CanvasEnrollmentSchema = z.object({
  id: OptionalCanvasIdSchema,
  user_id: OptionalCanvasIdSchema,
  course_id: OptionalCanvasIdSchema,
  course_section_id: OptionalCanvasIdSchema,
  enrollment_state: z.string().optional(),
  role: z.string().optional(),
  type: z.string().optional(),
  created_at: OptionalDateSchema,
  updated_at: OptionalDateSchema,
  associated_user_id: OptionalCanvasIdSchema,
  grades: CanvasEnrollmentGradesSchema.optional(),
});

export type CanvasEnrollment = z.infer<typeof CanvasEnrollmentSchema>;

export const CanvasCourseSchema = z.object({
  id: CanvasIdSchema,
  name: z.string().optional(),
  course_code: z.string().optional(),
  workflow_state: z.string().optional(),
  default_view: z.string().optional(),
  start_at: OptionalDateSchema,
  end_at: OptionalDateSchema,
  syllabus_body: z.string().nullable().optional(),
  permissions: z.record(z.string(), z.boolean()).optional(),
  total_scores: OptionalBooleanSchema,
  current_grading_period_scores: OptionalBooleanSchema,
  term: z
    .object({
      id: CanvasIdSchema.optional(),
      name: z.string().optional(),
      workflow_state: z.string().optional(),
    })
    .optional(),
  sections: z
    .array(
      z.object({
        id: CanvasIdSchema,
        name: z.string().optional(),
        enrollment_role: z.string().optional(),
        start_at: OptionalDateSchema,
        end_at: OptionalDateSchema,
      }),
    )
    .optional(),
  tabs: z
    .array(
      z.object({
        id: z.string(),
        label: z.string().optional(),
        type: z.string().optional(),
        html_url: OptionalUrlSchema,
        full_url: OptionalUrlSchema,
      }),
    )
    .optional(),
  enrollments: z.array(CanvasEnrollmentSchema).optional(),
});

export type CanvasCourse = z.infer<typeof CanvasCourseSchema>;

export const CanvasSubmissionCommentSchema = z.object({
  id: OptionalCanvasIdSchema,
  author_id: OptionalCanvasIdSchema,
  author_name: z.string().optional(),
  comment: z.string().optional(),
  created_at: OptionalDateSchema,
  edited_at: OptionalDateSchema,
});

export const CanvasSubmissionSchema = z.object({
  user_id: OptionalCanvasIdSchema,
  assignment_id: OptionalCanvasIdSchema,
  submitted_at: OptionalDateSchema,
  score: OptionalNumberSchema,
  grade: z.string().nullable().optional(),
  attempt: OptionalNumberSchema,
  late: OptionalBooleanSchema,
  missing: OptionalBooleanSchema,
  excused: OptionalBooleanSchema,
  workflow_state: z.string().nullable().optional(),
  submission_type: z.string().nullable().optional(),
  preview_url: OptionalUrlSchema,
  posted_at: OptionalDateSchema,
  late_policy_status: z.string().nullable().optional(),
  grade_matches_current_submission: OptionalBooleanSchema,
  assignment_visible: OptionalBooleanSchema,
  submission_comments: z.array(CanvasSubmissionCommentSchema).optional(),
});

export type CanvasSubmission = z.infer<typeof CanvasSubmissionSchema>;

export const CanvasAssignmentSchema = z.object({
  id: CanvasIdSchema,
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  due_at: OptionalDateSchema,
  unlock_at: OptionalDateSchema,
  lock_at: OptionalDateSchema,
  points_possible: OptionalNumberSchema,
  html_url: OptionalUrlSchema,
  submission_types: z.array(z.string()).optional(),
  grading_type: z.string().optional(),
  allowed_attempts: OptionalNumberSchema,
  allowed_extensions: z.array(z.string()).nullable().optional(),
  published: z.boolean().optional(),
  locked_for_user: OptionalBooleanSchema,
  only_visible_to_overrides: OptionalBooleanSchema,
  has_group_assignment: OptionalBooleanSchema,
  peer_reviews: OptionalBooleanSchema,
  submission: CanvasSubmissionSchema.optional(),
});

export type CanvasAssignment = z.infer<typeof CanvasAssignmentSchema>;

export const CanvasDashboardCardSchema = z.object({
  id: CanvasIdSchema,
  shortName: z.string().optional(),
  originalName: z.string().optional(),
  courseCode: z.string().optional(),
  assetString: z.string().optional(),
  href: OptionalUrlSchema,
  term: z.string().optional(),
  subtitle: z.string().optional(),
});

export type CanvasDashboardCard = z.infer<typeof CanvasDashboardCardSchema>;

export const CanvasTodoCountSchema = z.object({
  needs_grading_count: OptionalNumberSchema,
  needs_submitting_count: OptionalNumberSchema,
});

export type CanvasTodoCount = z.infer<typeof CanvasTodoCountSchema>;

export const CanvasTodoItemSchema = z.object({
  type: z.string().optional(),
  course_id: OptionalCanvasIdSchema,
  html_url: OptionalUrlSchema,
  ignore: OptionalUrlSchema,
  ignore_permanently: OptionalUrlSchema,
  assignment: CanvasAssignmentSchema.optional(),
  quiz: z
    .object({
      id: CanvasIdSchema,
      title: z.string().optional(),
      html_url: OptionalUrlSchema,
      due_at: OptionalDateSchema,
    })
    .optional(),
});

export type CanvasTodoItem = z.infer<typeof CanvasTodoItemSchema>;

export const CanvasPlannerItemSchema = z.object({
  course_id: OptionalCanvasIdSchema,
  plannable_id: OptionalCanvasIdSchema,
  plannable_type: z.string().nullable().optional(),
  plannable_date: OptionalDateSchema,
  html_url: OptionalUrlSchema,
  context_name: z.string().nullable().optional(),
  new_activity: OptionalBooleanSchema,
  submissions: z.unknown().optional(),
  planner_override: z
    .object({
      id: OptionalCanvasIdSchema,
      plannable_type: z.string().optional(),
      plannable_id: OptionalCanvasIdSchema,
      marked_complete: OptionalBooleanSchema,
      dismissed: OptionalBooleanSchema,
    })
    .nullable()
    .optional(),
  plannable: z
    .object({
      title: z.string().optional(),
      points_possible: OptionalNumberSchema,
      due_at: OptionalDateSchema,
      html_url: OptionalUrlSchema,
    })
    .optional(),
});

export type CanvasPlannerItem = z.infer<typeof CanvasPlannerItemSchema>;

export const CanvasAnnouncementSchema = z.object({
  id: CanvasIdSchema,
  title: z.string().optional(),
  message: z.string().nullable().optional(),
  html_url: OptionalUrlSchema,
  posted_at: OptionalDateSchema,
  delayed_post_at: OptionalDateSchema,
  context_code: z.string().nullable().optional(),
  read_state: z.string().nullable().optional(),
});

export type CanvasAnnouncement = z.infer<typeof CanvasAnnouncementSchema>;

export const CanvasModuleSchema = z.object({
  id: CanvasIdSchema,
  name: z.string().optional(),
  position: OptionalNumberSchema,
  unlock_at: OptionalDateSchema,
  require_sequential_progress: OptionalBooleanSchema,
  state: z.string().nullable().optional(),
  completed_at: OptionalDateSchema,
  items_count: OptionalNumberSchema,
});

export type CanvasModule = z.infer<typeof CanvasModuleSchema>;

export const CanvasModuleItemSchema = z.object({
  id: CanvasIdSchema,
  title: z.string().optional(),
  type: z.string().optional(),
  content_id: OptionalCanvasIdSchema,
  html_url: OptionalUrlSchema,
  url: OptionalUrlSchema,
  position: OptionalNumberSchema,
  published: OptionalBooleanSchema,
  indent: OptionalNumberSchema,
  completion_requirement: z
    .object({
      type: z.string().optional(),
      completed: OptionalBooleanSchema,
    })
    .optional(),
  content_details: z
    .object({
      due_at: OptionalDateSchema,
      unlock_at: OptionalDateSchema,
      lock_at: OptionalDateSchema,
      points_possible: OptionalNumberSchema,
    })
    .optional(),
});

export type CanvasModuleItem = z.infer<typeof CanvasModuleItemSchema>;

export const CanvasPageSchema = z.object({
  page_id: OptionalCanvasIdSchema,
  url: z.string().optional(),
  title: z.string().optional(),
  created_at: OptionalDateSchema,
  updated_at: OptionalDateSchema,
  hide_from_students: OptionalBooleanSchema,
  editing_roles: z.string().nullable().optional(),
  last_edited_by: CanvasUserSchema.partial().optional(),
  body: z.string().nullable().optional(),
  published: OptionalBooleanSchema,
  front_page: OptionalBooleanSchema,
  html_url: OptionalUrlSchema,
  locked_for_user: OptionalBooleanSchema,
});

export type CanvasPage = z.infer<typeof CanvasPageSchema>;

export const CanvasFileSchema = z.object({
  id: CanvasIdSchema,
  uuid: z.string().optional(),
  display_name: z.string().optional(),
  filename: z.string().optional(),
  content_type: z.string().optional(),
  url: OptionalUrlSchema,
  preview_url: OptionalUrlSchema,
  size: OptionalNumberSchema,
  updated_at: OptionalDateSchema,
  created_at: OptionalDateSchema,
  unlock_at: OptionalDateSchema,
  locked: OptionalBooleanSchema,
  hidden: OptionalBooleanSchema,
  folder_id: OptionalCanvasIdSchema,
});

export type CanvasFile = z.infer<typeof CanvasFileSchema>;

export const CanvasFileUploadTargetSchema = z.object({
  upload_url: z.string(),
  upload_params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
});

export type CanvasFileUploadTarget = z.infer<typeof CanvasFileUploadTargetSchema>;

export const CanvasTabSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  type: z.string().optional(),
  html_url: OptionalUrlSchema,
  full_url: OptionalUrlSchema,
  visibility: z.string().nullable().optional(),
  hidden: OptionalBooleanSchema,
});

export type CanvasTab = z.infer<typeof CanvasTabSchema>;

export const CanvasDiscussionTopicSchema = z.object({
  id: CanvasIdSchema,
  title: z.string().optional(),
  message: z.string().nullable().optional(),
  html_url: OptionalUrlSchema,
  posted_at: OptionalDateSchema,
  last_reply_at: OptionalDateSchema,
  discussion_type: z.string().optional(),
  assignment_id: OptionalCanvasIdSchema,
  published: OptionalBooleanSchema,
  locked: OptionalBooleanSchema,
  read_state: z.string().nullable().optional(),
  unread_count: OptionalNumberSchema,
});

export type CanvasDiscussionTopic = z.infer<typeof CanvasDiscussionTopicSchema>;

export const CanvasGroupSchema = z.object({
  id: CanvasIdSchema,
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  is_public: OptionalBooleanSchema,
  join_level: z.string().nullable().optional(),
  members_count: OptionalNumberSchema,
  avatar_url: OptionalUrlSchema,
  context_type: z.string().nullable().optional(),
  course_id: OptionalCanvasIdSchema,
  role: z.string().nullable().optional(),
  can_access: OptionalBooleanSchema,
  is_favorite: OptionalBooleanSchema,
});

export type CanvasGroup = z.infer<typeof CanvasGroupSchema>;

export const CanvasCalendarEventSchema = z.object({
  id: CanvasIdSchema,
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  start_at: OptionalDateSchema,
  end_at: OptionalDateSchema,
  html_url: OptionalUrlSchema,
  context_code: z.string().nullable().optional(),
  effective_context_code: z.string().nullable().optional(),
  workflow_state: z.string().nullable().optional(),
  all_day: OptionalBooleanSchema,
  location_name: z.string().nullable().optional(),
  hidden: OptionalBooleanSchema,
  assignment: CanvasAssignmentSchema.optional(),
});

export type CanvasCalendarEvent = z.infer<typeof CanvasCalendarEventSchema>;

export const CanvasConversationParticipantSchema = z.object({
  id: OptionalCanvasIdSchema,
  name: z.string().optional(),
  full_name: z.string().optional(),
  avatar_url: OptionalUrlSchema,
});

export const CanvasConversationSchema = z.object({
  id: CanvasIdSchema,
  subject: z.string().nullable().optional(),
  workflow_state: z.string().nullable().optional(),
  last_message: z.string().nullable().optional(),
  last_message_at: OptionalDateSchema,
  message_count: OptionalNumberSchema,
  subscribed: OptionalBooleanSchema,
  private: OptionalBooleanSchema,
  starred: OptionalBooleanSchema,
  properties: z.unknown().optional(),
  participants: z.array(CanvasConversationParticipantSchema).optional(),
});

export type CanvasConversation = z.infer<typeof CanvasConversationSchema>;

export const CanvasQuizSchema = z.object({
  id: CanvasIdSchema,
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  html_url: OptionalUrlSchema,
  mobile_url: OptionalUrlSchema,
  quiz_type: z.string().nullable().optional(),
  assignment_id: OptionalCanvasIdSchema,
  due_at: OptionalDateSchema,
  lock_at: OptionalDateSchema,
  unlock_at: OptionalDateSchema,
  published: OptionalBooleanSchema,
  question_count: OptionalNumberSchema,
  points_possible: OptionalNumberSchema,
  time_limit: OptionalNumberSchema,
});

export type CanvasQuiz = z.infer<typeof CanvasQuizSchema>;

export const CanvasExternalToolSchema = z.object({
  id: CanvasIdSchema,
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  url: OptionalUrlSchema,
  domain: z.string().nullable().optional(),
  consumer_key: z.string().nullable().optional(),
  privacy_level: z.string().nullable().optional(),
});

export type CanvasExternalTool = z.infer<typeof CanvasExternalToolSchema>;

export const CanvasUpcomingEventSchema = z.object({
  id: CanvasIdSchema,
  title: z.string().optional(),
  type: z.string().nullable().optional(),
  html_url: OptionalUrlSchema,
  context_code: z.string().nullable().optional(),
  start_at: OptionalDateSchema,
  end_at: OptionalDateSchema,
  assignment: CanvasAssignmentSchema.optional(),
});

export type CanvasUpcomingEvent = z.infer<typeof CanvasUpcomingEventSchema>;

export const CanvasMissingSubmissionSchema = z.object({
  id: OptionalCanvasIdSchema,
  name: z.string().optional(),
  course_id: OptionalCanvasIdSchema,
  due_at: OptionalDateSchema,
  points_possible: OptionalNumberSchema,
  html_url: OptionalUrlSchema,
  planner_override: z
    .object({
      id: OptionalCanvasIdSchema,
      marked_complete: OptionalBooleanSchema,
      dismissed: OptionalBooleanSchema,
    })
    .nullable()
    .optional(),
  course: CanvasCourseSchema.partial().optional(),
});

export type CanvasMissingSubmission = z.infer<typeof CanvasMissingSubmissionSchema>;

export type CourseState = "active" | "completed" | "all";
