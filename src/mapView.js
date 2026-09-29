import * as THREE from 'three';
import { SAWAH, SITES, worldHeight, zCrest, zRiver } from './world.js';

// Mode peta (halaman awal) di atas scene yang SAMA dengan tampilan per logger: kamera menjauh, penanda HTML stasiun
// (titik + kode + varian) & nama tempat diproyeksikan tiap frame (gaya referensi irigasi-digital-twin labels.ts),
// cincin sorot saat hover, klik penanda / stasiun → onOpen(id). Pandangan preset dalam koordinat dunia.
const V3 = THREE.Vector3;
const pickMat = new THREE.MeshBasicMaterial({ visible: false });                 // raycast tetap kena walau tak terlihat

export function createMap({ scene, camera, renderer, labelHost, products, onOpen, onHover }) {
  const stations = products.map(p => {
    const s = SITES[p.id], h = p.station?.height ?? 3;
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(2.6, h + 1.6, 2.6), pickMat);
    proxy.position.set(s.x, s.y + (h + 1.6) / 2 - 0.3, s.z); proxy.userData.id = p.id; scene.add(proxy);
    return { p, pos: new V3(s.x, s.y, s.z), top: s.y + h + 0.24, proxy, built: !!p.extend };
  });

  // ---------- Penanda ----------
  const labels = [];
  const ALIGN = { c: 'translate(-50%,calc(-100% - 4px))', m: 'translate(-50%,-50%)' };
  const addLabel = (el, v, align = 'm') => { el.hidden = true; labelHost.appendChild(el); labels.push({ el, v, align, vis: false }); return el; };
  const place = (text, x, z, cls = '', dy = 3) => { const el = document.createElement('span'); el.className = `ov-place ${cls}`; el.textContent = text; addLabel(el, new V3(x, worldHeight(x, z) + dy, z)); };
  place('Sungai', -60, zRiver(-60), 'river', 0.6); place('Sungai', 110, zRiver(110), 'river', 0.6);
  place('Bukit longsor', -45, zCrest(-45) - 16, '', 3); place('Jalan desa', -40, zCrest(-40) + 24, '', 1.5);
  for (const L of SAWAH.labels) place(L.text, L.x, L.z, '', L.dy);
  for (const s of stations) {
    const el = document.createElement('button');
    el.className = 'ov-tag'; el.dataset.st = 'good'; el.dataset.id = s.p.id;
    el.innerHTML = `<i class="dot"></i><b>${s.p.code}</b>${s.p.variant ? `<span>${s.p.variant}</span>` : ''}`;
    el.title = `${s.p.name || s.p.code}${s.p.variant ? ' · ' + s.p.variant : ''} — klik untuk masuk ke tampilan logger`;
    el.addEventListener('click', () => onOpen(s.p.id));
    el.addEventListener('pointerenter', () => hover(s.p.id)); el.addEventListener('pointerleave', () => hover(null));
    s.tag = addLabel(el, new V3(s.pos.x, s.top + 1.2, s.pos.z), 'c');
  }

  // ---------- Cincin sorot ----------
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.72, 1.95, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x19c3d0, opacity: 0.8, transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
  ring.renderOrder = 5; ring.visible = false; scene.add(ring);
  let hoverId = null, shown = false;
  const byId = id => stations.find(s => s.p.id === id);
  function hover(id) {
    hoverId = id;
    for (const s of stations) s.tag.classList.toggle('hover', s.p.id === id);
    renderer.domElement.style.cursor = id ? 'pointer' : '';
    onHover?.(id);
  }

  // ---------- Pilih di adegan ----------
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(), proxies = stations.map(s => s.proxy);
  function pickAt(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    ptr.set((ev.clientX - r.left) / r.width * 2 - 1, -(ev.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(ptr, camera);
    return ray.intersectObjects(proxies, false)[0]?.object.userData.id ?? null;
  }

  // ---------- Pandangan preset (dunia) ----------
  const ews = SITES['ews-longsor'], aw = SITES['awlr-sungai'], vn = SITES['vnotch'], hu = SITES['ews-banjir'], ar = SITES['arr'];
  const local = (s, [x, y, z]) => [x * Math.cos(s.rot) + z * Math.sin(s.rot), y, -x * Math.sin(s.rot) + z * Math.cos(s.rot)];   // lokal stasiun → arah dunia
  const VIEWS = {
    // Pandangan default (dipilih user): dari atas sawah menghadap sungai & tebing — EWS, AWLR, pintu air, V-Notch sekaligus
    ikhtisar: { tgt: [35.99, -11.95, 94.07], off: [-273.08, 145.98, 166.81] },
    // Pandangan per stasiun (dipilih user dari tangkapan layar), relatif terhadap letak stasiun
    ews: { tgt: [ews.x + 5.67, ews.y - 2.67, ews.z + 5.78], off: [17.39, 9.81, 22.65] },     // lereng T1–T5 & stasiun di puncak tebing
    awlr: { tgt: [aw.x + 9.86, aw.y - 0.02, aw.z + 0.38], off: [-23.49, 4.89, 3.85] },      // menyusuri sungai ke hulu, pintu air di seberang
    vnotch: { tgt: [vn.x + 3.21, vn.y + 0.67, vn.z + 0.33], off: [-13.3, 3.54, 2.59] },     // stasiun & kolam V-Notch, sungai & AWLR di latar
    // EWS Banjir: dari hilir di sisi darat — muka krangkeng, horn & lampu, lengan sensor di atas alur hulu
    hulu: { tgt: local(hu, [2.0, 1.8, 0.3]).map((v, i) => v + [hu.x, hu.y, hu.z][i]), off: local(hu, [-7.0, 4.4, 13.2]) },
    // ARR: dari sisi sawah — muka krangkeng, lengan & sensor hujan, saluran primer & tersier di latar
    arr: { tgt: local(ar, [0.35, 1.8, 0.2]).map((v, i) => v + [ar.x, ar.y, ar.z][i]), off: local(ar, [-4.6, 2.8, 8.4]) },
  };
  const viewPose = name => { const v = VIEWS[name], t = new V3(...v.tgt); return { p: new V3(...v.off).add(t), t }; };

  const _v = new V3();
  return {
    views: VIEWS, viewPose, pickAt, hover,
    setStatus(id, st) { const s = byId(id); if (s && st && s.tag.dataset.st !== st) s.tag.dataset.st = st; },   // warna titik (normal / waspada / …)
    setShown(on) { shown = on; if (!on) { for (const L of labels) { L.el.hidden = true; L.vis = false; } ring.visible = false; hover(null); } },
    update(now, w, h) {
      if (!shown) return;
      for (const L of labels) {
        _v.copy(L.v).project(camera);
        const vis = _v.z < 1 && Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05;
        if (vis) L.el.style.transform = `translate(${((_v.x * 0.5 + 0.5) * w).toFixed(1)}px,${((-_v.y * 0.5 + 0.5) * h).toFixed(1)}px) ${ALIGN[L.align]}`;
        if (vis !== L.vis) { L.el.hidden = !vis; L.vis = vis; }
      }
      const s = hoverId && byId(hoverId);
      ring.visible = !!s;
      if (s) { ring.position.set(s.pos.x, s.pos.y + 0.25, s.pos.z); ring.scale.setScalar(1 + 0.08 * Math.sin(now / 1000 * 3.2)); }
    },
  };
}
