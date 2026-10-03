import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MAT } from '../materials.js';
import { mesh, rodBetween } from '../geometry.js';
import { dimension, tag } from '../labels.js';
import { sp21Cable, POLE_GAP } from '../model/sp21.js';
import { ENV, STATUS, levelStatus } from '../env.js';
import { AFMR, AWLR_POS, MDPL0, RIVER, SITES, dhAt, worldHeight } from '../world.js';
import { ARM, SLEEVE, awlrRiver, armLevels } from './awlrRiver.js';
import stlUrl from '../model/hrf600s.stl?url';

// AFMR Sungai (satuan m). Permintaan user: stasiun pengukur ARUS (bukan hanya tinggi muka air) di hulu (titik pilihan user)
// = monopole + lengan AWLR Sungai (tiang 3" × 4 m, sling, sleeve — awlrRiver.js) dengan lengan diperpanjang 2 m agar sensor
// lebih ke tengah alur, ujung pipa ditutup, plat dudukan lama ditiadakan + radar flow meter Holykell HRF600S (plastic joint).
// Bentuk sensor = STL dari user (hrf600s.py, manual HRF600S V25 sec. 3.1.1): 160 × 100 × 89,9 mm, muka atas dengan 4 lubang
// M5 85 × 85 + waterpass, antena kecepatan 24 GHz di muka miring, lensa level 80 GHz di bawah, plastic joint di ujung belakang.
// Bracket sesuai foto user (Clamp – Crossbar – Support – Host): 3 klem cincin mengikat sadel ke pipa bawah lengan dekat ujung,
// support 2 engsel (baut atas sejajar pipa, baut pivot bawah tegak lurus pipa) turun ke plat dasar yang dibaut 4-M5 ke muka
// atas sensor. Sensor diputar 90° terhadap foto (permintaan user): sumbu panjang searah arus, muka miring (antena kecepatan)
// menghadap ke hulu (asumsi), plastic joint ke hilir — pola baut 85 × 85 persegi, jadi plat dasar tetap seperti foto.
// Debit dihitung seperti flow meter radar: Q = luas penampang basah (dari penampang sungai di bawah sensor) × kecepatan rata-rata
// (= k × kecepatan permukaan yang dibaca antena 24 GHz). Kabel lewat conduit seperti AWLR Sungai → SP21 kedua di box.
// Ukuran bracket (diskalakan dari foto), jalur kabel & parameter hidrolis = perkiraan.
export const HRF = {
  L: 0.16, W: 0.1, H: 0.0899,                          // badan + lensa (total 89,9)
  hole: 0.085, holeOff: 0.03,                          // pola 4-M5 85 × 85, pusatnya 30 mm dari tengah badan ke arah joint
  joint: [0.093, 0.022, -0.034],                       // ujung plastic joint dari tengah muka atas (panjang, lebar, tinggi)
};
// Lengan AWLR + 2 m (permintaan user): pipa atas 5000, bawah 5100, pipa tegak tetap berjarak 1000
const ARM_AF = { top: ARM.top + 2, bottom: ARM.bottom + 2, posts: [0.02, 1.0, 2.0, 3.0, 4.0, 4.98] };
// Bracket (perkiraan dari foto, skala lewat tinggi badan sensor 83,2 mm): pusat 50 mm dari ujung pipa bawah, sadel 97 mm,
// klem lebar 12 mm jarak 30 mm, bawah sadel → muka atas sensor 95 mm
const BR = { fromEnd: 0.05, sadL: 0.097, sadT: 0.004, band: 0.012, bandT: 0.0008, bands: [-0.03, 0, 0.03], drop: 0.095 };
const M5 = { af: 0.008, head: 0.0035, washR: 0.005, washT: 0.001 };
// Hidrolis (perkiraan): Manning n saluran alam, kemiringan muka air S, k = kecepatan rata-rata / kecepatan permukaan
const HYD = { n: 0.035, S: 0.001, k: 0.85 };
const SEC = { x0: -1.5, x1: 15, dx: 0.1 };              // penampang sepanjang garis lengan (x lokal dari tiang)

// Posisi bracket & sensor dari tinggi pasang box (lokal stasiun)
const xBracket = () => SLEEVE.R - 0.003 + ARM_AF.bottom - BR.fromEnd;
const sensorTop = encY => armLevels(encY).yb - ARM.pipeR - BR.sadT - BR.drop;

// STL (mm, asal = tengah muka atas, +X ke joint, +Z ke atas) → m; lokal stasiun: +X STL → +z (hilir), +Y → +x, +Z → +y
let hrfGeo = null;
const loadSensor = () => fetch(stlUrl).then(r => r.arrayBuffer()).then(buf => {
  const g = new STLLoader().parse(buf);
  g.scale(0.001, 0.001, 0.001); g.rotateX(-Math.PI / 2); g.rotateY(-Math.PI / 2);
  hrfGeo = toCreasedNormals(g, THREE.MathUtils.degToRad(30));          // fillet halus, tepi tetap tegas
});

// ---------- Penampang sungai di bawah sensor: profil medan dunia sepanjang garis lengan (z lokal 0), y dari tanah stasiun ----------
let secPts = null;
function section() {
  if (secPts) return secPts;
  const s = SITES.afmr, c = Math.cos(s.rot), sn = Math.sin(s.rot);
  secPts = [];
  for (let x = SEC.x0; x <= SEC.x1 + 1e-9; x += SEC.dx) secPts.push([x, worldHeight(s.x + x * c, s.z - x * sn) - s.y]);
  return secPts;
}
// Luas basah A, keliling basah, lebar muka air B, kedalaman maks → Manning: v = R^(2/3) S^(1/2) / n; Q = v · A
export function flow(dh) {
  const P = section(), wl = RIVER.water + dh;
  let A = 0, Pw = 0, B = 0, dMax = 0;
  for (let i = 1; i < P.length; i++) {
    const [xa, ya] = P[i - 1], [xb, yb] = P[i], da = wl - ya, db = wl - yb;
    if (da <= 0 && db <= 0) continue;
    const f = da < 0 || db < 0 ? Math.max(da, db) / Math.abs(da - db) : 1, w = (xb - xa) * f, h0 = Math.max(da, 0), h1 = Math.max(db, 0);
    A += w * (h0 + h1) / 2; B += w; Pw += Math.hypot(w, h0 - h1); dMax = Math.max(dMax, h0, h1);
  }
  const R = Pw ? A / Pw : 0, v = R ** (2 / 3) * Math.sqrt(HYD.S) / HYD.n;
  return { wl, A, B, dMax, v, vs: v / HYD.k, Q: v * A };
}

let ui = null, yBotNow = 0, secOn = true;
function extend(model) {
  const d = model.userData.d, S = model.userData.station;
  awlrRiver.extend(model, { sensor: false, plate: false, caps: true, arm: ARM_AF, level, river: { xc: AFMR.dP, width: 2 * AFMR.hw, part: 'riverAfmr', label: 'Sungai' } });
  const U = model.userData.awlr, { xb1, yb, yA0, zc } = U.mount, R = ARM.pipeR;
  const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
  const root = model.getObjectByName('awlr'), newG = () => { const g = new THREE.Group(); root.add(g); return g; };
  const alu = new THREE.MeshStandardMaterial({ color: 0x9ea3a7, metalness: 0.6, roughness: 0.4 }), steel = MAT.galv();
  const hexGeo = (af, h) => new THREE.CylinderGeometry(af / 2 / Math.cos(Math.PI / 6), af / 2 / Math.cos(Math.PI / 6), h, 6);
  const xS = xb1 - BR.fromEnd, ySad = yb - R - BR.sadT, yT = ySad - BR.drop;   // pusat bracket, bawah sadel, muka atas sensor
  const brk = U.hrf = newG();                                                 // sadel + support + plat dasar + sensor (turun bersama)

  // ---------- Clamp: 3 klem cincin stainless melingkari pipa bawah + sadel, rumah sekrup di bawah sadel ----------
  const bands = U.hrfBands = newG();
  const bandSh = new THREE.Shape(), Ro = R + BR.bandT, vb = -(R + BR.sadT);
  bandSh.absarc(0, 0, Ro, 0, Math.PI, false); bandSh.lineTo(-Ro, vb - BR.bandT); bandSh.lineTo(Ro, vb - BR.bandT); bandSh.closePath();
  const hole = new THREE.Path(); hole.absarc(0, 0, R, 0, Math.PI, false); hole.lineTo(-R, vb); hole.lineTo(R, vb); hole.closePath(); bandSh.holes.push(hole);
  const bandGeo = new THREE.ExtrudeGeometry(bandSh, { depth: BR.band, bevelEnabled: false, curveSegments: 24 }).translate(0, 0, -BR.band / 2).rotateY(Math.PI / 2);
  for (const off of BR.bands) {
    const x = xS + off, yH = ySad - BR.bandT - 0.004;
    bands.add(
      at(mesh(bandGeo, steel, 'hrfClamp'), x, yb, 0),
      at(mesh(new THREE.BoxGeometry(0.014, 0.008, 0.016), steel, 'hrfClamp'), x, yH, 0.009),                  // rumah sekrup cacing
      at(mesh(hexGeo(0.007, 0.004).rotateX(Math.PI / 2), MAT.bolt(), 'hrfClamp'), x, yH, 0.019),             // kepala sekrup
    );
  }
  const clTag = tag('Clamp', 'hrfClamp'); clTag.position.set(xS, yb + R + 0.01, 0); bands.add(clTag);

  // ---------- Sadel (crossbar seat) di bawah pipa ----------
  brk.add(at(mesh(new THREE.BoxGeometry(BR.sadL, BR.sadT, 2 * R), alu, 'hrfSupport'), xS, ySad + BR.sadT / 2, 0));
  for (const sx of [-1, 1]) brk.add(at(mesh(new THREE.BoxGeometry(0.003, 0.008, 2 * R), alu, 'hrfSupport'), xS + sx * (BR.sadL / 2 - 0.0015), ySad - 0.004, 0));   // bibir ujung

  // ---------- Support: yoke atas (baut sejajar pipa) → badan → yoke bawah (baut pivot tegak lurus pipa) → rel ----------
  const yBoltU = ySad - 0.026, yPiv = yT + 0.036;
  for (const sx of [-1, 1]) brk.add(at(mesh(new THREE.BoxGeometry(0.004, 0.038, 0.03), alu, 'hrfSupport'), xS + sx * 0.018, ySad - 0.019, 0));
  brk.add(rodBetween([xS - 0.024, yBoltU, 0], [xS + 0.024, yBoltU, 0], 0.004, MAT.thread(0.05), 'hrfSupport', 12),
    at(mesh(hexGeo(0.013, 0.0055).rotateZ(Math.PI / 2), MAT.bolt(), 'hrfSupport'), xS - 0.0228, yBoltU, 0),
    at(mesh(hexGeo(0.013, 0.0065).rotateZ(Math.PI / 2), MAT.nut(), 'hrfSupport'), xS + 0.0233, yBoltU, 0));
  const yBody0 = yT + 0.022, yBody1 = ySad - 0.012;
  brk.add(at(mesh(new RoundedBoxGeometry(0.03, yBody1 - yBody0, 0.03, 3, 0.004), alu, 'hrfSupport'), xS, (yBody0 + yBody1) / 2, 0));
  for (const sz of [-1, 1]) brk.add(at(mesh(new THREE.BoxGeometry(0.034, 0.033, 0.004), alu, 'hrfSupport'), xS, yT + 0.0335, sz * 0.019));
  brk.add(rodBetween([xS, yPiv, -0.025], [xS, yPiv, 0.025], 0.004, MAT.thread(0.05), 'hrfSupport', 12),
    at(mesh(hexGeo(0.013, 0.0055).rotateX(Math.PI / 2), MAT.bolt(), 'hrfSupport'), xS, yPiv, 0.0238),
    at(mesh(hexGeo(0.013, 0.0065).rotateX(Math.PI / 2), MAT.nut(), 'hrfSupport'), xS, yPiv, -0.0243));
  brk.add(at(mesh(new THREE.BoxGeometry(0.07, 0.012, 0.044), alu, 'hrfSupport'), xS, yT + 0.011, 0));        // rel
  const spTag = tag('Support', 'hrfSupport'); spTag.position.set(xS + 0.02, yT + 0.06, 0.02); brk.add(spTag);

  // ---------- Plat dasar + 4 baut M5 (85 × 85) ke muka atas sensor ----------
  brk.add(at(mesh(new THREE.BoxGeometry(0.1, 0.005, 0.1), alu, 'hrfBase'), xS, yT + 0.0025, 0));
  const h = HRF.hole / 2, washGeo = new THREE.CylinderGeometry(M5.washR, M5.washR, M5.washT, 16), headGeo = hexGeo(M5.af, M5.head);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) brk.add(
    at(mesh(washGeo, steel, 'hrfBase'), xS + sx * h, yT + 0.005 + M5.washT / 2, sz * h),
    at(mesh(headGeo, MAT.bolt(), 'hrfBase'), xS + sx * h, yT + 0.005 + M5.washT + M5.head / 2, sz * h));

  // ---------- Sensor HRF600S (host): pola baut di bawah pusat bracket, sumbu panjang searah arus ----------
  const zs0 = -HRF.holeOff;                                                   // tengah muka atas sensor (joint ke +z / hilir)
  brk.add(at(mesh(hrfGeo, new THREE.MeshStandardMaterial({ color: 0xb4b8bb, metalness: 0.5, roughness: 0.45 }), 'hrf600s'), xS, yT, zs0));
  const snTag = tag('Radar flow meter HRF600S', 'hrf600s'); snTag.position.set(xS + HRF.W / 2, yT - 0.04, zs0); brk.add(snTag);
  const yBot = yT - HRF.H, xd = xS + 0.16;
  const lvDim = dimension([xd, yBot, 0], [xd, RIVER.water, 0], [0.03, 0, 0], `${(yBot - RIVER.water).toFixed(2)} m ke muka air`, 12);
  brk.add(lvDim); U.lvDim = { dim: lvDim, x: xd, yBot }; U.yBot = yBotNow = yBot;   // ikut muka air (awlrRiver.update)

  // ---------- Kabel sensor dalam conduit hitam → konektor SP21 kedua di box (jalur sama dengan AWLR Sungai) ----------
  // Ujung conduit di sisi pipa bawah, kabel turun di sisi hilir bracket lalu masuk plastic joint dari arah hilir
  const cable = U.hrfCable = newG(), xj = xS + HRF.joint[1], zj = zs0 + HRF.joint[0], yj = yT + HRF.joint[2];
  sp21Cable(S, {
    slot: -1, wireToY: -0.1085, group: cable, phi: 30, yH: d.encY - 0.45,
    route: [[POLE_GAP * Math.cos(Math.PI / 6), yA0 - 0.03, zc], [0.12, yA0 - 0.03, zc], [0.12, yb, zc], [xb1 - 0.12, yb, zc]],
    endCable: [[xb1 - 0.135, yb, zc], [xb1 - 0.15, yb - 0.06, 0.07], [xj - 0.03, yj + 0.01, zj + 0.06], [xj, yj, zj + 0.015], [xj, yj, zj - 0.002]],
    tagText: 'Kabel sensor + conduit', tagAt: [1.2, yb - 0.02, zc + 0.01], plugTag: 'SP21 sensor',
  });

  // ---------- Penampang sungai di 3D (bidang tegak di bawah lengan): garis dasar + luas basah yang ikut muka air ----------
  const P = section(), N = P.length;
  const sec = U.sec = new THREE.Group(); sec.name = 'penampang'; root.add(sec);
  const bed = new THREE.Line(new THREE.BufferGeometry().setFromPoints(P.map(([x, y]) => new THREE.Vector3(x, y + 0.01, 0))),
    new THREE.LineBasicMaterial({ color: 0xffd166, depthTest: false, transparent: true }));
  bed.renderOrder = 999; sec.add(bed);
  const wg = new THREE.BufferGeometry(), idx = [];
  wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6), 3));
  for (let i = 0; i < N - 1; i++) { const a = 2 * i; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  wg.setIndex(idx);
  const water = new THREE.Mesh(wg, new THREE.MeshBasicMaterial({ color: 0x3cb4f2, transparent: true, opacity: 0.35, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
  water.renderOrder = 998; water.frustumCulled = false; sec.add(water);
  const wTop = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({ color: 0x3cb4f2, depthTest: false, transparent: true }));
  wTop.renderOrder = 999; wTop.frustumCulled = false; sec.add(wTop);
  const secTag = tag('Penampang sungai', 'riverAfmr'); secTag.position.set(AFMR.dP, RIVER.water - 0.5, 0); sec.add(secTag);
  U.setSection = wl => {                                                      // isi luas basah antara dasar & muka air
    const p = wg.attributes.position; let xa = null, xb = null;
    P.forEach(([x, y], i) => { p.setXYZ(2 * i, x, Math.min(y, wl), 0); p.setXYZ(2 * i + 1, x, wl, 0); if (y < wl) { xa ??= x; xb = x; } });
    p.needsUpdate = true; wg.computeBoundingSphere();
    const t = wTop.geometry.attributes.position; t.setXYZ(0, xa ?? 0, wl, 0); t.setXYZ(1, xb ?? 0, wl, 0); t.needsUpdate = true;
  };
  U.secDh = null;
}

const level = () => dhAt(ENV, AFMR.xc);
const ST_COLOR = { low: '#93c5fd', good: '#46d78f', warn: '#f4cf6a', alert: '#f7a766', crit: '#ff7a6b' };

function update(now, ctx) {
  awlrRiver.update(now, ctx);                                         // dimensi sensor → muka air, label sungai
  const U = ctx.model?.userData.awlr; let changed = false;
  if (U?.sec) {
    const dh = level(), vis = secOn && !document.body.classList.contains('map-mode');   // penampang hanya di tampilan logger
    if (U.secDh === null || Math.abs(dh - U.secDh) > 0.002) { U.secDh = dh; U.setSection(RIVER.water + dh); changed = true; }
    if (U.sec.visible !== vis) { U.sec.visible = vis; changed = true; }
  }
  if (ui && now - ui.t > 200) { ui.t = now; ui.sync(); }
  return changed ? 'redraw' : false;
}

// ---------- Panel: status, penampang sungai (SVG), bacaan muka air, kecepatan & debit ----------
const TESTS = [['Surut', -0.4], ['Normal', 0], ['Siaga', 0.72], ['Banjir', 1.35]];
const ROWS = [['tma', 'Tinggi muka air'], ['dMax', 'Kedalaman maks'], ['B', 'Lebar muka air'], ['A', 'Luas penampang basah'],
  ['vs', 'Kecepatan permukaan (sensor)'], ['v', 'Kecepatan rata-rata'], ['Q', 'Debit'], ['read', 'Pembacaan level']];
function panel(el, { params, flyTo, invalidate }) {
  const td = 'style="text-align:right;font-weight:600"';
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span>Status muka air</span><output id="afSt" style="font-weight:700"></output></div>
    <svg id="afSvg" viewBox="0 0 320 150" style="width:100%;height:auto;display:block;background:rgba(255,255,255,.03);border-radius:8px"></svg>
    <div id="afCap" style="color:var(--muted);font-size:11px;margin:4px 0 10px"></div>
    <table id="afTab" style="width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;margin-bottom:12px">
      ${ROWS.map(([k, t]) => `<tr><td>${t}</td><td data-k="${k}" ${td}></td></tr>`).join('')}
    </table>
    <div style="color:var(--muted);margin-bottom:6px">Uji muka air (manual)</div>
    <div id="afTests" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:6px">${TESTS.map(([t, v]) => `<button type="button" data-v="${v}">${t}</button>`).join('')}</div>
    <div class="btn-row" style="margin-bottom:10px"><button type="button" id="afAuto">Otomatis dari hujan</button></div>
    <label class="switch" style="margin-bottom:10px">Penampang di 3D <input type="checkbox" id="afSec3d"></label>
    <div class="btn-row"><button type="button" id="afLook">Lihat sensor</button><button type="button" id="afLookSec">Lihat penampang</button></div>
    <p class="note" style="margin:10px 0 0">Debit = luas penampang basah × kecepatan rata-rata (k ${HYD.k} × kecepatan permukaan). Kecepatan disimulasikan
      dengan rumus Manning (n ${HYD.n}, kemiringan ${HYD.S}) — perkiraan.</p>`;
  const $ = s => el.querySelector(s), tests = [...$('#afTests').children];
  const o = Object.fromEntries(['afSt', 'afSvg', 'afCap', 'afTab', 'afAuto', 'afSec3d'].map(k => [k, $('#' + k)]));
  for (const b of tests) b.addEventListener('click', () => { ENV.auto = false; ENV.manual = +b.dataset.v; ENV.storm = null; sync(); });
  o.afAuto.addEventListener('click', () => { ENV.auto = true; sync(); });
  o.afSec3d.checked = secOn;
  o.afSec3d.addEventListener('change', () => { secOn = o.afSec3d.checked; invalidate(); });
  const yb = armLevels(params.encY).yb, xS = xBracket(), yT = sensorTop(params.encY);
  $('#afLook').addEventListener('click', () => flyTo([xS - 0.5, yb - 0.06, 0.3], [xS, yb - 0.17, -0.02], 1300));   // dari sisi darat-hilir
  $('#afLookSec').addEventListener('click', () => flyTo([AFMR.dP - 0.5, 1.5, 12], [AFMR.dP - 0.5, -0.3, 0], 1300));   // dari hilir, memandang penampang

  // Penampang (SVG): x lokal SEC.x0..x1 → 10..310, y −1,9..2,4 m → 140..10 (skala tegak dibesarkan)
  const P = section(), Y0 = -1.9, Y1 = 2.4, kx = 300 / (SEC.x1 - SEC.x0), ky = 130 / (Y1 - Y0);
  const X = x => (10 + (x - SEC.x0) * kx).toFixed(1), Yp = y => (10 + (Y1 - y) * ky).toFixed(1);
  const bedPts = P.map(([x, y]) => `${X(x)},${Yp(y)}`).join(' ');
  o.afSvg.innerHTML = `
    <polygon points="${X(SEC.x0)},${Yp(Y0)} ${bedPts} ${X(SEC.x1)},${Yp(Y0)}" fill="#6b5a43" opacity=".85"/>
    <polygon id="afW" fill="#3cb4f2" opacity=".55"/><line id="afWl" stroke="#7fd3ff" stroke-width="1.2"/>
    <polyline points="${bedPts}" fill="none" stroke="#ffd166" stroke-width="1.2"/>
    <line x1="${X(0)}" y1="${Yp(0)}" x2="${X(0)}" y2="${Yp(Y1 + 1)}" stroke="#2f6fe0" stroke-width="3"/>
    <line x1="${X(0)}" y1="${Yp(yb)}" x2="${X(SLEEVE.R + ARM_AF.bottom)}" y2="${Yp(yb)}" stroke="#2f6fe0" stroke-width="2"/>
    <rect x="${(+X(xS) - 4).toFixed(1)}" y="${Yp(yT)}" width="8" height="${(HRF.H * ky).toFixed(1)}" fill="#c9ccce"/>
    <line id="afBeam" x1="${X(xS)}" y1="${Yp(yT - HRF.H)}" x2="${X(xS)}" stroke="#ffd166" stroke-dasharray="3 3"/>
    <text x="${X(0) - 4}" y="${Yp(Y1) + 9}" fill="#9aa8bd" font-size="9" text-anchor="end">tiang</text>
    <text x="${+X(xS) + 7}" y="${+Yp(yT) + 6}" fill="#dfe6ef" font-size="9">HRF600S</text>
    <text id="afWt" fill="#bfe8ff" font-size="9"></text>`;
  o.afCap.textContent = `Penampang sungai tepat di bawah lengan (dari tiang ke seberang, ${(SEC.x1 - SEC.x0).toFixed(1)} m) · skala tegak ×${(ky / kx).toFixed(1)}`;
  const W = { poly: $('#afW'), line: $('#afWl'), beam: $('#afBeam'), text: $('#afWt') };
  const fmt = { tma: v => `${v.toFixed(2)} mdpl`, dMax: v => `${v.toFixed(2)} m`, B: v => `${v.toFixed(2)} m`, A: v => `${v.toFixed(2)} m²`,
    vs: v => `${v.toFixed(2)} m/s`, v: v => `${v.toFixed(2)} m/s`, Q: v => `${v.toFixed(2)} m³/s`, read: v => `${v.toFixed(2)} m` };
  function sync() {
    if (!o.afSt.isConnected) return;                                          // panel sudah diganti seri lain
    const dh = level(), S = STATUS[levelStatus(dh)], F = flow(dh), wl = F.wl;
    o.afSt.textContent = S.label; o.afSt.style.color = ST_COLOR[S.st];
    const R = { ...F, tma: MDPL0 + SITES.afmr.y + wl, read: yBotNow - wl };
    for (const [k] of ROWS) o.afTab.querySelector(`[data-k="${k}"]`).textContent = fmt[k](R[k]);
    let xa = null, xb = null;
    W.poly.setAttribute('points', P.map(([x, y]) => `${X(x)},${Yp(Math.min(y, wl))}`).join(' ') + ` ${X(SEC.x1)},${Yp(wl)} ${X(SEC.x0)},${Yp(wl)}`);
    for (const [x, y] of P) if (y < wl) { xa ??= x; xb = x; }
    W.line.setAttribute('x1', X(xa ?? 0)); W.line.setAttribute('x2', X(xb ?? 0)); W.line.setAttribute('y1', Yp(wl)); W.line.setAttribute('y2', Yp(wl));
    W.beam.setAttribute('y2', Yp(wl));
    W.text.setAttribute('x', X((xb ?? SEC.x1) - 0.2)); W.text.setAttribute('y', +Yp(wl) - 4); W.text.setAttribute('text-anchor', 'end');
    W.text.textContent = `muka air · Q ${F.Q.toFixed(2)} m³/s`;
    for (const b of tests) { const on = !ENV.auto && Math.abs(ENV.manual - +b.dataset.v) < 0.005; b.style.borderColor = on ? 'var(--accent)' : ''; b.style.color = on ? 'var(--accent)' : ''; }
    o.afAuto.style.borderColor = ENV.auto ? 'var(--accent)' : ''; o.afAuto.style.color = ENV.auto ? 'var(--accent)' : '';
  }
  ui = { sync, t: 0 };
  sync();
}

// Explode: 3 klem dilepas (digeser ke samping), sadel + support + sensor diturunkan dari pipa, lalu kabel sensor dilepas
const explode = {
  steps: [{ key: 'sensor', before: 'cable', w: 8, label: 'kendurkan 3 clamp, support + sensor diturunkan' }, ...awlrRiver.explode.steps.filter(s => s.key !== 'sensor')],
  apply(model, seg, t) {
    awlrRiver.explode.apply(model, seg, t);
    const U = model.userData.awlr, eDn = seg('sensor', 0.35, 1);
    U.hrfBands.position.z = 0.12 * seg('sensor', 0, 0.4);
    U.hrf.position.y = -0.3 * eDn;
    U.hrfCable.position.set(0.3 * seg('cable', 0.44, 1), -0.18 * seg('cable', 0, 0.44) - 0.3 * eDn, 0);
  },
};

const G = 'AFMR Sungai';
const parts = {
  ...Object.fromEntries(Object.entries(awlrRiver.parts).filter(([k]) => k !== 'river' && k !== 'awlrSensor').map(([k, P]) => [k, { ...P, group: G }])),
  awlrArm: { name: 'Lengan Sensor', group: G, specs: () => [
    ['Material', `Pipa Ø${(ARM.pipeR * 2000).toFixed(1)} mm (perkiraan), cat biru`],
    ['Rangka', `Pipa atas ${ARM_AF.top * 1000} mm, bawah ${ARM_AF.bottom * 1000} mm (lengan AWLR + 2 m), celah 100 mm`],
    ['Pipa tegak', `${ARM_AF.posts.length} buah, jarak 1000 mm`],
    ['Pangkal', 'Dilas ke pipa sleeve'],
    ['Ujung', 'Pipa ditutup plat; bracket clamp sensor ± 50 mm dari ujung pipa bawah'],
  ]},
  hrf600s: { name: 'Radar Flow Meter HRF600S (Host)', group: G, specs: () => [
    ['Merek / varian', 'Holykell HRF600S, plastic joint'],
    ['Ukuran', '160 × 100 × 89,9 mm (badan 83,2 + lensa)'],
    ['Level', 'Radar 80 GHz, lensa di muka bawah'],
    ['Kecepatan', 'Radar 24 GHz di muka miring (kecepatan permukaan), menghadap ke hulu (asumsi)'],
    ['Debit', 'Luas penampang basah × kecepatan rata-rata'],
    ['Pasang', 'Sumbu panjang searah arus, digantung bracket clamp + support; waterpass di muka atas'],
    ['Tinggi ke muka air', `${(yBotNow - RIVER.water - level()).toFixed(2)} m dari lensa (saat ini)`],
    ['Kabel', 'Plastic joint → conduit hitam → konektor SP21 di box'],
  ]},
  hrfClamp: { name: 'Clamp', group: G, specs: () => [
    ['Tipe', '3 klem cincin (sekrup cacing) stainless, sesuai foto'],
    ['Mengikat', 'Sadel bracket ke pipa bawah lengan, ± 50 mm dari ujung'],
    ['Ukuran', `Lebar ${BR.band * 1000} mm, jarak ${(BR.bands[1] - BR.bands[0]) * 1000} mm (perkiraan)`],
  ]},
  hrfSupport: { name: 'Support', group: G, specs: () => [
    ['Bentuk', 'Sadel + yoke atas + badan + yoke bawah + rel, sesuai foto'],
    ['Engsel', 'Baut atas sejajar pipa, baut pivot bawah tegak lurus pipa (atur kemiringan 2 arah)'],
    ['Tinggi', `± ${BR.drop * 1000} mm dari bawah sadel ke muka atas sensor (perkiraan dari foto)`],
  ]},
  hrfBase: { name: 'Plat Dasar Support', group: G, specs: () => [
    ['Pasang', '4 baut M5 + ring ke lubang ulir muka atas sensor'],
    ['Pola', '85 × 85 mm (gambar sensor)'],
    ['Ukuran plat', '100 × 100 × 5 mm (perkiraan)'],
  ]},
  riverAfmr: { name: 'Sungai & Penampang', group: G, specs: () => { const F = flow(level()); return [
    ['Letak', `± ${Math.round(AFMR.xc - AWLR_POS.x)} m di hulu stasiun AWLR (diorama)`],
    ['Penampang', `Di bawah lengan, dari tiang ke seberang (${(SEC.x1 - SEC.x0).toFixed(1)} m, profil medan diorama)`],
    ['Lebar muka air', `${F.B.toFixed(2)} m (saat ini)`],
    ['Luas basah', `${F.A.toFixed(2)} m² (saat ini)`],
    ['Hidrolis', `Manning n ${HYD.n}, kemiringan ${HYD.S}, k ${HYD.k} (perkiraan)`],
  ]; } },
};

export const afmr = {
  station: awlrRiver.station,
  encYMax: awlrRiver.encYMax, pvBulge: awlrRiver.pvBulge,
  extend, panel, parts, update, explode,
  mapStatus: () => STATUS[levelStatus(level())].st,
  views: awlrRiver.views,
};
// Dimuat lewat products.js: definisi siap setelah geometri STL sensor terbaca
export const ready = loadSensor().then(() => afmr);
