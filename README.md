# FirstCarFinder — Website Files

A multi-file website for first-time car buyers in Canada.
Built as separate files per course requirement: HTML, CSS, and JS live apart.

## File structure

```
website/
├── index.html        # page structure only (no inline CSS/JS)
├── css/
│   └── styles.css    # all styling, light + dark mode
├── js/
│   ├── app.js        # finder wizard, scoring, compare, modal, favorites
│   └── vin.js        # VIN decoding via NHTSA (no API key needed)
├── data/
│   └── cars.json     # the car database — real models, real MSRPs, real links
├── assets/           # car photos
└── README.md         # this file
```

## Run it on your own Node server

You already installed Node.js. In a terminal, `cd` into the folder that
contains `website/`, then create a tiny server file:

```js
// server.js
const express = require("express");
const path = require("path");
const app = express();
app.use(express.static(path.join(__dirname, "website")));
app.listen(3000, () => console.log("http://localhost:3000"));
```

Then:

```
npm init -y
npm install express
node server.js
```

Open http://localhost:3000 — the whole site runs from your own computer.

> Do NOT just double-click `index.html`: the car data loads from
> `data/cars.json` with `fetch()`, which browsers block on `file://`.
> A static server (like the one above) is required.

## Deploy it to Vercel

1. Push this `website/` folder to a GitHub repo.
2. Go to vercel.com → Add New Project → Import the repo.
3. Deploy. You get a public `xxx.vercel.app` link. No environment
   variables needed — everything runs in the browser.

## Where the data comes from

- Prices: starting MSRPs from official Canadian brand sites (before fees/tax).
- Fuel economy: Natural Resources Canada ratings.
- VIN decoding: U.S. DOT NHTSA database (free, no key).
- Buying channels: official brand pages + AutoTrader / CarGurus / Kijiji Autos.

Prices change — re-check the official site before you present or buy.

## Image sources

Every vehicle photo on this site is a **real photograph** pulled from the
**Wikimedia Commons API** (`https://commons.wikimedia.org/w/api.php`) — no
AI-generated imagery is used anywhere. Each photo is credited in the page
footer ("Photo credits") with the photographer, license (CC BY / CC BY-SA /
CC0 / Public domain), and a link to the original file page. Photos show the
correct model and generation for each car; trim levels in photos may differ
slightly from the listed Canadian trim.
