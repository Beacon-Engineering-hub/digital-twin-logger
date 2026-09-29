import * as THREE from 'three';
import { fbm, groundTexture, rng, waterNormalTexture } from './nature.js';

// Sungai detail bergaya proyek referensi irigasi-digital-twin (three/terrain.ts, river.ts, textures.ts), dipakai di
// AWLR Sungai & peta kawasan:
// - medan grid yang kolomnya menekuk mengikuti kelokan sungai (rapat di tebing), penampang: dasar datar → lereng bawah air
//   → tebing di atas muka air sampai tanah; warna tebing berpita: lumpur basah (dekat air) → pasir/tanah kering → rumput
// - muka air = pita datar yang sedikit lebih lebar dari alur (tepinya terkubur tebing → garis pantai mengikuti tebing),
//   warna keruh + tekstur arus (streak) & normal map riak yang bergulir searah arus; buih tipis di tengah alur
// - batu di dasar (terlihat samar di bawah air) & di kaki tebing; pasangan batu (riprap) opsional di tebing
// makeRiver({ center(z), halfW(z), level(z), depth, sBelow, sAbove, land(x, z) }) — sBelow/sAbove = kemiringan (tinggi/datar),
// boleh angka atau fungsi z. Semua satuan m, arus menuju +z.
const smooth = THREE.MathUtils.smoothstep, lerp = THREE.MathUtils.lerp, V3 = THREE.Vector3;
const fnOf = v => (typeof v === 'function' ? v : () => v);

// ---------- Tekstur (referensi textures.ts) ----------
function drawTex(w, h, draw, srgb = true) {
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h }); draw(c.getContext('2d'), c);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export const streakTexture = r => drawTex(64, 256, g => {   // abu-abu + garis arus putih memanjang
  g.fillStyle = '#c4cccc'; g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 42; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.45})`; g.fillRect(r() * 64, r() * 256, 1 + r() * 1.5, 12 + r() * 34); }
});
export const foamTexture = r => drawTex(128, 128, g => {    // 300 titik buih putih
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.6})`; g.beginPath(); g.arc(r() * 128, r() * 128, 0.8 + r() * 3.8, 0, 7); g.fill(); }
});
// Riprap: Voronoi 9 × 9 berulang — peta warna batu + peta tinggi (nat rendah, tengah batu cembung)
export function riprapTextures(r) {
  const N = 256, cells = 9, pts = [], a1 = new Float32Array(N * N), gap = new Float32Array(N * N), id = new Int32Array(N * N);
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push([(i + 0.15 + r() * 0.7) / cells * N, (j + 0.15 + r() * 0.7) / cells * N, 0.75 + r() * 0.5, r()]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const ci = Math.floor(x / N * cells), cj = Math.floor(y / N * cells); let d1 = 1e9, d2 = 1e9, best = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const wi = ci + di, wj = cj + dj, ii = (wi + cells) % cells, jj = (wj + cells) % cells, p = pts[jj * cells + ii];
      const d = Math.hypot(p[0] + (wi - ii) / cells * N - x, p[1] + (wj - jj) / cells * N - y);
      if (d < d1) { d2 = d1; d1 = d; best = jj * cells + ii; } else if (d < d2) d2 = d;
    }
    const k = y * N + x; a1[k] = d1; gap[k] = d2 - d1; id[k] = best;
  }
  const cell = N / cells, sm = (a, b, x) => smooth(x, a, b);
  const fill = (srgb, fn) => drawTex(N, N, g => {
    const img = g.createImageData(N, N);
    for (let k = 0; k < N * N; k++) { const [R, G, B] = fn(k); img.data[k * 4] = R; img.data[k * 4 + 1] = G; img.data[k * 4 + 2] = B; img.data[k * 4 + 3] = 255; }
    g.putImageData(img, 0, 0);
  }, srgb);
  const map = fill(true, k => {
    const p = pts[id[k]], mo = sm(1.4, 3.4, gap[k]), v = (58 + p[2] * 40) * (0.93 + r() * 0.14) * (1 - 0.18 * sm(0.2, 0.75, a1[k] / cell)), wm = 1 + (p[3] - 0.5) * 0.08;
    return [lerp(150, v * wm, mo), lerp(147, v, mo), lerp(138, v * (2 - wm) * 0.96, mo)];
  });
  const bump = fill(false, k => { const h = sm(1.2, 5, gap[k]) * (1 - 0.35 * Math.min(1, a1[k] / cell)) * 255; return [h, h, h]; });
  return { map, bump };
}

// Titik grid: rapat di dekat alur, makin renggang (dibatasi maxStep)
function axis(fine, step, lim, grow, maxStep = Infinity) {
  const v = [];
  for (let x = fine[0]; x <= fine[1] + 1e-9; x += step) v.push(x);
  for (let s = step, x = fine[1]; x < lim;) { s = Math.min(s * grow, maxStep); x += s; v.push(Math.min(x, lim)); }
  for (let s = step, x = fine[0]; x > -lim;) { s = Math.min(s * grow, maxStep); x -= s; v.unshift(Math.max(x, -lim)); }
  return v;
}

export function makeRiver(o) {
  const center = o.center, halfW = fnOf(o.halfW), level = fnOf(o.level), depth = o.depth ?? 1;
  const sBelow = fnOf(o.sBelow ?? 1), sAbove = fnOf(o.sAbove ?? 1), land = o.land ?? (() => 0), r = rng(o.seed ?? 4242);
  // Penampang: dasar datar, lereng bawah air, tebing di atas air sampai bertemu tanah
  function info(x, z) {
    const rc = center(z), hw = halfW(z), wl = level(z), d = Math.abs(x - rc), L = land(x, z);
    const chan = d < hw ? Math.max(wl - depth, wl - (hw - d) * sBelow(z)) : wl + (d - hw) * sAbove(z);
    return chan < L ? { y: chan, bank: true, d, hw, wl } : { y: L, bank: false, d, hw, wl };
  }
  const heightAt = (x, z) => info(x, z).y;
  const bankTop = z => halfW(z) + (land(center(z) - halfW(z) - 3, z) - level(z)) / sAbove(z);   // jarak tepi atas tebing dari sumbu

  // ---------- Medan ----------
  let E = 170, bendAt = null;
  const toX = (u, z) => u + center(z) * (1 - smooth(Math.abs(u), bendAt[0], bendAt[1]));   // kolom menekuk ikut sungai di dekat alur
  function buildTerrain({ extent = 170, fineU = 12, uStep = 0.2, zFine = [-40, 40], zStep = 0.4, maxStep = Infinity, colorMod } = {}) {
    E = extent; bendAt = [fineU + 20, fineU + 160];
    const us = axis([-fineU, fineU], uStep, E, 1.07, maxStep), zs = axis(zFine, zStep, E, 1.06, maxStep);
    const nu = us.length, nz = zs.length, pos = new Float32Array(nu * nz * 3), col = new Float32Array(nu * nz * 3), uv = new Float32Array(nu * nz * 2);
    const inf = [];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nu; i++) {
      const z = zs[j], x = toX(us[i], z), I = info(x, z), v = j * nu + i;
      pos.set([x, I.y, z], v * 3); uv.set([x / 4, z / 4], v * 2); inf[v] = I;
    }
    const idx = new Uint32Array((nu - 1) * (nz - 1) * 6); let q = 0;
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nu - 1; i++) {
      const a = j * nu + i, b = a + 1, c = a + nu, e = c + 1;
      idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = e;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals();
    // Warna (referensi groundColor): rumput bervariasi; tebing berpita lumpur basah / pasir kering; dasar gelap; lereng curam = tanah/batu
    const n = g.attributes.normal, c = new THREE.Color(), t = new THREE.Color();
    const mix = (R, G, B, k) => { t.setRGB(R, G, B, THREE.SRGBColorSpace); c.lerp(t, k); };
    for (let v = 0; v < nu * nz; v++) {
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2], I = inf[v], slope = 1 - n.getY(v);
      const f1 = fbm(x * 0.05, z * 0.05, 3), f2 = fbm(x * 0.012 + 7, z * 0.012, 2);
      c.setRGB(lerp(0.47, 0.55, f1), lerp(0.5, 0.56, f1), lerp(0.3, 0.33, f1), THREE.SRGBColorSpace);
      mix(0.62, 0.6, 0.38, 0.35 * smooth(f2, 0.55, 0.75));                        // bercak kering
      mix(0.36, 0.46, 0.24, 0.35 * (1 - smooth(f2, 0.25, 0.45)));                 // bercak subur
      if (I.bank) {
        const above = y - I.wl;
        if (above < 0.12) mix(0.36, 0.33, 0.25, 1);
        else if (above < 0.55) mix(0.63, 0.57, 0.44, 1 - smooth(above, 0.3, 0.55));
        else mix(0.4, 0.5, 0.26, 0.5);
        if (above < -0.05) mix(0.3, 0.28, 0.22, smooth(-above, 0.05, 0.4));       // dasar di bawah air
      } else if (slope > 0.3) {
        const rock = fbm(x * 0.4, y * 0.6 + 3, 3);
        mix(lerp(0.55, 0.5, rock), lerp(0.46, 0.48, rock), lerp(0.36, 0.44, rock), smooth(slope, 0.3, 0.5));
      }
      colorMod?.(c, x, z, y, slope, I);
      col.set([c.r, c.g, c.b], v * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, map: groundTexture(1), roughness: 0.97 }));
    m.receiveShadow = true; m.userData.isGround = true;
    return m;
  }
  // Tepi grid (berurutan melingkar, sudut naik) untuk cincin perbukitan
  function perimeter(n = 160) {
    const P = [], add = (u, z) => { const x = toX(u, z); P.push(new V3(x, heightAt(x, z), z)); }, e = E - 2;
    for (let k = 0; k < n; k++) add(-e + 2 * e * k / n, -e);
    for (let k = 0; k < n; k++) add(e, -e + 2 * e * k / n);
    for (let k = 0; k < n; k++) add(e - 2 * e * k / n, e);
    for (let k = 0; k < n; k++) add(-e, e - 2 * e * k / n);
    return P;
  }
  // Lembah sungai berlanjut di antara perbukitan: bukit diratakan & diturunkan ke dasar di koridor alur
  const ringMod = (x, z) => {
    const q = Math.abs(x - center(z)), hw = halfW(z);
    return { mul: smooth(q, hw + 3, 90), toY: level(z) - depth - 0.3, k: 1 - smooth(q, hw, hw + 6) };
  };

  // ---------- Muka air (pita) + buih ----------
  // Pita bisa dinaikkan / diturunkan (dh, m) dan dilebarkan (widen(z), m tiap sisi) tanpa membangun ulang indeks
  function ribbon(z0, z1, step, halfOf, y, mat, uvU, uvV) {
    const S = [], idx = []; let s = 0, prev = null, i = 0;
    for (let z = z0; z <= z1 + 1e-6; z += step(z), i++) {
      const x = center(z);
      if (prev) s += Math.hypot(x - prev[0], z - prev[1]);
      prev = [x, z];
      const dx = center(z + 0.5) - center(z - 0.5), l = Math.hypot(dx, 1);   // normal horisontal alur
      S.push({ x, z, nx: 1 / l, nz: -dx / l, h: halfOf(z), y: y(z), s, invS: 1 / sAbove(z) });
      if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const pos = new Float32Array(S.length * 6), uv = new Float32Array(S.length * 4);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.frustumCulled = false;
    m.userData.set = (dhOf = 0, widen = null) => {                  // dhOf = angka atau fungsi (sampel) → m
      S.forEach((p, k) => {
        const dh = typeof dhOf === 'function' ? dhOf(p) : dhOf, h = p.h + (widen ? widen(p, dh) : 0), yy = p.y + dh;
        pos.set([p.x - p.nx * h, yy, p.z - p.nz * h, p.x + p.nx * h, yy, p.z + p.nz * h], k * 6);
        uv.set([0, p.s / uvV, 2 * h / uvU, p.s / uvV], k * 4);
      });
      g.attributes.position.needsUpdate = g.attributes.uv.needsUpdate = true;
    };
    m.userData.set(0);
    g.computeVertexNormals();
    return m;
  }
  // Muka air sungai. setLevel(dh, rain, up): naik / turun dh m dari muka air normal; up = { dh, z } → di hulu (z ≤ up.z) dh = up.dh,
  // di antara z = 0 & up.z berubah linear (gelombang banjir menjalar ke hilir). Saat naik pita melebar mengikuti lereng tebing
  // (dh / kemiringan) sehingga garis air tetap di tebing. Air makin keruh & buih makin banyak saat debit besar, arus melambat saat surut.
  const MUD = new THREE.Color(0x86623e);
  function buildWater({ z0 = -1100, z1 = 1100, fine = [-120, 120], color = 0x6c6749, foam = 0.2, env = 0.75, part } = {}) {
    const step = z => (z > fine[0] && z < fine[1] ? 0.5 : 4);
    const streak = streakTexture(r), wn = waterNormalTexture(1, 1);
    const mat = new THREE.MeshStandardMaterial({ color, map: streak, normalMap: wn, normalScale: new THREE.Vector2(0.32, 0.32),
      roughness: 0.12, metalness: 0.05, envMapIntensity: env, transparent: true, opacity: 0.96 });
    const water = ribbon(z0, z1, step, z => halfW(z) + 0.5, level, mat, 1.7, 1.7);
    water.renderOrder = 1; if (part) water.userData.part = part;
    const g = new THREE.Group(), flow = [{ tex: streak, v: 0.5, g: 'river' }, { tex: wn, v: 0.12, u: 0.02, g: 'river' }];
    g.add(water); g.userData.flow = flow;                 // tekstur yang digulir tiap frame oleh pemilik tampilan
    let f = null, fm = null;
    if (foam > 0) {                                    // buih tipis memanjang di tengah alur (arus deras)
      const ft = foamTexture(r);
      fm = new THREE.MeshStandardMaterial({ color: 0xffffff, map: ft, transparent: true, opacity: foam, depthWrite: false, roughness: 0.9 });
      f = ribbon(Math.max(z0, -400), Math.min(z1, 400), step, z => halfW(z) * (0.45 + 0.15 * Math.sin(z / 9)), z => level(z) + 0.012, fm, 3, 3);
      f.renderOrder = 3; g.add(f); flow.push({ tex: ft, v: 0.8, g: 'river' });
    }
    const c0 = new THREE.Color(color);
    let last = '';
    g.userData.mat = mat;
    g.userData.setLevel = (dh, rain = 0, up = null) => {
      const dm = up ? Math.max(dh, up.dh) : dh, turb = THREE.MathUtils.clamp((dm - 0.1) / 0.9, 0, 1);
      mat.color.copy(c0).lerp(MUD, turb);
      mat.normalScale.setScalar(0.32 + 0.45 * rain);                                 // riak tetes hujan
      if (fm) fm.opacity = foam * THREE.MathUtils.clamp(1 + dh / 0.6, 0.15, 1) + 0.28 * turb;
      const key = `${dh.toFixed(3)}|${up ? up.dh.toFixed(3) : ''}`;              // geometri dihitung ulang hanya bila muka air berubah
      if (key === last) return;
      last = key;
      const dhOf = up ? p => dh + (up.dh - dh) * THREE.MathUtils.clamp(p.z / up.z, 0, 1) : dh;
      water.userData.set(dhOf, (p, d) => Math.max(0, d) * p.invS);
      f?.userData.set(dhOf);
    };
    return g;
  }
  // Batu: di dasar (samar di bawah air) & di kaki tebing
  function rocks({ z0 = -80, z1 = 80, bed = 120, bank = 160, avoid = () => false } = {}) {
    const list = [];
    for (let k = 0, t = 0; k < bed && t < bed * 20; t++) {
      const z = z0 + r() * (z1 - z0), s = 0.2 + r() * 0.45, x = center(z) + (r() * 2 - 1) * (halfW(z) - 0.6);
      if (avoid(x, z)) continue; list.push([x, level(z) - depth + s * 0.25, z, s]); k++;
    }
    for (let k = 0, t = 0; k < bank && t < bank * 20; t++) {
      const z = z0 + r() * (z1 - z0), side = r() < 0.5 ? -1 : 1, x = center(z) + side * (halfW(z) + 0.1 + r() * 0.9), s = 0.15 + r() * 0.35;
      if (avoid(x, z)) continue; list.push([x, heightAt(x, z) - s * 0.2, z, s]); k++;
    }
    const geo = new THREE.DodecahedronGeometry(1, 0).scale(1, 0.6, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
    const im = new THREE.InstancedMesh(geo, mat, list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), cc = new THREE.Color();
    list.forEach(([x, y, z, s], i) => {
      im.setMatrixAt(i, m4.compose(new V3(x, y, z), q.setFromEuler(e.set(r() * 0.4, r() * 6.28, r() * 0.4)), new V3(s * (0.8 + r() * 0.5), s, s * (0.8 + r() * 0.5))));
      im.setColorAt(i, cc.setRGB(0.5 + r() * 0.12, 0.48 + r() * 0.1, 0.43 + r() * 0.08, THREE.SRGBColorSpace));
    });
    im.castShadow = im.receiveShadow = true; im.frustumCulled = false;
    return im;
  }
  // Pasangan batu (riprap) menutup tebing satu sisi: dari bawah muka air sampai sedikit di atas tepi tebing
  function riprap({ z0, z1, side = -1, below = 0.4, above = 0.6, part } = {}) {
    const tex = riprapTextures(r), TS = 9, pos = [], uv = [], idx = [];
    const mat = new THREE.MeshStandardMaterial({ map: tex.map, bumpMap: tex.bump, bumpScale: 3, roughness: 0.95,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    let row = 0;
    for (let z = z0; z <= z1 + 1e-6; z += 0.4, row++) {
      const hw = halfW(z), top = bankTop(z), rc = center(z);
      let s = 0, prev = null;
      for (let k = 0; k < TS; k++) {
        const d = hw - below + (top + above - hw + below) * k / (TS - 1), x = rc + side * d, y = heightAt(x, z) + 0.03;
        if (prev) s += Math.hypot(x - prev[0], y - prev[1]);
        prev = [x, y]; pos.push(x, y, z); uv.push(s / 0.55, z / 0.55);
      }
      if (row) for (let k = 0; k < TS - 1; k++) {
        const a = (row - 1) * TS + k, b = a + 1, c = a + TS, e = c + 1;
        if (side < 0) idx.push(a, b, c, b, e, c); else idx.push(a, c, b, b, c, e);
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; if (part) m.userData.part = part;
    return m;
  }

  return { info, heightAt, bankTop, buildTerrain, perimeter, ringMod, buildWater, rocks, riprap, center, halfW, level };
}
