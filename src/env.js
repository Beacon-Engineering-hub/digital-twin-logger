// ============================================================================================================
// Simulasi lingkungan bersama (tanpa three / DOM): jam hari (pagi – siang – sore – malam), hujan, kejenuhan tanah,
// muka air sungai (naik, surut, banjir), saluran sawah & debit V-Notch. Satu keadaan untuk seluruh dunia — dunia
// (world.js), cahaya (render.js), panel lingkungan (envPanel.js) dan tiap seri (products/*) cukup membaca ENV.
// EWS Banjir (hulu) membaca ENV.dhUp; AWLR & dunia di hilir membaca ENV.dh; status & ambang: LEVELS, levelStatus.
//
// Waktu simulasi dalam JAM. ENV.rate = jam simulasi per detik nyata (0 = jeda). Hidrologi (model sederhana, perkiraan):
//   - kejenuhan tanah W naik oleh hujan & turun pelan saat kering → koefisien limpasan c(W)
//   - limpasan c·R melewati 2 tampungan linear berurutan (k1, k2) → debit sungai (mm/jam setara) dengan jeda ± 1,5 jam
//   - muka air sungai di hulu dhUp (m dari normal, stasiun EWS Banjir) = aliran dasar musim + 0,26·Q^0,62
//     (hujan terus-menerus: ringan 3 mm/jam → ± +0,36 m, sedang 8 → ± +0,78, lebat 16 → ± +1,27 meluap; skenario badai → puncak ± +1,8)
//   - di hilir (AWLR & seterusnya) dh = dhUp FLOOD_LAG jam sebelumnya: gelombang banjir butuh waktu tempuh → EWS di hulu
//     memberi waktu peringatan. Muka air manual = seluruh sungai sekaligus (tanpa jeda).
//   - pintu pengambilan sawah: aliran masuk ∝ (tinggi air di atas ambang)^1,5 → sungai surut = saluran & V-Notch surut
//   - V-Notch: Q = Q_saluran (tertunda) + limpasan hujan dari hamparan sawah, H = (Q / 1,38)^0,4
// Semua angka & ambang = perkiraan diorama, bukan data lapangan.
// ============================================================================================================
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Kelas intensitas hujan per jam (BMKG), sama dengan proyek referensi irigasi-digital-twin
export const RAIN_CLASS = [[0.2, 'Tidak hujan'], [1, 'Sangat ringan'], [5, 'Ringan'], [10, 'Sedang'], [20, 'Lebat'], [Infinity, 'Sangat lebat']];
export const rainClass = mmh => RAIN_CLASS.find(r => mmh < r[0])[1];
export const RAIN_PRESETS = [['Cerah', 0], ['Ringan', 3], ['Sedang', 8], ['Lebat', 16], ['Sangat lebat', 35]];

// Jam hari: preset tombol & nama periode
export const TIME_PRESETS = [['Pagi', 7], ['Siang', 12], ['Sore', 16], ['Malam', 21]];
export const periodOf = h => (h >= 4.5 && h < 10 ? 'Pagi' : h >= 10 && h < 15 ? 'Siang' : h >= 15 && h < 18.5 ? 'Sore' : 'Malam');
export const SPEEDS = [[0, 'Jeda'], [1 / 60, '1 jam = 1 menit'], [1 / 10, '1 jam = 10 dtk'], [1 / 2, '1 jam = 2 dtk']];

// Muka air sungai di stasiun AWLR: normal 0,9 m di bawah tanah tebing sungai (world.js RIVER.water), meluap di dh ≥ 0,9.
// Status untuk EWS Banjir (ambang perkiraan, m dari muka air normal)
export const BANK = 0.9;
export const LEVELS = { surut: -0.25, waspada: 0.4, siaga: 0.65, awas: BANK };
export const STATUS = {
  surut:   { label: 'Surut',   st: 'low' },
  normal:  { label: 'Normal',  st: 'good' },
  waspada: { label: 'Waspada', st: 'warn' },
  siaga:   { label: 'Siaga',   st: 'alert' },
  awas:    { label: 'Awas · meluap', st: 'crit' },
};
export const levelStatus = dh => (dh >= LEVELS.awas ? 'awas' : dh >= LEVELS.siaga ? 'siaga' : dh >= LEVELS.waspada ? 'waspada' : dh <= LEVELS.surut ? 'surut' : 'normal');
export const DH_RANGE = [-0.6, 2.0];
// Waktu tempuh gelombang banjir dari EWS Banjir (hulu) ke AWLR (hilir), jam simulasi — perkiraan; jarak diorama dipersingkat
export const FLOOD_LAG = 0.5;

// Musim → aliran dasar (m dari normal) & kejenuhan tanah saat kering
export const SEASONS = { kemarau: { label: 'Kemarau', base: -0.45, W0: 0.15 }, normal: { label: 'Normal', base: 0, W0: 0.3 }, penghujan: { label: 'Penghujan', base: 0.18, W0: 0.45 } };

// Kejenuhan tanah kritis untuk lereng EWS (perkiraan): di atasnya rayapan lereng dimulai
export const SOIL_CRIT = 0.8;

// V-Notch 90°: Q = 1,38 · H^2,5 (m³/s, H m). Normal H = 0,1 m (sawah.js VH)
export const VN_H0 = 0.1, vnQ = H => 1.38 * Math.max(0, H) ** 2.5, vnH = Q => (Math.max(0, Q) / 1.38) ** 0.4;
// Limpasan hujan ke V-Notch: hanya sebagian hamparan (jalur saluran tersier) — petak lain membuang air petak demi petak ke sungai
const VN_Q0 = vnQ(VN_H0), SAWAH_A = 12800, SAWAH_C = 0.25;                 // m³/s normal; luas hamparan (m²) & porsi limpasan ke V-Notch
const INTAKE_E0 = 0.56;                                                      // tinggi air di atas ambang pintu pengambilan saat normal (m)

// Skenario badai: intensitas hujan (mm/jam) menurut jam sejak mulai
const STORM = [[0, 0], [0.4, 6], [1.2, 28], [1.8, 42], [3.6, 40], [4.4, 18], [5.2, 6], [6, 0]];
const stormAt = t => { for (let i = 1; i < STORM.length; i++) if (t <= STORM[i][0]) { const [a, ra] = STORM[i - 1], [b, rb] = STORM[i]; return ra + (rb - ra) * (t - a) / (b - a); } return 0; };
export const STORM_HOURS = STORM.at(-1)[0];

const HIST_STEP = 0.1, HIST_N = 240;                                          // riwayat 24 jam simulasi, tiap 6 menit

export const ENV = {
  // ---- masukan (panel) ----
  hour: 16, rate: 1 / 10,                  // jam hari, jam simulasi per detik nyata
  rainSet: 0,                              // hujan yang diminta (mm/jam)
  auto: true, manual: 0,                   // muka air dari hujan / manual (m dari normal)
  season: 'normal',
  storm: null,                             // { t } jam sejak skenario badai mulai
  jump: null,                              // putaran cepat jam ke preset (jumpTo)
  // ---- keadaan ----
  t: 0,                                    // jam simulasi sejak mulai
  rain: 0,                                 // hujan hidrologi (mm/jam)
  rainDay: 0,                              // curah hujan sejak pukul 00:00 simulasi (mm) — bacaan ARR
  rainVis: 0,                              // hujan tampak (mengikuti rainSet dalam ± 1,5 dtk nyata, juga saat jeda)
  cloud: 0,                                // mendung 0..1 (tampak)
  wet: 0,                                  // tanah basah 0..1 (tampak)
  W: 0.3, S1: 0, S2: 0, base: 0,           // kejenuhan tanah, tampungan limpasan (mm), aliran dasar (m)
  dh: 0, dhUp: 0, dhAuto: 0,               // muka air sungai hilir (AWLR) & hulu (EWS Banjir), m dari normal; hasil model hujan (hulu)
  kIntake: 0,                              // letak pintu pengambilan sawah di antara AWLR (0) & hulu (1), diisi world.js
  lagBuf: [],                              // [t, dhAuto] untuk jeda hulu → hilir
  qIn: 1, qLag: 1, rLag: 0,                // aliran masuk pintu pengambilan (relatif normal), tertunda; hujan tertunda sawah
  canal: 0, H: VN_H0, Q: VN_Q0, Qc: VN_Q0, Qr: 0,   // naik-turun muka air saluran (m), V-Notch
  dtSim: 0,                                // jam simulasi yang berjalan pada frame ini
  hist: [],                                // [{ rain, dh, dhUp }] tiap HIST_STEP jam
  histT: 0,
  ver: 0,                                  // naik tiap riwayat bertambah (panel menggambar ulang grafik)
};
for (let i = 0; i < HIST_N; i++) ENV.hist.push({ rain: 0, dh: 0, dhUp: 0 });

// Sinar matahari 0..1 (untuk lampu malam, dsb.)
export const daylight = h => clamp((Math.sin((h - 6) / 12 * Math.PI) + 0.12) / 0.3, 0, 1);
export const nightOf = h => 1 - daylight(h);

export function setHour(h) { ENV.jump = null; ENV.hour = ((h % 24) + 24) % 24; }
// Lompat ke jam h (tombol Pagi / Siang / Sore / Malam): jam diputar maju cepat dalam ± 1 dtk nyata, hidrologi tidak ikut
export function jumpTo(h) { const d = ((h - ENV.hour) % 24 + 24) % 24; if (d > 0.01) ENV.jump = { h0: ENV.hour, d, t: 0, dur: 0.7 + d / 24 * 1.3 }; }
export function startStorm() { ENV.storm = { t: 0 }; ENV.auto = true; if (!ENV.rate) ENV.rate = SPEEDS[2][0]; }
export function stopStorm() { ENV.storm = null; ENV.rainSet = 0; }

// Satu langkah: dt = detik nyata. Mengembalikan ENV.
export function stepEnv(dt) {
  const E = ENV, h = dt * E.rate;                                           // jam simulasi frame ini
  E.dtSim = h;
  if (E.storm) {
    E.storm.t += h;
    E.rainSet = Math.round(stormAt(E.storm.t) * 10) / 10;
    if (E.storm.t >= STORM_HOURS) { E.storm = null; E.rainSet = 0; }
  }
  // Tampak: hujan & mendung mengikuti permintaan dalam waktu nyata (juga saat jam dijeda)
  const kv = 1 - Math.exp(-dt / 1.2);
  E.rainVis += (E.rainSet - E.rainVis) * kv; if (Math.abs(E.rainSet - E.rainVis) < 0.02) E.rainVis = E.rainSet;
  const cloudT = clamp(E.rainSet / 12, 0, 1) ** 0.6;
  E.cloud += (cloudT - E.cloud) * (1 - Math.exp(-dt / 2));
  E.rain = E.rainSet;
  if (E.jump) {
    const J = E.jump; J.t = Math.min(1, J.t + dt / J.dur);
    E.hour = (J.h0 + J.d * (J.t < 0.5 ? 2 * J.t * J.t : 1 - (-2 * J.t + 2) ** 2 / 2)) % 24;
    if (J.t >= 1) E.jump = null;
  }
  if (h > 0) {
    const R = E.rain;
    E.rainDay += R * h;
    if (!E.jump) { const h0 = E.hour; E.hour = (E.hour + h) % 24; if (E.hour < h0) E.rainDay = R * (E.hour % 24); }   // lewat tengah malam: hari baru
    E.t += h;
    const S = SEASONS[E.season];
    // tanah: basah (tampak) & kejenuhan (hidrologi)
    E.wet = R > 0.3 ? E.wet + (1 - E.wet) * (1 - Math.exp(-h / 0.25)) : E.wet * Math.exp(-h / 2.5);
    E.W = clamp(E.W + h * (R / 60 * (1 - E.W) - (E.W - S.W0) / 30), 0, 1);
    // limpasan → 2 tampungan linear → debit (mm/jam setara) → kenaikan muka air
    const c = 0.1 + 0.8 * E.W ** 1.5, k1 = 0.7, k2 = 1.0;
    const q1 = E.S1 / k1, q2 = E.S2 / k2;
    E.S1 = Math.max(0, E.S1 + h * (c * R - q1)); E.S2 = Math.max(0, E.S2 + h * (q1 - q2));
    E.base += (S.base - E.base) * (1 - Math.exp(-h / 4));
    E.dhAuto = clamp(E.base + 0.26 * (E.S2 / k2) ** 0.62, DH_RANGE[0], DH_RANGE[1]);
    const B = E.lagBuf;                                                     // riwayat hulu untuk muka air hilir
    if (!B.length || E.t - B.at(-1)[0] >= 0.01) B.push([E.t, E.dhAuto]); else B.at(-1)[1] = E.dhAuto;
    while (B.length > 2 && B[1][0] <= E.t - FLOOD_LAG) B.shift();
    // saluran & V-Notch tertunda
    E.qLag += (E.qIn - E.qLag) * (1 - Math.exp(-h / 0.5));
    E.rLag += (R - E.rLag) * (1 - Math.exp(-h / 0.4));
    // riwayat
    E.histT += h;
    while (E.histT >= HIST_STEP) { E.histT -= HIST_STEP; E.hist.push({ rain: R, dh: E.dh, dhUp: E.dhUp }); if (E.hist.length > HIST_N) E.hist.shift(); E.ver++; }
  }
  if (E.auto) { E.dhUp = E.dhAuto; E.dh = lagged(E.t - FLOOD_LAG); }
  else E.dh = E.dhUp = clamp(E.manual, DH_RANGE[0], DH_RANGE[1]);
  // pintu pengambilan (antara AWLR & hulu): tinggi air di atas ambang → aliran masuk (daun pintu membatasi saat banjir)
  const dhIn = E.dh + (E.dhUp - E.dh) * E.kIntake;
  E.qIn = clamp(Math.max(0, INTAKE_E0 + dhIn) / INTAKE_E0, 0, 2) ** 1.5; E.qIn = Math.min(E.qIn, 1.6);
  if (h === 0 && !E.auto) E.qLag = E.qIn;                                    // jam dijeda + muka air manual: saluran langsung mengikuti
  E.canal = clamp(0.5 * (E.qLag ** 0.6 - 1), -0.5, 0.16);
  E.Qc = VN_Q0 * E.qLag;
  E.Qr = SAWAH_A * SAWAH_C * E.rLag / 3.6e6;
  E.Q = E.Qc + E.Qr; E.H = Math.min(0.47, vnH(E.Q));
  return E;
}

// Muka air hulu pada jam simulasi t (interpolasi riwayat; sebelum riwayat ada = nilai tertua)
function lagged(t) {
  const B = ENV.lagBuf;
  if (!B.length) return ENV.dhAuto;
  if (t <= B[0][0]) return B[0][1];
  for (let i = 1; i < B.length; i++) if (B[i][0] >= t) { const [t0, v0] = B[i - 1], [t1, v1] = B[i]; return v0 + (v1 - v0) * (t - t0) / (t1 - t0 || 1); }
  return B.at(-1)[1];
}

// Curah hujan (mm) dalam `hours` jam simulasi terakhir, dari riwayat (tiap HIST_STEP jam) + sisa langkah berjalan
export const rainSum = (hours = 1) => ENV.hist.slice(-Math.round(hours / HIST_STEP)).reduce((a, p) => a + p.rain * HIST_STEP, 0);

// Tampilan jam "hh:mm"
export const clock = h => { const m = Math.floor(((h % 24) + 24) % 24 * 60); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
