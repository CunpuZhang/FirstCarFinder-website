// api/ask.js — Ask chat backend for FirstCarFinder.
//
// Works two ways with no npm dependencies (Node 18+ only):
//   • On Vercel, this file is picked up automatically as the serverless
//     function for POST /api/ask.
//   • Locally, server.js mounts it in Express at POST /api/ask.
//
// The API key lives ONLY in an environment variable on the server —
// never in this file, never in the browser, never in GitHub:
//   ANTHROPIC_API_KEY  → answers come from Claude  (provider "Claude")
//   GEMINI_API_KEY     → answers come from Gemini  (provider "Gemini")
// If neither is set, the endpoint answers 503 { error: "not_configured" }
// and the chat widget tells the user honestly that it is not switched on.

const MAX_QUESTION = 500;
const MAX_HISTORY_ITEMS = 6;
const MAX_HISTORY_TEXT = 500;
const MAX_CONTEXT = 6000;
const UPSTREAM_TIMEOUT_MS = 20000;

const SYSTEM_PROMPT = [
  "You are the FirstCarFinder assistant, a helper for first-time car buyers in Canada.",
  "Answer ONLY using the car data provided in the conversation, plus general first-car buying guidance (budgeting, insurance, test drives, negotiation, financing basics, maintenance).",
  "Prices in the provided data are 2026 Canadian starting MSRPs in CAD, before freight, fees and tax, unless the data says otherwise for a specific car. Say so when you quote a price.",
  "If the answer is not in the provided data, say so honestly instead of inventing specs, prices, trims, or features.",
  "Keep answers short — about 180 words at most — in plain, friendly English. Do not use markdown tables."
].join(" ");

function cleanText(value, max) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function parseBody(req) {
  const body = req && req.body;
  if (body == null) return {};
  if (typeof body === "object") return body;
  if (typeof body === "string") {
    try { return JSON.parse(body); } catch (e) { return {}; }
  }
  return {};
}

function validate(raw) {
  const question = cleanText(raw.question, MAX_QUESTION);
  if (!question) return null;

  let history = [];
  if (Array.isArray(raw.history)) {
    history = raw.history
      .slice(-MAX_HISTORY_ITEMS)
      .map((h) => ({
        role: h && h.role === "assistant" ? "assistant" : "user",
        text: cleanText(h && h.text, MAX_HISTORY_TEXT)
      }))
      .filter((h) => h.text);
  }

  const context = cleanText(raw.context, MAX_CONTEXT);
  return { question, history, context };
}

function buildPrompt({ question, history, context }) {
  const parts = [];
  if (context) {
    parts.push("Car data from the FirstCarFinder dataset (the only car facts you may use):\n" + context);
  }
  if (history.length) {
    const transcript = history
      .map((h) => (h.role === "assistant" ? "Assistant: " : "User: ") + h.text)
      .join("\n");
    parts.push("Conversation so far:\n" + transcript);
  }
  parts.push("User question: " + question);
  return parts.join("\n\n");
}

async function fetchJson(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(url, Object.assign({}, options, { signal: controller.signal }));
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    return { res, data };
  } finally {
    clearTimeout(timer);
  }
}

async function askClaude(apiKey, prompt) {
  const { res, data } = await fetchJson("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (!res.ok || !data) {
    const err = new Error("upstream_failed");
    err.status = res.status;
    throw err;
  }
  const text = Array.isArray(data.content)
    ? data.content.filter((b) => b && b.type === "text").map((b) => b.text).join("").trim()
    : "";
  if (!text) throw new Error("upstream_failed");
  return text;
}

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-3-flash-preview", "gemini-2.0-flash"];

async function askGemini(apiKey, prompt) {
  let lastStatus = null;
  for (const model of GEMINI_MODELS) {
    const { res, data } = await fetchJson(
      "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );
    if (res.ok && data) {
      const parts =
        data.candidates &&
        data.candidates[0] &&
        data.candidates[0].content &&
        Array.isArray(data.candidates[0].content.parts)
          ? data.candidates[0].content.parts
          : [];
      const text = parts.map((p) => (p && p.text) || "").join("").trim();
      if (text) return text;
      lastStatus = res.status;
      break;
    }
    lastStatus = res.status;
    // 404 = this model name is not available to the key; try the next one.
    // Any other status (400 key invalid, 403 not enabled, 429 quota) will
    // fail the same way for every model, so stop and report it.
    if (res.status !== 404) break;
  }
  const err = new Error("upstream_failed");
  err.status = lastStatus;
  throw err;
}

module.exports = async (req, res) => {
  if (req.method && req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const input = validate(parseBody(req));
  if (!input) {
    return res.status(400).json({ error: "bad_request" });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  let provider = null;
  let call = null;
  if (anthropicKey) {
    provider = "Claude";
    call = () => askClaude(anthropicKey, buildPrompt(input));
  } else if (geminiKey) {
    provider = "Gemini";
    call = () => askGemini(geminiKey, buildPrompt(input));
  } else {
    return res.status(503).json({ error: "not_configured" });
  }

  try {
    const answer = await call();
    return res.status(200).json({ answer, provider });
  } catch (e) {
    // Never leak the key or the upstream error body — but the HTTP status
    // alone is safe and is the difference between "key is wrong" (400),
    // "API not enabled" (403) and "model not found" (404) when debugging.
    console.error("ask upstream failed:", provider, e && e.status ? e.status : e);
    return res.status(502).json({
      error: "upstream_failed",
      provider,
      upstreamStatus: (e && e.status) || null
    });
  }
};
