import type { RefundStatus } from "~/db/schema";
import { REFUND_STATUS_BADGES, type RefundStatusStyle } from "./lib/palette";

export type { RefundStatusStyle };

/**
 * The label and colour a Refund Request's status is shown with. One palette,
 * so a status reads the same to the buyer and to the Platform Admin.
 */
export function refundStatusBadge(status: RefundStatus): RefundStatusStyle {
  return REFUND_STATUS_BADGES[status];
}
