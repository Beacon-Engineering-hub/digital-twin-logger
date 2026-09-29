import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Alam bersama untuk dunia digital twin (visual, bukan komponen produk), gaya proyek referensi irigasi-digital-twin
// (three/vegetation.ts): pohon rindang dari gumpalan ikosahedron bergerigi dengan normal dipalsukan ke luar & ke atas,
// pohon kelapa, rumpun bambu, pinus, semak — InstancedMesh dengan warna HSL per pohon; perbukitan latar dari fungsi tinggi
// dunia (warna bergradasi menurut tinggi) yang memudar oleh kabut; awan sprite. Dipakai world.js.
const V3 = THREE.Vector3;
export const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
function hash(i, j) { let h = (i * 374761393 + j * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function noise(x, y) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), e = hash(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + e) * u * v;
}
export const fbm = (x, y, oct = 4) => { let s = 0, a = 0.5, f = 1; for (let o = 0; o < oct; o++) { s += a * noise(x * f, y * f); f *= 2; a *= 0.5; } return s / (1 - 0.5 ** oct); };
const smooth = THREE.MathUtils.smoothstep, lerp = THREE.MathUtils.lerp;
const canvas = (w, h) => { const c = Object.assign(document.createElement('canvas'), { width: w, height: h }); return [c, c.getContext('2d')]; };
const texOf = c => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };

// ---------- Tekstur ----------
function cloudTexture(r) {                               // referensi: 30 gradasi radial putih 50 % di kanvas 128 × 64
  const [c, g] = canvas(128, 64);
  for (let i = 0; i < 30; i++) {
    const x = 22 + r() * 84, y = 24 + r() * 18, rad = 8 + r() * 15, gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, 2 * rad, 2 * rad);
  }
  return texOf(c);
}
// Tekstur butiran rumput / tanah (berulang), untuk tanah datar
let grainCanvas = null;
export function groundTexture(repeat) {
  if (!grainCanvas) {
    const S = 256, P = 16, [c, g] = canvas(S, S), img = g.createImageData(S, S);
    const nP = (x, y) => {                                 // value noise berulang tiap P
      const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = k => ((k % P) + P) % P;
      const a = hash(w(i), w(j)), b = hash(w(i + 1), w(j)), cc = hash(w(i), w(j + 1)), e = hash(w(i + 1), w(j + 1));
      return a + (b - a) * u + (cc - a) * v + (a - b - cc + e) * u * v;
    };
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const n = 0.6 * nP(i / S * P, j / S * P) + 0.4 * nP(i / S * P * 4 % P, j / S * P * 4 % P), v = 255 * (0.8 + 0.15 * n + 0.05 * hash(i, j)), k = (j * S + i) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = v; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0); grainCanvas = c;
  }
  const t = texOf(grainCanvas); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  return t;
}

// Normal map riak air (referensi textures.ts T.wn): 16 gelombang sinus bervektor-gelombang bulat (berulang) → tinggi →
// normal dari beda tengah × 3,2
let waveCanvas = null;
export function waterNormalTexture(rx, ry) {
  if (!waveCanvas) {
    const N = 256, r = rng(918273), jit = a => (r() * 2 - 1) * a, hgt = new Float32Array(N * N), waves = [];
    for (let k = 0; k < 16; k++) waves.push([Math.round(jit(7)) || 1, Math.round(jit(7)) || 2, r() * 6.28, 0.5 + r()]);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let h = 0; for (const [a, b, p, amp] of waves) h += amp / Math.hypot(a, b) * Math.sin(2 * Math.PI * (a * x + b * y) / N + p);
      hgt[y * N + x] = h;
    }
    const [c, g] = canvas(N, N), img = g.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const hx = hgt[y * N + (x + 1) % N] - hgt[y * N + (x + N - 1) % N], hy = hgt[((y + 1) % N) * N + x] - hgt[((y + N - 1) % N) * N + x];
      const nx = -hx * 3.2, ny = -hy * 3.2, l = Math.hypot(nx, ny, 1), k = (y * N + x) * 4;
      img.data[k] = (nx / l * 0.5 + 0.5) * 255; img.data[k + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0); waveCanvas = c;
  }
  const t = new THREE.CanvasTexture(waveCanvas); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8;
  return t;                                              // data normal: tanpa konversi warna
}

// ---------- Geometri pohon (satuan referensi; tinggi tiap jenis pada skala 1 ada di BASE_H) ----------
// Gumpalan: ikosahedron bergerigi, normal (x, 0.8y + 0.2, z) → tajuk terang di atas, lembut di sisi
const noUV = g => { g.deleteAttribute('uv'); return g; };
function blobGeo(parts, jit = 0.16, detail = 1) {
  const gs = parts.map(([ox, oy, oz, rad, sy], q) => {
    const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, nrm = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const j = 1 + (hash(Math.round((x * 7.1 + q * 3.3) * 97), Math.round((y * 5.3 + z * 9.7) * 97)) - 0.5) * 2 * jit;   // sama di titik yang sama → tetap rapat
      p.setXYZ(i, ox + x * rad * j, oy + y * rad * sy * j, oz + z * rad * j); nrm.push(x, y * 0.8 + 0.2, z);
    }
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    return noUV(g);
  });
  const out = mergeGeometries(gs), nn = out.attributes.normal;
  for (let i = 0; i < nn.count; i++) { const x = nn.getX(i), y = nn.getY(i), z = nn.getZ(i), l = Math.hypot(x, y, z) || 1; nn.setXYZ(i, x / l, y / l, z / l); }
  return out;
}
function treeGeos(r) {
  const G = {};
  G.broad = blobGeo([[0, 2.1, 0, 1, 0.82], [0.62, 1.92, 0.3, 0.74, 0.78], [-0.6, 1.98, -0.28, 0.72, 0.8]]);
  G.far = blobGeo([[0, 2.1, 0, 1.05, 0.85]]);
  G.trunk = noUV(new THREE.CylinderGeometry(0.07, 0.11, 1.9, 6).translate(0, 0.95, 0));
  G.palmTrunk = (() => {
    const g = new THREE.CylinderGeometry(0.045, 0.075, 3.0, 6, 6); g.translate(0, 1.5, 0);
    const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 3; p.setX(i, p.getX(i) + 0.35 * y * y); }
    g.computeVertexNormals(); return noUV(g);
  })();
  G.palmCrown = (() => {                                 // 11 pelepah, tiap pelepah 2 strip miring dari tulang daun
    const P = [], top = [0.35, 3.0, 0];
    for (let k = 0; k < 11; k++) {
      const a = k / 11 * Math.PI * 2 + (k % 2) * 0.2, ca = Math.cos(a), sa = Math.sin(a), L = 1.2 + (k % 3) * 0.13, seg = 4;
      let prev = null;
      for (let s = 0; s <= seg; s++) {
        const t = s / seg, rr = L * t, yy = top[1] + 0.3 * t - 1.0 * t * t, wd = 0.22 * Math.sin(Math.PI * Math.min(1, t * 1.12)) + 0.015;
        const cx = top[0] + ca * rr, cz = top[2] + sa * rr, px = -sa * wd, pz = ca * wd;
        const cur = { l: [cx + px, yy - 0.05 * t, cz + pz], r: [cx - px, yy - 0.05 * t, cz - pz], m: [cx, yy + 0.03, cz] };
        if (prev) { P.push(...prev.l, ...prev.m, ...cur.m, ...prev.l, ...cur.m, ...cur.l); P.push(...prev.m, ...prev.r, ...cur.r, ...prev.m, ...cur.r, ...cur.m); }
        prev = cur;
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.computeVertexNormals(); return g;
  })();
  const culms = [], tops = [];
  for (let k = 0; k < 13; k++) {                         // rumpun bambu: 13 batang condong + gumpalan daun
    const a = k / 13 * 6.283 + (r() - 0.5) * 0.6, lean = 0.1 + r() * 0.22, h = 2.6 + r() * 1.1;
    const g = new THREE.CylinderGeometry(0.02, 0.03, h, 5).translate(0, h / 2, 0);
    g.applyMatrix4(new THREE.Matrix4().compose(new V3(Math.cos(a) * 0.16, 0, Math.sin(a) * 0.16),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(a) * lean, 0, -Math.cos(a) * lean)), new V3(1, 1, 1)));
    culms.push(noUV(g));
  }
  for (let k = 0; k < 7; k++) { const a = k / 7 * 6.283 + 0.3, rr = 0.34 + (k % 2) * 0.28; tops.push([Math.cos(a) * rr, 1.75 + (k % 3) * 0.45, Math.sin(a) * rr, 0.62, 1.6]); }
  tops.push([0, 2.95, 0, 0.5, 1.5]);
  G.bambooCulm = mergeGeometries(culms); G.bambooTop = blobGeo(tops, 0.24, 0);
  G.pine = mergeGeometries([[0.9, 1.6, 1.3], [0.7, 1.3, 2.2], [0.45, 1.0, 3.0]].map(([rad, h, y]) => noUV(new THREE.ConeGeometry(rad, h, 7).translate(0, y, 0))));
  G.pineTrunk = noUV(new THREE.CylinderGeometry(0.06, 0.09, 1.3, 5).translate(0, 0.65, 0));
  G.shrub = blobGeo([[0, 0.42, 0, 0.5, 0.8], [0.36, 0.34, 0.1, 0.36, 0.8], [-0.32, 0.36, -0.12, 0.38, 0.8]], 0.2);
  return G;
}
const BASE_H = { tree: 2.92, far: 3.0, palm: 3.3, bamboo: 3.7, pine: 3.5, shrub: 0.9 };

// ---------- Perbukitan latar: cincin dari tepi medan ke luar ± 900 m, tinggi dari fungsi dunia ----------
// perimeter = titik tepi medan (dunia, berurutan melingkar), height(x, z) = tinggi dunia, center = pusat medan (arah keluar)
export function buildRing(perimeter, height, center = new V3()) {
  const rows = [0]; for (let s = 2, d = 0; d < 900; s *= 1.13) { d += s; rows.push(d); }
  const W = perimeter.length, H = rows.length, pos = new Float32Array(W * H * 3), col = new Float32Array(W * H * 3), c = new THREE.Color();
  perimeter.forEach((b, i) => {
    const dir = new V3(b.x - center.x, 0, b.z - center.z).normalize();
    for (let j = 0; j < H; j++) {
      const d = rows[j], x = b.x + dir.x * d, z = b.z + dir.z * d;
      const y = j === 0 ? b.y - 0.3 : height(x, z) - 0.3 * (1 - smooth(d, 0, 8));   // baris pertama sedikit di bawah tepi medan
      pos.set([x, y, z], (j * W + i) * 3);
      const f = THREE.MathUtils.clamp((y + 11) / 170, 0, 1), v = 0.9 + 0.2 * fbm(x * 0.02, z * 0.02, 3);   // gradasi menurut tinggi (referensi)
      c.setRGB(lerp(0.3, 0.5, f * f) * v, lerp(0.42, 0.47, f) * v, lerp(0.24, 0.4, f * f) * v, THREE.SRGBColorSpace);
      col.set([c.r, c.g, c.b], (j * W + i) * 3);
    }
  });
  const idx = [];
  for (let j = 0; j < H - 1; j++) for (let i = 0; i < W; i++) { const a = j * W + i, b = j * W + (i + 1) % W; idx.push(a, b, a + W, b, b + W, a + W); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
  m.receiveShadow = true; m.frustumCulled = false; m.userData.isGround = true;
  return m;
}

// ---------- Penempatan pohon (sekali, di koordinat dunia; jarak antar pohon dijaga lewat grid hash) ----------
// areas: [{ kind, n, box: [x0, x1, z0, z1], h: [min, max], rad, free? }] — free(x, z, rad) umum + free khusus area
export function placeSpots({ free = () => true, areas = [], seed = 20260928 }) {
  const r = rng(seed), spots = { tree: [], far: [], palm: [], bamboo: [], pine: [], shrub: [] }, CELL = 4;
  const grids = {}, key = (i, j) => i * 100003 + j;
  for (const A of areas) {
    const list = spots[A.kind], grid = (grids[A.kind] ??= new Map()), [x0, x1, z0, z1] = A.box, minD = A.rad * 1.5, reach = Math.ceil(minD / CELL);
    for (let k = 0, tries = 0; k < A.n && tries < A.n * 30; tries++) {
      const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0);
      if (!free(x, z, A.rad) || (A.free && !A.free(x, z, A.rad))) continue;
      const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL);
      let near = false;
      for (let di = -reach; di <= reach && !near; di++) for (let dj = -reach; dj <= reach && !near; dj++)
        for (const s of grid.get(key(ci + di, cj + dj)) ?? []) if (Math.hypot(s.a - x, s.b - z) < minD) { near = true; break; }
      if (near) continue;
      const t = { kind: A.kind, a: x, b: z, h: A.h[0] + r() * (A.h[1] - A.h[0]), rot: r() * Math.PI * 2, c: r(), c2: r(), c3: r() };
      list.push(t);
      const kk = key(ci, cj); if (!grid.has(kk)) grid.set(kk, []); grid.get(kk).push(t); k++;
    }
  }
  return spots;
}

// ---------- Pohon (InstancedMesh, warna HSL per pohon seperti referensi) ----------
// at(x, z) → titik dunia di permukaan; keep(t) → pohon yang dibangun (mis. hanya di sekitar stasiun)
let G = null;
export function buildTrees(spots, at, keep = () => true) {
  const root = new THREE.Group(); root.name = 'trees';
  G ??= treeGeos(rng(314159));
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
  const M = { trunk: std(0x6b5440, { roughness: 0.95 }), leaf: std(0xffffff), palmLeaf: std(0xffffff, { side: THREE.DoubleSide }), culm: std(0x8e8f44, { roughness: 0.7 }) };
  const mat4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new V3();
  const col = (h, s, l) => new THREE.Color().setHSL(h, s, l);             // HSL sRGB → linear
  const S = Object.fromEntries(Object.entries(spots).map(([k, l]) => [k, l.filter(keep)]));
  const inst = (geo, mat, list, color, shadow = true) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((t, i) => {
      const p = at(t.a, t.b).clone(); p.y -= 0.05;
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, t.rot);
      im.setMatrixAt(i, mat4.compose(p, q, sc.setScalar(t.h / BASE_H[t.kind === 'far' ? 'tree' : t.kind])));
      if (color) im.setColorAt(i, color(t));
    });
    im.castShadow = shadow; im.receiveShadow = true; im.frustumCulled = false; root.add(im);
  };
  inst(G.trunk, M.trunk, [...S.tree, ...S.far]);
  inst(G.broad, M.leaf, S.tree, t => col(0.22 + t.c * 0.09, 0.34 + t.c2 * 0.2, 0.15 + t.c3 * 0.1));
  inst(G.far, M.leaf, S.far, t => col(0.24 + t.c * 0.07, 0.3 + t.c2 * 0.15, 0.13 + t.c3 * 0.06));
  inst(G.palmTrunk, M.trunk, S.palm);
  inst(G.palmCrown, M.palmLeaf, S.palm, t => col(0.2 + t.c * 0.05, 0.4 + t.c2 * 0.15, 0.22 + t.c3 * 0.07));
  inst(G.bambooCulm, M.culm, S.bamboo);
  inst(G.bambooTop, M.leaf, S.bamboo, t => col(0.19 + t.c * 0.04, 0.42 + t.c2 * 0.12, 0.25 + t.c3 * 0.06));
  inst(G.pineTrunk, M.trunk, S.pine, null, false);
  inst(G.pine, M.leaf, S.pine, t => col(0.3 + t.c * 0.05, 0.28 + t.c2 * 0.12, 0.13 + t.c3 * 0.05));
  inst(G.shrub, M.leaf, S.shrub, t => col(0.22 + t.c * 0.08, 0.36 + t.c2 * 0.15, 0.14 + t.c3 * 0.08));
  return root;
}

// ---------- Awan (referensi: 16 sprite, opasitas 0,8), posisi dunia tetap ----------
export function buildClouds(seed = 271828) {
  const root = new THREE.Group(), r = rng(seed), cloud = cloudTexture(r);
  for (let i = 0; i < 16; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloud, transparent: true, depthWrite: false, fog: false, opacity: 0.8 }));
    const a = r() * Math.PI * 2, d = 300 + r() * 700;
    sp.position.set(Math.cos(a) * d, 170 + r() * 110, Math.sin(a) * d); sp.scale.set(180 + r() * 160, 60 + r() * 40, 1);
    sp.renderOrder = -1; root.add(sp);
  }
  return root;
}
