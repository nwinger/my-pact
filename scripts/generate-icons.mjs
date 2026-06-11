/**
 * Renders the My Pact app icons from the wax-seal mark.
 * Usage: node scripts/generate-icons.mjs
 */
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const INK = '#221C14';
const PAPER = '#F7F1E6';
const SEAL = '#C0392B';
const SEAL_DEEP = '#922B21';

/** Scalloped seal path in a 100x100 box (mirrors SealShape in the app). */
function sealPath(cx = 50, cy = 50, rOuter = 47, rInner = 41, lobes = 12) {
  let d = '';
  for (let i = 0; i < lobes * 2; i++) {
    const angle = (Math.PI * 2 * i) / (lobes * 2) - Math.PI / 2;
    const r = i % 2 === 0 ? rOuter : rInner;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    d +=
      i === 0
        ? `M ${x.toFixed(2)} ${y.toFixed(2)}`
        : ` Q ${(cx + (r + 3) * Math.cos(angle - 0.13)).toFixed(2)} ${(cy + (r + 3) * Math.sin(angle - 0.13)).toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return d + ' Z';
}

function sealMark({ fill = SEAL, stroke = SEAL_DEEP, text = true, textFill = '#FFFFFF' }) {
  return `
    <g>
      <path d="${sealPath()}" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>
      ${
        text
          ? `<text x="50" y="50" text-anchor="middle" dominant-baseline="central"
               font-family="Georgia, 'Times New Roman', serif" font-style="italic"
               font-weight="700" font-size="34" fill="${textFill}">mp</text>`
          : ''
      }
    </g>`;
}

function svgDoc(size, body) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}

function render(svg, size, outPath) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
  const png = resvg.render().asPng();
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, png);
  console.log('wrote', outPath);
}

const out = (p) => join(root, 'assets', 'images', p);

// Main app icon: paper field, faint ring, tilted seal
render(
  svgDoc(
    1024,
    `<rect width="100" height="100" fill="${PAPER}"/>
     <circle cx="50" cy="50" r="38" fill="none" stroke="${INK}" stroke-opacity="0.12" stroke-width="1.4" stroke-dasharray="3 2.4"/>
     <g transform="rotate(-8 50 50) translate(50 50) scale(0.64) translate(-50 -50)">${sealMark({})}</g>`
  ),
  1024,
  out('icon.png')
);

// Android adaptive: foreground (transparent, seal in safe zone), background, monochrome
render(
  svgDoc(
    1024,
    `<g transform="rotate(-8 50 50) translate(50 50) scale(0.42) translate(-50 -50)">${sealMark({})}</g>`
  ),
  1024,
  out('android-icon-foreground.png')
);
render(svgDoc(1024, `<rect width="100" height="100" fill="${PAPER}"/>`), 1024, out('android-icon-background.png'));
render(
  svgDoc(
    1024,
    `<g transform="rotate(-8 50 50) translate(50 50) scale(0.42) translate(-50 -50)">
       <path d="${sealPath()}" fill="#FFFFFF"/>
     </g>`
  ),
  1024,
  out('android-icon-monochrome.png')
);

// Splash icon (transparent; splash background is paper via app.json)
render(
  svgDoc(
    512,
    `<g transform="rotate(-8 50 50) translate(50 50) scale(0.7) translate(-50 -50)">${sealMark({})}</g>`
  ),
  512,
  out('splash-icon.png')
);

// Favicon
render(
  svgDoc(
    96,
    `<rect width="100" height="100" rx="22" fill="${PAPER}"/>
     <g transform="rotate(-8 50 50) translate(50 50) scale(0.74) translate(-50 -50)">${sealMark({})}</g>`
  ),
  96,
  out('favicon.png')
);

console.log('done');
