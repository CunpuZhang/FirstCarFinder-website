// ask.js — "Ask" chat widget (bottom-right).
//
// The widget never answers anything itself. It sends the question to the
// site's own backend (POST /api/ask), which talks to a real AI provider
// using a key that lives only on the server. The widget header and footer
// show the provider name that the BACKEND reports — nothing is faked:
//   • provider "Claude"  → header "Ask Muse", footer "Powered by Claude"
//   • any other provider → header "Ask AI Assistant", footer "Powered by …"
// If the backend has no key configured it replies 503 and the widget says
// so honestly instead of inventing an answer.

(function () {
  "use strict";

  var toggleBtn = document.getElementById("ask-toggle");
  var panel = document.getElementById("ask-panel");
  var titleEl = document.getElementById("ask-title");
  var footEl = document.getElementById("ask-powered");
  var msgsEl = document.getElementById("ask-messages");
  var form = document.getElementById("ask-form");
  var input = document.getElementById("ask-input");
  var sendBtn = document.getElementById("ask-send");
  if (!toggleBtn || !panel || !form || !input || !msgsEl) return;

  var history = []; // last messages, { role: "user" | "assistant", text }
  var busy = false;

  // Compact context built from the real dataset, sent with each question
  // so the assistant can only quote facts that are actually on this site.
  var contextPromise = fetch("data/cars.json")
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (data) {
      if (!data || !Array.isArray(data.cars)) return "";
      return data.cars.map(function (c) {
        var fuel = c.powertrain === "electric"
          ? (c.rangeKm != null ? c.rangeKm + " km range" : "electric")
          : c.fuelCityL100km + "/" + c.fuelHwyL100km + " L/100km city/hwy";
        return c.year + " " + c.make + " " + c.model + " " + c.trim +
          " — $" + c.msrpCAD + ", " + c.powertrain + ", " + c.bodyStyle +
          ", " + c.seats + " seats, " + fuel + ", warranty " + c.warrantyYears + " yr";
      }).join("; ");
    })
    .catch(function () { return ""; });

  function addMessage(role, text) {
    var div = document.createElement("div");
    div.className = "ask-msg " + role;
    div.textContent = text;
    msgsEl.appendChild(div);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return div;
  }

  function setProvider(provider) {
    if (titleEl) titleEl.textContent = provider === "Claude" ? "Ask Muse" : "Ask AI Assistant";
    if (footEl) footEl.textContent = "Powered by " + provider;
  }

  function openPanel() {
    panel.hidden = false;
    toggleBtn.setAttribute("aria-expanded", "true");
    if (!msgsEl.children.length) {
      addMessage("assistant",
        "Hi! Ask me about any car on this site — prices, fuel economy, warranties — or about buying your first car in Canada.");
    }
    input.focus();
  }

  function closePanel() {
    panel.hidden = true;
    toggleBtn.setAttribute("aria-expanded", "false");
    toggleBtn.focus();
  }

  toggleBtn.addEventListener("click", function () {
    if (panel.hidden) openPanel(); else closePanel();
  });

  var closeBtn = document.getElementById("ask-close");
  if (closeBtn) closeBtn.addEventListener("click", closePanel);

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (busy) return;

    var question = input.value.trim().slice(0, 500);
    if (!question) return;
    input.value = "";

    addMessage("user", question);
    history.push({ role: "user", text: question });
    var sentHistory = history.slice(0, -1).slice(-6); // prior turns only

    busy = true;
    sendBtn.disabled = true;
    var thinking = addMessage("assistant", "Thinking…");
    thinking.classList.add("thinking");

    contextPromise.then(function (context) {
      return fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question, history: sentHistory, context: context })
      });
    }).then(function (res) {
      if (res.status === 503) {
        thinking.remove();
        addMessage("assistant", "The chat assistant is not switched on yet (no API key configured).");
        history.pop(); // the exchange never happened — do not keep it
        return null;
      }
      if (!res.ok) throw new Error("ask-failed");
      return res.json();
    }).then(function (data) {
      if (!data) return;
      thinking.remove();
      if (data.provider) setProvider(data.provider);
      var answer = typeof data.answer === "string" && data.answer.trim()
        ? data.answer.trim()
        : "Sorry — the assistant could not answer just now. Please try again.";
      addMessage("assistant", answer);
      history.push({ role: "assistant", text: answer });
      history = history.slice(-12);
    }).catch(function () {
      thinking.remove();
      addMessage("assistant", "Sorry — the assistant could not answer just now. Please try again.");
      history.pop();
    }).finally(function () {
      busy = false;
      sendBtn.disabled = false;
      input.focus();
    });
  });
})();
