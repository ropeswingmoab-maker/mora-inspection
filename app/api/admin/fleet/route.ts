import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

function authorized(req: Request) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const { data: vehicles, error: vehicleError } = await db
    .from("vehicles")
    .select("id,name,unit_number,qr_token,active")
    .eq("active", true)
    .order("name", { ascending: true });

  if (vehicleError) {
    return NextResponse.json({ error: vehicleError.message }, { status: 500 });
  }

  const vehicleIds = (vehicles || []).map((vehicle) => vehicle.id);
  const { data: rentals, error: rentalError } = vehicleIds.length
    ? await db
        .from("rentals")
        .select("id,vehicle_id,customer_name,status,created_at")
        .in("vehicle_id", vehicleIds)
        .in("status", ["active", "ready"])
        .order("created_at", { ascending: false })
    : { data: [], error: null };

  if (rentalError) {
    return NextResponse.json({ error: rentalError.message }, { status: 500 });
  }

  const activeRentalIds = (rentals || [])
    .filter((rental) => rental.status === "active")
    .map((rental) => rental.id);

  const { data: checkouts, error: checkoutError } = activeRentalIds.length
    ? await db
        .from("inspections")
        .select("rental_id,customer_name,submitted_at,odometer,fuel_level")
        .in("rental_id", activeRentalIds)
        .eq("inspection_type", "checkout")
    : { data: [], error: null };

  if (checkoutError) {
    return NextResponse.json({ error: checkoutError.message }, { status: 500 });
  }

  const activeByVehicle = new Map<string, (typeof rentals)[number]>();
  const readyByVehicle = new Map<string, (typeof rentals)[number]>();
  for (const rental of rentals || []) {
    if (rental.status === "active" && !activeByVehicle.has(rental.vehicle_id)) {
      activeByVehicle.set(rental.vehicle_id, rental);
    }
    if (rental.status === "ready" && !readyByVehicle.has(rental.vehicle_id)) {
      readyByVehicle.set(rental.vehicle_id, rental);
    }
  }

  const checkoutByRental = new Map(
    (checkouts || []).map((checkout) => [checkout.rental_id, checkout])
  );

  const fleet = (vehicles || []).map((vehicle) => {
    const activeRental = activeByVehicle.get(vehicle.id);
    const readyRental = readyByVehicle.get(vehicle.id);
    const checkout = activeRental ? checkoutByRental.get(activeRental.id) : undefined;

    return {
      id: vehicle.id,
      name: vehicle.name,
      unit_number: vehicle.unit_number,
      qr_token: vehicle.qr_token,
      status: activeRental ? "out" : readyRental ? "ready" : "unavailable",
      rental_id: activeRental?.id || null,
      customer_name: checkout?.customer_name || activeRental?.customer_name || null,
      checked_out_at: checkout?.submitted_at || null,
      odometer: checkout?.odometer || null,
      fuel_level: checkout?.fuel_level || null,
    };
  });

  return NextResponse.json({ fleet });
}
