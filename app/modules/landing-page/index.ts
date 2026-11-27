import { heroActionsFor, type HeroAction } from "./lib/hero-actions";

export type { HeroAction };

/**
 * The calls to action in the landing page hero: browsing first, then the
 * next step that fits the visitor.
 */
export function heroActions(visitor: { signedIn: boolean }): HeroAction[] {
  return heroActionsFor(visitor.signedIn);
}
