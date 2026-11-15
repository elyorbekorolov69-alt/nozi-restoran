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

// host ichiga 3D ko'rinish quradi. Qaytaradi: { dispose() }. Model yuklanguncha host ichidagi rasm turadi.
export function show({ host, url, onReady, onFail }) {
  let dead = false, raf = 0;
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
