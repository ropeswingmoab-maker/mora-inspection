import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const photoSlots = ["front", "rear", "driver_side", "passenger_side", "interior"];

function authorized(req: Request) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ rentalId: string }> }
) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { rentalId } = await params;
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("inspections")
    .select("id,rental_id,inspection_type,customer_name,odometer,fuel_level,damage_notes,photo_paths,submitted_at,vehicles(name,unit_number)")
    .eq("rental_id", rentalId)
    .order("submitted_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "No inspections found" }, { status: 404 });

  const inspections = await Promise.all(
    data.map(async (inspection) => {
      const paths = (inspection.photo_paths || {}) as Record<string, string>;
      const photos: Record<string, string | null> = {};

      await Promise.all(
        photoSlots.map(async (slot) => {
          const path = paths[slot];
          if (!path) {
            photos[slot] = null;
            return;
          }
          const { data: signed } = await db.storage
            .from("inspection-photos")
            .createSignedUrl(path, 60 * 30);
          photos[slot] = signed?.signedUrl || null;
        })
      );

      return { ...inspection, photos };
    })
  );

  return NextResponse.json({ inspections });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ rentalId: string }> }
) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { rentalId } = await params;
  const body = await req.json().catch(() => ({}));
  if (body.action !== "force_return") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: rental, error: rentalError } = await db
    .from("rentals")
    .select("id,vehicle_id,status,customer_name")
    .eq("id", rentalId)
    .single();

  if (rentalError || !rental) {
    return NextResponse.json({ error: rentalError?.message || "Rental not found" }, { status: 404 });
  }
  if (rental.status !== "active") {
    return NextResponse.json({ error: "Only an active rental can be force-returned" }, { status: 400 });
  }

  const { data: existingReturn } = await db
    .from("inspections")
    .select("id")
    .eq("rental_id", rentalId)
    .eq("inspection_type", "return")
    .maybeSingle();

  if (!existingReturn) {
    const { error: insertError } = await db.from("inspections").insert({
      id: randomUUID(),
      rental_id: rentalId,
      vehicle_id: rental.vehicle_id,
      inspection_type: "return",
      customer_name: rental.customer_name || "Unknown Customer",
      odometer: "Not recorded",
      fuel_level: "Not recorded",
      damage_notes: "Returned by admin override. No customer return inspection was submitted.",
      photo_paths: {},
      submitted_at: new Date().toISOString(),
    });
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const { error: updateError } = await db
    .from("rentals")
    .update({ status: "completed" })
    .eq("id", rentalId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const { data: readyRental, error: readyLookupError } = await db
    .from("rentals")
    .select("id")
    .eq("vehicle_id", rental.vehicle_id)
    .eq("status", "ready")
    .limit(1)
    .maybeSingle();

  if (readyLookupError) return NextResponse.json({ error: readyLookupError.message }, { status: 500 });
  if (!readyRental) {
    const { error: createError } = await db.from("rentals").insert({
      vehicle_id: rental.vehicle_id,
      customer_name: "Unassigned Customer",
      customer_last_name: null,
      status: "ready",
    });
    if (createError) return NextResponse.json({ error: createError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
