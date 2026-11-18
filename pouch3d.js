// YESS 3D pouch stage
// Static image stays visible until WebGL is ready; any failure keeps the fallback.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const stage = document.getElementById('pouchStage');
const canvas = document.getElementById('pouchCanvas');
const caption = document.getElementById('stageCaption');
const chips = document.querySelectorAll('[data-stage-flavor]');

const FLAVOR_INFO = {
  carrot: { label: 'キャロット＆ビーツ味', price: '¥320', en: 'Carrot & Beets', accent: 'rgb(196, 86, 52)' },
  tomato: { label: 'トマト＆バジル味', price: '¥320', en: 'Tomato & Basil', accent: 'rgb(70, 140, 60)' }
};
const DEFAULT_CAPTION = '左右にドラッグで回転、タップで手前に';

if (stage && canvas) {
  init().catch(() => {
    // Keep the static fallback image.
  });
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Pillow pouch: flat crimped seals top and bottom, inflated body that pinches the sides.
function buildPouchGeometry(width, height) {
  const geometry = new THREE.PlaneGeometry(width, height, 48, 110);
  const pos = geometry.attributes.position;
  const depth = 0.14;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const u = x / width + 0.5;
    const v = y / height + 0.5;
    const sy = smoothstep(0.075, 0.22, v) * (1 - smoothstep(0.79, 0.925, v));
    const sx = Math.pow(Math.sin(Math.PI * u), 0.5);
    const puff = sx * sy;
    const wrinkle = 0.0035 * Math.sin(v * 46 + u * 9) * puff;
    pos.setZ(i, depth * puff + wrinkle);
    pos.setX(i, x * (1 - 0.05 * sy));
  }
  geometry.computeVertexNormals();
  return geometry;
}

function makeBackTexture(info) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 1160;
  const ctx = c.getContext('2d');
  const cream = 'rgb(236, 228, 216)';
  ctx.fillStyle = cream;
  ctx.fillRect(0, 0, c.width, c.height);

  // Crimp bands
  const band = c.height * 0.075;
  ctx.fillStyle = 'rgb(226, 217, 204)';
  ctx.fillRect(0, 0, c.width, band);
  ctx.fillRect(0, c.height - band, c.width, band);
  ctx.strokeStyle = 'rgba(80, 60, 40, 0.10)';
  ctx.lineWidth = 2;
  for (let x = 0; x < c.width; x += 8) {
    ctx.beginPath();
    ctx.moveTo(x, 6);
    ctx.lineTo(x, band - 6);
    ctx.moveTo(x, c.height - band + 6);
    ctx.lineTo(x, c.height - 6);
    ctx.stroke();
  }

  // Center fin seal
  ctx.fillStyle = 'rgb(224, 214, 200)';
  ctx.fillRect(c.width / 2 - 20, 0, 40, c.height);
  ctx.strokeStyle = 'rgba(80, 60, 40, 0.08)';
  for (let y = 0; y < c.height; y += 10) {
    ctx.beginPath();
    ctx.moveTo(c.width / 2 - 20, y);
    ctx.lineTo(c.width / 2 + 20, y);
    ctx.stroke();
  }

  // Label panel
  const px = 56;
  const py = 230;
  const pw = c.width - px * 2;
  const ph = 640;
  ctx.fillStyle = 'rgb(246, 241, 233)';
  ctx.fillRect(px, py, pw, ph);
  ctx.fillStyle = info.accent;
  ctx.fillRect(px, py, pw, 10);

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgb(140, 176, 206)';
  ctx.font = '300 104px "Plus Jakarta Sans", "Noto Sans JP", sans-serif';
  ctx.fillText('YESS', c.width / 2, py + 140);

  ctx.fillStyle = 'rgb(70, 52, 40)';
  ctx.font = '800 40px "Noto Sans JP", sans-serif';
  ctx.fillText(info.label, c.width / 2, py + 230);
  ctx.font = '700 26px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(info.en, c.width / 2, py + 274);

  ctx.strokeStyle = 'rgba(70, 52, 40, 0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px + 40, py + 320);
  ctx.lineTo(px + pw - 40, py + 320);
  ctx.stroke();

  ctx.font = '500 26px "Noto Sans JP", sans-serif';
  ctx.fillStyle = 'rgb(96, 78, 64)';
  const lines = ['1袋でサラダ1杯相当の野菜', '8粒入り・60g（一口バー）', '常温保存', '試作パッケージ'];
  lines.forEach((line, i) => ctx.fillText(line, c.width / 2, py + 380 + i * 54));

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeShadowTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(60, 40, 25, 0.38)');
  g.addColorStop(0.55, 'rgba(60, 40, 25, 0.12)');
  g.addColorStop(1, 'rgba(60, 40, 25, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

async function init() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch (_) {
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.85;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 0.1, 5.6);

  const key = new THREE.DirectionalLight(0xffffff, 1.3);
  key.position.set(2.5, 3, 4);
  const rim = new THREE.DirectionalLight(0xfff1e0, 0.8);
  rim.position.set(-3, 1.5, -2);
  scene.add(key, rim);

  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  const loader = new THREE.TextureLoader();
  const [carrotTex, tomatoTex] = await Promise.all([
    loader.loadAsync('assets/pouch-carrot.jpg'),
    loader.loadAsync('assets/pouch-tomato.jpg')
  ]);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  [carrotTex, tomatoTex].forEach((t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = aniso;
  });

  const W = 1;
  const H = 643 / 284;
  const geometry = buildPouchGeometry(W, H);
  const shadowTex = makeShadowTexture();
  const shadowGeo = new THREE.PlaneGeometry(1.5, 0.6);

  function makePouch(flavor, frontTex, homeX, homeRot) {
    const group = new THREE.Group();
    const frontMat = new THREE.MeshStandardMaterial({ map: frontTex, roughness: 0.6, metalness: 0 });
    const backMat = new THREE.MeshStandardMaterial({ map: makeBackTexture(FLAVOR_INFO[flavor]), roughness: 0.65, metalness: 0 });
    const front = new THREE.Mesh(geometry, frontMat);
    const back = new THREE.Mesh(geometry, backMat);
    back.rotation.y = Math.PI;
    front.userData.flavor = flavor;
    back.userData.flavor = flavor;
    group.add(front, back);

    const shadow = new THREE.Mesh(
      shadowGeo,
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(homeX, -H / 2 - 0.12, 0);
    scene.add(group, shadow);

    return {
      flavor,
      group,
      shadow,
      pickables: [front, back],
      home: { x: homeX, rot: homeRot },
      cur: { x: homeX, z: 0, rot: homeRot, scale: 1 },
      phase: flavor === 'carrot' ? 0 : 1.7
    };
  }

  const pouches = [
    makePouch('carrot', carrotTex, -0.66, 0.26),
    makePouch('tomato', tomatoTex, 0.66, -0.26)
  ];
  const pickables = pouches.flatMap((p) => p.pickables);

  const state = {
    focus: null,
    flipped: false,
    flipAngle: 0,
    dragRot: 0,
    dragging: false,
    startX: 0,
    lastX: 0,
    moved: 0,
    dragReported: false
  };

  const flipBtn = document.getElementById('stageFlipBtn');

  function setFocus(flavor) {
    state.focus = state.focus === flavor ? null : flavor;
    chips.forEach((chip) => {
      chip.setAttribute('aria-pressed', String(chip.dataset.stageFlavor === state.focus));
    });
    if (caption) {
      caption.textContent = state.focus
        ? `${FLAVOR_INFO[state.focus].label} ${FLAVOR_INFO[state.focus].price}（1袋・税込）`
        : DEFAULT_CAPTION;
    }
    if (state.focus) {
      document.dispatchEvent(new CustomEvent('yess:pouch-interact', { detail: { action: `focus:${state.focus}` } }));
    }
  }

  chips.forEach((chip) => {
    chip.addEventListener('click', () => setFocus(chip.dataset.stageFlavor));
  });

  if (flipBtn) {
    flipBtn.addEventListener('click', () => {
      state.flipped = !state.flipped;
      flipBtn.setAttribute('aria-pressed', String(state.flipped));
      document.dispatchEvent(new CustomEvent('yess:pouch-interact', { detail: { action: `flip:${state.flipped ? 'back' : 'front'}` } }));
    });
  }

  // Pointer: horizontal drag rotates, a short tap brings a pouch forward.
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function pick(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    return hits.length ? hits[0].object.userData.flavor : null;
  }

  canvas.addEventListener('pointerdown', (event) => {
    state.dragging = true;
    state.startX = event.clientX;
    state.lastX = event.clientX;
    state.moved = 0;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!state.dragging) {
      canvas.style.cursor = pick(event) ? 'pointer' : 'grab';
      return;
    }
    const dx = event.clientX - state.lastX;
    state.lastX = event.clientX;
    state.moved = Math.max(state.moved, Math.abs(event.clientX - state.startX));
    state.dragRot += dx * 0.012;
    if (state.moved > 12 && !state.dragReported) {
      state.dragReported = true;
      document.dispatchEvent(new CustomEvent('yess:pouch-interact', { detail: { action: 'drag' } }));
    }
  });

  function endDrag(event) {
    if (!state.dragging) return;
    state.dragging = false;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (state.moved < 6) {
      const hit = pick(event);
      if (hit) setFocus(hit);
    }
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // Sizing
  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const needH = 3.0 / (2 * tanHalf);
    const needW = 2.9 / (2 * tanHalf * camera.aspect);
    camera.position.z = Math.max(needH, needW);
    camera.updateProjectionMatrix();
  }
  const viewport = document.getElementById('pouchViewport') || stage;
  new ResizeObserver(resize).observe(viewport);
  resize();

  // Animation
  const timer = new THREE.Timer();
  timer.connect(document);

  function damp(current, target, lambda, dt) {
    return THREE.MathUtils.damp(current, target, lambda, dt);
  }

  function animate() {
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.05);
    const t = timer.getElapsed();

    if (!state.dragging) {
      state.dragRot = damp(state.dragRot, 0, 1.6, dt);
    }
    state.flipAngle = damp(state.flipAngle, state.flipped ? Math.PI : 0, 5, dt);

    pouches.forEach((p) => {
      const focused = state.focus === p.flavor;
      const other = state.focus && !focused;
      const targetX = focused ? p.home.x * 0.35 : other ? p.home.x * 1.15 : p.home.x;
      const targetZ = focused ? 0.7 : other ? -0.45 : 0;
      const targetRot = (focused ? 0 : p.home.rot) + state.dragRot + state.flipAngle;
      const sway = reduceMotion ? 0 : Math.sin(t * 0.6 + p.phase) * 0.08;
      const bob = reduceMotion ? 0 : Math.sin(t * 1.1 + p.phase) * 0.04;

      p.cur.x = damp(p.cur.x, targetX, 5, dt);
      p.cur.z = damp(p.cur.z, targetZ, 5, dt);
      p.cur.rot = damp(p.cur.rot, targetRot, 6, dt);

      p.group.position.set(p.cur.x, bob, p.cur.z);
      p.group.rotation.set(0.04, p.cur.rot + sway, 0);

      p.shadow.position.x = p.cur.x;
      p.shadow.position.z = p.cur.z;
      p.shadow.material.opacity = 0.9 - bob * 3;
    });

    renderer.render(scene, camera);
  }

  // Render only while the stage is on screen.
  let running = false;
  const io = new IntersectionObserver((entries) => {
    const visible = entries.some((e) => e.isIntersecting);
    if (visible && !running) {
      running = true;
      renderer.setAnimationLoop(animate);
    } else if (!visible && running) {
      running = false;
      renderer.setAnimationLoop(null);
    }
  });
  io.observe(stage);

  animate();
  stage.classList.add('is-3d-ready');
}
