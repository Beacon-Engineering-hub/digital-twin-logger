import * as THREE from 'three';
import { MAT } from '../materials.js';
import { holedPlate, mesh, rodBetween } from '../geometry.js';
import { dimension, tag } from '../labels.js';
import { sp21Cable, CONDUIT_R, POLE_GAP } from '../model/sp21.js';
import { SAWAH, SITES, riverAt } from '../world.js';
import { BANK, ENV } from '../env.js';

// V-Notch (satuan m). Dari foto pemasangan user: bracket dinding baja cat biru dibaut ke muka dalam dinding kolam penenang —
// tiang kanal-C dengan plat atas & bawah (masing-masing 2 baut angkur), lengan mendatar + batang miring (sambungan baut),
// ujung lengan = pipa dudukan tegak (tutup abu-abu di atas, lubang samping untuk kabel) + plat L di bawah lengan (kaki tegak
// turun dari lengan, kaki datar di bawah pipa dudukan, berlubang). Sensor ultrasonik silinder Ø40 mm berbodi ulir penuh
// (dari user) dipasang tegak: menembus lubang plat L, dijepit 2 mur, ujung atas masuk pipa dudukan, muka sensor menghadap
// ke bawah segaris dasar takik V. Kabel sensor dalam conduit fleksibel hitam (komponen yang sama dengan AWLR) dari konektor
// SP21 box, turun di sisi tiang, melintang di atas dinding kolam, lalu di atas lengan masuk ke lubang samping dudukan dan
// tersambung ke konektor di ujung atas sensor. Kolam penenang & dinding takik V = bagian dunia (sawah.js).
// Ukuran bracket, panjang sensor, jarak sensor ke takik = perkiraan dari foto.
export const BR = {
  arm: 0.04, strut: 0.035,                                   // profil kotak 40 & 35 mm
  post: { w: 0.05, d: 0.045, t: 0.005, h: 0.38 },            // tiang kanal-C menempel dinding
  bar: { l: 0.2, h: 0.04, t: 0.006, bolt: 0.08 },            // plat atas & bawah, baut angkur ± 80 mm dari tengah
  holder: { R: 0.0325, wall: 0.004, h: 0.12 },               // pipa dudukan sensor
  stub: { R: 0.014, L: 0.045 },                              // lubang samping kabel
  L: { t: 0.005, w: 0.07, drop: 0.07, inset: 0.035 },        // plat L: tebal, lebar, turun dari bawah lengan, jarak kaki tegak dari pipa
};
export const SENSOR = { R: 0.02, len: 0.13, below: 0.03 };   // ultrasonik Ø40 mm (user), panjang & tonjolan di bawah plat L = perkiraan
export const CAP = { R: 0.04, h: 0.07 };                      // tutup pipa abu-abu

// Tinggi-tinggi lokal stasiun dari data kolam di dunia (y dunia → lokal = y − tinggi tanah stasiun)
const VN = SAWAH.VN, Y = y => y - SITES.vnotch.y;
const xC = VN.lat, xW = VN.lat - VN.half;                  // sumbu kolam (= sumbu sensor), muka dalam dinding sisi stasiun
const yWT = Y(VN.top), yA = yWT - 0.065;                   // puncak dinding kolam, sumbu lengan
const yH0 = yA - 0.03, yH1 = yH0 + BR.holder.h;            // bawah / atas pipa dudukan
const yLb = yA - BR.arm / 2 - BR.L.drop;                   // bawah kaki datar plat L
const yFace = yLb - SENSOR.below;                          // muka sensor (menghadap ke bawah)
const toNotch = () => yFace - Y(VN.notch);

// Pipa berongga sepanjang +Y (0 → len), ujung terbuka
const pipeGeo = (len, r, wall) => { const V = THREE.Vector2, ri = r - wall; return new THREE.LatheGeometry([new V(ri, 0), new V(r, 0), new V(r, len), new V(ri, len), new V(ri, 0)], 32); };
const hexGeo = (af, h) => new THREE.CylinderGeometry(af / 2 / Math.cos(Math.PI / 6), af / 2 / Math.cos(Math.PI / 6), h, 6);

function extend(model) {
  const d = model.userData.d, S = model.userData.station;
  const root = new THREE.Group(); root.name = 'vnotch'; model.add(root);
  const newG = () => { const g = new THREE.Group(); root.add(g); return g; };
  const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
  const blue = MAT.paint(), U = {};
  const box = (g, w, h, dp, x, y, z, part = 'vnBracket', mat = blue) => g.add(at(mesh(new THREE.BoxGeometry(w, h, dp), mat, part), x, y, z));
  // Baut sepanjang z (sambungan engsel) & sepanjang x (angkur ke dinding)
  const boltZ = (g, x, y, half) => {
    g.add(rodBetween([x, y, -half - 0.006], [x, y, half + 0.006], 0.005, MAT.bolt(), 'vnBracket'));
    for (const s of [-1, 1]) { const n = at(mesh(hexGeo(0.016, 0.007), MAT.nut(), 'vnBracket'), x, y, s * (half + 0.0035)); n.rotation.x = Math.PI / 2; g.add(n); }
  };
  const anchor = (g, y, z) => {
    const xf = xW + BR.bar.t;
    g.add(rodBetween([xW - 0.03, y, z], [xf + 0.02, y, z], 0.005, MAT.thread(0.05), 'vnBracket'));
    const w = at(mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.002, 20), MAT.nut(), 'vnBracket'), xf + 0.001, y, z); w.rotation.z = Math.PI / 2;
    const n = at(mesh(hexGeo(0.016, 0.008), MAT.nut(), 'vnBracket'), xf + 0.006, y, z); n.rotation.z = Math.PI / 2;
    g.add(w, n);
  };

  // ---------- Bracket dinding ----------
  const br = U.bracket = newG();
  const P = BR.post, B = BR.bar, yTop = yA + 0.05, yBot = yTop - P.h, xWeb = xW + B.t;
  for (const yb of [yTop - B.h / 2, yBot + B.h / 2]) {                           // plat atas & bawah + 2 baut angkur
    box(br, B.t, B.h, B.l, xW + B.t / 2, yb, 0);
    for (const s of [-1, 1]) anchor(br, yb, s * B.bolt);
  }
  box(br, P.t, P.h, P.w, xWeb + P.t / 2, (yTop + yBot) / 2, 0);                  // badan kanal-C
  for (const s of [-1, 1]) box(br, P.d, P.h, P.t, xWeb + P.d / 2, (yTop + yBot) / 2, s * (P.w / 2 - P.t / 2));   // sayap
  const xa0 = xWeb + P.t, xa1 = xC - BR.holder.R + 0.002;
  box(br, xa1 - xa0, BR.arm, BR.arm, (xa0 + xa1) / 2, yA, 0);                  // lengan mendatar (kotak 40 mm)
  boltZ(br, xWeb + 0.026, yA, P.w / 2);                                          // engsel lengan di antara sayap
  const p1 = new THREE.Vector3(xWeb + 0.024, yBot + 0.03, 0), p2 = new THREE.Vector3(xW + 0.34, yA - 0.045, 0);
  const sv = p2.clone().sub(p1), strut = at(mesh(new THREE.BoxGeometry(sv.length() + 0.02, BR.strut, BR.strut), blue, 'vnBracket'), ...p1.clone().add(p2).multiplyScalar(0.5).toArray());
  strut.rotation.z = Math.atan2(sv.y, sv.x); br.add(strut);                        // batang miring (kotak 35 mm)
  boltZ(br, p1.x, p1.y, P.w / 2);
  for (const s of [-1, 1]) box(br, 0.05, 0.045, 0.004, p2.x, yA - 0.0425, s * (BR.strut / 2 + 0.002));   // lidah di bawah lengan
  boltZ(br, p2.x, p2.y, BR.strut / 2 + 0.004);
  // Pipa dudukan sensor + lubang samping kabel
  br.add(at(mesh(pipeGeo(BR.holder.h, BR.holder.R, BR.holder.wall), blue, 'vnBracket'), xC, yH0, 0));
  const stub = at(mesh(pipeGeo(BR.stub.L, BR.stub.R, 0.003).rotateZ(Math.PI / 2), blue, 'vnBracket'), xC - BR.holder.R + 0.004, yA + 0.042, 0);
  br.add(stub);                                                                   // mengarah ke dinding (−x)
  // Plat L penahan sensor: kaki tegak turun dari bawah lengan, kaki datar di bawah pipa dudukan dengan lubang sensor
  const Lp = BR.L, xV = xC - BR.holder.R - Lp.inset, xE = xC + BR.holder.R + 0.012, yAb = yA - BR.arm / 2;
  box(br, Lp.t, yAb - yLb, Lp.w, xV + Lp.t / 2, (yAb + yLb) / 2, 0);
  br.add(at(mesh(holedPlate(xE - xV, Lp.w, Lp.t, [[xC - (xV + xE) / 2, 0, SENSOR.R + 0.0008]]), blue, 'vnBracket'), (xV + xE) / 2, yLb + Lp.t / 2, 0));
  const lTag = tag('Plat L penahan sensor', 'vnBracket', { maxDist: 3 }); lTag.position.set(xE, yLb, Lp.w / 2); br.add(lTag);
  const brTag = tag('Bracket sensor (dibaut ke dinding kolam)', 'vnBracket', { maxDist: 8 }); brTag.position.set(xWeb + 0.05, yBot + 0.08, 0.03); br.add(brTag);

  // ---------- Tutup pipa dudukan (abu-abu) ----------
  const grey = new THREE.MeshStandardMaterial({ color: 0x9a9fa3, roughness: 0.55 });
  br.add(
    at(mesh(new THREE.CylinderGeometry(CAP.R, CAP.R, CAP.h, 40), grey, 'vnCap'), xC, yH1 + CAP.h / 2 - 0.02, 0),
    at(mesh(new THREE.CylinderGeometry(CAP.R - 0.004, CAP.R, 0.006, 40), grey.clone(), 'vnCap'), xC, yH1 + CAP.h - 0.017, 0),
    at(mesh(new THREE.CylinderGeometry(CAP.R + 0.0004, CAP.R + 0.0004, 0.028, 16, 1, true, -0.5, 1.0), MAT.whitePl(), 'vnCap'), xC, yH1 + CAP.h * 0.4, 0),   // label
  );

  // ---------- Sensor ultrasonik Ø40 bodi berulir: tegak menembus plat L, dijepit 2 mur, muka menghadap ke bawah ----------
  const sn = U.sensor = newG(), yTopS = yFace + SENSOR.len, steel = MAT.galv();
  sn.add(
    at(mesh(new THREE.CylinderGeometry(SENSOR.R, SENSOR.R, SENSOR.len - 0.014, 40), MAT.thread(SENSOR.len), 'vnSensor'), xC, yFace + 0.012 + (SENSOR.len - 0.014) / 2, 0),   // bodi berulir
    at(mesh(new THREE.CylinderGeometry(SENSOR.R - 0.0005, SENSOR.R - 0.0005, 0.012, 40), steel, 'vnSensor'), xC, yFace + 0.006, 0),   // leher polos di ujung muka
    at(mesh(new THREE.TorusGeometry(SENSOR.R - 0.003, 0.0022, 8, 40).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2cc3c3, roughness: 0.4 }), 'vnSensor'), xC, yFace + 0.001, 0),   // cincin muka
    at(mesh(new THREE.CylinderGeometry(SENSOR.R - 0.005, SENSOR.R - 0.005, 0.002, 40), MAT.whitePl(), 'vnSensor'), xC, yFace, 0),   // muka transduser
    at(mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.018, 20), MAT.plastic(), 'vnSensor'), xC, yTopS + 0.009, 0),                 // konektor
  );
  for (const y of [yLb + BR.L.t + 0.004, yLb - 0.004]) sn.add(at(mesh(hexGeo(0.05, 0.008), steel, 'vnSensor'), xC, y, 0));   // 2 mur penjepit
  const snTag = tag('Sensor ultrasonik Ø40 (bodi berulir)', 'vnSensor', { maxDist: 8 }); snTag.position.set(xC + SENSOR.R + 0.01, yFace + 0.02, 0); sn.add(snTag);
  sn.add(dimension([xC + 0.09, yFace, 0], [xC + 0.09, Y(VN.notch), 0], [0.02, 0, 0], `${toNotch().toFixed(2)} m ke dasar takik V`, 8));
  const wDim = dimension([xC, yFace, -0.1], [xC, Y(VN.water), -0.1], [0.02, 0, 0], '', 6);   // sensor → muka air kolam (env.js)
  sn.add(wDim); U.wDim = wDim; U.lastH = null;

  // ---------- Kabel sensor dalam conduit hitam → konektor SP21 kedua di box ----------
  // Mengikuti gravitasi (tidak ada bentang lurus di udara): turun menyusuri tiang di sela stiffener (35°), melengkung keluar
  // & rebah di atas base plate dan pondasi, jatuh dari tepi pondasi ke tanah, rebah di tanah sampai kaki dinding kolam,
  // tersampir naik menempel muka luar dinding, melewati puncak dinding, lalu turun ke punggung lengan & masuk lubang samping.
  const cable = U.cable = newG(), R = CONDUIT_R, PHI = 35;
  const pol = (deg, y) => [POLE_GAP * Math.cos(deg * Math.PI / 180), y, POLE_GAP * Math.sin(deg * Math.PI / 180)];
  const yP1 = d.yP1, yF = 0.2, fw2 = d.fw / 2000, xO = xW - VN.wall;               // muka atas base plate & pondasi, tepi pondasi, muka luar dinding
  const zc = pol(PHI, 0)[2], yG = R + 0.001, yRun = yA + BR.arm / 2 + R + 0.001, yS = yA + 0.042;
  sp21Cable(S, {
    slot: -1, wireToY: -0.1085, group: cable, phi: PHI, yH: d.encY - 0.45, part: 'vnCable',
    route: [pol(PHI, yP1 + 0.1)],
    tail: [
      pol(PHI, yP1 + 0.1), pol(PHI, yP1 + 0.045), [0.085, yP1 + R + 0.003, zc], [0.13, yP1 + R + 0.001, zc * 0.95],   // lengkung keluar, rebah di base plate
      [0.17, yF + R + 0.02, zc * 0.9], [0.22, yF + R + 0.001, zc * 0.85], [fw2 - 0.05, yF + R + 0.001, zc * 0.7],   // turun ke pondasi
      [fw2 + 0.03, yF - 0.02, zc * 0.6], [fw2 + 0.08, yG + 0.05, zc * 0.5], [fw2 + 0.16, yG, zc * 0.4],             // jatuh dari tepi pondasi
      [xO - 0.2, yG, zc * 0.15], [xO - 0.06, yG + 0.012, 0.004], [xO - R - 0.004, yG + 0.08, 0],                     // rebah di tanah → kaki dinding
      [xO - R - 0.004, yWT - 0.07, 0], [xO - 0.002, yWT + R * 0.7, 0], [xO + VN.wall / 2, yWT + R + 0.001, 0],        // naik di muka luar, lewat puncak
      [xW + 0.005, yWT + R, 0], [xW + 0.07, yA + 0.066, 0], [xW + 0.14, yRun, 0],                                     // turun ke punggung lengan
      [xC - 0.16, yRun, 0], [xC - 0.1, yS, 0], [xC - BR.holder.R - 0.02, yS, 0],
    ],
    endCable: [[xC - BR.holder.R - 0.021, yS, 0], [xC - 0.012, yS, 0], [xC, yA + 0.04, 0], [xC, yA + 0.028, 0]],   // ke konektor sensor
    tagText: 'Kabel sensor + conduit', tagAt: [(fw2 + xO) / 2, yG + 0.04, 0.02], plugTag: 'SP21 sensor',
  });

  // ---------- Label bangunan ukur (dunia, sawah.js) ----------
  const wG = newG();
  const pTag = tag('Kolam penenang', 'vnPool', { maxDist: 14 }); pTag.position.set(xC, Y(VN.water) + 0.02, -1.6); wG.add(pTag);
  const vTag = tag('Ambang V 90° (dinding beton)', 'vnWeir', { maxDist: 10 }); vTag.position.set(xC + 0.3, Y(VN.notch) + 0.15, VN.toPlate); wG.add(vTag);
  model.userData.vnotch = U;
}

const parts = {
  vnBracket: { name: 'Bracket Sensor Dinding', group: 'V-Notch', specs: () => [
    ['Bentuk', 'Tiang kanal-C + plat atas & bawah, lengan mendatar + batang miring, sambungan baut (sesuai foto)'],
    ['Material', 'Baja profil kotak 40 & 35 mm, cat biru (ukuran perkiraan)'],
    ['Pasang', 'Muka dalam dinding kolam penenang, 4 baut angkur'],
    ['Lengan', `± ${Math.round((xC - xW) * 1000)} mm dari dinding ke sumbu sensor (perkiraan)`],
    ['Ujung', 'Pipa dudukan tegak + lubang samping kabel; plat L di bawah lengan (kaki datar berlubang) menahan sensor'],
  ]},
  vnSensor: { name: 'Sensor Ultrasonik Level Air', group: 'V-Notch', specs: () => [
    ['Jenis', 'Ultrasonik, silinder Ø40 mm, bodi berulir penuh (dari user)'],
    ['Panjang', `± ${SENSOR.len * 1000} mm (perkiraan)`],
    ['Pasang', 'Tegak menembus lubang plat L, dijepit 2 mur; ujung atas masuk pipa dudukan'],
    ['Muka', 'Menghadap ke bawah, segaris dasar takik'],
    ['Posisi', `${VN.toPlate * 1000} mm di hulu dinding takik V (perkiraan dari foto)`],
    ['Tinggi ke dasar takik', `${toNotch().toFixed(2)} m`],
    ['Kabel', 'Conduit hitam → konektor SP21 di box'],
  ]},
  vnCap: { name: 'Tutup Pipa Dudukan', group: 'V-Notch', specs: () => [
    ['Bentuk', 'Tutup silinder abu-abu di atas pipa dudukan (sesuai foto)'],
    ['Fungsi', 'Menutup pipa dudukan & sambungan kabel ke sensor'],
  ]},
  vnCable: { name: 'Kabel Sensor + Conduit', group: 'V-Notch', specs: () => [
    ['Jalur', 'SP21 box → turun di sisi tiang → rebah di pondasi & tanah → naik di muka luar dinding kolam → punggung lengan → lubang samping dudukan'],
    ['Conduit', 'Fleksibel hitam (komponen sama dengan AWLR), Ø16 mm perkiraan'],
  ]},
  vnPool: { name: 'Kolam Penenang', group: 'V-Notch', specs: () => [
    ['Ukuran', `Lebar dalam ${VN.half * 2000} mm × ± 3000 mm (perkiraan diorama)`],
    ['Fungsi', 'Menenangkan aliran limpasan sebelum melimpas di takik V'],
  ]},
  vnWeir: { name: 'Ambang V 90°', group: 'V-Notch', specs: () => [
    ['Bentuk', 'Dinding beton bertakik V 90° di ujung hilir kolam, air jatuh bebas di hilir (sesuai foto, ukuran perkiraan)'],
    ['Debit', 'Q ≈ 1,38 · H^2,5 (m³/s, H = tinggi air di atas dasar takik, m)'],
  ]},
};

// ---------- Simulasi debit (env.js): H = tinggi air di atas dasar takik, Q = 1,38 · H^2,5 ----------
// Air kolam datang dari saluran sawah (pintu pengambilan di sungai → sungai surut = V-Notch surut) + limpasan hujan dari petak.
const flooded = () => ENV.dh > BANK && riverAt(SITES.vnotch.x) + ENV.dh > VN.top;   // genangan banjir di atas dinding kolam
let ui = null;
function update(now, { model }) {
  const U = model.userData.vnotch;
  if (!U) return false;
  if (U.lastH === null || Math.abs(ENV.H - U.lastH) > 0.001) {
    U.lastH = ENV.H;
    const [line, lbl] = U.wDim.children, p = line.geometry.attributes.position, yW = Y(VN.notch) + ENV.H, T = 0.02;
    [[xC, yFace], [xC, yW], [xC - T, yFace], [xC + T, yFace], [xC - T, yW], [xC + T, yW]].forEach(([x, y], i) => p.setXYZ(i, x, y, -0.1));
    p.needsUpdate = true; line.geometry.computeBoundingSphere();
    lbl.position.set(xC, (yFace + yW) / 2, -0.1); lbl.element.textContent = `${(yFace - yW).toFixed(3)} m ke muka air`;
  }
  if (ui && now - ui.t > 200) { ui.t = now; ui.sync(); }
  return false;
}
function panel(el, { flyTo }) {
  const td = 'style="text-align:right;font-weight:600"';
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:8px"><span>Aliran di takik V</span><output id="vnSt" style="font-weight:700"></output></div>
    <table style="width:100%;border-collapse:collapse;font-size:12.5px;font-variant-numeric:tabular-nums;margin-bottom:10px">
      <tr><td>Tinggi air di atas takik (H)</td><td id="vnH" ${td}></td></tr>
      <tr><td>Debit Q = 1,38 · H<sup>2,5</sup></td><td id="vnQ" ${td}></td></tr>
      <tr><td>Jarak sensor → muka air</td><td id="vnD" ${td}></td></tr>
      <tr><td>Dari saluran sawah</td><td id="vnQc" ${td}></td></tr>
      <tr><td>Dari limpasan hujan</td><td id="vnQr" ${td}></td></tr>
      <tr><td>Pintu pengambilan sungai</td><td id="vnIn" ${td}></td></tr>
    </table>
    <div class="btn-row"><button type="button" id="vnLook">Lihat takik</button><button type="button" id="vnIso">Iso</button></div>`;
  const $ = s => el.querySelector(s);
  const o = Object.fromEntries(['vnSt', 'vnH', 'vnQ', 'vnD', 'vnQc', 'vnQr', 'vnIn'].map(k => [k, $('#' + k)]));
  $('#vnLook').addEventListener('click', () => flyTo([xC + 1.25, Y(VN.notch) + 0.95, VN.toPlate + 2.1], [xC, Y(VN.notch) - 0.05, VN.toPlate + 0.1], 1100));   // dari hilir, pancaran lewat takik
  $('#vnIso').addEventListener('click', () => flyTo(...vnotch.views.iso, 1100));
  function sync() {
    if (!o.vnSt.isConnected) return;                                          // panel sudah diganti seri lain
    const H = ENV.H, Q = ENV.Q, fl = flooded(), gap = yFace - Y(VN.notch) - H;
    const [txt, c] = fl ? ['Terendam banjir', '#ff7a6b'] : H < 0.003 ? ['Tidak ada aliran', '#93c5fd'] : gap < 0.1 ? ['Air dekat muka sensor', '#ff7a6b']
      : H > 0.18 ? ['Tinggi', '#f4cf6a'] : H < 0.07 ? ['Rendah', '#93c5fd'] : ['Normal', '#46d78f'];
    o.vnSt.textContent = txt; o.vnSt.style.color = c;
    o.vnH.textContent = `${(H * 100).toFixed(1)} cm`;
    o.vnQ.textContent = `${(Q * 1000).toFixed(1)} L/dtk`;
    o.vnD.textContent = `${(yFace - Y(VN.notch) - H).toFixed(3)} m`;
    o.vnQc.textContent = `${(ENV.Qc * 1000).toFixed(1)} L/dtk`;
    o.vnQr.textContent = `${(ENV.Qr * 1000).toFixed(1)} L/dtk`;
    o.vnIn.textContent = ENV.qIn < 0.02 ? 'kering (sungai di bawah ambang)' : `${Math.round(ENV.qLag * 100)} % dari normal`;
  }
  ui = { sync, t: 0 };
  sync();
}

export const vnotch = {
  extend, parts, update, panel,
  mapStatus: () => (flooded() ? 'crit' : ENV.H < 0.003 ? 'low' : ENV.H > 0.18 ? 'warn' : 'good'),
  views: { iso: [[2.3, 1.55, 2.9], [1.35, 0.4, 0.05]] },                 // dari hilir menghadap takik, bracket di samping (seperti foto)
};
