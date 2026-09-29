import * as THREE from 'three';
import { CAGE } from '../config.js';
import { MAT } from '../materials.js';
import { mesh, rodBetween } from '../geometry.js';
import { dimension, tag } from '../labels.js';
import { LAYER } from '../render.js';
import { sp21Cable } from '../model/sp21.js';

// Perangkat peringatan EWS (dipakai EWS Longsor & EWS Banjir), satuan m. Permintaan user: horn dan standing light di tiang.
// Keduanya dipasang di satu bracket (plat + 2 U-bolt + lengan hollow 40×40) di antara antipanjat dan bracket panel surya:
// standing light (tower light 3 susun hijau – kuning – merah) berdiri di ujung kiri, horn di ujung kanan menghadap ke depan
// krangkeng (+Z), miring turun. Horn & standing light masing-masing punya kabel + conduit sendiri ke konektor SP21 di box.
// Semua ukuran, jalur kabel, bracket, horn & lampu = perkiraan.
export const BRACKET = {
  drop: 0.64,                                   // sumbu lengan di bawah ujung tiang
  plateW: 0.14, plateH: 0.2, plateT: 0.006,     // plat dudukan di muka depan tiang
  ubDY: 0.07, ubR: 0.005,                       // 2 U-bolt M10, ± 70 mm dari sumbu lengan
  half: 0.6, size: 0.04, wall: 0.002,           // lengan hollow 40×40×2, 600 mm ke kiri & kanan
};
export const HORN = { x: 0.5, axisUp: 0.15, mouthR: 0.12, bellL: 0.26, throatR: 0.035, driverR: 0.055, driverL: 0.1, tilt: 10 };
export const LIGHT = { x: -0.56, R: 0.03, baseH: 0.045, tierH: 0.055, capH: 0.022, ring: 0.004 };
const TIERS = [                                        // bawah → atas
  { name: 'Hijau', on: 0x35e06a, off: 0x1f6b3a },
  { name: 'Kuning', on: 0xffb81f, off: 0x8a6414 },
  { name: 'Merah', on: 0xff3b30, off: 0x86201c },
];
export const armY = d => d.yTop - BRACKET.drop;
// antipanjat harus cukup rendah agar bracket muat di bawah panel surya
export const alarmEncYMax = d => d.yTop - BRACKET.drop - BRACKET.plateH / 2 - 0.08 - CAGE.H / 2000 - 0.55;
// Titik di sekeliling tiang: sudut (derajat, 0 = +X, 90 = depan), tinggi, jarak dari sumbu tiang
export const pol = (deg, y, r = 0.063) => [r * Math.cos(THREE.MathUtils.degToRad(deg)), y, r * Math.sin(THREE.MathUtils.degToRad(deg))];
// Langkah explode: setelah panel surya — mur U-bolt dilepas, U-bolt ditarik ke belakang, bracket + horn + lampu dijauhkan
export const ALARM_STEP = { key: 'ews', before: 'ac', w: 12, label: 'lepas U-bolt, bracket horn + lampu dijauhkan' };

// Tekstur halo lampu (gradasi radial putih → transparan)
let haloTex = null;
function halo() {
  if (!haloTex) {
    const cv = Object.assign(document.createElement('canvas'), { width: 64, height: 64 }), x = cv.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    haloTex = new THREE.CanvasTexture(cv); haloTex.colorSpace = THREE.SRGBColorSpace;
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.layers.set(LAYER.NO_AO); s.visible = false;
  return s;
}

// Bracket + standing light + horn + kabelnya ke `root` (anak model). cables.horn / cables.light (opsional):
//   { phi, yH, gap, route: yA => [titik …] } — sudut & tinggi belok ke tiang, lalu jalur naik di tiang; titik terakhir
//   route = titik di tiang tempat conduit lepas ke bawah lengan bracket. Bawaan: naik lurus di 40° (horn) & 140° (lampu).
export function buildAlarm(model, root, { cables = {} } = {}) {
  const d = model.userData.d, ro = model.userData.station.ro, B = BRACKET;
  const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
  const yA = armY(d), zP = ro + B.plateT, zA = zP + B.size / 2, yTopArm = yA + B.size / 2;
  const U = {};
  const blue = MAT.paint();

  // ---------- Bracket: plat dudukan + lengan hollow (dilas), 2 U-bolt melingkar di belakang tiang ----------
  const asm = U.asm = new THREE.Group(), ub = U.ubolt = new THREE.Group(), nuts = U.nuts = new THREE.Group();
  root.add(asm, ub, nuts);
  const plate = new THREE.Shape(), uR = ro + B.ubR;
  plate.moveTo(-B.plateW / 2, -B.plateH / 2); plate.lineTo(B.plateW / 2, -B.plateH / 2); plate.lineTo(B.plateW / 2, B.plateH / 2); plate.lineTo(-B.plateW / 2, B.plateH / 2); plate.closePath();
  for (const dy of [-B.ubDY, B.ubDY]) for (const sx of [-1, 1]) { const h = new THREE.Path(); h.absarc(sx * uR, dy, 0.0055, 0, Math.PI * 2, true); plate.holes.push(h); }
  asm.add(at(mesh(new THREE.ExtrudeGeometry(plate, { depth: B.plateT, bevelEnabled: false, curveSegments: 16 }), blue, 'ewsBracket'), 0, yA, ro));
  const sq = new THREE.Shape(), s2 = B.size / 2, i2 = s2 - B.wall;
  sq.moveTo(-s2, -s2); sq.lineTo(s2, -s2); sq.lineTo(s2, s2); sq.lineTo(-s2, s2); sq.closePath();
  const sqH = new THREE.Path(); sqH.moveTo(-i2, -i2); sqH.lineTo(-i2, i2); sqH.lineTo(i2, i2); sqH.lineTo(i2, -i2); sqH.closePath(); sq.holes.push(sqH);
  const armGeo = new THREE.ExtrudeGeometry(sq, { depth: 2 * B.half, bevelEnabled: false }).translate(0, 0, -B.half).rotateY(Math.PI / 2);
  asm.add(at(mesh(armGeo, blue, 'ewsBracket'), 0, yA, zA));
  const uNut = new THREE.CylinderGeometry(0.0098, 0.0098, 0.008, 6).rotateX(Math.PI / 2);
  for (const dy of [-B.ubDY, B.ubDY]) {
    const y = yA + dy, arc = mesh(new THREE.TorusGeometry(uR, B.ubR, 8, 40, Math.PI), MAT.bolt(), 'ewsBracket');
    arc.rotation.x = Math.PI / 2; arc.rotation.z = Math.PI; arc.position.y = y; ub.add(arc);   // busur di belakang tiang
    for (const sx of [-1, 1]) {
      ub.add(rodBetween([sx * uR, y, 0], [sx * uR, y, zP + 0.016], B.ubR, MAT.bolt(), 'ewsBracket'));
      nuts.add(at(mesh(uNut, MAT.nut(), 'ewsBracket'), sx * uR, y, zP + 0.004));
    }
  }
  const brTag = tag('Bracket horn + lampu', 'ewsBracket', { maxDist: 4 }); brTag.position.set(0.18, yA - 0.03, zA + 0.03); asm.add(brTag);

  // ---------- Standing light: tower light 3 susun (hijau – kuning – merah) berdiri di ujung kiri lengan ----------
  const L = LIGHT, lg = new THREE.Group(); lg.position.set(L.x, yTopArm, zA); asm.add(lg);
  const grey = new THREE.MeshStandardMaterial({ color: 0x5a5f66, roughness: 0.5 });
  lg.add(at(mesh(new THREE.CylinderGeometry(L.R + 0.006, L.R + 0.006, 0.006, 32), grey, 'ewsLight'), 0, 0.003, 0),   // flens dudukan
         at(mesh(new THREE.CylinderGeometry(L.R, L.R, L.baseH, 32), MAT.plastic(), 'ewsLight'), 0, 0.006 + L.baseH / 2, 0));
  lg.add(at(mesh(new THREE.CylinderGeometry(0.0065, 0.0075, 0.012, 16).rotateZ(-Math.PI / 2), MAT.plastic(), 'ewsLight'), L.R + 0.005, 0.026, 0));   // cable gland
  U.tiers = [];
  let y = 0.006 + L.baseH;
  for (const T of TIERS) {
    lg.add(at(mesh(new THREE.CylinderGeometry(L.R + 0.0005, L.R + 0.0005, L.ring, 32), grey, 'ewsLight'), 0, y + L.ring / 2, 0));
    y += L.ring;
    const mat = new THREE.MeshStandardMaterial({ color: T.off, roughness: 0.22, metalness: 0 });
    lg.add(at(mesh(new THREE.CylinderGeometry(L.R, L.R, L.tierH, 32), mat, 'ewsLight'), 0, y + L.tierH / 2, 0));
    U.tiers.push({ mat, y: y + L.tierH / 2, T, lit: false });
    y += L.tierH;
  }
  lg.add(at(mesh(new THREE.CylinderGeometry(L.R + 0.0005, L.R + 0.0005, L.ring, 32), grey, 'ewsLight'), 0, y + L.ring / 2, 0));
  y += L.ring;
  const capG = new THREE.SphereGeometry(L.R, 32, 8, 0, Math.PI * 2, 0, Math.PI / 2); capG.scale(1, L.capH / L.R, 1);
  lg.add(at(mesh(capG, grey, 'ewsLight'), 0, y, 0));
  U.halo = halo(); lg.add(U.halo);
  const ltTag = tag('Standing light', 'ewsLight'); ltTag.position.set(L.R + 0.01, y - 0.05, 0); lg.add(ltTag);

  // ---------- Horn speaker di ujung kanan: dudukan U di atas lengan, horn menghadap depan, miring turun ----------
  const H = HORN, hx = H.x, hy = yTopArm + H.axisUp, horn = new THREE.Group();
  horn.position.set(hx, hy, zA); horn.rotation.x = THREE.MathUtils.degToRad(H.tilt); asm.add(horn);
  const hornMat = new THREE.MeshStandardMaterial({ color: 0xdcdad2, roughness: 0.45, side: THREE.DoubleSide });
  const zB0 = H.driverL / 2 + 0.02, k = Math.log(H.mouthR / H.throatR) / H.bellL, pts = [];
  for (let i = 0; i <= 24; i++) { const s = i / 24 * H.bellL; pts.push(new THREE.Vector2(H.throatR * Math.exp(k * s), s)); }
  for (let i = 24; i >= 0; i--) { const s = i / 24 * H.bellL; pts.push(new THREE.Vector2(H.throatR * Math.exp(k * s) - 0.003, s)); }
  const bell = new THREE.LatheGeometry(pts, 48).rotateX(Math.PI / 2).translate(0, 0, zB0);
  const lip = new THREE.TorusGeometry(H.mouthR - 0.0015, 0.004, 8, 48).translate(0, 0, zB0 + H.bellL);
  horn.add(
    mesh(bell, hornMat, 'ewsHorn'), mesh(lip, hornMat, 'ewsHorn'),
    mesh(new THREE.CylinderGeometry(H.throatR + 0.004, H.throatR + 0.004, 0.02, 32).rotateX(Math.PI / 2).translate(0, 0, zB0 - 0.01), hornMat, 'ewsHorn'),   // leher
    mesh(new THREE.CylinderGeometry(H.driverR, H.driverR, H.driverL, 40).rotateX(Math.PI / 2), hornMat, 'ewsHorn'),                                  // unit driver
    mesh(new THREE.SphereGeometry(H.driverR, 40, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.35, 1).rotateX(-Math.PI / 2).translate(0, 0, -H.driverL / 2), hornMat, 'ewsHorn'),
    at(mesh(new THREE.CylinderGeometry(0.0065, 0.0075, 0.014, 16).rotateX(Math.PI / 2), MAT.plastic(), 'ewsHorn'), 0, -0.02, -H.driverL / 2 - 0.021),   // cable gland
  );
  const hornGland = new THREE.Object3D(); hornGland.position.set(0, -0.02, -H.driverL / 2 - 0.029); horn.add(hornGland);
  // Dudukan U: plat dasar dibaut ke atas lengan, 2 kaki tegak ke baut pivot di sisi driver
  const hb = new THREE.Group(); hb.position.set(hx, yTopArm, zA); asm.add(hb);
  const legX = H.driverR + 0.008, legH = H.axisUp;
  hb.add(at(mesh(new THREE.BoxGeometry(2 * legX + 0.006, 0.004, B.size), MAT.galv(), 'ewsHorn'), 0, 0.002, 0));
  for (const sx of [-1, 1]) {
    hb.add(at(mesh(new THREE.BoxGeometry(0.004, legH + 0.012, 0.026), MAT.galv(), 'ewsHorn'), sx * legX, legH / 2 + 0.002, 0),
           at(mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.006, 6).rotateZ(Math.PI / 2), MAT.nut(), 'ewsHorn'), sx * (legX + 0.005), legH, 0));   // baut pivot
    hb.add(at(mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.005, 6), MAT.nut(), 'ewsHorn'), sx * 0.03, 0.0065, 0));                         // baut ke lengan
  }
  // Gelombang suara (visual saat horn berbunyi)
  U.waves = [];
  for (let i = 0; i < 3; i++) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 6, 48), new THREE.MeshBasicMaterial({ color: 0xff8a1f, transparent: true, depthWrite: false }));
    w.layers.set(LAYER.NO_AO); w.visible = false; horn.add(w); U.waves.push(w);
  }
  U.hornMouthZ = zB0 + H.bellL;
  const hnTag = tag('Horn speaker', 'ewsHorn'); hnTag.position.set(H.mouthR + 0.01, 0.05, zB0 + H.bellL / 2); horn.add(hnTag);
  asm.add(dimension([L.x, yA - 0.07, zA], [hx, yA - 0.07, zA], [0, 0.015, 0], `${((hx - L.x) * 1000).toFixed(0)} mm`, 5));

  // ---------- Kabel horn & standing light: SP21 di box → conduit naik di tiang (di belakang krangkeng, celah jari
  // antipanjat) → menyusuri bawah lengan → kabel masuk cable gland perangkat ----------
  const S = model.userData.station, rad = THREE.MathUtils.degToRad;
  model.updateMatrixWorld(true);
  const hg = hornGland.getWorldPosition(new THREE.Vector3());        // model di titik asal: dunia = lokal model
  const hgIn = hg.clone().add(new THREE.Vector3(0, Math.sin(rad(H.tilt)), -Math.cos(rad(H.tilt))).multiplyScalar(0.02));
  const yU = yA - B.size / 2 - 0.009, yLg = yTopArm + 0.026, xLg = L.x + L.R + 0.011;   // conduit di bawah lengan; gland lampu
  const devCable = (sx, def, cfg, slot, part, tagText, plugTag, endCable) => {
    const grp = new THREE.Group(); root.add(grp);
    const { phi = def.phi, yH = def.yH, gap } = cfg, route = cfg.route?.(yA) ?? [pol(phi, yA - 0.13)], top = route.at(-1);
    const topDeg = THREE.MathUtils.radToDeg(Math.atan2(top[2], top[0]));
    sp21Cable(S, { slot, wireToY: -0.1085, group: grp, phi, yH, gap, part, endCable, tagText, plugTag,
      tagAt: pol(topDeg, d.acY + 0.14, 0.075),
      route,
      tail: [top, [sx * 0.085, yA - 0.11, 0.045], [sx * 0.1, yA - 0.06, zA - 0.005], [sx * 0.125, yU, zA], [sx * 0.25, yU, zA], [sx * 0.4, yU, zA]] });
    grp.traverse(o => { if (o.userData.isTag) o.userData.when = () => !(U.cableFade > 0.5); });   // label ikut hilang saat kabel dilepas
    return grp;
  };
  U.hornCable = devCable(1, { phi: 40, yH: S.cy - 0.49 }, cables.horn ?? {}, -2, 'ewsHornCable', 'Kabel horn + conduit', 'SP21 horn', [
    [0.405, yU, zA], [0.43, yU + 0.012, zA - 0.028], [0.455, yTopArm + 0.02, zA - 0.06], [0.49, hg.y - 0.035, hgIn.z - 0.012], hgIn.toArray(), hg.toArray()]);
  U.lightCable = devCable(-1, { phi: 140, yH: S.cy - 0.53 }, cables.light ?? {}, -3, 'ewsLightCable', 'Kabel standing light + conduit', 'SP21 lampu', [
    [-0.405, yU, zA], [-0.43, yU + 0.012, zA - 0.028], [-0.47, yTopArm + 0.012, zA - 0.035], [-0.495, yLg, zA - 0.012], [xLg + 0.014, yLg, zA], [xLg, yLg, zA]]);
  return U;
}

// Per frame: st = { tier (−1 = mati), blink, horn }; night 0..1 (pendar lebih lebar di malam hari).
// Mengembalikan kunci tampilan lampu (berubah → gambar ulang).
export function driveAlarm(U, st, now, night = 0) {
  const blinkOn = !st.blink || now % 1000 < 600;
  let key = '';
  U.tiers.forEach((t, i) => {
    const lit = i === st.tier && blinkOn;
    if (lit) { t.mat.color.setHex(t.T.on); t.mat.emissive.setHex(t.T.on); t.mat.emissiveIntensity = 1.6; }
    else if (t.lit) { t.mat.color.setHex(t.T.off); t.mat.emissive.setHex(0); t.mat.emissiveIntensity = 0; }
    t.lit = lit; key += lit ? i : '-';
  });
  const litT = U.tiers.find(t => t.lit);
  U.halo.visible = !!litT;
  if (litT) { U.halo.position.set(0, litT.y, 0); U.halo.material.color.setHex(litT.T.on); U.halo.scale.setScalar(0.22 + 0.5 * night); }
  for (const [i, w] of U.waves.entries()) {
    w.visible = !!st.horn;
    if (!st.horn) continue;
    const p = (now / 1500 + i / 3) % 1, r = HORN.mouthR + 0.5 * p;
    w.scale.set(r, r, r); w.position.z = U.hornMouthZ + 0.03 + 1.2 * p;
    w.material.opacity = 0.75 * (1 - p) * Math.min(1, p * 6);
  }
  return key;
}

// Explode: bracket dijauhkan (langkah ALARM_STEP); kabel horn, lampu (+ extra) turun lalu dilepas (memudar) pada langkah 'cable'
export function alarmExplode(U, seg, extra = []) {
  const eN = seg('ews', 0, 0.33), eU = seg('ews', 0.2, 0.6), eA = seg('ews', 0.47, 1);
  U.nuts.position.z = 0.1 * eN + 0.6 * eA;
  U.ubolt.position.z = -0.3 * eU;
  U.asm.position.z = 0.6 * eA;
  const eDn = seg('cable', 0, 0.44), eOff = seg('cable', 0.44, 1);
  U.cableFade = eOff;
  for (const g of [...extra, U.hornCable, U.lightCable]) {
    g.position.y = -0.06 * eDn; g.visible = eOff < 0.999;
    g.traverse(o => {
      if (!o.isMesh) return;
      const m = o.material, tr = eOff > 0;
      if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }
      m.opacity = 1 - eOff; m.depthWrite = !tr;
    });
  }
}

const mm = v => Math.round(v * 1000);
export const alarmParts = (group, { bunyi, simulasi, hornJalur, lampuJalur, hadap = 'depan krangkeng' }) => ({
  ewsBracket: { name: 'Bracket Horn + Standing Light', group, specs: d => [
    ['Plat dudukan', `${mm(BRACKET.plateW)} × ${mm(BRACKET.plateH)} × ${mm(BRACKET.plateT)} mm (perkiraan), cat biru`],
    ['Lengan', `Hollow 40×40×2, ${mm(2 * BRACKET.half)} mm (perkiraan), dilas ke plat`],
    ['Klem ke tiang', '2 × U-bolt M10'],
    ['Posisi', `${mm(BRACKET.drop)} mm di bawah ujung tiang, di atas antipanjat (${armY(d).toFixed(2)} m dari tanah)`],
  ]},
  ewsHorn: { name: 'Horn Speaker', group, specs: () => [
    ['Bentuk', 'Horn bulat (corong) + unit driver'],
    ['Ukuran', `Corong Ø${mm(2 * HORN.mouthR)} mm, panjang ± ${mm(HORN.bellL + HORN.driverL + 0.02)} mm (perkiraan)`],
    ['Pasang', `Dudukan U di ujung kanan lengan, menghadap ${hadap}, miring turun ${HORN.tilt}°`],
    ['Bunyi', bunyi],
  ]},
  ewsLight: { name: 'Standing Light (Tower Light)', group, specs: () => [
    ['Susunan', 'Hijau (bawah) – kuning – merah (atas)'],
    ['Ukuran', `Ø${mm(2 * LIGHT.R)} mm, tinggi ± ${mm(LIGHT.baseH + 3 * LIGHT.tierH + 4 * LIGHT.ring + LIGHT.capH + 0.006)} mm (perkiraan)`],
    ['Pasang', 'Berdiri di ujung kiri lengan'],
    ['Simulasi', simulasi],
  ]},
  ewsHornCable: { name: 'Kabel Horn', group, specs: () => [
    ['Dari', 'Konektor SP21 di box (slot ke-3 dari kanan)'],
    ['Jalur', hornJalur],
    ['Ke', 'Cable gland di belakang unit driver horn'],
  ]},
  ewsLightCable: { name: 'Kabel Standing Light', group, specs: () => [
    ['Dari', 'Konektor SP21 di box (slot ke-4 dari kanan)'],
    ['Jalur', lampuJalur],
    ['Ke', 'Cable gland di sisi dasar lampu'],
  ]},
});
