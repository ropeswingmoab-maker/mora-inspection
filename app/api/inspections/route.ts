import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const photoNames = ["front", "rear", "driver_side", "passenger_side", "interior"] as const;
const photoNameSet = new Set<string>(photoNames);
const employeeSelectionUnits = new Set(["batmobile", "big booty judy", "blackie", "defender #1", "defender #2", "defender #3", "war pig"]);
const lastNameOnlyUnits = new Set(["r1", "r2", "r3", "r4"]);
const allowedEmployees = new Set(["Ben", "Bryan", "Cade", "Canyon", "Carson", "Dalton", "Landon", "Moth", "Peyton", "Tanner", "Taylor", "Zach"]);

type InspectionType = "checkout" | "return";
type RequestValues = {
  vehicleToken: string;
  enteredFirstName: string;
  enteredLastName: string;
  employeeName: string;
  enteredFullName: string;
  normalizedFullName: string;
  normalizedLastName: string;
  inspectionType: InspectionType;
};
type PhotoRequest = { field: string; name: string; type: string; size: number };

function storageDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "unknown";
  return { year: get("year"), month: get("month"), day: get("day") };
}

function storageSafeName(value: string) {
  return value.trim().replace(/#/g, "number-").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function safeExtension(fileName: string, contentType: string) {
  const fromName = fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (fromName && fromName.length <= 10) return fromName;
  const mimeExtensions: Record<string, string> = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" };
  return mimeExtensions[contentType.toLowerCase()] || "jpg";
}

function parseRequestValues(body: Record<string, unknown>): RequestValues {
  const vehicleToken = String(body.vehicle_token || "").trim();
  const enteredFirstName = String(body.first_name || "").trim().replace(/\s+/g, " ");
  const enteredLastName = String(body.last_name || "").trim().replace(/\s+/g, " ");
  const employeeName = String(body.employee_name || "").trim();
  const enteredFullName = `${enteredFirstName} ${enteredLastName}`.trim();
  const normalizedFullName = normalizeName(enteredFullName);
  const normalizedLastName = normalizeName(enteredLastName);
  const rawInspectionType = String(body.inspection_type || "");
  if (!vehicleToken || !["checkout", "return"].includes(rawInspectionType)) throw new Error("Invalid inspection request");
  return { vehicleToken, enteredFirstName, enteredLastName, employeeName, enteredFullName, normalizedFullName, normalizedLastName, inspectionType: rawInspectionType as InspectionType };
}

async function resolveInspectionContext(db: ReturnType<typeof supabaseAdmin>, values: RequestValues) {
  const { data: vehicle, error: vehicleError } = await db.from("vehicles").select("id,name,unit_number").eq("qr_token", values.vehicleToken).eq("active", true).single();
  if (vehicleError || !vehicle) throw new Error("Vehicle not found");

  const normalizedVehicleName = String(vehicle.name || "").trim().toLowerCase();
  const normalizedUnitNumber = String(vehicle.unit_number || "").trim().toLowerCase();
  const employeeMode = employeeSelectionUnits.has(normalizedVehicleName) || employeeSelectionUnits.has(normalizedUnitNumber);
  const lastNameOnly = lastNameOnlyUnits.has(normalizedUnitNumber);

  if (employeeMode) {
    if (!allowedEmployees.has(values.employeeName)) throw new Error("Select a valid employee name");
  } else if (lastNameOnly) {
    if (!values.enteredLastName) throw new Error("Last name is required");
  } else if (!values.enteredFirstName || !values.enteredLastName) {
    throw new Error("First and last name are required");
  }

  let rental;
  if (values.inspectionType === "checkout") {
    const { data: readyRentals, error: rentalError } = await db.from("rentals").select("id,vehicle_id,status,customer_name,customer_last_name").eq("vehicle_id", vehicle.id).eq("status", "ready");
    if (rentalError) throw new Error(rentalError.message);
    if (!readyRentals?.length) throw new Error("No rental is ready for checkout on this vehicle");
    if (readyRentals.length > 1) throw new Error("More than one rental is ready for this vehicle. Please ask a staff member for help.");
    rental = readyRentals[0];
  } else if (employeeMode) {
    const { data: activeRentals, error: rentalError } = await db.from("rentals").select("id,vehicle_id,status,customer_name,customer_last_name").eq("vehicle_id", vehicle.id).eq("status", "active");
    if (rentalError) throw new Error(rentalError.message);
    if (!activeRentals?.length) throw new Error("No active rental is ready to be returned for this vehicle");
    if (activeRentals.length > 1) throw new Error("More than one active rental exists for this vehicle. Please ask an administrator for help.");
    rental = activeRentals[0];
  } else if (lastNameOnly) {
    const { data: matchingRentals, error: rentalError } = await db.from("rentals").select("id,vehicle_id,status,customer_name,customer_last_name").eq("vehicle_id", vehicle.id).eq("status", "active").ilike("customer_last_name", values.normalizedLastName);
    if (rentalError) throw new Error(rentalError.message);
    if (!matchingRentals?.length) throw new Error("No active rental for this vehicle matches that last name");
    if (matchingRentals.length > 1) throw new Error("More than one active rental matches that last name. Please ask a staff member for help.");
    rental = matchingRentals[0];
  } else {
    const { data: activeRentals, error: rentalError } = await db.from("rentals").select("id,vehicle_id,status,customer_name,customer_last_name").eq("vehicle_id", vehicle.id).eq("status", "active").ilike("customer_last_name", values.normalizedLastName);
    if (rentalError) throw new Error(rentalError.message);
    const matchingRentals = (activeRentals || []).filter((candidate) => normalizeName(candidate.customer_name || "") === values.normalizedFullName);
    if (!matchingRentals.length) throw new Error("No active rental for this vehicle matches that checkout name");
    if (matchingRentals.length > 1) throw new Error("More than one active rental matches that name. Please ask a staff member for help.");
    rental = matchingRentals[0];
  }

  const { data: existingInspection } = await db.from("inspections").select("id").eq("rental_id", rental.id).eq("inspection_type", values.inspectionType).maybeSingle();
  if (existingInspection) throw new Error(`A ${values.inspectionType} inspection has already been submitted for this rental`);

  if (values.inspectionType === "return") {
    const { data: checkoutInspection } = await db.from("inspections").select("id").eq("rental_id", rental.id).eq("inspection_type", "checkout").maybeSingle();
    if (!checkoutInspection) throw new Error("Complete the checkout inspection before the return inspection");
  }

  return { vehicle, rental, employeeMode, lastNameOnly };
}

function validatePhotoRequests(value: unknown): PhotoRequest[] {
  if (!Array.isArray(value)) return [];
  if (value.length > photoNames.length) throw new Error("Too many photos were submitted");
  const seen = new Set<string>();
  return value.map((photo) => {
    if (!photo || typeof photo !== "object") throw new Error("Invalid photo information");
    const record = photo as Record<string, unknown>;
    const field = String(record.field || "");
    const name = String(record.name || "");
    const type = String(record.type || "image/jpeg");
    const size = Number(record.size || 0);
    if (!photoNameSet.has(field) || seen.has(field)) throw new Error("Invalid photo field");
    seen.add(field);
    if (!Number.isFinite(size) || size <= 0 || size > 10 * 1024 * 1024) throw new Error("Each photo must be under 10 MB");
    if (!type.toLowerCase().startsWith("image/")) throw new Error("Only image uploads are allowed");
    return { field, name, type, size };
  });
}

function validatePhotoPaths(value: unknown, rentalId: string, inspectionId: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {} as Record<string, string>;
  const photoPaths: Record<string, string> = {};
  for (const [field, rawPath] of Object.entries(value as Record<string, unknown>)) {
    if (!photoNameSet.has(field)) throw new Error("Invalid photo field");
    const path = String(rawPath || "");
    const requiredSegment = `/${rentalId}/${inspectionId}/${field}.`;
    if (!path || !path.includes(requiredSegment) || path.includes("..")) throw new Error("Invalid photo path");
    photoPaths[field] = path;
  }
  return photoPaths;
}

function requireAllPhotos() {
  return process.env.NEXT_PUBLIC_REQUIRE_PHOTOS === "true";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const action = String(body.action || "");
    const values = parseRequestValues(body);
    const db = supabaseAdmin();
    const { vehicle, rental, employeeMode, lastNameOnly } = await resolveInspectionContext(db, values);

    if (action === "prepare") {
      const photos = validatePhotoRequests(body.photos);
      if (requireAllPhotos() && photos.length !== photoNames.length) throw new Error("All vehicle photos are required before submitting");

      const inspectionId = randomUUID();
      const submittedAt = new Date();
      const { year, month, day } = storageDateParts(submittedAt);
      const vehicleFolder = storageSafeName(vehicle.name || vehicle.unit_number);
      const inspectionFolder = values.inspectionType === "checkout" ? "checkout" : "return";
      const uploads = [];

      for (const photo of photos) {
        const ext = safeExtension(photo.name, photo.type);
        const path = `${year}/${month}/${day}/${vehicleFolder}/${inspectionFolder}/${rental.id}/${inspectionId}/${photo.field}.${ext}`;
        const { data: signedUpload, error: signedUploadError } = await db.storage.from("inspection-photos").createSignedUploadUrl(path);
        if (signedUploadError || !signedUpload?.token) throw new Error(`Could not prepare upload: ${photo.field}`);
        uploads.push({ field: photo.field, path, token: signedUpload.token });
      }

      return NextResponse.json({ inspection_id: inspectionId, uploads });
    }

    if (action !== "complete") throw new Error("Invalid inspection action");

    const inspectionId = String(body.inspection_id || "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(inspectionId)) throw new Error("Invalid inspection ID");

    const photoPaths = validatePhotoPaths(body.photo_paths, rental.id, inspectionId);
    if (requireAllPhotos() && Object.keys(photoPaths).length !== photoNames.length) throw new Error("All vehicle photos are required before submitting");

    const checkoutCustomerName = employeeMode ? values.employeeName : lastNameOnly ? values.enteredLastName : values.enteredFullName;
    const displayCustomerName = values.inspectionType === "checkout" ? checkoutCustomerName : employeeMode ? values.employeeName : rental.customer_name;
    const submittedAt = new Date();

    const { error: insertError } = await db.from("inspections").insert({
      id: inspectionId,
      rental_id: rental.id,
      vehicle_id: vehicle.id,
      inspection_type: values.inspectionType,
      customer_name: displayCustomerName,
      odometer: String(body.odometer || "").trim(),
      fuel_level: String(body.fuel_level || ""),
      damage_notes: String(body.damage_notes || "").trim(),
      photo_paths: photoPaths,
      submitted_at: submittedAt.toISOString(),
    });
    if (insertError) throw new Error(insertError.message);

    const rentalUpdate = values.inspectionType === "checkout"
      ? { status: "active", customer_name: checkoutCustomerName, customer_last_name: employeeMode ? null : values.normalizedLastName }
      : { status: "completed" };

    const { error: updateError } = await db.from("rentals").update(rentalUpdate).eq("id", rental.id);
    if (updateError) throw new Error(updateError.message);

    if (values.inspectionType === "return") {
      const { data: nextReadyRental, error: readyLookupError } = await db.from("rentals").select("id").eq("vehicle_id", vehicle.id).eq("status", "ready").limit(1).maybeSingle();
      if (readyLookupError) throw new Error(readyLookupError.message);
      if (!nextReadyRental) {
        const { error: createReadyError } = await db.from("rentals").insert({ vehicle_id: vehicle.id, customer_name: "Unassigned Customer", customer_last_name: null, status: "ready" });
        if (createReadyError) throw new Error(createReadyError.message);
      }
    }

    return NextResponse.json({ inspection_id: inspectionId });
  } catch (error) {
    console.error("Inspection submission failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Submission failed" }, { status: 400 });
  }
}