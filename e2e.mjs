// Comprovació manual de la interfície amb Chrome headless (CDP, sense
// dependències). Cal el servidor de desenvolupament en marxa:
//
//   npm run dev        (en una terminal)
//   node e2e.mjs       (en una altra)
//
// Comprova l'obertura i el tancament dels fulls, el redimensionat
// arrossegeant la maneta i que no hi hagi errors de consola.
import { spawn } from "node:child_process";

const CHROME =
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe";
const PORT = 9222;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl.replace("localhost", "127.0.0.1");
    } catch {
      /* el navegador encara no escolta */
    }
    await sleep(250);
  }
  throw new Error("No s'ha pogut connectar amb Chrome");
}

let chrome = null;

try {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
  if (!res.ok) throw new Error("no");
} catch {
  // No hi ha cap Chrome escoltant: en llencem un.
  chrome = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${PORT}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      `--user-data-dir=${process.env.TEMP}/cdp-utci-${Date.now()}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
}

const ws = new WebSocket(await connect());
let messageId = 0;
const pending = new Map();
const consoleErrors = [];

ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);

  if (message.method === "Runtime.exceptionThrown") {
    consoleErrors.push(
      "EXCEPTION: " +
        (message.params.exceptionDetails.exception?.description ||
          message.params.exceptionDetails.text),
    );
  }

  if (
    message.method === "Runtime.consoleAPICalled" &&
    message.params.type === "error"
  ) {
    consoleErrors.push(
      "CONSOLE: " +
        message.params.args.map((a) => a.value ?? a.description).join(" "),
    );
  }

  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
});

await new Promise((resolve) => ws.addEventListener("open", resolve));

function send(method, params = {}) {
  const id = ++messageId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => pending.set(id, resolve));
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

// Simula un arrosseig amb punter (mouse) sobre un element.
async function drag(selector, deltaY) {
  return evaluate(`
    (() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!node) return "no hi ha el node";
      const rect = node.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const options = { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0 };
      node.dispatchEvent(new PointerEvent("pointerdown", { ...options, clientX: x, clientY: y }));
      node.dispatchEvent(new PointerEvent("pointermove", { ...options, clientX: x, clientY: y + ${deltaY} }));
      node.dispatchEvent(new PointerEvent("pointerup", { ...options, clientX: x, clientY: y + ${deltaY} }));
      return "drag fet";
    })()
  `);
}

await send("Runtime.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 375,
  height: 667,
  deviceScaleFactor: 2,
  mobile: true,
});
await send("Page.navigate", { url: "http://localhost:5173/utci-catalonia/" });

await sleep(5000);

for (let i = 0; i < 30; i++) {
  const ready = await evaluate(
    `!!document.querySelector('input[type=range]') && !document.querySelector('.utci-spinner')`,
  );
  if (ready) break;
  await sleep(1000);
}

const results = [];
const check = (label, value) => results.push([label, value]);

// ---------- Llegenda ----------
await evaluate(`document.querySelector('[aria-label="Llegenda de l’UTCI"]')?.click()`);
await sleep(700);

check(
  "llegenda: oberta",
  await evaluate(`!!document.querySelector('[role="dialog"][aria-label*="Llegenda"]')`),
);

check(
  "llegenda: alçada inicial (px)",
  await evaluate(`
    Math.round(document.querySelector('[role="dialog"][aria-label*="Llegenda"]').getBoundingClientRect().height)
  `),
);

// Arrossegar la maneta cap amunt 120 px -> el full creix.
await drag('[role="dialog"][aria-label*="Llegenda"] button[aria-label="Redimensiona el panell"]', -120);
await sleep(400);

check(
  "llegenda: alçada després d'arrossegar amunt (px)",
  await evaluate(`
    Math.round(document.querySelector('[role="dialog"][aria-label*="Llegenda"]').getBoundingClientRect().height)
  `),
);

// I cap avall 200 px -> es redueix.
await drag('[role="dialog"][aria-label*="Llegenda"] button[aria-label="Redimensiona el panell"]', 200);
await sleep(400);

check(
  "llegenda: alçada després d'arrossegar avall (px)",
  await evaluate(`
    Math.round(document.querySelector('[role="dialog"][aria-label*="Llegenda"]').getBoundingClientRect().height)
  `),
);

check(
  "llegenda: el contingut fa scroll?",
  await evaluate(`
    (() => {
      const scroller = document.querySelector('[role="dialog"][aria-label*="Llegenda"] .overflow-y-auto');
      return scroller ? scroller.scrollHeight > scroller.clientHeight : "cap scroller";
    })()
  `),
);

// Un toc a la maneta desplega el full.
await evaluate(`
  document.querySelector('[role="dialog"][aria-label*="Llegenda"] button[aria-label="Redimensiona el panell"]')?.click()
`);
await sleep(400);

check(
  "llegenda: alçada després del toc (desplegat)",
  await evaluate(`
    Math.round(document.querySelector('[role="dialog"][aria-label*="Llegenda"]').getBoundingClientRect().height)
  `),
);

// I un altre toc el recull.
await evaluate(`
  document.querySelector('[role="dialog"][aria-label*="Llegenda"] button[aria-label="Redimensiona el panell"]')?.click()
`);
await sleep(400);

check(
  "llegenda: alçada després del segon toc (recollit)",
  await evaluate(`
    Math.round(document.querySelector('[role="dialog"][aria-label*="Llegenda"]').getBoundingClientRect().height)
  `),
);

// Tancar
await evaluate(`
  document.querySelector('[role="dialog"][aria-label*="Llegenda"] button[aria-label="Tanca"]')?.click()
`);
await sleep(900);

check(
  "llegenda: tancada",
  await evaluate(`!document.querySelector('[role="dialog"][aria-label*="Llegenda"]')`),
);

// ---------- Info ----------
await evaluate(`document.querySelector('[aria-label="Sobre l’UTCI"]')?.click()`);
await sleep(700);

check(
  "info: oberta",
  await evaluate(`!!document.querySelector('[role="dialog"][aria-label="Sobre l’UTCI"]')`),
);

await drag('[role="dialog"][aria-label="Sobre l’UTCI"] button[aria-label="Redimensiona el panell"]', -150);
await sleep(400);

check(
  "info: alçada després d'arrossegar amunt (px)",
  await evaluate(`
    Math.round(document.querySelector('[role="dialog"][aria-label="Sobre l’UTCI"]').getBoundingClientRect().height)
  `),
);

await evaluate(`
  document.querySelector('[role="dialog"][aria-label="Sobre l’UTCI"] button[aria-label="Tanca"]')?.click()
`);
await sleep(900);

check(
  "info: tancada",
  await evaluate(`!document.querySelector('[role="dialog"][aria-label="Sobre l’UTCI"]')`),
);

// ---------- Panell del punt ----------
await evaluate(`
  (() => {
    const map = document.querySelector('.maplibregl-canvas');
    if (!map) return;
    const rect = map.getBoundingClientRect();
    const options = { bubbles: true, cancelable: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, button: 0, pointerId: 1, isPrimary: true };
    map.dispatchEvent(new MouseEvent('click', options));
  })()
`);
await sleep(2500);

check(
  "punt: el panell s'ha obert?",
  await evaluate(`!!document.querySelector('[role="dialog"][aria-label="Informació del punt"]')`),
);

await drag('[role="dialog"][aria-label="Informació del punt"] button[aria-label="Redimensiona el panell"]', -140);
await sleep(400);

check(
  "punt: alçada després d'arrossegar amunt (px)",
  await evaluate(`
    (() => {
      const panel = document.querySelector('[role="dialog"][aria-label="Informació del punt"]');
      return panel ? Math.round(panel.getBoundingClientRect().height) : "cap";
    })()
  `),
);

await evaluate(`
  document.querySelector('[role="dialog"][aria-label="Informació del punt"] button[aria-label="Tanca"]')?.click()
`);
await sleep(900);

check(
  "punt: tancat (fora de pantalla + inert)",
  await evaluate(`
    (() => {
      const panel = document.querySelector('[role="dialog"][aria-label="Informació del punt"]');
      if (!panel) return "ja no hi és";
      const rect = panel.getBoundingClientRect();
      const off = rect.top >= window.innerHeight - 1;
      return (off ? "fora de pantalla" : "encara visible (top=" + Math.round(rect.top) + ")") + (panel.inert ? " + inert" : " NO inert");
    })()
  `),
);

// ---------- Mides ----------
check(
  "alçada del panell esquerre (px)",
  await evaluate(
    `Math.round(document.querySelector('aside').getBoundingClientRect().height)`,
  ),
);
check(
  "alçada del mapa (px)",
  await evaluate(`
    Math.round(document.querySelector('section.relative').getBoundingClientRect().height)
  `),
);

// ---------- Escriptori ----------
await send("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
await sleep(1500);

check(
  "escriptori: amplada del panell esquerre (px)",
  await evaluate(
    `Math.round(document.querySelector('aside').getBoundingClientRect().width)`,
  ),
);
check(
  "escriptori: hi ha el botó de geolocalització?",
  await evaluate(`!!document.querySelector('.maplibregl-ctrl-geolocate')`),
);
check(
  "escriptori: l'etiqueta de data es veu?",
  await evaluate(`
    (() => {
      const nodes = [...document.querySelectorAll('div')].filter((n) =>
        typeof n.className === "string" && n.className.includes("absolute bottom-4 left-1/2")
      );
      return nodes.length ? getComputedStyle(nodes[0]).display : "cap";
    })()
  `),
);
check(
  "escriptori: la línia de temps és la versió llarga?",
  await evaluate(`
    (() => {
      const aside = document.querySelector('aside');
      return aside.textContent.includes("Hora local") ? "llarga" : "compacta";
    })()
  `),
);

console.log("\n=== RESULTATS ===");
for (const [label, value] of results) {
  console.log(`- ${label}: ${value}`);
}

console.log("\n=== ERRORS DE CONSOLA ===");
console.log(consoleErrors.length ? consoleErrors.slice(0, 10).join("\n") : "(cap)");

ws.close();
chrome?.kill();
process.exit(0);
