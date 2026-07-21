"use client";

import { FormEvent, useMemo, useState } from "react";

type Vehicle = { name: string; unit_number: string } | null;
type Item = {
  id: string;
  rental_id: string;
  inspection_type: "checkout" | "return";
  customer_name: string;
  odometer: string;
  fuel_level: string;
  damage_notes: string;
  submitted_at: string;
  vehicles: Vehicle;
};
type DetailInspection = Item & { photos: Record<string, string | null> };
type FleetVehicle = {
  id: string;
  name: string;
  unit_number: string;
  qr_token: string;
  status: "ready" | "out" | "unavailable";
  rental_id: string | null;
  customer_name: string | null;
  checked_out_at: string | null;
  odometer: string | null;
  fuel_level: string | null;
};

const slots = [
  ["front", "Front"],
  ["rear", "Rear"],
  ["driver_side", "Driver side"],
  ["passenger_side", "Passenger side"],
  ["interior", "Interior / dashboard"],
] as const;

function formatCheckoutTime(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function AdminPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [fleet, setFleet] = useState<FleetVehicle[]>([]);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedRental, setSelectedRental] = useState<string | null>(null);
  const [details, setDetails] = useState<DetailInspection[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [returningRental, setReturningRental] = useState(false);

  async function fetchAdminData() {
    const headers = { "x-admin-password": password };
    const [inspectionResponse, fleetResponse] = await Promise.all([
      fetch("/api/admin/inspections", { headers }),
      fetch("/api/admin/fleet", { headers }),
    ]);
    const [inspectionData, fleetData] = await Promise.all([
      inspectionResponse.json(),
      fleetResponse.json(),
    ]);

    if (!inspectionResponse.ok) throw new Error(inspectionData.error || "Could not load inspections");
    if (!fleetResponse.ok) throw new Error(fleetData.error || "Could not load fleet");

    setItems(inspectionData.items || []);
    setFleet(fleetData.fleet || []);
    setLoaded(true);
  }

  async function load(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await fetchAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load dashboard");
    } finally {
      setLoading(false);
    }
  }

  async function refreshDashboard() {
    setLoading(true);
    setError("");
    try {
      await fetchAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not refresh dashboard");
    } finally {
      setLoading(false);
    }
  }

  async function viewRental(rentalId: string) {
    setSelectedRental(rentalId);
    setLoadingDetails(true);
    setDetails([]);
    const response = await fetch(`/api/admin/rentals/${rentalId}`, {
      headers: { "x-admin-password": password },
    });
    const data = await response.json();
    setLoadingDetails(false);
    if (!response.ok) {
      setError(data.error);
      return;
    }
    setDetails(data.inspections);
    setError("");
    window.setTimeout(() => {
      document.getElementById("inspection-comparison")?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  }

  async function forceReturnRental() {
    if (!selectedRental) return;
    const confirmed = window.confirm(
      "Force return this rental? This will close the current rental and make the vehicle ready for the next checkout."
    );
    if (!confirmed) return;

    setReturningRental(true);
    setError("");
    const response = await fetch(`/api/admin/rentals/${selectedRental}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-password": password,
      },
      body: JSON.stringify({ action: "force_return" }),
    });
    const data = await response.json();
    setReturningRental(false);
    if (!response.ok) {
      setError(data.error || "Could not return rental");
      return;
    }
    await viewRental(selectedRental);
    await refreshDashboard();
  }

  const rentalRows = useMemo(() => {
    const grouped = new Map<string, Item[]>();
    for (const item of items) {
      const current = grouped.get(item.rental_id) || [];
      current.push(item);
      grouped.set(item.rental_id, current);
    }
    return Array.from(grouped.entries()).map(([rentalId, inspections]) => {
      const latest = [...inspections].sort(
        (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
      )[0];
      const dateKey = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Denver",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(latest.submitted_at));
      return {
        rentalId,
        inspections,
        latest,
        dateKey,
        hasCheckout: inspections.some((i) => i.inspection_type === "checkout"),
        hasReturn: inspections.some((i) => i.inspection_type === "return"),
      };
    });
  }, [items]);

  const archiveGroups = useMemo(() => {
    const years = new Map<string, Map<string, Map<string, typeof rentalRows>>>();

    for (const row of rentalRows) {
      const [year, month, day] = row.dateKey.split("-");

      if (!years.has(year)) years.set(year, new Map());
      const months = years.get(year)!;

      if (!months.has(month)) months.set(month, new Map());
      const days = months.get(month)!;

      const currentRows = days.get(day) || [];
      currentRows.push(row);
      days.set(day, currentRows);
    }

    return Array.from(years.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([year, months]) => ({
        year,
        months: Array.from(months.entries())
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([month, days]) => ({
            month,
            days: Array.from(days.entries())
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([day, rows]) => ({
                day,
                rows: rows.sort((a, b) =>
                  (a.latest.vehicles?.name || "").localeCompare(b.latest.vehicles?.name || "")
                ),
              })),
          })),
      }));
  }, [rentalRows]);

  const fleetCounts = useMemo(
    () => ({
      ready: fleet.filter((vehicle) => vehicle.status === "ready").length,
      out: fleet.filter((vehicle) => vehicle.status === "out").length,
      unavailable: fleet.filter((vehicle) => vehicle.status === "unavailable").length,
    }),
    [fleet]
  );

  const checkout = details.find((i) => i.inspection_type === "checkout");
  const returned = details.find((i) => i.inspection_type === "return");

  return (
    <main className="shell wide-shell">
      <section className="card admin-hero">
        <div>
          <p className="eyebrow">Moab Off-Road Adventures</p>
          <h1>Fleet dashboard</h1>
          <p className="admin-intro">See which vehicles are ready, which are out, and who currently has them.</p>
        </div>
        {loaded && (
          <button className="secondary-button refresh-button" type="button" onClick={refreshDashboard} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        )}
      </section>

      {!loaded && (
        <section className="card admin-login-card">
          <form onSubmit={load} className="admin-login">
            <label className="field">
              <span>Admin password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <button disabled={loading}>{loading ? "Loading dashboard…" : "Open dashboard"}</button>
          </form>
        </section>
      )}

      {error && <p className="notice error">{error}</p>}

      {loaded && (
        <>
          <section className="fleet-summary" aria-label="Fleet totals">
            <div className="summary-tile ready-tile"><strong>{fleetCounts.ready}</strong><span>Ready</span></div>
            <div className="summary-tile out-tile"><strong>{fleetCounts.out}</strong><span>Out</span></div>
            <div className="summary-tile unavailable-tile"><strong>{fleetCounts.unavailable}</strong><span>Needs attention</span></div>
          </section>

          <section className="card fleet-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Live status</p>
                <h2>Vehicles</h2>
              </div>
            </div>
            <div className="fleet-grid">
              {fleet.map((vehicle) => (
                <article className={`fleet-card fleet-${vehicle.status}`} key={vehicle.id}>
                  <div className="fleet-card-top">
                    <span className={`status-dot status-${vehicle.status}`} aria-hidden="true" />
                    <span className={`fleet-status-label status-text-${vehicle.status}`}>
                      {vehicle.status === "ready" ? "Ready" : vehicle.status === "out" ? "Out" : "Needs attention"}
                    </span>
                  </div>
                  <h3>{vehicle.name}</h3>
                  {vehicle.unit_number !== vehicle.name && <p className="unit-label">Unit {vehicle.unit_number}</p>}

                  {vehicle.status === "out" ? (
                    <div className="fleet-current-rental">
                      <span>Checked out by</span>
                      <strong>{vehicle.customer_name || "Name unavailable"}</strong>
                      <small>{formatCheckoutTime(vehicle.checked_out_at)}</small>
                      {vehicle.odometer && <small>Odometer/hours: {vehicle.odometer}</small>}
                      {vehicle.rental_id && (
                        <button type="button" onClick={() => viewRental(vehicle.rental_id!)}>
                          View active inspection
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="fleet-ready-message">
                      <span>{vehicle.status === "ready" ? "Available for checkout" : "No ready rental found"}</span>
                      <a className="vehicle-link" href={`/vehicle/${vehicle.qr_token}`} target="_blank" rel="noreferrer">
                        Open inspection page
                      </a>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section className="card archive-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">History</p>
                <h2>Inspection archive</h2>
              </div>
            </div>
            {archiveGroups.length === 0 ? (
              <p className="empty-state">No inspections have been submitted yet.</p>
            ) : (
              <div className="inspection-archive">
                {archiveGroups.map((yearGroup, yearIndex) => (
                  <details className="date-folder" key={yearGroup.year} open={yearIndex === 0}>
                    <summary style={{ cursor: "pointer", fontSize: 28, fontWeight: 800 }}>
                      {yearGroup.year}
                    </summary>

                    <div style={{ marginTop: 16 }}>
                      {yearGroup.months.map((monthGroup, monthIndex) => (
                        <details
                          key={`${yearGroup.year}-${monthGroup.month}`}
                          open={yearIndex === 0 && monthIndex === 0}
                          style={{ marginBottom: 14, padding: 16, border: "1px solid #cbdde9", borderRadius: 14, background: "#f8fcff" }}
                        >
                          <summary style={{ cursor: "pointer", fontSize: 22, fontWeight: 750 }}>
                            {new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "America/Denver" }).format(
                              new Date(Number(yearGroup.year), Number(monthGroup.month) - 1, 1)
                            )} {yearGroup.year}
                          </summary>

                          <div style={{ marginTop: 14 }}>
                            {monthGroup.days.map((dayGroup) => (
                              <details
                                key={`${yearGroup.year}-${monthGroup.month}-${dayGroup.day}`}
                                style={{ marginBottom: 12, padding: 14, border: "1px solid #d8e5ee", borderRadius: 12, background: "#ffffff" }}
                              >
                               <summary style={{ cursor: "pointer", fontSize: 19, fontWeight: 700 }}>
  {(() => {
    const rentalCount = dayGroup.rows.filter((row) =>
      ["R1", "R2", "R3", "R4"].includes(
        row.latest.vehicles?.unit_number ?? ""
      )
    ).length;

    const employeeRigCount = dayGroup.rows.length - rentalCount;

    return (
      <>
        {monthGroup.month}/{dayGroup.day}/{yearGroup.year} ·{" "}
        {rentalCount} {rentalCount === 1 ? "Rental" : "Rentals"} ·{" "}
        {employeeRigCount}{" "}
        {employeeRigCount === 1 ? "Employee Rig" : "Employee Rigs"}
      </>
    );
  })()}
</summary>

                                <div className="rental-list" style={{ marginTop: 14 }}>
                                  {dayGroup.rows.map((row) => (
                                    <article className="rental-card" key={row.rentalId}>
                                      <div>
                                        <strong>{row.latest.vehicles?.name}</strong>
                                        <p>
                                          Checkout: {row.inspections.find((i) => i.inspection_type === "checkout")?.customer_name || "—"}
                                          {row.hasReturn && <> · Return: {row.inspections.find((i) => i.inspection_type === "return")?.customer_name || "—"}</>}
                                        </p>
                                        <small>{new Date(row.latest.submitted_at).toLocaleString()}</small>
                                      </div>
                                      <div className="status-stack">
                                        <span className={row.hasCheckout ? "badge done" : "badge"}>Checkout</span>
                                        <span className={row.hasReturn ? "badge done" : "badge overdue"}>
                                          {row.hasReturn ? "Returned" : "Return outstanding"}
                                        </span>
                                      </div>
                                      <button type="button" onClick={() => viewRental(row.rentalId)}>
                                        View inspection
                                      </button>
                                    </article>
                                  ))}
                                </div>
                              </details>
                            ))}
                          </div>
                        </details>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {selectedRental && (
        <section className="card comparison-card" id="inspection-comparison">
          <div className="comparison-heading">
            <div>
              <p className="eyebrow">Inspection detail</p>
              <h2>Checkout vs. return</h2>
              {details[0] && (
                <>
                  <p>{details[0].vehicles?.name} — Unit #{details[0].vehicles?.unit_number}</p>
                  <p className="renter-name">Checkout by: {checkout?.customer_name || details[0].customer_name}</p>
                  {returned && <p className="renter-name">Returned by: {returned.customer_name}</p>}
                </>
              )}
            </div>
            <button className="secondary-button" onClick={() => setSelectedRental(null)}>
              Close
            </button>
          </div>

          {loadingDetails && <p>Loading photos…</p>}
          {!loadingDetails && !returned && (
            <>
              <p className="notice return-alert">The return inspection has not been completed yet. This vehicle is still out.</p>
              <button
                type="button"
                className="danger-button override-return-button"
                onClick={forceReturnRental}
                disabled={returningRental}
              >
                {returningRental ? "Returning vehicle…" : "Admin override: return vehicle"}
              </button>
            </>
          )}

          {!loadingDetails && checkout && (
            <>
              <div className="inspection-summary-grid">
                <div>
                  <h3>Checkout</h3>
                  <p>Odometer/hours: {checkout.odometer}</p>
                  <p>Fuel: {checkout.fuel_level}</p>
                  <p>Notes: {checkout.damage_notes}</p>
                </div>
                <div>
                  <h3>Return</h3>
                  {returned ? (
                    <>
                      <p>Odometer/hours: {returned.odometer}</p>
                      <p>Fuel: {returned.fuel_level}</p>
                      <p>Notes: {returned.damage_notes}</p>
                    </>
                  ) : (
                    <p>Waiting for return inspection.</p>
                  )}
                </div>
              </div>

              <div className="photo-comparisons">
                {slots.map(([slot, label]) => (
                  <article className="photo-pair" key={slot}>
                    <h3>{label}</h3>
                    <div className="photo-pair-grid">
                      <div>
                        <span className="photo-label">Checkout</span>
                        {checkout.photos[slot] ? (
                          <a href={checkout.photos[slot]!} target="_blank" rel="noreferrer">
                            <img src={checkout.photos[slot]!} alt={`${label} at checkout`} />
                          </a>
                        ) : (
                          <div className="missing-photo">No checkout photo</div>
                        )}
                      </div>
                      <div>
                        <span className="photo-label">Return</span>
                        {returned?.photos[slot] ? (
                          <a href={returned.photos[slot]!} target="_blank" rel="noreferrer">
                            <img src={returned.photos[slot]!} alt={`${label} at return`} />
                          </a>
                        ) : (
                          <div className="missing-photo">No return photo yet</div>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </main>
  );
}