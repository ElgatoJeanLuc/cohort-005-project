import { db } from "~/db";
import type { Db } from "./lib/db";
import { createCourseQueries } from "./lib/course";
import { createDiscussionQueries } from "./lib/discussion";
import { createProgressQueries } from "./lib/progress";
import { createQuizQueries } from "./lib/quiz";

export type { Db } from "./lib/db";
export type { CommentAuthor, ThreadComment } from "./lib/discussion";
export type { FlatLesson } from "./lib/course";
export type { QuestionResult } from "./lib/quiz";
export { flattenCourseLessons } from "./lib/course";
export { renderThread } from "./lib/discussion";
export { calculateGrade } from "./lib/quiz";

/**
 * The reads and writes behind the lesson page: the course and its
 * curriculum, a Student's progress and watch position, the lesson's
 * Discussion, and its quiz. Tests build their own against a test database;
 * the route uses `lessonViewer`.
 */
export function createLessonViewer(database: Db) {
  return {
    ...createCourseQueries(database),
    ...createProgressQueries(database),
    ...createDiscussionQueries(database),
    ...createQuizQueries(database),
  };
}

export const lessonViewer = createLessonViewer(db);
