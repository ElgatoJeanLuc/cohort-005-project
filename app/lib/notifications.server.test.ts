import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { NotificationType, UserRole } from "~/db/schema";
import {
  getBellCount,
  listNotificationMenu,
  markAllNotificationsRead,
  markNotificationsOpened,
  openNotification,
  recordNotification,
} from "./notifications.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

function minutesAfter(minutes: number) {
  return new Date(NOW.getTime() + minutes * 60_000);
}

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let platformAdmin: typeof schema.users.$inferSelect;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  platformAdmin = db
    .insert(schema.users)
    .values({ name: "Pat Admin", email: "pat@example.com", role: UserRole.Admin })
    .returning()
    .get();
});

function changeRole(userId: number, newRole: UserRole, when = NOW) {
  return recordNotification(
    db,
    {
      type: NotificationType.RoleChanged,
      actorId: platformAdmin.id,
      userId,
      newRole,
    },
    when
  );
}

describe("Your role changed", () => {
  it("notifies the user whose role changed, and not the Platform Admin who changed it", () => {
    changeRole(base.user.id, UserRole.Instructor);

    expect(listNotificationMenu(db, base.user.id)).toMatchObject([
      {
        type: NotificationType.RoleChanged,
        actor: { name: "Pat Admin" },
        sentence: [
          { text: "Pat Admin changed your role to " },
          { text: "Instructor", bold: true },
        ],
        isRead: false,
        href: "/dashboard",
      },
    ]);
    expect(listNotificationMenu(db, platformAdmin.id)).toEqual([]);
  });

  it("records nothing when a Platform Admin changes their own role", () => {
    changeRole(platformAdmin.id, UserRole.Instructor);

    expect(listNotificationMenu(db, platformAdmin.id)).toEqual([]);
  });
});

describe("the bell count", () => {
  it("counts the user's unread Notifications", () => {
    changeRole(base.user.id, UserRole.Instructor);
    changeRole(base.user.id, UserRole.Student, minutesAfter(1));

    expect(getBellCount(db, base.user.id)).toBe(2);
    expect(getBellCount(db, platformAdmin.id)).toBe(0);
  });

  it("resets to 0 on opening without marking anything read", () => {
    changeRole(base.user.id, UserRole.Instructor);

    markNotificationsOpened(db, base.user.id, minutesAfter(1));

    expect(getBellCount(db, base.user.id)).toBe(0);
    expect(listNotificationMenu(db, base.user.id)).toMatchObject([
      { isRead: false },
    ]);
  });

  it("counts only Notifications created after the user last opened them", () => {
    changeRole(base.user.id, UserRole.Instructor);
    markNotificationsOpened(db, base.user.id, minutesAfter(1));

    changeRole(base.user.id, UserRole.Student, minutesAfter(2));

    expect(getBellCount(db, base.user.id)).toBe(1);
  });

  it("is not reset by another user opening theirs", () => {
    changeRole(base.user.id, UserRole.Instructor);

    markNotificationsOpened(db, base.instructor.id, minutesAfter(1));

    expect(getBellCount(db, base.user.id)).toBe(1);
  });
});

describe("opening a Notification", () => {
  it("marks it read and says where to go", () => {
    changeRole(base.user.id, UserRole.Instructor);
    const [row] = listNotificationMenu(db, base.user.id);

    expect(openNotification(db, base.user.id, row.id, minutesAfter(1))).toBe(
      "/dashboard"
    );
    expect(listNotificationMenu(db, base.user.id)).toMatchObject([
      { id: row.id, isRead: true },
    ]);
    expect(getBellCount(db, base.user.id)).toBe(0);
  });

  it("refuses someone else's Notification and leaves it unread", () => {
    changeRole(base.user.id, UserRole.Instructor);
    const [row] = listNotificationMenu(db, base.user.id);

    expect(
      openNotification(db, base.instructor.id, row.id, minutesAfter(1))
    ).toBeNull();
    expect(listNotificationMenu(db, base.user.id)).toMatchObject([
      { isRead: false },
    ]);
  });
});

describe("marking all as read", () => {
  it("marks every one of the user's Notifications read, and nobody else's", () => {
    changeRole(base.user.id, UserRole.Instructor);
    changeRole(base.user.id, UserRole.Student, minutesAfter(1));
    changeRole(base.instructor.id, UserRole.Student, minutesAfter(2));

    markAllNotificationsRead(db, base.user.id, minutesAfter(3));

    expect(
      listNotificationMenu(db, base.user.id).map((row) => row.isRead)
    ).toEqual([true, true]);
    expect(getBellCount(db, base.user.id)).toBe(0);
    expect(listNotificationMenu(db, base.instructor.id)).toMatchObject([
      { isRead: false },
    ]);
  });
});

describe("the Notification Menu", () => {
  it("shows the newest 8, newest first", () => {
    const roles = [UserRole.Instructor, UserRole.Student];
    for (let minute = 0; minute < 10; minute++) {
      changeRole(base.user.id, roles[minute % 2], minutesAfter(minute));
    }

    const rows = listNotificationMenu(db, base.user.id);

    expect(rows.map((row) => row.createdAt)).toEqual(
      [9, 8, 7, 6, 5, 4, 3, 2].map((minute) =>
        minutesAfter(minute).toISOString()
      )
    );
  });
});
