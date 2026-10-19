// spotlight.js — "Spotlight Picks" section.
//
// Three award-winning picks from data/cars.json, rotating every 30 minutes.
// The six award categories are computed from the real car data at runtime —
// nothing is hand-picked or hardcoded. Two live data layers are added on top:
//   • Bank of Canada Valet API (free, no key): the current prime lending
//     rate, used for an estimated monthly payment on each card.
//   • NHTSA recalls API (free, no key): live recall-campaign count per car.
// If either live fetch fails, that line is simply left off the card —
// a rate or a recall count is never invented.

(function () {
  "use strict";

  var SLOT_MS = 30 * 60 * 1000; // 30 minutes
  var BOC_URL = "https://www.bankofcanada.ca/valet/observations/V80691311/json?recent=1";
  var RECALLS_URL = "https://api.nhtsa.gov/recalls/recallsByVehicle";

  var grid = document.getElementById("spotlight-grid");
  var statusEl = document.getElementById("spotlight-status");
  if (!grid) return;

  var cars = null;
  var currentSlot = null;

  function money(n) {
    return "$" + Math.round(n).toLocaleString("en-CA");
  }

  function combinedFuel(car) {
    if (car.fuelCityL100km == null || car.fuelHwyL100km == null) return null;
    return (car.fuelCityL100km + car.fuelHwyL100km) / 2;
  }

  function fuelText(car) {
    var combined = combinedFuel(car);
    return combined.toFixed(1) + " L/100 km combined (" +
      car.fuelCityL100km.toFixed(1) + " city / " + car.fuelHwyL100km.toFixed(1) + " highway)";
  }

  // ---------- award categories, computed from the data ----------

  function warrantyKmScore(car) {
    // null km in the data means an unlimited-kilometre warranty — the best.
    return car.warrantyKm == null ? Infinity : car.warrantyKm;
  }

  function buildCategories(list) {
    var byPrice = list.slice().sort(function (a, b) { return a.msrpCAD - b.msrpCAD; });

    var fuelCars = list.filter(function (c) {
      return (c.powertrain === "gas" || c.powertrain === "hybrid") && combinedFuel(c) != null;
    }).sort(function (a, b) { return combinedFuel(a) - combinedFuel(b); });

    var warrantyCars = list.slice().sort(function (a, b) {
      if (b.warrantyYears !== a.warrantyYears) return b.warrantyYears - a.warrantyYears;
      return warrantyKmScore(b) - warrantyKmScore(a);
    });

    var cargoCars = list.slice().sort(function (a, b) { return b.cargoL - a.cargoL; });
    var awdCars = list.filter(function (c) { return c.drivetrain === "AWD"; })
      .sort(function (a, b) { return a.msrpCAD - b.msrpCAD; });
    var hybrids = list.filter(function (c) { return c.powertrain === "hybrid"; })
      .sort(function (a, b) { return a.msrpCAD - b.msrpCAD; });

    var cheapest = byPrice[0];
    var fuelBest = fuelCars[0];
    var warrantyBest = warrantyCars[0];
    var cargoBest = cargoCars[0];
    var awdBest = awdCars[0];
    var hybridBest = hybrids[0];

    return [
      {
        label: "Lowest starting price",
        car: cheapest,
        reason: "The lowest starting MSRP of all " + list.length + " cars on this site — " +
          money(cheapest.msrpCAD) + " before freight, fees and tax."
      },
      {
        label: "Best fuel economy",
        car: fuelBest,
        reason: "The most efficient gas or hybrid car here: " + fuelText(fuelBest) + "."
      },
      {
        label: "Longest warranty",
        car: warrantyBest,
        reason: "The longest factory coverage on the site: " + warrantyBest.warrantyYears +
          "-year / " + (warrantyBest.warrantyKm == null ? "unlimited-kilometre" : warrantyBest.warrantyKm.toLocaleString("en-CA") + " km") +
          " comprehensive warranty."
      },
      {
        label: "Most cargo space",
        car: cargoBest,
        reason: "The biggest cargo area of any car here: " + cargoBest.cargoL + " L — room for bikes, boxes and road-trip gear."
      },
      {
        label: "Winter-ready value",
        car: awdBest,
        reason: "The cheapest way into all-wheel drive: standard AWD at " + money(awdBest.msrpCAD) +
          ", with no options to add for Canadian winters."
      },
      {
        label: "Best hybrid value",
        car: hybridBest,
        reason: "The lowest-priced hybrid on the site at " + money(hybridBest.msrpCAD) +
          ", using just " + fuelText(hybridBest) + "."
      }
    ];
  }

  function picksForSlot(categories, slot) {
    var n = categories.length;
    return [slot % n, (slot + 2) % n, (slot + 4) % n].map(function (i) { return categories[i]; });
  }

  // ---------- rendering ----------

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function render(picks) {
    grid.innerHTML = picks.map(function (pick) {
      var car = pick.car;
      var name = car.year + " " + car.make + " " + car.model;
      return '' +
        '<article class="car-card spotlight-card">' +
          '<div class="photo">' +
            '<img src="' + esc(car.image) + '" alt="' + esc(name) + '" loading="lazy" />' +
            '<span class="match-badge">🏆 ' + esc(pick.label) + '</span>' +
          '</div>' +
          '<div class="info">' +
            '<h4>' + esc(name) + '</h4>' +
            '<div class="trim">' + esc(car.trim) + ' · ' + esc(car.bodyStyle) + ' · ' + esc(car.powertrain) + '</div>' +
            '<div class="price-line"><span class="msrp">' + money(car.msrpCAD) + '</span><span class="per">starting MSRP</span></div>' +
            '<p class="spotlight-reason">' + esc(pick.reason) + '</p>' +
            '<p class="spotlight-live" data-live="pay" data-car="' + esc(car.id) + '" hidden></p>' +
            '<p class="spotlight-live" data-live="recalls" data-car="' + esc(car.id) + '" hidden></p>' +
            '<div class="card-actions">' +
              '<a class="btn small" href="#finder">Try the finder</a>' +
              '<a class="btn small ghost" href="' + esc(car.officialUrl) + '" target="_blank" rel="noopener">Official page</a>' +
            '</div>' +
          '</div>' +
        '</article>';
    }).join("");
  }

  function setLiveLine(kind, carId, text) {
    var el = grid.querySelector('[data-live="' + kind + '"][data-car="' + carId + '"]');
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
  }

  // ---------- live layer 1: Bank of Canada prime rate → payment estimate ----------

  // Standard amortization: principal = MSRP minus 10% down, 60 months,
  // APR = current prime rate + 2 percentage points.
  function monthlyPayment(msrpCAD, primeRate) {
    var principal = msrpCAD * 0.9;
    var r = (primeRate + 2) / 100 / 12;
    var n = 60;
    return (principal * r) / (1 - Math.pow(1 + r, -n));
  }

  function loadPrimeRate(picks) {
    fetch(BOC_URL)
      .then(function (res) { if (!res.ok) throw new Error("boc"); return res.json(); })
      .then(function (data) {
        var obs = data && data.observations && data.observations[0];
        var cell = obs && obs.V80691311;
        var prime = cell ? parseFloat(cell.v) : NaN;
        if (!isFinite(prime)) return; // no rate, no payment line — never guess
        picks.forEach(function (pick) {
          var pay = monthlyPayment(pick.car.msrpCAD, prime);
          setLiveLine("pay", pick.car.id,
            "Est. " + money(pay) + "/mo — 10% down, 60 mo, at prime " + prime.toFixed(2) + "% + 2% (Bank of Canada)");
        });
      })
      .catch(function () { /* silently omit the payment estimate */ });
  }

  // ---------- live layer 2: NHTSA recall campaigns ----------

  function recallModel(model) {
    // "Mazda3 Sport" → "Mazda3", "Civic Hatchback" → "Civic",
    // "Corolla Hybrid" → "Corolla"; names like "Corolla Cross",
    // "Model 3", "HR-V" and "GR86" stay as they are.
    return model.replace(/ (Sport|Hatchback|Hybrid)$/, "");
  }

  function loadRecalls(picks) {
    picks.forEach(function (pick) {
      var car = pick.car;
      var url = RECALLS_URL +
        "?make=" + encodeURIComponent(car.make) +
        "&model=" + encodeURIComponent(recallModel(car.model)) +
        "&modelYear=" + encodeURIComponent(car.year);
      fetch(url)
        .then(function (res) { if (!res.ok) throw new Error("nhtsa"); return res.json(); })
        .then(function (data) {
          var count = data && typeof data.Count === "number" ? data.Count : null;
          if (count == null) return;
          setLiveLine("recalls", car.id, count === 0
            ? "NHTSA recalls: 0 campaigns"
            : "NHTSA recalls: " + count + " campaign" + (count === 1 ? "" : "s") + " — check before buying");
        })
        .catch(function () { /* silently omit the recall line */ });
    });
  }

  // ---------- rotation + countdown ----------

  function slotStart(slot) {
    return new Date(slot * SLOT_MS);
  }

  function two(n) { return (n < 10 ? "0" : "") + n; }

  function tick() {
    var now = Date.now();
    var slot = Math.floor(now / SLOT_MS);
    if (cars && slot !== currentSlot) {
      currentSlot = slot;
      var picks = picksForSlot(buildCategories(cars), slot);
      render(picks);
      loadPrimeRate(picks);
      loadRecalls(picks);
    }
    if (statusEl && currentSlot != null) {
      var remaining = Math.max(0, SLOT_MS - (now % SLOT_MS));
      var secs = Math.floor(remaining / 1000);
      var started = slotStart(currentSlot);
      statusEl.textContent =
        "Updated " + two(started.getHours()) + ":" + two(started.getMinutes()) +
        " · Next refresh in " + two(Math.floor(secs / 60)) + ":" + two(secs % 60);
    }
  }

  // ---------- boot ----------

  fetch("data/cars.json")
    .then(function (res) { if (!res.ok) throw new Error("data"); return res.json(); })
    .then(function (data) {
      cars = data.cars || [];
      currentSlot = null; // force first render on the next tick
      tick();
      setInterval(tick, 1000);
    })
    .catch(function () {
      grid.innerHTML = '<p class="empty-results"><b>Spotlight picks are unavailable right now.</b>The finder below still has every car.</p>';
      if (statusEl) statusEl.textContent = "";
    });
})();
