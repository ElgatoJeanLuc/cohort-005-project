import {
  describeNoteDraft as describe,
  type NoteDraft,
} from "./lib/note-draft";

export type { NoteDraft, NoteDraftStatus } from "./lib/note-draft";

/**
 * What the lesson notes editor should show for the text in the box (`draft`)
 * against the note last saved for the lesson (`saved`, null when there is
 * none): the character count against the limit, whether the draft is
 * saved, unsaved or empty, and whether Save is worth pressing.
 */
export function describeNoteDraft(input: {
  draft: string;
  saved: string | null;
}): NoteDraft {
  return describe(input);
}
