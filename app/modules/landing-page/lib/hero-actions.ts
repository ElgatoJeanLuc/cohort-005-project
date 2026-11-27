export type HeroAction = {
  label: string;
  to: string;
  variant: "default" | "outline";
};

const browseCourses: HeroAction = {
  label: "Browse Courses",
  to: "/courses",
  variant: "default",
};

const signUp: HeroAction = {
  label: "Sign Up",
  to: "/signup",
  variant: "outline",
};

const goToDashboard: HeroAction = {
  label: "Go to Dashboard",
  to: "/dashboard",
  variant: "outline",
};

export function heroActionsFor(signedIn: boolean): HeroAction[] {
  // A signed-in visitor already has an account, so "Sign Up" would be a dead end.
  return [browseCourses, signedIn ? goToDashboard : signUp];
}
