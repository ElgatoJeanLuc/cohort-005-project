import { useState } from "react";
import { useFetcher } from "react-router";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { Check, NotebookPen } from "lucide-react";
import { cn, formatRelativeTime } from "~/lib/utils";
import { LessonSection } from "~/components/lesson-section";
import {
  describeNoteDraft,
  type NoteDraftStatus,
} from "~/modules/lesson-notes";
import type { Route } from "../../routes/+types/courses.$slug.lessons.$lessonId";

type LessonLoaderData = Route.ComponentProps["loaderData"];

export function LessonNote({
  note,
}: {
  note: Extract<LessonLoaderData, { view: "full" }>["note"];
}) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const [body, setBody] = useState(note?.body ?? "");
  const draft = describeNoteDraft({ draft: body, saved: note?.body ?? null });
  const isSaving = fetcher.state !== "idle";
  const error = fetcher.data?.error;

  return (
    <LessonSection
      icon={NotebookPen}
      title="Your notes"
      description="Only you can read these. Every note you write is collected on your Saved page."
    >
      <fetcher.Form method="post" className="space-y-2">
        <input type="hidden" name="intent" value="save-note" />
        <Textarea
          name="body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={4}
          placeholder="Jot down what you want to remember from this lesson..."
          aria-label="Your notes"
          className="min-h-28"
        />
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={isSaving || !draft.canSave}>
            {isSaving ? "Saving..." : "Save note"}
          </Button>
          {error ? (
            <span className="text-sm text-destructive">{error}</span>
          ) : (
            <NoteStatus status={draft.status} updatedAt={note?.updatedAt} />
          )}
          <span
            className={cn(
              "ml-auto text-xs",
              draft.overLimit ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {draft.characters} / {draft.maxCharacters}
          </span>
        </div>
      </fetcher.Form>
    </LessonSection>
  );
}

function NoteStatus({
  status,
  updatedAt,
}: {
  status: NoteDraftStatus;
  updatedAt: string | undefined;
}) {
  if (status === "unsaved") {
    return (
      <span className="text-xs text-muted-foreground">Unsaved changes</span>
    );
  }
  if (status === "saved" && updatedAt) {
    return (
      <span
        suppressHydrationWarning
        className="flex items-center gap-1 text-xs text-muted-foreground"
      >
        <Check className="size-3.5" />
        Saved {formatRelativeTime(updatedAt)}
      </span>
    );
  }
  return null;
}
