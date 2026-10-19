/* ============================================================
   vin.js — VIN decoding through the U.S. DOT NHTSA database.
   Free, no API key, and CORS-enabled so it works in the browser.
   ============================================================ */

const VinDecoder = (() => {
  const API = "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended";

  /** Basic sanity check: 17 chars, no I / O / Q. */
  function validate(vin) {
    const v = vin.trim().toUpperCase();
    if (v.length !== 17) return { ok: false, error: "A VIN is exactly 17 characters — this one has " + v.length + "." };
    if (/[IOQ]/.test(v)) return { ok: false, error: "VINs never contain the letters I, O, or Q. Double-check what you pasted." };
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(v)) return { ok: false, error: "That doesn't look like a valid VIN — only letters and digits allowed." };
    return { ok: true, vin: v };
  }

  /** Decode a VIN into factory-record fields. Throws on network/API failure. */
  async function decode(vin) {
    const res = await fetch(`${API}/${encodeURIComponent(vin)}?format=json`);
    if (!res.ok) throw new Error("NHTSA service returned " + res.status);
    const data = await res.json();
    const r = data.Results && data.Results[0];
    if (!r || r.ErrorCode !== "0") {
      throw new Error("NHTSA could not decode this VIN. It may be mistyped, or too new/old for the database.");
    }
    const pick = (...vals) => vals.find(v => v && v !== "") || "—";
    return {
      vin,
      year: pick(r.ModelYear),
      make: pick(r.Make),
      model: pick(r.Model),
      trim: pick(r.Trim, r.Series),
      body: pick(r.BodyClass),
      engine: [r.EngineCylinders ? r.EngineCylinders + " cyl" : "", r.DisplacementL ? r.DisplacementL + "L" : "", r.FuelTypePrimary].filter(Boolean).join(" · ") || "—",
      drive: pick(r.DriveType),
      transmission: pick(r.TransmissionStyle),
      plant: [r.PlantCity, r.PlantCountry].filter(v => v).join(", ") || "—",
      manufacturer: pick(r.Manufacturer),
      gvwr: pick(r.GVWR),
    };
  }

  const LABELS = [
    ["year", "Model year"], ["make", "Make"], ["model", "Model"],
    ["trim", "Trim / series"], ["body", "Body style"], ["engine", "Engine"],
    ["drive", "Drive type"], ["transmission", "Transmission"],
    ["plant", "Assembly plant"], ["manufacturer", "Manufacturer"], ["gvwr", "GVWR"],
  ];

  /** Render a decoded result into a container element. */
  function render(container, decoded) {
    const rows = LABELS.map(([key, label]) =>
      `<div><span>${label}</span><b>${decoded[key]}</b></div>`
    ).join("");
    container.innerHTML = `
      <h4 style="margin:0 0 4px">Factory record for <code>${decoded.vin}</code></h4>
      <p style="margin:0 0 6px;color:var(--muted);font-size:.9rem">Source: U.S. DOT NHTSA. Compare this against the ad — trim, year, and engine should match exactly.</p>
      <div class="vin-grid">${rows}</div>`;
  }

  function renderError(container, message) {
    container.innerHTML = `<div class="vin-error">${message}</div>`;
  }

  return { validate, decode, render, renderError };
})();
