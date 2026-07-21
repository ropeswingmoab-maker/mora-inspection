"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";

const photoFields = [
  ["front", "Front of vehicle"],
  ["rear", "Rear of vehicle"],
  ["driver_side", "Driver side"],
  ["passenger_side", "Passenger side"],
  ["interior", "Interior / dashboard"],
] as const;

const employeeNames = [
  "Ben",
  "Bryan",
  "Cade",
  "Canyon",
  "Carson",
  "Dalton",
  "Landon",
  "Moth",
  "Peyton",
  "Tanner",
  "Taylor",
  "Zach",
] as const;

const employeeSelectionUnits = new Set([
  "batmobile",
  "big booty judy",
  "blackie",
  "defender #1",
  "defender #2",
  "defender #3",
  "war pig",
]);

const lastNameOnlyUnits = new Set(["r1", "r2", "r3", "r4"]);

type Vehicle = {
  id: string;
  name: string;
  unit_number: string;
};

function usesEmployeeSelection(vehicle: Vehicle | null) {
  if (!vehicle) return false;

  return (
    employeeSelectionUnits.has(vehicle.unit_number.trim().toLowerCase()) ||
    employeeSelectionUnits.has(vehicle.name.trim().toLowerCase())
  );
}

function usesLastNameOnly(vehicle: Vehicle | null) {
  if (!vehicle) return false;

  return lastNameOnlyUnits.has(
    vehicle.unit_number.trim().toLowerCase()
  );
}

export default function InspectionForm({ token }: { token: string }) {
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [type, setType] = useState<"checkout" | "return">("checkout");
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [photoPreviews, setPhotoPreviews] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    fetch(`/api/vehicle/${token}`)
      .then((response) => response.json())
      .then((data) => setVehicle(data.vehicle ?? null));
  }, [token]);

  function changeType(nextType: "checkout" | "return") {
    setType(nextType);
    setSelectedEmployee("");
    setStatus("");
    setPhotoPreviews({});
  }

  function handlePhotoChange(
    name: string,
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    setPhotoPreviews((current) => {
      const previous = current[name];

      if (previous) {
        URL.revokeObjectURL(previous);
      }

      if (!file) {
        const next = { ...current };
        delete next[name];
        return next;
      }

      return {
        ...current,
        [name]: URL.createObjectURL(file),
      };
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
    setStatus("Submitting inspection…");

    try {
      const form = new FormData(formElement);

      form.set("vehicle_token", token);
      form.set("inspection_type", type);

      if (employeeMode) {
        form.set("employee_name", selectedEmployee);
      }

      const response = await fetch("/api/inspections", {
        method: "POST",
        body: form,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Something went wrong.");
      }

      formElement.reset();
      setSelectedEmployee("");
      setPhotoPreviews({});
      setStatus("Inspection submitted successfully.");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Something went wrong."
      );
    } finally {
      setBusy(false);
    }
  }

  if (!vehicle) {
    return (
      <section className="card">
        <h1>Vehicle inspection</h1>
        <p>Loading vehicle…</p>
      </section>
    );
  }

  const employeeMode = usesEmployeeSelection(vehicle);
  const lastNameOnly = usesLastNameOnly(vehicle);

  return (
    <section className="card">
      <h1>{vehicle.name}</h1>
      <p>Unit #{vehicle.unit_number}</p>

      {lastNameOnly && (
        <div
          style={{
            margin: "20px 0",
            padding: "16px 20px",
            border: "2px solid #dc2626",
            borderRadius: "12px",
            backgroundColor: "#fef2f2",
            color: "#991b1b",
            fontWeight: 700,
            fontSize: "18px",
            lineHeight: 1.4,
          }}
        >
          ⚠️ Don&apos;t forget! Complete the return checklist when you
          get back to release your $1,000 security hold.
        </div>
      )}

      <div className="choice">
        <button
          type="button"
          onClick={() => changeType("checkout")}
          className={type === "return" ? "secondary" : ""}
        >
          Checkout
        </button>

        <button
          type="button"
          onClick={() => changeType("return")}
          className={type === "checkout" ? "secondary" : ""}
        >
          Return
        </button>
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
                <button
                  type="button"
                  key={name}
                  className={`employee-button${
                    selectedEmployee === name ? " selected" : ""
                  }`}
                  aria-pressed={selectedEmployee === name}
                  onClick={() => setSelectedEmployee(name)}
                >
                  {name}
                </button>
              ))}
            </div>

            <input
              type="hidden"
              name="employee_name"
              value={selectedEmployee}
            />
          </fieldset>
        ) : (
          <div className="photo-grid">
            {!lastNameOnly && (
              <label className="field">
                <span>First name</span>
                <input
                  name="first_name"
                  autoComplete="given-name"
                  required
                  maxLength={100}
                />
              </label>
            )}

            <label className="field">
              <span>Last name</span>
              <input
                name="last_name"
                autoComplete="family-name"
                required
                maxLength={100}
              />
            </label>
          </div>
        )}

        <label className="field">
          <span>Odometer</span>
          <input
            name="odometer"
            required
            inputMode="decimal"
          />
        </label>

        <label className="field">
          <span>Fuel level</span>
          <select name="fuel_level" required>
            <option value="">Select</option>
            <option>Full</option>
            <option>3/4</option>
            <option>1/2</option>
            <option>1/4</option>
            <option>Empty</option>
          </select>
        </label>

        <h2>Photos (optional while testing)</h2>

        <div className="photo-grid">
          {photoFields.map(([name, label]) => {
            const preview = photoPreviews[name];

            return (
              <div
                className={`camera-field${
                  preview ? " complete" : ""
                }`}
                key={name}
              >
                <span className="camera-title">{label}</span>

                {preview && (
                  <img
                    className="camera-preview"
                    src={preview}
                    alt={`${label} preview`}
                  />
                )}

                <label
                  className={`camera-button${
                    preview ? " retake" : ""
                  }`}
                  htmlFor={`photo-${name}`}
                >
                  <span aria-hidden="true">
                    {preview ? "↻" : "📷"}
                  </span>

                  {preview ? "Retake Photo" : "Take Photo"}
                </label>

                <input
                  id={`photo-${name}`}
                  className="camera-input"
                  name={name}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) =>
                    handlePhotoChange(name, event)
                  }
                />

                {preview ? (
                  <small className="photo-complete">
                    ✓ Photo complete
                  </small>
                ) : (
                  <small className="small">
                    Optional for now. Use the rear camera and show the
                    entire area clearly.
                  </small>
                )}
              </div>
            );
          })}
        </div>

        <label className="field">
          <span>
            {type === "checkout"
              ? "Existing damage notes"
              : "New damage or issues"}
          </span>

          <textarea
            name="damage_notes"
            placeholder="Write none if there is nothing to report."
            required
          />
        </label>

        {!lastNameOnly && type === "return" && (
  <>
    <label className="field">
      <span>
        <input
          style={{
            width: "auto",
            marginRight: 8,
          }}
          type="checkbox"
          name="trash_cleaned"
          required
        />
        Trash cleaned out.
      </span>
    </label>

    <label className="field">
      <span>
        <input
          style={{
            width: "auto",
            marginRight: 8,
          }}
          type="checkbox"
          name="vehicle_blown_out"
          required
        />
        Vehicle blown out.
      </span>
    </label>

    <label className="field">
      <span>
        <input
          style={{
            width: "auto",
            marginRight: 8,
          }}
          type="checkbox"
          name="walkaround_complete"
          required
        />
        Walkaround inspection completed (checked for loose bolts, low tires, new leaks, etc.).
      </span>
    </label>
  </>
)}

<label className="field">
  <span>
    <input
      style={{
        width: "auto",
        marginRight: 8,
      }}
      type="checkbox"
      name="certified"
      required
    />
    I certify this inspection is accurate.
  </span>
</label>

        <button disabled={busy}>
          {busy
            ? "Submitting…"
            : `Submit ${type} inspection`}
        </button>

        {status && (
          <p
            className={
              status === "Inspection submitted successfully."
                ? "notice success"
                : status === "Submitting inspection…"
                  ? "notice"
                  : "notice error"
            }
          >
            {status}
          </p>
        )}
      </form>
    </section>
  );
}