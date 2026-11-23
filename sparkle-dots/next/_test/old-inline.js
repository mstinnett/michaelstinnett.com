// Verbatim copy of the lab's inline shape code before it moved into shapes.js:
// sparkle-dots/next/index.html at 851c745, lines 382-511 and 774-791. Test reference only; never edit.
const ring = (cx, cy, r, n=20) => Array.from({length:n}, (_, i) => [cx + Math.cos(i/n*Math.PI*2)*r, cy + Math.sin(i/n*Math.PI*2)*r]);
const SHEETS = {
  car: [
    {pts:[[1,7],[1,5],[4,5],[6,3],[9,3],[11,5],[12,5],[12,7]], closed:true},
    {pts:[[5,5],[6,4],[7,4],[7,5]], closed:true},
    {pts:[[8,5],[8,4],[9,4],[10,5]], closed:true},
    {pts:ring(3.5, 7, 0.9), closed:true, road:false},
    {pts:ring(9.5, 7, 0.9), closed:true, road:false},
    {pts:[[0,9],[13,9]]},
  ],
  castle: [
    {pts:[[2,10],[2,5],[11,5],[11,10]], closed:true},
    ...[2,4,6,8].map(x => ({pts:[[x+1,5],[x+1,4],[x+2,4],[x+2,5]]})),
    {pts:[[0,10],[0,3],[2,3],[2,10]], closed:true},
    {pts:[[11,10],[11,3],[13,3],[13,10]], closed:true},
    {pts:[[0,3],[1,1],[2,3]]},
    {pts:[[11,3],[12,1],[13,3]]},
    {pts:[[5,10],[5,7],[6,6],[7,6],[8,7],[8,10]]},
    {pts:[[3,7],[4,7],[4,8],[3,8]], closed:true},
    {pts:[[9,7],[10,7],[10,8],[9,8]], closed:true},
    {pts:[[0,11],[13,11]]},
  ],
};
const paperLines = (p = paper) => SHEETS[p] || [];

/* ================= shape detection (raster) ================= */
const K = 36;                    // raster pixels per dot spacing
let RW, RH, lab, labD, queue;
const wallCv = document.createElement('canvas'), wctx = wallCv.getContext('2d', {willReadFrequently:true});
const fillCv = document.createElement('canvas'), fctx = fillCv.getContext('2d');
let fillImg;
let faces = [], boxes = [], fillDirty = true;
function allocRaster(){
  RW = GW*K; RH = GH*K;
  wallCv.width = fillCv.width = RW; wallCv.height = fillCv.height = RH;
  lab = new Int32Array(RW*RH); labD = new Int32Array(RW*RH); queue = new Int32Array(RW*RH);
  fillImg = fctx.createImageData(RW, RH);
}
const toR = i => (i + 0.5)*K;

function recompute(autoFill, touching){   // touching: the lines just drawn; only shapes they close get filled
  const N = RW*RH;
  wctx.clearRect(0,0,RW,RH);
  wctx.strokeStyle = '#000'; wctx.lineWidth = 2.6; wctx.lineCap = 'round';
  wctx.beginPath();
  segs.forEach(s => { wctx.moveTo(toR(s.a[0]), toR(s.a[1])); wctx.lineTo(toR(s.b[0]), toR(s.b[1])); });
  const poly = (pts, closed) => { pts.forEach(([x, y], i) => i ? wctx.lineTo(toR(x), toR(y)) : wctx.moveTo(toR(x), toR(y))); if (closed) wctx.closePath(); };
  paperLines().forEach(l => poly(l.pts, l.closed));   // fill works on any closed shape, whatever drew its edges
  wctx.stroke();
  const px = wctx.getImageData(0,0,RW,RH).data;
  for (let p=0;p<N;p++) lab[p] = px[p*4+3] > 40 ? -1 : -2;

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
      const cx = sx/qt, cy = sy/qt; let best = queue[0], bd = 1e9;
      for (let i=0;i<qt;i++){ const p = queue[i], dx = p%RW - cx, dy = ((p/RW)|0) - cy, d = dx*dx+dy*dy; if (d < bd){ bd = d; best = p; } }
      info.push({area:qt, center:best, box:[x0-3, y0-3, x1+3, y1+3]}); next++;
    }
  }
  boxes = info.map(i => i.box);

  faces = [null]; const keep = [];
  seeds.sort((a,b) => b.born - a.born);
  for (const s of seeds){
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
  seeds = keep;

  const created = [];
  if (autoFill){
    const now = performance.now();
    let allow = null;
    if (touching){   // a shape counts as newly closed only if it borders one of the new lines
      allow = new Set();
      touching.forEach(([a, b]) => {
        const ax = toR(a[0]), ay = toR(a[1]), bx = toR(b[0]), by = toR(b[1]), L = Math.hypot(bx-ax, by-ay) || 1, nx = -(by-ay)/L, ny = (bx-ax)/L;
        for (let t=0.1; t<0.95; t+=0.1) for (const sg of [-1, 1]){
          const x = Math.round(ax + (bx-ax)*t + nx*sg*4), y = Math.round(ay + (by-ay)*t + ny*sg*4);
          if (x >= 0 && y >= 0 && x < RW && y < RH && lab[y*RW + x] > 0) allow.add(lab[y*RW + x]);
        }
      });
    }
    for (let k=1;k<info.length;k++){
      if (faces[k] || info[k].area < 6 || (allow && !allow.has(k))) continue;
      const c = info[k].center, s = {x:c%RW, y:(c/RW)|0, ink:{...ink}, born:now};
      seeds.push(s); faces[k] = s; created.push(s);
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
  fillDirty = true;
  return created;
}
function regionAt(fx, fy){ const x = Math.min(RW-1, Math.max(0, Math.floor((fx+.5)*K))), y = Math.min(RH-1, Math.max(0, Math.floor((fy+.5)*K))); return labD[y*RW+x]; }
function gcd(a, b){ while (b){ [a, b] = [b, a % b]; } return a; }
function pieces(a, b){  // split a line at every dot it passes through
  const dx = b[0]-a[0], dy = b[1]-a[1], g = gcd(Math.abs(dx), Math.abs(dy)) || 1, out = [];
  for (let i=0;i<g;i++) out.push([[a[0]+dx*i/g, a[1]+dy*i/g], [a[0]+dx*(i+1)/g, a[1]+dy*(i+1)/g]]);
  return out;
}
function segKey(a, b){ const k1 = a.join(','), k2 = b.join(','); return k1 < k2 ? k1+'|'+k2 : k2+'|'+k1; }
function addLine(a, b, now){
  pieces(a, b).forEach(([p, q], i) => {
    const key = segKey(p, q), hit = segs.find(s => segKey(s.a, s.b) === key);
    if (!hit) segs.push({a:p, b:q, born: now + i*60});
  });
}
function eraseLine(a, b){
  const keys = new Set(pieces(a, b).map(([p, q]) => segKey(p, q)));
  const n = segs.length; segs = segs.filter(s => !keys.has(segKey(s.a, s.b)));
  return segs.length !== n;
}
