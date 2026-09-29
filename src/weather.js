import * as THREE from 'three';
import { LAYER } from './render.js';

// Hujan tampak: garis-garis air jatuh (quad tipis instanced, menghadap kamera) di dalam kotak di depan kamera.
// Posisi dihitung di shader dari benih acak + waktu dan dibungkus (mod) di kotak → tanpa pembaruan CPU per tetes.
// Kotak membesar saat kamera menjauh (peta kawasan) sehingga kerapatan di layar tetap mirip; tebal garis ± 1,5 px.
// Kerapatan & opasitas mengikuti intensitas (mm/jam), arah miring mengikuti angin, warna mengikuti cahaya langit.
const N = 9000;
const VS = `attribute vec4 aSeed; uniform vec3 uCenter; uniform vec3 uCam; uniform float uBox; uniform float uTime;
uniform float uSpeed; uniform float uLen; uniform vec2 uWind; uniform float uCount; varying float vA; varying float vX;
void main(){
  vec3 p = aSeed.xyz * uBox;
  float sp = uSpeed * (0.85 + 0.3 * fract(aSeed.w * 13.7));
  p.y -= uTime * sp; p.xz += uWind * uTime;
  vec3 rel = mod(p - uCenter, uBox) - 0.5 * uBox;
  vec3 dir = normalize(vec3(uWind.x, -sp, uWind.y));
  vec3 P = uCenter + rel + dir * uLen * position.y;
  float d = distance(uCam, P);
  vec3 side = normalize(cross(dir, normalize(uCam - P)));
  P += side * position.x * max(0.004, d * 0.0017);
  vX = position.x * 2.0;
  vec3 e = abs(rel) / (0.5 * uBox);
  vA = step(aSeed.w, uCount) * (1.0 - smoothstep(0.7, 1.0, max(e.x, max(e.y, e.z)))) * smoothstep(0.4, 2.0, d) * (0.45 + 0.55 * fract(aSeed.w * 71.3));
  gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
}`;
const FS = `uniform vec3 uColor; uniform float uOpacity; varying float vA; varying float vX;
void main(){ float a = uOpacity * vA * (1.0 - vX * vX); if (a < 0.004) discard; gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;

export function createRain(scene) {
  const base = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);           // x −0,5..0,5 (lebar), y 0..1 (sepanjang tetes)
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.attributes.position);
  const seed = new Float32Array(N * 4);
  for (let i = 0; i < N * 4; i++) seed[i] = Math.random();
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4)); g.instanceCount = N;
  const U = {
    uCenter: { value: new THREE.Vector3() }, uCam: { value: new THREE.Vector3() }, uBox: { value: 30 }, uTime: { value: 0 },
    uSpeed: { value: 9 }, uLen: { value: 0.6 }, uWind: { value: new THREE.Vector2(0.8, 0.35) }, uCount: { value: 0 },
    uColor: { value: new THREE.Color(0xb8c6d0) }, uOpacity: { value: 0 },
  };
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: U, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
  m.frustumCulled = false; m.renderOrder = 8; m.layers.set(LAYER.NO_AO); m.visible = false;
  scene.add(m);
  let box = 30, t = 0;
  const fwd = new THREE.Vector3();
  return {
    // mmh = intensitas hujan tampak; light = warna cahaya langit (pipeline.state.light)
    update(dt, camera, target, mmh, light) {
      const k = THREE.MathUtils.clamp(mmh / 40, 0, 1);
      m.visible = mmh > 0.15;
      if (!m.visible) return;
      t = (t + dt) % 1000;
      const dist = camera.position.distanceTo(target);
      box += (THREE.MathUtils.clamp(dist * 0.55, 26, 140) - box) * Math.min(1, dt * 3);
      camera.getWorldDirection(fwd);
      U.uCenter.value.copy(camera.position).addScaledVector(fwd, box * 0.42);
      U.uCam.value.copy(camera.position); U.uBox.value = box; U.uTime.value = t;
      U.uLen.value = 0.45 + box * 0.012 + 0.4 * k;
      U.uCount.value = 0.12 + 0.88 * Math.sqrt(k);
      U.uOpacity.value = 0.26 + 0.34 * Math.sqrt(k);
      U.uWind.value.set(0.6 + 2.2 * k, 0.25 + 0.9 * k);
      U.uColor.value.setRGB(0.6, 0.66, 0.72).multiply(light).multiplyScalar(1.15);
    },
  };
}
