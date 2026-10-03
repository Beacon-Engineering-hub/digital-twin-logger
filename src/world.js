import * as THREE from 'three';
import { makeRiver } from './river.js';
import { buildClouds, buildRing, buildTrees, groundTexture, placeSpots } from './nature.js';
import { makeSawah } from './sawah.js';
import { buildFlood } from './flood.js';
import { BANK, ENV, VN_H0, vnQ } from './env.js';

// ============================================================================================================
// Dunia digital twin bersama (satuan m). Peta kawasan & setiap tampilan per logger memakai dunia yang SAMA —
// tampilan per logger hanyalah potongan dunia di sekitar stasiunnya, jadi saat titik di peta diklik tampilannya menyambung.
// Kerangka dunia = kerangka lokal EWS Longsor (stasiun EWS di titik asal, +z ke arah lembah):
//   - punggung bukit (y = 0) dengan tebing menghadap +z: gawir batuan, teras, lereng tanah ± 38°, kaki lereng, lembah (−10,7)
//   - sungai AWLR mengalir di lembah sejajar tebing (penampang persis tampilan AWLR Sungai), jalan desa di antara keduanya
//   - ARR & AWR di punggung bukit, AWLR Sumur Pantau di lembah seberang sungai
//   - sawah beririgasi di seberang sungai: pintu air mengambil air sungai AWLR → saluran primer → petak (sawah.js);
//     V-Notch berdiri di tepi saluran primer
//   - perbukitan berhutan makin tinggi menjauh, lembah sungai berlanjut di antaranya
// Letak & bentuk kawasan = diorama skematis (karangan), bukan data lokasi.
// Muka air sungai, genangan banjir (flood.js), saluran sawah & V-Notch, awan dan laju arus mengikuti env.js (setEnv).
// ============================================================================================================
const smooth = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b), lerp = THREE.MathUtils.lerp, V3 = THREE.Vector3;

// ---------- Noise (sama persis dengan medan EWS lama) ----------
function hash(i, j) { let h = (i * 374761393 + j * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
export function noise(x, y, P = 0) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const w = k => (P ? ((k % P) + P) % P : k);
  const a = hash(w(i), w(j)), b = hash(w(i + 1), w(j)), c = hash(w(i), w(j + 1)), e = hash(w(i + 1), w(j + 1));
  return a + (b - a) * u + (c - a) * v + (a - b - c + e) * u * v;
}
export const fbm = (x, y, oct = 4, P = 0) => { let s = 0, a = 0.5, f = 1; for (let o = 0; o < oct; o++) { s += a * noise(x * f, y * f, P * f); f *= 2; a *= 0.5; } return s / (1 - 0.5 ** oct); };

// ---------- Tebing (EWS): profil lereng kubik monoton, garis tepi berkelok ----------
export const CLIFF = { crest: 4, drop: 10.7 };
const PROF = [[-1, 0], [0, -0.05], [0.5, -0.4], [1.5, -2.4], [2.4, -4.2], [3.2, -4.8], [5, -6.2], [8, -8.6], [10.5, -10.1], [12.5, -10.6], [15, -10.7]];
const PM = (() => {
  const n = PROF.length, h = [], d = [], m = new Array(n).fill(0);
  for (let k = 0; k < n - 1; k++) { h[k] = PROF[k + 1][0] - PROF[k][0]; d[k] = (PROF[k + 1][1] - PROF[k][1]) / h[k]; }
  for (let k = 1; k < n - 1; k++) { if (d[k - 1] * d[k] <= 0) continue; const w1 = 2 * h[k] + h[k - 1], w2 = h[k] + 2 * h[k - 1]; m[k] = (w1 + w2) / (w1 / d[k - 1] + w2 / d[k]); }
  return { h, m };
})();
export function profile(u) {
  const P = PROF, n = P.length;
  if (u <= P[0][0]) return P[0][1];
  if (u >= P[n - 1][0]) return P[n - 1][1];
  let k = 0; while (u > P[k + 1][0]) k++;
  const h = PM.h[k], t = (u - P[k][0]) / h, t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * P[k][1] + (t3 - 2 * t2 + t) * h * PM.m[k] + (-2 * t3 + 3 * t2) * P[k + 1][1] + (t3 - t2) * h * PM.m[k + 1];
}
export const zCrestS = x => CLIFF.crest + 0.0011 * x * x;                     // garis tepi halus (tanpa kelok)
export const zCrest = x => zCrestS(x) + 3.2 * (fbm(x * 0.04 + 7.3, 1.7, 3) - 0.5) * smooth(Math.abs(x), 14, 34);
export const gully = (x, u) => { const g = 1 - Math.abs(2 * noise(x * 0.3 + 1.3, u * 0.07) - 1); return g * g * g * g; };
export const masks = u => ({
  scarp: smooth(u, 0.15, 0.6) * (1 - smooth(u, 2.5, 3.3)),
  slope: smooth(u, 2.9, 3.8) * (1 - smooth(u, 10, 12)),
  toe: smooth(u, 9.5, 11) * (1 - smooth(u, 14, 18)),
});
function cliffGround(x, u) {                               // (x, u = jarak mendatar dari tepi tebing) → tinggi
  let y = profile(u);
  const M = masks(u);
  if (M.scarp > 0) {
    const rib = 1 - Math.abs(2 * noise(x * 0.45 + 4.1, u * 0.12) - 1);
    y += M.scarp * (0.55 * (rib * rib - 0.4) + 0.35 * (fbm(x * 0.9, y * 0.9 + 3.1) - 0.5) * 2 + 0.16 * Math.sin(y * 2.4 + 2 * fbm(x * 0.2, 0.5)));
  }
  y += M.slope * (-0.4 * gully(x, u) + 0.1 * (fbm(x * 1.1, u * 1.1 + 5) - 0.5) * 2);
  y += M.toe * 0.35 * (fbm(x * 0.5 + 9, u * 0.5) - 0.5) * 2;
  if (u < -1.5) { const r = Math.hypot(x, zCrest(x) + u); y += 0.5 * (fbm(x * 0.05, u * 0.05 + 11, 3) - 0.5) * 2 * smooth(r, 12, 30) * smooth(-u, 1.5, 5); }
  if (u > 15) y += 0.6 * (fbm(x * 0.04 + 3, u * 0.04, 3) - 0.5) * 2 * smooth(u, 16, 30);
  return y;
}

// ---------- Titik rawan longsor EWS (x, u) + jalur kabel bus (untuk menjaga area bebas pohon) ----------
export const EWS_SENSORS = [
  { id: 'T1', x: -9, u: 5.0 }, { id: 'T2', x: -4.5, u: 6.8 }, { id: 'T3', x: 0.5, u: 4.6 },
  { id: 'T4', x: 5, u: 7.2 }, { id: 'T5', x: 9.5, u: 5.4 },
].map(s => ({ ...s, zone: { x0: s.x, a: 2.4, u0: s.u - 1.6, u1: s.u + 3.6 } }));
const EWS_CABLE = (() => {
  const P = [[0.08, -3.37], [-2.5, -2.3], [-7.8, -0.9], [-8.6, 1.2], [-9.1, 3.0], [-9.19, 5.0]], segs = [];
  for (let k = 1; k < P.length; k++) segs.push([P[k - 1], P[k]]);
  for (let k = 0; k < EWS_SENSORS.length - 1; k++) { const a = EWS_SENSORS[k], b = EWS_SENSORS[k + 1]; segs.push([[a.x + 0.19, a.u], [b.x - 0.19, b.u]]); }
  return segs;
})();
export const ROAD = { u: 24, w: 4 };                    // jalan desa di lembah (jarak dari tepi tebing)

// ---------- Sungai AWLR: kerangka lokal AWLR (stasiun di titik asal, +x ke sungai, arus menuju +z) ----------
export const RIVER = { width: 6, bankX: 1.5, water: -0.9, bed: -1.6, slope: 0.3 };
// Elevasi diorama untuk bacaan Tinggi Muka Air (mdpl): y dunia 0 (punggung tebing EWS) = MDPL0. Contoh — ganti dari data survei.
export const MDPL0 = 125;
const XC = RIVER.bankX + RIVER.slope * -RIVER.water + RIVER.width / 2;          // sumbu alur dari stasiun AWLR
const RF = { x: 30, dr: 62 };                                                  // stasiun AWLR di x dunia 30, sungai ± 62 m dari tepi tebing
export const AWLR_POS = { x: RF.x, y: -CLIFF.drop, z: zCrestS(RF.x) + RF.dr - XC };
export const toA = (wx, wz) => [wz - AWLR_POS.z, RF.x - wx];                   // dunia → lokal AWLR [x, z]
export const fromA = (xl, zl) => [RF.x - zl, AWLR_POS.z + xl];                 // lokal AWLR → dunia [x, z]
const awayA = zl => smooth(Math.abs(zl), 18, 60);
export const riverCenter = zl => XC + awayA(zl) * (zCrestS(RF.x - zl) - zCrestS(RF.x) + 4 * Math.sin(zl / 41) + 2 * Math.sin(zl / 17 + 1.3));
const riverHalfW = zl => RIVER.width / 2 + 1.6 * (Math.sin(zl / 23 + 0.7) * 0.5 + 0.5) * awayA(zl);
export const zRiver = wx => AWLR_POS.z + riverCenter(RF.x - wx);              // z dunia sumbu sungai
// Muka air sungai sedikit miring ke hilir (0,7 ‰, dibatasi): tepat RIVER.water di stasiun AWLR, sedikit lebih tinggi di pintu
// pengambilan sawah (hulu) & lebih rendah di muara saluran limpasan (hilir)
const RS = 0.007, riverLevelL = zl => RIVER.water - RS * THREE.MathUtils.clamp(zl, -60, 150);
export const riverAt = wx => AWLR_POS.y + riverLevelL(RF.x - wx);           // y dunia muka air sungai di x dunia
export const SAWAH = makeSawah({ zRiver, halfW: wx => riverHalfW(RF.x - wx), riverAt });

// ---------- Stasiun di tebing sungai sisi bukit pada x dunia xc: lengan sensor tegak lurus alur, muka krangkeng menghadap ke hilir.
// Tiang ± 1 m di belakang puncak tebing sungai (lereng 1 : 1,1 di atas air); pad diratakan 0,9 m di atas muka air normal seperti
// tebing di AWLR (bacaan sensor & ambang sama). Letak = diorama (karangan). ----------
function bankSite(xc) {
  const zl = RF.x - xc, hw = riverHalfW(zl), e = 0.5;
  const dz = (zRiver(xc + e) - zRiver(xc - e)) / (2 * e), len = Math.hypot(dz, 1), nx = -dz / len, nz = 1 / len;   // normal tepi → sumbu
  const dP = hw + BANK * 0.91 + 1.0;                                              // jarak tiang dari sumbu alur
  return { xc, hw, dP, x: xc - nx * dP, z: zRiver(xc) - nz * dP, rot: Math.atan2(-1, -dz), water: riverAt(xc) };
}
// EWS Banjir di hulu (± 290 m ke hulu dari AWLR, titik pilihan user); horn & lampu ikut menghadap ke hilir
export const HULU = bankSite(320);
// AFMR (± 128 m ke hulu dari AWLR, titik pilihan user): monopole + lengan AWLR diperpanjang + radar flow meter HRF600S
export const AFMR = bankSite(158);
// Muka air sungai (m dari normal) di x dunia: hilir AWLR = dh, hulu EWS Banjir = dhUp, di antaranya gelombang banjir menjalar
const riverK = wx => THREE.MathUtils.clamp((wx - RF.x) / (HULU.xc - RF.x), 0, 1);
export const dhAt = (E, wx) => E.dh + (E.dhUp - E.dh) * riverK(wx);
ENV.kIntake = riverK(SAWAH.intakeX);

// ---------- Letak stasiun (dunia) ----------
export const SITES = {
  'ews-longsor': { x: 0, z: 0, rot: 0 },
  'awlr-sungai': { x: AWLR_POS.x, z: AWLR_POS.z, rot: -Math.PI / 2, h: 4, flat: [14, 40] },
  // ARR di ujung saluran primer / pangkal saluran tersier sawah (titik pilihan user), di luar dinding saluran; muka krangkeng
  // menghadap hamparan sawah (−z). Tanah koridor saluran di sini sudah datar (sawah.js carve).
  'arr': (() => { const T = SAWAH.tertiaryHead, x = T.xEnd - 0.5; return { x, z: zRiver(x) + T.dOuter + 1.8, rot: Math.PI, clear: 5 }; })(),
  'awr': { x: 112, z: -104, rot: 2.4, clear: 20, hill: [52, 6], flat: [6, 16] },
  'awlr-sumur': { x: 76, z: zRiver(76) + 32, rot: 0.6, clear: 14, flat: [8, 24] },
  'vnotch': { ...SAWAH.vnotchSpot, clear: 6 },
  'ews-banjir': { x: HULU.x, z: HULU.z, rot: HULU.rot, h: 4, flat: [9, 26], clear: 12, pad: HULU.water + BANK },
  'afmr': { x: AFMR.x, z: AFMR.z, rot: AFMR.rot, h: 4, flat: [9, 26], clear: 12, pad: AFMR.water + BANK },
};
SITES['awlr-sumur'].well = [SITES['awlr-sumur'].x + 2, SITES['awlr-sumur'].z];
const segDist = (x, z, [x0, z0], [x1, z1]) => {
  const dx = x1 - x0, dz = z1 - z0, t = THREE.MathUtils.clamp(((x - x0) * dx + (z - z0) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return Math.hypot(x - x0 - t * dx, z - z0 - t * dz);
};

// ---------- Tinggi dasar: tebing + bukit AWR + perataan di stasiun + hamparan sawah & saluran + perbukitan jauh ----------
const hillOf = (x, z, s) => { if (!s.hill) return 0; const d = Math.hypot(x - s.x, z - s.z) / s.hill[0]; return d < 1 ? s.hill[1] * (1 - d * d) ** 2 : 0; };
for (const s of Object.values(SITES)) if (s.flat) s.level = s.pad ?? profile(s.z - zCrest(s.x)) + hillOf(s.x, s.z, s);
function base(wx, wz) {
  const u = wz - zCrest(wx);
  let y = cliffGround(wx, u);
  for (const s of Object.values(SITES)) {
    y += hillOf(wx, wz, s);
    if (s.flat) { const d = Math.hypot(wx - s.x, wz - s.z); if (d < s.flat[1]) y = lerp(s.level, y, smooth(d, s.flat[0], s.flat[1])); }
  }
  y = SAWAH.carve(y, wx, wz);                                                   // petak sawah, koridor saluran, pintu air
  const r = Math.hypot(wx, wz - 40), far = smooth(r, 380, 1000);
  if (far > 0) {                                                                // bukit rendah & landai jauh di cakrawala (kesan dekat permukiman)
    const ridge = 1 - Math.abs(2 * fbm(wx * 0.003 + 3, wz * 0.003, 3) - 1);
    y += far * 28 * (0.55 * fbm(wx * 0.0015, wz * 0.0015 + 9, 3) + 0.45 * ridge * ridge) * smooth(Math.abs(wz - zRiver(wx)), 30, 200);
  }
  return y;
}
export const RV = makeRiver({
  center: riverCenter, halfW: riverHalfW, level: riverLevelL, depth: RIVER.water - RIVER.bed, sBelow: 1 / RIVER.slope,
  sAbove: zl => lerp(1 / RIVER.slope, 1.1, awayA(zl)),
  land: (xl, zl) => { const [wx, wz] = fromA(xl, zl); return base(wx, wz) - AWLR_POS.y; },
});
export function worldInfo(wx, wz) {
  const [xl, zl] = toA(wx, wz), I = RV.info(xl, zl);
  return { y: AWLR_POS.y + I.y, bank: I.bank, wl: AWLR_POS.y + I.wl, d: I.d, hw: I.hw };
}
export const worldHeight = (wx, wz) => worldInfo(wx, wz).y;
for (const s of Object.values(SITES)) s.y = worldHeight(s.x, s.z);
SITES['awlr-sungai'].y = AWLR_POS.y;

// ---------- Warna tanah: rumput tropis, tanah laterit & batuan berlapis di lereng curam, pita basah di tebing sungai ----------
const C = {
  grass: new THREE.Color(0x5b7d36), grass2: new THREE.Color(0x46662b), dry: new THREE.Color(0x8a8c4f),
  soil: new THREE.Color(0x9a6b49), soil2: new THREE.Color(0x7a5840), rock: new THREE.Color(0x877259), rock2: new THREE.Color(0x5b4b3c),
  fresh: new THREE.Color(0xa8704a), mud: new THREE.Color(0x4f4232),
};
const _cg = new THREE.Color(), _cr = new THREE.Color(), _t = new THREE.Color();
export function worldColor(c, wx, wz, y, slope, I, fresh = 0) {
  const u = wz - zCrest(wx), M = masks(u), patch = fbm(wx * 0.3 + 2, u * 0.3, 3);
  c.copy(C.soil).lerp(C.soil2, fbm(wx * 0.6, u * 0.6 + 7, 3));
  const band = 0.5 + 0.5 * Math.sin(y * 2.6 + 3 * fbm(wx * 0.25, y * 0.5));
  _cr.copy(C.rock).lerp(C.rock2, band * 0.75 + 0.25 * fbm(wx * 1.3, y * 1.3 + 5, 3));
  const rockW = smooth(slope, 0.3, 0.46) * (1 - smooth(y, -1.3, -0.6)) * (I?.bank ? 0 : 1);
  c.lerp(_cr, rockW);
  _cg.copy(C.grass).lerp(C.grass2, fbm(wx * 0.12 + 3, u * 0.12, 3)).lerp(C.dry, 0.35 * smooth(patch, 0.55, 0.8));
  c.lerp(_cg, THREE.MathUtils.clamp((1 - smooth(slope, 0.08, 0.33)) * (0.55 + 0.9 * patch), 0, 1) * (1 - rockW));
  c.multiplyScalar(1 - 0.18 * gully(wx, u) * M.slope);
  if (I?.bank) {                                                                // referensi groundColor: lumpur basah → pasir kering
    const above = y - I.wl, mix = (R, G, B, k) => { _t.setRGB(R, G, B, THREE.SRGBColorSpace); c.lerp(_t, k); };
    if (above < 0.12) mix(0.36, 0.33, 0.25, 1);
    else if (above < 0.55) mix(0.63, 0.57, 0.44, 1 - smooth(above, 0.3, 0.55));
    else mix(0.4, 0.5, 0.26, 0.5);
    if (above < -0.05) mix(0.3, 0.28, 0.22, smooth(-above, 0.05, 0.4));
  }
  if (fresh > 0) c.lerp(C.fresh, fresh);
  if (SAWAH.inPlot(wx, wz)) c.lerp(C.mud, 0.85);                               // lumpur di dasar petak
  return c;
}

// ---------- Pohon dunia (ditempatkan sekali) ----------
function treeFree(x, z, rad) {
  const u = z - zCrest(x);
  if (Math.hypot(x, u + 4) < 7 + rad) return false;                             // stasiun EWS
  if (u > -2.2 && u < 3.2) return false;                                        // tepi & gawir tebing
  for (const s of EWS_SENSORS) { const q = s.zone, w = q.a * 1.9 + 1 + rad; if (x > q.x0 - w && x < q.x0 + w && u > q.u0 - 1.5 && u < q.u1 + 24) return false; }   // jalur luncur longsor
  for (const [a, b] of EWS_CABLE) if (segDist(x, u, a, b) < 1.4 + rad) return false;
  if (Math.abs(u - ROAD.u) < ROAD.w / 2 + 0.8 + rad) return false;
  if (x > -4 && x < 24 && u > 11 && u < 25) return false;                        // kamera Iso EWS ke lereng
  if (x > 2 && x < 38 && u > 18 && u < 50) return false;                         // kamera "Lihat lembah" EWS
  const I = worldInfo(x, z); if (I.bank || I.d < I.hw + 4.5 + rad) return false; // sungai & tebing sungai
  const [xl, zl] = toA(x, z); if (xl > -14 && xl < 1.8 && zl > 1.5 && zl < 32) return false;   // kamera Iso AWLR
  for (const id of ['ews-banjir', 'afmr']) {                                    // kamera EWS Banjir & AFMR (dari hilir, sisi darat)
    const H = SITES[id], dx = x - H.x, dz = z - H.z, c = Math.cos(H.rot), sn = Math.sin(H.rot), lx = dx * c - dz * sn, lz = dx * sn + dz * c;
    if (lx > -11 && lx < 3 && lz > 0 && lz < 18) return false;
  }
  for (const s of Object.values(SITES)) if (Math.hypot(x - s.x, z - s.z) < (s.clear ?? 9) + rad) return false;
  if (SAWAH.dist(x, z) < 1.5 + rad) return false;                               // sawah, saluran, pintu air
  return true;
}
// Di dekat stasiun rimbun; menjauh jadi lahan terbuka (sawah / tegalan) dengan kelompok pohon — tidak terkesan hutan terpencil
const woods = (x, z) => { const r = Math.hypot(x - 15, z - 30); return r < 150 || fbm(x * 0.012 + 40, z * 0.012, 3) > 0.46 + 0.14 * smooth(r, 150, 420); };
let TREES = null;
export function worldTrees() {
  TREES ??= placeSpots({
    free: treeFree, seed: 20260928,
    areas: [
      { kind: 'tree', n: 2200, box: [-440, 440, -440, 440], h: [6, 13], rad: 2.4, free: woods },
      { kind: 'far', n: 1400, box: [-440, 440, -440, 440], h: [7, 12], rad: 2.4, free: woods },
      { kind: 'pine', n: 120, box: [-440, 440, -440, -150], h: [8, 13], rad: 2.4, free: woods },
      { kind: 'bamboo', n: 150, box: [-300, 300, -300, 300], h: [6, 9], rad: 1.8 },
      { kind: 'palm', n: 60, box: [-260, 260, -60, 140], h: [6, 9], rad: 1.6, free: (x, z) => Math.abs(z - zCrest(x) - ROAD.u) < 8 },
      { kind: 'palm', n: 45, box: [-120, 70, 70, 240], h: [7, 10], rad: 1.6, free: SAWAH.edge },          // kelapa di tepi sawah
      { kind: 'shrub', n: 1400, box: [-260, 260, -260, 260], h: [0.6, 1.4], rad: 0.9 },
    ],
  });
  return TREES;
}
export const worldAt = (x, z) => new V3(x, worldHeight(x, z), z);

// ---------- Grid medan bersama ----------
// Jarak titik tumbuh linear dari pita rapat terdekat: bands = [[a, b, step]].
export function march(lo, hi, bands, grow = 0.07, maxStep = 4) {
  const stepAt = x => Math.min(maxStep, ...bands.map(([a, b, s]) => s + Math.max(0, a - x, x - b) * grow));
  const v = [lo]; for (let x = lo; x < hi;) { x = Math.min(hi, x + stepAt(x)); v.push(x); }
  return v;
}
// Medan dunia = 2 grid yang bertemu di satu garis sambungan di lembah (u = U_SPLIT dari tepi tebing):
//  - grid EWS (products/ewsCliff.js): kolom x dunia (WX), baris u = −180 … U_SPLIT → tebing, lereng longsor, jalan desa
//  - grid sungai AWLR (di bawah): baris = x dunia yang SAMA (WX), kolom mulai tepat di garis sambungan lalu mengikuti
//    kelokan sungai → titik sambungan kedua grid identik, jadi medan menyambung tanpa celah.
export const U_SPLIT = 34;
export const WX = march(-180, 380, [[-26, 26, 0.25], [RF.x - 12, RF.x + 12, 0.3], [RF.x - 40, RF.x + 40, 0.45], [-112, 62, 1.2],
  [HULU.x - 14, HULU.x + 14, 0.3], [AFMR.x - 14, AFMR.x + 14, 0.3]], 0.07, 4);
export const EWS_U = march(-180, U_SPLIT, [[-6, 17, 0.15]], 0.07, 4);
const RIVER_U = march(-16, 200, [[-14, 14, 0.2], [12, 118, 1.2]], 0.07, 4), SEAM_K = 14;     // kolom relatif sumbu sungai + kolom peralihan
function buildRiverSide() {
  const nz = WX.length, nu = SEAM_K + RIVER_U.length, N = nu * nz;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), uv = new Float32Array(N * 2), inf = [];
  for (let j = 0; j < nz; j++) {
    const wx = WX[j], zl = RF.x - wx, c = riverCenter(zl), xs = zCrest(wx) + U_SPLIT - AWLR_POS.z;   // xs = garis sambungan (lokal AWLR)
    for (let i = 0; i < nu; i++) {
      const xl = i < SEAM_K ? xs + (c + RIVER_U[0] - xs) * i / SEAM_K : c + RIVER_U[i - SEAM_K];
      const wz = AWLR_POS.z + xl, I = worldInfo(wx, wz), v = j * nu + i;
      pos.set([wx, I.y, wz], v * 3); uv.set([wx / 4, wz / 4], v * 2); inf[v] = I;
    }
  }
  const idx = new Uint32Array((nu - 1) * (nz - 1) * 6); let q = 0;
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nu - 1; i++) {           // i → +z, j → +x : urutan (a, b, c) agar menghadap atas
    const a = j * nu + i, b = a + 1, c = a + nu, e = c + 1; idx[q++] = a; idx[q++] = b; idx[q++] = c; idx[q++] = b; idx[q++] = e; idx[q++] = c;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals();
  const n = g.attributes.normal, cc = new THREE.Color();
  for (let v = 0; v < N; v++) { worldColor(cc, pos[v * 3], pos[v * 3 + 2], pos[v * 3 + 1], 1 - n.getY(v), inf[v]); col.set([cc.r, cc.g, cc.b], v * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, map: groundTexture(1), roughness: 0.97 }));
  m.receiveShadow = true; m.userData.isGround = true;
  const P = (i, j) => new V3(pos[(j * nu + i) * 3], pos[(j * nu + i) * 3 + 1], pos[(j * nu + i) * 3 + 2]);
  return { mesh: m, nu, nz, P };
}
// Tepi luar gabungan kedua grid (berurutan melingkar) → awal cincin perbukitan
function outerPerimeter(R, st = 3) {
  const E = (x, u) => { const z = zCrest(x) + u; return new V3(x, worldHeight(x, z), z); }, out = [], nx = WX.length, ne = EWS_U.length;
  for (let i = 0; i < nx - 1; i += st) out.push(E(WX[i], EWS_U[0]));             // utara (punggung bukit), x naik
  for (let j = 0; j < ne - 1; j += st) out.push(E(WX[nx - 1], EWS_U[j]));        // timur (grid EWS) sampai sambungan
  for (let i = 0; i < R.nu - 1; i += st) out.push(R.P(i, R.nz - 1));              // timur (grid sungai) ke selatan
  for (let j = R.nz - 1; j > 0; j -= st) out.push(R.P(R.nu - 1, j));             // selatan, x turun
  for (let i = R.nu - 1; i > 0; i -= st) out.push(R.P(i, 0));                    // barat (grid sungai) ke sambungan
  for (let j = ne - 1; j > 0; j -= st) out.push(E(WX[0], EWS_U[j]));             // barat (grid EWS) ke utara
  return out;
}

// ---------- Jalan, sumur ----------
function buildRoad(x0, x1) {
  const g = new THREE.Group(), strip = (pts, idx, color, off) => {
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: off })); m.receiveShadow = true; g.add(m);
  };
  const at = (x, du) => { const z = zCrest(x) + ROAD.u + du; return [x, worldHeight(x, z), z]; };
  const pos = [], idx = [];
  for (let x = x0, i = 0; x <= x1; x++, i++) {
    for (const s of [-1, 1]) { const p = at(x, s * ROAD.w / 2); pos.push(p[0], p[1] + 0.04, p[2]); }
    if (x + 1 <= x1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  strip(pos, idx, 0x55534f, -2);
  const mk = [], mi = [];
  for (let x = x0 + 2, i = 0; x < x1 - 3; x += 6, i++) {
    for (const [dx, du] of [[0, -0.06], [3, -0.06], [0, 0.06], [3, 0.06]]) { const p = at(x + dx, du); mk.push(p[0], p[1] + 0.05, p[2]); }
    const a = i * 4; mi.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  strip(mk, mi, 0xe8e2cf, -4);
  return g;
}
function buildWell() {
  const [x, z] = SITES['awlr-sumur'].well, y = worldHeight(x, z), g = new THREE.Group(); g.position.set(x, y, z);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.65, 0.8, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xbdb9ae, roughness: 0.9, side: THREE.DoubleSide }));
  ring.position.y = 0.3; ring.castShadow = true; g.add(ring);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 24), new THREE.MeshStandardMaterial({ color: 0x5d6368, metalness: 0.6, roughness: 0.4 }));
  cap.position.y = 0.72; g.add(cap);
  return g;
}

// ============================================================================================================
// Dunia utuh (satu kali, koordinat dunia): medan sisi sungai, cincin perbukitan dari tepi luar gabungan, air sungai +
// batu + pasangan batu di stasiun AWLR, jalan desa, sawah + pintu air + saluran, sumur, pohon, awan. Medan sisi tebing (bisa longsor)
// milik model EWS (products/ewsCliff.js) & menyambung tepat di garis U_SPLIT. Semua stasiun = model lengkap di SITES.
// ============================================================================================================
export function buildWorld() {
  const root = new THREE.Group(); root.name = 'world';
  const R = buildRiverSide(); root.add(R.mesh);
  root.add(buildRing(outerPerimeter(R), worldHeight, new V3(20, 0, 30)));
  const riverG = new THREE.Group();                                             // kerangka lokal AWLR
  riverG.position.set(AWLR_POS.x, AWLR_POS.y, AWLR_POS.z); riverG.rotation.y = -Math.PI / 2; root.add(riverG);
  const water = RV.buildWater({ z0: -1500, z1: 1500, fine: [RF.x - WX.at(-1) - 10, 260], foam: 0.2 });   // pita rapat sampai ujung hulu grid
  riverG.add(water, RV.rocks({ z0: -90, z1: 90, avoid: (x, z) => Math.abs(z) < 5 && x < XC }), RV.riprap({ z0: -14, z1: 14, side: -1 }));
  const sawah = SAWAH.build();
  root.add(buildRoad(WX[0], Math.floor(WX.at(-1))), sawah.group, buildWell());
  root.add(buildTrees(worldTrees(), worldAt));
  const clouds = buildClouds(); root.add(clouds);
  const flood = buildFlood({ zRiver, riverAt, xDown: RF.x, xUp: HULU.xc }); root.add(flood.mesh);
  const flows = [...water.userData.flow, ...sawah.flows, ...flood.flows];
  // Laju arus per kelompok (env.js): sungai makin deras saat naik & lambat saat surut; saluran ikut pintu pengambilan
  const mul = { river: 1, canal: 1, spill: 1, flood: 1 }, Q0 = vnQ(VN_H0);
  const cloudC = new THREE.Color(), _w = new THREE.Color();
  return {
    group: root, heightAt: worldHeight,
    update(dt) { for (const f of flows) { const k = mul[f.g] ?? 1; f.tex.offset.y -= f.v * k * dt; if (f.u) f.tex.offset.x += f.u * k * dt; } },   // arus, riak & buih
    // E = ENV (env.js), sky = pipeline.state (siang/malam, warna cakrawala), dt = detik nyata
    setEnv(E, sky, dt) {
      const rainK = THREE.MathUtils.clamp(E.rainVis / 30, 0, 1);
      water.userData.setLevel(E.dh, rainK, { dh: E.dhUp, z: RF.x - HULU.xc });      // lokal AWLR: z = RF.x − x dunia
      const reach = flood.update(E.dh, E.dhUp, BANK, dt);
      sawah.setWater(E, Q0, wx => dhAt(E, wx));
      const dm = Math.max(E.dh, E.dhUp);
      mul.river = dm < 0 ? THREE.MathUtils.clamp(1 + dm / 0.7, 0.25, 1) : 1 + 1.3 * dm;
      mul.canal = THREE.MathUtils.clamp(E.qLag, 0, 1.6); mul.spill = THREE.MathUtils.clamp(Math.sqrt(E.Q / Q0), 0, 2.2);
      // awan: putih siang, kemerahan saat cakrawala keemasan, gelap kebiruan malam, kelabu saat mendung
      cloudC.setScalar(0.22 + 0.78 * sky.day).lerp(_w.copy(sky.hor).multiplyScalar(1.1), 0.35).lerp(_w.setRGB(0.42, 0.44, 0.47).multiplyScalar(0.3 + 0.7 * sky.day), 0.75 * E.cloud);
      for (const sp of clouds.children) { sp.material.color.copy(cloudC); sp.material.opacity = 0.8 + 0.2 * E.cloud; }
      return { reach };
    },
  };
}
