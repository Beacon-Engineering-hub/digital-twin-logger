import * as THREE from 'three';
import { ENC } from './config.js';
import { cellTexture, concreteTex, corrugTex, perforationTex, threadTex } from './textures.js';

export const MAT = {
  galv:     () => new THREE.MeshStandardMaterial({ color: 0xc5cacf, metalness: 0.85, roughness: 0.32 }),
  plate:    () => new THREE.MeshStandardMaterial({ color: 0xb3b9bf, metalness: 0.8, roughness: 0.42 }),
  weld:     () => new THREE.MeshStandardMaterial({ color: 0x8f959b, metalness: 0.7, roughness: 0.6 }),
  bolt:     () => new THREE.MeshStandardMaterial({ color: 0x8e949a, metalness: 0.9, roughness: 0.38 }),
  thread:   (len) => { const t = threadTex.clone(); t.needsUpdate = true; t.repeat.set(1, len / 0.003);
              return new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.9, roughness: 0.35, bumpMap: t, bumpScale: 1.2 }); },
  nut:      () => new THREE.MeshStandardMaterial({ color: 0xa3a9af, metalness: 0.9, roughness: 0.3 }),
  concrete: () => new THREE.MeshStandardMaterial({ color: 0xffffff, map: concreteTex, roughness: 0.95, metalness: 0 }),
  grout:    () => new THREE.MeshStandardMaterial({ color: 0x8e8a82, roughness: 0.9 }),
  encBody:  () => new THREE.MeshStandardMaterial({ color: 0xd2d4ce, metalness: 0.02, roughness: 0.6 }),
  hinge:    () => new THREE.MeshStandardMaterial({ color: 0xbcbfb9, metalness: 0.02, roughness: 0.5 }),
  latch:    () => new THREE.MeshStandardMaterial({ color: 0xa9ada7, metalness: 0.02, roughness: 0.45 }),
  perfPlate:() => new THREE.MeshStandardMaterial({ color: 0xc9c7bd, metalness: 0.7, roughness: 0.4,
                    alphaMap: perforationTex(ENC.mp.w, ENC.mp.h), alphaTest: 0.5, side: THREE.DoubleSide }),
  rubber:   () => new THREE.MeshStandardMaterial({ color: 0x1e2022, roughness: 0.85 }),
  plastic:  () => new THREE.MeshStandardMaterial({ color: 0x2b2e32, roughness: 0.5 }),
  pvc:      () => new THREE.MeshStandardMaterial({ color: 0xd4d7da, roughness: 0.55 }),
  whitePl:  () => new THREE.MeshStandardMaterial({ color: 0xf1f2ee, roughness: 0.5 }),
  face:     (tex) => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }),
  blackMt:  () => new THREE.MeshStandardMaterial({ color: 0x1b1d20, metalness: 0.5, roughness: 0.5 }),
  duct:     () => new THREE.MeshStandardMaterial({ color: 0x9da2a6, roughness: 0.6 }),
  ductSlot: () => new THREE.MeshStandardMaterial({ color: 0x4d5155, roughness: 0.8 }),
  green:    () => new THREE.MeshStandardMaterial({ color: 0x2fa84f, roughness: 0.5 }),
  yellow:   () => new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.5 }),
  orange:   () => new THREE.MeshStandardMaterial({ color: 0xe06c1b, roughness: 0.5 }),
  wagoGr:   () => new THREE.MeshStandardMaterial({ color: 0xa7adb2, roughness: 0.55 }),
  batt:     () => new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.65 }),
  battLid:  () => new THREE.MeshStandardMaterial({ color: 0x202226, roughness: 0.5 }),
  red:      () => new THREE.MeshStandardMaterial({ color: 0xd62b2b, roughness: 0.5 }),
  wire:     (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45 }),
  paint:    () => new THREE.MeshStandardMaterial({ color: 0x1c5cc7, metalness: 0.15, roughness: 0.42 }),
  alu:      () => new THREE.MeshStandardMaterial({ color: 0xc3c7cb, metalness: 0.7, roughness: 0.35 }),
  rod:      () => new THREE.MeshStandardMaterial({ color: 0x2f3337, metalness: 0.55, roughness: 0.55 }),
  brass:    () => new THREE.MeshStandardMaterial({ color: 0xc9a13f, metalness: 0.85, roughness: 0.3 }),
  flexConduit: (len) => { const t = corrugTex.clone(); t.needsUpdate = true; t.repeat.set(len / 0.004, 1);
              return new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.55, bumpMap: t, bumpScale: 1.5 }); },
  cells:    (w, d) => new THREE.MeshStandardMaterial({ map: cellTexture(w, d), metalness: 0.3, roughness: 0.2 }),
};
