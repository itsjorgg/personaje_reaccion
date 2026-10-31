import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';
import './style.css';

/* ───────── 1. AJUSTES ───────── */
const MODEL_URL = '/modelos/willie.glb'; 
const STEP_FPS = 12; // 12 FPS para la estética de 1928 ("en doses")

// AJUSTE DE FRENTE: Cambia este valor si el modelo aparece de lado o de espaldas
// Opciones: 0, Math.PI, Math.PI/2, -Math.PI/2
const INITIAL_YAW = Math.PI; 

/* ───────── 2. ESCENA ───────── */
const canvas = document.querySelector('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const effect = new OutlineEffect(renderer, { defaultThickness: 0.006, defaultColor: [0, 0, 0], defaultAlpha: 1 });

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

// Cámara apuntando al pecho del personaje
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

const toonGradient = new THREE.DataTexture(
  new Uint8Array([70, 70, 70, 255,   255, 255, 255, 255]), 
  2, 1, 
  THREE.RGBAFormat
);
toonGradient.minFilter = toonGradient.magFilter = THREE.NearestFilter;
toonGradient.needsUpdate = true;

/* ───────── 3. MODELO ───────── */
let willieModel = null;

function fitToHeight(obj, height = 2) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  
  if (size.y > 0) {
    obj.scale.multiplyScalar(height / size.y);
  }
  
  box.setFromObject(obj);
  const c = box.getCenter(new THREE.Vector3());
  
  // Pies en el piso (Y=0) y centrado en X y Z
  obj.position.x -= c.x;
  obj.position.z -= c.z;
  obj.position.y -= box.min.y; 
}

new GLTFLoader().load(
  MODEL_URL,
  (gltf) => {
    const model = gltf.scene;

    model.traverse((o) => {
      if (o.isMesh) {
        const old = Array.isArray(o.material) ? o.material[0] : o.material;
        const baseColor = old?.color ? old.color.clone() : new THREE.Color(0xf2f0e8);

        o.material = new THREE.MeshToonMaterial({
          map: old?.map ?? null,
          color: old?.map ? 0xffffff : baseColor,
          gradientMap: toonGradient,
        });
        o.frustumCulled = false;
      }
    });

    fitToHeight(model, 2);
    model.rotation.y = INITIAL_YAW;
    
    scene.add(model);
    willieModel = model; 
  },
  undefined,
  (err) => console.error('Error cargando el modelo:', err)
);

/* ───────── 4. MOUSE → CUERPO (SIN HUESOS) ───────── */
const mouse = { x: 0, y: 0 }; 

function onPointerMove(e) {
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  mouse.x = (clientX / window.innerWidth) * 2 - 1;
  mouse.y = -((clientY / window.innerHeight) * 2 - 1);
}

window.addEventListener('mousemove', onPointerMove);
window.addEventListener('touchmove', onPointerMove, { passive: true });

// Control manual del tiempo
let lastTime = performance.now();
let acc = 0;
let currentYaw = 0;
let currentPitch = 0;

function tick() {
  requestAnimationFrame(tick);
  
  const currentTime = performance.now();
  const dt = Math.min((currentTime - lastTime) / 1000, 0.1); 
  lastTime = currentTime;

  if (willieModel) {
    const targetYaw = mouse.x * -1.2; 
    const targetPitch = mouse.y * -0.4; 

    const speed = 8;
    currentYaw += (targetYaw - currentYaw) * (1 - Math.exp(-speed * dt));
    currentPitch += (targetPitch - currentPitch) * (1 - Math.exp(-speed * dt));

    acc += dt;
    const step = 1 / STEP_FPS;
    
    if (acc >= step) {
      acc = acc % step;
      
      willieModel.rotation.y = INITIAL_YAW + currentYaw;
      willieModel.rotation.x = currentPitch;
    }
  }

  effect.render(scene, camera);
}
tick();