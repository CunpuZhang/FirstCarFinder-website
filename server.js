// server.js — for CunPu's current VS Code structure
// Put this file in FIRSTCARFINDER-WEBSITE, on the same level as index.html
// (next to assets / css / data / js / README.md — NOT inside any subfolder)
// Run: npm init -y && npm install express && node server.js
const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

// index.html is in this same folder, so serve this folder itself
app.use(express.static(path.join(__dirname)));

app.listen(PORT, () => {
  console.log(`FirstCarFinder is running at http://localhost:${PORT}`);
});
