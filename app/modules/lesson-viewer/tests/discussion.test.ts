import { describe, it, expect, beforeEach } from "vitest";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { markdown } from "~/lib/text";
import { renderThread } from "../index.server";
import { seedLessonViewer, type LessonViewerFixture } from "./fixtures";

let f: LessonViewerFixture;
let lessonId: number;
let minute = 0;

beforeEach(() => {
  f = seedLessonViewer();
  lessonId = f.lessons.first.id;
  minute = 0;
});

function post(
  userId: number,
  body: string,
  extra: { parentId?: number; deletedAt?: string; editedAt?: string } = {}
) {
  minute += 1;
  return f.db
    .insert(schema.comments)
    .values({
      lessonId,
      userId,
      body: markdown(body),
      createdAt: `2026-10-01T10:${String(minute).padStart(2, "0")}:00.000Z`,
      ...extra,
    })
    .returning()
    .get();
}

describe("getLessonThread", () => {
  it("nests replies under their question, oldest first", () => {
    const question = post(f.base.user.id, "Why Result?");
    const later = post(f.base.user.id, "And Either?");
    post(f.base.instructor.id, "Because errors are values.", {
      parentId: question.id,
    });

    const thread = f.viewer.getLessonThread(lessonId);

    expect(thread.map((c) => c.id)).toEqual([question.id, later.id]);
    expect(thread[0].replies.map((r) => r.body)).toEqual([
      "Because errors are values.",
    ]);
    expect(thread[1].replies).toEqual([]);
  });

  it("marks the course's instructor and platform admins", () => {
    const admin = f.db
      .insert(schema.users)
      .values({ name: "Ada", email: "ada@example.com", role: UserRole.Admin })
      .returning()
      .get();
    post(f.base.user.id, "Question");
    post(f.base.instructor.id, "Instructor note");
    post(admin.id, "Admin note");

    expect(f.viewer.getLessonThread(lessonId).map((c) => c.author)).toEqual([
      {
        id: f.base.user.id,
        name: "Test User",
        avatarUrl: null,
        isInstructor: false,
        isPlatformAdmin: false,
      },
      {
        id: f.base.instructor.id,
        name: "Test Instructor",
        avatarUrl: null,
        isInstructor: true,
        isPlatformAdmin: false,
      },
      {
        id: admin.id,
        name: "Ada",
        avatarUrl: null,
        isInstructor: false,
        isPlatformAdmin: true,
      },
    ]);
  });

  it("keeps the edit time of a live comment", () => {
    post(f.base.user.id, "Edited", { editedAt: "2026-10-02T00:00:00.000Z" });

    expect(f.viewer.getLessonThread(lessonId)[0]).toMatchObject({
      deleted: false,
      editedAt: "2026-10-02T00:00:00.000Z",
    });
  });

  it("blanks a deleted question that still has replies", () => {
    const question = post(f.base.user.id, "Secret", {
      deletedAt: "2026-10-02T00:00:00.000Z",
      editedAt: "2026-10-01T12:00:00.000Z",
    });
    post(f.base.instructor.id, "Answer", { parentId: question.id });

    const [shown] = f.viewer.getLessonThread(lessonId);

    expect(shown).toMatchObject({ deleted: true, body: "", editedAt: null });
    expect(shown.replies).toHaveLength(1);
  });

  it("hides a deleted question with no replies, and deleted replies", () => {
    post(f.base.user.id, "Gone", { deletedAt: "2026-10-02T00:00:00.000Z" });
    const question = post(f.base.user.id, "Still here");
    post(f.base.instructor.id, "Removed", {
      parentId: question.id,
      deletedAt: "2026-10-02T00:00:00.000Z",
    });

    const thread = f.viewer.getLessonThread(lessonId);

    expect(thread.map((c) => c.body)).toEqual(["Still here"]);
    expect(thread[0].replies).toEqual([]);
  });

  it("drops a reply to a reply, which the thread cannot show", () => {
    const question = post(f.base.user.id, "Question");
    const reply = post(f.base.instructor.id, "Reply", {
      parentId: question.id,
    });
    post(f.base.user.id, "Reply to the reply", { parentId: reply.id });

    const thread = f.viewer.getLessonThread(lessonId);

    expect(thread[0].replies.map((r) => r.body)).toEqual(["Reply"]);
  });

  it("is empty for a lesson that does not exist", () => {
    expect(f.viewer.getLessonThread(9999)).toEqual([]);
  });

  it("finds a comment by id", () => {
    const comment = post(f.base.user.id, "Hello");

    expect(f.viewer.getCommentById(comment.id)?.body).toBe("Hello");
  });
});

describe("renderThread", () => {
  it("renders each body to HTML, keeps replies, and renders nothing for a deleted comment", async () => {
    const question = post(f.base.user.id, "**Bold**", {
      deletedAt: "2026-10-02T00:00:00.000Z",
    });
    post(f.base.instructor.id, "A *reply*", { parentId: question.id });

    const [rendered] = await renderThread(f.viewer.getLessonThread(lessonId));

    expect(rendered.bodyHtml).toBe("");
    expect(rendered.replies[0].bodyHtml).toContain("<em>reply</em>");
  });

  it("escapes raw HTML in a comment", async () => {
    post(f.base.user.id, "<script>alert(1)</script>\n\n**hi**");

    const [rendered] = await renderThread(f.viewer.getLessonThread(lessonId));

    expect(rendered.bodyHtml).not.toContain("<script>");
    expect(rendered.bodyHtml).toContain("<strong>hi</strong>");
  });
});
