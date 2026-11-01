// PERSONAJE INTERACCION RENDER WEB
// STEAMBOAT WILLIE 
// JORG ;)

import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';
import './style.css';

// 1. CONFIGURACIÓN BÁSICA
const MODEL_URL = '/modelos/willie_walk2.fbx'; // Ruta del modelo 3D
const STEP_FPS = 12; // Velocidad de la animación (12 FPS para estilo retro)
const INITIAL_YAW = Math.PI; // Rotación inicial para que el modelo mire al frente

/// CONFIGURACIÓN ESCENA 
const canvas = document.querySelector('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// Efecto de contorno negro 
const effect = new OutlineEffect(renderer, { defaultThickness: 0.006, defaultColor: [0, 0, 0] });

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
camera.position.set(0, 1.1, 6); // La cámara apunta al pecho del personaje
camera.lookAt(0, 1, 0);

// Iluminación
scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 1.2)); // Luz ambiental
const keyLight = new THREE.DirectionalLight(0xffffff, 2.2); // Luz principal
keyLight.position.set(2, 4, 3);
scene.add(keyLight);

// Resize
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setSize(window.innerWidth, window.innerHeight, false);

// Toon shading
const toonGradient = new THREE.DataTexture(new Uint8Array([70, 70, 70, 255, 255, 255, 255, 255]), 2, 1, THREE.RGBAFormat);
toonGradient.minFilter = toonGradient.magFilter = THREE.NearestFilter;
toonGradient.needsUpdate = true;

// Carga modelo 3d
let willieModel = null;
let mixer = null; 
const modelGroup = new THREE.Group(); 
scene.add(modelGroup);

// Ajustar tamaño del modelo 
function fitToHeight(obj, height = 2) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  if (size.y > 0) obj.scale.multiplyScalar(height / size.y);
  
  box.setFromObject(obj);
  const center = box.getCenter(new THREE.Vector3());
  obj.position.set(-center.x, -box.min.y, -center.z); // Centrar en pantalla
}

// Cargar archivo FBX
new FBXLoader().load(MODEL_URL, (model) => {
  // Reproducir la primera animación si el modelo tiene una
  if (model.animations?.length) {
    mixer = new THREE.AnimationMixer(model);
    mixer.clipAction(model.animations[0]).play();
  }

  // Darle el estilo Cartoon
  model.traverse((child) => {
    if (child.isMesh || child.isSkinnedMesh) {
      const oldMat = Array.isArray(child.material) ? child.material[0] : child.material;
      const baseColor = oldMat?.color ? oldMat.color.clone() : new THREE.Color(0xf2f0e8);

      
      if (baseColor.r < 0.05 && baseColor.g < 0.05 && baseColor.b < 0.05) {
        baseColor.setHex(0x2a2a2a); 
      }

      // Aplicar el material Toon
      child.material = new THREE.MeshToonMaterial({ color: baseColor, gradientMap: toonGradient });
      child.frustumCulled = false; // Evita que el modelo desaparezca en los bordes
    }
  });

  fitToHeight(model, 2);
  modelGroup.add(model);
  willieModel = modelGroup; 
});

// Controles de usuario
const mouse = { x: 0, y: 0 }; 
let isRightDragging = false;
let manualRotationX = 0, manualRotationY = 0; 
let targetScale = 1, currentScale = 1;

// Bloquear menú contextual 
window.addEventListener('contextmenu', (e) => e.preventDefault());

// Detectar click derecho para rotar 
window.addEventListener('mousedown', (e) => { if (e.button === 2) isRightDragging = true; });
window.addEventListener('mouseup', (e) => { if (e.button === 2) isRightDragging = false; });

// Detectar scroll de la rueda para hacer zoom
window.addEventListener('wheel', (e) => {
  targetScale = Math.max(0.3, Math.min(targetScale + e.deltaY * -0.001, 3)); 
});

// Detectar movimiento del mouse  
window.addEventListener('pointermove', (e) => {
  if (isRightDragging) {
    manualRotationX += e.movementY * 0.01;
    manualRotationY += e.movementX * 0.01;
  } else {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1; // Eje Y invertido para Three.js
  }
});

// Animación
let lastTime = performance.now();
let acc = 0; // FPS

// Variables de inercia y posición
let currentX = 0, currentY = 0, currentYaw = 0, currentPitch = 0;
let prevX = 0, rollVelocity = 0, currentRoll = 0;
let prevY = 0, pitchVelocity = 0, currentPitchInertia = 0;

function tick() {
  requestAnimationFrame(tick);
  
  const currentTime = performance.now();
  const dt = Math.min((currentTime - lastTime) / 1000, 0.1); 
  lastTime = currentTime;

  if (willieModel) {
    // Posición 3D a la que debe ir el (el cursor)
    const mouseVector = new THREE.Vector3(mouse.x, mouse.y, 0.5).unproject(camera);
    mouseVector.sub(camera.position).normalize();
    const distance = -camera.position.z / mouseVector.z;
    const targetPos = camera.position.clone().add(mouseVector.multiplyScalar(distance));

    // Limites de pantalla
    const vFOV = THREE.MathUtils.degToRad(camera.fov);
    const visibleHeight = 2 * Math.tan(vFOV / 2) * camera.position.z;
    const visibleWidth = visibleHeight * camera.aspect;
    const margin = 1.2 * currentScale; 
    
    targetPos.x = THREE.MathUtils.clamp(targetPos.x, -Math.max(0, (visibleWidth / 2) - margin), Math.max(0, (visibleWidth / 2) - margin));
    targetPos.y = THREE.MathUtils.clamp(targetPos.y, -Math.max(0, (visibleHeight / 2) - margin), Math.max(0, (visibleHeight / 2) - margin));

    // Lerp de movimiento
    const speed = 2;
    currentX += (targetPos.x - currentX) * (1 - Math.exp(-speed * dt));
    currentY += (targetPos.y - currentY) * (1 - Math.exp(-speed * dt));
    currentYaw += ((mouse.x * -0.8) - currentYaw) * (1 - Math.exp(-speed * dt));
    currentPitch += ((mouse.y * -0.4) - currentPitch) * (1 - Math.exp(-speed * dt));

    // Efecto resorte
    const velocityX = (currentX - prevX) / dt;
    const velocityY = (currentY - prevY) / dt;
    prevX = currentX; prevY = currentY;

    rollVelocity += ((velocityX * -0.15 - currentRoll) * 50 - rollVelocity * 6) * dt; 
    currentRoll += rollVelocity * dt;

    pitchVelocity += ((velocityY * 0.15 - currentPitchInertia) * 50 - pitchVelocity * 6) * dt; 
    currentPitchInertia += pitchVelocity * dt;

    // Efecto flotante ; idle
    const idleSway = Math.sin(currentTime * 0.002) * 0.03;
    const idleFloat = Math.sin(currentTime * 0.003) * 0.02;

    // Efecto Stop-Motion 12 FPS
    acc += dt;
    const step = 1 / STEP_FPS;
    
    if (acc >= step) {
      acc = acc % step;
      if (mixer) mixer.update(step);
      
      // Suavizar el zoom
      currentScale += (targetScale - currentScale) * 0.1; 
      willieModel.scale.set(currentScale, currentScale, currentScale);
      
      willieModel.position.set(currentX, currentY + idleFloat, 0);
      
      // Combinar las rotaciones 
      willieModel.rotation.set(
        currentPitch + currentPitchInertia + manualRotationX,
        INITIAL_YAW + currentYaw + idleSway + manualRotationY,
        currentRoll
      );
    }
  }

  // Renderizar con el efecto de contorno
  effect.render(scene, camera);
}

// Iniciar el bucle de renderizado
tick();