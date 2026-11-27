import { describe, expect, it } from "vitest";
import { heroActions } from "../index";

describe("heroActions", () => {
  it("offers browsing first, then sign-up, to a signed-out visitor", () => {
    expect(heroActions({ signedIn: false })).toEqual([
      { label: "Browse Courses", to: "/courses", variant: "default" },
      { label: "Sign Up", to: "/signup", variant: "outline" },
    ]);
  });

  it("offers the dashboard instead of sign-up to a signed-in visitor", () => {
    expect(heroActions({ signedIn: true })).toEqual([
      { label: "Browse Courses", to: "/courses", variant: "default" },
      { label: "Go to Dashboard", to: "/dashboard", variant: "outline" },
    ]);
  });

  it("makes exactly one action the primary one", () => {
    for (const signedIn of [true, false]) {
      const primaries = heroActions({ signedIn }).filter(
        (action) => action.variant === "default"
      );
      expect(primaries).toHaveLength(1);
    }
  });
});
