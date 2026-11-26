import { describe, it, expect, beforeEach } from "vitest";
import * as schema from "~/db/schema";
import { LessonProgressStatus } from "~/db/schema";
import { seedLessonViewer, type LessonViewerFixture } from "./fixtures";

let f: LessonViewerFixture;
let studentId: number;

beforeEach(() => {
  f = seedLessonViewer();
  studentId = f.base.user.id;
});

function watch(lessonId: number, positionSeconds: number, createdAt: string) {
  f.db
    .insert(schema.videoWatchEvents)
    .values({
      userId: studentId,
      lessonId,
      eventType: "progress",
      positionSeconds,
      createdAt,
    })
    .run();
}

describe("marking progress", () => {
  it("has no progress for a lesson the Student has not opened", () => {
    expect(
      f.viewer.getLessonProgress(studentId, f.lessons.first.id)
    ).toBeUndefined();
  });

  it("marks a new lesson in progress", () => {
    const row = f.viewer.markLessonInProgress(studentId, f.lessons.first.id);

    expect(row.status).toBe(LessonProgressStatus.InProgress);
    expect(
      f.viewer.getLessonProgress(studentId, f.lessons.first.id)?.status
    ).toBe(LessonProgressStatus.InProgress);
  });

  it("marks a lesson complete, with a completion time", () => {
    const row = f.viewer.markLessonComplete(studentId, f.lessons.first.id);

    expect(row.status).toBe(LessonProgressStatus.Completed);
    expect(row.completedAt).not.toBeNull();
  });

  it("completes a lesson already in progress without adding a second row", () => {
    const started = f.viewer.markLessonInProgress(
      studentId,
      f.lessons.first.id
    );
    const completed = f.viewer.markLessonComplete(
      studentId,
      f.lessons.first.id
    );

    expect(completed.id).toBe(started.id);
    expect(completed.status).toBe(LessonProgressStatus.Completed);
    expect(completed.completedAt).not.toBeNull();
  });

  it("does not move a completed lesson back to in progress", () => {
    f.viewer.markLessonComplete(studentId, f.lessons.first.id);
    const row = f.viewer.markLessonInProgress(studentId, f.lessons.first.id);

    expect(row.status).toBe(LessonProgressStatus.Completed);
  });

  it("moves a not-started row to in progress", () => {
    f.db
      .insert(schema.lessonProgress)
      .values({
        userId: studentId,
        lessonId: f.lessons.first.id,
        status: LessonProgressStatus.NotStarted,
      })
      .run();

    const row = f.viewer.markLessonInProgress(studentId, f.lessons.first.id);

    expect(row.status).toBe(LessonProgressStatus.InProgress);
  });
});

describe("getLessonProgressForCourse", () => {
  it("returns this Student's progress for this course only", () => {
    f.viewer.markLessonComplete(studentId, f.lessons.first.id);
    f.viewer.markLessonInProgress(studentId, f.lessons.third.id);
    f.viewer.markLessonComplete(studentId, f.lessons.otherLesson.id);
    f.viewer.markLessonComplete(f.base.instructor.id, f.lessons.second.id);

    const rows = f.viewer.getLessonProgressForCourse(
      studentId,
      f.base.course.id
    );

    expect(
      rows.map((r) => [r.lessonId, r.status]).sort((a, b) => +a[0] - +b[0])
    ).toEqual([
      [f.lessons.first.id, LessonProgressStatus.Completed],
      [f.lessons.third.id, LessonProgressStatus.InProgress],
    ]);
  });

  it("returns nothing for a course with no modules", () => {
    expect(f.viewer.getLessonProgressForCourse(studentId, 9999)).toEqual([]);
  });
});

describe("watching the video", () => {
  it("resumes from the start when the Student has not watched", () => {
    expect(f.viewer.getLastWatchPosition(studentId, f.lessons.first.id)).toBe(
      0
    );
  });

  it("resumes from the most recent position, not the furthest", () => {
    watch(f.lessons.first.id, 300, "2026-10-01T10:00:00.000Z");
    watch(f.lessons.first.id, 120, "2026-10-01T11:00:00.000Z");

    expect(f.viewer.getLastWatchPosition(studentId, f.lessons.first.id)).toBe(
      120
    );
  });

  it("measures progress by the furthest position reached", () => {
    watch(f.lessons.first.id, 300, "2026-10-01T10:00:00.000Z");
    watch(f.lessons.first.id, 120, "2026-10-01T11:00:00.000Z");
    watch(f.lessons.second.id, 590, "2026-10-01T11:00:00.000Z");

    expect(
      f.viewer.calculateWatchProgress(studentId, f.lessons.first.id, 600)
    ).toBe(50);
  });

  it("rounds progress to a whole percent", () => {
    watch(f.lessons.first.id, 200, "2026-10-01T10:00:00.000Z");

    expect(
      f.viewer.calculateWatchProgress(studentId, f.lessons.first.id, 600)
    ).toBe(33);
  });

  it("caps progress at 100", () => {
    watch(f.lessons.first.id, 900, "2026-10-01T10:00:00.000Z");

    expect(
      f.viewer.calculateWatchProgress(studentId, f.lessons.first.id, 600)
    ).toBe(100);
  });

  it("is 0 with no watch events, or no known duration", () => {
    expect(
      f.viewer.calculateWatchProgress(studentId, f.lessons.first.id, 600)
    ).toBe(0);
    watch(f.lessons.first.id, 300, "2026-10-01T10:00:00.000Z");
    expect(
      f.viewer.calculateWatchProgress(studentId, f.lessons.first.id, 0)
    ).toBe(0);
  });
});
