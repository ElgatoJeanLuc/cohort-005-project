import { RefundStatus } from "~/db/schema";

export type RefundStatusBadge = { label: string; className: string };

// Open is blue rather than amber: amber already means a broken refund rule on
// the admin page, and an Open badge must not read as a warning.
export const REFUND_STATUS_BADGES: Record<RefundStatus, RefundStatusBadge> = {
  [RefundStatus.Open]: {
    label: "Open",
    className:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  },
  [RefundStatus.Approved]: {
    label: "Approved",
    className:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  },
  [RefundStatus.Declined]: {
    label: "Declined",
    className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  },
};
