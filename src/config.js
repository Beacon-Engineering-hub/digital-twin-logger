// ---------- Data teknis (mm) ----------
export const WALL = { 60.3: 3.91, 88.9: 5.49, 114.3: 6.02, 141.3: 6.55, 168.3: 7.11 }; // SCH40
export const INCH = { 60.3: '2"', 88.9: '3"', 114.3: '4"', 141.3: '5"', 168.3: '6"' };
export const NUT = {
  16: { af: 24, h: 13, wd: 30, wt: 3, emb: 500 },
  20: { af: 30, h: 16, wd: 37, wt: 3, emb: 600 },
  24: { af: 36, h: 19, wd: 44, wt: 4, emb: 720 },
};
export const GROUT_T = 30, GUSSET_T = 8, F_ABOVE = 200, F_BELOW = 800;

// Ukuran tetap tiang di lapangan. Tiang, tinggi & base plate dari user; baut angkur, pola lubang & panel surya
// belum diukur → perkiraan. Panel surya menghadap searah krangkeng (pvAz 0 = depan).
export const STATION = {
  height: 3, od: 88.9,                  // m, mm — pipa 3"
  plate: 250, plateT: 10,               // base plate 250 × 250 × 10 mm
  bolt: 20, spacing: 150,               // perkiraan: M20, pola lubang 150 × 150 mm (50 mm dari tepi plat)
  pvW: 1000, pvD: 670, pvTilt: 15,      // perkiraan: panel 1000 × 670 mm, miring 15°
  pvAz: 0,
};

// Enclosure B&J 504020 (dari 504020.dwg: 510 × 410 × 200 mm), dipasang portrait:
// gambar diputar 90° sehingga engsel (atas di gambar) berada di sisi kanan. Satuan mm.
export const ENC = {
  model: 'B&J 504020', W: 410, H: 510, D: 200,
  t: 4, r: 14, joint: 133, flange: 5,           // tebal dinding, radius sudut, sambungan base–tutup dari belakang, bibir flange
  hingeY: [185, 0, -185], latchY: [185, 0, -185], openTabY: 75,
  mp: { w: 372, h: 471, t: 4, slotX: 325, slotY: 424 },   // mounting plate berlubang
  ribV: 460, ribH: 361,                          // rusuk silang di punggung (jarak lubang)
};

// Krangkeng pelindung enclosure, ukuran standar (mm): rangka hollow + wiremesh, cat biru.
// Dibagi dua pada kedalaman `split`: badan belakang (menempel ke tiang) + pintu depan berbentuk baki.
// Engsel (kanan) dan gembok (kiri) berada di garis bagi tersebut. offsetX = geser pusat krangkeng terhadap box.
export const CAGE = { W: 570, H: 720, D: 320, split: 160, tube: 25, doorTube: 20, mesh: 50, wire: 4, offsetX: 0 };
// Bracket panel surya: plat aluminium ditekuk jadi kanal U (mm). Sayap sepanjang kedalaman panel, ujungnya lancip;
// tinggi plat belakang dihitung dari kemiringan & kedalaman panel (lihat pvBracketH). lip & t belum diukur → perkiraan.
export const PV_BRACKET = { W: 200, t: 3, lip: 30, holeD: 12, cut: 30, tip: 10, minH: 120 };
// Dudukan enclosure di krangkeng: 2 besi strip melintang di rangka belakang + 4 baut di sudut box (mm)
export const ENC_MOUNT = { stripW: 40, stripT: 5, boltX: 20, boltY: 30, bolt: 8 };   // boltX/Y = jarak baut dari tepi box
export const PANEL_FRAME = 20;                     // lebar profil rangka panel surya (mm), tempat baut bracket
export const pvBracketH = (pvD, tiltDeg) =>        // tinggi plat belakang (mm)
  Math.max(PV_BRACKET.minH, Math.round(pvD * Math.sin(tiltDeg * Math.PI / 180) + PV_BRACKET.cut + PV_BRACKET.tip));

export function derive(p) {
  const od = +p.od, wall = WALL[od], nut = NUT[p.bolt];
  const s = p.spacing, plate = p.plate;
  const fw = Math.max(800, Math.ceil((plate + 400) / 50) * 50);
  const gh = Math.max(100, Math.round(od * 1.3 / 10) * 10);
  const gw = plate / 2 - od / 2 - 15;
  const proj = GROUT_T + p.plateT + nut.wt + 2 * nut.h + 12;   // tonjolan baut di atas beton
  const hookR = p.bolt * 2, leg = p.bolt * 5;
  const boltLen = Math.round(nut.emb + proj + leg + hookR * 0.6);
  const ri = od / 2 - wall;
  const kg = Math.PI * ((od / 2) ** 2 - ri ** 2) / 1e6 * p.height * 7850;
  const conduitR = Math.min(30, ri - 6);
  const cableHole = Math.round((conduitR + 5) * 2);
  const mpH = CAGE.H;                             // tinggi rangka yang dijepit klem ke tiang
  // Antipanjat: di bawah bracket panel surya, tetap di atas krangkeng
  const yP1 = (F_ABOVE + GROUT_T + p.plateT) / 1000, yTop = yP1 + p.height;   // m: muka atas base plate, ujung tiang
  const acY = Math.min(yTop - 0.7, Math.max(yTop - 0.9, p.encY + mpH / 2000 + 0.55));
  const pvBrH = pvBracketH(p.pvD, p.pvTilt);
  return { ...p, od, wall, nut, s, plate, fw, gh, gw, proj, hookR, leg, boltLen, ri, kg, conduitR, cableHole, mpH, acY, pvBrH, yP1, yTop };
}
