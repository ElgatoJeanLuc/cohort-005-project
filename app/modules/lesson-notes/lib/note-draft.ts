import { MAX_NOTE_LENGTH } from "~/lib/notes";

export type NoteDraftStatus = "empty" | "cleared" | "unsaved" | "saved";

export type NoteDraft = {
  characters: number;
  maxCharacters: number;
  overLimit: boolean;
  status: NoteDraftStatus;
  canSave: boolean;
};

/**
 * What the lesson notes editor should show for the text in the box (`draft`)
 * against the note last saved for the lesson (`saved`, null when there is
 * none): the character count against the limit, the draft's status, and
 * whether Save is worth pressing.
 */
export function describeNoteDraft({
  draft,
  saved,
}: {
  draft: string;
  saved: string | null;
}): NoteDraft {
  // saveNote stores the body trimmed, so surrounding whitespace neither
  // counts towards the limit nor makes the draft differ from the saved note.
  const trimmed = draft.trim();
  const overLimit = trimmed.length > MAX_NOTE_LENGTH;
  const status = statusOf(trimmed, saved);

  return {
    characters: trimmed.length,
    maxCharacters: MAX_NOTE_LENGTH,
    overLimit,
    status,
    // The save-note action rejects a blank body, so the button would only
    // ever produce an error.
    canSave: status === "unsaved" && !overLimit,
  };
}

function statusOf(trimmed: string, saved: string | null): NoteDraftStatus {
  if (trimmed === saved) return "saved";
  if (trimmed.length > 0) return "unsaved";
  // A blank note cannot be saved, so the note already stored stays put.
  return saved === null ? "empty" : "cleared";
}
