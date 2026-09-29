import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAGE, ENC, ENC_MOUNT, PANEL_FRAME, PV_BRACKET, F_ABOVE, F_BELOW, GROUT_T, GUSSET_T, INCH, derive } from '../config.js';
import { DS_SMA_U, MPPT_BTN_U, MPPT_HOLE_U, dsLedTex, dsPortTex, dsVentTex, loggerFaceTex, mpptDisplayTex, mpptLabelTex, mpptTableTex, mpptTermTex } from '../textures.js';
import { MAT } from '../materials.js';
import { rectPoly } from '../physics.js';
import { angleBar, holedPlate, holedPlateXY, holedTab, mesh, rodBetween, wireGrid } from '../geometry.js';
import { sp21Cable } from './sp21.js';
import { dimension, tag } from '../labels.js';
import { live } from '../state.js';

// ---------- Model monopole ----------
export const GROUPS = ['foundation', 'conduit', 'grout', 'bolts', 'levelNuts', 'weldment', 'topNuts',
  'bracket', 'enclosure', 'encMount', 'cage', 'antiClimb', 'solar', 'pvCable'];   // posisi explode diatur applyExplode()

// opts.pvBulge = { y0, y1, R }: conduit panel surya dijauhkan dari tiang di rentang tinggi itu (mis. melewati sleeve lengan)
export function buildMonopole(p, opts = {}) {
  const d = derive(p), mm = v => v / 1000;
  const root = new THREE.Group(); root.name = 'Monopole';
  const G = {};
  for (const k of GROUPS) {
    G[k] = new THREE.Group(); G[k].name = k; root.add(G[k]);
  }

  const H = p.height, ro = mm(d.od / 2), ri = mm(d.ri);
  const fw = mm(d.fw), yC = mm(F_ABOVE), yP0 = yC + mm(GROUT_T), yP1 = yP0 + mm(d.plateT);
  const s = mm(d.s), ph = mm(d.plate / 2);
  const bR = mm(d.bolt / 2), nut = d.nut;
  const nR = mm(nut.af / 2) / Math.cos(Math.PI / 6), nH = mm(nut.h), wR = mm(nut.wd / 2), wT = mm(nut.wt);
  const conduitR = mm(d.conduitR);

  // Pondasi beton
  const found = mesh(new THREE.BoxGeometry(fw, mm(F_ABOVE + F_BELOW), fw), MAT.concrete(), 'foundation');
  found.position.y = mm(F_ABOVE - F_BELOW) / 2;
  G.foundation.add(found);
  const fTag = tag('Pondasi beton', 'foundation'); fTag.position.set(fw / 2, yC * 0.5, fw / 2); G.foundation.add(fTag);

  // Grouting
  const grout = mesh(new THREE.BoxGeometry(mm(d.plate + 40), mm(GROUT_T), mm(d.plate + 40)), MAT.grout(), 'grout');
  grout.position.y = yC + mm(GROUT_T) / 2;
  G.grout.add(grout);
  const gTag = tag('Grouting', 'grout', { maxDist: 2.2 }); gTag.position.set(-mm(d.plate / 2 + 20), yC + mm(GROUT_T / 2), -mm(d.plate / 4)); G.grout.add(gTag);

  // Conduit PVC (tertanam)
  const elbowR = 0.15, yBend = -0.45;
  const cv = mesh(new THREE.CylinderGeometry(conduitR, conduitR, yP0 - yBend, 20), MAT.pvc(), 'conduit');
  cv.position.y = (yP0 + yBend) / 2;
  const ce = mesh(new THREE.TorusGeometry(elbowR, conduitR, 12, 20, Math.PI / 2), MAT.pvc(), 'conduit');
  ce.rotation.z = -Math.PI / 2; ce.position.set(-elbowR, yBend, 0);
  const runLen = fw / 2 + 0.8 - elbowR;
  const ch = mesh(new THREE.CylinderGeometry(conduitR, conduitR, runLen, 20), MAT.pvc(), 'conduit');
  ch.rotation.z = Math.PI / 2; ch.position.set(-elbowR - runLen / 2, yBend - elbowR, 0);
  G.conduit.add(cv, ce, ch);
  const cTag = tag('Conduit kabel', 'conduit', { xrayOnly: true }); cTag.position.set(-fw / 2 - 0.4, yBend - elbowR, 0); G.conduit.add(cTag);

  // Baut angkur + mur
  const embed = mm(nut.emb), yB = yC - embed, yTop = yC + mm(d.proj);
  const hookR = mm(d.hookR), leg = mm(d.leg);
  const nutGeo = new THREE.CylinderGeometry(nR, nR, nH, 6);
  const washerGeo = new THREE.CylinderGeometry(wR, wR, wT, 28);
  const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  corners.forEach(([cx, cz], i) => {
    const x = cx * s / 2, z = cz * s / 2;
    const bolt = new THREE.Group(); bolt.position.set(x, 0, z);
    const shank = mesh(new THREE.CylinderGeometry(bR, bR, yC - yB, 16), MAT.bolt(), 'anchor');
    shank.position.y = (yC + yB) / 2;
    const thr = mesh(new THREE.CylinderGeometry(bR * 0.97, bR * 0.97, yTop - yC, 16), MAT.thread(yTop - yC), 'anchor');
    thr.position.y = (yTop + yC) / 2;
    const hook = new THREE.Group(); hook.rotation.y = -(Math.atan2(z, x) + Math.PI); // kait mengarah ke dalam
    const bend = mesh(new THREE.TorusGeometry(hookR, bR, 10, 16, Math.PI / 2), MAT.bolt(), 'anchor');
    bend.rotation.z = Math.PI; bend.position.set(hookR, yB, 0);
    const foot = mesh(new THREE.CylinderGeometry(bR, bR, leg, 16), MAT.bolt(), 'anchor');
    foot.rotation.z = Math.PI / 2; foot.position.set(hookR + leg / 2, yB - hookR, 0);
    hook.add(bend, foot);
    bolt.add(shank, thr, hook);
    G.bolts.add(bolt);

    // mur perata di bawah plate
    const lw = mesh(washerGeo, MAT.nut(), 'levelNut'); lw.position.set(x, yP0 - wT / 2, z);
    const ln = mesh(nutGeo, MAT.nut(), 'levelNut'); ln.position.set(x, yP0 - wT - nH / 2, z);
    G.levelNuts.add(lw, ln);

    // ring + mur + mur kontra di atas plate
    const tw = mesh(washerGeo, MAT.nut(), 'nut'); tw.position.set(x, yP1 + wT / 2, z);
    const n1 = mesh(nutGeo, MAT.nut(), 'nut'); n1.position.set(x, yP1 + wT + nH / 2, z);
    const n2 = mesh(nutGeo, MAT.nut(), 'nut'); n2.position.set(x, yP1 + wT + nH * 1.5, z);
    G.topNuts.add(tw, n1, n2);

    if (i === 0) {
      const aTag = tag('Baut angkur (4 titik)', 'anchor', { maxDist: 3 });
      aTag.position.set(x + bR, yC + 0.012, z); G.bolts.add(aTag);
    }
    if (i === 3) {
      const nTag = tag('Mur + mur kontra', 'nut', { maxDist: 2.2 });
      nTag.position.set(x + nR, yP1 + wT + nH, z); G.topNuts.add(nTag);
    }
    if (i === 1) {
      const lTag = tag('Mur perata', 'levelNut', { maxDist: 1.8, xrayOnly: true });
      lTag.position.set(x - nR, yP0 - wT - nH / 2, z); G.levelNuts.add(lTag);
    }
  });

  // Base plate dengan 4 lubang angkur + lubang kabel
  const shape = new THREE.Shape();
  shape.moveTo(-ph, -ph); shape.lineTo(ph, -ph); shape.lineTo(ph, ph); shape.lineTo(-ph, ph); shape.closePath();
  const holeR = mm((d.bolt + 2) / 2);
  for (const [cx, cz] of corners) {
    const h = new THREE.Path(); h.absarc(cx * s / 2, cz * s / 2, holeR, 0, Math.PI * 2, true); shape.holes.push(h);
  }
  const cHole = new THREE.Path(); cHole.absarc(0, 0, mm(d.cableHole / 2), 0, Math.PI * 2, true); shape.holes.push(cHole);
  const plateGeo = new THREE.ExtrudeGeometry(shape, { depth: mm(d.plateT), bevelEnabled: false, curveSegments: 28 });
  plateGeo.rotateX(-Math.PI / 2);
  const plate = mesh(plateGeo, MAT.paint(), 'plate'); plate.position.y = yP0;
  G.weldment.add(plate);
  const pTag = tag('Base plate', 'plate', { maxDist: 3 }); pTag.position.set(ph, yP1, -ph * 0.2); G.weldment.add(pTag);

  // Tiang (pipa berongga)
  const prof = [new THREE.Vector2(ri, 0), new THREE.Vector2(ro, 0), new THREE.Vector2(ro, H), new THREE.Vector2(ri, H), new THREE.Vector2(ri, 0)];
  const pole = mesh(new THREE.LatheGeometry(prof, 64), MAT.paint(), 'pole');
  pole.position.y = yP1;
  G.weldment.add(pole);
  const poleTag = tag(`Tiang monopole ${INCH[d.od]}`, 'pole'); poleTag.position.set(ro, yP1 + H * 0.62, 0); G.weldment.add(poleTag);

  // Las keliling
  const weld = mesh(new THREE.TorusGeometry(ro, 0.004, 8, 64), MAT.paint(), 'plate');
  weld.rotation.x = Math.PI / 2; weld.position.y = yP1;
  G.weldment.add(weld);

  // Tutup atas
  const cap = mesh(new THREE.CylinderGeometry(ro + 0.003, ro + 0.003, 0.006, 48), MAT.paint(), 'cap');
  cap.position.y = yP1 + H + 0.003;
  const dome = mesh(new THREE.SphereGeometry(ro + 0.003, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.18), MAT.paint(), 'cap');
  dome.scale.y = 0.6; dome.position.y = yP1 + H + 0.006 - (ro + 0.003) * Math.cos(Math.PI * 0.18) * 0.6;
  G.weldment.add(cap, dome);
  const capTag = tag('Pole cap', 'cap'); capTag.position.set(ro + 0.01, yP1 + H + 0.01, 0); G.weldment.add(capTag);

  // Stiffener / gusset 4 pcs
  const gw = mm(d.gw), gh = mm(d.gh), gt = mm(GUSSET_T);
  const gShape = new THREE.Shape();
  gShape.moveTo(0, 0); gShape.lineTo(gw, 0); gShape.lineTo(gw, 0.015); gShape.lineTo(0.015, gh); gShape.lineTo(0, gh); gShape.closePath();
  const gGeo = new THREE.ExtrudeGeometry(gShape, { depth: gt, bevelEnabled: false });
  gGeo.translate(0, 0, -gt / 2);
  for (let i = 0; i < 4; i++) {
    const pivot = new THREE.Group(); pivot.rotation.y = i * Math.PI / 2;
    const gm = mesh(gGeo, MAT.paint(), 'gusset'); gm.position.set(ro - 0.001, yP1, 0);
    pivot.add(gm); G.weldment.add(pivot);
  }
  const guTag = tag('Stiffener', 'gusset', { maxDist: 2.6 }); guTag.position.set(-(ro + gw * 0.4), yP1 + gh * 0.5, 0); G.weldment.add(guTag);

  // Dimensi
  const dx = -(fw / 2 + 0.25), dz = fw / 2 + 0.25;
  const dimH = dimension([dx, yP1, dz], [dx, yP1 + H, dz], [0.06, 0, 0], `H = ${H.toFixed(2)} m`);
  const dimS = dimension([-s / 2, yP1 + 0.002, ph + 0.07], [s / 2, yP1 + 0.002, ph + 0.07], [0, 0, 0.025], `${d.s} mm`, 2.5);
  const dimF = dimension([-fw / 2, yC + 0.002, fw / 2 + 0.12], [fw / 2, yC + 0.002, fw / 2 + 0.12], [0, 0, 0.04], `${d.fw} mm`, 5);
  G.weldment.add(dimH, dimS);
  G.foundation.add(dimF);

  // ---------- Enclosure B&J 504020 + bracket ----------
  const E = ENC, W = mm(E.W), EH = mm(E.H), ED = mm(E.D), cy = p.encY;
  const t = mm(E.t), rc = mm(E.r), zJ = mm(E.joint), lidD = ED - zJ, fl = mm(E.flange), bv = 0.003;
  const clT = 0.005, zF = ro + clT, ribT = 0.004;             // punggung krangkeng dilas ke setengah klem depan
  const HX = W / 2 + 0.008;                                    // sumbu engsel, di luar sisi kanan

  const ubR = 0.005, uR = ro + ubR;                            // ukuran U-bolt M10 (dipakai bracket panel surya)
  const uNutGeo = new THREE.CylinderGeometry(0.0098, 0.0098, 0.008, 6);

  // Helper bentuk persegi sudut bulat
  const rrect = (w, h, r, asPath = false) => {
    const sh = asPath ? new THREE.Path() : new THREE.Shape(), x = -w / 2, y = -h / 2;
    sh.moveTo(x + r, y); sh.lineTo(x + w - r, y); sh.absarc(x + w - r, y + r, r, -Math.PI / 2, 0);
    sh.lineTo(x + w, y + h - r); sh.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    sh.lineTo(x + r, y + h); sh.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    sh.lineTo(x, y + r); sh.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
    return sh;
  };
  const ringGeo = (wo, ho, rOut, wi, hi, rIn, depth) => {
    const sh = rrect(wo, ho, rOut); sh.holes.push(rrect(wi, hi, rIn, true));
    return new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 10 });
  };
  const capGeo = (w, h, r, depth, b) => new THREE.ExtrudeGeometry(rrect(w - 2 * b, h - 2 * b, Math.max(0.001, r - b)),
    { depth, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 10 });
  const part = (geo, mat, name, x = 0, y = 0, z = 0) => { const m = mesh(geo, mat, name); m.position.set(x, y, z); return m; };

  // Base (z = 0 punggung luar → zJ sambungan)
  const stripT = mm(ENC_MOUNT.stripT);
  const enc = new THREE.Group(); enc.position.set(0, cy, zF + mm(CAGE.tube) + stripT + ribT);   // rusuk punggung duduk di besi strip
  enc.add(
    part(capGeo(W, EH, rc, t, bv), MAT.encBody(), 'enclosure', 0, 0, bv),                                   // punggung
    part(ringGeo(W, EH, rc, W - 2 * t, EH - 2 * t, rc - t, zJ - t), MAT.encBody(), 'enclosure', 0, 0, t),   // dinding
    part(ringGeo(W + 2 * fl, EH + 2 * fl, rc + fl, W - 0.001, EH - 0.001, rc, 0.008), MAT.encBody(), 'enclosure', 0, 0, zJ - 0.008), // flange
    part(new RoundedBoxGeometry(0.03, mm(E.ribV) + 0.03, ribT * 2, 2, 0.0035), MAT.encBody(), 'enclosure'),   // rusuk silang punggung
    part(new RoundedBoxGeometry(mm(E.ribH) + 0.03, 0.03, ribT * 2, 2, 0.0035), MAT.encBody(), 'enclosure'),
  );
  G.enclosure.add(enc);
  const eTag = tag('Enclosure B&J 504020', 'enclosure');
  eTag.position.set(W / 2 + fl, -EH * 0.1, zJ * 0.5); enc.add(eTag);

  // Mounting plate berlubang di atas 4 boss
  const sx2 = mm(E.mp.slotX) / 2, sy2 = mm(E.mp.slotY) / 2, zMP = t + 0.006, mpt = mm(E.mp.t);
  const mpw = mm(E.mp.w) / 2, mph = mm(E.mp.h) / 2, cr = 0.02;
  const mps = new THREE.Shape();                               // sudut cekung seperti gambar
  mps.moveTo(-mpw + cr, -mph); mps.lineTo(mpw - cr, -mph); mps.absarc(mpw, -mph, cr, Math.PI, Math.PI / 2, true);
  mps.lineTo(mpw, mph - cr); mps.absarc(mpw, mph, cr, -Math.PI / 2, -Math.PI, true);
  mps.lineTo(-mpw + cr, mph); mps.absarc(-mpw, mph, cr, 0, -Math.PI / 2, true);
  mps.lineTo(-mpw, -mph + cr); mps.absarc(-mpw, -mph, cr, Math.PI / 2, 0, true);
  for (const [a, c] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    const h = new THREE.Path(); h.absarc(a * sx2, c * sy2, 0.0028, 0, Math.PI * 2, true); mps.holes.push(h);
    const boss = part(new THREE.CylinderGeometry(0.006, 0.0075, 0.006, 16), MAT.encBody(), 'enclosure', a * sx2, c * sy2, t + 0.003);
    boss.rotation.x = Math.PI / 2;
    const screw = part(new THREE.SphereGeometry(0.0045, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), MAT.nut(), 'mountPlate', a * sx2, c * sy2, zMP + mpt);
    screw.rotation.x = Math.PI / 2; screw.scale.y = 0.5;
    enc.add(boss, screw);
  }
  enc.add(part(new THREE.ExtrudeGeometry(mps, { depth: mpt, bevelEnabled: false, curveSegments: 12 }), MAT.perfPlate(), 'mountPlate', 0, 0, zMP));
  const mTag = tag('Mounting plate', 'mountPlate', { maxDist: 1.6, when: () => live.outerVis > 40 });
  mTag.position.set(-0.175, -0.035, zMP + mpt); enc.add(mTag);          // area plate yang terlihat, kiri tengah

  // Tutup / pintu utama: berputar pada sumbu engsel kanan
  const lidPivot = new THREE.Group(); lidPivot.position.set(HX, 0, zJ);
  const lid = new THREE.Group(); lid.position.set(-HX, 0, 0); lidPivot.add(lid);
  lid.add(
    part(ringGeo(W, EH, rc, W - 2 * t, EH - 2 * t, rc - t, lidD - t), MAT.encBody(), 'door'),                  // dinding tutup
    part(capGeo(W, EH, rc, t, bv), MAT.encBody(), 'door', 0, 0, lidD - t - bv),                                 // muka tutup
    part(capGeo(W - 0.028, EH - 0.028, rc - 0.008, 0.0012, 0.0012), MAT.encBody(), 'door', 0, 0, lidD + 0.0006), // panel timbul
    part(ringGeo(W - 2 * t, EH - 2 * t, rc - t, W - 2 * t - 0.01, EH - 2 * t - 0.01, rc - t - 0.005, 0.004), MAT.rubber(), 'door', 0, 0, 0.001), // gasket
    part(new RoundedBoxGeometry(0.008, 0.045, 0.012, 2, 0.003), MAT.latch(), 'latch', -W / 2 - 0.004, mm(E.openTabY), 0.012), // tab OPEN
  );
  const dTag = tag('Pintu (engsel kanan)', 'door', { maxDist: 4 });
  dTag.position.set(-W * 0.3, -EH * 0.28, lidD + 0.002); lid.add(dTag);

  // 3 engsel: 2 knuckle di base, 1 knuckle ikut tutup
  const leafW = HX - W / 2 + 0.002;
  for (const hy of E.hingeY.map(mm)) {
    for (const dy of [-0.016, 0.016]) {
      enc.add(part(new THREE.CylinderGeometry(0.005, 0.005, 0.0155, 16), MAT.hinge(), 'hinge', HX, hy + dy, zJ));
      enc.add(part(new THREE.BoxGeometry(leafW, 0.0155, 0.012), MAT.hinge(), 'hinge', W / 2 + leafW / 2 - 0.002, hy + dy, zJ - 0.006));
    }
    lidPivot.add(part(new THREE.CylinderGeometry(0.005, 0.005, 0.0155, 16), MAT.hinge(), 'hinge', 0, hy, 0));
    lidPivot.add(part(new THREE.BoxGeometry(leafW, 0.0155, 0.012), MAT.hinge(), 'hinge', -leafW / 2 + 0.002, hy, 0.006));
    enc.add(part(new THREE.CylinderGeometry(0.0022, 0.0022, 0.05, 10), MAT.nut(), 'hinge', HX, hy, zJ));   // pin
  }
  const hTag = tag('Engsel ×3', 'hinge', { maxDist: 2.5 });
  hTag.position.set(HX + 0.006, mm(E.hingeY[0]), zJ); enc.add(hTag);

  // 3 latch di sisi kiri: dudukan di base, kait di tutup, tuas terbuka saat pintu dibuka
  const latchLevers = [];
  for (const ly of E.latchY.map(mm)) {
    enc.add(part(new RoundedBoxGeometry(0.012, 0.042, 0.02, 2, 0.002), MAT.hinge(), 'latch', -W / 2 - fl - 0.004, ly, zJ - 0.016));
    lid.add(part(new RoundedBoxGeometry(0.008, 0.03, 0.012, 2, 0.002), MAT.hinge(), 'latch', -W / 2 - 0.004, ly, 0.012));
    const lp = new THREE.Group(); lp.position.set(-W / 2 - fl - 0.008, ly, zJ - 0.012);
    lp.add(part(new RoundedBoxGeometry(0.008, 0.036, 0.034, 2, 0.003), MAT.latch(), 'latch', -0.002, 0, 0.017));
    enc.add(lp); latchLevers.push(lp);
  }
  const lTag = tag('Latch ×3', 'latch', { maxDist: 2.5 });
  lTag.position.set(-W / 2 - fl - 0.012, mm(E.latchY[2]), zJ + 0.02); enc.add(lTag);
  enc.add(lidPivot);
  root.userData.doorPivot = lidPivot;
  root.userData.latchLevers = latchLevers;

  // ---------- Isi enclosure (posisi mengikuti foto, satuan mm di koordinat box) ----------
  {
    const z0 = zMP + mpt;                                    // muka depan mounting plate
    const P = (geo, mat, name, x, y, z) => part(geo, mat, name, mm(x), mm(y), z0 + mm(z));   // x, y, z dalam mm
    const B = (w, h, d, mat, name, x, y, z) => P(new THREE.BoxGeometry(mm(w), mm(h), mm(d)), mat, name, x, y, z);
    const RB = (w, h, d, r, mat, name, x, y, z) => P(new RoundedBoxGeometry(mm(w), mm(h), mm(d), 2, mm(r)), mat, name, x, y, z);
    const rodMm = (a, b, r, mat, name) => rodBetween([mm(a[0]), mm(a[1]), z0 + mm(a[2])], [mm(b[0]), mm(b[1]), z0 + mm(b[2])], mm(r), mat, name, 8);
    const faceAt = (tex, w, h, name, x, y, z) => P(new THREE.PlaneGeometry(mm(w), mm(h)), MAT.face(tex), name, x, y, z);
    const whenOpen = () => live.outerVis > 40;
    const itag = (text, name, x, y, z) => { const o = tag(text, name, { maxDist: 1.6, when: whenOpen }); o.position.set(mm(x), mm(y), z0 + mm(z)); enc.add(o); };

    // 1. Beacon Logger (kiri atas): badan 120 × 120 × 32 di atas flange 5 mm
    const LX = -72, LY = 112;
    enc.add(
      RB(112, 150, 5, 2, MAT.whitePl(), 'logger', LX, LY, 2.5),                                  // flange pasang
      RB(120, 120, 32, 4, MAT.whitePl(), 'logger', LX, LY, 5 + 16),                              // badan
      faceAt(loggerFaceTex(), 118, 118, 'logger', LX, LY, 37.1),
      B(30, 11, 4, MAT.nut(), 'logger', LX - 60 + 87, LY + 60 - 77, 39),                         // DB9
      B(18, 6.5, 1.5, MAT.wire(0x3f6fd8), 'logger', LX - 60 + 87, LY + 60 - 77, 41.5),
      B(52, 9, 13, MAT.green(), 'logger', LX - 16, LY - 64.5, 20),                               // terminal bawah 10-pin
      B(9, 55, 13, MAT.green(), 'logger', LX - 64.5, LY + 14, 20),                               // terminal kiri 10-pin
      B(16, 12, 15, MAT.nut(), 'logger', LX + 21, LY - 64, 20),                                  // RJ45
      B(12, 10, 12, MAT.nut(), 'logger', LX + 36, LY - 63, 20),                                  // USB-B
    );
    for (const sx of [-1, 1]) for (const sy of [-1, 1])
      enc.add(P(new THREE.CylinderGeometry(mm(3), mm(3), mm(2), 12).rotateX(Math.PI / 2), MAT.nut(), 'logger', LX + sx * 38, LY + sy * 69, 6));
    enc.add(P(new THREE.CylinderGeometry(mm(3.2), mm(3.2), mm(9), 12).rotateZ(Math.PI / 2), MAT.brass(), 'logger', LX + 64.5, LY + 30, 20)); // SMA GPS
    itag('Beacon Logger', 'logger', LX + 60, LY + 40, 37);

    // 2. Data sender 155 × 95 × 25 mm: rebah di bracket siku, sisi panjang ke arah pintu, ventilasi menghadap depan
    const DX = 118, DY = 172.5, DZ0 = 15, DZ1 = 170, DZ = (DZ0 + DZ1) / 2;
    enc.add(
      B(100, 3, 160, MAT.nut(), 'dataSender', DX, DY - 14, 83),                                   // rak bracket
      B(100, 30, 3, MAT.nut(), 'dataSender', DX, DY - 27.5, 1.5),                                 // kaki bracket ke plate
      RB(95, 25, 155, 2, MAT.blackMt(), 'dataSender', DX, DY, DZ),
      faceAt(dsVentTex(), 93, 23, 'dataSender', DX, DY, DZ1 + 0.1),                               // ujung depan berventilasi
    );
    const dsLed = faceAt(dsLedTex(), 151, 20, 'dataSender', DX - 47.6, DY, DZ); dsLed.rotation.y = -Math.PI / 2;   // sisi kiri: LED
    const dsPort = faceAt(dsPortTex(), 151, 20, 'dataSender', DX + 47.6, DY, DZ); dsPort.rotation.y = Math.PI / 2; // sisi kanan: port
    enc.add(dsLed, dsPort);
    for (const u of DS_SMA_U)                                                                 // konektor SMA antena
      enc.add(P(new THREE.CylinderGeometry(mm(3), mm(3), mm(8), 12).rotateZ(Math.PI / 2), MAT.brass(), 'dataSender', DX + 51.5, DY, DZ1 - u));
    itag('Data sender', 'dataSender', DX + 52, DY + 8, DZ1 - 30);
    const AZ = 64;                                                                           // antena whip di depan MPPT
    for (const ax of [DX - 32, DX + 6]) {
      enc.add(
        P(new THREE.CylinderGeometry(mm(14), mm(15), mm(9), 24), MAT.blackMt(), 'antenna', ax, DY - 20, AZ),     // dasar magnet di bawah rak
        P(new THREE.ConeGeometry(mm(6), mm(14), 16), MAT.blackMt(), 'antenna', ax, DY - 31.5, AZ),
        rodMm([ax, DY - 38, AZ], [ax, -110, AZ], 1.1, MAT.blackMt(), 'antenna'),
      );
      for (let i = 0; i < 9; i++)                                                            // pegas
        enc.add(P(new THREE.TorusGeometry(mm(3.6), mm(0.7), 6, 16).rotateX(Math.PI / 2), MAT.blackMt(), 'antenna', ax, 58 + i * 3, AZ));
    }
    enc.add(P(new THREE.CylinderGeometry(mm(5.5), mm(7), mm(170), 16), MAT.blackMt(), 'antenna', 183, 80, 40));   // antena stik
    itag('Antena', 'antenna', 185, 20, 45);

    // 3. MPPT 140 × 85 × 45 mm: flange, bagian layar (tebal) + bagian terminal (lebih rendah)
    const MX = 64, MY = 74, mL = MX - 62;                                                      // mL = tepi kiri badan (u = 0)
    enc.add(
      RB(140, 85, 3, 1.5, MAT.whitePl(), 'mppt', MX, MY, 1.5),                                  // flange pasang
      RB(124, 55, 42, 3, MAT.whitePl(), 'mppt', MX, MY + 15, 24),                               // bagian layar
      faceAt(mpptDisplayTex(), 122, 53, 'mppt', MX, MY + 15, 45.1),
      RB(124, 30, 30, 3, MAT.whitePl(), 'mppt', MX, MY - 27.5, 18),                             // bagian terminal
      faceAt(mpptTermTex(), 122, 28, 'mppt', MX, MY - 27.5, 33.1),
    );
    for (const sx of [-1, 1]) for (const sy of [-1, 1])
      enc.add(P(new THREE.CylinderGeometry(mm(2.4), mm(2.4), mm(1.5), 10).rotateX(Math.PI / 2), MAT.nut(), 'mppt', MX + sx * 65, MY + sy * 37, 3.8));
    MPPT_BTN_U.forEach(u => enc.add(RB(7, 6, 3, 1, MAT.whitePl(), 'mppt', mL + u, MY + 15 + 20.5, 46)));   // 4 tombol
    MPPT_HOLE_U.forEach((u, i) => {
      enc.add(P(new THREE.CylinderGeometry(mm(1.8), mm(1.8), mm(1), 10).rotateX(Math.PI / 2), MAT.nut(), 'mppt', mL + u, MY - 26.5, 32.6));
      enc.add(B(6, 0.6, 6, MAT.ductSlot(), 'mppt', mL + u, MY - 42.6, 17));                      // lubang kabel di bawah
      enc.add(rodMm([mL + u, MY - 42.5, 17], [mL + u, 18, 22], 1.4, MAT.wire(i % 2 ? 0x1b1b1b : 0xd62b2b), 'mppt'));   // kabel ke duct
    });
    const mLab = faceAt(mpptLabelTex(), 40, 16, 'mppt', MX + 62.05, MY + 12, 24); mLab.rotation.y = Math.PI / 2;     // stiker samping kanan
    const mTab = faceAt(mpptTableTex(), 40, 13, 'mppt', MX - 62.05, MY + 12, 24); mTab.rotation.y = -Math.PI / 2;    // tabel rating samping kiri
    enc.add(mLab, mTab,
      P(new THREE.CylinderGeometry(mm(3), mm(3), mm(8), 12).rotateZ(Math.PI / 2), MAT.whitePl(), 'mppt', MX - 66, MY - 30, 14));   // port sensor suhu
    itag('MPPT (BSC-20)', 'mppt', MX + 62, MY - 20, 33);

    // Kabel dari logger ke duct
    const lw = [0x8a8f94, 0x8a8f94, 0x1b1b1b, 0xd62b2b, 0x3f6fd8, 0xf1f1f1];
    lw.forEach((c, i) => enc.add(rodMm([LX - 34 + i * 7, LY - 69, 20], [LX - 34 + i * 7, 18, 22], 1.3, MAT.wire(c), 'logger')));
    [0xd62b2b, 0xf2c200, 0xf1f1f1, 0x1b1b1b].forEach((c, i) => enc.add(rodMm([LX - 69, LY - 10 - i * 5, 20], [LX - 69 - i * 2, 18, 22], 1.2, MAT.wire(c), 'logger')));

    // 4. Kabel duct berlubang: horizontal tengah, vertikal kanan, pendek di bawah fuse
    const duct = (x0, x1, y0, y1, depth, horizontal) => {
      const w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2, cyy = (y0 + y1) / 2;
      enc.add(B(w, h, depth, MAT.duct(), 'cableDuct', cx, cyy, depth / 2));
      const slots = [], len = horizontal ? w : h, n = Math.floor(len / 14);
      for (let i = 0; i < n; i++) {
        const u = (horizontal ? x0 : y0) + 7 + i * (len - 14) / Math.max(1, n - 1);
        for (const edge of [0, 1]) {
          const g = horizontal ? new THREE.BoxGeometry(mm(3), mm(0.6), mm(depth * 0.55)) : new THREE.BoxGeometry(mm(0.6), mm(3), mm(depth * 0.55));
          if (horizontal) g.translate(mm(u), mm(edge ? y1 + 0.2 : y0 - 0.2), z0 + mm(depth * 0.45));
          else g.translate(mm(edge ? x1 + 0.2 : x0 - 0.2), mm(u), z0 + mm(depth * 0.45));
          slots.push(g);
        }
      }
      if (slots.length) { enc.add(mesh(mergeGeometries(slots), MAT.ductSlot(), 'cableDuct')); slots.forEach(g => g.dispose()); }
      enc.add(B(w + 2, h + 2, 2, MAT.duct(), 'cableDuct', cx, cyy, depth + 1));                  // tutup duct
    };
    duct(-155, 137, -6.5, 18.5, 40, true);
    duct(137, 169, -184, 83, 40, false);
    duct(48, 137, -108.5, -81.5, 40, true);
    itag('Kabel duct', 'cableDuct', -40, 6, 42);

    // 5. WAGO fuse di rel DIN
    const WY = -43;
    enc.add(B(80, 35, 7.5, MAT.nut(), 'wagoFuse', 96, WY, 3.75));
    for (let i = 0; i < 8; i++) {
      const wx = 70 + i * 6.3;
      enc.add(
        B(6.1, 60, 44, MAT.wagoGr(), 'wagoFuse', wx, WY, 7.5 + 22),
        B(5.4, 7, 0.6, MAT.yellow(), 'wagoFuse', wx, WY + 17, 52),
        B(4.6, 16, 5, MAT.duct(), 'wagoFuse', wx, WY - 6, 53.5),                                  // tuas fuse
      );
      enc.add(rodMm([wx, WY + 30, 30], [wx, -6.5, 30], 1.2, MAT.wire(0xd62b2b), 'wagoFuse'));
      enc.add(rodMm([wx, WY - 30, 30], [wx, -81.5, 30], 1.2, MAT.wire(i === 7 ? 0x1b1b1b : 0xd62b2b), 'wagoFuse'));
    }
    enc.add(B(6, 62, 44, MAT.orange(), 'wagoFuse', 70 + 8 * 6.3, WY, 7.5 + 22), B(8, 50, 40, MAT.wagoGr(), 'wagoFuse', 62, WY, 27.5));
    itag('WAGO fuse', 'wagoFuse', 126, WY + 20, 52);

    // 6. Terminal barrier (2 baris)
    for (const [ty, board] of [[-122, false], [-160, true]]) {
      if (board) enc.add(B(98, 30, 2, MAT.yellow(), 'terminal', 94, ty - 4, 1));
      enc.add(B(95, 16, 12, MAT.batt(), 'terminal', 94, ty, (board ? 2 : 0) + 6));
      const fins = [];
      for (let i = 0; i <= 12; i++) { const g = new THREE.BoxGeometry(mm(1.2), mm(18), mm(14)); g.translate(mm(47 + i * 7.9), mm(ty), z0 + mm((board ? 2 : 0) + 7)); fins.push(g); }
      enc.add(mesh(mergeGeometries(fins), MAT.batt(), 'terminal')); fins.forEach(g => g.dispose());
      for (let i = 0; i < 12; i++)
        enc.add(P(new THREE.CylinderGeometry(mm(2.3), mm(2.3), mm(1.5), 10).rotateX(Math.PI / 2), MAT.nut(), 'terminal', 51 + i * 7.9, ty + 3, (board ? 2 : 0) + 12.5));
    }
    itag('Terminal', 'terminal', 142, -140, 14);

    // 7. Baterai 230 × 185 × 140 di lantai box (kiri bawah)
    const BX = -80, floorY = -E.H / 2 + E.t, BZ = 72;
    enc.add(
      B(230, 170, 140, MAT.batt(), 'battery', BX, floorY + 85, BZ),
      B(232, 15, 142, MAT.battLid(), 'battery', BX, floorY + 177.5, BZ),
    );
    for (const [dz, pos] of [[BZ + 45, true], [BZ - 45, false]]) {
      const tx = BX + 95, ty = floorY + 185;
      enc.add(P(new THREE.CylinderGeometry(mm(8), mm(8), mm(3), 16), pos ? MAT.red() : MAT.blackMt(), 'battery', tx, ty + 1.5, dz));
      enc.add(P(new THREE.CylinderGeometry(mm(5), mm(5), mm(7), 6), MAT.nut(), 'battery', tx, ty + 6.5, dz));
    }
    itag('Baterai', 'battery', BX + 115, floorY + 60, BZ + 70);
  }

  // Dimensi enclosure (mm, sesuai gambar)
  enc.add(
    dimension([-W / 2, -EH / 2 - 0.045, ED], [W / 2, -EH / 2 - 0.045, ED], [0, 0.015, 0], `${E.W} mm`, 4),
    dimension([-W / 2 - fl - 0.06, -EH / 2, ED], [-W / 2 - fl - 0.06, EH / 2, ED], [0.015, 0, 0], `${E.H} mm`, 4),
    dimension([-W / 2 - fl - 0.06, EH / 2 + 0.035, 0], [-W / 2 - fl - 0.06, EH / 2 + 0.035, ED], [0, 0.015, 0], `${E.D} mm`, 4),
  );

  // ---------- Krangkeng pelindung (badan belakang + pintu baki depan) ----------
  const Wc = mm(CAGE.W), Hc = mm(CAGE.H), Dc = mm(CAGE.D), Ds = mm(CAGE.split), Dd = Dc - Ds;
  const ct = mm(CAGE.tube), cdt = mm(CAGE.doorTube), pitch = mm(CAGE.mesh), wr = mm(CAGE.wire) / 2;
  const cageG = new THREE.Group(); cageG.position.set(mm(CAGE.offsetX), cy, zF); G.cage.add(cageG);
  const tubeBox = (w, h, dd, x, y, z, name = 'cage') => part(new THREE.BoxGeometry(w, h, dd), MAT.paint(), name, x, y, z);
  const meshPanel = (w, h, x, y, z, rx = 0, ry = 0, name = 'cage') => {
    const m = part(wireGrid(w, h, pitch, wr), MAT.paint(), name, x, y, z); m.rotation.set(rx, ry, 0); return m;
  };
  // Rangka kotak terbuka di satu muka: 12 rusuk, x0/x1 = pusat tiang kiri/kanan, z0/z1 = pusat rusuk belakang/depan
  const boxFrame = (grp, t, x0, x1, hy, z0, z1, name) => {
    for (const x of [x0, x1]) for (const z of [z0, z1]) grp.add(tubeBox(t, 2 * hy + t, t, x, 0, z, name));
    for (const y of [-hy, hy]) {
      for (const z of [z0, z1]) grp.add(tubeBox(x1 - x0 - t, t, t, (x0 + x1) / 2, y, z, name));
      for (const x of [x0, x1]) grp.add(tubeBox(t, t, z1 - z0 - t, x, y, (z0 + z1) / 2, name));
    }
  };
  // Badan: belakang + sisi sedalam Ds, muka depan terbuka
  const cxs = Wc / 2 - ct / 2, cys = Hc / 2 - ct / 2;
  boxFrame(cageG, ct, -cxs, cxs, cys, ct / 2, Ds - ct / 2, 'cage');
  cageG.add(
    meshPanel(Wc - ct, Hc - ct, 0, 0, ct / 2),                                              // belakang
    meshPanel(Ds - ct, Hc - ct, -cxs, 0, Ds / 2, 0, Math.PI / 2),                           // kiri
    meshPanel(Ds - ct, Hc - ct, cxs, 0, Ds / 2, 0, Math.PI / 2),                            // kanan
    meshPanel(Wc - ct, Ds - ct, 0, cys, Ds / 2, Math.PI / 2),                               // atas
    meshPanel(Wc - ct, Ds - ct, 0, -cys, Ds / 2, Math.PI / 2),                              // bawah
  );
  const cgTag = tag('Krangkeng pelindung', 'cage'); cgTag.position.set(Wc / 2, Hc / 2 - 0.03, Ds / 2); cageG.add(cgTag);

  // Pintu baki: muka depan + sisi sedalam Dd, engsel kanan pada garis bagi, membuka ke kanan
  const cdPivot = new THREE.Group(); cdPivot.position.set(Wc / 2, 0, Ds); cageG.add(cdPivot);
  const dxl = -Wc + cdt / 2, dxr = -cdt / 2, dys = Hc / 2 - cdt / 2;
  boxFrame(cdPivot, cdt, dxl, dxr, dys, cdt / 2, Dd - cdt / 2, 'cageDoor');
  cdPivot.add(
    meshPanel(Wc - cdt, Hc - cdt, -Wc / 2, 0, Dd - cdt / 2, 0, 0, 'cageDoor'),              // muka depan
    meshPanel(Dd - cdt, Hc - cdt, dxl, 0, Dd / 2, 0, Math.PI / 2, 'cageDoor'),              // sisi kiri
    meshPanel(Dd - cdt, Hc - cdt, dxr, 0, Dd / 2, 0, Math.PI / 2, 'cageDoor'),              // sisi kanan
    meshPanel(Wc - cdt, Dd - cdt, -Wc / 2, dys, Dd / 2, Math.PI / 2, 0, 'cageDoor'),        // atas
    meshPanel(Wc - cdt, Dd - cdt, -Wc / 2, -dys, Dd / 2, Math.PI / 2, 0, 'cageDoor'),       // bawah
  );
  for (const hy of [Hc / 2 - 0.09, 0, -Hc / 2 + 0.09])                                    // 3 engsel di garis bagi
    cdPivot.add(part(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 16), MAT.paint(), 'cageDoor', 0.006, hy, 0));
  const cdTag = tag('Pintu krangkeng', 'cageDoor', { maxDist: 4 });
  cdTag.position.set(-Wc * 0.3, -Hc / 2 + 0.06, Dd); cdPivot.add(cdTag);

  // ---------- Kunci krangkeng (sisi kiri, pada garis bagi) ----------
  // Kotak gembok: plat 4 sisi dilas di sisi luar tiang depan-kiri badan; atas ditutup penutup lepas, bawah terbuka.
  // Muka depan kotak (menghadap pintu) diberi celah horizontal yang hanya pas untuk lidah pintu.
  const lkX1 = -Wc / 2, lkX0 = lkX1 - 0.07, lkZF = Ds - 0.002, lkZB = lkZF - 0.085, lkH = 0.12, lkT = 0.002;
  const ys = -0.02, hx = lkX1 - 0.02, hz = Ds - 0.025;                   // tinggi staple & sumbu lubang gembok
  const slot0 = ys + 0.003, slot1 = ys + 0.011, cutX = 0.045;
  const lkXc = (lkX0 + lkX1) / 2, lkZc = (lkZF + lkZB) / 2, upH = lkH / 2 - slot1, dnH = slot0 + lkH / 2;
  const wall = (w, h, dd, x, y, z, name = 'padlock') => tubeBox(w, h, dd, x, y, z, name);
  cageG.add(
    wall(lkT, lkH, lkZF - lkZB, lkX0 + lkT / 2, 0, lkZc),                                   // sisi luar
    wall(lkT, lkH, lkZF - lkZB, lkX1 - lkT / 2, 0, lkZc),                                   // sisi dalam (ke badan)
    wall(lkX1 - lkX0, lkH, lkT, lkXc, 0, lkZB + lkT / 2),                                  // sisi belakang
    wall(lkX1 - lkX0 - cutX, lkH, lkT, lkX0 + (lkX1 - lkX0 - cutX) / 2, 0, lkZF - lkT / 2),  // muka depan
    wall(cutX, upH, lkT, lkX1 - cutX / 2, (lkH / 2 + slot1) / 2, lkZF - lkT / 2),           // di atas celah
    wall(cutX, dnH, lkT, lkX1 - cutX / 2, (slot0 - lkH / 2) / 2, lkZF - lkT / 2),           // di bawah celah
  );
  // Staple: plat datar berlubang dilas ke tiang, di dalam kotak
  cageG.add(part(holedTab(0.034, 0.032, 0.004, 0.0045, hx - (lkX1 - 0.019), 0), MAT.paint(), 'padlock', lkX1 - 0.019, ys, hz));
  // Penutup atas: plat + flange pengarah + lidah berlubang (menumpuk di atas lidah pintu).
  // Dilepas (diangkat) saat pintu krangkeng dibuka.
  const lidG = new THREE.Group(); cageG.add(lidG);
  lidG.add(
    wall(lkX1 - lkX0 + 0.006, 0.003, lkZF - lkZB + 0.006, lkXc, lkH / 2 + 0.0015, lkZc, 'lockLid'),
    wall(0.003, 0.035, lkZF - lkZB - 0.012, lkX0 + lkT + 0.002, lkH / 2 - 0.0175, lkZc, 'lockLid'),
    wall(0.003, lkH / 2 - (ys + 0.011), 0.02, hx - 0.0165, (lkH / 2 + ys + 0.011) / 2, hz, 'lockLid'),
    part(holedTab(0.03, 0.025, 0.004, 0.0045), MAT.paint(), 'lockLid', hx, ys + 0.013, hz),
  );
  const lkTag = tag('Kotak gembok', 'padlock', { maxDist: 3 });
  lkTag.position.set(lkX0, -lkH / 2 + 0.01, lkZc); cageG.add(lkTag);
  const llTag = tag('Penutup atas', 'lockLid', { maxDist: 2, when: () => live.cageVis < 0.5 });
  llTag.position.set(lkX0, lkH / 2, lkZc); lidG.add(llTag);
  root.userData.lockLid = lidG;
  // Lidah kunci: dilas di muka luar tiang belakang-kiri pintu, menjulur ke belakang masuk celah kotak
  const tbX = lkX1 - 0.019 - Wc / 2, tbZ = -0.014;                         // pusat lidah (koordinat engsel pintu)
  cdPivot.add(
    part(holedTab(0.034, 0.052, 0.004, 0.0045, (hx - Wc / 2) - tbX, (hz - Ds) - tbZ), MAT.paint(), 'hasp', tbX, ys + 0.007, tbZ),
    part(new THREE.BoxGeometry(0.003, 0.004, 0.012), MAT.paint(), 'hasp', -Wc - 0.0015, ys + 0.007, 0.006),   // las ke tiang pintu
  );
  const hsTag = tag('Lidah kunci', 'hasp', { maxDist: 2.5, when: () => live.cageVis > 20 });
  hsTag.position.set(tbX - 0.018, ys + 0.007, tbZ); cdPivot.add(hsTag);
  // Gembok: shackle lewat lubang staple, lidah pintu & lidah penutup; kaki kedua di belakang lidah
  const lockG = new THREE.Group(); lockG.position.set(hx, ys, hz);
  const shR = 0.011, shr = 0.0028, legTop = 0.024, legBot = -0.012;
  const arcS = part(new THREE.TorusGeometry(shR, shr, 8, 20, Math.PI), MAT.nut(), 'padlock', 0, legTop, -shR);
  arcS.rotation.y = Math.PI / 2;
  lockG.add(
    arcS,
    rodBetween([0, legBot, 0], [0, legTop, 0], shr, MAT.nut(), 'padlock'),
    rodBetween([0, legBot, -2 * shR], [0, legTop, -2 * shR], shr, MAT.nut(), 'padlock'),
    part(new RoundedBoxGeometry(0.015, 0.032, 0.04, 2, 0.003), MAT.brass(), 'padlock', 0, legBot - 0.016, -shR),
  );
  cageG.add(lockG);

  // Klem krangkeng ke tiang (2 bagian): setengah lingkar depan dilas ke rangka belakang krangkeng +
  // strap setengah lingkar belakang; kuping keduanya dibaut M10. Atas & bawah.
  const clW = 0.04, earL = 0.03;
  const halfRing = front => {
    const sh = new THREE.Shape();
    sh.moveTo(ro + clT, 0); sh.absarc(0, 0, ro + clT, 0, Math.PI, false);
    sh.lineTo(-ro, 0); sh.absarc(0, 0, ro, Math.PI, 0, true);
    const g = new THREE.ExtrudeGeometry(sh, { depth: clW, bevelEnabled: false, curveSegments: 24 });
    if (front) { g.rotateX(Math.PI / 2); g.translate(0, clW / 2, 0); } else { g.rotateX(-Math.PI / 2); g.translate(0, -clW / 2, 0); }
    return g;
  };
  // Sub-grup untuk explode: bagian depan ikut krangkeng (dilas), strap / baut / mur dilepas
  const clFront = new THREE.Group(), clStrap = new THREE.Group(), clBolts = new THREE.Group();
  const clNuts = { [-1]: new THREE.Group(), [1]: new THREE.Group() };
  G.bracket.add(clFront, clStrap, clBolts, clNuts[-1], clNuts[1]);
  for (const sy of [-1, 1]) {
    const yC = cy + sy * cys;
    clFront.add(part(halfRing(true), MAT.paint(), 'bracket', 0, yC, 0));
    clStrap.add(part(halfRing(false), MAT.paint(), 'bracket', 0, yC, 0));
    for (const sx of [-1, 1]) {
      const exC = sx * (ro + earL / 2), bx = sx * (ro + clT + earL * 0.45);
      const hd = part(uNutGeo, MAT.nut(), 'bracket', bx, yC, -clT - 0.004); hd.rotation.x = Math.PI / 2;
      const nt = part(uNutGeo, MAT.nut(), 'bracket', bx, yC, clT + 0.004); nt.rotation.x = Math.PI / 2;
      const earGeo = holedPlateXY(earL, clW, clT, [[bx - exC, 0, 0.0055]]);                 // kuping berlubang M10
      clFront.add(part(earGeo, MAT.paint(), 'bracket', exC, yC, clT / 2));                   // kuping depan
      clStrap.add(part(earGeo, MAT.paint(), 'bracket', exC, yC, -clT / 2));                  // kuping belakang
      clBolts.add(hd, rodBetween([bx, yC, -clT - 0.008], [bx, yC, clT + 0.01], 0.005, MAT.bolt(), 'bracket'));
      clNuts[sx].add(nt);
    }
  }
  const bTag = tag('Klem tiang (biru)', 'bracket', { maxDist: 3 });
  bTag.position.set(ro + earL, cy + cys, 0); clFront.add(bTag);
  root.userData.clamp = { front: clFront, strap: clStrap, bolts: clBolts, nutL: clNuts[-1], nutR: clNuts[1] };

  // Data tabrakan 2D (bidang x–z, koordinat lokal krangkeng) untuk batas buka pintu box
  // ---------- Dudukan enclosure: 2 besi strip di rangka belakang krangkeng + 4 baut di sudut box ----------
  const mbX = W / 2 - mm(ENC_MOUNT.boltX), mbY = EH / 2 - mm(ENC_MOUNT.boltY), sW = mm(ENC_MOUNT.stripW);
  for (const sy of [1, -1])                                               // strip dilas di muka depan tiang-tiang belakang
    cageG.add(part(holedPlateXY(2 * cxs, sW, stripT, [-1, 1].map(sx => [sx * mbX - mm(CAGE.offsetX), 0, mm(ENC_MOUNT.bolt) / 2 + 0.0005])),
      MAT.paint(), 'encMount', 0, sy * mbY, ct + stripT / 2));
  // Baut dipasang dari luar: kepala di balik strip → tembus strip → masuk mur tanam di sudut punggung box
  const emBolts = new THREE.Group();
  const emBase = new THREE.Group(); emBase.position.copy(enc.position); G.encMount.add(emBase);   // koordinat = lokal box
  emBase.add(emBolts);                                                                     // (posisinya diatur explode)
  const mbR = mm(ENC_MOUNT.bolt) / 2;
  const mHead = new THREE.CylinderGeometry(mbR * 1.8, mbR * 1.8, 0.005, 6).rotateX(Math.PI / 2);
  const mWasher = new THREE.CylinderGeometry(mbR * 2.2, mbR * 2.2, 0.0015, 20).rotateX(Math.PI / 2);
  const mBoss = new THREE.CylinderGeometry(0.008, 0.009, ribT, 20).rotateX(Math.PI / 2);
  const mInsert = new THREE.CylinderGeometry(mbR * 1.25, mbR * 1.25, 0.0105, 6).rotateX(Math.PI / 2);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const bx = sx * mbX, by = sy * mbY, zBack = -(ribT + stripT);         // zBack = muka belakang strip (lokal box)
    enc.add(                                                              // dudukan + mur tanam kuningan (bagian box)
      part(mBoss, MAT.encBody(), 'encMount', bx, by, -ribT / 2),
      part(mInsert, MAT.brass(), 'encMount', bx, by, -ribT + 0.0052),
    );
    emBolts.add(
      part(mWasher, MAT.nut(), 'encMount', bx, by, zBack - 0.00075),
      part(mHead, MAT.nut(), 'encMount', bx, by, zBack - 0.004),         // kepala baut di balik strip
      rodBetween([bx, by, zBack - 0.002], [bx, by, 0.004], mbR, MAT.bolt(), 'encMount'),
    );
  }
  const emTag = tag('Besi strip + baut box', 'encMount', { maxDist: 2.5 });
  emTag.position.set(Wc / 2 - ct, mbY + sW / 2, ct + stripT); cageG.add(emTag);
  root.userData.encMount = { bolts: emBolts };

  const ex = -mm(CAGE.offsetX), ez = ct + stripT + ribT;        // pusat punggung box relatif krangkeng
  root.userData.collide = {
    lidPivot: [ex + HX, ez + zJ],
    lidPoly: rectPoly(-(HX + W / 2) - 0.008, W / 2 - HX, 0, lidD),        // badan tutup (+ kait latch di kiri)
    statics: [rectPoly(Wc / 2 - ct, Wc / 2, 0, Ds)],                         // sisi kanan badan krangkeng
    doorPivot: [Wc / 2, Ds],
    doorPolys: [rectPoly(-cdt, 0, 0, Dd), rectPoly(-Wc, 0, Dd - cdt, Dd), rectPoly(-Wc, -Wc + cdt, 0, Dd)],  // sisi kanan, muka, sisi kiri pintu
  };
  root.userData.cageDoorPivot = cdPivot;
  root.userData.padlock = lockG;

  // ---------- Antipanjat: kerah belah dua (depan / belakang) dibaut di 2 kuping, 6 jari per belahan ----------
  const acY = d.acY, acR0 = ro + 0.006, acT = 0.008, acH = 0.1, earW = 0.03;
  const acHalf = { [1]: new THREE.Group(), [-1]: new THREE.Group() }, acBolts = new THREE.Group(), acNuts = new THREE.Group();
  G.antiClimb.add(acHalf[1], acHalf[-1], acBolts, acNuts);
  const collarHalf = front => {                                        // setengah cincin, tebal acT, tinggi acH
    const sh = new THREE.Shape();
    sh.moveTo(ro + acT, 0); sh.absarc(0, 0, ro + acT, 0, Math.PI, false);
    sh.lineTo(-ro, 0); sh.absarc(0, 0, ro, Math.PI, 0, true);
    const g = new THREE.ExtrudeGeometry(sh, { depth: acH, bevelEnabled: false, curveSegments: 24 });
    if (front) { g.rotateX(Math.PI / 2); g.translate(0, acH / 2, 0); } else { g.rotateX(-Math.PI / 2); g.translate(0, -acH / 2, 0); }
    return g;
  };
  for (const sz of [1, -1]) {
    acHalf[sz].add(part(collarHalf(sz > 0), MAT.rod(), 'antiClimb', 0, acY, 0));
    for (const sx of [-1, 1])                                          // kuping kiri & kanan tiap belahan
      acHalf[sz].add(part(holedPlateXY(earW, 0.08, 0.006, [[sx * 0.002, 0.022, 0.0055], [sx * 0.002, -0.022, 0.0055]]),
        MAT.rod(), 'antiClimb', sx * (ro + acT + earW / 2 - 0.002), acY, sz * 0.003));
  }
  const acBoltX = ro + acT + earW * 0.5;
  for (const sx of [-1, 1]) for (const by of [acY + 0.022, acY - 0.022]) {   // 4 baut M10 lewat kuping (sumbu z)
    const bx = sx * acBoltX;
    const hd = part(uNutGeo, MAT.nut(), 'antiClimb', bx, by, 0.01); hd.rotation.x = Math.PI / 2;
    const nt = part(uNutGeo, MAT.nut(), 'antiClimb', bx, by, -0.01); nt.rotation.x = Math.PI / 2;
    acBolts.add(hd, rodBetween([bx, by, 0.012], [bx, by, -0.018], 0.005, MAT.bolt(), 'antiClimb'));
    acNuts.add(nt);
  }
  const nSpike = 8;                                                  // 8 jari sebidang, di tengah tiap 45° (bebas dari kuping)
  for (let i = 0; i < nSpike; i++) {
    const phi = (i + 0.5) / nSpike * Math.PI * 2, ux = Math.cos(phi), uz = Math.sin(phi);
    const y0 = acY;
    const pA = [ux * acR0, y0, uz * acR0];
    const pB = [ux * (acR0 + 0.22), y0 - 0.04, uz * (acR0 + 0.22)];      // jari mendatar ± 0.22 m (perkiraan)
    const pC = [ux * (acR0 + 0.27), y0 - 0.2, uz * (acR0 + 0.27)];       // ujung ditekuk turun ± 0.16 m
    acHalf[uz > 0 ? 1 : -1].add(rodBetween(pA, pB, 0.006, MAT.rod(), 'antiClimb'), rodBetween(pB, pC, 0.006, MAT.rod(), 'antiClimb'),
      part(new THREE.SphereGeometry(0.006, 8, 6), MAT.rod(), 'antiClimb', ...pB));
  }
  const acTag = tag('Antipanjat', 'antiClimb'); acTag.position.set(acR0 + 0.17, acY - 0.03, 0.08); acHalf[1].add(acTag);
  root.userData.antiClimb = { front: acHalf[1], back: acHalf[-1], bolts: acBolts, nuts: acNuts };

  // ---------- Panel surya + bracket aluminium bending ----------
  const poleTop = yP1 + H, tilt = THREE.MathUtils.degToRad(p.pvTilt), Pw = mm(p.pvW), Pd = mm(p.pvD);
  const solar = new THREE.Group(); solar.position.y = poleTop;
  solar.rotation.y = THREE.MathUtils.degToRad(p.pvAz - 180);          // lokal: panel menghadap -Z
  G.solar.add(solar);
  const pvAsm = new THREE.Group(), pvU = new THREE.Group(), pvNuts = new THREE.Group();   // rakitan bracket+panel, U-bolt, mur
  solar.add(pvAsm, pvU, pvNuts);
  root.userData.pv = { asm: pvAsm, ubolt: pvU, nuts: pvNuts };
  // Bracket: plat aluminium ditekuk jadi kanal U — plat belakang (4 lubang U-bolt) menempel di sisi belakang tiang,
  // 2 sayap segitiga sepanjang kedalaman panel; bibir atas sayap ditekuk keluar & dibaut ke rangka depan/belakang panel.
  const BR = PV_BRACKET, bW = mm(BR.W), bH = mm(d.pvBrH), bt = mm(BR.t), bLip = mm(BR.lip), bHole = mm(BR.holeD) / 2;
  const yTopW = -0.06, yBotW = yTopW - bH, zW = -(ro + bt);          // plat belakang: z dari zW sampai −ro
  const tanT = Math.tan(tilt), cut = mm(BR.cut);                       // cut = serong kecil di pangkal bawah sayap
  const bL = Pd * Math.cos(tilt);                                      // panjang sayap (horizontal) = kedalaman panel
  const uyB = [yTopW - 0.045, yBotW + 0.045];                         // tinggi 2 U-bolt
  const web = new THREE.Shape();
  web.moveTo(-bW / 2 + bt, yBotW); web.lineTo(bW / 2 - bt, yBotW); web.lineTo(bW / 2 - bt, yTopW); web.lineTo(-bW / 2 + bt, yTopW); web.closePath();
  for (const y of uyB) for (const sx of [-1, 1]) { const h = new THREE.Path(); h.absarc(sx * uR, y, bHole, 0, Math.PI * 2, true); web.holes.push(h); }
  pvAsm.add(part(new THREE.ExtrudeGeometry(web, { depth: bt, bevelEnabled: false, curveSegments: 16 }), MAT.alu(), 'solarBracket', 0, 0, zW));
  const wing = new THREE.Shape();                                      // profil sayap (u = jarak dari plat belakang)
  wing.moveTo(0, yBotW); wing.lineTo(cut, yBotW + cut); wing.lineTo(bL, yBotW + cut);
  wing.lineTo(bL, yTopW - bL * tanT); wing.lineTo(0, yTopW); wing.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(wing, { depth: bt, bevelEnabled: false });
  wingGeo.rotateY(Math.PI / 2);                                        // u → −z, tebal → +x
  for (const x0 of [-bW / 2, bW / 2 - bt]) pvAsm.add(part(wingGeo, MAT.alu(), 'solarBracket', x0, 0, zW));
  for (const uy of uyB) {                                              // 2 U-bolt M10 melingkar di depan tiang
    const arc = mesh(new THREE.TorusGeometry(uR, ubR, 8, 40, Math.PI), MAT.bolt(), 'solarBracket');
    arc.rotation.x = Math.PI / 2; arc.position.y = uy; pvU.add(arc);
    for (const sx of [-1, 1]) {
      pvU.add(rodBetween([sx * uR, uy, 0], [sx * uR, uy, zW - 0.014], ubR, MAT.bolt(), 'solarBracket'));
      const un = mesh(uNutGeo, MAT.nut(), 'solarBracket'); un.rotation.x = Math.PI / 2; un.position.set(sx * uR, uy, zW - 0.004); pvNuts.add(un);
    }
  }
  const nrm = [Math.cos(tilt), -Math.sin(tilt)], sdir = [-Math.sin(tilt), -Math.cos(tilt)];   // (y, z)
  const P = (x, sAlong, off = 0) => [x, yTopW + sdir[0] * sAlong + nrm[0] * off, zW + sdir[1] * sAlong + nrm[1] * off];
  const Ls = Pd, fr = mm(PANEL_FRAME), ft = 0.035;                    // bibir sepanjang panel; fr/ft = profil rangka panel
  const boltS = [fr / 2, Pd - fr / 2];                                 // posisi baut: tengah rangka depan & belakang panel
  const boltHead = new THREE.CylinderGeometry(0.0065, 0.0065, 0.005, 6);
  for (const sx of [-1, 1]) {                                          // bibir atas sayap, 2 lubang baut panel
    const lx = sx * (bW / 2 + bLip / 2);
    const lip = part(holedPlate(bLip, Ls, bt, boltS.map(sb => [0, Ls / 2 - sb, 0.0045])), MAT.alu(), 'solarBracket', ...P(lx, Ls / 2, bt / 2));
    lip.rotation.x = -tilt; pvAsm.add(lip);
    for (const sb of boltS) {                                          // baut M8: kepala di bawah bibir, masuk ke rangka panel
      const hd = part(boltHead, MAT.nut(), 'solarBracket', ...P(lx, sb, -0.0025)); hd.rotation.x = -tilt;
      pvAsm.add(hd, rodBetween(P(lx, sb, -0.004), P(lx, sb, bt + 0.012), 0.004, MAT.bolt(), 'solarBracket'));
    }
  }
  const pnl = new THREE.Group(); pnl.position.set(...P(0, Pd / 2, bt + ft / 2)); pnl.rotation.x = -tilt;   // rangka panel duduk di atas bibir
  pnl.add(
    part(new THREE.BoxGeometry(Pw, ft, fr), MAT.alu(), 'solarPanel', 0, 0, Pd / 2 - fr / 2),
    part(new THREE.BoxGeometry(Pw, ft, fr), MAT.alu(), 'solarPanel', 0, 0, -Pd / 2 + fr / 2),
    part(new THREE.BoxGeometry(fr, ft, Pd - 2 * fr), MAT.alu(), 'solarPanel', Pw / 2 - fr / 2, 0, 0),
    part(new THREE.BoxGeometry(fr, ft, Pd - 2 * fr), MAT.alu(), 'solarPanel', -Pw / 2 + fr / 2, 0, 0),
    part(new THREE.BoxGeometry(Pw - 2 * fr, 0.004, Pd - 2 * fr), MAT.plastic(), 'solarPanel', 0, -0.008, 0),   // backsheet
  );
  const jBox = part(new THREE.BoxGeometry(0.1, 0.02, 0.07), MAT.plastic(), 'solarPanel', 0, -0.02, Pd / 2 - 0.12);   // junction box
  pnl.add(jBox);
  const cellsGeo = new THREE.PlaneGeometry(Pw - 2 * fr, Pd - 2 * fr); cellsGeo.rotateX(-Math.PI / 2);
  pnl.add(part(cellsGeo, MAT.cells(p.pvW, p.pvD), 'solarPanel', 0, 0.012, 0));
  pvAsm.add(pnl);
  const pvTag = tag('Panel surya', 'solarPanel'); pvTag.position.set(Pw / 2, 0.02, 0); pnl.add(pvTag);
  const sbTag = tag('Bracket aluminium + U-bolt', 'solarBracket', { maxDist: 3 });
  sbTag.position.set(bW / 2 + bt, yBotW + 0.06, zW - 0.06); pvAsm.add(sbTag);

  // ---------- Konektor SP21 + kabel panel surya dalam conduit hitam ----------
  // Naik di sisi belakang-kanan tiang (315°, celah antar jari antipanjat, di luar strap klem & kerah),
  // lalu memutar ke depan di bawah bracket dan masuk di antara kedua sayap ke junction box.
  const station = { enc, cy, EH, t, W, Wc, ct, Ds, pitch, zF, ox: mm(CAGE.offsetX), ro, poleTop };
  root.userData.station = station;
  {
    root.updateMatrixWorld(true);
    const jb = jBox.localToWorld(new THREE.Vector3(0, -0.01, 0));                            // muka bawah junction box
    const yEnd = jb.y - 0.035, yT = poleTop;
    const pol = (deg, y, r = 0.063) => [r * Math.cos(THREE.MathUtils.degToRad(deg)), y, r * Math.sin(THREE.MathUtils.degToRad(deg))];
    const PH = 315;                                         // tengah celah antar jari antipanjat (292,5° & 337,5°)
    const B = opts.pvBulge;
    sp21Cable(station, {
      slot: 0, wireToY: mm(-184), group: G.pvCable, phi: PH, yH: cy - 0.41,
      route: [...(B ? [pol(PH, B.y0 - 0.05), pol(PH, B.y0, B.R), pol(PH, B.y1, B.R), pol(PH, B.y1 + 0.05)] : []), pol(PH, yT - 0.43)],
      // memutar ke depan lewat sisi kanan, lalu lepas dari tiang di 60° menuju junction box
      // (jalur ini tetap bebas dari tiang saat conduit dijauhkan ke arah 315° pada explode)
      tail: [pol(PH, yT - 0.43), pol(PH, yT - 0.37), pol(345, yT - 0.33), pol(15, yT - 0.31), pol(45, yT - 0.3), pol(60, yT - 0.29),
             [jb.x / 2 + pol(60, 0)[0] / 2, (yT - 0.29 + yEnd - 0.03) / 2, (pol(60, 0)[2] + jb.z) / 2], [jb.x, yEnd - 0.03, jb.z], [jb.x, yEnd, jb.z]],
      endCable: [[jb.x, yEnd - 0.015, jb.z], [jb.x, jb.y + 0.004, jb.z]],
      tagText: 'Kabel panel + conduit', tagAt: pol(PH, d.acY + 0.25), plugTag: 'Konektor SP21 2 pin',
    });
    root.userData.pvCableDir = [Math.cos(THREE.MathUtils.degToRad(PH)), Math.sin(THREE.MathUtils.degToRad(PH))];   // arah lepas saat explode (x, z)
  }

  root.userData.d = d;
  root.userData.groups = G;
  return root;
}
