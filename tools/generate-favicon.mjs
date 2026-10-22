// Construeix public/favicon.svg amb la geometria calculada.
//
// El dibuix anterior tenia els raigs del sol dibuixats a mà: eren només
// quatre, amb angles irregulars, desconnectats del disc i de longituds
// diferents. Aquí es calculen: el sol rep N raigs repartits de manera
// regular al voltant del disc, tots amb la mateixa longitud i el mateix
// gruix.
//
//   node tools/generate-favicon.mjs
import fs from "node:fs";
import path from "node:path";

const W = 64;
const H = 64;

const COLORS = {
  background: "#063d3b",
  waves: "#0b6961",
  amber: "#ffbd2e",
};

const round = (n) => Math.round(n * 100) / 100;

// Ones de fons: quatre sinusoides suaus, en dues bandes (superior i
// inferior) per deixar lliure el centre on viu el dibuix principal.
const WAVES = [
  "M-5 13 C10 3 16 24 31 14 S52 2 69 13",
  "M-6 22 C9 12 18 33 32 23 S52 11 70 22",
  "M-7 43 C8 33 19 54 33 44 S53 32 70 43",
  "M-7 52 C8 42 19 63 33 53 S53 41 70 52",
];

// El sol: un disc i N raigs regulars.
//
// El sol és l'element secundari: el disc és més petit que el termòmetre
// i els raigs s'aturen abans d'arribar al tub del termòmetre (el traç
// del raig més proper acaba a x=29,5 i el tub acaba a x=24).
const SUN = {
  cx: 42,
  cy: 27,
  radius: 6,
  rays: 8,
  rayInner: 9,
  rayOuter: 12.5,
  rayWidth: 3.2,
};

function sunRays() {
  const parts = [];

  for (let i = 0; i < SUN.rays; i++) {
    // 0 rad = a la dreta; en SVG l'eix Y creix cap avall.
    const angle = (i * 2 * Math.PI) / SUN.rays;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const x1 = round(SUN.cx + SUN.rayInner * cos);
    const y1 = round(SUN.cy + SUN.rayInner * sin);
    const x2 = round(SUN.cx + SUN.rayOuter * cos);
    const y2 = round(SUN.cy + SUN.rayOuter * sin);

    parts.push(`M${x1} ${y1}L${x2} ${y2}`);
  }

  return parts.join(" ");
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" rx="13" fill="${COLORS.background}"/>
  <g fill="none" stroke="${COLORS.waves}" stroke-width="0.8" opacity="0.75">
${WAVES.map((d) => `    <path d="${d}"/>`).join("\n")}
  </g>
  <g fill="none" stroke="${COLORS.amber}" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M24 14 a5 5 0 0 0-10 0 v22 a10 10 0 1 0 10 0 Z"/>
    <circle cx="19" cy="44" r="5.5"/>
    <path d="${sunRays()}"/>
  </g>
  <circle cx="${SUN.cx}" cy="${SUN.cy}" r="${SUN.radius}" fill="${COLORS.amber}"/>
</svg>
`;

const out = path.join(
  path.resolve(import.meta.dirname, ".."),
  "public",
  "favicon.svg",
);

fs.writeFileSync(out, svg.trimStart() + "\n");

console.log("Escrit:", out);
console.log(`Sol: disc r=${SUN.radius}, ${SUN.rays} raigs de ${SUN.rayInner} a ${SUN.rayOuter}`);
