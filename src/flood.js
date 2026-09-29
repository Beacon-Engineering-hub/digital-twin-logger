import * as THREE from 'three';
import { rng, waterNormalTexture } from './nature.js';
import { streakTexture } from './river.js';

// Genangan banjir: satu permukaan air keruh di lembah, grid dunia (x, d) dengan d = jarak dari sumbu sungai
// (+ ke arah sawah, − ke arah tebing). Tinggi titik = muka air sungai di x itu (ikut kemiringan sungai) + dh, 3 cm di
// bawah pita sungai agar tidak berebut kedalaman. Medan yang lebih tinggi menutupinya → luas genangan mengikuti bentuk
// lembah dengan sendirinya (sawah & jalan yang lebih rendah tergenang lebih dulu).
// Jangkauan (reach, m dari sumbu sungai) dibuka pelan saat air melewati tebing sungai → genangan tampak menjalar keluar
// dari sungai, lalu mundur lagi saat surut. Pinggirnya dipudarkan di ujung lembah (x).
// xDown / xUp = x dunia AWLR (hilir) & EWS Banjir (hulu): tinggi genangan berubah linear di antaranya (ikut muka air sungai)
export function buildFlood({ zRiver, riverAt, xDown, xUp, x0 = -420, x1 = 460, d0 = -80, d1 = 150 }) {
  const xs = []; for (let x = x0; x <= x1; x += 3) xs.push(x);
  const ds = []; for (let d = d0; d <= d1 + 1e-6; d += Math.abs(d) < 30 ? 2 : 4) ds.push(d);
  const nx = xs.length, nd = ds.length, pos = new Float32Array(nx * nd * 3), uv = new Float32Array(nx * nd * 2), aD = new Float32Array(nx * nd);
  xs.forEach((x, i) => {
    const y = riverAt(x) - 0.03, zc = zRiver(x);
    ds.forEach((d, j) => { const v = i * nd + j, z = zc + d; pos.set([x, y, z], v * 3); uv.set([d / 2.2, -x / 2.2], v * 2); aD[v] = d; });   // v searah arus (−x)
  });
  const idx = [];
  for (let i = 0; i < nx - 1; i++) for (let j = 0; j < nd - 1; j++) { const a = i * nd + j, b = a + 1, c = a + nd, e = c + 1; idx.push(a, b, c, b, e, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aD', new THREE.BufferAttribute(aD, 1)); g.setIndex(idx); g.computeVertexNormals();
  const wn = waterNormalTexture(0.35, 0.35), streak = streakTexture(rng(6060));   // riak lebar & garis arus seperti pita sungai
  const U = { uRiseD: { value: 0 }, uRiseU: { value: 0 }, uReach: { value: 0 } };
  const mat = new THREE.MeshStandardMaterial({ color: 0x7a6242, map: streak, normalMap: wn, normalScale: new THREE.Vector2(0.16, 0.16), roughness: 0.13, metalness: 0,
    envMapIntensity: 0.7, transparent: true, opacity: 0.95 });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'attribute float aD; uniform float uRiseD; uniform float uRiseU; varying float vD; varying float vWX;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
  transformed.y += mix(uRiseD, uRiseU, clamp((transformed.x - ${xDown.toFixed(2)}) / ${(xUp - xDown).toFixed(2)}, 0.0, 1.0)); vD = aD; vWX = transformed.x;`);
    sh.fragmentShader = 'uniform float uReach; varying float vD; varying float vWX;\n' + sh.fragmentShader.replace('#include <color_fragment>',
      `#include <color_fragment>
  float fEdge = (1.0 - smoothstep(uReach - 5.0, uReach, abs(vD))) * smoothstep(${x0.toFixed(1)}, ${(x0 + 60).toFixed(1)}, vWX) * (1.0 - smoothstep(${(x1 - 60).toFixed(1)}, ${x1.toFixed(1)}, vWX));
  if (fEdge <= 0.001) discard;
  diffuseColor.a *= fEdge;`);
  };
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true; m.frustumCulled = false; m.renderOrder = 0; m.visible = false; m.name = 'flood';
  let reach = 0;
  return {
    mesh: m, flows: [{ tex: streak, v: 0.35, g: 'flood' }, { tex: wn, v: 0.05, u: 0.012, g: 'flood' }],
    // dh / dhUp = muka air hilir / hulu (m dari normal), bank = dh mulai meluap, dt = detik nyata
    update(dh, dhUp, bank, dt) {
      const over = Math.max(dh, dhUp) - (bank - 0.08);
      const goal = over <= 0 ? 0 : THREE.MathUtils.clamp(8 + over / 0.45 * 150, 0, d1 + 10);
      reach += (goal - reach) * (1 - Math.exp(-dt / (goal > reach ? 2.5 : 1.8)));
      if (goal === 0 && reach < 0.5) reach = 0;
      U.uReach.value = reach; U.uRiseD.value = dh; U.uRiseU.value = dhUp;
      m.visible = reach > 0.3;
      return reach;
    },
  };
}
