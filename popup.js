"use strict";

const button = document.getElementById("toggle");
const status = document.getElementById("status");
let tab;
let active = false;

function messageFor(error, url) {
  const text = String(error && error.message || error || "");
  if (/^file:/i.test(url)) return "Enable “Allow access to file URLs” for SniperShot in chrome://extensions to play on local files.";
  if (/chromewebstore\.google\.com|chrome\.google\.com\/webstore/i.test(url) || /gallery cannot be scripted/i.test(text)) {
    return "Chrome does not allow extensions on the Chrome Web Store. Try a regular webpage.";
  }
  if (/^(chrome|chrome-extension|chrome-untrusted|devtools|about|edge|view-source):/i.test(url) ||
      /cannot access|cannot be scripted|permission|not allowed/i.test(text)) {
    return "Chrome does not allow the game on this page. Try a regular webpage.";
  }
  return "Could not start SniperShot on this page. Try a regular webpage.";
}

function render() {
  button.textContent = active ? "Remove SniperShot" : "Launch SniperShot";
}

async function init() {
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || tab.id == null) throw new Error("No active tab found.");
    const url = tab.url || tab.pendingUrl || "";
    if (/^(chrome|chrome-extension|chrome-untrusted|devtools|about|edge|view-source):/i.test(url) ||
        /^https?:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)([/?#]|$)/i.test(url)) {
      status.textContent = messageFor("", url);
      return;
    }
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        active: !!globalThis.__sniperShot,
        html: document.documentElement instanceof HTMLElement,
        type: document.contentType
      })
    });
    if (!result || !result.result || !result.result.html || result.result.type === "application/pdf") {
      status.textContent = "This document cannot be played. Try a regular HTML webpage.";
      return;
    }
    active = result.result.active;
    render();
    button.disabled = false;
  } catch (error) {
    status.textContent = messageFor(error, tab && (tab.url || tab.pendingUrl) || "");
  }
}

button.addEventListener("click", async () => {
  button.disabled = true;
  status.textContent = "";
  try {
    if (active) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => { if (globalThis.__sniperShot) globalThis.__sniperShot.destroy(); }
      });
    } else {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["core.js", "game.js"]
      });
    }
    window.close();
  } catch (error) {
    status.textContent = messageFor(error, tab.url || tab.pendingUrl || "");
    button.disabled = false;
  }
});

function renderCareer() {
  chrome.storage.local.get("ssCareer").then(({ ssCareer }) => {
    if (!ssCareer) return;
    const rank = SniperShotCore.rankFor(ssCareer.xp || 0);
    const box = document.getElementById("career");
    const title = document.createElement("div");
    title.append("Rank ", Object.assign(document.createElement("b"), { textContent: `${rank.number} · ${rank.name}` }), `  ·  best ${ssCareer.best || 0}`);
    const bar = document.createElement("div");
    bar.className = "bar";
    const fill = document.createElement("i");
    fill.style.width = `${Math.round(rank.progress * 100)}%`;
    bar.append(fill);
    const next = document.createElement("small");
    next.textContent = rank.next ? `${rank.next.xp - ssCareer.xp} XP to unlock: ${rank.next.unlock || rank.next.name}` : "Maximum rank.";
    box.replaceChildren(title, bar, next);
    box.hidden = false;
  }).catch(() => {});
}

renderCareer();
init();
