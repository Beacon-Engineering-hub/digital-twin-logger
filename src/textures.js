import * as THREE from 'three';

// ---------- Tekstur prosedural ----------
export function noiseTexture(base, spread, size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const n = base + (Math.random() - 0.5) * spread + (Math.random() < 0.015 ? -40 : 0);
    img.data[i * 4] = n; img.data[i * 4 + 1] = n * 0.98; img.data[i * 4 + 2] = n * 0.93; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export const concreteTex = noiseTexture(178, 34);
concreteTex.repeat.set(2, 2);
export const threadTex = (() => {
  const c = document.createElement('canvas'); c.width = 4; c.height = 32;
  const g = c.getContext('2d'); const grd = g.createLinearGradient(0, 0, 0, 32);
  grd.addColorStop(0, '#000'); grd.addColorStop(0.5, '#fff'); grd.addColorStop(1, '#000');
  g.fillStyle = grd; g.fillRect(0, 0, 4, 32);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
})();

// Alur conduit bergelombang (bumpMap; arah u = sepanjang tabung)
export const corrugTex = (() => {
  const c = document.createElement('canvas'); c.width = 32; c.height = 4;
  const g = c.getContext('2d'); const grd = g.createLinearGradient(0, 0, 32, 0);
  grd.addColorStop(0, '#000'); grd.addColorStop(0.5, '#fff'); grd.addColorStop(1, '#000');
  g.fillStyle = grd; g.fillRect(0, 0, 32, 4);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
})();

// Pola lubang kotak mounting plate (alphaMap; UV = koordinat shape dalam meter)
export function perforationTex(wmm, hmm, pitch = 10, hole = 6, margin = 30) {
  const k = 3, c = document.createElement('canvas');
  c.width = Math.round(wmm * k); c.height = Math.round(hmm * k);
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#000';
  const nx = Math.floor((wmm - 2 * margin - hole) / pitch) + 1, ny = Math.floor((hmm - 2 * margin - hole) / pitch) + 1;
  const x0 = (wmm - ((nx - 1) * pitch + hole)) / 2, y0 = (hmm - ((ny - 1) * pitch + hole)) / 2;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) g.fillRect((x0 + i * pitch) * k, (y0 + j * pitch) * k, hole * k, hole * k);
  const t = new THREE.CanvasTexture(c);
  t.repeat.set(1000 / wmm, 1000 / hmm); t.offset.set(0.5, 0.5);
  return t;
}

// Tekstur muka perangkat: draw(g, k, helper) menggambar dalam satuan mm (asal kiri-atas)
export function faceTexture(wmm, hmm, draw, k = 6) {
  const c = document.createElement('canvas'); c.width = Math.round(wmm * k); c.height = Math.round(hmm * k);
  const g = c.getContext('2d');
  const H = {
    txt: (str, x, y, size, color = '#2a2f35', weight = '600', align = 'left') => {
      g.fillStyle = color; g.font = `${weight} ${size * k}px Arial, sans-serif`; g.textAlign = align; g.textBaseline = 'middle';
      g.fillText(str, x * k, y * k);
    },
    box: (x, y, w, h, lw = 0.3, color = '#4a4f55') => { g.lineWidth = lw * k; g.strokeStyle = color; g.strokeRect(x * k, y * k, w * k, h * k); },
    fill: (x, y, w, h, color) => { g.fillStyle = color; g.fillRect(x * k, y * k, w * k, h * k); },
  };
  draw(g, k, H);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
export function loggerFaceTex() {
  return faceTexture(120, 120, (g, k, H) => {
    H.fill(0, 0, 120, 120, '#f3f4f1');
    H.box(22, 9, 74, 37, 0.45);                                           // bingkai panel LCD
    H.txt('BEACON LOGGER', 26, 15.5, 5, '#2a2f35', '700');
    H.txt('BE-BL110', 94, 11.5, 2.8, '#2a2f35', '600', 'right');
    H.fill(28, 21, 62, 11, '#9fc23a'); H.box(27, 20, 64, 13, 0.4);       // LCD
    H.txt('STESY', 72, 39.5, 3.6, '#d9534f', '700'); H.txt('Smart Telemetry Systems', 72, 42.5, 1.4, '#555', '500');
    ['24V', '12V', '5V', 'Tx1', 'Rx1', 'A', 'B', 'S1', 'G', 'RST'].forEach((l, i) => {
      H.box(3, 14 + i * 6.2, 9, 6.2); H.txt(l, 7.5, 17.1 + i * 6.2, 2.9, i < 3 ? '#d9534f' : '#2a2f35', '600', 'center');
    });
    H.fill(62, 51, 14, 6.5, '#b9bdc2'); H.fill(63.5, 53, 11, 2.5, '#3a3d42');   // USB-A
    H.txt('⭠ USB', 69, 60.5, 2.2, '#444', '600', 'center');
    H.txt('SD CARD', 96, 50, 2.8, '#2a2f35', '600', 'center'); H.fill(89, 53, 14, 1.4, '#1c1c1c');
    H.txt('TYPE C', 83, 59.5, 2.6, '#2a2f35', '600', 'center'); H.fill(80, 62, 7, 2.6, '#2f3237');
    H.txt('PORT I/O', 87, 69.5, 2.8, '#2a2f35', '600', 'center');
    H.box(22, 72, 38, 14, 0.35);                                          // logo
    H.txt('be', 34, 78.5, 7.5, '#c0392b', '700'); H.txt('BEACON ENGINEERING', 41.5, 83.5, 1.6, '#333', '600', 'center');
    H.box(106, 27, 10, 6); H.txt('GPS', 111, 30, 2.6, '#2a2f35', '600', 'center');
    const B = ['A1', 'G', 'A3', 'G', 'D1', 'G', 'D2', 'R1', '+', '−'];
    B.forEach((l, i) => {
      const x = 12 + i * 6.2;
      if (l === '+') H.fill(x, 102, 6.2, 7, '#d9342b'); if (l === '−') H.fill(x, 102, 6.2, 7, '#1c1c1c');
      H.box(x, 102, 6.2, 7); H.txt(l, x + 3.1, 105.5, 2.8, l === '+' || l === '−' ? '#fff' : '#2a2f35', '700', 'center');
    });
    H.box(74, 102, 16, 7); H.txt('ETH', 82, 105.5, 3, '#2a2f35', '700', 'center');
    H.box(90, 102, 13, 7); H.txt('USB', 96.5, 105.5, 3, '#2a2f35', '700', 'center');
  });
}
// MPPT BSC-20: muka layar (atas) dan muka terminal (bawah, lebih rendah)
export const MPPT_BTN_U = [38, 55, 72, 89], MPPT_HOLE_U = [30, 41, 55, 66, 80, 91];
export function mpptDisplayTex() {
  return faceTexture(124, 55, (g, k, H) => {
    const blue = '#1f3f8f';
    H.fill(0, 0, 124, 55, '#f3f4f1');
    H.txt('T', 14, 5, 3.4, blue, '700', 'center'); H.txt('BSC-20', 14, 11, 4.2, blue, '700', 'center');
    ['⇄', '+', '−', '💡'].forEach((l, i) => H.txt(l, MPPT_BTN_U[i], 14, 3, '#333', '600', 'center'));
    H.txt('← 5S Reset', 120, 8, 2.5, '#333', '600', 'right');
    H.fill(38, 17, 50, 27, '#b5c89a'); H.box(37, 16, 52, 29, 0.5);
    for (const [l, y] of [['PV A/TEMP°C', 24], ['EVENING H', 32], ['PV OFF V', 40]]) H.txt(l, 3, y, 2.4, blue, '700');
    for (const [l, y] of [['BAT% LOAD A', 24], ['PAUSE H', 31], ['DAWN H', 34], ['LOAD ON V', 40]]) H.txt(l, 121, y, 2.4, blue, '700', 'right');
    H.txt('LOAD OFF V', 63, 50, 2.5, blue, '700', 'center');
  });
}
export function mpptTermTex() {
  return faceTexture(124, 30, (g, k, H) => {
    const blue = '#1f3f8f';
    H.fill(0, 0, 124, 30, '#eceee9');
    H.txt('be', 12, 12, 6, '#c0392b', '700', 'center'); H.txt('BEACON ENGINEERING', 12, 17, 1.3, '#333', '600', 'center');
    [['Solar', 35.5], ['Battery', 60.5], ['Load', 85.5]].forEach(([l, u]) => H.txt(l, u, 5, 2.2, '#9a9a9a', '600', 'center'));
    MPPT_HOLE_U.forEach(u => {
      g.fillStyle = '#c9ccc8'; g.beginPath(); g.arc(u * k, 13 * k, 3.4 * k, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#6f7372'; g.beginPath(); g.arc(u * k, 13 * k, 2.2 * k, 0, Math.PI * 2); g.fill();
    });
    [['+ ▦ −', 35.5], ['+ ▭ −', 60.5], ['+ ☼ −', 85.5]].forEach(([l, u]) => H.txt(l, u, 22, 2.8, '#333', '600', 'center'));
    H.txt('SOLAR MPPT®', 109, 11, 2.6, blue, '700', 'center');
    g.fillStyle = '#2f6fbf'; g.beginPath();
    g.moveTo(101 * k, 16 * k); g.lineTo(109 * k, 19 * k); g.lineTo(101 * k, 22 * k); g.closePath();
    g.moveTo(117 * k, 16 * k); g.lineTo(109 * k, 19 * k); g.lineTo(117 * k, 22 * k); g.closePath(); g.fill();
  });
}
export function mpptLabelTex() {
  return faceTexture(40, 16, (g, k, H) => {
    H.fill(0, 0, 40, 16, '#ffffff'); H.box(0.5, 0.5, 39, 15, 0.3, '#999');
    H.txt('12V/24V CE', 20, 5.5, 3.6, '#111', '700', 'center'); H.txt('MPPT  T20A', 20, 11, 3.6, '#111', '700', 'center');
  });
}
export function mpptTableTex() {
  return faceTexture(48, 16, (g, k, H) => {
    H.fill(0, 0, 48, 16, '#f3f4f1');
    const blue = '#1f3f8f';
    H.box(1, 1, 46, 14, 0.3, blue);
    for (const y of [4.5, 8, 11.5]) { g.strokeStyle = blue; g.lineWidth = 0.25 * k; g.beginPath(); g.moveTo(1 * k, y * k); g.lineTo(47 * k, y * k); g.stroke(); }
    for (const x of [14, 29, 38]) { g.beginPath(); g.moveTo(x * k, 1 * k); g.lineTo(x * k, 15 * k); g.stroke(); }
    [['system', 'solar panel', '10A', '20A', 2.8], ['Batt. V', 'Voc', '', '', 6.3], ['12V', '≤24V', '130W', '260W', 9.8], ['24V', '≤48V', '260W', '520W', 13.3]]
      .forEach(([a, b, c, dd, y]) => { H.txt(a, 7.5, y, 1.6, blue, '700', 'center'); H.txt(b, 21.5, y, 1.6, blue, '700', 'center'); H.txt(c, 33.5, y, 1.6, blue, '700', 'center'); H.txt(dd, 42.5, y, 1.6, blue, '700', 'center'); });
  });
}
// Data sender: panel kuning sisi LED, panel kuning sisi port, ujung berventilasi
export const DS_SMA_U = [9, 17, 50];
export function dsLedTex() {
  return faceTexture(155, 20, (g, k, H) => {
    H.fill(0, 0, 155, 20, '#1b1d20'); H.fill(3, 2, 149, 16, '#e3a33b');
    [['WAN/LAN', 10], ['LAN', 24], ['System', 38], ['WIFI', 56], ['Online', 72], ['SIM', 86], ['', 126], ['', 132], ['', 138], ['Power', 148]]
      .forEach(([l, u]) => {
        g.fillStyle = '#a9adb3'; g.beginPath(); g.arc(u * k, 8 * k, 1.4 * k, 0, Math.PI * 2); g.fill();
        if (l) H.txt(l, u, 13, 2, '#3a2a10', '600', 'center');
      });
    H.fill(98, 7, 22, 3, '#111'); H.txt('SIM/ UIM', 109, 13, 2, '#3a2a10', '700', 'center');
    g.strokeStyle = '#8a5d1d'; g.lineWidth = 0.3 * k; g.strokeRect(45 * k, 3 * k, 49 * k, 14 * k);
  });
}
export function dsPortTex() {
  return faceTexture(155, 20, (g, k, H) => {
    H.fill(0, 0, 155, 20, '#1b1d20'); H.fill(3, 2, 149, 16, '#e3a33b');
    DS_SMA_U.forEach(u => { g.fillStyle = '#b8902f'; g.beginPath(); g.arc(u * k, 9 * k, 3.2 * k, 0, Math.PI * 2); g.fill(); });
    g.fillStyle = '#222'; g.beginPath(); g.arc(30 * k, 9 * k, 0.9 * k, 0, Math.PI * 2); g.fill(); H.txt('Reset', 30, 15.5, 1.8, '#3a2a10', '600', 'center');
    H.fill(37, 5, 7, 7, '#111'); H.txt('Power', 40.5, 15.5, 1.8, '#3a2a10', '600', 'center');
    [['Console', 70], ['LAN', 100], ['WAN/LAN', 116]].forEach(([l, u]) => {
      H.fill(u - 7, 4, 14, 9, '#e8e8e8'); H.fill(u - 5.5, 5.5, 11, 6, '#222'); H.txt(l, u, 16, 1.8, '#3a2a10', '600', 'center');
    });
  });
}
export function dsVentTex() {
  return faceTexture(95, 25, (g, k, H) => {
    H.fill(0, 0, 95, 25, '#1b1d20');
    g.fillStyle = '#050506';
    for (let x = 18; x < 80; x += 3.2) for (let y = 6; y < 20; y += 3.2) { g.beginPath(); g.arc(x * k, y * k, 1 * k, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = '#9a9da2'; g.lineWidth = 0.6 * k; g.beginPath(); g.arc(9 * k, 12.5 * k, 4.5 * k, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#d9dadc'; g.beginPath(); g.arc(87 * k, 12.5 * k, 4 * k, 0, Math.PI * 2); g.fill();
  }, 5);
}

// Sel surya (map warna), ukuran dalam mm
export function cellTexture(wmm, dmm) {
  const k = 0.5, c = document.createElement('canvas');
  c.width = Math.round(wmm * k); c.height = Math.round(dmm * k);
  const g = c.getContext('2d');
  g.fillStyle = '#d9dde2'; g.fillRect(0, 0, c.width, c.height);
  const cell = 156, gap = 3, margin = 10;
  const nx = Math.max(1, Math.floor((wmm - 2 * margin) / cell)), ny = Math.max(1, Math.floor((dmm - 2 * margin) / cell));
  const cw = (wmm - 2 * margin - (nx - 1) * gap) / nx, ch = (dmm - 2 * margin - (ny - 1) * gap) / ny;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const x = margin + i * (cw + gap), y = margin + j * (ch + gap);
    g.fillStyle = '#16233a'; g.fillRect(x * k, y * k, cw * k, ch * k);
    g.fillStyle = '#56657d';
    for (let b = 1; b <= 3; b++) g.fillRect((x + b * cw / 4) * k - 0.5, y * k, 1, ch * k);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
