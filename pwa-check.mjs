// Comprovació de la PWA amb Chrome headless (CDP, sense dependències).
// Cal `npm run preview` en marxa (serveix dist/ al port 4173).
import { spawn } from "node:child_process";

const CHROME =
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe";
const PORT = 9222;
const APP = "http://localhost:4173/utci-catalonia/";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let chrome = null;

try {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
  if (!res.ok) throw new Error("no");
} catch {
  chrome = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${PORT}`,
      "--no-first-run",
      "--disable-gpu",
      `--user-data-dir=${process.env.TEMP}/cdp-pwa-${Date.now()}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
}

async function endpoint() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl.replace("localhost", "127.0.0.1");
    } catch {
      /* encara no escolta */
    }
    await sleep(250);
  }
  throw new Error("No s'ha pogut connectar amb Chrome");
}

const ws = new WebSocket(await endpoint());
let id = 0;
const pending = new Map();
const errors = [];

ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);

  if (message.method === "Runtime.exceptionThrown") {
    errors.push(
      "EXCEPTION: " +
        (message.params.exceptionDetails.exception?.description ||
          message.params.exceptionDetails.text),
    );
  }

  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
});

await new Promise((resolve) => ws.addEventListener("open", resolve));

function send(method, params = {}) {
  const messageId = ++id;
  ws.send(JSON.stringify({ id: messageId, method, params }));
  return new Promise((resolve) => pending.set(messageId, resolve));
}

async function evaluate(expression) {
  const response = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });

  if (response.result?.exceptionDetails) {
    throw new Error(
      "JS: " +
        (response.result.exceptionDetails.exception?.description ||
          response.result.exceptionDetails.text),
    );
  }

  return response.result?.result?.value;
}

const results = [];
const check = (label, value) => results.push([label, value]);

await send("Runtime.enable");
await send("Page.enable");
await send("Network.enable");
await send("Page.navigate", { url: APP });

await sleep(4000);

// Espera que el service worker es registri i s'activi.
check(
  "service worker registrat i actiu",
  await evaluate(`
    (async () => {
      if (!("serviceWorker" in navigator)) return "no suportat";
      const registration = await Promise.race([
        navigator.serviceWorker.ready.then(() => "actiu"),
        new Promise((r) => setTimeout(() => r("temps esgotat"), 15000)),
      ]);
      return registration;
    })()
  `),
);

// Recarrega perquè el service worker controli la pàgina.
await send("Page.reload");
await sleep(4000);

check(
  "la pàgina està controlada pel service worker",
  await evaluate(`!!navigator.serviceWorker.controller`),
);

check(
  "manifest enllaçat i vàlid",
  await evaluate(`
    (async () => {
      const link = document.querySelector('link[rel=manifest]');
      if (!link) return "no hi ha link";
      const response = await fetch(link.href);
      if (!response.ok) return "HTTP " + response.status;
      const manifest = await response.json();
      return {
        name: manifest.name,
        start_url: manifest.start_url,
        scope: manifest.scope,
        display: manifest.display,
        icones: manifest.icons.length,
      };
    })()
  `),
);

check(
  "els icones es carreguen",
  await evaluate(`
    (async () => {
      const link = document.querySelector('link[rel=manifest]');
      const manifest = await (await fetch(link.href)).json();
      const results = [];
      for (const icon of manifest.icons) {
        const url = new URL(icon.src, link.href).href;
        const response = await fetch(url);
        results.push(icon.src + " " + response.status);
      }
      return results.join(", ");
    })()
  `),
);

check(
  "l'app ha carregat (slider present)",
  await evaluate(`!!document.querySelector('input[type=range]')`),
);

check(
  "memòria cau del service worker",
  await evaluate(`
    (async () => {
      const keys = await caches.keys();
      const shell = await caches.open(keys.find((k) => k.startsWith("utci-shell")));
      const entries = await shell.keys();
      return keys.length + " caixes, " + entries.length + " entrades al shell";
    })()
  `),
);

// ---------- Mode sense connexió ----------
await send("Network.emulateNetworkConditions", {
  offline: true,
  latency: 0,
  downloadThroughput: 0,
  uploadThroughput: 0,
});

await send("Page.reload");
await sleep(6000);

check(
  "sense connexió: l'app carrega igualment",
  await evaluate(`!!document.querySelector('input[type=range]')`),
);

check(
  "sense connexió: hi ha el panell temporal?",
  await evaluate(`
    (() => {
      const aside = document.querySelector("aside");
      return aside ? aside.textContent.trim().slice(0, 40) : "cap";
    })()
  `),
);

check(
  "sense connexió: el manifest de la previsió ve de la memòria cau",
  await evaluate(`
    (async () => {
      const response = await fetch("./data/forecast.json");
      if (!response.ok) return "HTTP " + response.status;
      const json = await response.json();
      return (json.files || json).length + " fitxers al manifest";
    })()
  `),
);

await send("Network.emulateNetworkConditions", {
  offline: false,
  latency: 0,
  downloadThroughput: -1,
  uploadThroughput: -1,
});

console.log("\n=== RESULTATS PWA ===");
for (const [label, value] of results) {
  console.log(`- ${label}: ${JSON.stringify(value)}`);
}

console.log("\n=== ERRORS ===");
console.log(errors.length ? errors.slice(0, 6).join("\n") : "(cap)");

ws.close();
chrome?.kill();
process.exit(0);
