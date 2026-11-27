import type { RefundStatus } from "~/db/schema";
import { REFUND_STATUS_BADGES, type RefundStatusBadge } from "./lib/palette";

export type { RefundStatusBadge };

/**
 * The label and colour a Refund Request's status is shown with. The buyer's
 * settings page and the Platform Admin's review page share this palette.
 */
export function refundStatusBadge(status: RefundStatus): RefundStatusBadge {
  return REFUND_STATUS_BADGES[status];
}
