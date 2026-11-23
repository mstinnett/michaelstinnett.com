// Sparkle Dots: what a shape is. Lines on the dot lattice, the raster they make, and the shapes (regions) found in it.
// No DOM in here. Drawing lines into the raster is a rasteriser passed in by the caller:
//   canvasRaster(ctx)  the browser's anti-aliased stroke (what the lab has always used; the page passes this one)
//   integerRaster      a deterministic integer-only stroke, for fixtures other platforms can reproduce
// A rasteriser is (RW, RH, segs, lines) => Uint8Array(RW*RH), 1 where a line covers the cell.

export const K = 36;   // raster cells per dot spacing
export const toR = i => (i + 0.5)*K;

/* ---------- lines ---------- */
export function gcd(a, b){ while (b){ [a, b] = [b, a % b]; } return a; }
export function pieces(a, b){  // split a line at every dot it passes through
  const dx = b[0]-a[0], dy = b[1]-a[1], g = gcd(Math.abs(dx), Math.abs(dy)) || 1, out = [];
  for (let i=0;i<g;i++) out.push([[a[0]+dx*i/g, a[1]+dy*i/g], [a[0]+dx*(i+1)/g, a[1]+dy*(i+1)/g]]);
  return out;
}
export function segKey(a, b){ const k1 = a.join(','), k2 = b.join(','); return k1 < k2 ? k1+'|'+k2 : k2+'|'+k1; }
// The segments a line from a to b adds to segs (the pieces not already there). Caller appends them.
export function newPieces(segs, a, b, now){
  const out = [];
  pieces(a, b).forEach(([p, q], i) => {
    const key = segKey(p, q), hit = segs.find(s => segKey(s.a, s.b) === key);
    if (!hit) out.push({a:p, b:q, born: now + i*60});
  });
  return out;
}
// segs without the pieces of the line from a to b.
export function withoutLine(segs, a, b){
  const keys = new Set(pieces(a, b).map(([p, q]) => segKey(p, q)));
  return segs.filter(s => !keys.has(segKey(s.a, s.b)));
}

/* ---------- rasterisers ---------- */
// The lab's stroke: one path of every segment and paper line, 2.6 cells wide, round caps, alpha above 40 is wall.
// ctx is a 2D context whose canvas is already RW x RH.
export function canvasRaster(ctx){
  return (RW, RH, segs, lines) => {
    ctx.clearRect(0,0,RW,RH);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    ctx.beginPath();
    segs.forEach(s => { ctx.moveTo(toR(s.a[0]), toR(s.a[1])); ctx.lineTo(toR(s.b[0]), toR(s.b[1])); });
    const poly = (pts, closed) => { pts.forEach(([x, y], i) => i ? ctx.lineTo(toR(x), toR(y)) : ctx.moveTo(toR(x), toR(y))); if (closed) ctx.closePath(); };
    lines.forEach(l => poly(l.pts, l.closed));   // fill works on any closed shape, whatever drew its edges
    ctx.stroke();
    const px = ctx.getImageData(0,0,RW,RH).data, N = RW*RH, wall = new Uint8Array(N);
    for (let p=0;p<N;p++) wall[p] = px[p*4+3] > 40 ? 1 : 0;
    return wall;
  };
}
// Integer stroke: a cell is wall when its centre lies within 1.3 cells (a capsule: half the 2.6 stroke width,
// round ends) of any segment. Everything is in half-cell units so all coordinates are integers:
// cell (x, y) has centre (2x+1, 2y+1); dot i sits at 2*toR(i) = (2i+1)*K. Paper-line points off the lattice
// are rounded to the nearest half cell. dist <= 1.3 cells is dist_h^2 <= 6.76, tested as 25*dist_h^2 <= 169.
// Inside the segment's span dist_h^2 = cross^2 / |d|^2, so the test is 25*cross^2 <= 169*|d|^2.
// Joins are round too (each piece is its own capsule), unlike the canvas's miter joins on paper polylines.
// Magnitudes stay below 2^53 for any page up to 24 x 18 dots, so Number arithmetic is exact.
export function integerRaster(RW, RH, segs, lines){
  const wall = new Uint8Array(RW*RH), h = v => Math.round(2*toR(v));
  const capsule = (ax, ay, bx, by) => {
    const dx = bx-ax, dy = by-ay, den = dx*dx + dy*dy;
    const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - 3) / 2)), x1 = Math.min(RW-1, Math.floor((Math.max(ax, bx) + 3) / 2));
    const y0 = Math.max(0, Math.floor((Math.min(ay, by) - 3) / 2)), y1 = Math.min(RH-1, Math.floor((Math.max(ay, by) + 3) / 2));
    for (let y=y0; y<=y1; y++) for (let x=x0; x<=x1; x++){
      const wx = 2*x+1-ax, wy = 2*y+1-ay, dot = wx*dx + wy*dy;
      let hit;
      if (dot <= 0) hit = 25*(wx*wx + wy*wy) <= 169;
      else if (dot >= den){ const ex = 2*x+1-bx, ey = 2*y+1-by; hit = 25*(ex*ex + ey*ey) <= 169; }
      else { const cr = wx*dy - wy*dx; hit = 25*cr*cr <= 169*den; }
      if (hit) wall[y*RW+x] = 1;
    }
  };
  segs.forEach(s => capsule(h(s.a[0]), h(s.a[1]), h(s.b[0]), h(s.b[1])));
  lines.forEach(l => {
    const pts = l.closed ? [...l.pts, l.pts[0]] : l.pts;
    for (let i=1;i<pts.length;i++) capsule(h(pts[i-1][0]), h(pts[i-1][1]), h(pts[i][0]), h(pts[i][1]));
  });
  return wall;
}

/* ---------- regions ---------- */
// Buffers for a page GW x GH dots. lab: -1 wall, 0 outside (touches the page edge), k > 0 shape k.
// labD: lab with walls next to a shape given to it (two passes), so fills run under the lines.
export function allocRegions(GW, GH){
  const RW = GW*K, RH = GH*K;
  return {RW, RH, lab: new Int32Array(RW*RH), labD: new Int32Array(RW*RH), queue: new Int32Array(RW*RH)};
}

// Find the shapes. seeds: [{x, y, ink, born}] in raster cells. Each shape belongs to the newest seed inside it;
// a seed under a line moves to a free shape within 6 cells or is dropped (moved seeds are updated in place).
// autoFill: shapes without a seed get one with a copy of ink, born now, but only shapes of 6+ cells and,
// when touching (the lines just drawn, [[a, b], ...]) is given, only shapes bordering those lines.
// Returns {seeds, faces, boxes, created}: faces[k] is shape k's seed; created are the new seeds.
export function recompute(R, {raster, segs, lines, seeds, autoFill, touching, ink, now}){
  const {RW, RH, lab, labD, queue} = R, N = RW*RH;
  const wall = raster(RW, RH, segs, lines);
  for (let p=0;p<N;p++) lab[p] = wall[p] ? -1 : -2;

  const info = [{box:[0,0,RW,RH]}]; let next = 1;
  for (let p0=0;p0<N;p0++){
    if (lab[p0] !== -2) continue;
    let qh = 0, qt = 0, border = false, sx = 0, sy = 0, x0 = RW, y0 = RH, x1 = 0, y1 = 0;
    queue[qt++] = p0; lab[p0] = next;
    while (qh < qt){
      const p = queue[qh++], x = p % RW, y = (p / RW) | 0;
      sx += x; sy += y; if (x<x0) x0=x; if (x>x1) x1=x; if (y<y0) y0=y; if (y>y1) y1=y;
      if (x===0 || y===0 || x===RW-1 || y===RH-1) border = true;
      if (x>0    && lab[p-1]  === -2){ lab[p-1]  = next; queue[qt++] = p-1; }
      if (x<RW-1 && lab[p+1]  === -2){ lab[p+1]  = next; queue[qt++] = p+1; }
      if (y>0    && lab[p-RW] === -2){ lab[p-RW] = next; queue[qt++] = p-RW; }
      if (y<RH-1 && lab[p+RW] === -2){ lab[p+RW] = next; queue[qt++] = p+RW; }
    }
    if (border){ for (let i=0;i<qt;i++) lab[queue[i]] = 0; }
    else {
      info.push({area:qt, center:centreOf(queue, qt, RW, sx, sy), box:[x0-3, y0-3, x1+3, y1+3]}); next++;
    }
  }
  const boxes = info.map(i => i.box);

  const faces = [null], keep = [];
  for (const s of [...seeds].sort((a,b) => b.born - a.born)){
    if (s.x < 0 || s.y < 0 || s.x >= RW || s.y >= RH) continue;
    let p = s.y*RW + s.x;
    if (lab[p] === -1){
      let found = -1;
      for (let r=1; r<=6 && found<0; r++) for (let dy=-r; dy<=r && found<0; dy++) for (let dx=-r; dx<=r; dx++){
        const x = s.x+dx, y = s.y+dy; if (x<0||y<0||x>=RW||y>=RH) continue;
        const q = y*RW+x; if (lab[q] > 0 && !faces[lab[q]]){ found = q; break; }
      }
      if (found < 0) continue;
      p = found; s.x = p % RW; s.y = (p/RW)|0;
    }
    const k = lab[p];
    if (k > 0 && !faces[k]){ faces[k] = s; keep.push(s); }
  }

  const created = [];
  if (autoFill){
    let allow = null;
    if (touching){   // a shape counts as newly closed only if it borders one of the new lines
      allow = new Set();
      touching.forEach(([a, b]) => probes(a, b).forEach(([x, y]) => {
        if (x >= 0 && y >= 0 && x < RW && y < RH && lab[y*RW + x] > 0) allow.add(lab[y*RW + x]);
      }));
    }
    for (let k=1;k<info.length;k++){
      if (faces[k] || info[k].area < 6 || (allow && !allow.has(k))) continue;
      const c = info[k].center, s = {x:c%RW, y:(c/RW)|0, ink:{...ink}, born:now};
      keep.push(s); faces[k] = s; created.push(s);
    }
  }

  labD.set(lab);
  for (let pass=0; pass<2; pass++){
    for (let p=0;p<N;p++){
      if (labD[p] !== -1) continue;
      const x = p % RW, y = (p/RW)|0; let v = -1;
      const n = [x>0?labD[p-1]:-1, x<RW-1?labD[p+1]:-1, y>0?labD[p-RW]:-1, y<RH-1?labD[p+RW]:-1];
      for (const q of n){ if (q > 0){ v = q; break; } }
      if (v > 0) labD[p] = -(v+10);
    }
    for (let p=0;p<N;p++) if (labD[p] <= -10) labD[p] = -labD[p]-10;
  }
  return {seeds: keep, faces, boxes, created};
}

// A shape's centre: the first cell in queue order whose distance to the centroid is least, compared exactly in
// integers as (n*x - sx)^2 + (n*y - sy)^2 (n cells, sx and sy the sums of their x and y), with strict <.
export function centreOf(queue, n, RW, sx, sy){
  let best = queue[0], bx = n*(best % RW) - sx, by = n*((best / RW) | 0) - sy;
  for (let i=1;i<n;i++){
    const p = queue[i], ux = n*(p % RW) - sx, uy = n*((p / RW) | 0) - sy;
    if (lessSq(ux, uy, bx, by)){ best = p; bx = ux; by = uy; }
  }
  return best;
}
// a^2 + b^2 < c^2 + d^2 for integers, exactly. The squares can pass 2^53, so a near-tie is settled in BigInt.
export function lessSq(a, b, c, d){
  const l = a*a + b*b, r = c*c + d*d;
  if (Math.abs(l - r) > 1e-13*(l + r)) return l < r;
  const A = BigInt(a), B = BigInt(b), C = BigInt(c), D = BigInt(d);
  return A*A + B*B < C*C + D*D;
}
// floor(k / sqrt(D)) for integers k and D > 0, exactly: the largest t with t|t|D <= k|k|.
export function floorDivSqrt(k, D){
  const kk = k*Math.abs(k);
  let t = Math.floor(k / Math.sqrt(D));
  while (t*Math.abs(t)*D > kk) t--;
  while ((t+1)*Math.abs(t+1)*D <= kk) t++;
  return t;
}
// The 18 auto-fill probes of the line from dot a to dot b, in raster cells: at each tenth i = 1..9 along it, 4 cells
// either side (s = -1, 1), rounded half up. In integers, with d = B - A in cells and D = |d|^2:
//   x = floor((10*Ax + i*dx + 5 + floor(-40*s*dy / sqrt(D))) / 10), y likewise with +40*s*dx. D = 0 gives offset 0.
export function probes(a, b){
  const ax = toR(a[0]), ay = toR(a[1]), dx = toR(b[0]) - ax, dy = toR(b[1]) - ay, D = dx*dx + dy*dy, out = [];
  for (let i=1;i<=9;i++) for (const s of [-1, 1]){
    const ox = D ? floorDivSqrt(-40*s*dy, D) : 0, oy = D ? floorDivSqrt(40*s*dx, D) : 0;
    out.push([Math.floor((10*ax + i*dx + 5 + ox) / 10), Math.floor((10*ay + i*dy + 5 + oy) / 10)]);
  }
  return out;
}

// The shape under a point in dot coordinates (0 or less: not a shape).
export function regionAt(R, fx, fy){ const {RW, RH, labD} = R, x = Math.min(RW-1, Math.max(0, Math.floor((fx+.5)*K))), y = Math.min(RH-1, Math.max(0, Math.floor((fy+.5)*K))); return labD[y*RW+x]; }
