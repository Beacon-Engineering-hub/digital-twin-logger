import './style.css';
import { ICONS, PRODUCTS, productById } from './products.js';

// Satu viewer 3D (main.js) untuk peta & tampilan per logger; routing hash: #/ = peta kawasan (kamera menjauh + daftar
// stasiun), #/produk/<id> = tampilan per logger (kamera terbang ke stasiun itu di dunia yang sama + panel kontrol).
const home = document.getElementById('home'), viewerEl = document.getElementById('viewer');
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ICONS.station}</svg>`;

// EWS Longsor, AWLR Sungai, AFMR, V-Notch, EWS Banjir & ARR berdiri di peta (dunia bersama); seri lain dibuka di lokasinya saat dipilih dari daftar.
const MAP_IDS = ['ews-longsor', 'awlr-sungai', 'afmr', 'vnotch', 'ews-banjir', 'arr'];
let viewer = null;
const list = document.getElementById('productGrid');
list.innerHTML = PRODUCTS.map(p => `
  <button class="ov-item" data-id="${p.id}" type="button">
    <span class="ov-item-icon">${icon(p.icon)}</span>
    <span class="ov-item-code">${p.code}${p.variant ? `<small>${p.variant}</small>` : ''}</span>
    <span class="ov-item-name">${p.name || 'Nama lengkap belum diisi'}</span>
    <span class="ov-item-foot"><span class="ov-chip" data-st="${MAP_IDS.includes(p.id) ? 'good' : 'base'}"><i class="dot"></i>${MAP_IDS.includes(p.id) ? 'Di peta' : 'Belum di peta'}</span><b>Masuk →</b></span>
  </button>`).join('');
for (const b of list.children) {
  const id = b.dataset.id;
  b.addEventListener('click', () => { location.hash = `#/produk/${id}`; });
  b.addEventListener('pointerenter', () => viewer?.mapHover(id));
  b.addEventListener('pointerleave', () => viewer?.mapHover(null));
}
const VIEW_NAMES = { ikhtisar: 'Ikhtisar', ews: 'Tebing EWS', awlr: 'Sungai AWLR', vnotch: 'Sawah V-Notch', arr: 'Sawah ARR', hulu: 'Hulu EWS Banjir' };
const nav = document.getElementById('ovViews');
for (const [k, label] of Object.entries(VIEW_NAMES)) {
  const b = Object.assign(document.createElement('button'), { type: 'button', textContent: label });
  b.setAttribute('aria-pressed', k === 'ikhtisar');
  b.addEventListener('click', () => { viewer?.mapFlyTo(k); for (const o of nav.children) o.setAttribute('aria-pressed', o === b); });
  nav.appendChild(b);
}

async function route() {
  if (!viewer) return;
  const id = location.hash.match(/^#\/produk\/([\w-]+)/)?.[1];
  const prod = id && productById(id);
  if (!prod) {
    viewerEl.hidden = true; home.hidden = false;
    document.title = 'Digital Twin — Peta kawasan';
    viewer.showMap();                                          // selalu ke pandangan default (Ikhtisar)
    for (const b of nav.children) b.setAttribute('aria-pressed', b.textContent === VIEW_NAMES.ikhtisar);
    return;
  }
  home.hidden = true; viewerEl.hidden = false;
  document.title = `${prod.code} — Digital Twin`;
  prod.full ??= { ...prod, ...(await prod.load?.()) };
  viewer.showProduct(prod.full);
}
addEventListener('hashchange', route);
// Muat viewer + definisi lengkap stasiun peta, bangun dunia sekali, lalu buka sesuai alamat
(async () => {
  const v = await import('./main.js');                       // viewer baru dipakai route() setelah init (hash bisa berubah saat memuat)
  for (const p of PRODUCTS.filter(p => MAP_IDS.includes(p.id))) p.full ??= { ...p, ...(await p.load?.()) };
  v.init({
    products: PRODUCTS.map(p => p.full ?? p), mapIds: MAP_IDS,
    onOpen: id => { location.hash = `#/produk/${id}`; },
    onHover: id => { for (const b of list.children) b.classList.toggle('hover', b.dataset.id === id); },
  });
  viewer = v;
  const ld = document.getElementById('ovLoading'); ld.classList.add('done'); setTimeout(() => { ld.hidden = true; }, 450);
  route();
})();
