import { describe, it, expect } from "vitest";
import { describeNoteDraft } from "../index";
import { MAX_NOTE_LENGTH } from "~/lib/notes";

describe("describeNoteDraft", () => {
  it("counts the characters in the draft against the note limit", () => {
    const draft = describeNoteDraft({ draft: "Result types", saved: null });

    expect(draft.characters).toBe(12);
    expect(draft.maxCharacters).toBe(MAX_NOTE_LENGTH);
  });

  it("is empty, and cannot be saved, when nothing has been written", () => {
    expect(describeNoteDraft({ draft: "", saved: null })).toMatchObject({
      status: "empty",
      canSave: false,
    });
  });

  it("treats a draft of only whitespace as empty", () => {
    expect(describeNoteDraft({ draft: "  \n ", saved: null })).toMatchObject({
      status: "empty",
      canSave: false,
    });
  });

  it("is unsaved, and can be saved, once the Student writes something", () => {
    expect(
      describeNoteDraft({ draft: "Use Result<T>", saved: null })
    ).toMatchObject({ status: "unsaved", canSave: true });
  });

  it("is saved when the draft matches the saved note", () => {
    expect(
      describeNoteDraft({ draft: "Use Result<T>", saved: "Use Result<T>" })
    ).toMatchObject({ status: "saved", canSave: false });
  });

  it("is saved when the draft differs from the saved note only by surrounding whitespace", () => {
    expect(
      describeNoteDraft({ draft: "  Use Result<T>\n", saved: "Use Result<T>" })
    ).toMatchObject({ status: "saved", canSave: false });
  });

  it("is unsaved when the draft differs from the saved note", () => {
    expect(
      describeNoteDraft({ draft: "Use Result<T, E>", saved: "Use Result<T>" })
    ).toMatchObject({ status: "unsaved", canSave: true });
  });

  it("is cleared, and cannot be saved, when the Student empties a saved note", () => {
    expect(
      describeNoteDraft({ draft: " \n", saved: "Use Result<T>" })
    ).toMatchObject({ status: "cleared", canSave: false });
  });

  it("counts the draft as saveNote will store it, without surrounding whitespace", () => {
    const draft = describeNoteDraft({
      draft: `  ${"a".repeat(MAX_NOTE_LENGTH)}\n`,
      saved: null,
    });

    expect(draft).toMatchObject({
      characters: MAX_NOTE_LENGTH,
      overLimit: false,
      canSave: true,
    });
  });

  it("can be saved at exactly the limit", () => {
    const draft = describeNoteDraft({
      draft: "a".repeat(MAX_NOTE_LENGTH),
      saved: null,
    });

    expect(draft).toMatchObject({ overLimit: false, canSave: true });
  });

  it("cannot be saved one character over the limit", () => {
    const draft = describeNoteDraft({
      draft: "a".repeat(MAX_NOTE_LENGTH + 1),
      saved: null,
    });

    expect(draft).toMatchObject({
      overLimit: true,
      status: "unsaved",
      canSave: false,
    });
  });
});
