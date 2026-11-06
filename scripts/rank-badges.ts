/**
 * Generates the 13 Study Rank badges (public/ranks/<id>.svg) from one template, following the
 * owner's badge direction (docs/study-ranks.md): a metal shield in the rank's colours, one bold
 * emblem, laurels that grow with the tier, a gem from Ruby up, horns for Diamond and a crown for the
 * top two. Original artwork; simple shapes and thick strokes so badges read at 20px.
 *
 *   npx tsx scripts/rank-badges.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { RANKS, type RankId } from "../src/lib/social/ranks";

type Palette = { rim: [string, string]; field: [string, string]; glyph: string; leaf: string; gem?: string };

const P: Record<RankId, Palette> = {
  copper: { rim: ["#f0b48a", "#8a4b25"], field: ["#6b3a1f", "#3e2012"], glyph: "#f6c9a6", leaf: "#a8623a" },
  bronze: { rim: ["#e6b27a", "#7a4a22"], field: ["#5a3418", "#33200f"], glyph: "#f3c48f", leaf: "#a36b37" },
  silver: { rim: ["#f2f4f8", "#7d8797"], field: ["#4a5262", "#2b3140"], glyph: "#eef1f6", leaf: "#a9b2c0" },
  gold: { rim: ["#ffe7a0", "#b07d1a"], field: ["#7a5512", "#4a320a"], glyph: "#ffe3a0", leaf: "#d2a43a" },
  platinum: { rim: ["#f4f6ff", "#8d97b8"], field: ["#3d4466", "#252a44"], glyph: "#ffffff", leaf: "#b8c0de" },
  ruby: { rim: ["#ff9a9a", "#8f1d1d"], field: ["#5e1418", "#360b0e"], glyph: "#ffd4cc", leaf: "#c8414a", gem: "#ff4d5e" },
  sapphire: { rim: ["#9fc0ff", "#1f3f9e"], field: ["#16296b", "#0c1640"], glyph: "#dbe6ff", leaf: "#3f6ee0", gem: "#5fa0ff" },
  emerald: { rim: ["#9be7b4", "#1c6b3c"], field: ["#0f3f25", "#082414"], glyph: "#b8f5cf", leaf: "#2fa461", gem: "#3fe08a" },
  amethyst: { rim: ["#d9b8ff", "#5b2a9e"], field: ["#371a66", "#1f0e3d"], glyph: "#eedcff", leaf: "#8c55e0", gem: "#c18cff" },
  diamond: { rim: ["#dff3ff", "#3d86c4"], field: ["#123c63", "#0a213b"], glyph: "#e8f7ff", leaf: "#7cc4f2", gem: "#bfe9ff" },
  champion: { rim: ["#ffd98a", "#9a6a14"], field: ["#7a1424", "#430913"], glyph: "#ffe2a3", leaf: "#d4a640", gem: "#ff5b6b" },
  master: { rim: ["#e4e6ff", "#4a4fa8"], field: ["#24216e", "#130f40"], glyph: "#cfd4ff", leaf: "#9ea6e8", gem: "#a7b5ff" },
  grandmaster: { rim: ["#fff6d6", "#c99b2e"], field: ["#3a2f6e", "#1b1440"], glyph: "#fff4cf", leaf: "#e8c25a", gem: "#ffffff" },
};

const SHIELD = "M64 14 L104 27 V62 C104 89 87 106 64 116 C41 106 24 89 24 62 V27 Z";
const INNER = "M64 22 L96 33 V62 C96 84 82 98 64 107 C46 98 32 84 32 62 V33 Z";

/** Emblems drawn in a 64×64 box centred on the shield (translate 32, 34). */
const s = (d: string, w = 5) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const EMBLEM: Record<RankId, string> = {
  copper: `<circle cx="42" cy="22" r="13" fill="none" stroke="currentColor" stroke-width="4"/>${s("M42 15v7l5 3", 3.5)}<g transform="rotate(45 22 40)"><rect x="17" y="18" width="10" height="30" rx="1.5" fill="currentColor"/><path d="M17 48h10l-5 9z" fill="currentColor"/><rect x="17" y="14" width="10" height="5" rx="1.5" fill="currentColor" opacity=".7"/></g>`,
  bronze: `<circle cx="32" cy="32" r="7" fill="currentColor"/>${s("M32 25V12M32 12l-5-4M32 12l5-4M38 35l11 6M49 41l2 6M26 35l-11 6M15 41l-2 6M37 27l9-7M27 27l-9-7", 3.5)}<path d="M50 14l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="currentColor"/>`,
  silver: `${s("M14 38 L32 22 L50 38", 8)}${s("M14 54 L32 38 L50 54", 8)}`,
  gold: `${s("M14 10h30M14 54h30", 5)}<path d="M18 13h22c0 10-11 14-11 19 0 5 11 9 11 19H18c0-10 11-14 11-19 0-5-11-9-11-19z" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/><path d="M22 47c2-5 7-8 7-8s5 3 7 8z" fill="currentColor"/><path d="M52 18l-6 12h5l-4 11 10-14h-5l4-9z" fill="currentColor"/>`,
  platinum: `<path d="M32 10l6.5 14 15 1.6-11.3 10 3.3 14.8L32 43l-13.5 7.4 3.3-14.8-11.3-10 15-1.6z" fill="currentColor"/>${s("M8 40c10 10 38 10 48-6", 3)}`,
  ruby: `<rect x="16" y="14" width="26" height="34" rx="3" fill="currentColor"/>${s("M21 23h16M21 30h16M21 37h10", 3)}`.replace(/stroke="currentColor"/g, 'stroke="#5e1418"') + s("M48 18a20 20 0 0 1 2 22M14 48a20 20 0 0 1-3-20", 3.5) + `<path d="M47 41l5 1 1-5z M10 26l-1 5 5-1z" fill="currentColor"/>`,
  sapphire: `<path d="M32 12 L58 24 L32 36 L6 24 Z" fill="currentColor"/>${s("M17 30v10c8 6 22 6 30 0V30", 4)}${s("M54 26v14", 3)}`,
  emerald: `${s("M32 32m-24 0a24 9 0 1 0 48 0a24 9 0 1 0 -48 0", 3.5)}<g transform="rotate(60 32 32)">${s("M32 32m-24 0a24 9 0 1 0 48 0a24 9 0 1 0 -48 0", 3.5)}</g><g transform="rotate(-60 32 32)">${s("M32 32m-24 0a24 9 0 1 0 48 0a24 9 0 1 0 -48 0", 3.5)}</g><circle cx="32" cy="32" r="5.5" fill="currentColor"/>`,
  amethyst: `<rect x="12" y="12" width="40" height="40" rx="6" fill="currentColor"/>${s("M21 33l8 8 15-17", 5.5).replace('stroke="currentColor"', 'stroke="#371a66"')}`,
  diamond: `<path d="M14 26 L22 16 H42 L50 26 L32 50 Z" fill="currentColor"/>${s("M14 26H50M24 16l-3 10 11 24 11-24-3-10", 2.5).replace('stroke="currentColor"', 'stroke="#3d86c4"')}`,
  champion: `<path d="M20 12h24v10c0 9-5 15-12 15s-12-6-12-15z" fill="currentColor"/>${s("M20 16h-7c0 8 4 11 8 11M44 16h7c0 8-4 11-8 11M32 37v7M23 50h18", 4)}`,
  master: `${s("M32 16c-7-4-16 0-16 8-5 2-6 10-1 14-1 7 6 12 12 10 2 3 5 4 5 4V16zM32 16c7-4 16 0 16 8 5 2 6 10 1 14 1 7-6 12-12 10-2 3-5 4-5 4", 3.5)}${s("M24 26c3 0 5 2 5 5M40 26c-3 0-5 2-5 5M22 38c3-1 6 0 7 3M42 38c-3-1-6 0-7 3", 2.5)}`,
  grandmaster: `${s("M12 44L24 22 38 30 52 14M24 22 30 50 38 30", 2.5)}${[
    [12, 44],
    [24, 22],
    [38, 30],
    [52, 14],
    [30, 50],
  ]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.6" fill="currentColor"/>`)
    .join("")}<path d="M46 40l1.6 3.4 3.4 1.6-3.4 1.6-1.6 3.4-1.6-3.4-3.4-1.6 3.4-1.6z" fill="currentColor"/>`,
};

function leaves(tier: number, color: string): string {
  if (tier < 2) return "";
  const n = Math.min(5, 1 + Math.floor((tier - 1) / 2.5));
  const one = (i: number, side: 1 | -1) => {
    const y = 96 - i * 15;
    const x = 64 + side * (44 + i * 1.5);
    return `<ellipse cx="${x}" cy="${y}" rx="5.5" ry="13" transform="rotate(${side * (40 - i * 8)} ${x} ${y})" fill="${color}"/>`;
  };
  let out = "";
  for (let i = 0; i < n; i++) out += one(i, -1) + one(i, 1);
  return out;
}

function crown(color: string, light: string): string {
  return `<path d="M44 16 L50 4 L57 13 L64 1 L71 13 L78 4 L84 16 Z" fill="url(#rim)" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/><circle cx="64" cy="9" r="2.6" fill="${light}"/>`;
}

function horns(color: string): string {
  return `<path d="M30 30 C18 22 16 10 22 2 C24 14 32 20 40 22 Z" fill="${color}"/><path d="M98 30 C110 22 112 10 106 2 C104 14 96 20 88 22 Z" fill="${color}"/>`;
}

function gem(color: string): string {
  return `<path d="M64 102 L71 110 L64 122 L57 110 Z" fill="${color}" stroke="#ffffff" stroke-opacity=".7" stroke-width="1.5"/>`;
}

function badge(id: RankId, tier: number, name: string): string {
  const p = P[id];
  const top = tier >= 12;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="${name}">
<title>${name}</title>
<defs>
<linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.rim[0]}"/><stop offset="1" stop-color="${p.rim[1]}"/></linearGradient>
<linearGradient id="field" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.field[0]}"/><stop offset="1" stop-color="${p.field[1]}"/></linearGradient>
<linearGradient id="shine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".28"/><stop offset=".5" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
</defs>
${leaves(tier, p.leaf)}
${id === "diamond" ? horns(p.rim[1]) : ""}
<path d="${SHIELD}" fill="url(#rim)"/>
<path d="${INNER}" fill="url(#field)"/>
<path d="${INNER}" fill="url(#shine)"/>
<g transform="translate(32 33)" color="${p.glyph}">${EMBLEM[id]}</g>
${p.gem ? gem(p.gem) : ""}
${top ? crown(p.rim[1], p.gem ?? "#ffffff") : ""}
</svg>
`;
}

mkdirSync("public/ranks", { recursive: true });
for (const r of RANKS) writeFileSync(`public/ranks/${r.id}.svg`, badge(r.id, r.tier, r.name));
console.log(`Wrote ${RANKS.length} badges to public/ranks/`);
