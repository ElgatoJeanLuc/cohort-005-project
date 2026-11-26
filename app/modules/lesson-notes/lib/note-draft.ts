import { MAX_NOTE_LENGTH } from "~/lib/notes";

export type NoteDraftStatus = "empty" | "unsaved" | "saved";

export type NoteDraft = {
  characters: number;
  maxCharacters: number;
  overLimit: boolean;
  status: NoteDraftStatus;
  canSave: boolean;
};

export function describeNoteDraft({
  draft,
  saved,
}: {
  draft: string;
  saved: string | null;
}): NoteDraft {
  const overLimit = draft.length > MAX_NOTE_LENGTH;
  const trimmed = draft.trim();
  // saveNote stores the body trimmed, so trailing whitespace is not a change.
  const status: NoteDraftStatus =
    trimmed === saved ? "saved" : trimmed.length === 0 ? "empty" : "unsaved";

  return {
    characters: draft.length,
    maxCharacters: MAX_NOTE_LENGTH,
    overLimit,
    status,
    // The save-note action rejects a blank body, so the button would only
    // ever produce an error.
    canSave: status === "unsaved" && !overLimit,
  };
}
