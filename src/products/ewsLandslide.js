import * as THREE from 'three';
import { CAGE, F_ABOVE } from '../config.js';
import { MAT } from '../materials.js';
import { mesh, rodBetween, roundedPath } from '../geometry.js';
import { dimension, tag } from '../labels.js';
import { LAYER } from '../render.js';
import { CABLE_R, sp21Cable } from '../model/sp21.js';
import { CLIFF, SLIDE, buildTerrain, groundY, surfacePoint, zCrest } from './ewsCliff.js';
import { EWS_SENSORS } from '../world.js';

// EWS Longsor (satuan m). Permintaan user: stasiun monopole di atas tebing, di tiang ditambah horn dan standing light;
// 5 tiltmeter 3 axis (bentuk kotak) di titik rawan longsor pada lereng, masing-masing di atas plinth beton yang muka
// atasnya datar (cukup untuk sensor saja); ada simulasi longsor.
// Horn & standing light dipasang di satu bracket (plat + 2 U-bolt + lengan hollow 40×40) di antara antipanjat dan
// bracket panel surya: standing light berdiri di ujung kiri, horn di ujung kanan menghadap ke lembah (+Z).
// Tiltmeter = slave, dirangkai seri (daisy chain): logger (master) → SP21 di box → T1 → T2 → T3 → T4 → T5.
// Tiap slave punya 2 cable gland (IN di sisi −x, OUT di sisi +x); T5 ujung rantai (hanya IN).
// Horn & standing light masing-masing punya kabel + conduit sendiri ke konektor SP21 di box.
// Semua ukuran, jalur kabel, bracket, horn, lampu, tiltmeter, plinth, tebing & ambang = perkiraan; protokol bus belum dikonfirmasi.
export const BRACKET = {
  drop: 0.64,                                   // sumbu lengan di bawah ujung tiang
  plateW: 0.14, plateH: 0.2, plateT: 0.006,     // plat dudukan di muka depan tiang
  ubDY: 0.07, ubR: 0.005,                       // 2 U-bolt M10, ± 70 mm dari sumbu lengan
  half: 0.6, size: 0.04, wall: 0.002,           // lengan hollow 40×40×2, 600 mm ke kiri & kanan
};
export const HORN = { x: 0.5, axisUp: 0.15, mouthR: 0.12, bellL: 0.26, throatR: 0.035, driverR: 0.055, driverL: 0.1, tilt: 10 };
export const LIGHT = { x: -0.56, R: 0.03, baseH: 0.045, tierH: 0.055, capH: 0.022, ring: 0.004 };
export const TILT = { w: 0.16, d: 0.12, h: 0.075 };                 // badan tiltmeter
export const PLINTH = { w: 0.24, d: 0.2, above: 0.05, embed: 0.3 };  // muka atas datar; tertanam di bawah titik lereng terendah
export const LIMIT = { waspada: 1, awas: 3 };                        // ambang kemiringan total (°)
// 5 titik rawan (world.js): x, u = jarak mendatar dari tepi tebing (lereng tanah ± 38°). zone = massa tanah yang ikut longsor.
export const SITES = EWS_SENSORS;
const TIERS = [                                        // bawah → atas
  { name: 'Hijau', on: 0x35e06a, off: 0x1f6b3a },
  { name: 'Kuning', on: 0xffb81f, off: 0x8a6414 },
  { name: 'Merah', on: 0xff3b30, off: 0x86201c },
];
const STATUS = {
  off:     { label: 'Mati',    tier: -1 },
  aman:    { label: 'Aman',    tier: 0 },
  waspada: { label: 'Waspada', tier: 1, blink: true, horn: true },
  awas:    { label: 'Awas',    tier: 2, blink: true, horn: true },
};
const levelOf = deg => deg >= LIMIT.awas ? 'awas' : deg >= LIMIT.waspada ? 'waspada' : 'aman';
// Kemajuan longsor (tau 0..1 → besar gerakan A): rayapan pelan (sensor mulai miring), lalu runtuh
// Rayapan pelan (retak & miring beberapa derajat) sampai tau 0,5 → runtuh cepat lalu melambat saat menimbun lembah
const SIM_MS = 18000;
const slideA = tau => tau < 0.5 ? 0.07 * (tau / 0.5) ** 2 : 0.07 + 0.93 * (1 - (1 - (tau - 0.5) / 0.5) ** 3);
let status = 'aman', cur = null, lastKey = '', ui = null;
const sim = { site: 2, tau: 0, tau0: 0, t0: 0, running: false, auto: true };   // site = indeks titik awal, −1 = semua titik
// Longsor merambat: titik awal bergerak penuh; titik tetangga menyusul dengan jeda & besar makin kecil menurut jarak urutan.
// Pilihan "semua titik" = longsor besar satu lereng (semua titik penuh, jeda kecil berurutan dari tengah).
const SPREAD = { delay: 0.1, fall: 0.22, min: 0.3 };
function zoneAmounts(tau) {
  return SITES.map((S, i) => {
    const k = sim.site < 0 ? Math.abs(i - 2) * 0.4 : Math.abs(i - sim.site), w = sim.site < 0 ? 1 : Math.max(SPREAD.min, 1 - SPREAD.fall * k);
    const d = Math.min(0.5, SPREAD.delay * k), t = THREE.MathUtils.clamp((tau - d) / (1 - d), 0, 1);
    return { zone: S.zone, A: w * slideA(t) };
  });
}

const armY = d => d.yTop - BRACKET.drop;

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

function extend(model) {
  const d = model.userData.d, ro = model.userData.station.ro, B = BRACKET;
  const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
  const yA = armY(d), zP = ro + B.plateT, zA = zP + B.size / 2, yTopArm = yA + B.size / 2;
  const root = new THREE.Group(); root.name = 'ews'; model.add(root);
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
  // Gelombang suara (visual saat status Awas)
  U.waves = [];
  for (let i = 0; i < 3; i++) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 6, 48), new THREE.MeshBasicMaterial({ color: 0xff8a1f, transparent: true, depthWrite: false }));
    w.layers.set(LAYER.NO_AO); w.visible = false; horn.add(w); U.waves.push(w);
  }
  U.hornMouthZ = zB0 + H.bellL;
  const hnTag = tag('Horn speaker', 'ewsHorn'); hnTag.position.set(H.mouthR + 0.01, 0.05, zB0 + H.bellL / 2); horn.add(hnTag);
  asm.add(dimension([L.x, yA - 0.07, zA], [hx, yA - 0.07, zA], [0, 0.015, 0], `${((hx - L.x) * 1000).toFixed(0)} mm`, 5));

  // ---------- Kabel horn & standing light: SP21 di box → conduit naik di sisi depan tiang (di belakang krangkeng,
  // celah jari antipanjat) → menyusuri bawah lengan → kabel masuk cable gland perangkat ----------
  const S = model.userData.station, rad = THREE.MathUtils.degToRad;
  const pol = (deg, y, r = 0.063) => [r * Math.cos(rad(deg)), y, r * Math.sin(rad(deg))];
  model.updateMatrixWorld(true);
  const hg = hornGland.getWorldPosition(new THREE.Vector3());        // model di titik asal: dunia = lokal model
  const hgIn = hg.clone().add(new THREE.Vector3(0, Math.sin(rad(H.tilt)), -Math.cos(rad(H.tilt))).multiplyScalar(0.02));
  const yU = yA - B.size / 2 - 0.009, yLg = yTopArm + 0.026, xLg = L.x + L.R + 0.011;   // conduit di bawah lengan; gland lampu
  const devCable = (sx, phi, slot, yH, part, tagText, plugTag, endCable) => {
    const grp = new THREE.Group(); root.add(grp);
    sp21Cable(S, { slot, wireToY: -0.1085, group: grp, phi, yH, part, endCable, tagText, plugTag,
      tagAt: pol(phi, d.acY + 0.14, 0.075),
      route: [pol(phi, yA - 0.13)],
      tail: [pol(phi, yA - 0.13), [sx * 0.085, yA - 0.11, 0.045], [sx * 0.1, yA - 0.06, zA - 0.005], [sx * 0.125, yU, zA], [sx * 0.25, yU, zA], [sx * 0.4, yU, zA]] });
    return grp;
  };
  U.hornCable = devCable(1, 40, -2, S.cy - 0.49, 'ewsHornCable', 'Kabel horn + conduit', 'SP21 horn', [
    [0.405, yU, zA], [0.43, yU + 0.012, zA - 0.028], [0.455, yTopArm + 0.02, zA - 0.06], [0.49, hg.y - 0.035, hgIn.z - 0.012], hgIn.toArray(), hg.toArray()]);
  U.lightCable = devCable(-1, 140, -3, S.cy - 0.53, 'ewsLightCable', 'Kabel standing light + conduit', 'SP21 lampu', [
    [-0.405, yU, zA], [-0.43, yU + 0.012, zA - 0.028], [-0.47, yTopArm + 0.012, zA - 0.035], [-0.495, yLg, zA - 0.012], [xLg + 0.014, yLg, zA], [xLg, yLg, zA]]);

  // ---------- Kabel bus tiltmeter (stasiun): SP21 di box → conduit turun di tiang → melewati base plate & pondasi → tanah ----------
  const fwH = d.fw / 2000, yP1 = d.yP1, yF = F_ABOVE / 1000, zG = fwH + 0.2, xB = 0.08;
  U.busCable = new THREE.Group(); root.add(U.busCable);
  sp21Cable(S, { slot: -1, wireToY: -0.1085, group: U.busCable, phi: 67.5, yH: S.cy - 0.45, part: 'ewsBusCable',
    route: [pol(67.5, yP1 + 0.17)],
    tail: [pol(67.5, yP1 + 0.17), pol(67.5, yP1 + 0.15, 0.12), [0.075, yP1 + 0.1, 0.2], [xB, yF + 0.009, 0.27], [xB, yF + 0.009, fwH - 0.04],
           [xB, yF - 0.01, fwH + 0.012], [xB, 0.04, fwH + 0.012], [xB, 0.009, fwH + 0.07], [xB, 0.009, zG]],
    endCable: [[xB, 0.009, zG - 0.005], [xB, CABLE_R + 0.002, zG + 0.03]],
    tagText: 'Kabel bus tiltmeter + conduit', tagAt: pol(67.5, yP1 + 0.5, 0.075), plugTag: 'SP21 bus tiltmeter (master)' });
  for (const g of [U.hornCable, U.lightCable, U.busCable])           // label ikut hilang saat kabel dilepas (explode)
    g.traverse(o => { if (o.userData.isTag) o.userData.when = () => !(U.cableFade > 0.5); });

  // ---------- Medan: punggung tebing (stasiun), gawir, lereng rawan longsor, dataran bawah ----------
  const T = U.terrain = buildTerrain(); root.add(T.mesh);
  const cTag = tag('Tebing / lereng rawan longsor', 'cliff'); cTag.position.set(-2.2, -3.4, zCrest(-2.2) + 2.6); root.add(cTag);
  const xH = -2.6, uH = 13.5, zH = zCrest(xH) + uH;
  root.add(dimension([-0.9, 0.03, 0], [-0.9, 0.03, zCrest(-0.9)], [0.12, 0, 0], `${CLIFF.crest.toFixed(2)} m ke tepi tebing`, 20),
           dimension([xH, groundY(xH, uH), zH], [xH, 0, zH], [0.15, 0, 0], `± ${CLIFF.drop} m`, 45));

  // ---------- 5 tiltmeter 3 axis di atas plinth beton (muka atas datar, cukup untuk sensor) ----------
  const conc = MAT.concrete(), body = new THREE.MeshStandardMaterial({ color: 0xd9dcd5, roughness: 0.5 });
  const lidMat = new THREE.MeshStandardMaterial({ color: 0xc4c8c1, roughness: 0.45 }), zoneMat = new THREE.LineBasicMaterial({ color: 0xff8a1f });
  const { w: tw, d: td, h: th } = TILT;
  const cabMat = U.cabMat = MAT.wire(0x17181a), _p = new THREE.Vector3(), nS = SITES.length;
  U.sites = SITES.map((S, i) => {
    const P = PLINTH;
    let yMax = -Infinity, yMin = Infinity;
    for (const dx of [-P.w / 2, 0, P.w / 2]) for (const du of [-P.d / 2, 0, P.d / 2]) {
      const y = groundY(S.x + dx, S.u + du); yMax = Math.max(yMax, y); yMin = Math.min(yMin, y);
    }
    const top = yMax + P.above, hP = top - (yMin - P.embed);
    const g = new THREE.Group(), rot = new THREE.Group(), s = new THREE.Group();
    g.position.set(S.x, top, zCrest(S.x) + S.u); root.add(g); g.add(rot); rot.add(s);   // rot berporos di muka atas plinth
    rot.add(at(mesh(new THREE.BoxGeometry(P.w, hP, P.d), conc, 'tiltPlinth'), 0, -hP / 2, 0));
    s.add(at(mesh(new THREE.BoxGeometry(tw, th * 0.78, td), body, 'tiltmeter'), 0, th * 0.39, 0),
          at(mesh(new THREE.BoxGeometry(tw + 0.004, th * 0.22, td + 0.004), lidMat, 'tiltmeter'), 0, th * 0.89, 0),     // tutup
          at(mesh(new THREE.BoxGeometry(0.1, 0.001, 0.07), new THREE.MeshStandardMaterial({ map: idLabel(S.id, i), roughness: 0.6 }), 'tiltmeter'), 0, th + 0.0005, 0));   // stiker ID
    for (const sz of [-1, 1]) {                                                                                     // kuping + 2 baut angkur
      s.add(at(mesh(new THREE.BoxGeometry(0.06, 0.004, 0.022), MAT.galv(), 'tiltmeter'), 0, 0.002, sz * (td / 2 + 0.011)));
      for (const bx of [-0.018, 0.018]) s.add(at(mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.005, 6), MAT.nut(), 'tiltmeter'), bx, 0.0065, sz * (td / 2 + 0.012)));
    }
    // Cable gland IN (−x) & OUT (+x); kabel keluar gland, turun menempel sisi plinth sampai tanah (ikut plinth saat longsor)
    const yg = th * 0.4, drops = {}, gy = dx => Math.min(-0.05, T.sample(S.x + dx, S.u, _p).y - top);
    for (const sx of i < nS - 1 ? [-1, 1] : [-1]) {
      s.add(at(mesh(new THREE.CylinderGeometry(0.0075, 0.0085, 0.016, 16).rotateZ(Math.PI / 2), MAT.plastic(), 'tiltmeter'), sx * (tw / 2 + 0.008), yg, 0));
      const xe = P.w / 2 + 0.006, yD = gy(sx * xe), end = new THREE.Vector3(sx * (P.w / 2 + 0.07), gy(sx * (P.w / 2 + 0.07)) + CABLE_R + 0.002, 0);
      const c = new THREE.CatmullRomCurve3([[sx * (tw / 2 + 0.016), yg, 0], [sx * (P.w / 2 - 0.006), yg - 0.004, 0], [sx * xe, -0.016, 0],
        [sx * xe, yD + 0.035, 0], [sx * (P.w / 2 + 0.03), yD + CABLE_R + 0.006, 0], end.toArray()].map(v => new THREE.Vector3(...v)), false, 'centripetal');
      rot.add(mesh(new THREE.TubeGeometry(c, 40, CABLE_R, 8, false), cabMat, 'ewsBusCable'));
      drops[sx] = { end, param: [S.x + end.x, S.u] };
    }
    const label = `${S.id} · slave ${i + 1}${i === nS - 1 ? ' (ujung)' : ''}`;
    const tg = tag(label, 'tiltmeter', { maxDist: 30 }); tg.position.set(tw / 2 + 0.03, th, 0); s.add(tg);
    if (i === 2) { const pt = tag('Plinth beton (muka atas datar)', 'tiltPlinth', { maxDist: 10 }); pt.position.set(P.w / 2, -0.12, P.d / 2); rot.add(pt); }
    // Garis batas massa longsor untuk titik yang dipilih (tampil sebelum bergerak)
    const Z = S.zone, half = (Z.u1 - Z.u0) / 2, mid = (Z.u0 + Z.u1) / 2, pts = [];
    for (let k = 0; k < 96; k++) {
      const t = k / 96 * Math.PI * 2, c = Math.cos(t), sn = Math.sin(t);
      const x = S.x + Math.sign(c) * Math.abs(c) ** 0.6 * Z.a * 0.95, u = mid + (0.2 + 1.2 * Math.sign(sn) * Math.abs(sn) ** 0.6) * half;
      pts.push(new THREE.Vector3(x, groundY(x, u) + 0.06, zCrest(x) + u));
    }
    const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), zoneMat);
    outline.visible = false; root.add(outline);
    return { S, g, rot, base: g.position.clone(), tagEl: tg.element.querySelector('span'), label, drops, outline, read: [0, 0, 0] };
  });

  // ---------- Kabel bus seri di lapangan (mengikuti permukaan medan): logger → T1 → T2 → T3 → T4 → T5 ----------
  const busEnd = new THREE.Vector3(xB, CABLE_R + 0.002, zG + 0.03);
  const ends = (T, sx) => ({ world: () => T.drops[sx].end.clone().applyQuaternion(T.rot.quaternion).add(T.g.position), param: T.drops[sx].param });
  U.field = [{ a: { world: () => busEnd, param: [xB, busEnd.z - zCrest(xB)] }, via: [[-2.5, -2.3], [-7.8, -0.9], [-8.6, 1.2], [-9.1, 3.0]], b: ends(U.sites[0], -1) },
    ...U.sites.slice(0, -1).map((T0, k) => ({ a: ends(T0, 1), via: [], b: ends(U.sites[k + 1], -1) }))];
  const midTag = (p0, p1, text) => {
    const o = tag(text, 'ewsBusCable', { maxDist: 40 });
    o.position.copy(T.sample((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, new THREE.Vector3())); o.position.y += 0.05; root.add(o);
  };
  midTag(U.field[0].via[0], U.field[0].via[1], 'Kabel bus: logger → T1');
  midTag(U.field[2].a.param, U.field[2].b.param, 'Kabel bus seri T1 → T5');
  U.fieldRoot = new THREE.Group(); root.add(U.fieldRoot);
  buildField(U);

  // ---------- Batu berjatuhan & kepulan debu saat runtuh (visual, digerakkan oleh besar longsor tiap zona) ----------
  let seed = 7;
  const h = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const rocks = [];
  SITES.forEach((S, zi) => {
    for (let k = 0; k < 12; k++) rocks.push({ zi, dx: (h() * 2 - 1) * S.zone.a * 0.85, u0: S.zone.u0 + h() * 2.4, L: SLIDE.run * (0.8 + h() * 0.8) + 3 + h() * 7,
      r: 0.1 + h() ** 2 * 0.45, spin: h() * 6.28, side: h() * 2 - 1, delay: h() * 0.3 });
  });
  const rockMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x8b7a66, roughness: 0.95, flatShading: true }), rocks.length);
  rockMesh.castShadow = rockMesh.receiveShadow = true; rockMesh.frustumCulled = false; root.add(rockMesh);
  const dustTex = (() => {
    const cv = Object.assign(document.createElement('canvas'), { width: 64, height: 64 }), g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const dust = [];
  SITES.forEach((S, zi) => {
    for (let k = 0; k < 6; k++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex, color: 0xb9a384, transparent: true, depthWrite: false, opacity: 0 }));
      sp.layers.set(LAYER.NO_AO); sp.visible = false; root.add(sp);
      dust.push({ sp, zi, dx: (h() * 2 - 1) * S.zone.a, f: k / 5, delay: h() * 0.2, s: 0.7 + h() * 0.6 });
    }
  });
  U.debris = { rocks, rockMesh, dust };

  // Pohon, jalan, sungai AWLR, perbukitan & awan = dunia bersama (world.js), dibangun sekali oleh main.js

  cur = U; lastKey = ''; U.applied = null;          // medan baru: longsor diterapkan ulang di frame berikut
  model.userData.ews = U;
}

// Kabel bus di lapangan: titik ujung (gland plinth / ujung conduit) + sampel permukaan mesh tiap ± 0,12 m
function buildField(U) {
  const T = U.terrain, P = new THREE.Vector3(), N = new THREE.Vector3();
  for (const seg of U.field) {
    const A = seg.a.world(), B = seg.b.world(), ps = [seg.a.param, ...seg.via, seg.b.param], pts = [A];
    for (let k = 0; k < ps.length - 1; k++) {
      const [x0, u0] = ps[k], [x1, u1] = ps[k + 1], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, u1 - u0) / 0.12));
      for (let j = k === 0 ? 1 : 0; j < n; j++) {
        const t = j / n, x = x0 + (x1 - x0) * t, u = u0 + (u1 - u0) * t;
        T.sample(x, u, P, N); pts.push(P.clone().addScaledVector(N, CABLE_R + 0.003));
      }
    }
    pts.push(B);
    const c = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const geo = new THREE.TubeGeometry(c, Math.max(8, pts.length * 2), CABLE_R, 6, false);
    if (seg.mesh) { seg.mesh.geometry.dispose(); seg.mesh.geometry = geo; }
    else { seg.mesh = mesh(geo, U.cabMat, 'ewsBusCable'); seg.mesh.castShadow = false; U.fieldRoot.add(seg.mesh); }
  }
}

// Stiker ID di tutup tiltmeter
function idLabel(id, i) {
  const cv = Object.assign(document.createElement('canvas'), { width: 256, height: 180 }), g = cv.getContext('2d');
  g.fillStyle = '#f7f7f2'; g.fillRect(0, 0, 256, 180);
  g.strokeStyle = '#1c5cc7'; g.lineWidth = 8; g.strokeRect(6, 6, 244, 168);
  g.fillStyle = '#1c5cc7'; g.fillRect(6, 6, 244, 34);
  g.fillStyle = '#fff'; g.font = 'bold 20px sans-serif'; g.textAlign = 'center'; g.fillText('TILTMETER 3 AXIS', 128, 31);
  g.fillStyle = '#16181b'; g.font = 'bold 64px sans-serif'; g.fillText(id, 128, 106);
  g.font = 'bold 22px sans-serif'; g.fillText(`SLAVE · ID ${String(i + 1).padStart(2, '0')}`, 128, 136);
  g.font = '18px sans-serif'; g.fillText(i < SITES.length - 1 ? 'IN ◀        ▶ OUT' : 'IN ◀        UJUNG', 128, 162);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ---------- Simulasi longsor: medan berubah, plinth + sensor ikut bergeser & miring ----------
const V3 = THREE.Vector3, _a = new V3(), _b = new V3(), _c = new V3(), _d = new V3(), n0 = new V3(), n1 = new V3();
const deg = THREE.MathUtils.radToDeg;
function surfNormal(x, u, list, out) {                    // normal permukaan dari 4 titik tetangga (± 0,3 m)
  const h = 0.3;
  surfacePoint(x, u + h, list, _a); surfacePoint(x, u - h, list, _b); _a.sub(_b);
  surfacePoint(x + h, u, list, _c); surfacePoint(x - h, u, list, _d); _c.sub(_d);
  return out.crossVectors(_a, _c).normalize();
}
function applySlide(U) {
  const list = zoneAmounts(sim.tau), moving = list.some(e => e.A > 0);
  U.terrain.deform(list);
  U.sites.forEach((T, i) => {
    const { x, u } = T.S;
    if (moving) {                                           // semua titik ikut medan gabungan (titik yang jauh bergerak lebih kecil)
      surfacePoint(x, u, list, _a).sub(surfacePoint(x, u, null, _b));
      T.g.position.copy(T.base).add(_a);
      T.rot.quaternion.setFromUnitVectors(surfNormal(x, u, null, n0), surfNormal(x, u, list, n1));
    } else { T.g.position.copy(T.base); T.rot.quaternion.identity(); }
    // Bacaan 3 axis: X & Y = kemiringan sumbu X / Y sensor terhadap bidang datar, Z = kemiringan sumbu Z dari vertikal
    const q = T.rot.quaternion, ex = new V3(1, 0, 0).applyQuaternion(q), ey = new V3(0, 0, 1).applyQuaternion(q), ez = new V3(0, 1, 0).applyQuaternion(q);
    T.read = [deg(Math.asin(ex.y)), deg(Math.asin(ey.y)), deg(Math.acos(Math.min(1, ez.y)))];
    T.tagEl.textContent = `${T.label} · ${T.read[2].toFixed(1)}°`;
    T.outline.visible = (sim.site < 0 || i === sim.site) && !moving;
  });
  buildField(U);
  updateDebris(U, list);
}
// Batu menggelinding menuruni permukaan yang sudah bergeser; debu mengepul di sepanjang jalur luncur
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new V3(), _P = new V3();
function updateDebris(U, list) {
  const D = U.debris; if (!D) return;
  D.rocks.forEach((r, i) => {
    const p = THREE.MathUtils.clamp((list[r.zi].A - 0.1 - r.delay * 0.4) / 0.65, 0, 1);
    if (p <= 0) { D.rockMesh.setMatrixAt(i, _m4.makeScale(0, 0, 0)); return; }
    const S = SITES[r.zi], k = p * p * (3 - 2 * p), du = r.L * k, x = S.x + r.dx + r.side * 1.5 * k, u = r.u0 + du;
    U.terrain.sample(x, u, _P); _P.y += r.r * 0.75;
    _q.setFromEuler(_e.set(du / r.r, r.spin, 0.3 * du / r.r));
    D.rockMesh.setMatrixAt(i, _m4.compose(_P, _q, _s.set(r.r, r.r * 0.8, r.r)));
  });
  D.rockMesh.instanceMatrix.needsUpdate = true;
  for (const d of D.dust) {
    const A = list[d.zi].A, p = THREE.MathUtils.clamp((A - 0.08 - d.delay) / 0.75, 0, 1), S = SITES[d.zi], Z = S.zone;
    d.sp.visible = p > 0 && p < 1;
    if (!d.sp.visible) continue;
    const u = Z.u0 + (SLIDE.run * A + 4) * d.f;
    U.terrain.sample(S.x + d.dx, u, _P);
    d.sp.position.set(_P.x, _P.y + 1 + 2.5 * p, _P.z);
    d.sp.scale.setScalar((3 + 9 * p) * d.s);
    d.sp.material.opacity = 0.55 * Math.sin(Math.PI * p) ** 0.7;
  }
}

// Per frame: jalankan simulasi, status otomatis, lampu menyala / berkedip, horn memancarkan gelombang saat Waspada & Awas
function update(now, { camera } = {}) {
  const U = cur;
  if (!U) return false;
  if (sim.running) { sim.tau = Math.min(1, sim.tau0 + (now - sim.t0) / SIM_MS); if (sim.tau >= 1) sim.running = false; }
  let moved = false;
  const simKey = `${sim.site}:${sim.tau}`;
  if (U.applied !== simKey) { applySlide(U); U.applied = simKey; moved = true; }
  const prev = status;
  if (sim.auto) status = levelOf(Math.max(...U.sites.map(t => t.read[2])));
  if (moved || prev !== status) ui?.sync();
  const st = STATUS[status], blinkOn = !st.blink || now % 1000 < 600;
  let key = status;
  U.tiers.forEach((t, i) => {
    const lit = i === st.tier && blinkOn;
    if (lit) { t.mat.color.setHex(t.T.on); t.mat.emissive.setHex(t.T.on); t.mat.emissiveIntensity = 1.6; }
    else if (t.lit) { t.mat.color.setHex(t.T.off); t.mat.emissive.setHex(0); t.mat.emissiveIntensity = 0; }
    t.lit = lit; key += lit ? i : '-';
  });
  const litT = U.tiers.find(t => t.lit);
  U.halo.visible = !!litT;
  if (litT) { U.halo.position.set(0, litT.y, 0); U.halo.material.color.setHex(litT.T.on); U.halo.scale.setScalar(0.22); }
  for (const [i, w] of U.waves.entries()) {
    w.visible = !!st.horn;
    if (!st.horn) continue;
    const p = (now / 1500 + i / 3) % 1, r = HORN.mouthR + 0.5 * p;
    w.scale.set(r, r, r); w.position.z = U.hornMouthZ + 0.03 + 1.2 * p;
    w.material.opacity = 0.75 * (1 - p) * Math.min(1, p * 6);
  }
  const changed = key !== lastKey; lastKey = key;
  if (moved || sim.running) return true;                             // medan bergerak: render cepat + bayangan
  return changed || st.blink || st.horn ? 'redraw' : false;          // lampu / gelombang horn: kualitas penuh
}

const COLORS = { off: '#6b7280', aman: '#1f9d4c', waspada: '#c98a00', awas: '#d62b2b' };
function panel(el, { invalidate, flyTo }) {
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:8px"><span>Status peringatan</span><output id="ewsOut" style="font-weight:600"></output></div>
    <div id="ewsBtns" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px"></div>
    <label class="switch" style="margin:12px 0 14px">Status otomatis dari tiltmeter <input type="checkbox" id="ewsAuto"></label>
    <label class="field"><div class="row"><span>Titik longsor</span></div>
      <select id="ewsSite">${SITES.map((s, i) => `<option value="${i}">Mulai di ${s.id} — lereng ${s.x < -1 ? 'kiri' : s.x > 1 ? 'kanan' : 'tengah'}, merambat ke titik lain</option>`).join('')}<option value="-1">Semua titik — longsor besar satu lereng</option></select></label>
    <div class="btn-row" style="margin:-4px 0 12px"><button id="ewsLook" type="button">Lihat sensor</button><button id="ewsVista" type="button">Lihat lembah</button></div>
    <label class="field"><div class="row"><span>Pergerakan lereng</span><output id="ewsProg"></output></div>
      <input type="range" id="ewsTau" min="0" max="1" step="0.005"></label>
    <div class="btn-row"><button id="ewsRun"></button><button id="ewsReset">Reset</button></div>
    <table id="ewsTab" style="width:100%;margin-top:12px;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums">
      <thead><tr style="color:var(--muted);text-align:right"><th style="text-align:left;font-weight:600">Sensor</th><th>X</th><th>Y</th><th>Z</th></tr></thead>
      <tbody>${SITES.map(s => `<tr style="text-align:right"><td style="text-align:left"><i style="display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px"></i>${s.id}</td><td></td><td></td><td></td></tr>`).join('')}</tbody>
    </table>
    <p class="note">Tiltmeter 3 axis (°): Waspada ≥ ${LIMIT.waspada}°, Awas ≥ ${LIMIT.awas}° kemiringan total (perkiraan).
      Longsor: rayapan pelan lalu runtuh (${SIM_MS / 1000} s), mulai di titik terpilih lalu merambat ke titik lain. Tombol status di atas = uji manual (mode otomatis dimatikan).
      Tiltmeter = slave di bus seri: logger → T1 → … → T5. Semua ukuran &amp; jalur kabel = perkiraan.</p>`;
  const $ = s => el.querySelector(s), out = $('#ewsOut'), box = $('#ewsBtns'), auto = $('#ewsAuto'), site = $('#ewsSite');
  const tau = $('#ewsTau'), prog = $('#ewsProg'), run = $('#ewsRun'), rows = [...el.querySelectorAll('#ewsTab tbody tr')];
  const sync = () => {
    out.textContent = STATUS[status].label + (sim.auto ? ' · otomatis' : ''); out.style.color = COLORS[status];
    for (const b of box.children) {
      const on = b.dataset.s === status;
      b.style.borderColor = on ? COLORS[b.dataset.s] : ''; b.style.color = on ? COLORS[b.dataset.s] : ''; b.style.fontWeight = on ? 700 : '';
    }
    auto.checked = sim.auto; site.value = sim.site; tau.value = sim.tau;
    prog.textContent = `${Math.round(sim.tau * 100)}%`;
    run.textContent = sim.running ? 'Jeda' : sim.tau >= 1 ? 'Ulangi longsor' : sim.tau > 0 ? 'Lanjutkan' : 'Mulai longsor';
    cur?.sites.forEach((T, i) => {
      const c = rows[i].children;
      for (let k = 0; k < 3; k++) c[k + 1].textContent = `${T.read[k] >= 0 ? '+' : '−'}${Math.abs(T.read[k]).toFixed(2)}°`;
      c[0].firstChild.style.background = COLORS[levelOf(T.read[2])]; rows[i].style.fontWeight = i === sim.site ? 600 : '';
    });
  };
  for (const [k, s] of Object.entries(STATUS)) {
    const b = Object.assign(document.createElement('button'), { textContent: s.label });
    b.dataset.s = k;
    b.addEventListener('click', () => { sim.auto = false; status = k; sync(); invalidate(); });
    box.appendChild(b);
  }
  auto.addEventListener('change', () => { sim.auto = auto.checked; sync(); invalidate(); });
  site.addEventListener('change', () => { Object.assign(sim, { site: +site.value, tau: 0, running: false }); sync(); invalidate(); });
  tau.addEventListener('input', () => { Object.assign(sim, { tau: +tau.value, running: false }); sync(); invalidate(); });
  run.addEventListener('click', () => {
    if (sim.running) sim.running = false;
    else { const t = sim.tau >= 1 ? 0 : sim.tau; Object.assign(sim, { tau: t, tau0: t, t0: performance.now(), running: true, auto: true }); }
    sync(); invalidate();
  });
  $('#ewsVista').addEventListener('click', e => {                      // dari lembah: lereng, stasiun & pegunungan
    e.preventDefault(); flyTo([20, 2, 44], [-1, -1, 11], 1400);
  });
  $('#ewsLook').addEventListener('click', e => {                       // kamera ke tiltmeter yang dipilih
    e.preventDefault();
    const p = cur?.sites[Math.max(0, sim.site)].g.position;
    if (p) flyTo([p.x + 0.9, p.y + 0.75, p.z + 1.3], [p.x, p.y + 0.02, p.z]);
  });
  $('#ewsReset').addEventListener('click', () => { Object.assign(sim, { tau: 0, running: false }); sync(); invalidate(); });
  ui = { sync };
  sync();
}

// Explode: setelah panel surya — mur U-bolt dilepas, U-bolt ditarik ke belakang, bracket + horn + lampu dijauhkan ke depan
const explode = {
  steps: [{ key: 'ews', before: 'ac', w: 12, label: 'lepas U-bolt, bracket horn + lampu dijauhkan' }],
  apply(model, seg) {
    const U = model.userData.ews, eN = seg('ews', 0, 0.33), eU = seg('ews', 0.2, 0.6), eA = seg('ews', 0.47, 1);
    U.nuts.position.z = 0.1 * eN + 0.6 * eA;
    U.ubolt.position.z = -0.3 * eU;
    U.asm.position.z = 0.6 * eA;
    // Kabel bus, horn & lampu: plug SP21 dilepas, kabel sedikit turun lalu dilepas (memudar)
    const eDn = seg('cable', 0, 0.44), eOff = seg('cable', 0.44, 1);
    U.cableFade = eOff;
    for (const g of [U.busCable, U.hornCable, U.lightCable]) {
      g.position.y = -0.06 * eDn; g.visible = eOff < 0.999;
      g.traverse(o => {
        if (!o.isMesh) return;
        const m = o.material, tr = eOff > 0;
        if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }
        m.opacity = 1 - eOff; m.depthWrite = !tr;
      });
    }
  },
};

const mm = v => Math.round(v * 1000);
const parts = {
  ewsBracket: { name: 'Bracket Horn + Standing Light', group: 'EWS Longsor', specs: d => [
    ['Plat dudukan', `${mm(BRACKET.plateW)} × ${mm(BRACKET.plateH)} × ${mm(BRACKET.plateT)} mm (perkiraan), cat biru`],
    ['Lengan', `Hollow 40×40×2, ${mm(2 * BRACKET.half)} mm (perkiraan), dilas ke plat`],
    ['Klem ke tiang', '2 × U-bolt M10'],
    ['Posisi', `${mm(BRACKET.drop)} mm di bawah ujung tiang, di atas antipanjat (${armY(d).toFixed(2)} m dari tanah)`],
  ]},
  ewsHorn: { name: 'Horn Speaker', group: 'EWS Longsor', specs: () => [
    ['Bentuk', 'Horn bulat (corong) + unit driver'],
    ['Ukuran', `Corong Ø${mm(2 * HORN.mouthR)} mm, panjang ± ${mm(HORN.bellL + HORN.driverL + 0.02)} mm (perkiraan)`],
    ['Pasang', `Dudukan U di ujung kanan lengan, menghadap ke lembah, miring turun ${HORN.tilt}°`],
    ['Bunyi', 'Status Waspada & Awas (simulasi)'],
  ]},
  ewsLight: { name: 'Standing Light (Tower Light)', group: 'EWS Longsor', specs: () => [
    ['Susunan', 'Hijau (bawah) – kuning – merah (atas)'],
    ['Ukuran', `Ø${mm(2 * LIGHT.R)} mm, tinggi ± ${mm(LIGHT.baseH + 3 * LIGHT.tierH + 4 * LIGHT.ring + LIGHT.capH + 0.006)} mm (perkiraan)`],
    ['Pasang', 'Berdiri di ujung kiri lengan'],
    ['Simulasi', 'Aman = hijau, Waspada = kuning kedip, Awas = merah kedip'],
  ]},
  tiltmeter: { name: 'Tiltmeter 3 Axis', group: 'EWS Longsor', specs: () => [
    ['Fungsi', 'Mengukur kemiringan tanah (sumbu X, Y, Z)'],
    ['Bentuk', `Kotak ${mm(TILT.w)} × ${mm(TILT.d)} × ${mm(TILT.h)} mm (perkiraan)`],
    ['Jumlah', `${SITES.length} titik rawan longsor (${SITES.map(s => s.id).join(', ')})`],
    ['Pasang', 'Dibaut di atas plinth beton'],
    ['Ambang (simulasi)', `Waspada ≥ ${LIMIT.waspada}°, Awas ≥ ${LIMIT.awas}° (perkiraan)`],
    ['Peran', 'Slave di bus seri; logger = master'],
    ['Rantai', `Logger → ${SITES.map(s => s.id).join(' → ')} (${SITES.at(-1).id} = ujung)`],
    ['Kabel', '2 cable gland: IN (kiri) & OUT (kanan)'],
    ['Protokol', 'Belum dikonfirmasi (mis. RS-485 / Modbus)'],
  ]},
  tiltPlinth: { name: 'Plinth Beton Sensor', group: 'EWS Longsor', specs: () => [
    ['Fungsi', 'Dudukan datar untuk tiltmeter di lereng'],
    ['Muka atas', `${mm(PLINTH.w)} × ${mm(PLINTH.d)} mm, datar (cukup untuk sensor)`],
    ['Tinggi', `Muka atas ${mm(PLINTH.above)} mm di atas sisi lereng tertinggi`],
    ['Tertanam', `± ${mm(PLINTH.embed)} mm di bawah sisi lereng terendah`],
    ['Ukuran', 'Perkiraan'],
  ]},
  ewsBusCable: { name: 'Kabel Bus Tiltmeter (Seri)', group: 'EWS Longsor', specs: () => [
    ['Topologi', `Daisy chain: logger (master) → ${SITES.map(s => s.id).join(' → ')}`],
    ['Di box', 'Konektor SP21 (slot ke-2 dari kanan)'],
    ['Di tiang', 'Conduit fleksibel hitam, turun di sisi depan-kanan, melewati base plate & pondasi'],
    ['Di lapangan', 'Kabel di permukaan: punggung tebing → gawir → antar plinth (jalur perkiraan)'],
    ['Di sensor', 'Masuk gland IN, keluar gland OUT ke sensor berikutnya'],
  ]},
  ewsHornCable: { name: 'Kabel Horn', group: 'EWS Longsor', specs: () => [
    ['Dari', 'Konektor SP21 di box (slot ke-3 dari kanan)'],
    ['Jalur', 'Conduit naik di sisi depan-kanan tiang (celah jari antipanjat), menyusuri bawah lengan'],
    ['Ke', 'Cable gland di belakang unit driver horn'],
  ]},
  ewsLightCable: { name: 'Kabel Standing Light', group: 'EWS Longsor', specs: () => [
    ['Dari', 'Konektor SP21 di box (slot ke-4 dari kanan)'],
    ['Jalur', 'Conduit naik di sisi depan-kiri tiang (celah jari antipanjat), menyusuri bawah lengan'],
    ['Ke', 'Cable gland di sisi dasar lampu'],
  ]},
  cliff: { name: 'Tebing & Lereng', group: 'EWS Longsor', specs: () => [
    ['Stasiun', `Di punggung tebing, ${CLIFF.crest} m dari tepi`],
    ['Beda tinggi', `± ${CLIFF.drop} m (visual, perkiraan)`],
    ['Susunan', 'Gawir batuan ± 4 m, teras, lereng tanah ± 38°, kaki lereng'],
    ['Titik rawan', `${SITES.length} titik tiltmeter di lereng tanah`],
  ]},
};

export const ewsLandslide = {
  // antipanjat harus cukup rendah agar bracket muat di bawah panel surya
  encYMax: d => d.yTop - BRACKET.drop - BRACKET.plateH / 2 - 0.08 - CAGE.H / 2000 - 0.55,
  extend, update, panel, explode, parts,
  views: { iso: [[12, 3, 26], [0.5, -4, 6.5]] },
};
