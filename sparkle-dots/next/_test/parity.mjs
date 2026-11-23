// shapes-parity: the lab's shapes are unchanged by the move into shapes.js.
//   node sparkle-dots/next/_test/parity.mjs            check
//   node sparkle-dots/next/_test/parity.mjs --update   rewrite integer-goldens.json
// 1. In headless Chrome, every case in cases.mjs runs through the verbatim old inline code (old-inline.js) and
//    through shapes.js with the canvas rasteriser; lab, labD, seeds, faces, boxes and segments must match at every step.
// 2. The same cases run through shapes.js with the integer rasteriser, in Node and in Chrome; both must equal
//    integer-goldens.json. Cells where integer mode differs from canvas mode are reported, not failed.
// 3. For every shape of every step in canvas mode, the integer centre in shapes.js equals the lab's former float
//    centre (driver.mjs floatCentre). integer-rules.mjs does the same in integer mode and checks the probes.
// Needs Node 22+ and Chrome (set CHROME to its path if it is not in the usual macOS place). No npm packages.
// This folder starts with "_" so GitHub Pages (Jekyll) does not publish it.
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {CASES} from './cases.mjs';
import {sheetsFrom, integerRecord} from './driver.mjs';

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../../..');
const OLD = readFileSync(path.join(here, 'old-inline.js'), 'utf8');
const goldPath = path.join(here, 'integer-goldens.json');
let failed = 0;
const fail = m => { failed++; console.log('FAIL ' + m); };

// Integer mode in Node against the goldens
const sheets = sheetsFrom(OLD), records = CASES.map(c => integerRecord(c, sheets));
if (process.argv.includes('--update') || !existsSync(goldPath)){
  writeFileSync(goldPath, JSON.stringify(records, null, 1) + '\n'); console.log('wrote ' + path.relative(root, goldPath));
} else {
  const gold = JSON.parse(readFileSync(goldPath, 'utf8'));
  records.forEach((r, i) => { if (JSON.stringify(r) !== JSON.stringify(gold[i])) fail(`integer golden ${r.name}`); });
  if (gold.length !== records.length) fail('integer goldens: case count');
}

// Browser half
const page = `<!DOCTYPE html><meta charset="utf-8"><body><pre id="out">pending</pre><script type="module">
import * as Shapes from '/sparkle-dots/next/shapes.js';
import {CASES} from '/sparkle-dots/next/_test/cases.mjs';
import {run, oldEngine, newEngine, sheetsFrom, summary, rle, centreCheck} from '/sparkle-dots/next/_test/driver.mjs';
const OLD = ${JSON.stringify(OLD).replace(/</g, '\\u003c')};
const sheets = sheetsFrom(OLD), results = [];
const wall = document.createElement('canvas'), wctx = wall.getContext('2d', {willReadFrequently:true});
const canvas = Shapes.canvasRaster(wctx);
const finals = (make, c) => { const out = []; run(c, make, (step, e, created) => { const s = e.get(); out.push({step, sum: JSON.stringify(summary(e, created)), lab: Array.from(s.lab), labD: Array.from(s.labD)}); }); return out; };
for (const c of CASES){
  const a = finals((paper, clock) => oldEngine(OLD, paper, clock), c);
  wall.width = 14*Shapes.K; wall.height = 12*Shapes.K;
  const b = finals((paper, clock) => newEngine(canvas, sheets, paper, clock), c);
  const n = finals((paper, clock) => newEngine(Shapes.integerRaster, sheets, paper, clock), c);
  const diffs = [];
  a.forEach((x, i) => { const y = b[i]; for (const f of ['sum', 'lab', 'labD']) if (JSON.stringify(x[f]) !== JSON.stringify(y[f])) diffs.push(x.step + ':' + f); });
  const A = a[a.length-1], N = n[n.length-1];
  let cellsLab = 0, cellsLabD = 0; A.lab.forEach((v, i) => { if (v !== N.lab[i]) cellsLab++; if (A.labD[i] !== N.labD[i]) cellsLabD++; });
  const area = {}; A.lab.forEach(v => { if (v > 0) area[v] = (area[v] || 0) + 1; });
  const areas = Object.values(area);
  const cc = {shapes: 0, ties: 0, diffs: 0};
  a.forEach(x => { const r = centreCheck(x.lab, 14*Shapes.K, 12*Shapes.K); for (const f in cc) cc[f] += r[f]; });
  results.push({name: c.name, steps: a.length, diffs, cc, cellsLab, cellsLabD, shapes: areas.length, tiny: areas.filter(v => v < 6).length,
    intLab: rle(N.lab), intLabD: rle(N.labD), intSteps: n.map(x => x.sum)});
}
document.getElementById('out').textContent = JSON.stringify(results);
</script>`;

const server = createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (u === '/__parity.html'){ res.writeHead(200, {'content-type': 'text/html'}); return res.end(page); }
  const f = path.join(root, u);
  if (!f.startsWith(root) || !existsSync(f)){ res.writeHead(404); return res.end(); }
  res.writeHead(200, {'content-type': /\.m?js$/.test(f) ? 'text/javascript' : 'text/plain'}); res.end(readFileSync(f));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/__parity.html`;
const chrome = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const dom = await new Promise((resolve, reject) => execFile(chrome,
  ['--headless=new', '--disable-gpu', '--no-first-run', '--virtual-time-budget=120000', '--dump-dom', url],
  {maxBuffer: 1 << 30, timeout: 600000}, (err, out) => err ? reject(err) : resolve(out)));
server.close();
const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
const text = m && m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
if (!text || text === 'pending'){ fail('browser run produced no result'); process.exit(1); }
const results = JSON.parse(text), cc = {shapes: 0, ties: 0, diffs: 0};
if (results.length !== CASES.length) fail('browser case count');
results.forEach((r, i) => {
  const rec = records[i];
  if (r.diffs.length) fail(`${r.name}: old and new differ at ${r.diffs.slice(0, 5).join(' ')}`);
  if (r.intLab !== rec.lab || r.intLabD !== rec.labD || JSON.stringify(r.intSteps) !== JSON.stringify(rec.steps.map(({step, ...s}) => JSON.stringify(s))))
    fail(`${r.name}: integer mode differs between Chrome and Node`);
  if (r.cc.diffs) fail(`${r.name}: float and integer centres differ in ${r.cc.diffs} canvas-mode shapes`);
  cc.shapes += r.cc.shapes; cc.ties += r.cc.ties; cc.diffs += r.cc.diffs;
  console.log(`${r.diffs.length ? 'FAIL' : 'ok  '} ${r.name.padEnd(24)} steps ${String(r.steps).padStart(2)}  shapes ${r.shapes}  tiny(<6) ${r.tiny}  integer vs canvas: lab ${r.cellsLab} cells, labD ${r.cellsLabD} cells`);
});
console.log(`centres (canvas raster): ${cc.shapes} shapes over every step, ${cc.ties} with tied cells, ${cc.diffs} float vs integer mismatches`);
console.log(failed ? `shapes-parity: ${failed} failure(s)` : `shapes-parity: ${results.length} cases identical old vs new (canvas); integer goldens match`);
process.exit(failed ? 1 : 0);
