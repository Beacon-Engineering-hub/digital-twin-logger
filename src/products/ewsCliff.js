import * as THREE from 'three';
import { groundTexture } from '../nature.js';
import { CLIFF, EWS_U, WX, fbm, profile, worldColor, worldHeight, worldInfo, zCrest } from '../world.js';

// Medan sisi tebing dunia bersama (world.js); kerangka lokal EWS = kerangka dunia.
// Stasiun di punggung tebing (y = 0), tepi tebing ± 4 m di depan tiang (+z): gawir batuan, teras, lereng tanah ± 38°
// (5 titik rawan longsor), kaki lereng, lembah dengan jalan desa. Grid di ruang (x, u): u = jarak mendatar dari tepi tebing
// ke +z → muka lereng tetap rapat. Kolom x (WX) & baris terakhir (u = U_SPLIT) sama dengan grid sisi sungai → menyambung.
export { CLIFF, fbm, profile, zCrest };
export const smooth = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);
export const groundY = (x, u) => worldHeight(x, zCrest(x) + u);                // tinggi asli di (x, u)

// ---------- Medan longsor (ekstrem) ----------
// zone = { x0, a, u0, u1 }: pusat & setengah lebar (arah x), batas atas & bawah massa (arah u).
// Massa tanah MELUNCUR MENGIKUTI PERMUKAAN lereng sejauh run × A (tiap titik pindah ke u + du lalu duduk di permukaan
// asli di sana): kepala longsor terbuka jadi gawir dalam, massa menyusut/terputar ke belakang (sag), ujungnya menabrak
// kaki lereng & lembah lalu menimbun (pile) hingga menutup jalan desa. du menyusut perlahan di depan massa
// (gradien > −1) sehingga permukaan tidak pernah terlipat; timbunan melebar ke samping mengikuti jarak luncur.
export const SLIDE = { run: 9, drop: 2.2, pile: 1.7 };
const reach = A => 2 * SLIDE.run * A + 4;                                      // panjang zona dorong di depan massa
export function slideField(z, x, u, A) {
  if (A <= 0) return null;
  const half = (z.u1 - z.u0) / 2, mid = (z.u0 + z.u1) / 2, v = (u - mid) / half, uF = mid + half, Lt = reach(A);
  if (v < -1.3 || u > uF + Lt + 0.5) return null;
  const spread = 1 + 0.45 * A * smooth(u, uF - 2, uF + Lt), w = (x - z.x0) / (z.a * spread);   // ujung melebar
  if (Math.abs(w) > 1.3) return null;
  const mw = 1 - smooth(Math.abs(w), 0.3, 1.25), head = smooth(v, -1.2, -0.5), front = 1 - smooth(u, uF, uF + Lt);
  const du = SLIDE.run * A * head * front;
  const sag = -SLIDE.drop * head * (1 - smooth(v, -0.9, 1.4));                  // massa terputar & turun di belakang
  const pile = SLIDE.pile * Math.exp(-(((u - (uF + 0.4 * Lt)) / (0.35 * Lt)) ** 2)) * (1 - smooth(u, uF + 0.8 * Lt, uF + Lt));   // timbunan rombakan di depan
  const rough = 0.35 * (fbm(x * 0.6, u * 0.6 + 4, 3) - 0.5) * head * front;     // gumpalan tanah
  const fresh = mw * Math.min(1, head * (1 - smooth(v, -0.6, -0.1)) + 0.75 * head * front + 0.6 * pile / SLIDE.pile);
  return { du: du * mw, dy: A * (sag + pile + rough) * mw, fresh: Math.min(1, A * 3) * fresh };
}
// Jumlah medan beberapa zona sekaligus: list = [{ zone, A }]
export function slideSum(list, x, u) {
  let du = 0, dy = 0, fresh = 0, any = false;
  for (const { zone, A } of list ?? []) { const f = slideField(zone, x, u, A); if (f) { du += f.du; dy += f.dy; fresh += f.fresh; any = true; } }
  return any ? { du, dy, fresh: Math.min(1, fresh) } : null;
}
// Posisi permukaan (dunia) di (x, u) setelah longsor: titik pindah ke u + du dan duduk di permukaan asli di sana (+ dy)
export function surfacePoint(x, u, list, out = new THREE.Vector3()) {
  const f = slideSum(list, x, u), un = u + (f ? f.du : 0);
  return out.set(x, groundY(x, un) + (f ? f.dy : 0), zCrest(x) + un);
}

// Membangun mesh medan. Mengembalikan { mesh, deform(list), sample, perimeter } — deform hanya menghitung ulang kotak zona.
export function buildTerrain() {
  const xs = WX, us = EWS_U;
  const nx = xs.length, nu = us.length, N = nx * nu;
  const pos = new Float32Array(N * 3), nrm = new Float32Array(N * 3), col = new Float32Array(N * 3), uv = new Float32Array(N * 2);
  const baseY = new Float32Array(N), zc = xs.map(zCrest), info = [];
  const s = [0];                                                               // panjang busur profil (UV tanpa regangan)
  for (let j = 1; j < nu; j++) s[j] = s[j - 1] + Math.hypot(us[j] - us[j - 1], profile(us[j]) - profile(us[j - 1]));
  for (let j = 0; j < nu; j++) for (let i = 0; i < nx; i++) {
    const v = j * nx + i, I = worldInfo(xs[i], zc[i] + us[j]);
    baseY[v] = I.y; info[v] = I; pos.set([xs[i], I.y, zc[i] + us[j]], v * 3); uv.set([xs[i] / 4, s[j] / 4], v * 2);
  }
  const idx = new Uint32Array((nx - 1) * (nu - 1) * 6);
  let q = 0;
  for (let j = 0; j < nu - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, e = c + 1;
    idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = e;
  }
  // Normal dari beda tengah grid: n = T_u × T_x
  const ta = new THREE.Vector3(), tb = new THREE.Vector3(), nn = new THREE.Vector3();
  const P = (v, o) => o.fromArray(pos, v * 3);
  function normals(i0, i1, j0, j1) {
    const A = new THREE.Vector3(), B = new THREE.Vector3();
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const iL = Math.max(0, i - 1), iR = Math.min(nx - 1, i + 1), jD = Math.max(0, j - 1), jU = Math.min(nu - 1, j + 1);
      P(j * nx + iR, A); P(j * nx + iL, B); tb.subVectors(A, B);
      P(jU * nx + i, A); P(jD * nx + i, B); ta.subVectors(A, B);
      nn.crossVectors(ta, tb).normalize().toArray(nrm, (j * nx + i) * 3);
    }
  }
  const c = new THREE.Color();
  function colors(i0, i1, j0, j1, freshOf) {
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const v = j * nx + i;
      worldColor(c, xs[i], zc[i] + us[j], baseY[v], 1 - nrm[v * 3 + 1], info[v], freshOf ? freshOf(xs[i], us[j]) : 0);
      col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
    }
  }
  normals(0, nx - 1, 0, nu - 1);
  colors(0, nx - 1, 0, nu - 1);

  const g = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3), aNrm = new THREE.BufferAttribute(nrm, 3), aCol = new THREE.BufferAttribute(col, 3);
  for (const a of [aPos, aNrm, aCol]) a.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', aPos); g.setAttribute('normal', aNrm); g.setAttribute('color', aCol);
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, map: groundTexture(1), roughness: 0.97 }));
  m.receiveShadow = true; m.userData.isGround = true;

  // Kotak indeks gabungan semua zona yang bergerak (plus 1 baris tepi untuk normal)
  const findI = (arr, val) => { let k = 0; while (k < arr.length - 1 && arr[k + 1] < val) k++; return k; };
  const rectOf = (z, A) => {
    const half = (z.u1 - z.u0) / 2, mid = (z.u0 + z.u1) / 2, wx = z.a * 1.35 * (1 + 0.45 * A);
    return { i0: Math.max(0, findI(xs, z.x0 - wx) - 1), i1: Math.min(nx - 1, findI(xs, z.x0 + wx) + 2),
             j0: Math.max(0, findI(us, mid - half * 1.35) - 1), j1: Math.min(nu - 1, findI(us, mid + half + reach(A) + 0.6) + 2) };
  };
  // Tinggi asli di kolom i pada u sembarang (interpolasi grid, cepat) — tempat titik yang meluncur mendarat
  const baseAt = (i, u) => {
    let j = findJ(u); const t = THREE.MathUtils.clamp((u - us[j]) / (us[j + 1] - us[j]), 0, 1);
    return baseY[j * nx + i] * (1 - t) + baseY[(j + 1) * nx + i] * t;
  };
  const findJ = u => { let lo = 0, hi = nu - 2; while (lo < hi) { const m2 = (lo + hi + 1) >> 1; if (us[m2] <= u) lo = m2; else hi = m2 - 1; } return lo; };
  const union = (a, b) => (!a ? b : !b ? a : { i0: Math.min(a.i0, b.i0), i1: Math.max(a.i1, b.i1), j0: Math.min(a.j0, b.j0), j1: Math.max(a.j1, b.j1) });
  let last = null;
  function deform(list) {
    const act = (list ?? []).filter(e => e.A > 0);
    let now = null; for (const e of act) now = union(now, rectOf(e.zone, e.A));
    const R = union(now, last);
    if (!R) return;
    for (let j = R.j0; j <= R.j1; j++) for (let i = R.i0; i <= R.i1; i++) {
      const v = j * nx + i, f = act.length ? slideSum(act, xs[i], us[j]) : null;
      if (f) { const un = us[j] + f.du; pos[v * 3 + 1] = baseAt(i, un) + f.dy; pos[v * 3 + 2] = zc[i] + un; }
      else { pos[v * 3 + 1] = baseY[v]; pos[v * 3 + 2] = zc[i] + us[j]; }
    }
    normals(R.i0, R.i1, R.j0, R.j1);
    colors(R.i0, R.i1, R.j0, R.j1, act.length ? (x, u) => slideSum(act, x, u)?.fresh ?? 0 : null);
    last = now;
    aPos.needsUpdate = aNrm.needsUpdate = aCol.needsUpdate = true;
  }
  // Titik tepat di permukaan mesh (ikut bentuk setelah longsor) pada koordinat grid (x, u), + normal segitiganya
  const bsearch = (arr, v) => { let lo = 0, hi = arr.length - 2; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (arr[mid] <= v) lo = mid; else hi = mid - 1; } return lo; };
  const Q = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  function sample(x, u, outP, outN) {
    const i = bsearch(xs, x), j = bsearch(us, u);
    const fx = THREE.MathUtils.clamp((x - xs[i]) / (xs[i + 1] - xs[i]), 0, 1), fu = THREE.MathUtils.clamp((u - us[j]) / (us[j + 1] - us[j]), 0, 1);
    const a = j * nx + i, b = a + 1, c2 = a + nx, e = c2 + 1;
    if (fx + fu <= 1) {                                   // segitiga a–c–b
      P(a, Q[0]); P(b, Q[1]).sub(Q[0]); P(c2, Q[2]).sub(Q[0]);
      outP.copy(Q[0]).addScaledVector(Q[1], fx).addScaledVector(Q[2], fu);
      outN?.crossVectors(Q[2], Q[1]).normalize();
    } else {                                              // segitiga b–c–e
      P(e, Q[0]); P(c2, Q[1]).sub(Q[0]); P(b, Q[2]).sub(Q[0]);
      outP.copy(Q[0]).addScaledVector(Q[1], 1 - fx).addScaledVector(Q[2], 1 - fu);
      outN?.crossVectors(Q[2], Q[1]).normalize();       // (−T_u) × (−T_x) = T_u × T_x, tetap ke atas
    }
    return outP;
  }
  // Tepi grid (dunia), berurutan melingkar — awal cincin perbukitan
  function perimeter(st = 3) {
    const out = [], W = (i, j) => new THREE.Vector3().fromArray(pos, (j * nx + i) * 3);
    for (let i = 0; i < nx - 1; i += st) out.push(W(i, 0));
    for (let j = 0; j < nu - 1; j += st) out.push(W(nx - 1, j));
    for (let i = nx - 1; i > 0; i -= st) out.push(W(i, nu - 1));
    for (let j = nu - 1; j > 0; j -= st) out.push(W(0, j));
    return out;
  }
  return { mesh: m, deform, sample, perimeter };
}
