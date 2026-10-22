// Genera els icones de la PWA a partir de public/favicon.svg.
//
// Eina opcional: només cal tornar-la a executar si es canvia el logotip.
//
//   node tools/generate-icons.mjs
//
// Requereix Chrome (per fer la captura del SVG en PNG). Els PNG resultants
// es versionen al repositori, de manera que la compilació no necessita res
// d'això.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CHROME_PATHS = [
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

const PORT = 9333;
const ROOT = path.resolve(import.meta.dirname, "..");
const PUBLIC = path.join(ROOT, "public");

const chrome = CHROME_PATHS.find((p) => fs.existsSync(p));

if (!chrome) {
  console.error("No s'ha trobat Chrome.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(
  chrome,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    "--no-first-run",
    "--disable-gpu",
    `--user-data-dir=${process.env.TEMP}/cdp-icons-${Date.now()}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

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

ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
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

const svg = fs.readFileSync(path.join(PUBLIC, "favicon.svg"), "utf8");

// El favicon porta les cantonades arrodonides i el fons no arriba fins
// al marge. Per a la PWA calen dues variants:
//
//   · "quadrada": fons opac que ocupa tot el llenç (iOS i Android
//     apliquen la seva pròpia màscara, així que les cantonades
//     arrodonides es veurien com a transparents).
//   · "maskable": el fons ocupa tot el llenç i només el dibuix
//     (termòmetre i sol) s'escala a la zona segura central, perquè el
//     sistema el pugui retallar sense tallar el dibuix.
function variant({ square = false, contentScale = 1 } = {}) {
  let out = svg.replace(/rx="\d+"/, square ? 'rx="0"' : 'rx="13"');

  if (contentScale === 1) return out;

  // S'envolven el termòmetre i el sol (els elements de color ambre) amb
  // una transformació que els centra i els redimensiona.
  const transform = `<g transform="translate(32 32) scale(${contentScale}) translate(-32 -32)">`;

  out = out.replace(
    /(<g fill="none" stroke="#ffbd2e"[\s\S]*?<\/g>\s*<circle[^>]*\/>)/,
    (match) => `${transform}${match}</g>`,
  );

  return out;
}

const encoded = {
  square: Buffer.from(variant({ square: true })).toString("base64"),
  maskable: Buffer.from(variant({ square: true, contentScale: 0.72 })).toString(
    "base64",
  ),
};

// Els icones amb "maskable" deixen una zona segura: el contingut va
// escalat i centrat sobre el fons, perquè el sistema pugui
// retallar els laterals sense tallar el dibuix.
const targets = [
  { file: "icon-192.png", size: 192, source: "square" },
  { file: "icon-512.png", size: 512, source: "square" },
  { file: "icon-maskable-512.png", size: 512, source: "maskable" },
  { file: "apple-touch-icon.png", size: 180, source: "square" },
];

await send("Page.enable");

for (const { file, size, source } of targets) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;width:${size}px;height:${size}px;overflow:hidden;background:#063d3b}
    img{position:absolute;inset:0;width:100%;height:100%}
  </style></head><body><img src="data:image/svg+xml;base64,${encoded[source]}"></body></html>`;

  await send("Emulation.setDeviceMetricsOverride", {
    width: size,
    height: size,
    deviceScaleFactor: 1,
    mobile: false,
  });

  await send("Page.navigate", { url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}` });
  await sleep(400);

  const shot = await send("Page.captureScreenshot", { format: "png" });
  const buffer = Buffer.from(shot.result.data, "base64");

  fs.writeFileSync(path.join(PUBLIC, file), buffer);
  console.log(`${file}  ${size}×${size}  ${(buffer.length / 1024).toFixed(1)} kB`);
}

ws.close();
browser.kill();
process.exit(0);
