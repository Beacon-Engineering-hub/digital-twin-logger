import * as THREE from 'three';
import { MAT } from '../materials.js';
import { mesh, rodBetween, roundedPath } from '../geometry.js';
import { tag } from '../labels.js';

// Konektor SP21 2 pin di dinding bawah box + plug + kabel dalam conduit fleksibel hitam.
// Soket di tengah satu lubang wiremesh dasar krangkeng (slot 0 = lubang ± 55 mm dari sisi kanan box, −1 = satu lubang
// ke kiri, dst.). Plug + conduit turun lewat lubang itu, di bawah krangkeng (tinggi yH) berbelok ke tiang di sudut phi
// (derajat, 0 = +X, 90 = depan), lalu mengikuti `route` (polyline bersudut bulat) dan `tail` (kurva halus, opsional).
// Kabel keluar di ujung conduit mengikuti `endCable` (2 titik = lurus, lebih = kurva) ke perangkat tujuan.
// Lubang panel SP21 Ø21 (katalog Weipu); ukuran lain, conduit Ø16 & kabel Ø9 = perkiraan.
export const CONDUIT_R = 0.008, CABLE_R = 0.0045, POLE_GAP = 0.063;   // POLE_GAP = jarak sumbu conduit dari sumbu tiang

// part = nama komponen conduit + kabel (untuk info / sorot), default kabel panel surya
export function sp21Cable(S, { slot = 0, wireToY, group, phi, yH, route = [], tail = null, endCable, tagText, tagAt, plugTag, part: cp = 'pvCable' }) {
  const mm = v => v / 1000, rad = THREE.MathUtils.degToRad;
  const part = (geo, mat, name, x, y, z) => { const m = mesh(geo, mat, name); m.position.set(x, y, z); return m; };
  const cyl = (r0, r1, h, seg = 24) => new THREE.CylinderGeometry(r0, r1, h, seg);
  const { enc, cy, EH, t, W, Wc, ct, Ds, pitch, zF, ox } = S;

  const mw = Wc - ct, cellX = mw / Math.max(1, Math.round(mw / pitch));
  const mh = Ds - ct, mny = Math.max(1, Math.round(mh / pitch)), cellZ = mh / mny;
  const kx = ox - mw / 2 + (Math.floor((W / 2 - 0.055 - ox + mw / 2) / cellX) + 0.5 + slot) * cellX;   // tengah lubang mesh
  const kzW = zF + Ds / 2 - mh / 2 + (Math.floor(mny / 2) + 0.5) * cellZ;                            // z dunia
  const kz = kzW - enc.position.z;                                                                   // z lokal box
  const yW0 = -EH / 2, yW1 = -EH / 2 + t;                                                            // muka luar / dalam dinding bawah

  // Soket panel (ikut box): flens luar, badan tembus lubang Ø21, mur belakang, badan solder + 2 kabel ke kabel duct
  enc.add(
    part(cyl(0.013, 0.013, 0.003), MAT.plastic(), 'sp21', kx, yW0 - 0.0015, kz),
    part(cyl(0.0105, 0.0105, t + 0.001), MAT.plastic(), 'sp21', kx, (yW0 + yW1) / 2, kz),
    part(cyl(0.0156, 0.0156, 0.005, 6), MAT.plastic(), 'sp21', kx, yW1 + 0.0025, kz),
    part(cyl(0.009, 0.0095, 0.016), MAT.plastic(), 'sp21', kx, yW1 + 0.013, kz),
  );
  [[-0.003, 0xd62b2b], [0.003, 0x1b1b1b]].forEach(([dx, c]) =>
    enc.add(rodBetween([kx + dx, yW1 + 0.02, kz], [kx + dx, wireToY, kz], 0.0013, MAT.wire(c), 'sp21', 8)));

  // Plug (koordinat dunia): mur kopling bergerigi, badan, mur klem kabel, karet ekor
  const yS = cy + yW0 - 0.003;
  const knurl = new THREE.Shape(), nK = 30;
  for (let i = 0; i < nK * 2; i++) {
    const a = i / (nK * 2) * Math.PI * 2, r = i % 2 ? 0.0139 : 0.0146;
    if (i) knurl.lineTo(r * Math.cos(a), r * Math.sin(a)); else knurl.moveTo(r, 0);
  }
  const knurlGeo = new THREE.ExtrudeGeometry(knurl, { depth: 0.02, bevelEnabled: false }).rotateX(Math.PI / 2);   // 0 → −0.02 di y
  group.add(
    part(knurlGeo, MAT.plastic(), 'sp21', kx, yS, kzW),
    part(cyl(0.0125, 0.011, 0.022), MAT.plastic(), 'sp21', kx, yS - 0.031, kzW),
    part(cyl(0.011, 0.011, 0.012, 12), MAT.plastic(), 'sp21', kx, yS - 0.048, kzW),
    part(cyl(0.0068, 0.006, 0.006), MAT.rubber(), 'sp21', kx, yS - 0.057, kzW),
  );
  if (plugTag) { const o = tag(plugTag, 'sp21', { maxDist: 2.5 }); o.position.set(kx + 0.016, yS - 0.03, kzW); group.add(o); }

  // Jalur conduit
  const pol = (deg, y) => [POLE_GAP * Math.cos(rad(deg)), y, POLE_GAP * Math.sin(rad(deg))];
  const yPB = yS - 0.06, yc0 = yPB - 0.008;
  const path = roundedPath([[kx, yc0, kzW], [kx, yH, kzW], pol(phi, yH), ...route], 0.04);
  if (tail) path.add(new THREE.CatmullRomCurve3(tail.map(v => new THREE.Vector3(...v)), false, 'centripetal'));
  const len = path.getLength();
  group.add(mesh(new THREE.TubeGeometry(path, Math.ceil(len / 0.005), CONDUIT_R, 12, false), MAT.flexConduit(len), cp));
  const endMat = MAT.rubber(); endMat.side = THREE.DoubleSide;
  const endGeo = new THREE.RingGeometry(CABLE_R, CONDUIT_R, 16).rotateX(-Math.PI / 2);   // tutup ujung conduit, normal +Y
  for (const u of [0, 1]) {
    const e = part(endGeo, endMat, cp, ...path.getPointAt(u).toArray());
    e.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), path.getTangentAt(u)); group.add(e);
  }
  const cabMat = MAT.wire(0x17181a);
  group.add(rodBetween([kx, yPB + 0.004, kzW], [kx, yc0 - 0.015, kzW], CABLE_R, cabMat, cp, 12));   // plug → conduit
  if (endCable.length === 2) group.add(rodBetween(endCable[0], endCable[1], CABLE_R, cabMat, cp, 12));
  else {
    const c = new THREE.CatmullRomCurve3(endCable.map(v => new THREE.Vector3(...v)), false, 'centripetal');
    group.add(mesh(new THREE.TubeGeometry(c, Math.ceil(c.getLength() / 0.006), CABLE_R, 10, false), cabMat, cp));
  }
  if (tagText) { const o = tag(tagText, cp); o.position.set(...tagAt); group.add(o); }
  return { kx, kzW, yS, pol };
}
