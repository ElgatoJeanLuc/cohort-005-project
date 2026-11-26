import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { markdown } from "~/lib/text";
import { createLessonViewer } from "../index.server";

/**
 * A course with two modules: "Basics" (lessons 1 and 2) and "Next steps"
 * (lesson 3), plus a lesson in another course that must never leak in.
 */
export function seedLessonViewer() {
  const db: TestDb = createTestDb();
  const base = seedBaseData(db);

  const addModule = (courseId: number, title: string, position: number) =>
    db
      .insert(schema.modules)
      .values({ courseId, title, position })
      .returning()
      .get();
  const addLesson = (moduleId: number, title: string, position: number) =>
    db
      .insert(schema.lessons)
      .values({ moduleId, title, position })
      .returning()
      .get();

  const basics = addModule(base.course.id, "Basics", 1);
  const nextSteps = addModule(base.course.id, "Next steps", 2);
  // Inserted out of order to show the curriculum sorts by position.
  const second = addLesson(basics.id, "Lesson 2", 2);
  const first = addLesson(basics.id, "Lesson 1", 1);
  const third = addLesson(nextSteps.id, "Lesson 3", 1);

  const otherCourse = db
    .insert(schema.courses)
    .values({
      title: "Other Course",
      slug: "other-course",
      description: "Another course",
      salesCopy: markdown("Another course"),
      instructorId: base.instructor.id,
      categoryId: base.category.id,
      status: schema.CourseStatus.Published,
    })
    .returning()
    .get();
  const otherLesson = addLesson(
    addModule(otherCourse.id, "Elsewhere", 1).id,
    "Other lesson",
    1
  );

  return {
    db,
    viewer: createLessonViewer(db),
    base,
    modules: { basics, nextSteps },
    lessons: { first, second, third, otherLesson },
  };
}

export type LessonViewerFixture = ReturnType<typeof seedLessonViewer>;
