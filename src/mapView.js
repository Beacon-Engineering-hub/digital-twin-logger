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
  const ews = SITES['ews-longsor'], aw = SITES['awlr-sungai'], vn = SITES['vnotch'];
  const VIEWS = {
    // Pandangan default (dipilih user): dari atas sawah menghadap sungai & tebing — EWS, AWLR, pintu air, V-Notch sekaligus
    ikhtisar: { tgt: [56.07, -10, 17.49], off: [-156.51, 55.82, 158.67] },
    ews: { tgt: [ews.x, -3, ews.z + 6], off: [30, 16, 42] },
    awlr: { tgt: [aw.x + 2, aw.y, aw.z + 4], off: [-22, 13, 30] },
    vnotch: { tgt: [vn.x - 1, vn.y + 1, vn.z - 2], off: [-16, 11, -18] },         // kolam V-Notch di hulu saluran tersier
  };
  const viewPose = name => { const v = VIEWS[name], t = new V3(...v.tgt); return { p: new V3(...v.off).add(t), t }; };

  const _v = new V3();
  return {
    views: VIEWS, viewPose, pickAt, hover,
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
