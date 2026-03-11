import { NextResponse } from "next/server";
import { errorResponse, NO_STORE } from "@/lib/http";
import { requireActor } from "@/lib/session";
import { getQueueSnapshot } from "@/features/appointments/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Role-aware queue snapshot: SSE-triggered refetches and the 30s poll fallback both read this. */
export async function GET(): Promise<NextResponse> {
  try {
    const user = await requireActor();
    return NextResponse.json(await getQueueSnapshot(user), { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}
