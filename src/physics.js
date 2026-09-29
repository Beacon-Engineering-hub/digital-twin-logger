import * as THREE from 'three';

// ---------- Tabrakan 2D (x–z) untuk pintu: SAT poligon cembung ----------
export const rectPoly = (x0, x1, z0, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
// rotasi sekitar sumbu Y (konvensi three.js) lalu geser ke titik engsel
export const placePoly = (poly, [px, pz], ang) => {
  const c = Math.cos(ang), sn = Math.sin(ang);
  return poly.map(([x, z]) => [px + x * c + z * sn, pz - x * sn + z * c]);
};
export function polysOverlap(A, B) {
  for (const P of [A, B]) for (let i = 0; i < P.length; i++) {
    const [x1, z1] = P[i], [x2, z2] = P[(i + 1) % P.length], nx = z2 - z1, nz = x1 - x2;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const [x, z] of A) { const v = x * nx + z * nz; a0 = Math.min(a0, v); a1 = Math.max(a1, v); }
    for (const [x, z] of B) { const v = x * nx + z * nz; b0 = Math.min(b0, v); b1 = Math.max(b1, v); }
    if (a1 <= b0 + 1e-9 || b1 <= a0 + 1e-9) return false;
  }
  return true;
}
// Sudut buka maksimum pintu box (derajat) untuk sudut pintu krangkeng tertentu
export const LID_MAX = 110;
export function lidLimit(C, cageDeg) {
  const obst = [...C.statics, ...C.doorPolys.map(P => placePoly(P, C.doorPivot, THREE.MathUtils.degToRad(cageDeg)))];
  for (let a = 0.5; a <= LID_MAX; a += 0.5) {
    const lid = placePoly(C.lidPoly, C.lidPivot, THREE.MathUtils.degToRad(a));
    if (obst.some(o => polysOverlap(lid, o))) return a - 0.5;
  }
  return LID_MAX;
}
