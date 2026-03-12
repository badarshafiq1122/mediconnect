"use server";

import { z } from "zod";
import { failure, parseInput, success, toFailure, type ActionResult } from "@/lib/action";
import { requireActor } from "@/lib/session";
import { markNotificationsRead } from "@/features/notifications/service";

const markReadSchema = z.object({
  ids: z.array(z.string().min(1).max(64)).max(100).optional(),
});

export async function markNotificationsReadAction(input: unknown = {}): Promise<ActionResult<{ marked: number }>> {
  try {
    const actor = await requireActor();
    const parsed = parseInput(markReadSchema, input);
    if (!parsed.ok) return failure(parsed.error, parsed.fieldErrors);
    return success({ marked: await markNotificationsRead(actor.id, parsed.data.ids) });
  } catch (error) {
    return toFailure(error);
  }
}
