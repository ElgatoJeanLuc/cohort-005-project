## Verification checks

Run `npm run check` (typecheck, lint, tests) before you report a change to `app/` as complete. CI runs the same command.

## When something breaks

| Symptom                                              | Cause                                                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 401 "Select a user from the DevUI panel"             | No user in the session — switch users and country in the floating panel (`app/components/dev-ui.tsx`). |
| `tsc` reports every `./+types/*` import missing      | Typegen has not run. Use `npm run typecheck`, which runs `react-router typegen` first.                 |
| `Cannot find module` for a package in `package.json` | `node_modules` was installed for another branch. Run `npm ci`.                                         |

## Agent skills

### Issue tracker

Issues and PRDs live as GitHub issues on your own copy of this repo (the `origin` remote), never on `ai-hero-dev/cohort-005-project`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.
