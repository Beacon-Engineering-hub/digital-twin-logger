import * as THREE from 'three';

// Layer NO_AO = objek transparan / kartu (dulu dikecualikan dari AO). Dipertahankan untuk pengelompokan.
export const LAYER = { NO_AO: 1 };

// Kualitas render (satu-satunya). Tanpa post-processing: satu kali render langsung + MSAA, seperti proyek referensi.
export const QUALITY = { pixelRatio: 2, shadowMap: 2048 };

// Tampilan sinematik berbasis teknik proyek referensi irigasi-digital-twin (three/twinScene.ts): langit gradasi dengan
// cakram & pendar matahari, peta lingkungan dipanggang dari langit yang sama, kabut berwarna cakrawala, tone mapping ACES,
// bayangan lembut yang ikut titik fokus kamera. Suasana "sore awal": matahari rendah (± 25°) & hangat dari barat-daya →
// relief tebing tersorot menyamping & bayangan panjang; langit biru tua → cakrawala keemasan; cahaya langit kebiruan
// mengisi bayangan (kontras hangat–dingin); kabut hangat memberi kedalaman. Intensitas × π seperti referensi.
export const LIGHT = {
  top: 0x2a5a9e, hor: 0xecd3b2, bot: 0x7f8566, sun: 0xffd3a2, sunI: 2.2, sunDir: [-0.86, 0.42, 0.26], glow: 0.85,
  hemiSky: 0xa7bde6, hemiGround: 0x55492f, hemiI: 0.3, exposure: 1.02, envGround: 0x5b5a3a,
  fog: [170, 1500], shadowMax: 60,
};

const SKY_VS = 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const SKY_FS = `uniform vec3 top; uniform vec3 hor; uniform vec3 bot; uniform vec3 sunCol; uniform vec3 sunDir; uniform float glow; varying vec3 vDir;
void main(){ vec3 d = normalize(vDir); float h = d.y;
  vec3 c = h > 0.0 ? mix(hor, top, pow(min(h * 1.35, 1.0), 0.6)) : mix(hor, bot, min(-h * 5.0, 1.0));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  c += sunCol * (pow(s, 900.0) * 6.0 + pow(s, 14.0) * glow * 0.55 + pow(s, 3.0) * glow * 0.18 * (1.0 - clamp(h * 3.0, 0.0, 1.0)));
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;
function skyMat(L) {
  const col = h => new THREE.Color(h);                  // hex sRGB → linear (ColorManagement aktif)
  return new THREE.ShaderMaterial({
    vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    uniforms: { top: { value: col(L.top) }, hor: { value: col(L.hor) }, bot: { value: col(L.bot) }, sunCol: { value: col(L.sun) },
      sunDir: { value: new THREE.Vector3(...L.sunDir).normalize() }, glow: { value: L.glow } },
  });
}

// opts: shadowMax (setengah lebar kotak bayangan maks., m), fog ([near, far]) — untuk peta kawasan yang lebih luas
export function createPipeline({ renderer, scene, camera, controls, sun, hemi, shadowMax = LIGHT.shadowMax, fog = LIGHT.fog }) {
  const q = QUALITY, L = LIGHT, sunDir = new THREE.Vector3(...L.sunDir).normalize();
  const lastT = new THREE.Vector3(Infinity, 0, 0);
  let lastR = 0, sky = null, maxR = shadowMax;
  renderer.shadowMap.autoUpdate = false;              // peta bayangan hanya dirender ulang saat ada perubahan

  // Kotak bayangan matahari mengikuti titik fokus kamera: dekat = bayangan tajam, jauh = mencakup pepohonan
  function fitShadow() {
    const d = camera.position.distanceTo(controls.target);
    let r = THREE.MathUtils.clamp(d * 0.75, 1, maxR);
    r = Math.pow(2, Math.ceil(Math.log2(r) * 2) / 2);        // bertingkat agar jarang dihitung ulang saat zoom
    if (r === lastR && lastT.distanceToSquared(controls.target) < 1e-4) return;
    lastR = r; lastT.copy(controls.target);
    const cam = sun.shadow.camera;
    Object.assign(cam, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 220 + 2 * r });
    cam.updateProjectionMatrix();
    sun.target.position.copy(controls.target);
    sun.position.copy(controls.target).addScaledVector(sunDir, 110 + r);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = Math.min(0.03, (2 * r / q.shadowMap) * 1.5);
    renderer.shadowMap.needsUpdate = true;
  }

  return {
    // Sekali saat mulai: resolusi, bayangan, langit + peta lingkungan, kabut, matahari, tone mapping
    init() {
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.pixelRatio));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = L.exposure;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
      // Kubah langit (dipusatkan ke kamera tiap frame) + adegan kecil untuk memanggang peta lingkungan
      sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 32, 16), skyMat(L));
      sky.frustumCulled = false; sky.renderOrder = -1; sky.layers.set(LAYER.NO_AO); scene.add(sky);
      const envScene = new THREE.Scene();
      envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMat(L)));
      const envGround = new THREE.Mesh(new THREE.CircleGeometry(49, 32), new THREE.MeshBasicMaterial({ color: L.envGround, toneMapped: false }));
      envGround.rotation.x = -Math.PI / 2; envGround.position.y = -3; envScene.add(envGround);
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(envScene, 0.02, 0.1, 200).texture;
      pmrem.dispose();
      scene.background = null; scene.environmentIntensity = 1;
      scene.fog = new THREE.Fog(L.hor, ...fog); renderer.setClearColor(L.hor);
      sun.color.setHex(L.sun); sun.intensity = L.sunI * Math.PI;
      if (hemi) { hemi.color.setHex(L.hemiSky); hemi.groundColor.setHex(L.hemiGround); hemi.intensity = L.hemiI * Math.PI; }
      lastR = 0;
      renderer.shadowMap.needsUpdate = true;
    },
    setSize(w, h) { renderer.setSize(w, h); },
    setShadowMax(v) { if (v !== maxR) { maxR = v; lastR = 0; } },
    invalidateShadow() { renderer.shadowMap.needsUpdate = true; },
    render() {
      fitShadow();
      sky.position.copy(camera.position);
      renderer.render(scene, camera);
    },
  };
}
