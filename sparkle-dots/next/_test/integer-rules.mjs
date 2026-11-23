// integer-rules: shapes.js's integer auto-fill probes equal the lab's former float probes for every ordered pair
// of dots on a 24 x 18 page (from == to included), and its integer centre equals the former float centre for every
// shape of every step of every case in cases.mjs, integer rasteriser (parity.mjs checks the canvas rasteriser).
//   node sparkle-dots/next/_test/integer-rules.mjs
import {readFileSync} from 'node:fs';
import * as Shapes from '../shapes.js';
import {CASES} from './cases.mjs';
import {run, newEngine, sheetsFrom, floatProbes, centreCheck} from './driver.mjs';

let lines = 0, probes = 0, bad = 0;
const dots = []; for (let j=0;j<18;j++) for (let i=0;i<24;i++) dots.push([i, j]);
for (const a of dots) for (const b of dots){
  const f = floatProbes(a, b), n = Shapes.probes(a, b);
  lines++; probes += n.length;
  if (f.length !== n.length || f.some((p, i) => p[0] !== n[i][0] || p[1] !== n[i][1])){ if (bad++ < 5) console.log(`FAIL probes ${a} -> ${b}`); }
}
console.log(`probes: ${lines} lines (${lines - dots.length} with from != to), ${probes} probes, ${bad} mismatched lines`);

const sheets = sheetsFrom(readFileSync(new URL('./old-inline.js', import.meta.url), 'utf8'));
let shapes = 0, ties = 0, diffs = 0;
for (const c of CASES) run(c, (paper, clock) => newEngine(Shapes.integerRaster, sheets, paper, clock), (step, e) => {
  const s = e.get(), r = centreCheck(s.lab, s.RW, s.RH); shapes += r.shapes; ties += r.ties; diffs += r.diffs;
});
console.log(`centres (integer raster): ${shapes} shapes over every step of ${CASES.length} cases, ${ties} with tied cells, ${diffs} mismatches`);
process.exit(bad || diffs ? 1 : 0);
