// PROTOTYPE: three variants of the Notification Feed, switchable via
// `?variant=A|B|C` on every page inside the app layout. Sample Notifications
// live in memory and reset when you switch user. Never merge into main.
//
// Question: how should the In-app list (Notification Feed) look and behave?
// - A: bell in the sidebar header, dropdown. Opening clears the count; each
//   Notification stays unread until clicked.
// - B: "Notifications" sidebar item, full page. Read only by clicking it or
//   marking it; filters, day groups, action buttons.
// - C: bell top-right, side drawer split into "Needs you" and "Updates".
//   Opening the drawer marks everything read.
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import {
  Bell,
  BookOpen,
  CheckCheck,
  MessageSquare,
  Receipt,
  Reply,
  ShieldCheck,
  UserPlus,
  X,
  Plus,
  RotateCcw,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { UserAvatar } from "~/components/user-avatar";
import { Button } from "~/components/ui/button";
import { PrototypeSwitcher } from "~/components/prototype-switcher";

type NotificationType =
  | "refund-decided"
  | "reply"
  | "seat-claimed"
  | "new-question"
  | "course-status"
  | "new-refund-request"
  | "role-changed";

interface SampleNotification {
  id: string;
  type: NotificationType;
  actor: string;
  // Sentence with the object in **double stars**, rendered bold.
  text: string;
  excerpt?: string;
  to: string;
  createdAt: number;
  read: boolean;
}

const typeInfo: Record<
  NotificationType,
  { label: string; icon: typeof Bell; tint: string; needsAction?: string }
> = {
  "refund-decided": {
    label: "Refund Request decided",
    icon: Receipt,
    tint: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  reply: {
    label: "Reply to your Question",
    icon: Reply,
    tint: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  },
  "seat-claimed": {
    label: "Seat claimed",
    icon: UserPlus,
    tint: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  },
  "new-question": {
    label: "New Question",
    icon: MessageSquare,
    tint: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    needsAction: "Answer",
  },
  "course-status": {
    label: "Course status changed",
    icon: BookOpen,
    tint: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  },
  "new-refund-request": {
    label: "New Refund Request",
    icon: Receipt,
    tint: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    needsAction: "Review",
  },
  "role-changed": {
    label: "Your role changed",
    icon: ShieldCheck,
    tint: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  },
};

type Seed = Omit<SampleNotification, "id" | "createdAt" | "read"> & {
  minutesAgo: number;
  read?: boolean;
};

const MIN = 60_000;
const HOUR = 60;
const DAY = 24 * HOUR;

const studentSeeds: Seed[] = [
  {
    type: "reply",
    actor: "Sarah Chen",
    text: "Sarah Chen replied to your Question on **Primitive Types**",
    excerpt:
      "Good catch. `unknown` is the safer choice there, because the compiler makes you narrow it before you use it.",
    to: "/courses/introduction-to-typescript/lessons/4",
    minutesAgo: 4,
  },
  {
    type: "reply",
    actor: "Alex Rivera",
    text: "Alex Rivera replied to your Question on **Installing and Configuring TypeScript**",
    excerpt: "Try deleting node_modules and running npm install again.",
    to: "/courses/introduction-to-typescript/lessons/2",
    minutesAgo: 3 * HOUR,
  },
  {
    type: "refund-decided",
    actor: "Alex Rivera",
    text: "Your Refund Request for **Design Systems with Tailwind** was declined",
    excerpt:
      "You've completed 80% of the course, which is past our refund window. Happy to help if something isn't working.",
    to: "/courses/design-systems-with-tailwind",
    minutesAgo: DAY + 2 * HOUR,
  },
  {
    type: "refund-decided",
    actor: "Alex Rivera",
    text: "Your Refund Request for **Building REST APIs with Node.js** was approved",
    to: "/dashboard",
    minutesAgo: 4 * DAY,
    read: true,
  },
  {
    type: "reply",
    actor: "Marcus Johnson",
    text: "Marcus Johnson replied to your Question on **Routing basics**",
    excerpt: "Yes, the order of middleware matters here.",
    to: "/courses/building-rest-apis-with-nodejs",
    minutesAgo: 9 * DAY,
    read: true,
  },
];

const teamAdminSeeds: Seed[] = [
  {
    type: "seat-claimed",
    actor: "James Park",
    text: "James Park claimed a Seat on your Team Licence for **Introduction to TypeScript** (4 of 10 used)",
    to: "/team",
    minutesAgo: 25,
  },
  {
    type: "seat-claimed",
    actor: "Olivia Martinez",
    text: "Olivia Martinez claimed a Seat on your Team Licence for **Introduction to TypeScript** (3 of 10 used)",
    to: "/team",
    minutesAgo: 2 * DAY,
    read: true,
  },
];

const instructorSeeds: Seed[] = [
  {
    type: "new-question",
    actor: "Emma Wilson",
    text: "Emma Wilson asked a Question on **What is TypeScript?**",
    excerpt: "Is TypeScript worth it for a small side project, or only for teams?",
    to: "/courses/introduction-to-typescript/lessons/1",
    minutesAgo: 2,
  },
  {
    type: "new-question",
    actor: "James Park",
    text: "James Park asked a Question on **Primitive Types**",
    excerpt: "Why does `typeof null` return \"object\"?",
    to: "/courses/introduction-to-typescript/lessons/4",
    minutesAgo: 50,
  },
  {
    type: "course-status",
    actor: "Alex Rivera",
    text: "Alex Rivera unpublished **Design Systems with Tailwind**",
    to: "/instructor/3",
    minutesAgo: 5 * HOUR,
  },
  {
    type: "new-question",
    actor: "Sophia Davis",
    text: "Sophia Davis asked a Question on **Your First TypeScript Program**",
    excerpt: "My tsc command isn't found after installing. What did I miss?",
    to: "/courses/introduction-to-typescript/lessons/3",
    minutesAgo: DAY + 3 * HOUR,
    read: true,
  },
  {
    type: "role-changed",
    actor: "Alex Rivera",
    text: "Alex Rivera changed your role to **Instructor**",
    to: "/instructor",
    minutesAgo: 20 * DAY,
    read: true,
  },
];

const adminSeeds: Seed[] = [
  {
    type: "new-refund-request",
    actor: "Olivia Martinez",
    text: "Olivia Martinez requested a refund for **Building REST APIs with Node.js** ($49.00)",
    excerpt: "The course didn't cover Express 5 like the description said.",
    to: "/admin/refunds",
    minutesAgo: 8,
  },
  {
    type: "new-refund-request",
    actor: "Bossy McBossface",
    text: "Bossy McBossface requested a refund for a Team Licence of **Introduction to TypeScript** (10 Seats, $390.00)",
    to: "/admin/refunds",
    minutesAgo: 6 * HOUR,
  },
  {
    type: "new-refund-request",
    actor: "Liam Thompson",
    text: "Liam Thompson requested a refund for **Practical Data Visualisation** ($39.00)",
    to: "/admin/refunds",
    minutesAgo: 2 * DAY,
    read: true,
  },
];

// Pool used by "Simulate new" so the count can be watched going up.
const extraSeeds: Record<string, Seed[]> = {
  student: [
    {
      type: "reply",
      actor: "Priya Nair",
      text: "Priya Nair replied to your Question on **Primitive Types**",
      excerpt: "Adding to Sarah's answer: `never` is the other one to know.",
      to: "/courses/introduction-to-typescript/lessons/4",
      minutesAgo: 0,
    },
  ],
  instructor: [
    {
      type: "new-question",
      actor: "Ava Nakamura",
      text: "Ava Nakamura asked a Question on **Installing and Configuring TypeScript**",
      excerpt: "Should strict mode be on from day one?",
      to: "/courses/introduction-to-typescript/lessons/2",
      minutesAgo: 0,
    },
  ],
  admin: [
    {
      type: "new-refund-request",
      actor: "Noah Blackwood",
      text: "Noah Blackwood requested a refund for **Design Systems with Tailwind** ($59.00)",
      to: "/admin/refunds",
      minutesAgo: 0,
    },
  ],
};

function seedsFor(role: string | null, isTeamAdmin: boolean): Seed[] {
  if (role === "admin") return adminSeeds;
  if (role === "instructor") return instructorSeeds;
  if (role === "student")
    return isTeamAdmin ? [...teamAdminSeeds, ...studentSeeds] : studentSeeds;
  return [];
}

function build(seeds: Seed[]): SampleNotification[] {
  const now = Date.now();
  return seeds
    .map((s, i) => ({
      ...s,
      id: `${now}-${i}-${Math.random()}`,
      createdAt: now - s.minutesAgo * MIN,
      read: s.read ?? false,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

function timeAgo(ts: number) {
  const mins = Math.floor((Date.now() - ts) / MIN);
  if (mins < 1) return "just now";
  if (mins < HOUR) return `${mins}m ago`;
  if (mins < DAY) return `${Math.floor(mins / HOUR)}h ago`;
  if (mins < 2 * DAY) return "Yesterday";
  return `${Math.floor(mins / DAY)}d ago`;
}

function dayGroup(ts: number) {
  const mins = (Date.now() - ts) / MIN;
  if (mins < DAY) return "Today";
  if (mins < 2 * DAY) return "Yesterday";
  return "Earlier";
}

function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split("**").map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold text-foreground">
            {part}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count === 0) return null;
  return (
    <span
      className={cn(
        "flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-none text-white",
        className
      )}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

// ─── Shared state ──────────────────────────────────────────────────────────

const VARIANTS = [
  { key: "A", name: "Sidebar bell + dropdown" },
  { key: "B", name: "Sidebar item + full page" },
  { key: "C", name: "Top-right bell + split drawer" },
];

interface PrototypeUser {
  id: number;
  role: string;
}

export function useNotificationFeedPrototype(
  currentUser: PrototypeUser | null,
  isTeamAdmin: boolean
) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [variant, setVariant] = useState(
    () => searchParams.get("variant") ?? "A"
  );
  const [items, setItems] = useState<SampleNotification[]>(() =>
    build(seedsFor(currentUser?.role ?? null, isTeamAdmin))
  );
  const [seenAt, setSeenAt] = useState(0);
  const [, tick] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const fromUrl = searchParams.get("variant");
    if (fromUrl && fromUrl !== variant) setVariant(fromUrl);
  }, [searchParams]);

  useEffect(() => {
    setItems(build(seedsFor(currentUser?.role ?? null, isTeamAdmin)));
    setSeenAt(0);
  }, [currentUser?.id, isTeamAdmin]);

  // Keep relative times fresh.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  function changeVariant(key: string) {
    setVariant(key);
    const next = new URLSearchParams(searchParams);
    next.set("variant", key);
    setSearchParams(next, { replace: true, preventScrollReset: true });
  }

  function simulateNew() {
    const pool = extraSeeds[currentUser?.role ?? ""] ?? [];
    if (pool.length === 0) return;
    const [fresh] = build([pool[0]]);
    setItems((prev) => [fresh, ...prev]);
  }

  function reset() {
    setItems(build(seedsFor(currentUser?.role ?? null, isTeamAdmin)));
    setSeenAt(0);
  }

  const state: FeedState = {
    items,
    seenAt,
    markSeen: () => setSeenAt(Date.now()),
    markRead: (id, read = true) =>
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read } : n))),
    markAllRead: () => setItems((prev) => prev.map((n) => ({ ...n, read: true }))),
    open: (n) => {
      setItems((prev) =>
        prev.map((m) => (m.id === n.id ? { ...m, read: true } : m))
      );
      navigate(`${n.to}?variant=${variant}`);
    },
  };

  const switcher = (
    <PrototypeSwitcher
      variants={VARIANTS}
      current={variant}
      onChange={changeVariant}
    >
      <button
        onClick={simulateNew}
        className="flex items-center gap-1 rounded-full px-2 py-1 text-xs hover:bg-white/15"
        title="Add a new sample Notification"
      >
        <Plus className="size-3" /> New
      </button>
      <button
        onClick={reset}
        className="flex items-center gap-1 rounded-full px-2 py-1 text-xs hover:bg-white/15"
        title="Reset sample Notifications"
      >
        <RotateCcw className="size-3" /> Reset
      </button>
    </PrototypeSwitcher>
  );

  if (!currentUser)
    return {
      variant,
      switcher: null,
      sidebarHeader: null,
      sidebarNavTop: null,
      mainOverride: null,
      floating: null,
    };

  return {
    variant,
    switcher,
    sidebarHeader: variant === "A" ? <VariantABell state={state} /> : null,
    sidebarNavTop: variant === "B" ? <VariantBNavItem state={state} /> : null,
    mainOverride:
      variant === "B" && searchParams.get("feed") === "1" ? (
        <VariantBPage state={state} />
      ) : null,
    floating: variant === "C" ? <VariantCDrawer state={state} /> : null,
  };
}

interface FeedState {
  items: SampleNotification[];
  seenAt: number;
  markSeen: () => void;
  markRead: (id: string, read?: boolean) => void;
  markAllRead: () => void;
  open: (n: SampleNotification) => void;
}

// ─── Variant A: bell in the sidebar header, dropdown ───────────────────────

function VariantABell({ state }: { state: FeedState }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unseen = state.items.filter((n) => n.createdAt > state.seenAt).length;

  useEffect(() => {
    if (!isOpen) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setIsOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [isOpen]);

  function toggle() {
    if (!isOpen) state.markSeen();
    setIsOpen(!isOpen);
  }

  return (
    <div ref={ref} className="relative ml-auto">
      <button
        onClick={toggle}
        title="Notifications"
        className={cn(
          "relative rounded-md p-1.5 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          isOpen && "bg-sidebar-accent text-sidebar-accent-foreground"
        )}
      >
        <Bell className="size-5" />
        <CountBadge count={unseen} className="absolute -right-1 -top-1" />
      </button>

      {isOpen && (
        <div className="absolute left-full top-0 z-40 ml-3 w-96 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="font-semibold">Notifications</span>
            <button
              onClick={state.markAllRead}
              className="text-xs font-medium text-primary hover:underline"
            >
              Mark all as read
            </button>
          </div>
          <div className="max-h-[28rem] overflow-y-auto">
            {state.items.length === 0 && (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                You're all caught up.
              </p>
            )}
            {state.items.slice(0, 8).map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  setIsOpen(false);
                  state.open(n);
                }}
                className={cn(
                  "flex w-full gap-3 border-b border-l-4 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-blue-50 dark:hover:bg-blue-950/40",
                  n.read
                    ? "border-l-transparent"
                    : "border-l-red-500 bg-red-50 dark:bg-red-950/30"
                )}
              >
                <UserAvatar name={n.actor} avatarUrl={null} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-sm",
                      n.read
                        ? "text-muted-foreground"
                        : "font-medium text-foreground"
                    )}
                  >
                    <RichText text={n.text} />
                  </p>
                  {n.excerpt && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground/80">
                      “{n.excerpt}”
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    {timeAgo(n.createdAt)}
                  </p>
                </div>
                {!n.read && (
                  <span
                    title="Unread"
                    className="mt-1.5 size-2.5 shrink-0 rounded-full bg-red-600 ring-2 ring-red-200 dark:ring-red-900"
                  />
                )}
              </button>
            ))}
          </div>
          {state.items.length > 8 && (
            <div className="border-t px-4 py-2 text-center text-xs text-muted-foreground">
              Showing the latest 8
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Variant B: sidebar item + full page ───────────────────────────────────

// The page is shown in place of the route while `feed` is in the URL.
function useFeedOpen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const isOpen = searchParams.get("feed") === "1";
  function setOpen(open: boolean) {
    const next = new URLSearchParams(searchParams);
    if (open) next.set("feed", "1");
    else next.delete("feed");
    setSearchParams(next, { preventScrollReset: true });
  }
  return [isOpen, setOpen] as const;
}

function VariantBNavItem({ state }: { state: FeedState }) {
  const [isOpen, setOpen] = useFeedOpen();
  const unread = state.items.filter((n) => !n.read).length;
  return (
    <button
      onClick={() => setOpen(!isOpen)}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        isOpen
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
    >
      <Bell className="size-4" />
      Notifications
      <CountBadge count={unread} className="ml-auto" />
    </button>
  );
}

function VariantBPage({ state }: { state: FeedState }) {
  const [isOpen] = useFeedOpen();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  if (!isOpen) return null;

  const shown = state.items.filter((n) => filter === "all" || !n.read);
  const unread = state.items.filter((n) => !n.read).length;
  const groups = ["Today", "Yesterday", "Earlier"]
    .map((g) => ({ g, rows: shown.filter((n) => dayGroup(n.createdAt) === g) }))
    .filter((x) => x.rows.length > 0);

  return (
    <div className="mx-auto max-w-3xl p-6 lg:p-8">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold">Notifications</h1>
          <p className="mt-1 text-muted-foreground">
            {unread === 0 ? "You're all caught up." : `${unread} unread`}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={state.markAllRead}
          disabled={unread === 0}
        >
          <CheckCheck /> Mark all as read
        </Button>
      </div>

      <div className="mb-4 inline-flex rounded-md bg-muted p-1 text-sm">
        {(["all", "unread"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded px-3 py-1 font-medium capitalize",
              filter === f
                ? "bg-background shadow-sm"
                : "text-muted-foreground"
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {groups.length === 0 && (
        <p className="rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          No unread Notifications.
        </p>
      )}

      {groups.map(({ g, rows }) => (
        <section key={g} className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {g}
          </h2>
          <div className="divide-y rounded-lg border">
            {rows.map((n) => {
              const info = typeInfo[n.type];
              const Icon = info.icon;
              return (
                <div
                  key={n.id}
                  onClick={() => state.open(n)}
                  className={cn(
                    "group flex cursor-pointer gap-4 p-4 transition-colors hover:bg-accent/50",
                    !n.read && "bg-primary/5"
                  )}
                >
                  <div
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-full",
                      info.tint
                    )}
                  >
                    <Icon className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium uppercase tracking-wide">
                        {info.label}
                      </span>
                      <span>·</span>
                      <span>{timeAgo(n.createdAt)}</span>
                    </div>
                    <p
                      className={cn(
                        "text-sm",
                        n.read ? "text-muted-foreground" : "text-foreground"
                      )}
                    >
                      <RichText text={n.text} />
                    </p>
                    {n.excerpt && (
                      <blockquote className="mt-2 border-l-2 pl-3 text-sm text-muted-foreground">
                        {n.excerpt}
                      </blockquote>
                    )}
                    {info.needsAction && (
                      <Button size="xs" className="mt-3">
                        {info.needsAction}
                      </Button>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {!n.read && (
                      <span className="size-2.5 rounded-full bg-primary" />
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        state.markRead(n.id, !n.read);
                      }}
                      className="text-xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground hover:underline group-hover:opacity-100"
                    >
                      Mark as {n.read ? "unread" : "read"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

// ─── Variant C: top-right bell, drawer split by "Needs you" / "Updates" ────

function VariantCDrawer({ state }: { state: FeedState }) {
  const [isOpen, setIsOpen] = useState(false);
  // Ids that were unread when the drawer opened: shown as "new" this time only.
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const unread = state.items.filter((n) => !n.read).length;
  const location = useLocation();

  useEffect(() => setIsOpen(false), [location.pathname]);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  // New Notifications arriving while open are read on arrival too.
  useEffect(() => {
    if (!isOpen || unread === 0) return;
    setFreshIds(
      (prev) =>
        new Set([...prev, ...state.items.filter((n) => !n.read).map((n) => n.id)])
    );
    state.markAllRead();
  }, [isOpen, unread]);

  function openDrawer() {
    setFreshIds(new Set(state.items.filter((n) => !n.read).map((n) => n.id)));
    state.markAllRead();
    setIsOpen(true);
  }

  const needsYou = state.items.filter((n) => typeInfo[n.type].needsAction);
  const updates = state.items.filter((n) => !typeInfo[n.type].needsAction);

  function Row({ n }: { n: SampleNotification }) {
    const info = typeInfo[n.type];
    const Icon = info.icon;
    const fresh = freshIds.has(n.id);
    return (
      <button
        onClick={() => state.open(n)}
        className="flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent"
      >
        <Icon
          className={cn(
            "mt-0.5 size-4 shrink-0",
            fresh ? "text-primary" : "text-muted-foreground"
          )}
        />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-sm",
              fresh ? "text-foreground" : "text-muted-foreground"
            )}
          >
            <RichText text={n.text} />
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground/70">
            {timeAgo(n.createdAt)}
          </p>
        </div>
        {fresh && (
          <span className="mt-0.5 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">
            New
          </span>
        )}
      </button>
    );
  }

  return (
    <>
      <button
        onClick={openDrawer}
        title="Notifications"
        className="fixed right-6 top-3 z-30 flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-accent"
      >
        <Bell className="size-4" />
        {unread > 0 ? (
          <span className="text-red-600">{unread} new</span>
        ) : (
          <span className="text-muted-foreground">Notifications</span>
        )}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setIsOpen(false)}
          />
          <aside className="absolute right-0 top-0 flex h-full w-[26rem] flex-col border-l bg-background shadow-2xl">
            <div className="flex h-14 items-center justify-between border-b px-4">
              <span className="font-semibold">Notifications</span>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {needsYou.length > 0 && (
                <section className="mb-4">
                  <h2 className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-red-600">
                    Needs you
                  </h2>
                  {needsYou.map((n) => (
                    <Row key={n.id} n={n} />
                  ))}
                </section>
              )}
              <section>
                <h2 className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Updates
                </h2>
                {updates.length === 0 && (
                  <p className="px-3 py-2 text-sm text-muted-foreground">
                    Nothing yet.
                  </p>
                )}
                {updates.map((n) => (
                  <Row key={n.id} n={n} />
                ))}
              </section>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
