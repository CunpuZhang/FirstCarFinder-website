/* ============================================================
   app.js — FirstCarFinder main application.
   Loads real car data from data/cars.json, runs the 4-step
   finder wizard, scores matches, and powers compare / modal /
   favorites / buying channels.
   ============================================================ */
(() => {
  "use strict";

  /* ---------------- helpers ---------------- */
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const cad = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
  const fmtCAD = n => cad.format(n);
  const GAS_PRICE_PER_L = 1.5; // assumption, always labelled as estimate

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  /* ---------------- state ---------------- */
  const state = {
    step: 1,
    cars: [],
    marketplaces: {},
    channels: [],
    budget: 35000,
    bodies: new Set(),
    seats: 5,
    powers: new Set(),
    priority: "price",
    commute: 40,
    compare: [],
    favs: new Set(JSON.parse(localStorage.getItem("fcf-favs") || "[]")),
  };

  const BODY_OPTIONS = [
    { id: "sedan", label: "Sedan", desc: "Efficient, easy to park" },
    { id: "hatchback", label: "Hatchback", desc: "City-friendly + flexible cargo" },
    { id: "coupe", label: "Coupe", desc: "Fun first, just for two-ish" },
    { id: "suv", label: "SUV / Crossover", desc: "Space + winter confidence" },
    { id: "truck", label: "Pickup truck", desc: "Haul + tow" },
  ];
  const POWER_OPTIONS = [
    { id: "gas", label: "Gas", desc: "Lowest sticker price" },
    { id: "hybrid", label: "Hybrid", desc: "Sips fuel, no plugging in" },
    { id: "electric", label: "Electric", desc: "No gas, quiet, torquey" },
  ];
  const PRIORITY_OPTIONS = [
    { id: "price", label: "Lowest price", desc: "Stretch every dollar" },
    { id: "fuel", label: "Fuel savings", desc: "Spend less at the pump" },
    { id: "space", label: "Space", desc: "People + cargo room" },
    { id: "tech", label: "Tech & safety", desc: "Driver assists, screens" },
    { id: "winter", label: "Winter-ready", desc: "AWD for Canadian winters" },
    { id: "warranty", label: "Long warranty", desc: "Best factory coverage" },
  ];

  /* ---------------- data ---------------- */
  async function loadData() {
    const res = await fetch("data/cars.json");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    state.cars = data.cars || [];
    state.marketplaces = data.marketplaces || {};
    state.channels = data.channels || [];
  }

  function carById(id) { return state.cars.find(c => c.id === id); }
  function combinedFuel(car) {
    if (car.powertrain === "electric") return null;
    if (car.fuelCityL100km && car.fuelHwyL100km) return (car.fuelCityL100km + car.fuelHwyL100km) / 2;
    return null;
  }
  function yearlyFuelCost(car) {
    const c = combinedFuel(car);
    if (c == null) return null;
    return Math.round(state.commute * 365 * (c / 100) * GAS_PRICE_PER_L);
  }

  /* ---------------- wizard ---------------- */
  function renderChips(containerId, options, selectedSet, single = false) {
    const box = $("#" + containerId);
    box.innerHTML = "";
    options.forEach(opt => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (selectedSet.has(opt.id) ? " selected" : "");
      b.innerHTML = `<b>${opt.label}</b><small>${opt.desc}</small>`;
      b.setAttribute("aria-pressed", selectedSet.has(opt.id));
      b.addEventListener("click", () => {
        if (single) { selectedSet.clear(); selectedSet.add(opt.id); }
        else { selectedSet.has(opt.id) ? selectedSet.delete(opt.id) : selectedSet.add(opt.id); }
        renderChips(containerId, options, selectedSet, single);
      });
      box.appendChild(b);
    });
  }

  function goStep(n) {
    state.step = Math.min(5, Math.max(1, n));
    $$(".finder-step").forEach(s => s.classList.toggle("active", +s.dataset.step === state.step));
    $$("#finder-progress i").forEach((bar, i) => bar.classList.toggle("done", i < state.step));
    $("#finder-back").disabled = state.step === 1;
    $("#finder-next").textContent = state.step === 4 ? "See my matches →" : state.step === 5 ? "↺ Start over" : "Next →";
    if (state.step === 5) renderResults();
    $("#finder-app").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function initWizard() {
    // chips are data-driven: only offer body styles / powertrains the database actually has
    const bodies = BODY_OPTIONS.filter(o => state.cars.some(c => c.bodyStyle === o.id));
    const powers = POWER_OPTIONS.filter(o => state.cars.some(c => c.powertrain === o.id));
    renderChips("body-chips", bodies, state.bodies);
    renderChips("power-chips", powers, state.powers);
    const prioSet = new Set([state.priority]);
    renderChips("priority-chips", PRIORITY_OPTIONS, prioSet, true);
    $("#priority-chips").addEventListener("click", () => {
      state.priority = [...prioSet][0];
    }, { once: false });

    const budget = $("#budget");
    budget.addEventListener("input", () => {
      state.budget = +budget.value;
      $("#budget-value").textContent = fmtCAD(state.budget);
    });
    $("#seats").addEventListener("change", e => { state.seats = +e.target.value; });
    $("#commute").addEventListener("input", e => { state.commute = Math.max(0, +e.target.value || 0); });

    $("#finder-back").addEventListener("click", () => goStep(state.step - 1));
    $("#finder-next").addEventListener("click", () => {
      if (state.step === 5) { goStep(1); return; }
      goStep(state.step + 1);
    });
  }

  /* ---------------- scoring ---------------- */
  // Weights sum to 1 per priority. winter/warranty are real, per-car data
  // (drivetrain, factory warranty years) — not invented scores.
  const WEIGHTS = {
    price:    { value: .5,  fuel: .2,  space: .15, tech: .15, winter: 0,   warranty: 0 },
    fuel:     { value: .2,  fuel: .5,  space: .15, tech: .15, winter: 0,   warranty: 0 },
    space:    { value: .2,  fuel: .15, space: .5,  tech: .15, winter: 0,   warranty: 0 },
    tech:     { value: .15, fuel: .15, space: .2,  tech: .5,  winter: 0,   warranty: 0 },
    winter:   { value: .15, fuel: .15, space: .15, tech: .05, winter: .5,  warranty: 0 },
    warranty: { value: .2,  fuel: .1,  space: .1,  tech: 0,   winter: 0,   warranty: .6 },
  };

  function scoreCars() {
    // hard filters first
    const pool = state.cars.filter(c =>
      c.msrpCAD <= state.budget &&
      (state.bodies.size === 0 || state.bodies.has(c.bodyStyle)) &&
      (state.powers.size === 0 || state.powers.has(c.powertrain)) &&
      c.seats >= state.seats
    );
    if (!pool.length) return [];

    const minP = Math.min(...pool.map(c => c.msrpCAD));
    const maxP = Math.max(...pool.map(c => c.msrpCAD));
    const fuels = pool.map(c => combinedFuel(c)).filter(v => v != null);
    const minF = fuels.length ? Math.min(...fuels) : 0;
    const maxF = fuels.length ? Math.max(...fuels) : 1;
    const minC = Math.min(...pool.map(c => c.cargoL || 0));
    const maxC = Math.max(...pool.map(c => c.cargoL || 0));
    const maxT = Math.max(...pool.map(c => (c.features || []).length), 1);
    const minW = Math.min(...pool.map(c => c.warrantyYears || 0));
    const maxW = Math.max(...pool.map(c => c.warrantyYears || 0));
    const w = WEIGHTS[state.priority] || WEIGHTS.price;
    const norm = (v, lo, hi) => hi === lo ? 1 : (v - lo) / (hi - lo);
    const isAwd = c => /awd|4wd|4x4/i.test(c.drivetrain || "");

    return pool.map(car => {
      const value = 1 - norm(car.msrpCAD, minP, maxP);
      const cf = combinedFuel(car);
      const fuel = car.powertrain === "electric" ? 1 : 1 - norm(cf, minF, maxF);
      const space = norm(car.cargoL || 0, minC, maxC);
      const tech = ((car.features || []).length) / maxT;
      const winter = isAwd(car) ? 1 : 0;
      const warranty = norm(car.warrantyYears || 0, minW, maxW);
      const total = value * w.value + fuel * w.fuel + space * w.space + tech * w.tech + winter * w.winter + warranty * w.warranty;
      // 60-point base: every car here already passed all hard filters.
      // The remaining 35 points differentiate on the user's priority.
      return { car, score: Math.min(97, Math.round(60 + total * 35)), value, fuel, space, tech, winter, warranty };
    }).sort((a, b) => b.score - a.score);
  }

  function whyBullets(ranked, entry) {
    const { car } = entry;
    const out = [];
    const under = state.budget - car.msrpCAD;
    if (under >= 0) out.push(`Fits your budget — ${fmtCAD(under)} under your max`);
    const cf = combinedFuel(car);
    if (car.powertrain === "electric") out.push("Electric — skip gas stations entirely");
    else if (car.powertrain === "hybrid") out.push("Hybrid — sips fuel, no plugging in");
    else if (entry.fuel >= 0.99 && ranked.some(r => combinedFuel(r.car) != null)) out.push(`Best fuel economy of your matches${cf ? ` (${cf.toFixed(1)} L/100km combined)` : ""}`);
    if (entry.space >= 0.99 && ranked.length > 1) out.push(`Roomiest cargo here (${car.cargoL} L)`);
    if (entry.winter === 1 && state.priority === "winter") out.push("AWD for Canadian winters");
    if (entry.warranty >= 0.99 && ranked.length > 1 && (car.warrantyYears || 0) > 3) out.push(`Longest factory warranty here (${car.warrantyYears} yr)`);
    if (state.powers.size === 1 && car.powertrain === [...state.powers][0]) out.push("Matches your powertrain pick");
    return out.slice(0, 3);
  }

  /* ---------------- results ---------------- */
  function specLine(car) {
    const cf = combinedFuel(car);
    const fuelTxt = car.powertrain === "electric" ? `${car.rangeKm} km range` : `${cf.toFixed(1)} L/100km`;
    return `<div class="spec-row"><span>🚗 <b>${cap(car.bodyStyle)}</b></span><span>⛽ <b>${fuelTxt}</b></span><span>💺 <b>${car.seats} seats</b></span></div>`;
  }
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  function renderResults() {
    const box = $("#results");
    const ranked = scoreCars();
    $("#results-count").textContent = ranked.length ? `${ranked.length} car${ranked.length > 1 ? "s" : ""} in budget` : "";
    if (!ranked.length) {
      box.innerHTML = `<div class="empty-results" style="grid-column:1/-1">
        <b>No cars fit those filters.</b>
        Try raising your budget or picking fewer body styles — great first cars exist at every price.
        <br/><br/><button class="btn" id="empty-reset">Adjust my answers</button></div>`;
      $("#empty-reset").addEventListener("click", () => goStep(1));
      return;
    }
    box.innerHTML = "";
    ranked.forEach(entry => {
      const { car, score } = entry;
      const fuelCost = yearlyFuelCost(car);
      const card = document.createElement("article");
      card.className = "car-card";
      card.innerHTML = `
        <div class="photo">
          <img src="${car.image}" alt="${car.year} ${car.make} ${car.model}" loading="lazy" />
          <span class="match-badge">${score}% match</span>
          <button class="fav-btn ${state.favs.has(car.id) ? "active" : ""}" aria-label="Save to favorites">${state.favs.has(car.id) ? "♥" : "♡"}</button>
        </div>
        <div class="info">
          <h4>${car.year} ${car.make} ${car.model}</h4>
          <div class="trim">${car.trim} · ${cap(car.powertrain)} · ${car.drivetrain}</div>
          <div class="price-line"><span class="msrp">${fmtCAD(car.msrpCAD)}</span><span class="per">starting MSRP</span></div>
          ${specLine(car)}
          ${fuelCost != null ? `<div class="spec-row"><span>💰 Est. fuel: <b>${fmtCAD(fuelCost)}/yr</b></span></div>` : ""}
          <ul class="why">${whyBullets(ranked, entry).map(w => `<li>${w}</li>`).join("")}</ul>
          <div class="card-actions">
            <button class="btn small" data-act="detail">Details</button>
            <button class="btn small ghost" data-act="compare">${state.compare.includes(car.id) ? "✓ In compare" : "+ Compare"}</button>
            <a class="btn small ghost" href="${car.officialUrl}" target="_blank" rel="noopener">Official page ↗</a>
          </div>
        </div>`;
      card.querySelector(".fav-btn").addEventListener("click", ev => {
        ev.stopPropagation();
        toggleFav(car.id);
        ev.currentTarget.classList.toggle("active");
        ev.currentTarget.textContent = state.favs.has(car.id) ? "♥" : "♡";
      });
      card.querySelector('[data-act="detail"]').addEventListener("click", () => openModal(car));
      card.querySelector('[data-act="compare"]').addEventListener("click", ev => {
        toggleCompare(car.id);
        ev.currentTarget.textContent = state.compare.includes(car.id) ? "✓ In compare" : "+ Compare";
      });
      box.appendChild(card);
    });
  }

  function toggleFav(id) {
    state.favs.has(id) ? state.favs.delete(id) : state.favs.add(id);
    localStorage.setItem("fcf-favs", JSON.stringify([...state.favs]));
    toast(state.favs.has(id) ? "Saved to favorites ♥" : "Removed from favorites");
  }

  /* ---------------- compare ---------------- */
  function toggleCompare(id) {
    if (state.compare.includes(id)) state.compare = state.compare.filter(x => x !== id);
    else {
      if (state.compare.length >= 3) { toast("Compare holds up to 3 cars"); return; }
      state.compare.push(id);
    }
    renderCompareBar();
  }

  function renderCompareBar() {
    const bar = $("#compare-bar");
    $("#compare-label").textContent = `Compare (${state.compare.length}/3)`;
    const slots = $("#compare-slots");
    slots.innerHTML = "";
    state.compare.forEach(id => {
      const c = carById(id);
      const s = document.createElement("span");
      s.className = "slot";
      s.innerHTML = `${c.make} ${c.model} <button aria-label="Remove">✕</button>`;
      s.querySelector("button").addEventListener("click", () => toggleCompare(id));
      slots.appendChild(s);
    });
    bar.classList.toggle("show", state.compare.length > 0);
  }

  function renderCompareTable() {
    const wrap = $("#compare-wrap"), table = $("#compare-table");
    const cars = state.compare.map(carById).filter(Boolean);
    $("#compare-empty").style.display = cars.length ? "none" : "";
    wrap.hidden = !cars.length;
    if (!cars.length) return;
    const fuelTxt = c => c.powertrain === "electric" ? `${c.rangeKm} km range` : `${combinedFuel(c).toFixed(1)} L/100km comb.`;
    const rows = [
      ["", cars.map(c => `<img src="${c.image}" alt="${c.make} ${c.model}" />`).join("</td><td>")],
      ["Starting MSRP", cars.map(c => `<b>${fmtCAD(c.msrpCAD)}</b>`).join("</td><td>")],
      ["Body style", cars.map(c => cap(c.bodyStyle)).join("</td><td>")],
      ["Seats", cars.map(c => c.seats).join("</td><td>")],
      ["Powertrain", cars.map(c => `${cap(c.powertrain)} · ${c.drivetrain}`).join("</td><td>")],
      ["Fuel economy", cars.map(fuelTxt).join("</td><td>")],
      ["Cargo", cars.map(c => `${c.cargoL} L`).join("</td><td>")],
      ["Est. yearly fuel*", cars.map(c => { const f = yearlyFuelCost(c); return f != null ? fmtCAD(f) : "No gas cost"; }).join("</td><td>")],
      ["Official page", cars.map(c => `<a href="${c.officialUrl}" target="_blank" rel="noopener">Official page ↗</a>`).join("</td><td>")],
    ];
    table.innerHTML = `<thead><tr><th></th>${cars.map(c => `<th>${c.year} ${c.make}<br/>${c.model}</th>`).join("")}</tr></thead>` +
      `<tbody>${rows.map(([h, tds]) => `<tr><th>${h}</th><td>${tds}</td></tr>`).join("")}</tbody>` +
      `<caption style="caption-side:bottom;text-align:left;padding:10px 4px;color:var(--muted);font-size:.8rem">*Fuel estimate: your daily distance × 365 days × combined rating × $1.50/L. Your driving will differ.</caption>`;
  }

  /* ---------------- detail modal ---------------- */
  function buyLinks(car) {
    const links = [`<a class="btn small" href="${car.officialUrl}" target="_blank" rel="noopener">Official ${car.make} page ↗</a>`];
    for (const [key, label] of [["autotrader", "AutoTrader"], ["cargurus", "CarGurus"], ["kijiji", "Kijiji Autos"]]) {
      const m = state.marketplaces[key];
      if (!m) continue;
      const url = m.verified && m.pattern
        ? m.pattern.replace("{make}", car.make.toLowerCase()).replace("{model}", car.model.toLowerCase().replace(/[^a-z0-9]+/g, "-"))
        : m.homepage;
      if (url) links.push(`<a class="btn small ghost" href="${url}" target="_blank" rel="noopener">${label} ↗</a>`);
    }
    return links.join("");
  }

  function openModal(car) {
    const cf = combinedFuel(car);
    const fuelCost = yearlyFuelCost(car);
    $("#modal-img").src = car.image;
    $("#modal-img").alt = `${car.year} ${car.make} ${car.model}`;
    $("#modal-body").innerHTML = `
      <h3 id="modal-title">${car.year} ${car.make} ${car.model}</h3>
      <div class="trim">${car.trim} · ${cap(car.powertrain)} · ${car.drivetrain} · ${cap(car.bodyStyle)}</div>
      <div class="price-line"><span class="msrp">${fmtCAD(car.msrpCAD)}</span><span class="per">starting MSRP, before fees &amp; tax${car.msrpNote ? ` · ${car.msrpNote}` : ""}<br/>source: ${car.msrpSource}</span></div>
      <div class="detail-specs">
        <div><span>Fuel economy</span><b>${car.powertrain === "electric" ? car.rangeKm + " km range" : cf.toFixed(1) + " L/100km"}</b></div>
        <div><span>Seats</span><b>${car.seats}</b></div>
        <div><span>Cargo</span><b>${car.cargoL} L</b></div>
        <div><span>Drivetrain</span><b>${car.drivetrain}</b></div>
        <div><span>Factory warranty</span><b>${car.warrantyYears} yr${car.warrantyKm ? " / " + Math.round(car.warrantyKm / 1000) + ",000 km" : " / unlimited km"}</b></div>
      </div>
      ${fuelCost != null ? `<div class="cost-note">💰 At <b>${state.commute} km/day</b>, expect roughly <b>${fmtCAD(fuelCost)}/year</b> in fuel (estimate at $1.50/L).${car.powertrain === "hybrid" ? "" : " Hybrids and EVs cut this dramatically."}</div>` : `<div class="cost-note">⚡ Fully electric — no gas station visits. Home charging typically costs a fraction of gas.</div>`}
      <div class="pros-cons">
        <div><h5>✅ Strengths</h5><ul>${car.pros.map(p => `<li>${p}</li>`).join("")}</ul></div>
        <div><h5>⚠️ Trade-offs</h5><ul>${car.cons.map(c => `<li>${c}</li>`).join("")}</ul></div>
      </div>
      ${(car.features && car.features.length) ? `<p style="color:var(--muted);font-size:.9rem"><b style="color:var(--ink)">Notable features:</b> ${car.features.join(" · ")}</p>` : ""}
      <div class="buy-channels"><h4>Where to buy this car</h4><div class="channel-row">${buyLinks(car)}</div></div>`;
    $("#modal-backdrop").classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function closeModal() {
    $("#modal-backdrop").classList.remove("open");
    document.body.style.overflow = "";
  }

  /* ---------------- channels section ---------------- */
  function renderChannels() {
    const grid = $("#channel-grid");
    grid.innerHTML = "";
    state.channels.forEach(ch => {
      const card = document.createElement("div");
      card.className = "channel-card";
      card.innerHTML = `<span class="tag">${ch.tag}</span><h4>${ch.name}</h4><p>${ch.desc}</p><a class="btn small ghost" href="${ch.url}" target="_blank" rel="noopener">Visit ${ch.name} ↗</a>`;
      grid.appendChild(card);
    });
  }

  /* ---------------- hero stats ---------------- */
  function renderStats() {
    $("#stat-cars").textContent = state.cars.length;
    if (state.cars.length) $("#stat-lowest").textContent = fmtCAD(Math.min(...state.cars.map(c => c.msrpCAD)));
  }

  /* ---------------- VIN form ---------------- */
  function initVin() {
    $("#vin-form").addEventListener("submit", async e => {
      e.preventDefault();
      const input = $("#vin-input"), box = $("#vin-result"), btn = $("#vin-btn");
      const v = VinDecoder.validate(input.value);
      box.classList.add("show");
      if (!v.ok) { VinDecoder.renderError(box, v.error); return; }
      btn.disabled = true;
      box.innerHTML = `<p><span class="spinner"></span> Decoding with NHTSA…</p>`;
      try {
        const decoded = await VinDecoder.decode(v.vin);
        VinDecoder.render(box, decoded);
      } catch (err) {
        VinDecoder.renderError(box, err.message);
      }
      btn.disabled = false;
    });
  }

  /* ---------------- init ---------------- */
  async function init() {
    try {
      await loadData();
    } catch (err) {
      $("#results").innerHTML = `<div class="empty-results" style="grid-column:1/-1"><b>Couldn't load the car data.</b>data/cars.json failed to load (${err.message}). Serve this site from a local server (e.g. <code>npx serve</code>) instead of opening the file directly.</div>`;
      return;
    }
    initWizard();
    initVin();
    renderChannels();
    renderStats();
    renderCompareBar();
    $("#compare-go").addEventListener("click", () => {
      renderCompareTable();
      $("#compare").scrollIntoView({ behavior: "smooth" });
    });
    $("#modal-close").addEventListener("click", closeModal);
    $("#modal-backdrop").addEventListener("click", e => { if (e.target.id === "modal-backdrop") closeModal(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
    goStep(1);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
