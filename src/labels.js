import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// ---------- Label & dimensi ----------
// Aksi label (klik / hover) diisi oleh main.js
export const tagHooks = { click: () => {}, enter: () => {}, leave: () => {} };

export function tag(text, part, opts = {}) {
  const el = document.createElement('div');
  el.className = 'tag'; el.dataset.part = part;
  el.innerHTML = `<i></i><b></b><span>${text}</span>`;
  el.style.pointerEvents = 'auto';
  el.addEventListener('click', () => tagHooks.click(part));
  el.addEventListener('pointerenter', () => tagHooks.enter(part));
  el.addEventListener('pointerleave', () => tagHooks.leave(part));
  const o = new CSS2DObject(el);
  o.center.set(0, 0.5);
  o.userData.isTag = true;
  o.userData.maxDist = opts.maxDist || 0;
  o.userData.xrayOnly = !!opts.xrayOnly;
  o.userData.when = opts.when || null;
  return o;
}

export const dimMat = new THREE.LineBasicMaterial({ color: 0x1d5fd6, depthTest: false, transparent: true });
export function dimension(a, b, tick, text, maxDist = 0) {
  const g = new THREE.Group(); g.userData.isDim = true;
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), T = new THREE.Vector3(...tick);
  const pts = [A, B, A.clone().sub(T), A.clone().add(T), B.clone().sub(T), B.clone().add(T)];
  const line = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), dimMat);
  line.renderOrder = 999;
  const el = document.createElement('div'); el.className = 'dim'; el.textContent = text;
  const lbl = new CSS2DObject(el); lbl.position.copy(A).add(B).multiplyScalar(0.5);
  lbl.userData.isDimLabel = true; lbl.userData.maxDist = maxDist;
  g.add(line, lbl);
  return g;
}
