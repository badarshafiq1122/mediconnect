import { NextResponse } from "next/server";
import { errorResponse, NO_STORE } from "@/lib/http";
import { requireActor } from "@/lib/session";
import { getAppointmentDetail } from "@/features/appointments/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Live detail for one appointment. 404 (never 403) for anyone who is not its patient or treating doctor. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const actor = await requireActor("patient", "doctor");
    const { id } = await context.params;
    const detail = await getAppointmentDetail(actor, id);
    if (!detail) return NextResponse.json({ error: "Appointment not found." }, { status: 404, headers: NO_STORE });
    return NextResponse.json(detail, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}
