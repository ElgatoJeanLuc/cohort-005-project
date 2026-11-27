export type HeroAction = {
  label: string;
  to: string;
  /** The one action the hero leads with. */
  primary: boolean;
};

const browseCourses: HeroAction = {
  label: "Browse Courses",
  to: "/courses",
  primary: true,
};

const signUp: HeroAction = {
  label: "Sign Up",
  to: "/signup",
  primary: false,
};

const goToDashboard: HeroAction = {
  label: "Go to Dashboard",
  to: "/dashboard",
  primary: false,
};

/**
 * The calls to action in the landing page hero: browsing first, then the
 * next step that fits the visitor.
 */
export function heroActions(visitor: { signedIn: boolean }): HeroAction[] {
  // A signed-in visitor already has an account, so "Sign Up" would be a dead end.
  return [browseCourses, visitor.signedIn ? goToDashboard : signUp];
}
