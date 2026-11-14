// NoZi zallari: 3D ko'rgich. Zal faqat ochilganda yuklanadi (index.html uni import() qiladi).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

const HALLS = {
  terrasa: { bg: 0xbcd9f5, far: 120, speed: 3.5, cam: [2.4, 1.6, -3.4], yaw: 0, pitch: 0 },
  kichik: { bg: 0x0c0c0c, far: 80, speed: 3, cam: [1.3, 1.55, -1.0], yaw: 0.12, pitch: -0.10 },
  katta: { bg: 0x0c0c0c, far: 90, speed: 4, cam: [0, 1.65, -1.6], yaw: 0, pitch: 0.04 },
};
const BASE = 1.2;

function unpack(buf) {
  const dv = new DataView(buf), hl = dv.getUint32(0, true);
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl)));
  let off = 4 + hl;
  const out = {};
  for (const p of head.parts) { out[p.n] = { t: p.t, b: buf.slice(off, off + p.len) }; off += p.len; }
  return { parts: out, cfg: head.cfg };
}

// shell: faqat zalning o'zi (devor, pol, shift, chiroq). Stol-stullarni sayt o'zi chizadi, kamerani ham sayt beradi (api.render).
const SHELL_HIDE = new Set(['Dasturxon', 'DasturxonChet', 'YashilYolak', 'QoraTemir', 'StulOq', 'StulKulrang', 'StulNaqsh']);

export async function start({ canvas, id, url, onProgress, shell }) {
  const H = HALLS[id];
  if (!H) throw new Error('zal yo‘q');
  const res = await fetch(url);
  if (!res.ok) throw new Error('fayl topilmadi');
  const total = Number(res.headers.get('content-length')) || 0;
  let buf;
  if (res.body && total && onProgress) {
    const rd = res.body.getReader(), chunks = []; let got = 0;
    for (;;) { const { done, value } = await rd.read(); if (done) break; chunks.push(value); got += value.length; onProgress(got / total); }
    const all = new Uint8Array(got); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
    buf = all.buffer;
  } else buf = await res.arrayBuffer();
  const { parts, cfg } = unpack(buf);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  let pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(H.bg);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.05, H.far);

  const loader = new GLTFLoader();
  const glb = n => new Promise((ok, no) => loader.parse(parts[n].b, '', ok, no));
  async function lightmap(n) {
    const bmp = await createImageBitmap(new Blob([parts[n].b], { type: 'image/jpeg' }));
    const t = new THREE.Texture(bmp);
    t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.channel = 1;
    t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  }

  const lit = [];
  let floorMat = null, mirrorMesh = null;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  function convert(root, lm) {
    root.traverse(o => {
      if (!o.isMesh) return;
      const s = o.material, n = s.name || '';
      const e = s.emissive ? (s.emissive.r + s.emissive.g + s.emissive.b) * (s.emissiveIntensity ?? 1) : 0;
      let m;
      if (lm && e > 0.05) {
        const em = s.emissiveMap || s.map || null;
        if (em) em.colorSpace = THREE.SRGBColorSpace;
        m = new THREE.MeshBasicMaterial({ map: em, color: em ? 0xffffff : 0xfffbf0, toneMapped: false });
      } else {
        if (s.map) { s.map.colorSpace = THREE.SRGBColorSpace; s.map.anisotropy = Math.min(8, maxAniso); }
        m = new THREE.MeshBasicMaterial({ map: s.map || null, color: s.color, toneMapped: false, side: s.side });
        if (lm && o.geometry.attributes.uv1) { m.lightMap = lm; m.lightMapIntensity = Math.PI * BASE; lit.push(m); }
      }
      m.name = n;
      if ((n.startsWith('Barg') || n.startsWith('Gul') || n === 'StulNaqsh') && m.map) { m.alphaTest = 0.5; m.side = THREE.DoubleSide; }
      if (n === 'PardaOq' || n === 'Visteriya') m.side = THREE.DoubleSide;
      if (n === 'Qadah') { m.transparent = true; m.opacity = 0.5; m.depthWrite = false; }
      if (n === 'Oyna') { m.transparent = true; m.opacity = 0.14; m.color.set(0xcfe8f0); m.depthWrite = false; m.side = THREE.DoubleSide; o.renderOrder = 3; }
      if (n === 'Kafel' || n === 'Parket') { floorMat = m; m.side = THREE.FrontSide; }
      if (n === 'Kozgu' || n === 'QoraOyna') mirrorMesh = o;
      if (n === 'YashilYolak') m.color.setRGB(0.045, 0.27, 0.15, THREE.SRGBColorSpace);
      if (n === 'Dasturxon') m.color.setRGB(0.93, 0.91, 0.82, THREE.SRGBColorSpace);
      if (n === 'Olov') m.color.set(0xffc060);
      o.material = m;
    });
  }

  const mat4 = new THREE.Matrix4();
  const furn = new THREE.Group();
  function instance(root, positions, master) {
    root.updateMatrixWorld(true);
    root.traverse(o => {
      if (!o.isMesh) return;
      const im = new THREE.InstancedMesh(o.geometry, o.material, positions.length);
      positions.forEach((p, i) => { mat4.makeTranslation(p[0] - master[0], 0, -(p[1] - master[1])); im.setMatrixAt(i, mat4.clone().multiply(o.matrixWorld)); });
      im.frustumCulled = false;
      if (o.material.transparent) im.renderOrder = 2;
      furn.add(im);
    });
  }

  let floorRefl = null, ceilRefl = null;
  let wallRefl = null, mirrorRT = null, mirrorCam = null, mirrorBox = null, mirrorFar = 60;
  let limit; // (nx, ny[, x0, y0]) -> bool, ny = -z (Blender y)

  if (id === 'terrasa') {
    const hall = await glb('HALL'), lmH = await lightmap('LMH'), outd = await glb('OUT');
    convert(hall.scene, lmH); convert(outd.scene, null);
    scene.add(hall.scene); scene.add(outd.scene);
    for (let gi = 0; gi < (shell ? 0 : cfg.groups.length); gi++) {
      const g = cfg.groups[gi], gl = await glb('G' + gi + 'glb'), lm = await lightmap('G' + gi + 'lm');
      convert(gl.scene, lm); instance(gl.scene, g.pos, g.master);
    }
    scene.add(furn);
    if (!shell) {
      floorRefl = new Reflector(new THREE.PlaneGeometry(13.5, 11.3), { textureWidth: 1024, textureHeight: 1024, clipBias: 0.003, color: 0xb0b0b0 });
      floorRefl.rotation.x = -Math.PI / 2; floorRefl.position.set(1.75, -0.004, -5.65); scene.add(floorRefl);
    }
    mirrorFar = 60;
    limit = (x, y) => {
      if (y >= 0.95 && y <= 7.2 && x >= -4.6 && x <= (y > 2.5 ? 6.4 : 7.2)) return true;
      if (x >= 0.35 && x <= 4.6 && y >= 7.0 && y <= 27.5) return true;
      if (x >= 5.5 && x <= 6.5 && y >= 7.0 && y <= 8.3) return true;
      if (x >= 4.6 && x <= 8.1 && y >= 8.2 && y <= 10.5) return true;
      return false;
    };
  } else if (id === 'kichik') {
    const hall = await glb('HALL'), fu = await glb('FURN'), setg = shell ? null : await glb('SET');
    const lmH = await lightmap('LMH'), lmF = await lightmap('LMF'), lmS = shell ? null : await lightmap('LMS');
    if (shell) fu.scene.traverse(o => { if (o.isMesh && SHELL_HIDE.has(o.material.name)) o.visible = false; });
    convert(hall.scene, lmH); convert(fu.scene, lmF); if (setg) convert(setg.scene, lmS);
    scene.add(hall.scene); scene.add(fu.scene);
    const SET_YS = [8.282, 8.847, 9.412, 9.976, 10.541, 11.106, 11.671, 12.235, 12.800, 13.365, 13.929, 14.494, 15.059, 15.624, 16.188, 16.753, 17.318];
    const mirrored = g => {
      const g2 = g.clone(); g2.scale(-1, 1, 1); const ix = g2.index;
      if (ix) for (let i = 0; i < ix.count; i += 3) { const b = ix.getX(i + 1), c = ix.getX(i + 2); ix.setX(i + 1, c); ix.setX(i + 2, b); }
      return g2;
    };
    if (setg) setg.scene.traverse(o => {
      if (!o.isMesh) return;
      const mR = new THREE.InstancedMesh(o.geometry, o.material, SET_YS.length), mL = new THREE.InstancedMesh(mirrored(o.geometry), o.material, SET_YS.length);
      SET_YS.forEach((y, i) => { mat4.makeTranslation(0.36, 0, -y); mR.setMatrixAt(i, mat4); mat4.makeTranslation(-0.36, 0, -y); mL.setMatrixAt(i, mat4); });
      [mR, mL].forEach(m => { m.frustumCulled = false; if (o.material.transparent) m.renderOrder = 2; furn.add(m); });
    });
    fu.scene.add(furn);
    if (!shell) {
      floorRefl = new Reflector(new THREE.PlaneGeometry(6, 20), { textureWidth: 1024, textureHeight: 1024, clipBias: 0.003, color: 0xbcbcbc });
      floorRefl.rotation.x = -Math.PI / 2; floorRefl.position.set(0, -0.004, -10); scene.add(floorRefl);
    }
    mirrorFar = 45;
    limit = (x, y) => Math.abs(x) <= 2.7 && y >= 0.3 && y <= 19.6;
    limit.xz = true;
  } else {
    const hall = await glb('HALL'), grp = shell ? null : await glb('GRP'), lmH = await lightmap('LMH'), lmG = shell ? null : await lightmap('LMG');
    convert(hall.scene, lmH); if (grp) convert(grp.scene, lmG);
    scene.add(hall.scene);
    if (grp) {
      const POS = [-5.25, -2.15, 2.15, 5.25].flatMap(x => [4.5, 9.0, 13.5, 18.0, 22.5].map(y => [x, y]));
      instance(grp.scene, POS, [2.15, 13.5]);
      scene.add(furn);
      ceilRefl = new Reflector(new THREE.PlaneGeometry(10.8, 30), { textureWidth: 1024, textureHeight: 1024, clipBias: 0.003, color: 0x6e7078 });
      ceilRefl.rotation.x = Math.PI / 2; ceilRefl.position.set(0, 4.996, -15); scene.add(ceilRefl);
      if (mirrorMesh) mirrorMesh.visible = false;
    }
    limit = (x, y) => {
      const niche = y > 15.5 && y < 18.8;
      return x >= (niche ? -9.0 : -6.5) && x <= 6.5 && y >= 0.5 && y <= 29;
    };
    limit.xz = true;
  }

  const floorOpacity = id === 'terrasa' ? 0.84 : 0.86;
  if (floorMat && floorRefl) { floorMat.transparent = true; floorMat.opacity = floorOpacity; }
  function setRefl(on) {
    if (floorRefl) { floorRefl.visible = on; if (floorMat) { floorMat.transparent = on; floorMat.opacity = on ? floorOpacity : 1; floorMat.needsUpdate = true; } }
    if (ceilRefl) { ceilRefl.visible = on; if (mirrorMesh) mirrorMesh.visible = !on; }
  }
  if (floorRefl && mirrorMesh) {
    mirrorBox = new THREE.Box3().setFromObject(mirrorMesh);
    const sz = mirrorBox.getSize(new THREE.Vector3()), ct = mirrorBox.getCenter(new THREE.Vector3());
    mirrorRT = new THREE.WebGLRenderTarget(768, id === 'terrasa' ? 640 : 512, { samples: 2 });
    const g = new THREE.PlaneGeometry(sz.x, sz.y);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    wallRefl = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: mirrorRT.texture, color: id === 'terrasa' ? 0xe6ecee : 0xeef2f4, toneMapped: false }));
    wallRefl.position.set(ct.x, ct.y, mirrorBox.max.z + 0.004);
    scene.add(wallRefl);
    mirrorMesh.visible = false;
    mirrorCam = new THREE.PerspectiveCamera(); mirrorCam.matrixAutoUpdate = false;
  }
  function renderMirror() {
    if (!wallRefl || !wallRefl.visible) return;
    const zm = wallRefl.position.z, d = camera.position.z - zm;
    if (d < 0.05) return;
    const ex = camera.position.x, ey = camera.position.y, ez = zm - d;
    const l = -(mirrorBox.max.x - ex), r = -(mirrorBox.min.x - ex), b = mirrorBox.min.y - ey, tp = mirrorBox.max.y - ey;
    mirrorCam.projectionMatrix.makePerspective(l, r, tp, b, d, d + mirrorFar);
    mirrorCam.projectionMatrixInverse.copy(mirrorCam.projectionMatrix).invert();
    mirrorCam.matrixWorld.makeRotationY(Math.PI).setPosition(ex, ey, ez);
    mirrorCam.matrixWorldInverse.copy(mirrorCam.matrixWorld).invert();
    const fr = floorRefl.visible; floorRefl.visible = false; wallRefl.visible = false;
    renderer.setRenderTarget(mirrorRT); renderer.render(scene, mirrorCam); renderer.setRenderTarget(null);
    floorRefl.visible = fr; wallRefl.visible = true;
  }
  function setMirror(on) { if (wallRefl) { wallRefl.visible = on; mirrorMesh.visible = !on; } }

  if (shell) {
    // kamerani sayt beradi: ko'z, nishon, nisbat
    if (floorMat) { floorMat.transparent = false; floorMat.opacity = 1; floorMat.needsUpdate = true; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    const eye = new THREE.Vector3(), tg = new THREE.Vector3();
    let rw = 0, rh = 0, live = true;
    return {
      render(e, t, asp) {
        if (!live) return;
        const w = canvas.clientWidth, h = canvas.clientHeight;
        if (!w || !h) return;
        if (w !== rw || h !== rh) { rw = w; rh = h; renderer.setSize(w, h, false); }
        camera.fov = 0.75 * 180 / Math.PI; camera.aspect = asp || w / h; camera.near = 0.1; camera.far = 300; camera.updateProjectionMatrix();
        eye.set(e[0], e[1], e[2]); tg.set(t[0], t[1], t[2]);
        camera.position.copy(eye); camera.up.set(0, 1, 0); camera.lookAt(tg);
        renderer.render(scene, camera);
      },
      dispose() {
        if (!live) return; live = false;
        scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map) m.map.dispose(); if (m.lightMap) m.lightMap.dispose(); m.dispose(); }); } });
        renderer.dispose(); try { renderer.forceContextLoss(); } catch (_) {}
      },
    };
  }

  // ---- harakat ----
  let yaw = H.yaw, pitch = H.pitch;
  camera.position.set(...H.cam);
  let dragging = false, lx = 0, ly = 0;
  const onDown = e => { dragging = true; lx = e.clientX; ly = e.clientY; try { canvas.setPointerCapture(e.pointerId); } catch (_) {} };
  const onUp = () => { dragging = false; };
  const onMove = e => {
    if (!dragging) return;
    yaw -= (e.clientX - lx) * 0.004; pitch -= (e.clientY - ly) * 0.004;
    pitch = Math.max(-1.2, Math.min(1.2, pitch)); lx = e.clientX; ly = e.clientY;
  };
  const keys = {};
  const onKD = e => { if (/^(INPUT|SELECT|TEXTAREA)$/.test((e.target && e.target.tagName) || '')) return; keys[e.code] = true; if (e.code.startsWith('Arrow')) e.preventDefault(); };
  const onKU = e => { keys[e.code] = false; };
  function moveBy(f, s) {
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    const x0 = camera.position.x, y0 = -camera.position.z;
    const nx = x0 + (-sin * f + cos * s), ny = y0 - (-cos * f - sin * s);
    if (limit(nx, ny)) { camera.position.x = nx; camera.position.z = -ny; }
    else if (limit(nx, y0)) camera.position.x = nx;
    else if (limit(x0, ny)) camera.position.z = -ny;
  }
  const onWheel = e => { moveBy(-e.deltaY * 0.004, 0); e.preventDefault(); };
  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointermove', onMove); canvas.addEventListener('wheel', onWheel, { passive: false });
  addEventListener('keydown', onKD); addEventListener('keyup', onKU);

  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

  const hold = { f: 0, s: 0 };
  let frames = 0, t0 = performance.now(), stage = 0, running = true;
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05), sp = H.speed * dt;
    let f = hold.f * sp, s = hold.s * sp;
    if (keys.KeyW || keys.ArrowUp) f += sp;
    if (keys.KeyS || keys.ArrowDown) f -= sp;
    if (keys.KeyD || keys.ArrowRight) s += sp;
    if (keys.KeyA || keys.ArrowLeft) s -= sp;
    if (f || s) moveBy(f, s);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    renderMirror();
    renderer.render(scene, camera);
    frames++;
    const now = performance.now();
    if (now - t0 >= 2500) {
      const fps = frames * 1000 / (now - t0); frames = 0; t0 = now;
      if (fps < 24 && document.visibilityState === 'visible') {
        if (stage === 0 && pixelRatio > 1) { pixelRatio = 1; renderer.setPixelRatio(1); resize(); }
        else if (stage === 1 && wallRefl) setMirror(false);
        else if (stage === 2) setRefl(false);
        stage++;
      }
    }
  });

  return {
    hold(f, s) { hold.f = f; hold.s = s; },
    light(k) { lit.forEach(m => m.lightMapIntensity = Math.PI * BASE * k); },
    dispose() {
      if (!running) return; running = false;
      renderer.setAnimationLoop(null); ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('wheel', onWheel);
      removeEventListener('keydown', onKD); removeEventListener('keyup', onKU);
      scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map) m.map.dispose(); if (m.lightMap) m.lightMap.dispose(); m.dispose(); }); } });
      renderer.dispose(); try { renderer.forceContextLoss(); } catch (_) {}
    },
  };
}
