import { data, redirect } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/api.notifications";
import { db } from "~/db";
import { getCurrentUserId } from "~/lib/session";
import { parseFormData } from "~/lib/validation";
import {
  markAllNotificationsRead,
  markNotificationsOpened,
  openNotification,
} from "~/lib/notifications.server";

const notificationActionSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("mark-opened") }),
  z.object({ intent: z.literal("mark-all-read") }),
  z.object({
    intent: z.literal("open-notification"),
    notificationId: z.coerce.number().int(),
  }),
]);

export async function action({ request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("You must be logged in.", { status: 401 });
  }

  const formData = await request.formData();
  const parsed = parseFormData(formData, notificationActionSchema);

  if (!parsed.success) {
    throw data("Invalid action.", { status: 400 });
  }

  const now = new Date();

  switch (parsed.data.intent) {
    case "mark-opened":
      markNotificationsOpened(db, currentUserId, now);
      return { success: true };
    case "mark-all-read":
      markAllNotificationsRead(db, currentUserId, now);
      return { success: true };
    case "open-notification": {
      const href = openNotification(
        db,
        currentUserId,
        parsed.data.notificationId,
        now
      );
      if (!href) throw data("Notification not found.", { status: 404 });
      return redirect(href);
    }
  }
}
