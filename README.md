# FirstCarFinder

A data-driven website that helps first-time car buyers in Canada find a car that fits their budget and daily life — with real prices, real specs, and real places to buy.

Built for DESN31927 Project 1: Dynamic Data and Third-Party APIs (Fall 2026).

## What it does

- **Spotlight Picks** — a rotating showcase for visitors who have not started comparing yet: three award picks (lowest price, best fuel economy, longest warranty, most cargo, winter-ready value, best hybrid value) computed live from the dataset and refreshed every 30 minutes, each with a live Bank of Canada prime-rate payment estimate and a live NHTSA recall check
- **Ask chat assistant** — a small chat window (bottom-right) that answers questions about the cars on the site, backed by a real AI model through a server-side endpoint (`/api/ask`) so the API key is never exposed in the browser
- **4-step finder wizard** — budget, body style and seats, powertrain, then top priority and daily commute
- **Match scoring** — every car in the dataset is filtered and scored against the answers, with a plain-language reason for each recommendation
- **Compare up to 3 cars** side by side: price, fuel economy, cargo space, warranty, and estimated yearly fuel cost
- **Car detail view** — specs, pros and cons, factory warranty, official brand page, and buying links
- **VIN decoder** — enter a 17-character VIN and get the factory record back live from the U.S. DOT NHTSA database, so a listing can be checked before buying
- **Favourites** saved in the browser, a six-step buying guide, and light/dark mode

## File structure

```
├── index.html        # page structure only (no inline CSS/JS)
├── css/
│   └── styles.css    # all styling, light + dark mode
├── js/
│   ├── app.js        # finder wizard, scoring, compare, modal, favourites
│   ├── vin.js        # VIN decoding via the NHTSA API (no API key needed)
│   ├── spotlight.js  # rotating Spotlight Picks + live rate / recall data
│   └── ask.js        # Ask chat widget (talks to /api/ask, never to a key)
├── api/
│   └── ask.js        # chat backend (Vercel serverless + Express mount)
├── data/
│   └── cars.json     # the car database — 17 real 2026 models sold in Canada
├── assets/           # car photos (see credits below)
├── server.js         # small Express server for running the site locally
└── README.md
```

## Run it locally

Requires Node.js.

```
npm install
node server.js
```

Then open http://localhost:3000

> Do not just double-click `index.html` — the car data is loaded from `data/cars.json` with `fetch()`, which browsers block on `file://`. The site needs to be served, either by this server or by any static host such as Vercel.

## Data sources

- **Prices** — starting MSRPs for 2026 models from official Canadian brand sites and manufacturer press releases, before freight, fees, and tax unless noted on the car itself. Prices change; re-check the official site before buying.
- **Fuel economy** — Natural Resources Canada ratings.
- **VIN decoding** — U.S. DOT NHTSA vPIC API (`DecodeVinValuesExtended`), free and no API key required.
- **Recall counts (Spotlight Picks)** — NHTSA recalls API (`api.nhtsa.gov/recalls/recallsByVehicle`), live per model, free and no API key required.
- **Payment estimates (Spotlight Picks)** — Bank of Canada Valet API (series `V80691311`, the chartered-bank prime lending rate), live and free with no API key. Estimates assume 10% down, 60 months, prime + 2% — a reference figure only, not a dealer quote.
- **Ask chat** — a large-language-model API (Anthropic Claude or Google Gemini), called only from the server-side `/api/ask` endpoint. The key is stored in environment variables (see below), never in the code.
- **Buying channels** — official brand pages, plus AutoTrader, CarGurus, Kijiji Autos, and Clutch.

The dataset is a researched snapshot in `data/cars.json`, not live dealer inventory.

## AI chat setup (optional)

The Ask chat window works only when an API key is configured on the server — without one it honestly reports that it is "not switched on" instead of faking answers.

1. Get a key: a **free Google Gemini API key** from Google AI Studio (no credit card required), or an Anthropic API key for Claude.
2. On Vercel: **Project → Settings → Environment Variables**, add `GEMINI_API_KEY` (or `ANTHROPIC_API_KEY`) with your key, then redeploy. Locally, set the same variable in your terminal before `node server.js`.
3. If both are set, Claude is used. The widget header shows which provider answered ("Ask Muse" only appears when the backend reports Claude).

**Never commit an API key to GitHub** — keys belong in environment variables only. Anyone who finds a committed key can spend your money with it.

## Image sources

Every vehicle photo is a **real photograph** from **Wikimedia Commons** — no AI-generated imagery is used anywhere. Each photo is credited in the page footer ("Photo credits") with the photographer, licence (CC BY / CC BY-SA / CC0 / Public domain), and a link to the original file page. Photos show the correct model and generation for each car; the trim in a photo may differ slightly from the listed Canadian trim.
