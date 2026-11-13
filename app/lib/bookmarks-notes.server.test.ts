import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { eq } from "drizzle-orm";
import {
  deleteBookmarksAndNotesOnLessons,
  getBookmarksForUser,
  getNote,
  getNotesForUser,
  isBookmarked,
  saveNote,
  toggleBookmark,
} from "./bookmarks-notes.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);
const LATER = new Date(2026, 9, 7, 9, 30, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonId: number;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  lessonId = db
    .insert(schema.lessons)
    .values({ moduleId: module.id, title: "Lesson 1", position: 1 })
    .returning()
    .get().id;
});

describe("toggling a Bookmark", () => {
  it("bookmarks a Lesson, then removes the Bookmark on the second toggle", () => {
    expect(isBookmarked(db, base.user.id, lessonId)).toBe(false);

    expect(toggleBookmark(db, base.user.id, lessonId, NOW)).toBe(true);
    expect(isBookmarked(db, base.user.id, lessonId)).toBe(true);

    expect(toggleBookmark(db, base.user.id, lessonId, NOW)).toBe(false);
    expect(isBookmarked(db, base.user.id, lessonId)).toBe(false);
  });
});

describe("saving a Note", () => {
  it("saves a Note, then updates it in place", () => {
    saveNote(db, base.user.id, lessonId, "  First thoughts  ", NOW);
    expect(getNote(db, base.user.id, lessonId)).toMatchObject({
      body: "First thoughts",
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });

    saveNote(db, base.user.id, lessonId, "Second thoughts", LATER);
    expect(getNote(db, base.user.id, lessonId)).toMatchObject({
      body: "Second thoughts",
      createdAt: NOW.toISOString(),
      updatedAt: LATER.toISOString(),
    });
  });

  it("clears the Note when saved with an empty body", () => {
    saveNote(db, base.user.id, lessonId, "Something", NOW);

    saveNote(db, base.user.id, lessonId, "   ", LATER);

    expect(getNote(db, base.user.id, lessonId)).toBeUndefined();
  });
});

describe("one per Student per Lesson", () => {
  it("keeps a single Note however many times the Student saves", () => {
    saveNote(db, base.user.id, lessonId, "One", NOW);
    saveNote(db, base.user.id, lessonId, "Two", LATER);

    expect(getNotesForUser(db, base.user.id)).toHaveLength(1);
  });

  it("gives another Student their own Bookmark and Note on the same Lesson", () => {
    const other = db
      .insert(schema.users)
      .values({
        name: "Other Student",
        email: "other@example.com",
        role: schema.UserRole.Student,
      })
      .returning()
      .get();

    toggleBookmark(db, base.user.id, lessonId, NOW);
    toggleBookmark(db, other.id, lessonId, NOW);
    saveNote(db, base.user.id, lessonId, "Mine", NOW);
    saveNote(db, other.id, lessonId, "Theirs", NOW);

    expect(getBookmarksForUser(db, base.user.id)).toHaveLength(1);
    expect(getBookmarksForUser(db, other.id)).toHaveLength(1);
    expect(getNote(db, base.user.id, lessonId)?.body).toBe("Mine");
    expect(getNote(db, other.id, lessonId)?.body).toBe("Theirs");
  });
});

describe("the Saved lists", () => {
  let secondLessonId: number;
  let otherStudentId: number;

  beforeEach(() => {
    const module = db
      .insert(schema.modules)
      .values({ courseId: base.course.id, title: "Advanced", position: 2 })
      .returning()
      .get();
    secondLessonId = db
      .insert(schema.lessons)
      .values({ moduleId: module.id, title: "Lesson 2", position: 1 })
      .returning()
      .get().id;
    otherStudentId = db
      .insert(schema.users)
      .values({
        name: "Other Student",
        email: "other@example.com",
        role: schema.UserRole.Student,
      })
      .returning()
      .get().id;
  });

  it("lists only the Student's own Bookmarks, newest first", () => {
    toggleBookmark(db, base.user.id, lessonId, NOW);
    toggleBookmark(db, base.user.id, secondLessonId, LATER);
    toggleBookmark(db, otherStudentId, lessonId, LATER);

    expect(getBookmarksForUser(db, base.user.id)).toEqual([
      {
        id: expect.any(Number),
        createdAt: LATER.toISOString(),
        lessonId: secondLessonId,
        lessonTitle: "Lesson 2",
        moduleTitle: "Advanced",
        courseTitle: "Test Course",
        lessonUrl: `/courses/test-course/lessons/${secondLessonId}`,
      },
      {
        id: expect.any(Number),
        createdAt: NOW.toISOString(),
        lessonId,
        lessonTitle: "Lesson 1",
        moduleTitle: "Basics",
        courseTitle: "Test Course",
        lessonUrl: `/courses/test-course/lessons/${lessonId}`,
      },
    ]);
  });

  it("lists only the Student's own Notes, most recently edited first", () => {
    saveNote(db, base.user.id, lessonId, "On lesson 1", NOW);
    saveNote(db, base.user.id, secondLessonId, "On lesson 2", NOW);
    saveNote(db, base.user.id, lessonId, "On lesson 1, edited", LATER);
    saveNote(db, otherStudentId, secondLessonId, "Not mine", LATER);

    expect(getNotesForUser(db, base.user.id)).toEqual([
      {
        id: expect.any(Number),
        body: "On lesson 1, edited",
        updatedAt: LATER.toISOString(),
        lessonId,
        lessonTitle: "Lesson 1",
        moduleTitle: "Basics",
        courseTitle: "Test Course",
        lessonUrl: `/courses/test-course/lessons/${lessonId}`,
      },
      {
        id: expect.any(Number),
        body: "On lesson 2",
        updatedAt: NOW.toISOString(),
        lessonId: secondLessonId,
        lessonTitle: "Lesson 2",
        moduleTitle: "Advanced",
        courseTitle: "Test Course",
        lessonUrl: `/courses/test-course/lessons/${secondLessonId}`,
      },
    ]);
  });
});

describe("deleting a Lesson", () => {
  it("can delete a Lesson once its Bookmarks and Notes are cleared", () => {
    toggleBookmark(db, base.user.id, lessonId, NOW);
    saveNote(db, base.user.id, lessonId, "Keep this?", NOW);

    deleteBookmarksAndNotesOnLessons(db, [lessonId]);
    db.delete(schema.lessons).where(eq(schema.lessons.id, lessonId)).run();

    expect(getBookmarksForUser(db, base.user.id)).toEqual([]);
    expect(getNotesForUser(db, base.user.id)).toEqual([]);
  });

  it("does nothing for an empty list of Lessons", () => {
    toggleBookmark(db, base.user.id, lessonId, NOW);

    deleteBookmarksAndNotesOnLessons(db, []);

    expect(isBookmarked(db, base.user.id, lessonId)).toBe(true);
  });
});
