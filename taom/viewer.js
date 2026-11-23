// NoZi: taomning 3D modeli. Faqat taom tanlanganda yuklanadi (index.html uni import() qiladi).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

let loader = null;
function getLoader() {
  if (loader) return loader;
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/');
  loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  return loader;
}


// Issiq taomlar ustidan chiqadigan yengil bug (sprite'lar, GPU'ga og'ir emas).
const HOT = /\/(baliq2?|lyulya|qanot2?|kroket2?|sorva|tushonka|til|kolbasa)\.glb/;
function makeSteam(THREE, w, h) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const group = new THREE.Group(), items = [];
  for (let i = 0; i < 22; i++) {
    const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, color: 0xfff6e8 });
    const sp = new THREE.Sprite(m); group.add(sp);
    items.push({ sp, m, t: Math.random(), sp0: 0.16 + Math.random() * 0.1, x: (Math.random() - 0.5) * w * 0.5, z: (Math.random() - 0.5) * w * 0.5, ph: Math.random() * 6.28 });
  }
  const step = dt => {
    for (const it of items) {
      it.t += dt * it.sp0; if (it.t > 1) { it.t -= 1; it.x = (Math.random() - 0.5) * w * 0.5; it.z = (Math.random() - 0.5) * w * 0.5; }
      const k = it.t, sway = Math.sin(it.ph + k * 4) * w * 0.06;
      it.sp.position.set(it.x + sway, k * h * 1.6, it.z);
      const sz = w * (0.12 + k * 0.22); it.sp.scale.set(sz, sz, 1);
      it.m.opacity = Math.sin(Math.PI * k) * 0.42;
    }
  };
  return { group, step, dispose() { tex.dispose(); items.forEach(i => i.m.dispose()); } };
}

// host ichiga 3D ko'rinish quradi. Qaytaradi: { dispose() }. Model yuklanguncha host ichidagi rasm turadi.
export function show({ host, url, onReady, onFail }) {
  let dead = false, raf = 0, steam = null, last = performance.now();
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', 'Taomning 3D ko‘rinishi. Aylantirish uchun suring.');
  host.prepend(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(2, 3, 2); scene.add(sun);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 50);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.autoRotate = true; controls.autoRotateSpeed = 1.6;
  controls.enablePan = false;
  controls.minPolarAngle = 0.15; controls.maxPolarAngle = 1.45;
  controls.addEventListener('start', () => { controls.autoRotate = false; });

  const size = () => {
    const w = host.clientWidth || 300, h = host.clientHeight || 300;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  size();
  const ro = new ResizeObserver(size); ro.observe(host);

  const loop = () => {
    if (dead) return;
    if (!host.isConnected) { api.dispose(); return; }
    raf = requestAnimationFrame(loop);
    controls.update();
    const now = performance.now(); if (steam) steam.step(Math.min((now - last) / 1000, 0.1)); last = now;
    renderer.render(scene, camera);
  };

  let model = null;
  getLoader().load(url, gltf => {
    if (dead) { free(gltf.scene); return; }
    model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    model.position.sub(c);
    const r = Math.max(s.x, s.z) * 0.5 + s.y * 0.35;
    const dist = r / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.05;
    camera.position.set(0, dist * 0.62, dist * 0.82);
    controls.target.set(0, 0, 0);
    controls.minDistance = dist * 0.5; controls.maxDistance = dist * 1.8;
    controls.update();
    scene.add(model);
    if (HOT.test(url) && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      steam = makeSteam(THREE, Math.max(s.x, s.z), s.y); steam.group.position.set(0, s.y * 0.1, 0); scene.add(steam.group);
    }
    loop();
    if (onReady) onReady();
  }, undefined, err => { if (!dead && onFail) onFail(err); });

  function free(root) {
    root.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
        for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose(); }
        m.dispose();
      });
    });
  }
  const api = {
    dispose() {
      if (dead) return; dead = true;
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
      if (model) { scene.remove(model); free(model); }
      if (steam) steam.dispose();
      envTex.dispose(); pmrem.dispose();
      renderer.dispose(); renderer.forceContextLoss();
      canvas.remove();
    },
  };
  return api;
}

// Admin yuklagan .glb faylni tekshiradi va undan poster rasm (JPEG) oladi. Fayl ochilmasa xato tashlaydi.
export async function snapshot(file) {
  const url = URL.createObjectURL(file);
  try {
    const gltf = await new Promise((ok, no) => getLoader().load(url, ok, undefined, no));
    const W = 720, H = 560;
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(W, H, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0e1426);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environment = envTex;
    const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(2, 3, 2); scene.add(sun);
    const camera = new THREE.PerspectiveCamera(35, W / H, 0.05, 50);
    const model = gltf.scene, box = new THREE.Box3().setFromObject(model);
    if (box.isEmpty()) throw new Error('model bo‘sh');
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    model.position.sub(c); scene.add(model);
    const r = Math.max(s.x, s.z) * 0.5 + s.y * 0.35;
    const dist = r / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.05;
    camera.position.set(0, dist * 0.62, dist * 0.82); camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85));
    model.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { for (const k in m) { const t = m[k]; if (t && t.isTexture) t.dispose(); } m.dispose(); }); });
    envTex.dispose(); pmrem.dispose(); renderer.dispose(); renderer.forceContextLoss();
    return blob;
  } finally { URL.revokeObjectURL(url); }
}
