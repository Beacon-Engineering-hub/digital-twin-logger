import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function mesh(geo, mat, part) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true; m.receiveShadow = true; m.userData.part = part;
  return m;
}

// Plat datar horizontal berlubang (lidah kunci / staple), sudut dipotong. w = arah x, d = arah z.
export function holedTab(w, d, th, holeR, hx = 0, hz = 0, ch = 0.004) {
  const sh = new THREE.Shape(), x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
  sh.moveTo(x0 + ch, z0); sh.lineTo(x1 - ch, z0); sh.lineTo(x1, z0 + ch); sh.lineTo(x1, z1 - ch);
  sh.lineTo(x1 - ch, z1); sh.lineTo(x0 + ch, z1); sh.lineTo(x0, z1 - ch); sh.lineTo(x0, z0 + ch); sh.closePath();
  const h = new THREE.Path(); h.absarc(hx, hz, holeR, 0, Math.PI * 2, true); sh.holes.push(h);
  const g = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false, curveSegments: 16 });
  g.rotateX(Math.PI / 2); g.translate(0, th / 2, 0);
  return g;
}

// Plat datar horizontal (bidang XZ, tebal ke arah Y) dengan beberapa lubang: holes = [[x, z, r], ...]
export function holedPlate(w, d, th, holes) {
  const sh = new THREE.Shape();
  sh.moveTo(-w / 2, -d / 2); sh.lineTo(w / 2, -d / 2); sh.lineTo(w / 2, d / 2); sh.lineTo(-w / 2, d / 2); sh.closePath();
  for (const [x, z, r] of holes) { const h = new THREE.Path(); h.absarc(x, z, r, 0, Math.PI * 2, true); sh.holes.push(h); }
  const g = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false, curveSegments: 16 });
  g.rotateX(Math.PI / 2); g.translate(0, th / 2, 0);
  return g;
}

// Plat tegak (bidang XY, tebal ke arah Z, terpusat) dengan lubang baut: holes = [[x, y, r], ...]
export function holedPlateXY(w, h, th, holes) {
  const sh = new THREE.Shape();
  sh.moveTo(-w / 2, -h / 2); sh.lineTo(w / 2, -h / 2); sh.lineTo(w / 2, h / 2); sh.lineTo(-w / 2, h / 2); sh.closePath();
  for (const [x, y, r] of holes) { const hp = new THREE.Path(); hp.absarc(x, y, r, 0, Math.PI * 2, true); sh.holes.push(hp); }
  const g = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false, curveSegments: 16 });
  g.translate(0, 0, -th / 2);
  return g;
}

// Batang silinder dari titik a ke b
export const _Y = new THREE.Vector3(0, 1, 0), _Z = new THREE.Vector3(0, 0, 1);
export function rodBetween(a, b, r, mat, partName, seg = 10) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), dir = B.clone().sub(A);
  const m = mesh(new THREE.CylinderGeometry(r, r, dir.length(), seg), mat, partName);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(_Y, dir.normalize());
  return m;
}
// Jalur kabel / conduit: polyline dengan sudut dibulatkan (radius r, dibatasi setengah panjang segmen)
export function roundedPath(pts, r) {
  const P = pts.map(p => new THREE.Vector3(...p)), path = new THREE.CurvePath();
  let prev = P[0];
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1], b = P[i], c = P[i + 1];
    const k = Math.min(r, a.distanceTo(b) / 2, b.distanceTo(c) / 2);
    const p0 = b.clone().addScaledVector(a.clone().sub(b).normalize(), k);
    const p1 = b.clone().addScaledVector(c.clone().sub(b).normalize(), k);
    if (prev.distanceTo(p0) > 1e-6) path.add(new THREE.LineCurve3(prev, p0));
    path.add(new THREE.QuadraticBezierCurve3(p0, b, p1));
    prev = p1;
  }
  path.add(new THREE.LineCurve3(prev, P.at(-1)));
  return path;
}
// Profil siku L (aluminium bending) dari titik a ke b
export function angleBar(a, b, size, th, mat, partName, roll = 0) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), dir = B.clone().sub(A), len = dir.length();
  const sh = new THREE.Shape();
  sh.moveTo(0, 0); sh.lineTo(size, 0); sh.lineTo(size, th); sh.lineTo(th, th); sh.lineTo(th, size); sh.lineTo(0, size); sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false });
  geo.translate(-size / 2, -size / 2, -len / 2);
  const m = mesh(geo, mat, partName);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(_Z, dir.normalize()).multiply(new THREE.Quaternion().setFromAxisAngle(_Z, roll));
  return m;
}
// Wiremesh las di bidang XY (terpusat), kawat vertikal & horizontal
export function wireGrid(w, h, pitch, r) {
  const geos = [];
  const nx = Math.max(1, Math.round(w / pitch)), ny = Math.max(1, Math.round(h / pitch));
  for (let i = 1; i < nx; i++) { const g = new THREE.CylinderGeometry(r, r, h, 6); g.translate(-w / 2 + i * w / nx, 0, 0); geos.push(g); }
  for (let j = 1; j < ny; j++) { const g = new THREE.CylinderGeometry(r, r, w, 6); g.rotateZ(Math.PI / 2); g.translate(0, -h / 2 + j * h / ny, r * 1.6); geos.push(g); }
  const merged = mergeGeometries(geos); geos.forEach(g => g.dispose());
  return merged;
}
