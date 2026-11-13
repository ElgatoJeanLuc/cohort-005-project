import { useEffect, useRef, useState } from "react";
import { Form, Link, useFetcher } from "react-router";
import { Bell } from "lucide-react";
import { cn } from "~/lib/utils";
import { UserAvatar } from "~/components/user-avatar";
import type { NotificationRow, SentencePart } from "~/lib/notifications.server";

export interface NotificationsSummary {
  bellCount: number;
  menu: NotificationRow[];
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < MINUTE) return "just now";
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)}m ago`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h ago`;
  if (ms < 2 * DAY) return "Yesterday";
  return `${Math.floor(ms / DAY)}d ago`;
}

function Sentence({ parts }: { parts: SentencePart[] }) {
  return (
    <>
      {parts.map((part, i) =>
        part.bold ? (
          <strong key={i} className="font-semibold text-foreground">
            {part.text}
          </strong>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  );
}

function CountBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-none text-white">
      {count > 9 ? "9+" : count}
    </span>
  );
}

/**
 * The bell in the sidebar header and the Notification Menu it opens. The
 * Menu shows the rows as they were when it opened, so nothing moves under the
 * cursor while it is open.
 */
export function NotificationBell({
  notifications,
}: {
  notifications: NotificationsSummary;
}) {
  const [openRows, setOpenRows] = useState<NotificationRow[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const fetcher = useFetcher();
  const isOpen = openRows !== null;

  useEffect(() => {
    if (!isOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (e.target instanceof Node && !ref.current?.contains(e.target)) {
        setOpenRows(null);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenRows(null);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  function toggle() {
    if (isOpen) {
      setOpenRows(null);
      return;
    }
    setOpenRows(notifications.menu);
    fetcher.submit(
      { intent: "mark-opened" },
      { method: "post", action: "/api/notifications" }
    );
  }

  function markAllRead() {
    setOpenRows((rows) => rows?.map((row) => ({ ...row, isRead: true })) ?? null);
    fetcher.submit(
      { intent: "mark-all-read" },
      { method: "post", action: "/api/notifications" }
    );
  }

  const bellCount = isOpen ? 0 : notifications.bellCount;

  return (
    <div ref={ref} className="relative ml-auto">
      <button
        type="button"
        onClick={toggle}
        title="Notifications"
        aria-label={
          bellCount > 0 ? `Notifications (${bellCount} new)` : "Notifications"
        }
        aria-expanded={isOpen}
        className={cn(
          "relative rounded-md p-1.5 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          isOpen && "bg-sidebar-accent text-sidebar-accent-foreground"
        )}
      >
        <Bell className="size-5" />
        <CountBadge count={bellCount} />
      </button>

      {openRows && (
        <div className="absolute left-full top-0 z-40 ml-3 w-96 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="font-semibold">Notifications</span>
            <button
              type="button"
              onClick={markAllRead}
              disabled={openRows.every((row) => row.isRead)}
              className="text-xs font-medium text-primary hover:underline disabled:pointer-events-none disabled:opacity-50"
            >
              Mark all as read
            </button>
          </div>
          <div className="max-h-[28rem] overflow-y-auto">
            {openRows.length === 0 && (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                You're all caught up.
              </p>
            )}
            {openRows.map((row) => (
              <Form
                key={row.id}
                method="post"
                action="/api/notifications"
                onSubmit={() => setOpenRows(null)}
              >
                <input type="hidden" name="intent" value="open-notification" />
                <input type="hidden" name="notificationId" value={row.id} />
                <button
                  type="submit"
                  className={cn(
                    "flex w-full gap-3 border-b border-l-4 px-4 py-3 text-left transition-colors hover:bg-blue-50 dark:hover:bg-blue-950/40",
                    row.isRead
                      ? "border-l-transparent"
                      : "border-l-red-500 bg-red-50 dark:bg-red-950/30"
                  )}
                >
                  <UserAvatar
                    name={row.actor.name}
                    avatarUrl={row.actor.avatarUrl}
                    className="shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-sm",
                        row.isRead
                          ? "text-muted-foreground"
                          : "font-medium text-foreground"
                      )}
                    >
                      <Sentence parts={row.sentence} />
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground/70">
                      {timeAgo(row.createdAt)}
                    </p>
                  </div>
                  {!row.isRead && (
                    <span
                      title="Unread"
                      className="mt-1.5 size-2.5 shrink-0 rounded-full bg-red-600 ring-2 ring-red-200 dark:ring-red-900"
                    />
                  )}
                </button>
              </Form>
            ))}
          </div>
          <Link
            to="/notifications"
            onClick={() => setOpenRows(null)}
            className="block w-full px-4 py-2.5 text-center text-sm font-medium text-primary transition-colors hover:bg-blue-50 dark:hover:bg-blue-950/40"
          >
            See all Notifications
          </Link>
        </div>
      )}
    </div>
  );
}
