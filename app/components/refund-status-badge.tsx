import type { RefundStatus } from "~/db/schema";
import { refundStatusBadge } from "~/modules/refund-status";

export function RefundStatusBadge({ status }: { status: RefundStatus }) {
  const badge = refundStatusBadge(status);
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
    >
      {badge.label}
    </span>
  );
}
