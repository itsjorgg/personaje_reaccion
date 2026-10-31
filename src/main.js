import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';
import './style.css';

/* ───────── 1. AJUSTES: aquí "afinas" la sensación ───────── */
const MODEL_URL = `${import.meta.env.BASE_URL}modelos/willie.glb`;

const MAX_YAW = 1.1;    // giro total (rad) con el mouse en el borde horizontal (~63°)
const MAX_PITCH = 0.5;  // mirar arriba/abajo (~29°)
const STEP_FPS = 12;    // pose "en doses" como en 1928. Pon 0 para movimiento fluido

// Ejes locales de los huesos. Si algo gira raro, cambia ejes o signos.
const YAW_AXIS = new THREE.Vector3(0, 1, 0);
const PITCH_AXIS = new THREE.Vector3(1, 0, 0);
const YAW_SIGN = 1;
const PITCH_SIGN = 1;

// De arriba hacia abajo.
// yawW / pitchW = qué fracción del giro total aporta cada hueso (cada columna suma 1) → "cuánto"
// speed         = qué tan rápido persigue al mouse (mayor = antes)                    → "cuándo"
// Los nombres (regex) son para rigs de Mixamo; ajústalos a tu modelo.
const CHAIN = [
  { key: 'head',   match: /head$/i,   yawW: 0.30, pitchW: 0.45, speed: 14 },
  { key: 'neck',   match: /neck$/i,   yawW: 0.20, pitchW: 0.30, speed: 11 },
  { key: 'spine2', match: /spine2$/i, yawW: 0.16, pitchW: 0.12, speed: 8 },
  { key: 'spine1', match: /spine1$/i, yawW: 0.14, pitchW: 0.08, speed: 6 },
  { key: 'spine',  match: /spine$/i,  yawW: 0.12, pitchW: 0.05, speed: 4.5 },
  { key: 'hips',   match: /hips$/i,   yawW: 0.08, pitchW: 0.00, speed: 3 },
];

/* ───────── 2. ESCENA ───────── */
const canvas = document.querySelector('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// Contorno negro grueso, estilo dibujo animado
const effect = new OutlineEffect(renderer, { defaultThickness: 0.006, defaultColor: [0, 0, 0], defaultAlpha: 1 });

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
camera.position.set(0, 1.1, 6);
camera.lookAt(0, 1, 0);

scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 1.2));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(2, 4, 3);
scene.add(key);

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// Sombreado de 2 tonos (luz / sombra) sin degradados
const toonGradient = new THREE.DataTexture(new Uint8Array([70, 255]), 2, 1, THREE.RedFormat);
toonGradient.minFilter = toonGradient.magFilter = THREE.NearestFilter;
toonGradient.needsUpdate = true;

/* ───────── 3. MODELO ───────── */
const bones = [];

function fitToHeight(obj, height = 2) {
  const box = new THREE.Box3().setFromObject(obj);
  obj.scale.multiplyScalar(height / box.getSize(new THREE.Vector3()).y);
  box.setFromObject(obj);
  const c = box.getCenter(new THREE.Vector3());
  obj.position.x -= c.x;
  obj.position.z -= c.z;
  obj.position.y -= box.min.y; // pies en y = 0
}

new GLTFLoader().load(
  MODEL_URL,
  (gltf) => {
    const model = gltf.scene;

    model.traverse((o) => {
      if (o.isBone) console.log('hueso:', o.name); // ← así ves cómo se llaman en TU modelo
      if (o.isMesh) {
        const old = Array.isArray(o.material) ? o.material[0] : o.material;
        o.material = new THREE.MeshToonMaterial({
          map: old?.map ?? null,
          color: old?.map ? 0xffffff : 0xf2f0e8,
          gradientMap: toonGradient,
        });
        o.frustumCulled = false;
      }
    });

    fitToHeight(model, 2);
    scene.add(model);

    for (const def of CHAIN) {
      let node = null;
      model.traverse((o) => { if (!node && o.isBone && def.match.test(o.name)) node = o; });
      if (node) bones.push({ ...def, node, rest: node.quaternion.clone(), yaw: 0, pitch: 0 });
      else console.warn(`No encontré hueso para "${def.key}"`);
    }
  },
  undefined,
  (err) => console.error('Error cargando el modelo:', err)
);

/* ───────── 4. MOUSE → CUERPO ───────── */
const mouse = { x: 0, y: 0 }; // -1 … 1
window.addEventListener('pointermove', (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -((e.clientY / window.innerHeight) * 2 - 1);
});

const clock = new THREE.Clock();
const qYaw = new THREE.Quaternion();
const qPitch = new THREE.Quaternion();
let acc = 0;

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.1);

  const targetYaw = mouse.x * MAX_YAW;
  const targetPitch = mouse.y * MAX_PITCH;

  // Cada hueso persigue SU parte del objetivo, a SU velocidad
  for (const b of bones) {
    const k = 1 - Math.exp(-b.speed * dt); // independiente de los FPS
    b.yaw += (targetYaw * b.yawW - b.yaw) * k;
    b.pitch += (targetPitch * b.pitchW - b.pitch) * k;
  }

  // Aplica la pose al ritmo de STEP_FPS (look de animación clásica)
  acc += dt;
  const step = STEP_FPS ? 1 / STEP_FPS : 0;
  if (acc >= step) {
    acc = step ? acc % step : 0;
    for (const b of bones) {
      qYaw.setFromAxisAngle(YAW_AXIS, b.yaw * YAW_SIGN);
      qPitch.setFromAxisAngle(PITCH_AXIS, b.pitch * PITCH_SIGN);
      b.node.quaternion.copy(b.rest).multiply(qYaw).multiply(qPitch);
    }
  }

  effect.render(scene, camera);
}
tick();