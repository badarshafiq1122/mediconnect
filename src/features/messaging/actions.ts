"use server";

import { failure, parseInput, success, toFailure, type ActionResult } from "@/lib/action";
import { requireActor } from "@/lib/session";
import { markThreadRead, sendMessage, type MessageDTO } from "@/features/messaging/service";
import { sendMessageSchema, threadSchema } from "@/features/messaging/validation";

export async function sendMessageAction(input: unknown): Promise<ActionResult<{ message: MessageDTO }>> {
  try {
    const actor = await requireActor("patient", "doctor");
    const parsed = parseInput(sendMessageSchema, input);
    if (!parsed.ok) return failure(parsed.error, parsed.fieldErrors);
    return success({ message: await sendMessage(actor, parsed.data) });
  } catch (error) {
    return toFailure(error);
  }
}

export async function markThreadReadAction(input: unknown): Promise<ActionResult<{ marked: number }>> {
  try {
    const actor = await requireActor("patient", "doctor");
    const parsed = parseInput(threadSchema, input);
    if (!parsed.ok) return failure(parsed.error, parsed.fieldErrors);
    return success({ marked: await markThreadRead(actor, parsed.data.appointmentId) });
  } catch (error) {
    return toFailure(error);
  }
}
