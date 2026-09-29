import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, waterNormalTexture } from './nature.js';
import { foamTexture } from './river.js';

// ============================================================================================================
// Sawah beririgasi di seberang sungai AWLR (pemandangan diorama, BUKAN komponen produk; letak, ukuran & jumlah petak = karangan):
//  - bangunan pengambilan di tepi seberang, sedikit di hulu stasiun AWLR: 2 pintu sorong baja (stang ulir + roda pemutar)
//    di antara tembok pangkal & pilar beton, lantai jembatan + sandaran, tembok sayap → air sungai masuk ke saluran primer
//  - saluran primer pasangan beton menembus tanggul, menyusuri sisi hulu lalu sisi jauh hamparan dan berakhir di pintu
//    sadap saluran tersier (muka air turun pelan)
//  - pintu sadap kecil + saluran tersier pendek ke petak terdekat; dari situ air turun petak demi petak menuju sungai
//  - satu saluran tersier panjang di tengah hamparan (x = XV) membagi air ke petak kiri-kanan lewat pipa sadap; ujungnya
//    berbelok ke hilir menjadi saluran limpasan (pembuang) yang menembus tanggul & terjun ke sungai. Bangunan ukur V-Notch
//    di saluran limpasan: kolam penenang → pelat ambang tajam V 90° (terjunan bebas); stasiun V-Notch di samping kolam
//  - petak bertingkat tipis dibatasi pematang, fase tanam bercampur: baru tandur, muda, hijau, menguning, bera (habis panen)
// Kerangka (x, d): x = x dunia, d = jarak dari sumbu sungai ke arah seberang (z = zRiver(x) + d) → pematang memanjang
// mengikuti kelokan sungai. Sungai sedikit miring (world.js): muka air saluran < sungai di pintu pengambilan, muka air
// limpasan > sungai di muara pembuang → air mengalir secara gravitasi.
// Air saluran, kolam V-Notch, pancaran lewat takik & terjunan muara naik-turun mengikuti simulasi lingkungan (env.js → setWater).
// ============================================================================================================
const smooth = THREE.MathUtils.smoothstep, lerp = THREE.MathUtils.lerp, clamp = THREE.MathUtils.clamp;

const X0 = -100, X1 = 46, BANDS = [16, 37, 59.5, 82, 104];         // hamparan petak (x) & batas jalur petak (d)
const XV = -20, VG = 1.0;                                           // saluran tersier di x = XV (jalur 2 m di antara petak)
const XA = 54, DB = 110, RF = 7, XT = XV - 1.4;                     // saluran primer: kaki hulu x = XA, kaki jauh d = DB, belokan, ujung
const CW = 1.4, TH = 0.15, SLOPE = 0.0004;                          // lebar dalam, tebal dinding, turun muka air per m
const TS = 0.0008, VH = 0.1;                                        // turun muka air tersier per m; tinggi air di atas dasar takik V

export function makeSawah({ zRiver, halfW, riverAt }) {
  const RL = riverAt(XA), DG = halfW(XA) + 2.6;                     // muka air sungai di pintu pengambilan; muka tembok pintu (d)
  const W0 = RL - 0.06, BAY = RL - 0.65;                           // muka air saluran di pintu; lantai kolam depan pintu
  const LA = DB - RF - DG, LF = Math.PI * RF / 2;
  const sOf = (x, d) => {                                           // jarak sepanjang saluran dari pintu (titik terdekat, kira-kira)
    if (x >= XA - RF && d <= DB - RF) return clamp(d - DG, 0, LA);
    if (x < XA - RF) return LA + LF + (XA - RF - x);
    return LA + RF * clamp(Math.atan2(d - (DB - RF), x - (XA - RF)), 0, Math.PI / 2);
  };
  const cw = s => W0 - SLOPE * s;                                   // muka air saluran
  const ground = (x, d) => cw(sOf(x, d)) - 0.3;                     // tanah di koridor saluran & sela petak

  // ---------- Saluran tersier (x = XV): q = jarak dari muka luar dinding saluran primer (d = Q0), ruas lurus sampai d = DT ----------
  const Q0 = DB - CW / 2 - TH - 0.02, DT = BANDS[0] - 0.8, QT = Q0 - DT, TWH = 0.25, TWT = 0.08, G0 = 0.3;
  const TW0 = cw(sOf(XV, DB)) - 0.03, tw = q => TW0 - TS * q;
  function stripY(x, d) {                                            // medan jalur tersier (null = di luar jalur)
    if (Math.abs(x - XV) > VG || d > Q0 + 0.05 || d < DT - 0.3) return null;
    const q = Q0 - d;
    return Math.abs(x - XV) < TWH + TWT ? tw(q) - 0.23 : Math.min(ground(x, d), tw(q) + 0.02);
  }

  // ---------- Saluran limpasan: belok ke hilir → pengarah → kolam V-Notch → pelat V → saluran pembuang → terjun ke sungai ----------
  // p = jarak sepanjang jalur dari ujung ruas lurus tersier (dunia)
  const RT = [], PH1 = Math.atan2(-0.34, -0.94), UX = Math.cos(PH1), UZ = Math.sin(PH1);   // arah ruas lurus: ke hilir, mendekati sungai
  {
    let X = XV, Z = zRiver(XV) + DT, p = 0, ph = -Math.PI / 2;
    const NB = 7, RB = 2.2, dl = RB * Math.abs(PH1 - ph) / NB;
    RT.push({ X, Z, p });
    for (let i = 1; i <= NB; i++) { const f = lerp(ph, PH1, (i - 0.5) / NB); X += Math.cos(f) * dl; Z += Math.sin(f) * dl; p += dl; RT.push({ X, Z, p }); }
  }
  const PB = RT.at(-1).p, PP0 = PB + 0.3, PP1 = PP0 + 3;                // kolam penenang PP0…PP1, pelat V di PP1
  const BE = { ...RT.at(-1) }, onLine = p => ({ X: BE.X + UX * (p - PB), Z: BE.Z + UZ * (p - PB) });   // ruas lurus dari ujung belokan
  let PE = PP1 + 1;
  for (; PE < PP1 + 60; PE += 0.25) { const P = onLine(PE); if (P.Z - zRiver(P.X) < halfW(P.X) + 0.4) break; }   // muara di tepi air
  for (const q of [PP0, PP1, PE]) RT.push({ ...onLine(q), p: q });
  const PWV = tw(QT) - TS * PP0, NY = PWV - VH, DW0 = NY - 0.06;       // muka air kolam, dasar takik, muka air hilir pelat
  const sw = p => (p < PP0 ? tw(QT) - TS * p : p < PP1 ? PWV : DW0 - 0.002 * (p - PP1));
  const SB = RT.reduce((b, P) => [Math.min(b[0], P.X), Math.max(b[1], P.X), Math.min(b[2], P.Z), Math.max(b[3], P.Z)], [1e9, -1e9, 1e9, -1e9]);
  function spillNear(x, z) {                                         // titik jalur terdekat → { e: jarak samping, p }
    let best = null;
    for (let i = 0; i < RT.length - 1; i++) {
      const A = RT[i], B = RT[i + 1], dx = B.X - A.X, dz = B.Z - A.Z, t = clamp(((x - A.X) * dx + (z - A.Z) * dz) / (dx * dx + dz * dz), 0, 1);
      const e = Math.hypot(x - A.X - t * dx, z - A.Z - t * dz);
      if (!best || e < best.e) best = { e, p: lerp(A.p, B.p, t) };
    }
    return best;
  }
  const isPool = p => p >= PP0 - 0.2 && p <= PP1 + 0.2, FLAT = p => (isPool(p) ? 3 : 1.2), RAMP = 2.5;
  function spillY(y, x, z) {                                         // lantai saluran di dalam dinding, berm datar di sisinya
    if (x < SB[0] - 6 || x > SB[1] + 6 || z < SB[2] - 6 || z > SB[3] + 6) return y;
    const { e, p } = spillNear(x, z), fl = FLAT(p);
    if (e > fl + RAMP) return y;
    const pool = isPool(p), inner = pool ? VN.half + 0.02 : TWH + 0.02,   // lantai digali sampai tepat lewat muka dalam dinding
    bed = pool ? NY - 0.33 : sw(p) - 0.23;
    const tgt = e < inner ? bed : Math.min(ground(x, z - zRiver(x)), sw(p) + 0.02);
    return lerp(tgt, y, smooth(e, fl, fl + RAMP));
  }
  const spillDist = (x, z) => { if (x < SB[0] - 8 || x > SB[1] + 8 || z < SB[2] - 8 || z > SB[3] + 8) return 99; const n = spillNear(x, z); return n.e - FLAT(n.p); };

  // ---------- Petak (seeded) ----------
  const r = rng(551), plots = [], byBand = [[], [], [], []], splits = [];
  const STATES = [['tandur', 0.14], ['muda', 0.22], ['hijau', 0.4], ['kuning', 0.13], ['bera', 0.11]];
  const pick = () => { let t = r(); for (const [s, w] of STATES) if ((t -= w) < 0) return s; return 'hijau'; };
  for (let k = 0; k < 4; k++) {
    let prev = null;
    for (const [lo, hi] of [[XV + VG, X1], [X0, XV - VG]]) {         // dua sisi jalur tersier
      let x = hi, w = 8 + r() * 14;
      while (x > lo + 0.5) {
        let xa = Math.max(lo, x - w); if (xa - lo < 9) xa = lo;
        const st = prev && r() < 0.35 ? prev : pick(); prev = st;
        const P = { k, x0: xa, x1: x, d0: BANDS[k], d1: BANDS[k + 1], state: st,
          level: cw(sOf((x + xa) / 2, DB)) - 0.14 - 0.05 * (3 - k) };   // di bawah muka air tersier; jalur terjauh paling tinggi
        if (r() < 0.3 && x - xa > 14) {                               // sebagian petak dibelah pematang memanjang
          const dm = lerp(P.d0, P.d1, 0.4 + r() * 0.2);
          const a = { ...P, d1: dm }, b = { ...P, d0: dm, state: r() < 0.5 ? st : pick() };
          plots.push(a, b); byBand[k].push(a, b); splits.push({ d: dm, x0: xa, x1: x });
        } else { plots.push(P); byBand[k].push(P); }
        x = xa; w = 16 + r() * 11;
      }
    }
  }
  function plotAt(x, d) {
    if (x < X0 || x > X1 || d < BANDS[0] || d > BANDS[4]) return null;
    let k = 0; while (k < 3 && d > BANDS[k + 1]) k++;
    for (const p of byBand[k]) if (x >= p.x0 && x <= p.x1 && d >= p.d0 && d <= p.d1) return p;
    return null;
  }

  // ---------- Medan: hamparan diturunkan & didatarkan per petak, koridor saluran, potongan tanggul, kolam depan pintu ----------
  const RECTS = [
    { x0: X0 - 2, x1: XA + 2.6, d0: 15, d1: BANDS[4] + 1.5, rw: 6 },  // hamparan petak
    { x0: XT - 1.2, x1: XA + 2.6, d0: BANDS[4], d1: DB + 4.5, rw: 6 }, // koridor saluran primer (berakhir di pintu sadap tersier)
    { x0: XA - 2.6, x1: XA + 2.6, d0: DG, d1: 16, rw: 3 },           // saluran menembus tanggul sungai
    { x0: XA - 3.2, x1: XA + 3.2, d0: -2, d1: DG, rw: 2.2 },         // kolam depan pintu (lantai di bawah muka air sungai)
  ];
  const rectDist = (R, x, d) => Math.hypot(Math.max(R.x0 - x, 0, x - R.x1), Math.max(R.d0 - d, 0, d - R.d1));
  const near = (x, d) => x > X0 - 16 && x < XA + 14 && d > -4 && d < DB + 16;
  function carve(y, x, z) {
    const d = z - zRiver(x);
    if (!near(x, d)) return y;
    let f = 1; for (const R of RECTS) f = Math.min(f, smooth(rectDist(R, x, d), 0, R.rw));
    let yb = y;
    if (f < 1) { const p = plotAt(x, d), tgt = stripY(x, d) ?? (p ? p.level - 0.12 : lerp(BAY, ground(x, d), smooth(d, DG - 0.5, DG + 0.5))); yb = lerp(tgt, y, f); }
    return Math.min(yb, spillY(y, x, z));                           // gabungan cekungan hamparan & alur limpasan
  }
  const dist = (x, z) => { const d = z - zRiver(x); return near(x, d) ? Math.min(spillDist(x, z), ...RECTS.map(R => rectDist(R, x, d))) : 99; };
  const inPlot = (x, z) => { const d = z - zRiver(x); return d > BANDS[0] && d < BANDS[4] && x > X0 && x < X1 && !!plotAt(x, d); };
  const edge = (x, z) => { const d = z - zRiver(x), e = dist(x, z); return e > 4 && e < 10 && d > 40; };   // tepi luar (pohon kelapa)
  // Stasiun V-Notch di samping kolam (sisi sungai), sejajar bracket sensor 0,4 m di hulu pelat V (sesuai foto pemasangan).
  // VN (m, y dunia): lat = jarak sumbu tiang → sumbu kolam, half/wall = setengah lebar dalam & tebal dinding kolam
  const VN = { lat: 1.75, half: 0.6, wall: 0.12, top: NY + 0.5, water: PWV, notch: NY, toPlate: 0.4 }, VM = onLine(PP1 - VN.toPlate);
  const vnotchSpot = { x: VM.X - UZ * VN.lat, z: VM.Z + UX * VN.lat, rot: Math.atan2(UX, UZ) };   // lokal +z = arah aliran, +x = ke kolam
  const labels = [{ text: 'Sawah', x: -52, z: zRiver(-52) + 60, dy: 2 }, { text: 'Pintu air', x: XA, z: zRiver(XA) + DG, dy: 3.2 }];

  // ============================================================================================================
  function build() {
    const root = new THREE.Group(); root.name = 'sawah';
    const flows = [], at = (x, d) => [x, zRiver(x) + d];
    const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...o });
    const M = {
      conc: std(0xa29e92, { roughness: 0.92 }), concOld: std(0x86837a, { roughness: 0.95 }),
      steel: std(0x46505a, { metalness: 0.55, roughness: 0.5 }), frame: std(0x34546c, { metalness: 0.4, roughness: 0.5 }),
      yellow: std(0xd6a326, { metalness: 0.3, roughness: 0.45 }), rail: std(0xb7bcbf, { metalness: 0.6, roughness: 0.4 }),
      vplate: std(0x8e949a, { metalness: 0.6, roughness: 0.4 }), pvc: std(0x98a2a6, { roughness: 0.6 }),
    };
    // Kumpulan geometri per bahan → digabung jadi satu mesh per bahan
    const lists = new Map(), add = (mat, g) => { if (!lists.has(mat)) lists.set(mat, []); lists.get(mat).push(g); };
    const put = (mat, g, x, y, z, ry = 0) => { if (ry) g.rotateY(ry); g.translate(x, y, z); add(mat, g); };
    const box = (mat, w, h, dp, x, y, z, ry) => put(mat, new THREE.BoxGeometry(w, h, dp), x, y, z, ry);
    const cyl = (mat, rad, h, x, y, z) => put(mat, new THREE.CylinderGeometry(rad, rad, h, 10), x, y, z);
    const rod = (mat, rad, L, x, y, z, alongX = true) => { const g = new THREE.CylinderGeometry(rad, rad, L, 8).rotateZ(Math.PI / 2); put(mat, alongX ? g : g.rotateY(Math.PI / 2), x, y, z); };
    function wheel(R, x, y, z) {                                     // roda pemutar: cincin + 2 jari-jari silang + naf
      put(M.yellow, new THREE.TorusGeometry(R, R * 0.09, 8, 28).rotateX(Math.PI / 2), x, y, z);
      box(M.yellow, 2 * R, R * 0.1, R * 0.1, x, y, z); box(M.yellow, R * 0.1, R * 0.1, 2 * R, x, y, z);
      cyl(M.yellow, R * 0.2, R * 0.3, x, y, z);
    }

    // ---------- Bangunan pengambilan (sumbu saluran kaki hulu sejajar +z dunia) ----------
    const [gx, gz] = at(XA, DG), a = CW / 2, DK = RL + 1.15, FL = BAY - 0.1, SILL = W0 - 0.5;
    const L = (mat, x0, x1, y0, y1, z0, z1) => box(mat, x1 - x0, y1 - y0, z1 - z0, gx + (x0 + x1) / 2, (y0 + y1) / 2, gz + (z0 + z1) / 2);
    L(M.concOld, -3.2, 3.2, FL, BAY + 0.05, -2.6, 0.45);                          // lantai kolam depan pintu
    L(M.conc, -3.2, -a, FL, DK, -0.45, 0.45); L(M.conc, a, 3.2, FL, DK, -0.45, 0.45);   // tembok pangkal
    L(M.conc, -0.1, 0.1, FL, DK - 0.28, -0.45, 0.45);                              // pilar tengah
    L(M.conc, -a, a, FL, SILL, -0.45, 0.45);                                      // ambang
    L(M.conc, -a, a, DK - 0.28, DK, -0.45, 0.45);                                 // lantai jembatan di atas bukaan
    for (const s of [-1, 1]) {                                                     // tembok sayap melebar ke sungai
      const g = new THREE.BoxGeometry(0.3, DK - 0.3 - FL, 2.84), gp = g.attributes.position;
      for (let i = 0; i < gp.count; i++) if (gp.getY(i) > 0) gp.setY(i, gp.getY(i) - 0.95 * (0.5 - gp.getZ(i) / 2.84));   // puncak menurun ke sungai
      g.computeVertexNormals();
      put(M.conc, g, gx + s * 3.66, (DK - 0.3 + FL) / 2, gz - 1.72, s * -0.456);
    }
    const lift = 0.3, PH = 1.0;                                                     // daun pintu terangkat 30 cm
    for (const cx of [-0.4, 0.4]) {
      for (const e of [-0.33, 0.33]) L(M.frame, cx + e - 0.035, cx + e + 0.035, SILL, DK + 0.95, -0.57, -0.45);   // sponeng + tiang
      L(M.steel, cx - 0.27, cx + 0.27, SILL + lift, SILL + lift + PH, -0.54, -0.48);                              // daun pintu
      for (const h of [0.25, 0.75]) L(M.steel, cx - 0.27, cx + 0.27, SILL + lift + h * PH - 0.03, SILL + lift + h * PH + 0.03, -0.58, -0.54);   // pengaku
      L(M.yellow, cx - 0.11, cx + 0.11, DK + 1.05, DK + 1.2, -0.6, -0.42);                                       // rumah ulir
      cyl(M.steel, 0.022, DK + 1.55 - (SILL + lift + PH), gx + cx, (DK + 1.55 + SILL + lift + PH) / 2, gz - 0.51);   // stang ulir
      wheel(0.2, gx + cx, DK + 1.32, gz - 0.51);
    }
    L(M.frame, -a - 0.06, a + 0.06, DK + 0.95, DK + 1.05, -0.6, -0.42);                                          // balok atas
    const railing = (x0, x1, z) => {                                               // sandaran pipa galvanis
      const n = Math.max(1, Math.round((x1 - x0) / 0.8));
      for (let i = 0; i <= n; i++) cyl(M.rail, 0.022, 0.95, gx + lerp(x0, x1, i / n), DK + 0.475, gz + z);
      for (const h of [0.5, 0.93]) rod(M.rail, 0.02, x1 - x0, gx + (x0 + x1) / 2, DK + h, gz + z);
    };
    railing(-3.05, 3.05, 0.38); railing(-3.05, -0.9, -0.36); railing(0.9, 3.05, -0.36);

    // ---------- Saluran primer: pita beton berpenampang U mengikuti sumbu (x, d) ----------
    const path = [], pt = (x, d) => { const p = path.at(-1); path.push({ x, d, s: p ? p.s + Math.hypot(x - p.x, d - p.d) : -0.45 }); };
    pt(XA, DG - 0.45); pt(XA, DG + 0.45);
    for (let d = DG + 2.45; d < DB - RF; d += 2) pt(XA, d);
    for (let i = 0; i <= 10; i++) { const t = i / 10 * Math.PI / 2; pt(XA - RF + RF * Math.cos(t), DB - RF + RF * Math.sin(t)); }
    for (let x = XA - RF - 2; x > XT; x -= 2) pt(x, DB);
    pt(XT, DB);
    const S = path.map(p => { const [X, Z] = at(p.x, p.d); return { X, Z, s: p.s, w: cw(p.s) }; });
    S.forEach((p, i) => {                                                          // arah & sisi kanan (= sisi petak)
      const A = S[Math.max(0, i - 1)], B = S[Math.min(S.length - 1, i + 1)], tx = B.X - A.X, tz = B.Z - A.Z, l = Math.hypot(tx, tz);
      p.sx = -tz / l; p.sz = tx / l;
    });
    function ribbonGeo(samples, prof, uvS) {
      const pos = [], uv = [], idx = [];
      for (let e = 0; e < prof.length - 1; e++) {
        const base = pos.length / 3;
        samples.forEach((p, i) => {
          for (const [o, dy] of [prof[e], prof[e + 1]]) { pos.push(p.X + p.sx * o, p.w + dy, p.Z + p.sz * o); uv.push((o + dy) * uvS[0], p.s * uvS[1]); }
          if (i) { const q = base + (i - 1) * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
        });
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      return g;
    }
    const ribbon = (samples, prof, mat, uvS) => { const m = new THREE.Mesh(ribbonGeo(samples, prof, uvS), mat); m.receiveShadow = true; return m; };
    const sAt = u => {                                                              // titik sumbu saluran pada jarak u (interpolasi)
      let i = 0; while (i < S.length - 2 && S[i + 1].s < u) i++;
      const A = S[i], B = S[i + 1], t = clamp((u - A.s) / (B.s - A.s), 0, 1), sx = lerp(A.sx, B.sx, t), sz = lerp(A.sz, B.sz, t), l = Math.hypot(sx, sz);
      return { X: lerp(A.X, B.X, t), Z: lerp(A.Z, B.Z, t), s: u, w: cw(u), sx: sx / l, sz: sz / l };
    };
    // Bukaan di dinding saluran primer (sisi petak) tepat di setiap pintu sadap: dinding dipotong sampai ambang
    const openings = [{ s: sOf(XV, DB), h: TWH }];
    for (const p of byBand[3]) if (p.d1 === BANDS[4] && p.x0 > XV + VG) openings.push({ s: sOf((p.x0 + p.x1) / 2, DB), h: 0.18 });
    for (let k = 0; k < 3; k++) for (const p of byBand[k]) if (p.x1 === X1) openings.push({ s: (p.d0 + p.d1) / 2 - DG, h: 0.18 });
    openings.sort((A, B) => A.s - B.s);
    const SILL_DY = -0.42, S0 = 0.45, S1 = S.at(-1).s, cg = [];
    const walls = S.filter(p => p.s >= S0 - 0.01);
    cg.push(ribbonGeo(walls, [[-a - TH, -0.36], [-a - TH, 0.3], [-a, 0.3], [-a, -0.5], [a, -0.5]], [1, 1]));   // dinding kiri + lantai
    const rightWall = (u0, u1, top) => {
      const smp = [sAt(u0), ...S.filter(p => p.s > u0 + 0.01 && p.s < u1 - 0.01), sAt(u1)];
      cg.push(ribbonGeo(smp, [[a, -0.5], [a, top], [a + TH, top], [a + TH, -0.36]], [1, 1]));
    };
    let u = S0;
    for (const O of openings) {
      rightWall(u, O.s - O.h, 0.3); rightWall(O.s - O.h, O.s + O.h, SILL_DY); u = O.s + O.h;
      for (const sd of [-1, 1]) {                                                   // muka ujung dinding di kiri-kanan bukaan
        const P = sAt(O.s + sd * O.h), g = new THREE.BoxGeometry(TH, 0.3 - SILL_DY, 0.012).rotateY(Math.atan2(-P.sz, P.sx));
        g.translate(P.X + P.sx * (a + TH / 2) + P.sz * sd * 0.006, P.w + (0.3 + SILL_DY) / 2, P.Z + P.sz * (a + TH / 2) - P.sx * sd * 0.006);
        cg.push(g);
      }
    }
    rightWall(u, S1, 0.3);
    const canal = new THREE.Mesh(mergeGeometries(cg), M.conc);
    canal.castShadow = canal.receiveShadow = true; root.add(canal);
    const E = S.at(-1);                                                             // tembok ujung saluran
    box(M.conc, CW + 2 * TH, 0.66, 0.2, E.X + E.sz * 0.1, E.w - 0.03, E.Z - E.sx * 0.1, Math.atan2(-E.sz, E.sx));
    const wnC = waterNormalTexture(1, 1);
    const cwMat = new THREE.MeshStandardMaterial({ color: 0x55645a, normalMap: wnC, normalScale: new THREE.Vector2(0.28, 0.28), roughness: 0.1, metalness: 0.05, envMapIntensity: 0.8 });
    const canalW = [ribbon(S, [[-a, -0.02], [a, -0.02]], cwMat, [1 / CW, 1 / 3])];      // air saluran primer (+ bukaan pintu sadap)
    for (const O of openings) {
      const smp = [sAt(O.s - O.h), sAt(O.s), sAt(O.s + O.h)];
      canalW.push(ribbon(smp, [[a - 0.02, -0.025], [a + TH + 0.03, -0.025]], cwMat, [1, 1]));
    }
    root.add(...canalW);
    flows.push({ tex: wnC, v: 0.14, g: 'canal' });
    const foam = foamTexture(rng(77)); foam.repeat.set(1, 2);                        // buih di hilir pintu
    const fm = new THREE.Mesh(new THREE.PlaneGeometry(CW, 3).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff, map: foam, transparent: true, opacity: 0.5, depthWrite: false, roughness: 0.9 }));
    fm.position.set(gx, W0 - 0.008, gz + 2); fm.renderOrder = 2; root.add(fm); flows.push({ tex: foam, v: -0.35, g: 'canal' });
    const wnB = waterNormalTexture(6, 1.7);                                            // air sungai di kolam depan pintu
    const bay = new THREE.Mesh(new THREE.PlaneGeometry(10, DG - 0.45 - (halfW(XA) - 0.8)).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x5a5840, normalMap: wnB, normalScale: new THREE.Vector2(0.2, 0.2), roughness: 0.12, metalness: 0.05, envMapIntensity: 0.75,
        transparent: true, opacity: 0.96, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }));
    bay.position.set(gx, RL, zRiver(XA) + (DG - 0.45 + halfW(XA) - 0.8) / 2); bay.receiveShadow = true; root.add(bay);
    flows.push({ tex: wnB, v: 0.03, g: 'river' });
    const dyn = { canalW, fm, bay };                                                  // bagian air yang naik-turun (setWater)

    // ---------- Pintu sadap + saluran tersier ke petak terdekat ----------
    function offtake(x0, z0, x1, z1, water, gnd) {
      const dx = x1 - x0, dz = z1 - z0, Lh = Math.hypot(dx, dz), ry = Math.atan2(dx, dz), ux = dx / Lh, uz = dz / Lh, top = water + 0.14, bed = water - 0.16;
      const on = (mat, w, h, dp, lx, y, lz) => box(mat, w, h, dp, x0 + ux * lz + uz * lx, y, z0 + uz * lz - ux * lx, ry);
      for (const s of [-1, 1]) on(M.conc, 0.07, top - gnd, Lh, s * 0.215, (top + gnd) / 2, Lh / 2);
      on(M.conc, 0.36, bed - gnd, Lh, 0, (bed + gnd) / 2, Lh / 2);
      on(cwMat, 0.36, 0.02, Lh, 0, water - 0.01, Lh / 2);
      for (const s of [-1, 1]) on(M.frame, 0.05, top + 0.55 - gnd, 0.05, s * 0.23, (top + 0.55 + gnd) / 2, 0.06);
      on(M.frame, 0.52, 0.05, 0.05, 0, top + 0.53, 0.06);
      on(M.steel, 0.4, top + 0.45 - (water + 0.06), 0.03, 0, (top + 0.45 + water + 0.06) / 2, 0.02);   // daun pintu terangkat
      on(M.steel, 0.025, 0.3, 0.025, 0, top + 0.62, 0.06);
      wheel(0.1, x0 + ux * 0.06, top + 0.72, z0 + uz * 0.06);
    }
    for (const p of byBand[3]) if (p.d1 === BANDS[4] && p.x0 > XV + VG) {         // dari kaki jauh ke jalur petak terjauh
      const xm = (p.x0 + p.x1) / 2, [x0, z0] = at(xm, DB - a - TH - 0.02), [, z1] = at(xm, p.d1);
      offtake(x0, z0, xm, z1, p.level + 0.05, ground(xm, DB) - 0.02);
    }
    for (let k = 0; k < 3; k++) for (const p of byBand[k]) if (p.x1 === X1) {       // dari kaki hulu ke petak paling hulu
      const dm = (p.d0 + p.d1) / 2, [x0, z0] = at(XA - a - TH - 0.02, dm), [x1, z1] = at(X1, dm);
      offtake(x0, z0, x1, z1, p.level + 0.05, ground(XA, dm) - 0.02);
    }

    // ---------- Saluran tersier (sumbu x = XV, mengalir ke −z) ----------
    const nappeMat = new THREE.MeshStandardMaterial({ color: 0xcfdedb, transparent: true, opacity: 0.72, roughness: 0.15, envMapIntensity: 0.9, side: THREE.DoubleSide, depthWrite: false });
    {
      const zR = zRiver(XV), Z = q => zR + Q0 - q;
      const tb = (mat, xa, xb, y0, y1, q0, q1) => { const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb); box(mat, x1 - x0, y1 - y0, q1 - q0, XV + (x0 + x1) / 2, (y0 + y1) / 2, Z((q0 + q1) / 2)); };
      const gnd = q => Math.min(ground(XV, Q0 - q), tw(q) + 0.02) - 0.03;
      const piece = (q0, q1) => {                                              // dinding kiri-kanan + lantai + air
        const w = tw((q0 + q1) / 2), bed = w - 0.2, top = w + 0.18, y0 = Math.min(gnd((q0 + q1) / 2), bed) - 0.05;
        for (const sd of [-1, 1]) tb(M.conc, sd * TWH, sd * (TWH + TWT), y0, top, q0, q1);
        tb(M.conc, -TWH, TWH, bed - 0.08, bed, q0, q1);
        tb(cwMat, -TWH, TWH, w - 0.02, w, q0, q1);
      };
      for (let q = 0; q < QT - 0.01; q = Math.min(QT, q + (q < G0 ? G0 : 3))) piece(q, Math.min(QT, q + (q < G0 ? G0 : 3)));
      // Pintu sadap tersier di dinding saluran primer (daun pintu terangkat → terbuka)
      const topT = TW0 + 0.18;
      for (const sd of [-1, 1]) tb(M.frame, sd * 0.28, sd * 0.33, gnd(0) - 0.05, topT + 0.6, 0, 0.06);
      tb(M.frame, -0.33, 0.33, topT + 0.55, topT + 0.6, 0, 0.06);
      tb(M.steel, -0.28, 0.28, TW0 + 0.06, topT + 0.5, 0.01, 0.04);
      tb(M.steel, -0.013, 0.013, topT + 0.5, topT + 0.92, 0.02, 0.045);
      wheel(0.12, XV, topT + 0.82, Z(0.03));
      // Pipa sadap ke petak di kiri-kanan saluran tersier
      for (const p of plots) {
        const sd = p.x0 === XV + VG ? 1 : p.x1 === XV - VG ? -1 : 0; if (!sd) continue;
        const q = Q0 - (p.d0 + p.d1) / 2, L2 = VG + 0.45 - 0.3;
        rod(M.pvc, 0.055, L2, XV + sd * (0.3 + L2 / 2), tw(q) - 0.07, Z(q));
      }
    }

    // ---------- Saluran limpasan + bangunan ukur V-Notch → terjun ke sungai ----------
    {
      const ry = Math.atan2(UX, UZ), AX = UZ, AZ = -UX;                     // sumbu lokal: z = arah aliran, x = melintang
      const pos = p => {                                                     // titik jalur pada jarak p
        if (p > PB) return onLine(p);
        let i = 0; while (i < RT.length - 2 && RT[i + 1].p < p) i++;
        const A = RT[i], B = RT[i + 1], t = clamp((p - A.p) / (B.p - A.p), 0, 1);
        return { X: lerp(A.X, B.X, t), Z: lerp(A.Z, B.Z, t) };
      };
      const smp = p => {                                                     // sampel pita: posisi, muka air, sisi kanan
        const P = pos(p), P0 = pos(Math.max(0, p - 0.05)), P1 = pos(p + 0.05), tx = P1.X - P0.X, tz = P1.Z - P0.Z, l = Math.hypot(tx, tz) || 1;
        return { X: P.X, Z: P.Z, s: p, w: sw(p), sx: -tz / l, sz: tx / l };
      };
      const U = (h, t, top, bed, ob) => [[-h - t, ob], [-h - t, top], [-h, top], [-h, bed], [h, bed], [h, top], [h + t, top], [h + t, ob]];
      const run = (p0, p1, prof, n, wFix) => {                              // wFix: muka air tetap (kolam datar)
        const out = []; for (let i = 0; i <= n; i++) { const q = smp(lerp(p0, p1, i / n)); if (wFix !== undefined) q.w = wFix; out.push(q); }
        return ribbonGeo(out, prof, [1, 1]);
      };
      const cgS = [], wS = [];
      cgS.push(run(0, PP0, U(TWH, TWT, 0.18, -0.2, -0.32), 10));                   // belokan + pengarah
      wS.push(run(0, PP0, [[-TWH, -0.02], [TWH, -0.02]], 10));
      const bedP = NY - 0.3 - PWV;
      const PW0 = PP1 - 0.15;                                                   // muka hulu dinding takik (tebal 15 cm)
      cgS.push(run(PP0, PW0, U(VN.half, VN.wall, VN.top - PWV, bedP, bedP - 0.1), 1, PWV));   // kolam penenang datar (lebar dalam 1,2 m)
      wS.push(run(PP0, PW0, [[-VN.half, -0.02], [VN.half, -0.02]], 1, PWV));
      const nD = Math.max(2, Math.ceil((PE - PP1) / 1.5));
      cgS.push(run(PP1, PE, U(TWH, TWT, 0.18, -0.2, -0.75), nD));                 // saluran pembuang ke sungai (dinding tertanam dalam)
      const wDown = run(PP1, PE, [[-TWH, -0.02], [TWH, -0.02]], nD);
      const at3 = (p, lx) => { const P = pos(p); return [P.X + AX * lx, P.Z + AZ * lx]; };
      const onP = (mat, w, h, dp, p, lx, y) => { const [x, z] = at3(p, lx); box(mat, w, h, dp, x, y, z, ry); };
      const wIn = VN.half + VN.wall - TWH;
      for (const sd of [-1, 1]) onP(M.conc, wIn, VN.top - (NY - 0.4), 0.12, PP0 + 0.06, sd * (TWH + wIn / 2), (VN.top + NY - 0.4) / 2);   // tembok hulu kolam
      const wE = sw(PE);                                                       // tutup ujung dinding & lantai di muara
      for (const sd of [-1, 1]) onP(M.conc, TWT, 0.93, 0.03, PE - 0.015, sd * (TWH + TWT / 2), wE + 0.18 - 0.465);
      onP(M.conc, 2 * TWH, 0.55, 0.03, PE - 0.015, 0, wE - 0.2 - 0.275);          // tembok muara di bawah lantai
      const canalS = new THREE.Mesh(mergeGeometries(cgS), M.conc); canalS.castShadow = canalS.receiveShadow = true; root.add(canalS);
      const waterS = new THREE.Mesh(mergeGeometries(wS), cwMat); waterS.receiveShadow = true; root.add(waterS);   // pengarah + kolam: ikut tinggi air di takik
      const waterD = new THREE.Mesh(wDown, cwMat); waterD.receiveShadow = true; root.add(waterD);             // pembuang di hilir pelat
      Object.assign(dyn, { waterS, waterD });
      // Dinding beton bertakik V 90° (dasar takik NY) menutup ujung hilir kolam selebar kolam (sesuai foto pemasangan)
      const PP = onLine(PP1), hw = VN.half + VN.wall, yb = NY - 0.3 - 0.1, yt = VN.top, c = yt - NY, vs = new THREE.Shape();
      vs.moveTo(-hw, 0); vs.lineTo(hw, 0); vs.lineTo(hw, yt - yb); vs.lineTo(c, yt - yb); vs.lineTo(0, NY - yb); vs.lineTo(-c, yt - yb); vs.lineTo(-hw, yt - yb); vs.closePath();
      const pg = new THREE.ExtrudeGeometry(vs, { depth: 0.15, bevelEnabled: false }).translate(0, 0, -0.15).rotateY(ry).translate(PP.X, yb, PP.Z);
      const plate = new THREE.Mesh(pg, M.conc); plate.castShadow = plate.receiveShadow = true; root.add(plate);
      // Pancaran air lewat takik (terjunan bebas) + buih di kaki terjunan
      const sheetGeo = (pts, idx) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; };
      const toW = (lx, y, lz, P) => [P.X + AX * lx + UX * lz, y, P.Z + AZ * lx + UZ * lz];
      // Pancaran lewat takik: lebar & tebal mengikuti tinggi air di atas dasar takik H (V 90° → setengah lebar = H)
      const nappeGeo = (H, dd) => {
        const np = [], ni = [], N = 12, fall = NY - (DW0 + dd) + 0.05;
        for (let i = 0; i <= N; i++) {
          const t = i / N, lz = -0.15 + 0.37 * t, k = Math.max(0, lz / 0.22), dy = -fall * k * k, hwN = H * (1 - 0.35 * k), dep = H * 0.85 * (1 - 0.3 * k);   // lewat takik lalu jatuh
          for (const [x, y] of [[-hwN, NY + dep], [0, NY], [hwN, NY + dep]]) np.push(...toW(x, y + dy, lz, PP));
          if (i) { const b = (i - 1) * 3; ni.push(b, b + 3, b + 1, b + 1, b + 3, b + 4, b + 1, b + 4, b + 2, b + 2, b + 4, b + 5); }
        }
        return sheetGeo(np, ni);
      };
      const nappe = new THREE.Mesh(nappeGeo(VH, 0), nappeMat); nappe.renderOrder = 2; root.add(nappe);
      const foamMat = o => new THREE.MeshStandardMaterial({ color: 0xffffff, map: o, transparent: true, opacity: 0.6, depthWrite: false, roughness: 0.9 });
      const ft = foam.clone(); ft.repeat.set(0.5, 1);
      const splash = new THREE.Mesh(new THREE.PlaneGeometry(2 * TWH, 0.9).rotateX(-Math.PI / 2).rotateY(ry), foamMat(ft));
      const SP0 = onLine(PP1 + 0.5); splash.position.set(SP0.X, DW0 + 0.004, SP0.Z); splash.renderOrder = 2; root.add(splash); flows.push({ tex: ft, v: -0.5, g: 'spill' });
      // Terjunan di muara pembuang ke sungai + buih di permukaan sungai (hilang bila muara terendam sungai)
      const PM = onLine(PE), rv = riverAt(PM.X);
      const outletGeo = (w, r, k) => {
        const np = [], ni = [], N = 8, fall = w - r + 0.02;
        for (let i = 0; i <= N; i++) {
          const t = i / N, lz = 0.02 + (0.12 + 0.2 * k) * t, y = w - 0.01 - fall * t * t;
          for (const x of [-TWH + 0.02, TWH - 0.02]) np.push(...toW(x * (1 + 0.3 * t), y, lz, PM));
          if (i) { const b = (i - 1) * 2; ni.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
        }
        return sheetGeo(np, ni);
      };
      const outlet = new THREE.Mesh(outletGeo(wE, rv, 1), nappeMat); outlet.renderOrder = 3; root.add(outlet);
      const ft2 = foam.clone(); ft2.repeat.set(1, 1);
      const pool2 = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3).rotateX(-Math.PI / 2), foamMat(ft2));
      const LP = toW(0, 0, 0.5, PM); pool2.position.set(LP[0], rv + 0.015, LP[2]); pool2.renderOrder = 3; root.add(pool2); flows.push({ tex: ft2, v: 0.25, g: 'spill' });
      Object.assign(dyn, { nappe, nappeGeo, splash, outlet, outletGeo, pool2, wE, rv, xOut: PM.X, SP0y: DW0 + 0.004 });
    }

    // ---------- Petak: air, bibit, tajuk padi, lumpur bera ----------
    const tex = (draw, alpha = false) => {
      const c = Object.assign(document.createElement('canvas'), { width: 256, height: 256 }), g = c.getContext('2d');
      if (!alpha) { g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256); }
      draw(g); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
    };
    const tr = rng(9091), SP = 16;                                                   // 16 rumpun per 4 m → jarak tanam ± 25 cm
    const clumps = (g, leaves, len, cols, wid = 1.4) => {
      for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
        const cx = (i + 0.5) * SP + (tr() - 0.5) * 3, cy = (j + 0.5) * SP + (tr() - 0.5) * 3;
        for (let q = 0; q < leaves; q++) {
          const ang = tr() * Math.PI * 2, l = len * (0.5 + tr() * 0.5), col = cols[Math.floor(tr() * cols.length)], lw = wid * (0.7 + tr() * 0.6);
          for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) {
            g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(cx + ox, cy + oy); g.lineTo(cx + ox + Math.cos(ang) * l, cy + oy + Math.sin(ang) * l); g.stroke();
          }
        }
      }
    };
    const fill = c => g => { g.fillStyle = c; g.fillRect(0, 0, 256, 256); };
    const T = {
      tandur: tex(g => clumps(g, 6, 5.5, ['#6f9a3a', '#83ab45', '#5d8531'], 2), true),
      muda: tex(g => clumps(g, 10, 9, ['#62922f', '#77a73a', '#548127', '#8cb548'], 2.3), true),
      hijau: tex(g => { fill('#233f12')(g); clumps(g, 12, 12, ['#467a22', '#528827', '#3b6a1c', '#6a9c34'], 1.7); }),
      kuning: tex(g => { fill('#3e3f1d')(g); clumps(g, 12, 12, ['#877d30', '#958836', '#76782e', '#ab984a'], 1.7); }),
      bera: tex(g => {
        fill('#5a4935')(g);
        for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${tr() < 0.5 ? '40,30,20' : '150,125,95'},${0.12 + tr() * 0.2})`; g.fillRect(tr() * 256, tr() * 256, 2 + tr() * 5, 2 + tr() * 5); }
        clumps(g, 5, 2.6, ['#a99c62', '#8f8452', '#c2b574'], 1.3);                  // tunggul jerami
      }),
    };
    const wnP = waterNormalTexture(1, 1);
    const MP = {
      air: new THREE.MeshStandardMaterial({ color: 0x2f3b33, normalMap: wnP, normalScale: new THREE.Vector2(0.1, 0.1), roughness: 0.04, metalness: 0.1, envMapIntensity: 1.6 }),
      tandur: new THREE.MeshStandardMaterial({ map: T.tandur, transparent: true, depthWrite: false, roughness: 0.85 }),
      muda: new THREE.MeshStandardMaterial({ map: T.muda, transparent: true, depthWrite: false, roughness: 0.85 }),
      hijau: new THREE.MeshStandardMaterial({ map: T.hijau, vertexColors: true, roughness: 0.8 }),
      kuning: new THREE.MeshStandardMaterial({ map: T.kuning, vertexColors: true, roughness: 0.8 }),
      bera: new THREE.MeshStandardMaterial({ map: T.bera, vertexColors: true, roughness: 0.97 }),
    };
    flows.push({ tex: wnP, v: 0.01, u: 0.006 });
    const G = {}, geoOf = k => (G[k] ??= { pos: [], uv: [], col: [], idx: [] });
    function sheet(k, p, inset, y, tint = 1, jit = 0) {                            // permukaan datar petak (mengikuti kelokan d)
      const o = geoOf(k), x0 = p.x0 + inset, x1 = p.x1 - inset, n = Math.max(1, Math.ceil((x1 - x0) / 3)), base = o.pos.length / 3;
      for (let i = 0; i <= n; i++) {
        const x = lerp(x0, x1, i / n);
        for (const d of [p.d0 + inset, p.d1 - inset]) { const z = zRiver(x) + d; const t = tint * (0.93 + 0.14 * tr()); o.pos.push(x, y + jit * (tr() - 0.5), z); o.uv.push(x / 4, z / 4); o.col.push(t, t, t); }
        if (i) { const q = base + (i - 1) * 2; o.idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
      }
    }
    function sides(k, p, inset, y0, y1, tint) {                                    // sisi tajuk (keliling petak)
      const o = geoOf(k), xa = p.x0 + inset, xb = p.x1 - inset, da = p.d0 + inset, db = p.d1 - inset, n = Math.max(1, Math.ceil((xb - xa) / 3));
      const edges = [[], [], [], []];
      for (let i = 0; i <= n; i++) { edges[0].push([lerp(xa, xb, i / n), da]); edges[2].push([lerp(xb, xa, i / n), db]); }
      edges[1] = [[xb, da], [xb, db]]; edges[3] = [[xa, db], [xa, da]];
      for (const E2 of edges) {
        const base = o.pos.length / 3;
        E2.forEach(([x, d], i) => {
          const z = zRiver(x) + d; o.pos.push(x, y0, z, x, y1, z); o.uv.push(x / 4 + z / 4, y0, x / 4 + z / 4, y1); o.col.push(tint, tint, tint, tint, tint, tint);
          if (i) { const q = base + (i - 1) * 2; o.idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
        });
      }
    }
    for (const p of plots) {
      const tint = 0.84 + tr() * 0.18;
      if (p.state === 'bera') { sheet('bera', p, 0.1, p.level - 0.04, tint * (tr() < 0.5 ? 0.8 : 1)); continue; }
      sheet('air', p, 0.1, p.level);
      if (p.state === 'tandur' || p.state === 'muda') sheet(p.state, p, 0.2, p.level + 0.03);
      else { const h = p.state === 'hijau' ? 0.55 : 0.75; sheet(p.state, p, 0.3, p.level + h, tint, 0.06); sides(p.state, p, 0.3, p.level, p.level + h, tint * 0.62); }
    }
    for (const [k, o] of Object.entries(G)) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(o.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(o.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(o.col, 3)); g.setIndex(o.idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, MP[k]); m.receiveShadow = true; if (k === 'tandur' || k === 'muda') m.renderOrder = 2; root.add(m);
    }

    // ---------- Pematang (InstancedMesh prisma trapesium: atas 30 cm, bawah 62 cm) ----------
    const bg = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), bp = bg.attributes.position;
    for (let i = 0; i < bp.count; i++) bp.setZ(i, bp.getZ(i) * (bp.getY(i) > 0.5 ? 0.3 : 0.62));
    bg.computeVertexNormals();
    const segs = [];
    const lvl = (x, d) => plotAt(x, d);
    const seg = (xa, da, xb, db, pA, pB) => {
      const ps = [pA, pB].filter(Boolean), top = Math.max(...ps.map(p => p.level)) + 0.2;
      const bot = Math.min(...ps.map(p => p.level - 0.2), ps.length < 2 ? ground((xa + xb) / 2, (da + db) / 2) - 0.05 : 9);
      const [X0w, Z0w] = at(xa, da), [X1w, Z1w] = at(xb, db);
      segs.push({ x: (X0w + X1w) / 2, z: (Z0w + Z1w) / 2, len: Math.hypot(X1w - X0w, Z1w - Z0w) + 0.3, ry: -Math.atan2(Z1w - Z0w, X1w - X0w), y: bot, h: top - bot });
    };
    const alongD = (D, xa, xb) => {                                               // pematang memanjang (d tetap)
      const n = Math.max(1, Math.ceil((xb - xa) / 3));
      for (let i = 0; i < n; i++) { const u0 = lerp(xa, xb, i / n), u1 = lerp(xa, xb, (i + 1) / n), xm = (u0 + u1) / 2; seg(u0, D, u1, D, lvl(xm, D - 0.5), lvl(xm, D + 0.5)); }
    };
    BANDS.forEach(D => { alongD(D, X0, XV - VG); alongD(D, XV + VG, X1); });   // terputus di jalur tersier
    for (const s of splits) alongD(s.d, s.x0, s.x1);
    for (let k = 0; k < 4; k++) {                                                 // pematang melintang (x tetap)
      const xs = [...new Set(byBand[k].flatMap(p => [p.x0, p.x1]))], dm = (BANDS[k] + BANDS[k + 1]) / 2;
      for (const x of xs) {
        const d0 = BANDS[k], d1 = BANDS[k + 1];
        for (const [e0, e1] of [[d0, dm], [dm, d1]]) { const dd = (e0 + e1) / 2; seg(x, e0, x, e1, lvl(x - 0.5, dd), lvl(x + 0.5, dd)); }
      }
    }
    const bund = new THREE.InstancedMesh(bg, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }), segs.length);
    const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), c4 = new THREE.Color(), Y = new THREE.Vector3(0, 1, 0);
    segs.forEach((s, i) => {
      bund.setMatrixAt(i, m4.compose(new THREE.Vector3(s.x, s.y, s.z), q4.setFromAxisAngle(Y, s.ry), new THREE.Vector3(s.len, s.h, 1)));
      bund.setColorAt(i, c4.setRGB(0.36 + tr() * 0.06, 0.45 + tr() * 0.06, 0.2, THREE.SRGBColorSpace));
    });
    bund.receiveShadow = true; root.add(bund);

    for (const [mat, gs] of lists) {
      const m = new THREE.Mesh(mergeGeometries(gs), mat); m.castShadow = m.receiveShadow = true; root.add(m);
      if (mat === cwMat) { m.castShadow = false; dyn.cwMerged = m; }             // air saluran tersier & pintu sadap
    }

    // ---------- Air yang naik-turun (env.js): sungai (dh), saluran dari pintu pengambilan (canal), V-Notch (H, Q) ----------
    // Air yang turun di bawah lantai saluran tertutup lantai beton → saluran tampak kering dengan sendirinya.
    const fmY = fm.position.y, st = { H: VH, dd: 0, out: '' };
    // dhAt(x) = muka air sungai (m dari normal) di x dunia
    function setWater({ canal, qLag, H, Q }, Q0, dhAt) {
      for (const m of dyn.canalW) m.position.y = Math.max(-0.52, canal);
      if (dyn.cwMerged) dyn.cwMerged.position.y = Math.max(-0.25, canal * 0.5);
      fm.position.y = fmY + Math.max(-0.52, canal); fm.material.opacity = 0.5 * clamp(qLag, 0, 1.3); fm.visible = qLag > 0.03;
      bay.position.y = RL + dhAt(XA);
      dyn.waterS.position.y = Math.max(-0.1, H - VH);                               // pengarah + kolam penenang: NY + H
      const ratio = Q / Q0, dd = clamp(0.08 * (Math.sqrt(ratio) - 1), -0.12, 0.15);
      dyn.waterD.position.y = dd;
      if (Math.abs(H - st.H) > 0.0015 || Math.abs(dd - st.dd) > 0.004) {
        st.H = H; st.dd = dd;
        dyn.nappe.geometry.dispose(); dyn.nappe.geometry = dyn.nappeGeo(Math.max(0.004, H), dd);
      }
      dyn.nappe.visible = H > 0.004;
      dyn.splash.position.y = dyn.SP0y + dd; dyn.splash.material.opacity = 0.6 * clamp(H / VH, 0, 1.4); dyn.splash.visible = H > 0.004;
      const w = dyn.wE + dd, r = dyn.rv + dhAt(dyn.xOut), k = clamp(Math.sqrt(ratio), 0.2, 1.8), key = `${w.toFixed(3)}|${r.toFixed(3)}|${k.toFixed(2)}`;
      if (key !== st.out && w - r > 0.03) { st.out = key; dyn.outlet.geometry.dispose(); dyn.outlet.geometry = dyn.outletGeo(w, r, k); }
      dyn.outlet.visible = w - r > 0.03 && Q > 1e-4;                               // muara terendam sungai → tanpa terjunan
      dyn.pool2.position.y = r + 0.015; dyn.pool2.material.opacity = 0.6 * clamp(ratio, 0, 1.5) * (dyn.outlet.visible ? 1 : 0.3);
    }
    return { group: root, flows, setWater };
  }

  // Ujung saluran primer / pangkal saluran tersier (pintu sadap di x = XV, tembok ujung di XT); dOuter = muka luar dinding saluran
  const tertiaryHead = { x: XV, xEnd: XT, d: DB, dOuter: DB + CW / 2 + TH };
  return { carve, dist, inPlot, edge, vnotchSpot, VN, labels, build, intakeX: XA, tertiaryHead };
}
