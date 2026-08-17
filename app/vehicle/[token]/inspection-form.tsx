"use client";

import { createClient } from "@supabase/supabase-js";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";

const photoFields = [
  ["front", "Front of vehicle"],
  ["rear", "Rear of vehicle"],
  ["driver_side", "Driver side"],
  ["passenger_side", "Passenger side"],
  ["interior", "Interior / dashboard"],
] as const;

const employeeNames = [
  "Ben", "Bryan", "Cade", "Canyon", "Carson", "Dalton",
  "Landon", "Moth", "Peyton", "Tanner", "Taylor", "Zach",
] as const;

const employeeSelectionUnits = new Set([
  "batmobile", "big booty judy", "blackie", "defender #1",
  "defender #2", "defender #3", "war pig",
]);

const lastNameOnlyUnits = new Set(["r1", "r2", "r3", "r4"]);

type Vehicle = { id: string; name: string; unit_number: string };
type PreparedUpload = { field: string; path: string; token: string };

function usesEmployeeSelection(vehicle: Vehicle | null) {
  if (!vehicle) return false;
  return employeeSelectionUnits.has(vehicle.unit_number.trim().toLowerCase()) ||
    employeeSelectionUnits.has(vehicle.name.trim().toLowerCase());
}

function usesLastNameOnly(vehicle: Vehicle | null) {
  if (!vehicle) return false;
  return lastNameOnlyUnits.has(vehicle.unit_number.trim().toLowerCase());
}

function getBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase browser environment variables are missing.");
  }
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default function InspectionForm({ token }: { token: string }) {
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [type, setType] = useState<"checkout" | "return">("checkout");
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [photoPreviews, setPhotoPreviews] = useState<Record<string, string>>({});
  const requirePhotos = process.env.NEXT_PUBLIC_REQUIRE_PHOTOS === "true";

  useEffect(() => {
    fetch(`/api/vehicle/${token}`)
      .then((response) => response.json())
      .then((data) => setVehicle(data.vehicle ?? null));
  }, [token]);

  function clearPhotoPreviews() {
    setPhotoPreviews((current) => {
      Object.values(current).forEach((preview) => URL.revokeObjectURL(preview));
      return {};
    });
  }

  function changeType(nextType: "checkout" | "return") {
    setType(nextType);
    setSelectedEmployee("");
    setStatus("");
    clearPhotoPreviews();
  }

  function handlePhotoChange(name: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPhotoPreviews((current) => {
      const previous = current[name];
      if (previous) URL.revokeObjectURL(previous);
      if (!file) {
        const next = { ...current };
        delete next[name];
        return next;
      }
      return { ...current, [name]: URL.createObjectURL(file) };
    });
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formElement = e.currentTarget;
    const employeeMode = usesEmployeeSelection(vehicle);

    if (employeeMode && !selectedEmployee) {
      setStatus("Select your name before submitting the inspection.");
      return;
    }

    setBusy(true);

    try {
      const form = new FormData(formElement);
      const files = photoFields
        .map(([field]) => {
          const value = form.get(field);
          return value instanceof File && value.size > 0 ? { field, file: value } : null;
        })
        .filter((item): item is { field: (typeof photoFields)[number][0]; file: File } => item !== null);

      if (requirePhotos && files.length !== photoFields.length) {
        throw new Error("All vehicle photos are required before submitting.");
      }

      for (const { file } of files) {
        if (file.size > 10 * 1024 * 1024) {
          throw new Error("Each photo must be under 10 MB.");
        }
      }

      const commonPayload = {
        vehicle_token: token,
        inspection_type: type,
        first_name: String(form.get("first_name") || ""),
        last_name: String(form.get("last_name") || ""),
        employee_name: employeeMode ? selectedEmployee : "",
      };

      setStatus(files.length ? "Preparing photo uploads…" : "Preparing inspection…");

      const prepareResponse = await fetch("/api/inspections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "prepare",
          ...commonPayload,
          photos: files.map(({ field, file }) => ({
            field,
            name: file.name,
            type: file.type || "image/jpeg",
            size: file.size,
          })),
        }),
      });

      const prepareData = await prepareResponse.json();
      if (!prepareResponse.ok) {
        throw new Error(prepareData.error || "Could not prepare inspection.");
      }

      const preparedUploads = (prepareData.uploads || []) as PreparedUpload[];
      const uploadByField = new Map(preparedUploads.map((upload) => [upload.field, upload]));

      if (files.length) {
        const supabase = getBrowserSupabase();
        for (let index = 0; index < files.length; index += 1) {
          const { field, file } = files[index];
          const prepared = uploadByField.get(field);
          if (!prepared) {
            throw new Error(`Could not prepare the ${field.replaceAll("_", " ")} photo.`);
          }

          setStatus(`Uploading photo ${index + 1} of ${files.length}…`);
          const { error: uploadError } = await supabase.storage
            .from("inspection-photos")
            .uploadToSignedUrl(prepared.path, prepared.token, file, {
              contentType: file.type || "image/jpeg",
            });

          if (uploadError) {
            throw new Error(`Photo upload failed (${field.replaceAll("_", " ")}): ${uploadError.message}`);
          }
        }
      }

      setStatus("Saving inspection…");
      const photoPaths = Object.fromEntries(
        preparedUploads.map((upload) => [upload.field, upload.path])
      );

      const completeResponse = await fetch("/api/inspections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "complete",
          inspection_id: prepareData.inspection_id,
          ...commonPayload,
          odometer: String(form.get("odometer") || ""),
          fuel_level: String(form.get("fuel_level") || ""),
          damage_notes: String(form.get("damage_notes") || ""),
          photo_paths: photoPaths,
        }),
      });

      const completeData = await completeResponse.json();
      if (!completeResponse.ok) {
        throw new Error(completeData.error || "Something went wrong.");
      }

      formElement.reset();
      setSelectedEmployee("");
      clearPhotoPreviews();
      setStatus("Inspection submitted successfully.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (!vehicle) {
    return <section className="card"><h1>Vehicle inspection</h1><p>Loading vehicle…</p></section>;
  }

  const employeeMode = usesEmployeeSelection(vehicle);
  const lastNameOnly = usesLastNameOnly(vehicle);

  return <section className="card">
    <h1>{vehicle.name}</h1><p>Unit #{vehicle.unit_number}</p>

    {lastNameOnly && (
      <div style={{ margin: "20px 0", padding: "16px 20px", border: "2px solid #dc2626", borderRadius: "12px", backgroundColor: "#fef2f2", color: "#991b1b", fontWeight: 700, fontSize: "18px", lineHeight: 1.4 }}>
        ⚠️ Don&apos;t forget! Complete the return checklist when you get back to release your $1,000 security hold.
      </div>
    )}

    <div className="choice">
      <button type="button" onClick={() => changeType("checkout")} className={type === "return" ? "secondary" : ""}>Checkout</button>
      <button type="button" onClick={() => changeType("return")} className={type === "checkout" ? "secondary" : ""}>Return</button>
    </div>

    <p className="notice">
      {employeeMode
        ? `Select the employee completing this ${type} inspection. The employee completing the return can be different from the employee who completed checkout.`
        : lastNameOnly
          ? type === "checkout"
            ? "Enter your last name. Your last name will be assigned to this vehicle rental and used to find it when the vehicle is returned."
            : "Enter the same last name that was used during checkout."
          : type === "checkout"
            ? "Enter your first and last name. Your name will be assigned to this vehicle rental and used to find it when the vehicle is returned."
            : "Enter the same first and last name that was used during checkout."}
    </p>

    <form onSubmit={submit}>
      {employeeMode ? (
        <fieldset className="employee-fieldset">
          <legend>Employee name</legend>
          <div className="employee-grid">
            {employeeNames.map((name) => (
              <button type="button" key={name} className={`employee-button${selectedEmployee === name ? " selected" : ""}`} aria-pressed={selectedEmployee === name} onClick={() => setSelectedEmployee(name)}>{name}</button>
            ))}
          </div>
          <input type="hidden" name="employee_name" value={selectedEmployee} />
        </fieldset>
      ) : (
        <div className="photo-grid">
          {!lastNameOnly && (
            <label className="field"><span>First name</span><input name="first_name" autoComplete="given-name" required maxLength={100} /></label>
          )}
          <label className="field"><span>Last name</span><input name="last_name" autoComplete="family-name" required maxLength={100} /></label>
        </div>
      )}

      <label className="field"><span>Odometer</span><input name="odometer" required inputMode="decimal" /></label>
      <label className="field"><span>Fuel level</span><select name="fuel_level" required><option value="">Select</option><option>Full</option><option>3/4</option><option>1/2</option><option>1/4</option><option>Empty</option></select></label>

      <h2>Photos {requirePhotos ? "(required)" : "(optional while testing)"}</h2>
      <div className="photo-grid">
        {photoFields.map(([name, label]) => {
          const preview = photoPreviews[name];
          return (
            <div className={`camera-field${preview ? " complete" : ""}`} key={name}>
              <span className="camera-title">{label}</span>
              {preview && <img className="camera-preview" src={preview} alt={`${label} preview`} />}
              <label className={`camera-button${preview ? " retake" : ""}`} htmlFor={`photo-${name}`}><span aria-hidden="true">{preview ? "↻" : "📷"}</span>{preview ? "Retake Photo" : "Take Photo"}</label>
              <input id={`photo-${name}`} className="camera-input" name={name} type="file" accept="image/*" capture="environment" required={requirePhotos} onChange={(event) => handlePhotoChange(name, event)} />
              {preview ? <small className="photo-complete">✓ Photo complete</small> : <small className="small">{requirePhotos ? "Required. Use the rear camera and show the entire area clearly." : "Optional for now. Use the rear camera and show the entire area clearly."}</small>}
            </div>
          );
        })}
      </div>

      <label className="field"><span>{type === "checkout" ? "Existing damage notes" : "New damage or issues"}</span><textarea name="damage_notes" placeholder="Write none if there is nothing to report." required /></label>

      {!lastNameOnly && type === "return" && (
        <>
          <h3 style={{ marginTop: 20, marginBottom: 10 }}>Vehicle Cleanup Checklist</h3>
          <label className="field"><span><input style={{ width: "auto", marginRight: 8 }} type="checkbox" name="windshield_washed" required />Windshield washed</span></label>
          <label className="field"><span><input style={{ width: "auto", marginRight: 8 }} type="checkbox" name="trash_cleaned" required />Trash Cleaned Out</span></label>
          <label className="field"><span><input style={{ width: "auto", marginRight: 8 }} type="checkbox" name="machine_blown" required />Machine Blown</span></label>
          <label className="field"><span><input style={{ width: "auto", marginRight: 8 }} type="checkbox" name="tires_ok" required />Tires OK</span></label>
        </>
      )}

      <label className="field"><span><input style={{ width: "auto", marginRight: 8 }} type="checkbox" name="certified" required />I certify this inspection is accurate.</span></label>
      <button disabled={busy}>{busy ? "Submitting…" : `Submit ${type} inspection`}</button>
      {status && <p className={status === "Inspection submitted successfully." ? "notice success" : status.includes("…") ? "notice" : "notice error"}>{status}</p>}
    </form>
  </section>;
}