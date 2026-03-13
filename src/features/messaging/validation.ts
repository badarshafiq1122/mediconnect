import { z } from "zod";
import { sanitizeMessageBody } from "@/lib/sanitize";

export const MAX_MESSAGE_LENGTH = 2000;

const id = z.string().trim().min(1, "Missing identifier").max(64, "Invalid identifier");

export const sendMessageSchema = z.object({
  appointmentId: id,
  // The raw cap bounds the work sanitisation has to do; the real limit applies to the cleaned text.
  body: z
    .string()
    .max(MAX_MESSAGE_LENGTH * 2, `Messages are limited to ${MAX_MESSAGE_LENGTH} characters`)
    .transform(sanitizeMessageBody)
    .pipe(
      z
        .string()
        .min(1, "Write a message before sending")
        .max(MAX_MESSAGE_LENGTH, `Messages are limited to ${MAX_MESSAGE_LENGTH} characters`),
    ),
});

export const threadSchema = z.object({ appointmentId: id });
