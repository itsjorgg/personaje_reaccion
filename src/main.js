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
const modelGroup = new THREE.Group(); // Envolvemos el modelo en un grupo
scene.add(modelGroup);

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
    
    // En lugar de añadir la malla a la escena, la metemos al grupo
    modelGroup.add(model);
    willieModel = modelGroup; // Asignamos el grupo completo para animarlo
  },
  undefined,
  (err) => console.error('Error cargando el modelo:', err)
);

/* ───────── 4. MOUSE → CUERPO (POSICIÓN Y ROTACIÓN CON INERCIA 2D) ───────── */
const mouse = { x: 0, y: 0 }; 

function onPointerMove(e) {
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  mouse.x = (clientX / window.innerWidth) * 2 - 1;
  mouse.y = -((clientY / window.innerHeight) * 2 - 1);
}

window.addEventListener('mousemove', onPointerMove);
window.addEventListener('touchmove', onPointerMove, { passive: true });

let lastTime = performance.now();
let acc = 0;

// Variables de estado básicas
let currentX = 0;
let currentY = 0;
let currentYaw = 0;
let currentPitch = 0;

// Variables para la inercia (Bamboleo Z)
let prevX = 0;
let rollVelocity = 0;
let currentRoll = 0;

// Variables para la inercia (Cabeceo X)
let prevY = 0;
let pitchVelocity = 0;
let currentPitchInertia = 0;

function tick() {
  requestAnimationFrame(tick);
  
  const currentTime = performance.now();
  const dt = Math.min((currentTime - lastTime) / 1000, 0.1); 
  lastTime = currentTime;

  if (willieModel) {
    // 1. Proyectar coordenadas
    const mouseVector = new THREE.Vector3(mouse.x, mouse.y, 0.5);
    mouseVector.unproject(camera);
    mouseVector.sub(camera.position).normalize();
    const distance = -camera.position.z / mouseVector.z;
    const targetPos = camera.position.clone().add(mouseVector.multiplyScalar(distance));

    // 2. Interpolar posición y rotación base (bajamos speed a 4 para más suavidad)
    const speed = 2;
    currentX += (targetPos.x - currentX) * (1 - Math.exp(-speed * dt));
    currentY += (targetPos.y - currentY) * (1 - Math.exp(-speed * dt));
    currentYaw += ((mouse.x * -0.8) - currentYaw) * (1 - Math.exp(-speed * dt));
    currentPitch += ((mouse.y * -0.4) - currentPitch) * (1 - Math.exp(-speed * dt));

    // 3. Físicas de Inercia (Velocidad en X y en Y)
    const velocityX = (currentX - prevX) / dt;
    const velocityY = (currentY - prevY) / dt;
    prevX = currentX;
    prevY = currentY;

    // Objetivos elásticos según la velocidad
    const targetRoll = velocityX * -0.15; 
    const targetPitchInertia = velocityY * 0.15; // Cambia a -0.15 si sientes que se inclina al revés
    
    // Sistema de resorte (suavizado: bajamos stiffness y damping)
    const stiffness = 50; 
    const damping = 6;    
    
    // Resorte para Z (Inclinación lateral)
    const springForceZ = (targetRoll - currentRoll) * stiffness;
    rollVelocity += springForceZ * dt;
    rollVelocity -= rollVelocity * damping * dt; 
    currentRoll += rollVelocity * dt;

    // Resorte para X (Inclinación frontal/trasera)
    const springForceX = (targetPitchInertia - currentPitchInertia) * stiffness;
    pitchVelocity += springForceX * dt;
    pitchVelocity -= pitchVelocity * damping * dt; 
    currentPitchInertia += pitchVelocity * dt;

    // 4. Movimiento pasivo (respiración suave)
    const idleSway = Math.sin(currentTime * 0.002) * 0.03;
    const idleFloat = Math.sin(currentTime * 0.003) * 0.02;

    acc += dt;
    const step = 1 / STEP_FPS;
    
    // Aplicamos al modelo respetando los FPS
    if (acc >= step) {
      acc = acc % step;
      
      willieModel.position.x = currentX;
      willieModel.position.y = currentY + idleFloat; 
      
      // Combinamos la rotación base del mouse, el idle, y el bamboleo de inercia
      willieModel.rotation.y = INITIAL_YAW + currentYaw + idleSway;
      willieModel.rotation.x = currentPitch + currentPitchInertia; 
      willieModel.rotation.z = currentRoll; 
    }
  }

  effect.render(scene, camera);
}
tick();