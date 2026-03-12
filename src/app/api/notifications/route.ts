import { NextResponse } from "next/server";
import { errorResponse, NO_STORE } from "@/lib/http";
import { requireActor } from "@/lib/session";
import { listNotifications } from "@/features/notifications/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const user = await requireActor();
    return NextResponse.json(await listNotifications(user.id), { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}
