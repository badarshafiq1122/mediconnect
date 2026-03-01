import { NextResponse } from "next/server";
import { errorResponse, NO_STORE } from "@/lib/http";
import { requireActor } from "@/lib/session";
import { listMessages } from "@/features/messaging/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const actor = await requireActor("patient", "doctor");
    const { id } = await context.params;
    return NextResponse.json({ messages: await listMessages(actor, id) }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}
