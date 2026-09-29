import * as THREE from 'three';
import { CAGE } from '../config.js';
import { MAT } from '../materials.js';
import { holedPlateXY, mesh, rodBetween } from '../geometry.js';
import { dimension, tag } from '../labels.js';
import { sp21Cable, POLE_GAP } from '../model/sp21.js';
import { RIVER } from '../world.js';

// AWLR Sungai (satuan m). Dari gambar kerja "3D Bracket AWLR" + keterangan user:
// lengan = rangka 2 pipa (atas 3000, bawah 3100, celah 100) + 4 pipa tegak jarak 1000, cat biru, dilas ke pipa sleeve
// yang lebih besar dari tiang dan dimasukkan lewat atas; sleeve dikunci 8 baut (4 atas, 4 bawah).
// Sling Ø6 mm dari klem di tiang ke ujung rangka atas. Sensor radar horn (badan biru + horn kerucut) di dudukan ujung.
// Ukuran pipa lengan, sleeve, baut, sensor, jarak ke krangkeng & sungai (selain lebar 6 m) = perkiraan.
export const ARM = {
  top: 3.0, bottom: 3.1, gap: 0.10,
  pipeR: 0.0211, pipeWall: 0.0028,                     // perkiraan: pipa 1¼" (OD 42.2 mm)
  posts: [0.02, 1.0, 2.0, 2.98],
  aboveCage: 0.15,                                     // perkiraan: bawah sleeve di atas krangkeng
  slingUp: 0.45, slingR: 0.003,
};
export const SLEEVE = { R: 0.05715, wall: 0.00602, len: 0.30, boltEdge: 0.05, boltDeg: [60, 150, 240, 330] };   // perkiraan: pipa 4", baut M10
export const SENSOR = { housingR: 0.05, housingH: 0.12, threadR: 0.024, nutR: 0.0318, hornL: 0.26, hornR0: 0.024, hornR1: 0.048 };
export { RIVER };                                       // penampang sungai (world.js): lebar 6 m, muka air −0,9, dasar −1,6
const CL = { w: 0.04, t: 0.005, earL: 0.03 };           // klem sling 2 bagian (seperti klem krangkeng), baut M10
const PLATE_T = 0.006;                                  // dudukan sensor

// Tinggi-tinggi lengan dari tinggi pasang box (lengan tepat di atas krangkeng)
function armLevels(encY) {
  const yA0 = encY + CAGE.H / 2000 + ARM.aboveCage;     // bawah sleeve
  const yb = yA0 + 0.09, yt = yb + 2 * ARM.pipeR + ARM.gap;   // sumbu pipa bawah / atas
  return { yA0, yb, yt, ySC: yt + ARM.pipeR + ARM.slingUp };  // ySC = sumbu klem sling
}
const sensorBottom = yb => yb - ARM.pipeR - PLATE_T - 0.048 - SENSOR.hornL;

// Klem 2 bagian di tiang (lokal: setengah depan +Z, kuping ±X, baut sepanjang Z). earLx = panjang kuping +X.
function poleClamp(ro, earLx, extraHoleX) {
  const { w, t } = CL, uNut = new THREE.CylinderGeometry(0.0098, 0.0098, 0.008, 6);
  const half = front => {
    const sh = new THREE.Shape();
    sh.moveTo(ro + t, 0); sh.absarc(0, 0, ro + t, 0, Math.PI, false);
    sh.lineTo(-ro, 0); sh.absarc(0, 0, ro, Math.PI, 0, true);
    const g = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false, curveSegments: 24 });
    if (front) { g.rotateX(Math.PI / 2); g.translate(0, w / 2, 0); } else { g.rotateX(-Math.PI / 2); g.translate(0, -w / 2, 0); }
    return g;
  };
  const C = { front: new THREE.Group(), strap: new THREE.Group(), bolts: new THREE.Group(), nuts: new THREE.Group() };
  C.front.add(mesh(half(true), MAT.paint(), 'awlrClamp'));
  C.strap.add(mesh(half(false), MAT.paint(), 'awlrClamp'));
  for (const sx of [-1, 1]) {
    const L = sx > 0 ? earLx : CL.earL, exC = sx * (ro + L / 2), bx = sx * (ro + t + CL.earL * 0.45);
    const holes = [[bx - exC, 0, 0.0055]];
    if (sx > 0) holes.push([extraHoleX - exC, 0, 0.0055]);
    const ear = holedPlateXY(L, w, t, holes);
    for (const [grp, z] of [[C.front, t / 2], [C.strap, -t / 2]]) { const m = mesh(ear, MAT.paint(), 'awlrClamp'); m.position.set(exC, 0, z); grp.add(m); }
    const hd = mesh(uNut, MAT.nut(), 'awlrClamp'); hd.rotation.x = Math.PI / 2; hd.position.set(bx, 0, -t - 0.004);
    const nt = mesh(uNut, MAT.nut(), 'awlrClamp'); nt.rotation.x = Math.PI / 2; nt.position.set(bx, 0, t + 0.004);
    C.bolts.add(hd, rodBetween([bx, 0, -t - 0.008], [bx, 0, t + 0.01], 0.005, MAT.bolt(), 'awlrClamp'));
    C.nuts.add(nt);
  }
  return C;
}

// Pipa berongga sepanjang +X atau +Y (0 → len), ujung terbuka terlihat
function pipe(len, axis, r = ARM.pipeR, wall = ARM.pipeWall) {
  const ri = r - wall, V = THREE.Vector2;
  const g = new THREE.LatheGeometry([new V(ri, 0), new V(r, 0), new V(r, len), new V(ri, len), new V(ri, 0)], 32);
  return axis === 'x' ? g.rotateZ(-Math.PI / 2) : g;
}

function extend(model) {
  const d = model.userData.d, S = model.userData.station, ro = S.ro;
  const { yA0, yb, yt, ySC } = armLevels(d.encY);
  const x0 = SLEEVE.R - 0.003;                          // pangkal pipa lengan (dilas ke sleeve)
  const xb1 = x0 + ARM.bottom;                          // ujung pipa bawah
  const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
  const U = {};
  const root = new THREE.Group(); root.name = 'awlr'; model.add(root);
  const newG = () => { const g = new THREE.Group(); root.add(g); return g; };
  const blue = MAT.paint();

  // ---------- Lengan: sleeve + 8 baut kunci + rangka pipa + lug sling + dudukan sensor ----------
  const armG = U.arm = newG();
  armG.add(at(mesh(pipe(SLEEVE.len, 'y', SLEEVE.R, SLEEVE.wall), blue, 'awlrSleeve'), 0, yA0, 0));
  const nutGeo = new THREE.CylinderGeometry(0.0098, 0.0098, 0.008, 6), headGeo = new THREE.CylinderGeometry(0.0098, 0.0098, 0.007, 6);
  U.sleeveBolts = [];
  for (const by of [yA0 + SLEEVE.len - SLEEVE.boltEdge, yA0 + SLEEVE.boltEdge]) {
    for (const deg of SLEEVE.boltDeg) {
      const a = THREE.MathUtils.degToRad(deg), dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const nut = at(mesh(nutGeo, MAT.paint(), 'awlrSleeve'), ...dir.clone().multiplyScalar(SLEEVE.R + 0.004).toArray()); nut.position.y = by;
      nut.quaternion.copy(q); armG.add(nut);                                                   // mur dilas di sleeve
      const bolt = new THREE.Group(); bolt.position.set(0, by, 0);
      const head = at(mesh(headGeo, MAT.nut(), 'awlrSleeve'), ...dir.clone().multiplyScalar(SLEEVE.R + 0.0235).toArray()); head.quaternion.copy(q);
      bolt.add(head, rodBetween(dir.clone().multiplyScalar(ro).toArray(), dir.clone().multiplyScalar(SLEEVE.R + 0.02).toArray(), 0.005, MAT.bolt(), 'awlrSleeve'));
      armG.add(bolt); U.sleeveBolts.push({ bolt, dir });
    }
  }
  armG.add(at(mesh(pipe(ARM.top, 'x'), blue, 'awlrArm'), x0, yt, 0), at(mesh(pipe(ARM.bottom, 'x'), blue, 'awlrArm'), x0, yb, 0));
  for (const px of ARM.posts) armG.add(at(mesh(pipe(yt - yb, 'y'), blue, 'awlrArm'), x0 + px, yb, 0));
  const xl = x0 + ARM.posts.at(-1), yLug = yt + ARM.pipeR + 0.014;
  armG.add(at(mesh(holedPlateXY(0.03, 0.036, 0.005, [[0, 0.004, 0.0055]]), blue, 'awlrArm'), xl, yLug, 0));   // lug sling (dilas)
  // Dudukan sensor: plat datar di bawah ujung pipa bawah, slot terbuka ke +X untuk leher ulir sensor
  const xc = xb1 + 0.065, pt = yb - ARM.pipeR, xp0 = xb1 - 0.05, xp1 = xc + 0.055, sw = 0.025;
  const ps = new THREE.Shape();
  ps.moveTo(xp0, -0.05); ps.lineTo(xp1, -0.05); ps.lineTo(xp1, -sw); ps.lineTo(xc, -sw);
  ps.absarc(xc, 0, sw, -Math.PI / 2, Math.PI / 2, true); ps.lineTo(xp1, sw); ps.lineTo(xp1, 0.05); ps.lineTo(xp0, 0.05); ps.closePath();
  armG.add(at(mesh(new THREE.ExtrudeGeometry(ps, { depth: PLATE_T, bevelEnabled: false, curveSegments: 16 }).rotateX(Math.PI / 2), blue, 'awlrArm'), 0, pt, 0));
  const armTag = tag('Lengan sensor (pipa)', 'awlrArm'); armTag.position.set(x0 + 1.5, yt + 0.03, 0); armG.add(armTag);
  const svTag = tag('Sleeve + 8 baut', 'awlrSleeve', { maxDist: 4 }); svTag.position.set(-SLEEVE.R, yA0 + SLEEVE.len / 2, 0.03); armG.add(svTag);
  armG.add(
    dimension([x0, yt + 0.09, 0], [x0 + ARM.top, yt + 0.09, 0], [0, 0.02, 0], '3000 mm', 9),
    dimension([x0, yb - 0.4, 0], [xb1, yb - 0.4, 0], [0, 0.02, 0], '3100 mm', 9),
  );

  // ---------- Klem sling di tiang + sling Ø6 ----------
  const earLx = 0.06, slingHoleX = ro + earLx - 0.012;
  const SC = poleClamp(ro, earLx, slingHoleX);
  for (const k of ['front', 'strap', 'bolts', 'nuts']) { SC[k].position.y = ySC; root.add(SC[k]); }
  Object.assign(U, { scFront: SC.front, scStrap: SC.strap, scBolts: SC.bolts, scNuts: SC.nuts });
  const sling = U.sling = newG();
  const V3 = (...a) => new THREE.Vector3(...a), Zw = V3(0, 0, 1);
  const galv = MAT.galv();
  // Rangka lokal: sumbu Y = arah yang diberikan, Z = sumbu kedua (tegak lurus), X = Y × Z
  const frame = (origin, yDir, zDir) => {
    const g = new THREE.Group(), Y = yDir.clone().normalize(), Z = zDir.clone().normalize(), X = Y.clone().cross(Z);
    g.matrixAutoUpdate = true; g.position.copy(origin); g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
    return g;
  };
  const hex = (af, h, axis = 'y') => {                     // mur / kepala baut segi enam, af = lebar kunci
    const g = new THREE.CylinderGeometry(af / 2 / Math.cos(Math.PI / 6), af / 2 / Math.cos(Math.PI / 6), h, 6);
    return axis === 'x' ? g.rotateZ(Math.PI / 2) : axis === 'z' ? g.rotateX(Math.PI / 2) : g;
  };
  const threaded = (len, r, name) => mesh(new THREE.CylinderGeometry(r, r, len, 16), MAT.thread(len), name);

  // Shackle model D: pin baut (kepala + mur) tembus lubang (sumbu Z), 2 kaki + busur ke arah legDir
  const SH = { L: 0.015, w: 0.009, t: 0.002, pinR: 0.003 };
  function dShackle(pin, legDir) {
    const g = frame(pin, V3().crossVectors(Zw, legDir), Zw);      // lokal X = legDir
    const bow = new THREE.TorusGeometry(SH.w, SH.t, 8, 16, Math.PI).rotateZ(-Math.PI / 2).rotateX(Math.PI / 2);
    g.add(
      at(mesh(bow, galv, 'awlrSling'), SH.L, 0, 0),
      rodBetween([0, 0, -SH.w], [SH.L, 0, -SH.w], SH.t, galv, 'awlrSling', 8),
      rodBetween([0, 0, SH.w], [SH.L, 0, SH.w], SH.t, galv, 'awlrSling', 8),
      at(threaded(2 * SH.w + 0.01, SH.pinR, 'awlrSling').rotateX(Math.PI / 2), 0, 0, 0.001),
      at(mesh(hex(0.008, 0.004, 'z'), MAT.nut(), 'awlrSling'), 0, 0, -SH.w - SH.t - 0.002),      // kepala pin
      at(mesh(hex(0.008, 0.004, 'z'), MAT.nut(), 'awlrSling'), 0, 0, SH.w + SH.t + 0.002),       // mur pin
    );
    return { g, tip: pin.clone().addScaledVector(legDir, SH.L + SH.w) };
  }
  // Ujung sling: thimble + sling ditekuk balik, dikunci 2 klem sling (U-bolt + sadel + 2 mur). off = arah ekor sling.
  function ropeEnd(center, dir, off) {
    const g = frame(center, dir, off), rR = ARM.slingR, tz = 2 * rR + 0.0005, cz = tz / 2;   // tz = ekor menempel sling utama
    g.add(at(mesh(new THREE.TorusGeometry(0.011, 0.0025, 8, 24).rotateY(Math.PI / 2), galv, 'awlrSling'), 0, 0, cz));   // thimble
    g.add(rodBetween([0, 0.011, tz], [0, 0.14, tz], rR, galv, 'awlrSling', 8));                                 // ekor sling
    const uArc = new THREE.TorusGeometry(0.0085, 0.0018, 6, 12, Math.PI).rotateZ(-Math.PI / 2).rotateX(Math.PI / 2);
    for (const y of [0.05, 0.1]) {
      g.add(at(mesh(uArc, galv, 'awlrSling'), 0.003, y, cz),
            at(mesh(new THREE.BoxGeometry(0.004, 0.012, 0.024), galv, 'awlrSling'), -0.006, y, cz));            // sadel
      for (const z of [cz - 0.0085, cz + 0.0085]) {
        g.add(rodBetween([0.003, y, z], [-0.016, y, z], 0.0018, MAT.thread(0.02), 'awlrSling', 8),
              at(mesh(hex(0.007, 0.0045, 'x'), MAT.nut(), 'awlrSling'), -0.0115, y, z));
      }
    }
    return g;
  }

  // Titik-titik: shackle atas (kuping klem) → spanskrup → thimble + sling → thimble → shackle bawah (lug)
  const pinA = V3(slingHoleX, ySC, 0), pinB = V3(xl, yLug + 0.004, 0);
  const u = pinB.clone().sub(pinA).normalize();
  const shA = dShackle(pinA, u), shB = dShackle(pinB, u.clone().negate());
  // Spanskrup (turnbuckle) M10 di ujung atas: mata – ulir kanan – mur kontra – badan terbuka – mur kontra – ulir kiri – mata.
  // Sumbu lokal +Y = arah sling. Panjang mata ke mata ± 250 mm (perkiraan).
  const TB = { eyeR: 0.012, eyeT: 0.003, rodR: 0.005, bossAF: 0.019, bossL: 0.018, body: 0.11, rod: 0.05 };
  const pA = shA.tip.clone().addScaledVector(u, -0.006);                 // busur shackle masuk ke mata atas
  const tb = frame(pA, u, Zw);
  const eye = new THREE.TorusGeometry(TB.eyeR, TB.eyeT, 8, 24);   // mata di bidang tegak (XY lokal), mengait busur shackle yang mendatar
  const yB0 = 2 * TB.eyeR - TB.eyeT + TB.rod, yB1 = yB0 + TB.body, tbLen = yB1 + TB.rod + 2 * TB.eyeR - TB.eyeT;
  const along = (m, y) => at(m, 0, y, 0);
  const n0 = 2 * TB.eyeR - TB.eyeT, n1 = tbLen - 2 * TB.eyeR + TB.eyeT;
  tb.add(
    along(mesh(eye, galv, 'awlrTurnbuckle'), TB.eyeR),
    along(mesh(new THREE.CylinderGeometry(0.0062, TB.rodR, 0.008, 16), galv, 'awlrTurnbuckle'), n0 + 0.004),   // leher mata
    along(threaded(yB0 + TB.bossL - n0 - 0.008, TB.rodR, 'awlrTurnbuckle'), (n0 + 0.008 + yB0 + TB.bossL) / 2),
    along(mesh(hex(0.017, 0.008), MAT.nut(), 'awlrTurnbuckle'), yB0 - 0.0045),   // mur kontra
    along(mesh(hex(TB.bossAF, TB.bossL), galv, 'awlrTurnbuckle'), yB0 + TB.bossL / 2),
    along(mesh(hex(TB.bossAF, TB.bossL), galv, 'awlrTurnbuckle'), yB1 - TB.bossL / 2),
    along(mesh(hex(0.017, 0.008), MAT.nut(), 'awlrTurnbuckle'), yB1 + 0.0045),   // mur kontra
    along(threaded(n1 - 0.008 - (yB1 - TB.bossL), TB.rodR, 'awlrTurnbuckle'), (yB1 - TB.bossL + n1 - 0.008) / 2),
    along(mesh(new THREE.CylinderGeometry(TB.rodR, 0.0062, 0.008, 16), galv, 'awlrTurnbuckle'), n1 - 0.004),
    along(mesh(eye, galv, 'awlrTurnbuckle'), tbLen - TB.eyeR),
  );
  for (const x of [-1, 1])                                               // rangka badan: 2 plat samping
    tb.add(at(mesh(new THREE.BoxGeometry(0.004, TB.body - 2 * TB.bossL + 0.004, 0.012), galv, 'awlrTurnbuckle'), x * (TB.bossAF / 2 - 0.001), (yB0 + yB1) / 2, 0));
  // Thimble atas masuk ke mata bawah spanskrup (thimble mendatar), thimble bawah masuk busur shackle lug (thimble tegak)
  const tA = pA.clone().addScaledVector(u, tbLen - TB.eyeR + 0.013), tB = shB.tip.clone().addScaledVector(u, -0.0065);
  const perpV = V3(-u.y, u.x, 0);
  sling.add(
    shA.g, shB.g, tb,
    ropeEnd(tA, u, Zw),                                                                                        // thimble & ekor mendatar
    ropeEnd(tB, u.clone().negate(), perpV.clone().negate()),                                                    // thimble tegak, ekor ke bawah
    rodBetween(tA.clone().addScaledVector(u, 0.011).toArray(), tB.clone().addScaledVector(u, -0.011).toArray(), ARM.slingR, galv, 'awlrSling', 8),
  );
  const tbTag = tag('Spanskrup', 'awlrTurnbuckle', { maxDist: 3 });
  tbTag.position.copy(pA.clone().addScaledVector(u, tbLen / 2)).add(V3(0, 0.025, 0)); sling.add(tbTag);
  const slTag = tag('Sling Ø6 mm', 'awlrSling', { maxDist: 8 });
  slTag.position.copy(pinA.clone().lerp(pinB, 0.5)).add(V3(0, 0.02, 0)); sling.add(slTag);

  // ---------- Sensor radar: badan biru di atas dudukan, leher ulir lewat slot, mur kunci, horn kerucut ke bawah ----------
  const sensor = U.sensor = newG(), sNut = U.sNut = newG();
  const Sn = SENSOR, hBlue = new THREE.MeshStandardMaterial({ color: 0x4f9fd6, roughness: 0.45 }), steel = MAT.galv();
  const pb = pt - PLATE_T, yHorn = pb - 0.048, capGeo = new THREE.SphereGeometry(Sn.housingR, 40, 8, 0, Math.PI * 2, 0, Math.PI / 4);
  capGeo.scale(1, 0.5, 1);
  const hornMat = steel.clone(); hornMat.side = THREE.DoubleSide;
  sensor.add(
    at(mesh(new THREE.CylinderGeometry(Sn.housingR, Sn.housingR, Sn.housingH, 40), hBlue, 'awlrSensor'), xc, pt + Sn.housingH / 2, 0),
    at(mesh(capGeo, hBlue.clone(), 'awlrSensor'), xc, pt + Sn.housingH - Sn.housingR * Math.cos(Math.PI / 4) * 0.5, 0),
    at(mesh(new THREE.CylinderGeometry(Sn.housingR + 0.0004, Sn.housingR + 0.0004, 0.034, 16, 1, true, Math.PI / 2 - 0.4, 0.8), MAT.whitePl(), 'awlrSensor'), xc, pt + 0.07, 0),   // label
    at(mesh(new THREE.CylinderGeometry(Sn.threadR, Sn.threadR, pt - yHorn + 0.004, 24), steel, 'awlrSensor'), xc, (pt + yHorn) / 2, 0),   // leher ulir
    at(mesh(new THREE.CylinderGeometry(Sn.hornR0 + 0.004, Sn.hornR0 + 0.004, 0.006, 24), steel, 'awlrSensor'), xc, yHorn, 0),
    at(mesh(new THREE.CylinderGeometry(Sn.hornR0, Sn.hornR1, Sn.hornL, 40, 1, true), hornMat, 'awlrSensor'), xc, yHorn - Sn.hornL / 2, 0),   // horn
  );
  const gland = at(mesh(new THREE.CylinderGeometry(0.007, 0.008, 0.014, 16).rotateX(Math.PI / 2), MAT.plastic(), 'awlrSensor'), xc, pt + 0.07, Sn.housingR + 0.007);
  sensor.add(gland);
  sNut.add(at(mesh(new THREE.CylinderGeometry(Sn.nutR, Sn.nutR, 0.018, 6), steel, 'awlrSensor'), xc, pb - 0.009, 0));   // mur kunci di bawah dudukan
  const snTag = tag('Sensor radar level air', 'awlrSensor'); snTag.position.set(xc + Sn.housingR, pt + 0.06, 0); sensor.add(snTag);
  const yBot = sensorBottom(yb);
  sensor.add(dimension([xc + 0.12, yBot, 0], [xc + 0.12, RIVER.water, 0], [0.03, 0, 0], `${(yBot - RIVER.water).toFixed(2)} m ke muka air`, 12));

  // ---------- Kabel sensor dalam conduit hitam → konektor SP21 kedua di box ----------
  // Naik di sisi depan-kanan tiang (di belakang krangkeng), berbelok di bawah sleeve, lalu menyusuri sisi pipa bawah.
  const cable = U.cable = newG();
  const zc = POLE_GAP * Math.sin(Math.PI / 6), yG = pt + 0.07, zG = Sn.housingR + 0.014;
  sp21Cable(S, {
    slot: -1, wireToY: -0.1085, group: cable, phi: 30, yH: d.encY - 0.45,
    route: [[POLE_GAP * Math.cos(Math.PI / 6), yA0 - 0.03, zc], [0.12, yA0 - 0.03, zc], [0.12, yb, zc], [xb1 - 0.12, yb, zc]],
    endCable: [[xb1 - 0.135, yb, zc], [xb1 - 0.06, yb + 0.005, 0.045], [xb1 + 0.02, yG - 0.01, 0.078], [xc, yG, zG + 0.02], [xc, yG, zG - 0.004]],
    tagText: 'Kabel sensor + conduit', tagAt: [1.2, yb - 0.02, zc + 0.01], plugTag: 'SP21 sensor',
  });

  // ---------- Sungai: bagian dari dunia bersama (world.js — alur, tebing berpita, pasangan batu, batu, air, pohon),
  // dibangun main.js sebagai lingkungan stasiun ini. Di sini hanya label & dimensi lebar muka air. ----------
  const R = RIVER, XC = R.bankX + R.slope * -R.water + R.width / 2, wx0 = XC - R.width / 2, wx1 = XC + R.width / 2;
  const rv = new THREE.Group(); root.add(rv);
  const rTag = tag('Sungai (lebar 6 m)', 'river'); rTag.position.set(wx0 + 4.2, R.water + 0.02, 1.6); rv.add(rTag);
  rv.add(dimension([wx0, R.water + 0.01, 2.5], [wx1, R.water + 0.01, 2.5], [0, 0, 0.12], `${R.width.toFixed(2)} m`, 30));

  U.lift = d.yTop - yA0 + 0.15;                           // sleeve diangkat sampai lepas dari ujung tiang
  model.userData.awlr = U;
}

// Explode: sensor dilepas dulu (sebelum kabel); sling, klem sling, lalu 8 baut sleeve dikendurkan dan
// lengan + sleeve diangkat keluar lewat ujung atas tiang (panel surya & antipanjat sudah dilepas) sebelum tiang diurai.
const explode = {
  steps: [
    { key: 'sensor', before: 'cable', w: 8, label: 'kendurkan mur, sensor digeser keluar dudukan' },
    { key: 'arm', before: 'base', w: 20, label: 'lepas sling & klem, kendurkan 8 baut, lengan diangkat lewat atas' },
  ],
  apply(model, seg) {
    const U = model.userData.awlr;
    const eN = seg('sensor', 0, 0.35), eS = seg('sensor', 0.3, 1);
    U.sNut.position.set(0.35 * eS, -0.012 * eN, 0);        // mur dikendurkan lalu ikut sensor
    U.sensor.position.x = 0.35 * eS;                       // leher ulir keluar lewat slot terbuka
    U.cable.position.set(0.3 * seg('cable', 0.44, 1), -0.18 * seg('cable', 0, 0.44), 0);   // turun keluar lubang mesh, lalu +X
    U.sling.position.z = 0.35 * seg('arm', 0, 0.16);
    const eScN = seg('arm', 0.1, 0.22), eScB = seg('arm', 0.18, 0.32), eScH = seg('arm', 0.28, 0.44);
    U.scNuts.position.z = 0.06 * eScN + 0.25 * eScH;
    U.scBolts.position.z = -0.12 * eScB;
    U.scFront.position.z = 0.25 * eScH;
    U.scStrap.position.z = -0.25 * eScH;
    const eB = seg('arm', 0.42, 0.54), eUp = seg('arm', 0.54, 0.86), eOut = seg('arm', 0.86, 1);
    for (const { bolt, dir } of U.sleeveBolts) bolt.position.set(dir.x * 0.012 * eB, bolt.position.y, dir.z * 0.012 * eB);
    U.arm.position.set(0.6 * eOut, U.lift * eUp, 0);
  },
};

const parts = {
  awlrArm: { name: 'Lengan Sensor', group: 'AWLR Sungai', specs: () => [
    ['Material', `Pipa Ø${(ARM.pipeR * 2000).toFixed(1)} mm (perkiraan), cat biru`],
    ['Rangka', 'Pipa atas 3000 mm, bawah 3100 mm, celah 100 mm'],
    ['Pipa tegak', '4 buah, jarak 1000 mm'],
    ['Pangkal', 'Dilas ke pipa sleeve'],
    ['Ujung', 'Plat dudukan sensor dengan slot terbuka'],
  ]},
  awlrSleeve: { name: 'Pipa Sleeve Lengan', group: 'AWLR Sungai', specs: () => [
    ['Tipe', 'Pipa lebih besar dari tiang, dimasukkan lewat atas'],
    ['Ukuran', `Ø${(SLEEVE.R * 2000).toFixed(1)} mm × ${SLEEVE.len * 1000} mm (perkiraan)`],
    ['Pengunci', '8 baut: 4 di atas, 4 di bawah, menekan tiang'],
  ]},
  awlrSling: { name: 'Sling Penahan', group: 'AWLR Sungai', specs: () => [
    ['Ukuran', 'Sling baja Ø6 mm'],
    ['Dari', `Klem di tiang, ± ${ARM.slingUp * 1000} mm di atas pipa atas`],
    ['Ke', 'Lug di ujung pipa atas'],
    ['Pengencang', 'Spanskrup di ujung atas'],
  ]},
  awlrTurnbuckle: { name: 'Spanskrup (Turnbuckle)', group: 'AWLR Sungai', specs: () => [
    ['Fungsi', 'Mengencangkan sling agar lengan tidak melendut'],
    ['Tipe', 'Badan terbuka, mata – mata, ulir kanan / kiri'],
    ['Ukuran', 'M10, ± 250 mm mata ke mata (perkiraan)'],
    ['Pasang', 'Mata atas di shackle klem tiang, mata bawah ke sling'],
  ]},
  awlrClamp: { name: 'Klem Sling', group: 'AWLR Sungai', specs: () => [
    ['Tipe', 'Klem 2 bagian, kuping dibaut M10'],
    ['Sling', 'Kuping kanan diperpanjang untuk shackle'],
  ]},
  awlrSensor: { name: 'Sensor Radar Level Air', group: 'AWLR Sungai', specs: d => [
    ['Bentuk', 'Badan biru + horn kerucut stainless (sesuai foto)'],
    ['Ukuran', `Badan Ø${SENSOR.housingR * 2000} mm, horn ${SENSOR.hornL * 1000} mm (perkiraan)`],
    ['Pasang', 'Leher ulir lewat slot dudukan, dikunci mur'],
    ['Tinggi ke muka air', `${(sensorBottom(armLevels(d.encY).yb) - RIVER.water).toFixed(2)} m`],
    ['Kabel', 'Conduit hitam → konektor SP21 di box'],
  ]},
  river: { name: 'Sungai', group: 'AWLR Sungai', specs: () => [
    ['Lebar muka air', `${RIVER.width} m`],
    ['Muka air', `${-RIVER.water} m di bawah tanah (visual)`],
    ['Kedalaman', `${-RIVER.bed} m dari tanah (visual)`],
    ['Tebing', `± ${RIVER.bankX} m dari tiang, dilapisi pasangan batu di depan stasiun (visual)`],
    ['Alur', 'Lurus di depan stasiun, berkelok & melebar menjauh (visual)'],
  ]},
};

export const awlrRiver = {
  station: { height: 4, plate: 400, plateT: 12, spacing: 300 },
  encYMax: d => d.yTop - 0.9 - 0.2 - armLevels(0).ySC,    // klem sling tetap di bawah jari antipanjat
  // conduit panel surya menjauh dari tiang di sekitar sleeve (termasuk ruang turun 0,18 m saat explode)
  pvBulge: d => { const { yA0 } = armLevels(d.encY); return { y0: yA0 - 0.03, y1: yA0 + SLEEVE.len + 0.2, R: 0.095 }; },
  extend, explode, parts,
  views: { iso: [[-1.6, 3.6, 7.2], [2.4, 1.0, 0]] },
  info: 'Lengan sensor 3 m di atas sungai lebar 6 m. Simulasi muka air belum dibuat.',
};
