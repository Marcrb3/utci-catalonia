// Comprova els icones PNG: calcula la caixa delimitadora dels píxels de
// color ambre (el termòmetre i el sol) per detectar si el dibuix queda
// tallat o desplaçat, i si el fons és opac.
//
//   node tools/check-icons.mjs
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CHROME =
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe";
const PORT = 9444;
const PUBLIC = path.resolve(import.meta.dirname, "..", "public");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    "--no-first-run",
    "--disable-gpu",
    `--user-data-dir=${process.env.TEMP}/cdp-png-${Date.now()}`,
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

async function evaluate(expression) {
  const response = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.result?.exceptionDetails) {
    throw new Error(response.result.exceptionDetails.text);
  }
  return response.result?.result?.value;
}

await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", { url: "about:blank" });
await sleep(500);

const files = [
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
  "apple-touch-icon.png",
];

console.log("fitxer                     mida    caixa del dibuix ambre (en %)      tallat?");
console.log("-".repeat(88));

for (const file of files) {
  const base64 = fs.readFileSync(path.join(PUBLIC, file)).toString("base64");

  const result = await evaluate(`
    (async () => {
      const image = new Image();
      image.src = "data:image/png;base64,${base64}";
      await image.decode();

      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);

      const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);

      let minX = width, minY = height, maxX = -1, maxY = -1;
      let opac = 0, total = width * height;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const [r, g, b, a] = [data[i], data[i+1], data[i+2], data[i+3]];

          if (a < 250) continue;
          opac++;

          // Ambre: #ffbd2e -> fort component vermell, poc blau.
          if (r > 200 && g > 120 && g < 220 && b < 110) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }

      const pct = (v) => Math.round((v / width) * 1000) / 10;
      const hasBox = maxX >= 0;

      return {
        mida: width + "x" + height,
        caixa: hasBox
          ? pct(minX) + "-" + pct(maxX) + " x " + pct(minY) + "-" + pct(maxY)
          : "cap",
        transparent: Math.round((1 - opac / total) * 1000) / 10,
        tallat: hasBox && (minX <= 0 || minY <= 0 || maxX >= width - 1 || maxY >= height - 1),
      };
    })()
  `);

  console.log(
    file.padEnd(26),
    result.mida.padEnd(8),
    result.caixa.padEnd(32),
    result.tallat ? "SÍ" : "no",
    ` (opacitat ${100 - result.transparent}%)`,
  );
}

ws.close();
browser.kill();
process.exit(0);
