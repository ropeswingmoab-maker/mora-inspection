import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
const photoNames = ["front", "rear", "driver_side", "passenger_side", "interior"];
const employeeSelectionUnits = new Set([
  "batmobile",
  "big booty judy",
  "blackie",
  "defender #1",
  "defender #2",
  "defender #3",
  "war pig",
]);
const allowedEmployees = new Set([
  "Ben", "Bryan", "Cade", "Canyon", "Carson", "Dalton",
  "Landon", "Moth", "Peyton", "Tanner", "Taylor", "Zach",
]);

function storageDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "unknown";
  return { year: get("year"), month: get("month"), day: get("day") };
}

function storageSafeName(value: string) {
  return value
    .trim()
    .replace(/#/g, "number-")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const token = String(form.get("vehicle_token") || "");
    const enteredFirstName = String(form.get("first_name") || "").trim().replace(/\s+/g, " ");
    const enteredLastName = String(form.get("last_name") || "").trim().replace(/\s+/g, " ");
    const employeeName = String(form.get("employee_name") || "").trim();
    const enteredFullName = `${enteredFirstName} ${enteredLastName}`.trim();
    const normalizedFullName = normalizeName(enteredFullName);
    const normalizedLastName = normalizeName(enteredLastName);
    const inspectionType = String(form.get("inspection_type") || "");
    if (!token || !["checkout", "return"].includes(inspectionType)) {
      throw new Error("Invalid inspection request");
    }

    const db = supabaseAdmin();
    const { data: vehicle } = await db.from("vehicles").select("id,name,unit_number").eq("qr_token", token).eq("active", true).single();
    if (!vehicle) throw new Error("Vehicle not found");

    const normalizedVehicleName = String(vehicle.name || "").trim().toLowerCase();
    const normalizedUnitNumber = String(vehicle.unit_number || "").trim().toLowerCase();
    const employeeMode = employeeSelectionUnits.has(normalizedVehicleName) || employeeSelectionUnits.has(normalizedUnitNumber);

    if (employeeMode) {
      if (!allowedEmployees.has(employeeName)) throw new Error("Select a valid employee name");
    } else if (!enteredFirstName || !enteredLastName) {
      throw new Error("First and last name are required");
    }

    let rental;
    if (inspectionType === "checkout") {
      const { data: readyRentals, error: rentalError } = await db
        .from("rentals")
        .select("id,vehicle_id,status,customer_name,customer_last_name")
        .eq("vehicle_id", vehicle.id)
        .eq("status", "ready");

      if (rentalError) throw new Error(rentalError.message);
      if (!readyRentals?.length) throw new Error("No rental is ready for checkout on this vehicle");
      if (readyRentals.length > 1) throw new Error("More than one rental is ready for this vehicle. Please ask a staff member for help.");
      rental = readyRentals[0];
    } else if (employeeMode) {
      const { data: activeRentals, error: rentalError } = await db
        .from("rentals")
        .select("id,vehicle_id,status,customer_name,customer_last_name")
        .eq("vehicle_id", vehicle.id)
        .eq("status", "active");

      if (rentalError) throw new Error(rentalError.message);
      if (!activeRentals?.length) throw new Error("No active rental is ready to be returned for this vehicle");
      if (activeRentals.length > 1) throw new Error("More than one active rental exists for this vehicle. Please ask an administrator for help.");
      rental = activeRentals[0];
    } else {
      const { data: activeRentals, error: rentalError } = await db
        .from("rentals")
        .select("id,vehicle_id,status,customer_name,customer_last_name")
        .eq("vehicle_id", vehicle.id)
        .eq("status", "active")
        .ilike("customer_last_name", normalizedLastName);

      if (rentalError) throw new Error(rentalError.message);
      const matchingRentals = (activeRentals || []).filter(
        (candidate) => normalizeName(candidate.customer_name || "") === normalizedFullName
      );
      if (!matchingRentals.length) throw new Error("No active rental for this vehicle matches that checkout name");
      if (matchingRentals.length > 1) throw new Error("More than one active rental matches that name. Please ask a staff member for help.");
      rental = matchingRentals[0];
    }

    const { data: existingInspection } = await db
      .from("inspections")
      .select("id")
      .eq("rental_id", rental.id)
      .eq("inspection_type", inspectionType)
      .maybeSingle();
    if (existingInspection) throw new Error(`A ${inspectionType} inspection has already been submitted for this rental`);

    if (inspectionType === "return") {
      const { data: checkoutInspection } = await db
        .from("inspections")
        .select("id")
        .eq("rental_id", rental.id)
        .eq("inspection_type", "checkout")
        .maybeSingle();
      if (!checkoutInspection) throw new Error("Complete the checkout inspection before the return inspection");
    }

    const inspectionId = randomUUID();
    const uploads: Record<string, string> = {};
    const submittedAt = new Date();
    const { year, month, day } = storageDateParts(submittedAt);
    const vehicleFolder = storageSafeName(vehicle.name || vehicle.unit_number);
    const inspectionFolder = inspectionType === "checkout" ? "checkout" : "return";
    for (const field of photoNames) {
      const file = form.get(field);
      if (!(file instanceof File) || file.size === 0) continue;
      if (file.size > 10 * 1024 * 1024) throw new Error("Each photo must be under 10 MB");
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${year}/${month}/${day}/${vehicleFolder}/${inspectionFolder}/${rental.id}/${inspectionId}/${field}.${ext}`;
      const bytes = Buffer.from(await file.arrayBuffer());
      const { error } = await db.storage.from("inspection-photos").upload(path, bytes, {
        contentType: file.type || "image/jpeg",
        upsert: false
      });
      if (error) throw new Error(`Upload failed: ${field}`);
      uploads[field] = path;
    }

    const displayCustomerName = employeeMode
      ? employeeName
      : inspectionType === "checkout"
        ? enteredFullName
        : rental.customer_name;
    const { error: insertError } = await db.from("inspections").insert({
      id: inspectionId,
      rental_id: rental.id,
      vehicle_id: vehicle.id,
      inspection_type: inspectionType,
      customer_name: displayCustomerName,
      odometer: String(form.get("odometer") || "").trim(),
      fuel_level: String(form.get("fuel_level") || ""),
      damage_notes: String(form.get("damage_notes") || "").trim(),
      photo_paths: uploads,
      submitted_at: submittedAt.toISOString()
    });
    if (insertError) throw new Error(insertError.message);

    const rentalUpdate = inspectionType === "checkout"
      ? {
          status: "active",
          customer_name: employeeMode ? employeeName : enteredFullName,
          customer_last_name: employeeMode ? null : normalizedLastName
        }
      : { status: "completed" };
    const { error: updateError } = await db.from("rentals").update(rentalUpdate).eq("id", rental.id);
    if (updateError) throw new Error(updateError.message);

    // After a successful return, prepare the vehicle for its next customer.
    // Keep the completed rental and its inspections for history, then create a
    // separate blank ready rental for the next checkout.
    if (inspectionType === "return") {
      const { data: nextReadyRental, error: readyLookupError } = await db
        .from("rentals")
        .select("id")
        .eq("vehicle_id", vehicle.id)
        .eq("status", "ready")
        .limit(1)
        .maybeSingle();

      if (readyLookupError) throw new Error(readyLookupError.message);

      if (!nextReadyRental) {
        const { error: createReadyError } = await db.from("rentals").insert({
          vehicle_id: vehicle.id,
          customer_name: "Unassigned Customer",
          customer_last_name: null,
          status: "ready"
        });
        if (createReadyError) throw new Error(createReadyError.message);
      }
    }

    return NextResponse.json({ inspection_id: inspectionId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Submission failed" }, { status: 400 });
  }
}
