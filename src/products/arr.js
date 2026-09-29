import * as THREE from 'three';
import { WALL, derive } from '../config.js';
import { MAT } from '../materials.js';
import { mesh, rodBetween } from '../geometry.js';
import { tag } from '../labels.js';
import { sp21Cable } from '../model/sp21.js';
import { ENV, rainClass, rainSum } from '../env.js';
import { BRACKET, alarmEncYMax, armY, pol } from './ewsAlarm.js';

// ARR — Automatic Rainfall Recorder (satuan m). Stasiun monopole dasar + sensor curah hujan tipping bucket.
// Sensor dari gambar & foto user: badan silinder HITAM sedikit mengecil ke atas, corong penampung Ø200 mm, tinggi badan
// 271 mm, flens bawah Ø246 mm, stiker label di sisi badan. Atas: corong kerucut ke dalam menampung hujan, lubang di tengah;
// bawah: lubang buang air. Kaki bawaan sensor TIDAK dipakai (permintaan user): sensor langsung dibaut ke bracket.
// Dudukan sensor dari foto user: rangka segitiga plat strip cat biru dengan 3 dudukan tegak berbibir di tiap sudut, dibuat pas
// dengan flens dasar sensor (bibir menopang flens & dibaut ke flens) menggantikan kaki; tengah rangka terbuka (air buangan
// jatuh bebas). Ukuran plat strip & tinggi dudukan = perkiraan dari foto.
// Lengan ke tiang: pipa bulat 2" (user) dilas ke plat + 2 U-bolt, ke kanan setinggi bracket EWS, sensor jauh dari bayangan panel.
// Ujung pipa dibelah mendatar: plat lidah rangka sensor diselipkan ke tengah pipa (sebidang sumbu pipa) lalu celah setengah
// lingkaran di atas & bawah plat ditutup (user). Panjang, plat & letak lengan
// surya; panjang, plat & letak tidak
// terlihat di foto → PERKIRAAN.
// Kabel sensor → konektor SP21 (slot ke-2 dari kanan) lewat conduit di sisi depan-kanan tiang (di belakang krangkeng).
// mountDeg = arah 3 dudukan bracket di keliling flens: satu menjauhi tiang (+x), dua di sisi tiang
export const GAUGE = { open: 0.1, rimR: 0.105, botR: 0.118, flangeR: 0.123, flangeT: 0.008, H: 0.271, mountDeg: [0, 120, 240] };
// gx = sumbu sensor dari sumbu tiang (± 0,38 m di luar tepi panel surya); rangka segitiga plat strip bar × t, sudutnya tepat di
// tepi flens (vR); dudukan tegak setinggi upH, bibir sepanjang lip ke dalam di bawah flens
// Lengan berakhir di bawah sisi segitiga yang menghadap tiang → tengah rangka (bawah lubang buang) bebas
export const MOUNT = { gx: 1.0, vR: 0.1255, bar: 0.04, t: 0.005, upH: 0.075, lip: 0.035 };
export const ARM_PIPE = { od: 60.3, wall: WALL[60.3] };                                  // pipa 2" SCH40 (mm)
const mm = v => Math.round(v * 1000);

// Tekstur stiker label (putih, garis merah + baris teks abu-abu seperti di foto; tanpa tulisan)
function labelTex() {
  const cv = Object.assign(document.createElement('canvas'), { width: 128, height: 96 }), g = cv.getContext('2d');
  g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, 128, 96);
  g.fillStyle = '#d23a2e'; g.fillRect(8, 10, 14, 12); g.fillRect(28, 13, 80, 6);
  g.fillStyle = '#9a9c9e'; for (let i = 0; i < 6; i++) g.fillRect(8, 32 + i * 9, 96 - (i % 3) * 18, 3);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// Sensor tipping bucket (tanpa kaki), titik asal = muka bawah flens dasar, sumbu tegak = +Y
function buildGauge() {
  const G = GAUGE, g = new THREE.Group(), at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
  const black = new THREE.MeshStandardMaterial({ color: 0x141619, roughness: 0.32, metalness: 0.05 });
  const yB = G.flangeT, yT = G.H;
  g.add(at(mesh(new THREE.CylinderGeometry(G.flangeR, G.flangeR, G.flangeT, 48), black, 'arrGauge'), 0, G.flangeT / 2, 0));        // flens bawah Ø246
  g.add(at(mesh(new THREE.CylinderGeometry(G.rimR, G.botR, yT - 0.004 - yB, 48, 1, true), black, 'arrGauge'), 0, (yB + yT - 0.004) / 2, 0));   // badan (terbuka di atas: corong terlihat), mengecil ke atas
  g.add(at(mesh(new THREE.TorusGeometry(G.rimR - 0.004, 0.005, 10, 48).rotateX(Math.PI / 2), black, 'arrGauge'), 0, yT - 0.005, 0));         // bibir corong
  // Corong penampung Ø200: dinding tegak pendek di bawah bibir, lalu kerucut ke dalam (sedikit cekung) ke lubang tengah
  const fp = [[G.open, 0.002], [G.open, -0.012], [0.07, -0.04], [0.035, -0.068], [0.011, -0.086], [0.009, -0.09]].map(([r, y]) => new THREE.Vector2(r, y));
  const holeMat = new THREE.MeshStandardMaterial({ color: 0x020203, roughness: 1, envMapIntensity: 0 });   // lubang (gelap)
  const funnelMat = new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.7, metalness: 0, envMapIntensity: 0.35, side: THREE.DoubleSide });
  g.add(at(mesh(new THREE.LatheGeometry(fp, 48), funnelMat, 'arrGauge'), 0, yT - 0.002, 0));
  g.add(at(mesh(new THREE.TorusGeometry(0.0105, 0.0022, 8, 24).rotateX(Math.PI / 2), MAT.galv(), 'arrGauge'), 0, yT - 0.09, 0));      // cincin saringan
  g.add(at(mesh(new THREE.CircleGeometry(0.009, 20).rotateX(-Math.PI / 2), holeMat, 'arrGauge'), 0, yT - 0.0915, 0));   // lubang tengah
  // Lubang buang air di dasar: pipa pendek menonjol ke bawah di tengah dasar badan
  g.add(at(mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.028, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x141619, roughness: 0.5, side: THREE.DoubleSide }), 'arrGauge'), 0, -0.014, 0));
  g.add(at(mesh(new THREE.CircleGeometry(0.0095, 20).rotateX(Math.PI / 2), holeMat, 'arrGauge'), 0, -0.02, 0));
  g.add(at(mesh(new THREE.CircleGeometry(G.flangeR, 48).rotateX(Math.PI / 2), black, 'arrGauge'), 0, -0.0002, 0));   // dasar
  const rMid = (G.rimR + G.botR) / 2 + 0.0008;                                                                                                   // stiker label di sisi depan
  const lab = mesh(new THREE.CylinderGeometry(rMid, rMid, 0.06, 16, 1, true, -0.34, 0.68), new THREE.MeshStandardMaterial({ map: labelTex(), roughness: 0.5 }), 'arrGauge');
  g.add(at(lab, 0, yB + 0.12, 0));
  const gland = mesh(new THREE.CylinderGeometry(0.0065, 0.0075, 0.014, 16).rotateZ(Math.PI / 2), MAT.plastic(), 'arrGauge');                 // cable gland (arah tiang)
  g.add(at(gland, -(G.botR - 0.002) - 0.006, yB + 0.022, 0));
  return { g, height: yT, glandY: yB + 0.022, glandX: -(G.botR - 0.002) - 0.013 };
}

function extend(model) {
  const d = model.userData.d, S = model.userData.station, ro = S.ro, B = BRACKET, M = MOUNT;
  const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
  const pR = ARM_PIPE.od / 2000, pW = ARM_PIPE.wall / 1000;                                                          // pipa lengan 2"
  const yA = armY(d), zP = ro + B.plateT, zA = zP + pR, yF = yA - M.t / 2, yPl = yF + M.t + M.upH + M.t;   // rangka sebidang sumbu pipa; bibir = dasar sensor
  const root = new THREE.Group(); root.name = 'arr'; model.add(root);
  const U = { asm: new THREE.Group(), ubolt: new THREE.Group(), nuts: new THREE.Group(), cable: new THREE.Group() };
  root.add(U.asm, U.ubolt, U.nuts, U.cable);
  const blue = MAT.paint();

  // ---------- Lengan: plat di muka depan tiang + 2 U-bolt + pipa bulat 2" ke kanan (dilas ke plat) ----------
  const plate = new THREE.Shape(), uR = ro + B.ubR;
  plate.moveTo(-B.plateW / 2, -B.plateH / 2); plate.lineTo(B.plateW / 2, -B.plateH / 2); plate.lineTo(B.plateW / 2, B.plateH / 2); plate.lineTo(-B.plateW / 2, B.plateH / 2); plate.closePath();
  for (const dy of [-B.ubDY, B.ubDY]) for (const sx of [-1, 1]) { const h = new THREE.Path(); h.absarc(sx * uR, dy, 0.0055, 0, Math.PI * 2, true); plate.holes.push(h); }
  U.asm.add(at(mesh(new THREE.ExtrudeGeometry(plate, { depth: B.plateT, bevelEnabled: false, curveSegments: 16 }), blue, 'arrBracket'), 0, yA, ro));
  // Pipa berakhir tepat di sisi rangka yang menghadap tiang; plat lidah rangka masuk ke belahan ujung pipa
  const x0 = -B.plateW / 2, xArm = M.gx - M.vR / 2 - M.bar / 2, L = xArm - x0, V2 = THREE.Vector2, TONGUE = 0.1;
  const pipeGeo = new THREE.LatheGeometry([new V2(pR - pW, 0), new V2(pR, 0), new V2(pR, L), new V2(pR - pW, L), new V2(pR - pW, 0)], 40).rotateZ(-Math.PI / 2);   // sepanjang +x
  U.asm.add(at(mesh(pipeGeo, blue, 'arrBracket'), x0, yA, zA));
  const endCap = mesh(new THREE.CylinderGeometry(pR, pR, 0.004, 40).rotateZ(Math.PI / 2), blue, 'arrBracket');                  // tutup ujung pipa sisi tiang
  U.asm.add(at(endCap, x0 + 0.002, yA, zA));
  const tongue = mesh(new THREE.BoxGeometry(TONGUE + M.bar / 2, M.t, 2 * pR + 0.01), blue, 'arrBracket');                 // lidah (menembus belahan pipa)
  U.asm.add(at(tongue, xArm - TONGUE / 2 + M.bar / 4, yA, zA));
  for (const sy of [1, -1]) {                                                                                                     // tutup celah atas & bawah
    const cap = new THREE.Shape(); cap.moveTo(pR, 0); cap.absarc(0, 0, pR, 0, Math.PI, false); cap.closePath();
    const g = new THREE.ExtrudeGeometry(cap, { depth: 0.004, bevelEnabled: false, curveSegments: 24 }).rotateY(-Math.PI / 2).translate(0.002, 0, 0);
    if (sy < 0) g.rotateX(Math.PI);                                                                                            // setengah lingkaran bawah
    U.asm.add(at(mesh(g, blue, 'arrBracket'), xArm, yA, zA));                                                    // pusat = sumbu pipa (bagian dalam tertutup lidah)
  }
  // Dudukan sensor (foto): rangka segitiga plat strip (sebidang sumbu pipa) + 3 dudukan tegak berbibir di sudut, pas di tepi flens
  const V = GAUGE.mountDeg.map(dg => { const a = THREE.MathUtils.degToRad(dg); return [Math.cos(a), Math.sin(a), a]; });
  for (let i = 0; i < 3; i++) {
    const [ax, az] = V[i], [bx, bz] = V[(i + 1) % 3], len = Math.hypot(bx - ax, bz - az) * M.vR + M.bar;
    const bar = mesh(new THREE.BoxGeometry(len, M.t, M.bar).rotateY(-Math.atan2(bz - az, bx - ax)), blue, 'arrBracket');
    U.asm.add(at(bar, M.gx + (ax + bx) / 2 * M.vR, yF + M.t / 2, zA + (az + bz) / 2 * M.vR));
  }
  for (const [ux, uz, a] of V) {
    const up = mesh(new THREE.BoxGeometry(M.t, M.upH, M.bar).rotateY(-a), blue, 'arrBracket');                                   // tegak
    U.asm.add(at(up, M.gx + ux * (M.vR - M.t / 2), yF + M.t + M.upH / 2, zA + uz * (M.vR - M.t / 2)));
    const lip = mesh(new THREE.BoxGeometry(M.lip, M.t, M.bar).rotateY(-a), blue, 'arrBracket');                                   // bibir ke dalam
    U.asm.add(at(lip, M.gx + ux * (M.vR - M.lip / 2), yF + M.t + M.upH + M.t / 2, zA + uz * (M.vR - M.lip / 2)));
    const rb = GAUGE.flangeR - 0.012, bx = M.gx + ux * rb, bz = zA + uz * rb;                                                   // baut bibir → flens sensor
    U.asm.add(rodBetween([bx, yPl - M.t - 0.008, bz], [bx, yPl + 0.004, bz], 0.004, MAT.bolt(), 'arrBracket'),
      at(mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.005, 6), MAT.nut(), 'arrBracket'), bx, yPl - M.t - 0.0025, bz));
  }
  const uNut = new THREE.CylinderGeometry(0.0098, 0.0098, 0.008, 6).rotateX(Math.PI / 2);
  for (const dy of [-B.ubDY, B.ubDY]) {
    const y = yA + dy, arc = mesh(new THREE.TorusGeometry(uR, B.ubR, 8, 40, Math.PI), MAT.bolt(), 'arrBracket');
    arc.rotation.x = Math.PI / 2; arc.rotation.z = Math.PI; arc.position.y = y; U.ubolt.add(arc);   // busur di belakang tiang
    for (const sx of [-1, 1]) {
      U.ubolt.add(rodBetween([sx * uR, y, 0], [sx * uR, y, zP + 0.016], B.ubR, MAT.bolt(), 'arrBracket'));
      U.nuts.add(at(mesh(uNut, MAT.nut(), 'arrBracket'), sx * uR, y, zP + 0.004));
    }
  }
  const brTag = tag('Bracket sensor hujan', 'arrBracket', { maxDist: 5 }); brTag.position.set(0.45, yA - 0.03, zA + 0.03); U.asm.add(brTag);

  // ---------- Sensor tipping bucket langsung di atas bibir dudukan (tanpa kaki) ----------
  const Gz = buildGauge(); Gz.g.position.set(M.gx, yPl, zA); U.asm.add(Gz.g);
  const gTag = tag('Sensor curah hujan (tipping bucket)', 'arrGauge'); gTag.position.set(M.gx + GAUGE.rimR + 0.01, yPl + 0.2, zA); U.asm.add(gTag);
  U.orificeY = yPl + Gz.height;

  // ---------- Kabel sensor: SP21 di box → conduit naik di sisi depan-kanan tiang → bawah lengan → gland sensor ----------
  const yU = yA - pR - 0.009, yG = yPl + Gz.glandY, xG = M.gx + Gz.glandX, xE = M.gx - M.vR - 0.05;
  sp21Cable(S, { slot: -1, wireToY: -0.1085, group: U.cable, phi: 40, yH: S.cy - 0.45, part: 'arrCable',
    route: [pol(40, yA - 0.13)],
    tail: [pol(40, yA - 0.13), [0.085, yA - 0.11, 0.045], [0.1, yA - 0.06, zA - 0.005], [0.125, yU, zA], [0.4, yU, zA], [xE - 0.01, yU, zA]],
    endCable: [[xE - 0.005, yU, zA], [xE + 0.012, yU + 0.02, zA + 0.04], [xE + 0.016, yG - 0.04, zA + 0.04], [xG - 0.02, yG, zA + 0.012], [xG, yG, zA]],
    tagText: 'Kabel sensor hujan + conduit', tagAt: pol(40, d.acY + 0.14, 0.075), plugTag: 'SP21 sensor hujan' });
  U.cable.traverse(o => { if (o.userData.isTag) o.userData.when = () => !(U.cableFade > 0.5); });
  model.userData.arr = U;
}

// ---------- Simulasi: bacaan penakar hujan dari env.js ----------
let ui = null;
function update(now) {
  if (ui && now - ui.t > 250) { ui.t = now; ui.sync(); }
  return false;
}
const CLS_COLOR = mmh => (mmh >= 20 ? '#ff7a6b' : mmh >= 10 ? '#f7a766' : mmh >= 5 ? '#f4cf6a' : mmh > 0.2 ? '#93c5fd' : '#46d78f');
function panel(el, { params, flyTo }) {
  const td = 'style="text-align:right;font-weight:600"';
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span>Hujan</span><output id="arSt" style="font-weight:700"></output></div>
    <table id="arTab" style="width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;margin-bottom:12px">
      <tr><td>Intensitas hujan</td><td data-k="i" ${td}></td></tr>
      <tr><td>Curah hujan 1 jam</td><td data-k="h" ${td}></td></tr>
      <tr><td>Curah hujan hari ini</td><td data-k="d" ${td}></td></tr>
    </table>
    <div class="btn-row"><button type="button" id="arLook">Lihat sensor</button><button type="button" id="arIso">Iso</button></div>`;
  const $ = s => el.querySelector(s), st = $('#arSt'), tb = $('#arTab');
  $('#arLook').addEventListener('click', () => { const y = armY(derive(params)); flyTo([MOUNT.gx + 1.05, y + 0.42, 1.55], [MOUNT.gx, y + 0.19, 0.08], 1100); });
  $('#arIso').addEventListener('click', () => flyTo(...arr.views.iso, 1100));
  function sync() {
    if (!st.isConnected) return;                                              // panel sudah diganti seri lain
    const R = ENV.rain;
    st.textContent = rainClass(R); st.style.color = CLS_COLOR(R);
    tb.querySelector('[data-k="i"]').textContent = `${R.toFixed(1)} mm/jam`;
    tb.querySelector('[data-k="h"]').textContent = `${rainSum(1).toFixed(1)} mm`;
    tb.querySelector('[data-k="d"]').textContent = `${ENV.rainDay.toFixed(1)} mm`;
  }
  ui = { sync, t: 0 };
  sync();
}

// Explode: setelah panel surya — mur U-bolt dilepas, U-bolt ditarik, bracket + sensor dijauhkan; kabel sensor dilepas (memudar)
const explode = {
  steps: [{ key: 'arr', before: 'ac', w: 12, label: 'lepas U-bolt, bracket + sensor hujan dijauhkan' }],
  apply(model, seg) {
    const U = model.userData.arr, eN = seg('arr', 0, 0.33), eU = seg('arr', 0.2, 0.6), eA = seg('arr', 0.47, 1);
    U.nuts.position.z = 0.1 * eN + 0.6 * eA; U.ubolt.position.z = -0.3 * eU; U.asm.position.z = 0.6 * eA;
    const eDn = seg('cable', 0, 0.44), eOff = seg('cable', 0.44, 1);
    U.cableFade = eOff; U.cable.position.y = -0.06 * eDn; U.cable.visible = eOff < 0.999;
    U.cable.traverse(o => {
      if (!o.isMesh) return;
      const m = o.material, tr = eOff > 0;
      if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }
      m.opacity = 1 - eOff; m.depthWrite = !tr;
    });
  },
};

const G = GAUGE;
const parts = {
  arrGauge: { name: 'Sensor Curah Hujan (Tipping Bucket)', group: 'ARR', specs: () => [
    ['Bentuk', 'Silinder hitam, sedikit mengecil ke atas (sesuai gambar & foto)'],
    ['Corong penampung', `Ø${mm(2 * G.open)} mm, kerucut ke dalam ke lubang tengah`],
    ['Buangan', 'Lubang buang air di dasar badan'],
    ['Tinggi', `Badan ${mm(G.H)} mm`],
    ['Dasar', `Flens Ø${mm(2 * G.flangeR)} mm, dibaut langsung ke 3 dudukan bracket (kaki bawaan tidak dipakai)`],
    ['Kabel', 'Cable gland di sisi badan → conduit → SP21 di box (letak gland perkiraan)'],
  ]},
  arrBracket: { name: 'Bracket Sensor Hujan', group: 'ARR', specs: d => [
    ['Dudukan (foto)', `Rangka segitiga plat strip ${mm(MOUNT.bar)} × ${mm(MOUNT.t)} mm + 3 dudukan tegak ${mm(MOUNT.upH)} mm berbibir, cat biru (ukuran perkiraan)`],
    ['Kaki sensor', 'Dibaut di bibir dudukan; tengah rangka terbuka untuk air buangan'],
    ['Lengan ke tiang', `Pipa bulat 2" (Ø${ARM_PIPE.od} mm) dilas ke plat + 2 U-bolt M10; panjang & plat perkiraan`],
    ['Sambungan', 'Ujung pipa dibelah, plat lidah rangka sensor diselipkan ke tengah pipa & dilas; celah atas & bawah ditutup'],
    ['Posisi', `${mm(BRACKET.drop)} mm di bawah ujung tiang (${armY(d).toFixed(2)} m), sensor ${mm(MOUNT.gx)} mm dari sumbu tiang`],
    ['Mulut corong', `± ${(armY(d) + 1.5 * MOUNT.t + MOUNT.upH + G.H).toFixed(2)} m dari tanah, di luar bayangan panel surya`],
  ]},
  arrCable: { name: 'Kabel Sensor Hujan', group: 'ARR', specs: () => [
    ['Dari', 'Konektor SP21 di box (slot ke-2 dari kanan)'],
    ['Jalur', 'Conduit naik di sisi depan-kanan tiang (di belakang krangkeng, celah jari antipanjat), menyusuri bawah lengan'],
    ['Ke', 'Cable gland sensor'],
  ]},
};

export const arr = {
  encYMax: alarmEncYMax,                                   // bracket setinggi bracket EWS: antipanjat harus di bawahnya
  extend, update, panel, explode, parts,
  mapStatus: () => (ENV.rain >= 20 ? 'crit' : ENV.rain >= 10 ? 'warn' : 'good'),
  views: { iso: [[-2.3, 3.1, 5.4], [0.45, 2.0, 0.1]] },    // dari kiri-depan: krangkeng, lengan & sensor di kanan
};
