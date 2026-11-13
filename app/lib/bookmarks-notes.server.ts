import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { bookmarks, courses, lessons, modules, notes } from "~/db/schema";

// ─── Bookmarks and Notes ───
// A Student's own Bookmark and Note on a Lesson: one of each per Student per
// Lesson, seen by nobody else. See GLOSSARY.md for the language.
//
// Every function takes the database first, so tests can hand in an in-memory
// one. Uses positional parameters (project convention), always
// `(userId, lessonId)`.

export type Db = BetterSQLite3Database<typeof schema>;

export function isBookmarked(db: Db, userId: number, lessonId: number) {
  return !!db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.lessonId, lessonId)))
    .get();
}

/**
 * Adds the Student's Bookmark on the Lesson, or removes it if there is one.
 * Returns whether the Lesson is bookmarked afterwards.
 */
export function toggleBookmark(
  db: Db,
  userId: number,
  lessonId: number,
  now: Date
) {
  const removed = db
    .delete(bookmarks)
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.lessonId, lessonId)))
    .run();
  if (removed.changes > 0) return false;

  // A concurrent toggle may have inserted it first; the unique index keeps it
  // to one.
  db.insert(bookmarks)
    .values({ userId, lessonId, createdAt: now.toISOString() })
    .onConflictDoNothing({ target: [bookmarks.userId, bookmarks.lessonId] })
    .run();
  return true;
}

export function getNote(db: Db, userId: number, lessonId: number) {
  return db
    .select()
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.lessonId, lessonId)))
    .get();
}

/**
 * Writes the Student's Note on the Lesson, creating it or replacing its body.
 * A body that is empty once trimmed deletes the Note instead.
 */
export function saveNote(
  db: Db,
  userId: number,
  lessonId: number,
  body: string,
  now: Date
) {
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    db.delete(notes)
      .where(and(eq(notes.userId, userId), eq(notes.lessonId, lessonId)))
      .run();
    return;
  }

  const timestamp = now.toISOString();
  db.insert(notes)
    .values({
      userId,
      lessonId,
      body: trimmed,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: [notes.userId, notes.lessonId],
      set: { body: trimmed, updatedAt: timestamp },
    })
    .run();
}

/**
 * Deletes every Student's Bookmarks and Notes on these Lessons. Call it before
 * deleting the Lessons: their foreign keys would otherwise block the delete.
 */
export function deleteBookmarksAndNotesOnLessons(db: Db, lessonIds: number[]) {
  if (lessonIds.length === 0) return;

  db.delete(bookmarks).where(inArray(bookmarks.lessonId, lessonIds)).run();
  db.delete(notes).where(inArray(notes.lessonId, lessonIds)).run();
}

// ─── Saved ───
// The Saved page's two lists: the Student's own Bookmarks and Notes, newest
// first, each with the Lesson it is on and where that Lesson sits.

/** The Lesson a Bookmark or Note is on, and the link to it. */
export type LessonRef = {
  lessonId: number;
  lessonTitle: string;
  moduleTitle: string;
  courseTitle: string;
  lessonUrl: string;
};

export function lessonUrl(courseSlug: string, lessonId: number) {
  return `/courses/${courseSlug}/lessons/${lessonId}`;
}

const lessonRefColumns = {
  lessonId: lessons.id,
  lessonTitle: lessons.title,
  moduleTitle: modules.title,
  courseTitle: courses.title,
  courseSlug: courses.slug,
};

/** Swaps a joined row's course slug for the link to its Lesson. */
function withLessonUrl<T extends { lessonId: number; courseSlug: string }>(
  row: T
) {
  const { courseSlug, ...rest } = row;
  return { ...rest, lessonUrl: lessonUrl(courseSlug, row.lessonId) };
}

export function getBookmarksForUser(
  db: Db,
  userId: number
): Array<LessonRef & { id: number; createdAt: string }> {
  return db
    .select({
      id: bookmarks.id,
      createdAt: bookmarks.createdAt,
      ...lessonRefColumns,
    })
    .from(bookmarks)
    .innerJoin(lessons, eq(lessons.id, bookmarks.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(courses, eq(courses.id, modules.courseId))
    .where(eq(bookmarks.userId, userId))
    .orderBy(desc(bookmarks.createdAt), desc(bookmarks.id))
    .all()
    .map(withLessonUrl);
}

export function getNotesForUser(
  db: Db,
  userId: number
): Array<LessonRef & { id: number; body: string; updatedAt: string }> {
  return db
    .select({
      id: notes.id,
      body: notes.body,
      updatedAt: notes.updatedAt,
      ...lessonRefColumns,
    })
    .from(notes)
    .innerJoin(lessons, eq(lessons.id, notes.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(courses, eq(courses.id, modules.courseId))
    .where(eq(notes.userId, userId))
    .orderBy(desc(notes.updatedAt), desc(notes.id))
    .all()
    .map(withLessonUrl);
}
