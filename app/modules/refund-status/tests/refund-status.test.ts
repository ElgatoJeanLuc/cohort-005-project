import { describe, it, expect } from "vitest";
import { RefundStatus } from "~/db/schema";
import { refundStatusBadge } from "../index";

describe("refundStatusBadge", () => {
  it("shows an Open request in blue", () => {
    expect(refundStatusBadge(RefundStatus.Open)).toEqual({
      label: "Open",
      className:
        "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    });
  });

  it("shows an Approved request in green", () => {
    expect(refundStatusBadge(RefundStatus.Approved)).toEqual({
      label: "Approved",
      className:
        "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    });
  });

  it("shows a Declined request in red", () => {
    expect(refundStatusBadge(RefundStatus.Declined)).toEqual({
      label: "Declined",
      className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    });
  });

  it("never uses amber, which marks a broken refund rule", () => {
    for (const status of Object.values(RefundStatus)) {
      expect(refundStatusBadge(status).className).not.toContain("amber");
    }
  });

  it("gives every status its own colour", () => {
    const classNames = Object.values(RefundStatus).map(
      (status) => refundStatusBadge(status).className
    );
    expect(new Set(classNames).size).toBe(classNames.length);
  });
});
