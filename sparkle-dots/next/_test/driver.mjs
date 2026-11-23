// Runs scripted strokes through an engine and records what the page would see after each step.
// Engines: oldEngine (the verbatim inline code, browser only) and newEngine (shapes.js with any rasteriser).
import * as Shapes from '../shapes.js';

const GW = 14, GH = 12, INK = {k:'c', v:'#e8634a'};

// The coloring sheets, taken from the verbatim old code (pure part: ring + SHEETS).
export function sheetsFrom(oldText){
  const src = oldText.slice(oldText.indexOf('const ring'), oldText.indexOf('const paperLines'));
  return new Function(src + '\nreturn SHEETS;')();
}

export function oldEngine(oldText, paper, clock){
  const make = new Function('GW', 'GH', 'paper', 'ink', 'performance',
    'let segs = [], seeds = [];\n' + oldText +
    '\nallocRaster();\nreturn {addLine, eraseLine, recompute, regionAt, K, get: () => ({segs, seeds, faces, boxes, lab, labD, RW, RH}), pushSeed: s => seeds.push(s)};');
  return make(GW, GH, paper, INK, clock);
}

export function newEngine(raster, sheets, paper, clock){
  const R = Shapes.allocRegions(GW, GH);
  let segs = [], seeds = [], faces = [], boxes = [];
  return {
    K: Shapes.K,
    addLine(a, b, now){ segs.push(...Shapes.newPieces(segs, a, b, now)); },
    eraseLine(a, b){ const n = segs.length; segs = Shapes.withoutLine(segs, a, b); return segs.length !== n; },
    recompute(autoFill, touching){
      const r = Shapes.recompute(R, {raster, segs, lines: sheets[paper] || [], seeds, autoFill, touching, ink: INK, now: clock.now()});
      seeds = r.seeds; faces = r.faces; boxes = r.boxes; return r.created;
    },
    regionAt: (fx, fy) => Shapes.regionAt(R, fx, fy),
    get: () => ({segs, seeds, faces, boxes, lab: R.lab, labD: R.labD, RW: R.RW, RH: R.RH}),
    pushSeed: s => seeds.push(s),
  };
}

// Step through a case. Each op is what the page does for it: a drawn line adds its pieces and recomputes
// with auto-fill limited to the shapes it borders; an erase recomputes without fill; a tap on an empty
// shape adds a seed there (as tapColor does). Calls visit(step, engine, created) after every step.
export function run(c, makeEngine, visit){
  let t = 1000;
  const clock = {now: () => t};
  const e = makeEngine(c.paper || 'dots', clock);
  visit('start', e, e.recompute(false));
  c.ops.forEach((op, i) => {
    t += 1000;
    let created = [];
    if (op.add){ e.addLine(op.add[0], op.add[1], t); created = e.recompute(true, [op.add]); }
    else if (op.erase){ e.eraseLine(op.erase[0], op.erase[1]); created = e.recompute(false); }
    else if (op.tap){
      const [x, y] = op.tap, k = e.regionAt(x, y), s = e.get();
      if (k > 0 && !s.faces[k]){ const sd = {x:Math.min(s.RW-1, Math.max(0, Math.floor((x+.5)*e.K))), y:Math.min(s.RH-1, Math.max(0, Math.floor((y+.5)*e.K))), ink:{...INK}, born:t - 250}; e.pushSeed(sd); s.faces[k] = sd; }
    }
    visit(i, e, created);
  });
}

// What a step produced, in plain data: seeds in order, which seed owns each shape, boxes, created count.
export function summary(e, created){
  const s = e.get();
  return {
    seeds: s.seeds.map(d => [d.x, d.y, d.born, d.ink && d.ink.v]),
    faces: s.faces.map(f => f ? s.seeds.indexOf(f) : null),
    boxes: s.boxes, created: created.length, segs: s.segs.map(g => Shapes.segKey(g.a, g.b) + '@' + g.born),
  };
}

// Run-length encoding of a label array: "value*count,..."
export function rle(a){
  const out = []; let v = a[0], n = 0;
  for (let i=0;i<a.length;i++){ if (a[i] === v) n++; else { out.push(v + '*' + n); v = a[i]; n = 1; } }
  out.push(v + '*' + n); return out.join(',');
}

// Integer-mode record for one case: per step summary plus the final shape maps.
export function integerRecord(c, sheets){
  const steps = [];
  let last;
  run(c, (paper, clock) => newEngine(Shapes.integerRaster, sheets, paper, clock), (step, e, created) => { steps.push({step, ...summary(e, created)}); last = e.get(); });
  return {name: c.name, paper: c.paper || 'dots', RW: last.RW, RH: last.RH, steps, lab: rle(last.lab), labD: rle(last.labD)};
}

// The lab's float rules before the integer centre and probes, verbatim, for comparison with shapes.js.
export function floatCentre(queue, qt, RW, sx, sy){
  const cx = sx/qt, cy = sy/qt; let best = queue[0], bd = 1e9;
  for (let i=0;i<qt;i++){ const p = queue[i], dx = p%RW - cx, dy = ((p/RW)|0) - cy, d = dx*dx+dy*dy; if (d < bd){ bd = d; best = p; } }
  return best;
}
export function floatProbes(a, b){
  const toR = Shapes.toR, out = [];
  const ax = toR(a[0]), ay = toR(a[1]), bx = toR(b[0]), by = toR(b[1]), L = Math.hypot(bx-ax, by-ay) || 1, nx = -(by-ay)/L, ny = (bx-ax)/L;
  for (let t=0.1; t<0.95; t+=0.1) for (const sg of [-1, 1]) out.push([Math.round(ax + (bx-ax)*t + nx*sg*4), Math.round(ay + (by-ay)*t + ny*sg*4)]);
  return out;
}

// Float centre vs integer centre for every shape in a label array. Each shape's cells are re-flooded in the order
// recompute's queue visits them (its first cell in scan order, then L, R, U, D), so ties resolve the same way.
// ties: shapes whose least distance is shared by more than one cell.
export function centreCheck(lab, RW, RH){
  const N = RW*RH, seen = new Uint8Array(N), q = new Int32Array(N);
  let shapes = 0, ties = 0, diffs = 0;
  for (let p0=0;p0<N;p0++){
    const k = lab[p0]; if (k <= 0 || seen[p0]) continue;
    let qh = 0, qt = 0, sx = 0, sy = 0;
    q[qt++] = p0; seen[p0] = 1;
    while (qh < qt){
      const p = q[qh++], x = p % RW, y = (p / RW) | 0; sx += x; sy += y;
      for (const [ok, r] of [[x>0, p-1], [x<RW-1, p+1], [y>0, p-RW], [y<RH-1, p+RW]]) if (ok && lab[r] === k && !seen[r]){ seen[r] = 1; q[qt++] = r; }
    }
    shapes++;
    const c = Shapes.centreOf(q, qt, RW, sx, sy);
    if (c !== floatCentre(q, qt, RW, sx, sy)) diffs++;
    const u = p => [qt*(p % RW) - sx, qt*((p / RW) | 0) - sy], [bx, by] = u(c);
    let n = 0; for (let i=0;i<qt;i++){ const [ux, uy] = u(q[i]); if (!Shapes.lessSq(bx, by, ux, uy)) n++; }
    if (n > 1) ties++;
  }
  return {shapes, ties, diffs};
}
