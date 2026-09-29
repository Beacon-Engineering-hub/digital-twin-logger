// Daftar produk / seri stasiun. Semua memakai stasiun dasar yang sama (monopole 3" × 3 m + enclosure B&J 504020
// dalam krangkeng + panel surya + antipanjat + konektor SP21). Perbedaan tiap seri diisi di sini:
//   station  : ubah ukuran dasar (lihat STATION di config.js), mis. { height: 4 }
//   extend   : (model, ctx) => { ... }  tambah sensor / visual khusus ke model 3D
//   update   : (now, { camera, controls }) => true | 'redraw' | 'shadow' | false   animasi per frame: true = benda bergerak
//              (render cepat), 'redraw' = tampilan saja (kualitas penuh), 'shadow' = idem + bayangan ulang
//   panel    : (el, ctx) => { ... }     isi kontrol simulasi di panel samping (ctx: params, rebuild, invalidate, flyTo(pos, target))
//   envOpts  : opsi lingkungan dunia (world.js → buildEnvironment), mis. { terrain: false } bila seri membangun medannya sendiri
//   encYMax  : d => m, batas atas tinggi pasang box;  views: { iso: [[posisi], [target]] };  parts: info komponen tambahan
//   explode  : { steps: [{ key, before, w, label }], apply(model, seg, t) }
//   load     : () => import(...) — isi di atas dimuat terpisah saat produk dibuka (dashboard tetap ringan)
// Nama lengkap yang ditandai `confirm` masih perlu dikonfirmasi.
export const PRODUCTS = [
  { id: 'awlr-sungai', code: 'AWLR', variant: 'Sungai', name: 'Automatic Water Level Recorder', confirm: true, icon: 'wave',
    desc: 'Tiang 3" × 4 m, lengan sensor 3 m di atas sungai', status: 'Lengan + sensor',
    load: () => import('./products/awlrRiver.js').then(m => m.awlrRiver) },
  { id: 'awlr-sumur', code: 'AWLR', variant: 'Sumur Pantau', name: 'Automatic Water Level Recorder', confirm: true, icon: 'wave',
    desc: 'Pencatat tinggi muka air sumur' },
  { id: 'arr', code: 'ARR', name: 'Automatic Rainfall Recorder', confirm: true, icon: 'rain',
    desc: 'Pencatat curah hujan' },
  { id: 'awr', code: 'AWR', name: '', icon: 'station', desc: '' },
  { id: 'vnotch', code: 'V-Notch', name: 'Pengukur debit ambang V-Notch', confirm: true, icon: 'vnotch',
    desc: 'Sensor level di bracket dinding kolam, di atas takik V saluran limpasan sawah', status: 'Bracket + sensor',
    load: () => import('./products/vnotch.js').then(m => m.vnotch) },
  { id: 'ews-longsor', code: 'EWS', variant: 'Longsor', name: 'Early Warning System', confirm: true, icon: 'siren',
    desc: 'Stasiun di atas tebing, horn + standing light, 5 tiltmeter di lereng', status: 'Simulasi longsor',
    load: () => import('./products/ewsLandslide.js').then(m => m.ewsLandslide) },
];

export const productById = id => PRODUCTS.find(p => p.id === id);

// Ikon garis sederhana (24 × 24, stroke = currentColor)
export const ICONS = {
  wave: '<path d="M2 15c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/><path d="M2 20c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/><path d="M12 3v7m-3-3 3 3 3-3"/>',
  rain: '<path d="M7 14a4 4 0 0 1-.6-7.95A5 5 0 0 1 16 5.5a3.5 3.5 0 0 1 1 6.9"/><path d="M8 17l-1 3m5-4-1 3m5-4-1 3"/>',
  station: '<path d="M12 21V5"/><path d="M8 21h8"/><rect x="13.5" y="11" width="5" height="6" rx="1"/><path d="M6 3l6 2 6-2"/>',
  vnotch: '<path d="M3 5h6l3 7 3-7h6v14H3z"/><path d="M3 15h18" stroke-dasharray="2 2"/>',
  siren: '<path d="M7 18v-6a5 5 0 0 1 10 0v6"/><path d="M5 21h14v-3H5z"/><path d="M12 2v2m8 1-1.5 1.5M4 5l1.5 1.5"/>',
};
