import * as THREE from 'three';
import { CAGE } from '../config.js';
import { BANK, ENV, FLOOD_LAG, levelStatus } from '../env.js';
import { AWLR_POS, HULU, SITES } from '../world.js';
import { SLEEVE, armLevels, awlrReadings, awlrRiver, fillReadings, readingRows } from './awlrRiver.js';
import { ALARM_STEP, alarmEncYMax, alarmExplode, alarmParts, buildAlarm, driveAlarm, pol } from './ewsAlarm.js';

// EWS Banjir di hulu (satuan m). Permintaan user: AWLR + horn + standing light untuk EWS banjir di hulu sungai.
// = stasiun AWLR Sungai (tiang 3" × 4 m, lengan 3 m + sensor radar, sling — awlrRiver.js) + bracket horn & standing light
// (ewsAlarm.js, sama dengan EWS Longsor) di bawah panel surya. Muka krangkeng, horn & lampu menghadap ke hilir (AWLR, sawah).
// Sensor membaca muka air hulu (env.js ENV.dhUp); status peringatan otomatis dari ambang muka air (perkiraan):
//   Normal / Surut → Aman (hijau) · Waspada → kuning · Siaga → kuning kedip + horn · Awas (meluap) → merah kedip + horn.
// Gelombang banjir sampai di AWLR (hilir) ± FLOOD_LAG jam kemudian → waktu peringatan untuk hilir.
// Kabel horn & lampu: SP21 di box → berdampingan naik di sisi depan-kiri tiang (150°, di belakang punggung krangkeng; kabel
// sensor AWLR tetap di 30°) → memutar ke 110° di antara baut sleeve lengan → horn ke celah antipanjat 90°, lampu ke 135°.
// Letak stasiun, jalur kabel, ambang & waktu tempuh = perkiraan.
const WARN = {
  off:     { label: 'Mati',    tier: -1, st: 'base' },
  aman:    { label: 'Aman',    tier: 0, st: 'good' },
  waspada: { label: 'Waspada', tier: 1, st: 'warn' },
  siaga:   { label: 'Siaga',   tier: 1, blink: true, horn: true, st: 'alert' },
  awas:    { label: 'Awas',    tier: 2, blink: true, horn: true, st: 'crit' },
};
const fromLevel = lv => (lv === 'awas' || lv === 'siaga' || lv === 'waspada' ? lv : 'aman');
let status = 'aman', auto = true, cur = null, lastKey = '', ui = null;

function extend(model) {
  const d = model.userData.d, S = model.userData.station;
  awlrRiver.extend(model, { level: () => ENV.dhUp, river: { xc: HULU.dP, width: 2 * HULU.hw, part: 'riverHulu', label: 'Sungai hulu' } });
  const root = new THREE.Group(); root.name = 'ewsBanjir'; model.add(root);
  // Jalur conduit horn (luar) & lampu (dalam) berdampingan: di zona krangkeng tetap di belakang punggung krangkeng (z < 0,05),
  // di zona sleeve lengan AWLR menjauh dari pipa sleeve di antara baut 60° & 150°, lalu ke celah jari antipanjat
  const { yA0 } = armLevels(d.encY), yCt = S.cy + CAGE.H / 2000 + 0.03, yS1 = yA0 + SLEEVE.len + 0.04;
  const U = buildAlarm(model, root, { cables: {
    light: { phi: 150, yH: S.cy - 0.53, route: yA => [pol(150, yCt), pol(110, yCt + 0.07, 0.068), pol(110, yS1, 0.068), pol(135, yS1 + 0.1), pol(135, yA - 0.13)] },
    horn: { phi: 150, yH: S.cy - 0.49, gap: 0.079,
      route: yA => [pol(150, yCt, 0.079), pol(110, yCt + 0.07, 0.084), pol(110, yS1, 0.084), pol(90, yS1 + 0.1), pol(90, yA - 0.13)] },
  } });
  model.userData.ews = U; cur = U; lastKey = '';
}

function update(now, ctx) {
  const U = cur;
  if (!U) return false;
  awlrRiver.update(now, ctx);                                         // dimensi sensor → muka air (hulu)
  const prev = status;
  if (auto) status = fromLevel(levelStatus(ENV.dhUp));
  if (ui && (prev !== status || now - ui.t > 200)) { ui.t = now; ui.sync(); }
  const st = WARN[status], key = status + driveAlarm(U, st, now, ctx.sky?.night ?? 0);
  const changed = key !== lastKey; lastKey = key;
  return changed || st.blink || st.horn ? 'redraw' : false;          // lampu / gelombang horn
}

const COLORS = { off: '#8a96ad', aman: '#46d78f', waspada: '#f4cf6a', siaga: '#f7a766', awas: '#ff7a6b' };
const TESTS = [['Surut', -0.4], ['Normal', 0], ['Siaga', 0.72], ['Banjir', 1.35]];
function panel(el, { params, invalidate, flyTo }) {
  const td = 'style="text-align:right;font-weight:600"';
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span>Status peringatan</span><output id="efOut" style="font-weight:700"></output></div>
    <div id="efBtns" style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px">${Object.entries(WARN).map(([k, w]) => `<button type="button" data-s="${k}" style="padding:7px 1px;font-size:11px">${w.label}</button>`).join('')}</div>
    <label class="switch" style="margin:12px 0 10px">Status otomatis dari muka air <input type="checkbox" id="efAuto"></label>
    <table id="efTab" style="width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;margin-bottom:12px">${readingRows(td)}
    </table>
    <div style="color:var(--muted);margin-bottom:6px">Uji muka air (manual)</div>
    <div id="efTests" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:6px">${TESTS.map(([t, v]) => `<button type="button" data-v="${v}">${t}</button>`).join('')}</div>
    <div class="btn-row"><button type="button" id="efAutoLv">Otomatis dari hujan</button><button type="button" id="efLook">Lihat sungai</button></div>`;
  const $ = s => el.querySelector(s), btns = [...$('#efBtns').children], tests = [...$('#efTests').children];
  const o = Object.fromEntries(['efOut', 'efAuto', 'efTab', 'efAutoLv'].map(k => [k, $('#' + k)]));
  for (const b of btns) b.addEventListener('click', () => { auto = false; status = b.dataset.s; sync(); invalidate(); });
  o.efAuto.addEventListener('change', () => { auto = o.efAuto.checked; sync(); invalidate(); });
  for (const b of tests) b.addEventListener('click', () => { ENV.auto = false; ENV.manual = +b.dataset.v; ENV.storm = null; auto = true; sync(); });
  o.efAutoLv.addEventListener('click', () => { ENV.auto = true; sync(); });
  $('#efLook').addEventListener('click', () => flyTo([-2.4, 3.6, 8.4], [3.4, -0.2, 1.2], 1300));
  function sync() {
    if (!o.efOut.isConnected) return;                                         // panel sudah diganti seri lain
    o.efOut.textContent = WARN[status].label + (auto ? ' · otomatis' : ''); o.efOut.style.color = COLORS[status];
    for (const b of btns) { const on = b.dataset.s === status; b.style.borderColor = on ? COLORS[b.dataset.s] : ''; b.style.color = on ? COLORS[b.dataset.s] : ''; b.style.fontWeight = on ? 700 : ''; }
    o.efAuto.checked = auto;
    fillReadings(o.efTab, awlrReadings(params.encY, ENV.dhUp, SITES['ews-banjir'].y));   // sensor di hulu
    for (const b of tests) { const on = !ENV.auto && Math.abs(ENV.manual - +b.dataset.v) < 0.005; b.style.borderColor = on ? 'var(--accent)' : ''; b.style.color = on ? 'var(--accent)' : ''; }
    o.efAutoLv.style.borderColor = ENV.auto ? 'var(--accent)' : ''; o.efAutoLv.style.color = ENV.auto ? 'var(--accent)' : '';
  }
  ui = { sync, t: 0 };
  sync();
}

// Explode: sensor & lengan AWLR (awlrRiver.js) + bracket horn & lampu (ewsAlarm.js); kabel horn & lampu memudar saat kabel dilepas
const explode = {
  steps: [...awlrRiver.explode.steps, ALARM_STEP],
  apply(model, seg, t) { awlrRiver.explode.apply(model, seg, t); alarmExplode(model.userData.ews, seg); },
};

const parts = {
  ...Object.fromEntries(Object.entries(awlrRiver.parts).filter(([k]) => k !== 'river').map(([k, P]) => [k, { ...P, group: 'EWS Banjir · AWLR' }])),
  ...alarmParts('EWS Banjir', {
    hadap: 'ke hilir (searah muka krangkeng)', bunyi: 'Status Siaga & Awas (simulasi)',
    simulasi: 'Aman = hijau, Waspada = kuning, Siaga = kuning kedip, Awas = merah kedip (dari muka air hulu)',
    hornJalur: 'Berdampingan dengan kabel lampu di sisi depan-kiri tiang (di belakang krangkeng), memutar di antara baut sleeve lengan, lewat celah jari antipanjat depan, menyusuri bawah lengan',
    lampuJalur: 'Sisi depan-kiri tiang (di belakang krangkeng), memutar di antara baut sleeve lengan, lewat celah jari antipanjat kiri-depan, menyusuri bawah lengan',
  }),
  riverHulu: { name: 'Sungai (hulu)', group: 'EWS Banjir', specs: () => [
    ['Lebar muka air', `± ${(2 * HULU.hw).toFixed(1)} m (visual)`],
    ['Tebing', `Diratakan ${BANK.toFixed(2)} m di atas muka air normal, sama dengan tebing AWLR (visual)`],
    ['Letak', `± ${Math.round(HULU.xc - AWLR_POS.x)} m di hulu stasiun AWLR (diorama)`],
    ['Waktu tempuh banjir ke AWLR', `± ${FLOOD_LAG * 60} menit (perkiraan)`],
  ]},
};

export const ewsFlood = {
  station: awlrRiver.station,
  encYMax: d => Math.min(awlrRiver.encYMax(d), alarmEncYMax(d)),
  pvBulge: awlrRiver.pvBulge,
  extend, update, panel, explode, parts,
  mapStatus: () => WARN[status].st,
  views: { iso: [[-2.6, 4.4, 8.6], [2.0, 1.9, 0]] },
};
