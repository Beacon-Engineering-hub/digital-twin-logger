import { BANK, DH_RANGE, ENV, LEVELS, RAIN_PRESETS, SEASONS, SOIL_CRIT, SPEEDS, STATUS, STORM_HOURS, TIME_PRESETS, clock,
  jumpTo, levelStatus, nightOf, periodOf, rainClass, setHour, startStorm, stopStorm } from './env.js';

// Panel "Lingkungan" (kanan atas, tampil di peta & tampilan logger): simulasi perangkat yang sedang dibuka (#prodPanel,
// diisi main.js dari products/*), jam hari + kecepatan, hujan & skenario badai,
// hidrograf 24 jam (hujan + muka air hulu / EWS Banjir & hilir / AWLR + ambang), muka air otomatis / manual, musim, kejenuhan tanah,
// pintu pengambilan sawah & V-Notch. Hanya membaca / menulis ENV (env.js); gaya kaca biru gelap seperti peta kawasan.
const ICON = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 0 1-.7-8.95A5.5 5.5 0 0 1 17 8.5a4 4 0 0 1 .5 9.5z"/>',
  rain: '<path d="M7 14a4 4 0 0 1-.6-7.95A5 5 0 0 1 16 5.5a3.5 3.5 0 0 1 1 6.9"/><path d="M8 17l-1 3m5-4-1 3m5-4-1 3"/>',
  play: '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor" stroke="none"/>',
  fold: '<path d="M6 9l6 6 6-6"/>',
};
const svg = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
const f = (v, d = 2) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`;
const RANK = { surut: 0, normal: 1, waspada: 2, siaga: 3, awas: 4 };
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* */ } } };

export function mountEnvPanel(host, { onFold } = {}) {
  if (!host) return null;
  host.innerHTML = `
    <header class="env-top">
      <span class="env-ic" id="eIc"></span>
      <div class="env-clock"><b id="eClock">16:00</b><span id="ePeriod">Sore</span></div>
      <span class="env-chip" id="eWx"></span>
      <span class="env-st" id="eSt"><i class="dot"></i><span></span></span>
      <button class="env-fold" id="eFold" type="button" aria-label="Lipat panel lingkungan">${svg('fold')}</button>
    </header>
    <div class="env-body" id="eBody">
      <div class="env-sec env-dev" id="eDev" hidden>
        <div class="env-row"><span class="env-lbl" id="eDevTitle">Simulasi perangkat</span></div>
        <div id="prodPanel"></div>
      </div>
      <div class="env-sec">
        <div class="env-row"><span class="env-lbl">Waktu</span>
          <span class="env-ctl"><button type="button" class="env-btn env-play" id="ePlay"></button>
          <select id="eSpeed" aria-label="Kecepatan jam">${SPEEDS.slice(1).map(([v, t], i) => `<option value="${i + 1}">${t}</option>`).join('')}</select></span></div>
        <input type="range" id="eHour" min="0" max="24" step="0.05" aria-label="Jam">
        <div class="env-seg" id="eTimes">${TIME_PRESETS.map(([t, h]) => `<button type="button" data-h="${h}">${t}</button>`).join('')}</div>
      </div>
      <div class="env-sec">
        <div class="env-row"><span class="env-lbl">Hujan</span><output id="eRainOut"></output></div>
        <div class="env-seg env-seg5" id="eRains">${RAIN_PRESETS.map(([t, v]) => `<button type="button" data-v="${v}">${t}</button>`).join('')}</div>
        <input type="range" id="eRain" min="0" max="60" step="0.5" aria-label="Intensitas hujan (mm/jam)">
        <button type="button" class="env-btn env-wide" id="eStorm"></button>
      </div>
      <div class="env-sec">
        <div class="env-row"><span class="env-lbl">Muka air sungai</span><output id="eLvl"></output></div>
        <canvas id="eChart" class="env-chart" aria-label="Hidrograf 24 jam: hujan dan muka air sungai"></canvas>
        <div class="env-axis"><span>24 jam lalu</span><span><i class="lg lg-r"></i>hujan <i class="lg lg-u"></i>hulu <i class="lg lg-l"></i>AWLR</span><span>kini</span></div>
        <label class="env-switch">Otomatis dari hujan <input type="checkbox" id="eAuto"></label>
        <div class="env-row env-sub"><span>Atur manual</span><output id="eManOut"></output></div>
        <input type="range" id="eManual" min="${DH_RANGE[0]}" max="${DH_RANGE[1]}" step="0.01" aria-label="Muka air manual (m dari normal)">
        <div class="env-row env-sub"><span>Musim (aliran dasar)</span>
          <select id="eSeason">${Object.entries(SEASONS).map(([k, s]) => `<option value="${k}">${s.label}</option>`).join('')}</select></div>
      </div>
      <dl class="env-grid">
        <div><dt>Kejenuhan tanah</dt><dd id="eSoil"></dd><i class="env-bar"><em id="eSoilBar"></em><b style="left:${SOIL_CRIT * 100}%"></b></i></div>
        <div><dt>Pintu air sawah</dt><dd id="eIntake"></dd></div>
        <div><dt>V-Notch</dt><dd id="eVn"></dd></div>
        <div><dt>Genangan</dt><dd id="eFlood"></dd></div>
      </dl>
      <p class="env-note">Model hidrologi sederhana, ambang Waspada ${f(LEVELS.waspada)} · Siaga ${f(LEVELS.siaga)} · Awas ${f(LEVELS.awas)} m dari muka air normal (meluap di tebing AWLR) — semua perkiraan.</p>
    </div>`;
  const $ = id => host.querySelector('#' + id);
  const el = Object.fromEntries(['eIc', 'eClock', 'ePeriod', 'eWx', 'eSt', 'eFold', 'eBody', 'ePlay', 'eSpeed', 'eHour', 'eTimes', 'eRainOut', 'eRains', 'eRain', 'eStorm',
    'eLvl', 'eChart', 'eAuto', 'eManOut', 'eManual', 'eSeason', 'eSoil', 'eSoilBar', 'eIntake', 'eVn', 'eFlood'].map(k => [k, $(k)]));
  let lastRate = ENV.rate || SPEEDS[2][0], dragHour = false, dragMan = false;

  // ---------- Lipat ----------
  const folded = store.get('envFolded') ?? (innerWidth < 760 ? '1' : '0');
  const setFold = on => { host.classList.toggle('folded', on); el.eFold.setAttribute('aria-expanded', !on); store.set('envFolded', on ? '1' : '0'); onFold?.(); };
  setFold(folded === '1');
  el.eFold.addEventListener('click', () => setFold(!host.classList.contains('folded')));
  host.querySelector('.env-top').addEventListener('click', e => { if (host.classList.contains('folded') && !e.target.closest('#eFold')) setFold(false); });

  // ---------- Waktu ----------
  el.ePlay.addEventListener('click', () => { if (ENV.rate) { lastRate = ENV.rate; ENV.rate = 0; } else ENV.rate = lastRate; sync(); });
  el.eSpeed.addEventListener('change', () => { ENV.rate = lastRate = SPEEDS[+el.eSpeed.value][0]; sync(); });
  el.eHour.addEventListener('pointerdown', () => { dragHour = true; });
  addEventListener('pointerup', () => { dragHour = false; dragMan = false; });
  el.eHour.addEventListener('input', () => setHour(+el.eHour.value));
  for (const b of el.eTimes.children) b.addEventListener('click', () => jumpTo(+b.dataset.h));

  // ---------- Hujan ----------
  const setRain = v => { if (ENV.storm) stopStorm(); ENV.rainSet = v; sync(); };
  for (const b of el.eRains.children) b.addEventListener('click', () => setRain(+b.dataset.v));
  el.eRain.addEventListener('input', () => setRain(+el.eRain.value));
  el.eStorm.addEventListener('click', () => { if (ENV.storm) stopStorm(); else { startStorm(); lastRate = ENV.rate; } sync(); });

  // ---------- Muka air ----------
  el.eAuto.addEventListener('change', () => { ENV.auto = el.eAuto.checked; if (!ENV.auto) ENV.manual = ENV.dh; sync(); });
  el.eManual.addEventListener('pointerdown', () => { dragMan = true; });
  el.eManual.addEventListener('input', () => { ENV.auto = false; ENV.manual = +el.eManual.value; sync(); });
  el.eSeason.addEventListener('change', () => { ENV.season = el.eSeason.value; });

  // ---------- Grafik hidrograf ----------
  const cv = el.eChart, cx = cv.getContext('2d');
  let chartVer = -1, chartDh = NaN;
  function drawChart() {
    const dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth || 272, H = cv.clientHeight || 78;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, W, H);
    const pts = [...ENV.hist.slice(1), { rain: ENV.rain, dh: ENV.dh, dhUp: ENV.dhUp }], n = pts.length, X = i => i / (n - 1) * W;
    const [lo, hi] = DH_RANGE, Y = v => H - 3 - (v - lo) / (hi - lo) * (H - 6);
    // hujan: batang dari atas (60 mm/jam = setengah tinggi)
    cx.fillStyle = 'rgba(96,165,250,.55)';
    pts.forEach((p, i) => { if (p.rain > 0.05) { const h = Math.min(1, p.rain / 60) * H * 0.5; cx.fillRect(X(i) - 0.6, 0, Math.max(1.2, W / n), h); } });
    // ambang
    for (const [v, c] of [[0, 'rgba(179,194,222,.28)'], [LEVELS.waspada, '#e8b93a'], [LEVELS.siaga, '#f08a3c'], [LEVELS.awas, '#ef5a4c'], [LEVELS.surut, 'rgba(120,170,230,.5)']]) {
      cx.strokeStyle = c; cx.lineWidth = 1; cx.setLineDash(v === 0 ? [] : [3, 3]); cx.beginPath(); cx.moveTo(0, Y(v) + 0.5); cx.lineTo(W, Y(v) + 0.5); cx.stroke();
    }
    cx.setLineDash([]);
    // muka air hulu (EWS Banjir, memimpin) + AWLR hilir: area + garis
    cx.beginPath(); pts.forEach((p, i) => (i ? cx.lineTo(X(i), Y(p.dhUp ?? p.dh)) : cx.moveTo(0, Y(p.dhUp ?? p.dh))));
    cx.strokeStyle = '#f5a25a'; cx.lineWidth = 1.3; cx.setLineDash([4, 2]); cx.stroke(); cx.setLineDash([]);
    cx.beginPath(); pts.forEach((p, i) => (i ? cx.lineTo(X(i), Y(p.dh)) : cx.moveTo(0, Y(p.dh))));
    cx.strokeStyle = '#3cd2f2'; cx.lineWidth = 1.6; cx.stroke();
    cx.lineTo(W, H); cx.lineTo(0, H); cx.closePath(); cx.fillStyle = 'rgba(60,180,242,.14)'; cx.fill();
    const last = pts.at(-1); cx.fillStyle = '#3cd2f2'; cx.beginPath(); cx.arc(W - 2.5, Y(last.dh), 2.5, 0, 7); cx.fill();
  }

  // ---------- Sinkron tampilan ----------
  let lastSync = 0;
  function sync() {
    const E = ENV, sUp = levelStatus(E.dhUp), sDn = levelStatus(E.dh), night = nightOf(E.hour) > 0.5;
    const S = STATUS[RANK[sUp] >= RANK[sDn] ? sUp : sDn], dm = Math.max(E.dh, E.dhUp);   // chip = status terparah (hulu / AWLR)
    el.eIc.innerHTML = svg(E.rainVis > 0.3 ? 'rain' : E.cloud > 0.35 ? 'cloud' : night ? 'moon' : 'sun');
    el.eClock.textContent = clock(E.hour); el.ePeriod.textContent = periodOf(E.hour);
    el.eWx.textContent = E.rainSet > 0.2 ? `${E.rainSet.toFixed(E.rainSet < 10 ? 1 : 0)} mm/jam` : 'Cerah';
    el.eSt.dataset.st = S.st; el.eSt.lastChild.textContent = S.label;
    el.ePlay.innerHTML = svg(E.rate ? 'pause' : 'play'); el.ePlay.setAttribute('aria-label', E.rate ? 'Jeda jam' : 'Jalankan jam');
    const si = SPEEDS.findIndex(s => s[0] === (E.rate || lastRate)); if (si > 0) el.eSpeed.value = si;
    if (!dragHour) el.eHour.value = E.hour.toFixed(2);
    const per = periodOf(E.hour);
    for (const b of el.eTimes.children) b.setAttribute('aria-pressed', b.textContent === per);
    el.eRainOut.textContent = `${E.rainSet.toFixed(1)} mm/jam · ${rainClass(E.rainSet)}`;
    el.eRain.value = E.rainSet;
    const near = RAIN_PRESETS.reduce((b, p) => (Math.abs(p[1] - E.rainSet) < Math.abs(b[1] - E.rainSet) ? p : b));
    for (const b of el.eRains.children) b.setAttribute('aria-pressed', +b.dataset.v === near[1] && Math.abs(near[1] - E.rainSet) < 0.6);
    el.eStorm.textContent = E.storm ? `Hentikan skenario badai · jam ${E.storm.t.toFixed(1)} / ${STORM_HOURS}` : 'Skenario: hujan badai → banjir';
    el.eStorm.classList.toggle('on', !!E.storm);
    el.eLvl.innerHTML = `hulu <b>${f(E.dhUp)}</b> · AWLR <b>${f(E.dh)} m</b>`;
    el.eAuto.checked = E.auto;
    if (!dragMan) el.eManual.value = (E.auto ? E.dh : E.manual).toFixed(2);
    el.eManual.classList.toggle('dim', E.auto);
    el.eManOut.textContent = E.auto ? 'geser untuk mengambil alih' : `${f(E.manual)} m`;
    el.eSeason.value = E.season;
    el.eSoil.textContent = `${Math.round(E.W * 100)} %${E.W >= SOIL_CRIT ? ' · lereng rawan' : ''}`;
    el.eSoil.classList.toggle('warn', E.W >= SOIL_CRIT);
    el.eSoilBar.style.width = `${E.W * 100}%`;
    el.eIntake.textContent = E.qIn < 0.02 ? 'Kering (air di bawah ambang)' : `Masuk ${Math.round(E.qLag * 100)} % dari normal`;
    el.eVn.textContent = E.H < 0.003 ? 'Tidak ada aliran' : `H ${(E.H * 100).toFixed(1)} cm · Q ${(E.Q * 1000).toFixed(1)} L/dtk`;
    el.eFlood.textContent = dm > BANK ? `Meluap ke lembah, ${(dm - BANK).toFixed(2)} m di atas tebing${E.dhUp > BANK && E.dh <= BANK ? ' (hulu)' : ''}` : dm > LEVELS.siaga ? 'Hampir meluap' : 'Tidak ada';
  }
  sync(); drawChart();
  host.hidden = false;
  const dev = $('eDev'), devTitle = $('eDevTitle');
  return {
    // Bagian simulasi perangkat: title = nama perangkat (tampil) / null (peta: disembunyikan)
    setDevice(title) { dev.hidden = !title; if (title) devTitle.textContent = `Simulasi · ${title}`; },
    update() {
      const now = performance.now();
      if (now - lastSync > 150) { lastSync = now; sync(); }
      if (ENV.ver !== chartVer || Math.abs(ENV.dh + ENV.dhUp - chartDh) > 0.004) { chartVer = ENV.ver; chartDh = ENV.dh + ENV.dhUp; if (!host.classList.contains('folded')) drawChart(); }
    },
  };
}
