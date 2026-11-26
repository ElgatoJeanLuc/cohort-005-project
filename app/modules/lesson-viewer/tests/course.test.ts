import { describe, it, expect, beforeEach } from "vitest";
import { flattenCourseLessons } from "../index.server";
import { seedLessonViewer, type LessonViewerFixture } from "./fixtures";

let f: LessonViewerFixture;

beforeEach(() => {
  f = seedLessonViewer();
});

describe("getCourseWithDetails", () => {
  it("returns the course with its instructor, category and curriculum in order", () => {
    const course = f.viewer.getCourseWithDetails(f.base.course.id);

    expect(course).toMatchObject({
      title: "Test Course",
      instructorName: "Test Instructor",
      categoryName: "Programming",
    });
    expect(
      course?.modules.map((m) => [m.title, m.lessons.map((l) => l.title)])
    ).toEqual([
      ["Basics", ["Lesson 1", "Lesson 2"]],
      ["Next steps", ["Lesson 3"]],
    ]);
  });

  it("returns null for a course that does not exist", () => {
    expect(f.viewer.getCourseWithDetails(9999)).toBeNull();
  });
});

describe("looking up by id", () => {
  it("finds the lesson, module and user", () => {
    expect(f.viewer.getLessonById(f.lessons.first.id)?.title).toBe("Lesson 1");
    expect(f.viewer.getModuleById(f.modules.basics.id)?.title).toBe("Basics");
    expect(f.viewer.getUserById(f.base.user.id)?.name).toBe("Test User");
  });

  it("finds the course a lesson belongs to", () => {
    expect(f.viewer.getCourseForLesson(f.lessons.third.id)).toEqual({
      courseId: f.base.course.id,
      courseTitle: "Test Course",
      courseSlug: "test-course",
      instructorId: f.base.instructor.id,
    });
  });

  it("finds no course for an unknown lesson", () => {
    expect(f.viewer.getCourseForLesson(9999)).toBeUndefined();
  });
});

describe("flattenCourseLessons", () => {
  it("lists every lesson in curriculum order with its module", () => {
    const course = f.viewer.getCourseWithDetails(f.base.course.id);
    if (!course) throw new Error("course missing");

    expect(flattenCourseLessons(course)).toEqual([
      {
        id: f.lessons.first.id,
        title: "Lesson 1",
        moduleId: f.modules.basics.id,
        moduleTitle: "Basics",
      },
      {
        id: f.lessons.second.id,
        title: "Lesson 2",
        moduleId: f.modules.basics.id,
        moduleTitle: "Basics",
      },
      {
        id: f.lessons.third.id,
        title: "Lesson 3",
        moduleId: f.modules.nextSteps.id,
        moduleTitle: "Next steps",
      },
    ]);
  });
});
