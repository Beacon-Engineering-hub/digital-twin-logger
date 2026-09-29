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

// ---------- Jam hari (env.js ENV.hour) ----------
// Palet kunci per jam, diinterpolasi. Jam 16 = LIGHT di atas ("sore awal" yang dipilih user); siang = tema "day"
// proyek referensi; senja & malam dari tema "dusk" referensi, malam diterangi bulan kebiruan + bintang.
// Matahari terbit di timur (+x), lintasan sedikit condong ke selatan (+z), terbenam di barat (−x); bulan di seberangnya.
const NIGHT = { top: 0x050c20, hor: 0x22314f, bot: 0x0f1511, sun: 0xa3b8e8, sunI: 0.5, glow: 0.12, hemiSky: 0x5a72a8, hemiGround: 0x1d1d14, hemiI: 0.36, exposure: 1.45, envGround: 0x151c15, fog: [130, 1150], stars: 1 };
const KEYS = [
  [0, NIGHT],
  [4.6, NIGHT],
  [5.6, { top: 0x1a2c56, hor: 0xb88878, bot: 0x33342b, sun: 0xffa874, sunI: 0.6, glow: 0.9, hemiSky: 0x7a8cc0, hemiGround: 0x2c2a20, hemiI: 0.28, exposure: 1.18, envGround: 0x2c3224, fog: [150, 1300], stars: 0.35 }],
  [6.5, { top: 0x3764aa, hor: 0xf0b98c, bot: 0x5c5c44, sun: 0xffb478, sunI: 1.5, glow: 1.1, hemiSky: 0x9eb2dc, hemiGround: 0x4a4030, hemiI: 0.28, exposure: 1.06, envGround: 0x4d5034, fog: [160, 1400], stars: 0 }],
  [8.2, { top: 0x3570b8, hor: 0xe2dccb, bot: 0x7f8a68, sun: 0xffe3c0, sunI: 2.1, glow: 0.6, hemiSky: 0xb3c8ea, hemiGround: 0x57523a, hemiI: 0.28, exposure: 0.98, envGround: 0x5a5f3e, fog: [185, 1650], stars: 0 }],
  [12, { top: 0x3d7cc0, hor: 0xd3e1e8, bot: 0x8e9a78, sun: 0xfff0d8, sunI: 2.3, glow: 0.35, hemiSky: 0xd6e8ff, hemiGround: 0x5d5a3c, hemiI: 0.26, exposure: 0.95, envGround: 0x5a6640, fog: [200, 1800], stars: 0 }],
  [16, { ...LIGHT, stars: 0 }],
  [17.6, { top: 0x23447c, hor: 0xefa46c, bot: 0x5d5842, sun: 0xffa45c, sunI: 1.7, glow: 1.2, hemiSky: 0x9aa6d4, hemiGround: 0x4a3b28, hemiI: 0.28, exposure: 1.06, envGround: 0x4d4930, fog: [150, 1400], stars: 0 }],
  [18.45, { top: 0x13244c, hor: 0x8a6878, bot: 0x2e2e2a, sun: 0xffa070, sunI: 0.5, glow: 0.8, hemiSky: 0x8192c4, hemiGround: 0x2e2c22, hemiI: 0.3, exposure: 1.2, envGround: 0x2f3326, fog: [140, 1250], stars: 0.25 }],
  [19.6, NIGHT],
  [24, NIGHT],
];
const COLOR_KEYS = ['top', 'hor', 'bot', 'sun', 'hemiSky', 'hemiGround', 'envGround'];
const _ka = KEYS.map(([h, P]) => [h, { ...P, ...Object.fromEntries(COLOR_KEYS.map(k => [k, new THREE.Color(P[k])])) }]);
const _gray = new THREE.Color();
const grey = (c, k) => { const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; return c.lerp(_gray.setRGB(l * 0.86, l * 0.88, l * 0.92), k); };   // mendung: pudar ke abu-abu
// Palet pada jam h dengan mendung k (0..1) → warna linear + angka
export function paletteAt(h, k = 0, out = {}) {
  h = ((h % 24) + 24) % 24;
  let i = 1; while (i < _ka.length - 1 && h > _ka[i][0]) i++;
  const [h0, A] = _ka[i - 1], [h1, B] = _ka[i], t = h1 > h0 ? THREE.MathUtils.smoothstep(h, h0, h1) : 0;
  for (const c of COLOR_KEYS) grey((out[c] ??= new THREE.Color()).copy(A[c]).lerp(B[c], t), c === 'sun' ? 0.4 * k : 0.85 * k);
  const L = (a, b) => a + (b - a) * t;
  out.sunI = L(A.sunI, B.sunI) * (1 - 0.82 * k); out.glow = L(A.glow, B.glow) * (1 - k);
  out.hemiI = L(A.hemiI, B.hemiI) * (1 + 0.6 * k); out.exposure = L(A.exposure, B.exposure) + 0.05 * k;
  const night = 1 - THREE.MathUtils.clamp((Math.sin((h - 6) / 12 * Math.PI) + 0.1) / 0.25, 0, 1);
  out.hemiI *= 1 + 0.9 * k * night;                           // malam mendung: bulan tertutup → cahaya langit menggantikan (model tetap terbaca)
  out.fog = [L(A.fog[0], B.fog[0]) * (1 - 0.65 * k), L(A.fog[1], B.fog[1]) * (1 - 0.6 * k)];
  out.stars = L(A.stars, B.stars) * (1 - k);
  return out;
}
// Arah matahari & bulan (dunia) pada jam h. Jam 16 ≈ LIGHT.sunDir (± 25° dari barat-daya).
export function sunMoonDir(h, sun = new THREE.Vector3(), moon = new THREE.Vector3()) {
  const th = (h - 6) / 12 * Math.PI;
  sun.set(Math.cos(th), 0.85 * Math.sin(th), 0.28).normalize();
  moon.set(-Math.cos(th) * 0.9, -0.75 * Math.sin(th), 0.36).normalize();
  return { sun, moon };
}

const SKY_VS = 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const SKY_FS = `uniform vec3 top; uniform vec3 hor; uniform vec3 bot; uniform vec3 sunCol; uniform vec3 sunDir; uniform float glow;
uniform vec3 moonDir; uniform float stars; uniform float sunVis; varying vec3 vDir;
float hash3(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main(){ vec3 d = normalize(vDir); float h = d.y;
  vec3 c = h > 0.0 ? mix(hor, top, pow(min(h * 1.35, 1.0), 0.6)) : mix(hor, bot, min(-h * 5.0, 1.0));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  c += sunCol * (pow(s, 900.0) * 6.0 * sunVis + pow(s, 14.0) * glow * 0.55 + pow(s, 3.0) * glow * 0.18 * (1.0 - clamp(h * 3.0, 0.0, 1.0)));
  if (stars > 0.001 && h > 0.0) {                       // bintang (sel acak di bola langit) + bulan
    vec3 q = floor(d * 700.0); float n = hash3(q);
    c += vec3(0.85, 0.9, 1.0) * step(0.9982, n) * (0.35 + 0.65 * fract(n * 91.7)) * stars * smoothstep(0.0, 0.3, h);
    float m = max(dot(d, normalize(moonDir)), 0.0);
    c += vec3(0.9, 0.93, 1.0) * (smoothstep(0.9999, 0.99994, m) * 1.6 + pow(m, 90.0) * 0.07) * stars;
  }
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;
function skyMat(uniforms) {
  return new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false, uniforms });
}

// opts: shadowMax (setengah lebar kotak bayangan maks., m), fog ([near, far]) — untuk peta kawasan yang lebih luas
export function createPipeline({ renderer, scene, camera, controls, sun, hemi, shadowMax = LIGHT.shadowMax }) {
  const q = QUALITY, L = LIGHT, lightDir = new THREE.Vector3(...L.sunDir).normalize();
  const lastT = new THREE.Vector3(Infinity, 0, 0), lastDir = new THREE.Vector3();
  let lastR = 0, sky = null, maxR = shadowMax, pmrem = null, envScene = null, envGround = null, envRT = null, envKey = '', envAt = -1e9;
  const U = {                                           // uniform langit, dipakai bersama kubah & adegan peta lingkungan
    top: { value: new THREE.Color(L.top) }, hor: { value: new THREE.Color(L.hor) }, bot: { value: new THREE.Color(L.bot) },
    sunCol: { value: new THREE.Color(L.sun) }, sunDir: { value: lightDir.clone() }, glow: { value: L.glow },
    moonDir: { value: new THREE.Vector3(0, -1, 0) }, stars: { value: 0 }, sunVis: { value: 1 },
  };
  const P = {}, dirs = { sun: new THREE.Vector3(), moon: new THREE.Vector3() };
  const state = { night: 0, day: 1, light: new THREE.Color(1, 1, 1), hor: new THREE.Color(L.hor) };   // dibaca seri & cuaca
  renderer.shadowMap.autoUpdate = false;              // peta bayangan hanya dirender ulang saat ada perubahan

  // Kotak bayangan matahari mengikuti titik fokus kamera: dekat = bayangan tajam, jauh = mencakup pepohonan
  function fitShadow() {
    const d = camera.position.distanceTo(controls.target);
    let r = THREE.MathUtils.clamp(d * 0.75, 1, maxR);
    r = Math.pow(2, Math.ceil(Math.log2(r) * 2) / 2);        // bertingkat agar jarang dihitung ulang saat zoom
    const turned = lastDir.angleTo(lightDir) > 0.005;         // matahari / bulan bergeser > 0,3° (± 4× per detik pada 1 jam = 10 dtk)
    if (r === lastR && lastT.distanceToSquared(controls.target) < 1e-4 && !turned) return;
    lastR = r; lastT.copy(controls.target); lastDir.copy(lightDir);
    const cam = sun.shadow.camera;
    Object.assign(cam, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 220 + 2 * r });
    cam.updateProjectionMatrix();
    sun.target.position.copy(controls.target);
    sun.position.copy(controls.target).addScaledVector(lightDir, 110 + r);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = Math.min(0.03, (2 * r / q.shadowMap) * 1.5);
    renderer.shadowMap.needsUpdate = true;
  }
  function bakeEnv() {                                  // peta lingkungan dari langit saat ini
    envGround.material.color.copy(P.envGround ?? new THREE.Color(L.envGround));
    const rt = pmrem.fromScene(envScene, 0.02, 0.1, 200);
    scene.environment = rt.texture;
    envRT?.dispose(); envRT = rt;
  }

  return {
    state,
    // Sekali saat mulai: resolusi, bayangan, langit + peta lingkungan, kabut, matahari, tone mapping
    init() {
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.pixelRatio));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = L.exposure;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
      // Kubah langit (dipusatkan ke kamera tiap frame) + adegan kecil untuk memanggang peta lingkungan
      sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 32, 16), skyMat(U));
      sky.frustumCulled = false; sky.renderOrder = -1; sky.layers.set(LAYER.NO_AO); scene.add(sky);
      envScene = new THREE.Scene();
      envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMat(U)));
      envGround = new THREE.Mesh(new THREE.CircleGeometry(49, 32), new THREE.MeshBasicMaterial({ color: L.envGround, toneMapped: false }));
      envGround.rotation.x = -Math.PI / 2; envGround.position.y = -3; envScene.add(envGround);
      pmrem = new THREE.PMREMGenerator(renderer);
      bakeEnv();
      scene.background = null; scene.environmentIntensity = 1;
      scene.fog = new THREE.Fog(L.hor, ...L.fog); renderer.setClearColor(L.hor);
      sun.color.setHex(L.sun); sun.intensity = L.sunI * Math.PI;
      if (hemi) { hemi.color.setHex(L.hemiSky); hemi.groundColor.setHex(L.hemiGround); hemi.intensity = L.hemiI * Math.PI; }
      lastR = 0;
      renderer.shadowMap.needsUpdate = true;
    },
    // Jam hari & mendung (env.js) → langit, kabut, matahari / bulan, cahaya langit, eksposur, peta lingkungan
    setEnv(hour, cloud) {
      paletteAt(hour, cloud, P);
      sunMoonDir(hour, dirs.sun, dirs.moon);
      const useSun = dirs.sun.y > 0, D = useSun ? dirs.sun : dirs.moon;
      const k = THREE.MathUtils.smoothstep(D.y, 0, 0.12);                          // di cakrawala: cahaya langsung padam
      lightDir.copy(D);
      sun.color.copy(P.sun); sun.intensity = P.sunI * k * Math.PI;
      if (hemi) { hemi.color.copy(P.hemiSky); hemi.groundColor.copy(P.hemiGround); hemi.intensity = P.hemiI * Math.PI; }
      renderer.toneMappingExposure = P.exposure;
      scene.fog.color.copy(P.hor); scene.fog.near = P.fog[0]; scene.fog.far = P.fog[1]; renderer.setClearColor(P.hor);
      U.top.value.copy(P.top); U.hor.value.copy(P.hor); U.bot.value.copy(P.bot); U.sunCol.value.copy(P.sun);
      U.sunDir.value.copy(dirs.sun); U.moonDir.value.copy(dirs.moon); U.stars.value = P.stars;
      U.glow.value = P.glow * THREE.MathUtils.smoothstep(dirs.sun.y, -0.3, 0.02);
      U.sunVis.value = THREE.MathUtils.smoothstep(dirs.sun.y, -0.03, 0.02) * (1 - cloud);
      const day = THREE.MathUtils.smoothstep(dirs.sun.y, -0.12, 0.2);
      state.day = day; state.night = 1 - day; state.hor.copy(P.hor);
      state.light.copy(P.hemiSky).multiplyScalar(P.hemiI * 3).lerp(P.sun, 0.3);
      // peta lingkungan: dipanggang ulang bila langit berubah cukup (tiap 0,1 jam / 5 % mendung), maks. ± 3× per detik
      const key = `${Math.round(hour * 10)}|${Math.round(cloud * 20)}`, now = performance.now();
      if (key !== envKey && now - envAt > 330) { envKey = key; envAt = now; bakeEnv(); }
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
