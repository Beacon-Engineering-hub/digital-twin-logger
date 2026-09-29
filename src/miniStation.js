import * as THREE from 'three';

// Miniatur stasiun untuk peta kawasan (ringan, ukuran nyata): pondasi, tiang monopole biru, krangkeng + box, panel surya,
// antipanjat; tambahan per seri yang sudah dimodelkan: lengan sensor AWLR Sungai, bracket horn + standing light EWS.
// Detail lengkap ada di tampilan per logger (main.js). Lokal: muka krangkeng & panel menghadap +z.
const M = {
  blue: new THREE.MeshStandardMaterial({ color: 0x1c5cc7, metalness: 0.15, roughness: 0.42 }),
  conc: new THREE.MeshStandardMaterial({ color: 0xc9c6bd, roughness: 0.95 }),
  box: new THREE.MeshStandardMaterial({ color: 0xd2d4ce, roughness: 0.6 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x2f3337, metalness: 0.5, roughness: 0.55 }),
  cells: new THREE.MeshStandardMaterial({ color: 0x1b2f5c, metalness: 0.3, roughness: 0.25 }),
  alu: new THREE.MeshStandardMaterial({ color: 0xc3c7cb, metalness: 0.7, roughness: 0.35 }),
  horn: new THREE.MeshStandardMaterial({ color: 0xdcdad2, roughness: 0.45 }),
  lamp: [0x35e06a, 0xffb81f, 0xff3b30].map(c => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.25, roughness: 0.3 })),
};
const cageEdge = new THREE.LineBasicMaterial({ color: 0x1c5cc7 });

export function buildMiniStation(kind, { height = 3 } = {}) {
  const g = new THREE.Group(), add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  const yB = 0.24, yTop = yB + height, ro = 0.0445, encY = 1.5;
  add(new THREE.BoxGeometry(0.8, 1.0, 0.8), M.conc, 0, -0.3, 0);                         // pondasi (0,2 m di atas tanah)
  add(new THREE.BoxGeometry(0.25, 0.012, 0.25), M.blue, 0, yB - 0.006, 0);                // base plate
  add(new THREE.CylinderGeometry(ro, ro, height, 16), M.blue, 0, yB + height / 2, 0);    // tiang
  // krangkeng (rangka biru) + enclosure
  const cz = ro + 0.005 + 0.16;
  const cage = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.57, 0.72, 0.32)), cageEdge);
  cage.position.set(0, encY, cz); g.add(cage);
  add(new THREE.BoxGeometry(0.57, 0.72, 0.32), new THREE.MeshStandardMaterial({ color: 0x1c5cc7, transparent: true, opacity: 0.25, depthWrite: false }), 0, encY, cz).castShadow = false;
  add(new THREE.BoxGeometry(0.41, 0.51, 0.2), M.box, 0, encY, cz);
  // antipanjat
  const acY = yTop - 0.9;
  add(new THREE.CylinderGeometry(ro + 0.008, ro + 0.008, 0.1, 16), M.dark, 0, acY, 0);
  for (let i = 0; i < 8; i++) {
    const a = (i + 0.5) / 8 * Math.PI * 2, s = add(new THREE.CylinderGeometry(0.006, 0.006, 0.3, 5), M.dark, Math.cos(a) * 0.17, acY - 0.06, Math.sin(a) * 0.17);
    s.rotation.set(Math.sin(a) * 1.0, 0, -Math.cos(a) * 1.0);
  }
  // panel surya di ujung tiang, miring 15° menghadap +z
  const pv = new THREE.Group(); pv.position.set(0, yTop - 0.1, 0.33); pv.rotation.x = THREE.MathUtils.degToRad(15); g.add(pv);
  const pf = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.035, 0.67), M.alu); pf.castShadow = true; pv.add(pf);
  const pc = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.036, 0.63), M.cells); pc.position.y = 0.001; pv.add(pc);
  add(new THREE.BoxGeometry(0.2, 0.2, 0.01), M.alu, 0, yTop - 0.18, -ro - 0.005);         // bracket
  add(new THREE.CylinderGeometry(ro + 0.003, ro + 0.003, 0.01, 16), M.blue, 0, yTop + 0.005, 0);   // pole cap

  if (kind === 'awlr-sungai') {                          // lengan 2 pipa 3 m ke +x di atas krangkeng + sensor radar
    const yA = encY + 0.36 + 0.15 + 0.09;
    for (const [y, L] of [[yA, 3.1], [yA + 0.14, 3.0]]) {
      const p = add(new THREE.CylinderGeometry(0.021, 0.021, L, 8), M.blue, L / 2 + 0.05, y, 0); p.rotation.z = Math.PI / 2;
    }
    add(new THREE.CylinderGeometry(0.057, 0.057, 0.3, 12), M.blue, 0, yA + 0.05, 0);
    add(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 12), new THREE.MeshStandardMaterial({ color: 0x4f9fd6, roughness: 0.45 }), 3.2, yA - 0.02, 0);
    add(new THREE.CylinderGeometry(0.024, 0.048, 0.26, 12), M.alu, 3.2, yA - 0.2, 0);
  }
  if (kind === 'ews-longsor') {                          // bracket di bawah panel: standing light (kiri) + horn (kanan)
    const yA = yTop - 0.64;
    const arm = add(new THREE.BoxGeometry(1.2, 0.04, 0.04), M.blue, 0, yA, 0.07);
    arm.castShadow = true;
    M.lamp.forEach((m, i) => add(new THREE.CylinderGeometry(0.03, 0.03, 0.055, 12), m, -0.56, yA + 0.07 + i * 0.06, 0.07));
    const h = add(new THREE.CylinderGeometry(0.12, 0.035, 0.26, 16, 1, true), M.horn, 0.5, yA + 0.17, 0.2); h.rotation.x = Math.PI / 2 - 0.17;
    h.material.side = THREE.DoubleSide;
  }
  return { group: g, top: yTop };
}

// Proxy pilih tak terlihat (raycast tetap kena walau material.visible = false)
export const pickMat = new THREE.MeshBasicMaterial({ visible: false });
