import * as THREE from "three";

const CONFIG = {
  text: "TE AMO",
  heartScale: 1.55,
  ringSpacing: 20,
  planeAspect: 0.25, 
  planeHeight: 3.8,  
  overlapFraction: 0.1,
  fov: 68,
  cameraNear: 4,
  cameraFar: 1800, // Aumentado para ver la estrella final desde más lejos
  fogHiddenFactor: 1.73,
  ambientSpinSpeed: 0,
  dragRotationSensitivity: 0.0028,
  maxYaw: 0.55,
  maxPitch: 0.4,
  cruiseSpeed: 55, // Velocidad normal para leer
  warpSpeed: 250,  // Velocidad del viaje espacial
  desktop: { rings: 46 },
  mobile: { rings: 28 },
  phrases: [ 
    "MI PRECIOSA", "QUIERO RECORDARTE", "LO ESPECIAL QUE ERES", 
    "QUE ADORO", "CADA MOMENTO", "A TU LADO", "QUE ERES", 
    "MI MUNDO ENTERO", "Y QUE SIEMPRE", "ME HACES MUY FELIZ", 
    "SIEMPRE CUIDARE", "DE NUESTRO AMOR", "PORQUE ERES", 
    "LO MAS BONITO", "DE LA VIDA", "GRACIAS", "POR REGALARME", 
    "SIEMPRE", "ESA BONITA", "SONRRISA TUYA", "Y ESOS OJITOS", 
    "TAN PRECIOSOS", "QUE TANTO ME ENCANTAN"
  ]
};

// --- CÁLCULOS DE LA HISTORIA ---
const COMET_SPACING = 70;
const COMET_START_OFFSET = 150;
const TOTAL_PHRASES = CONFIG.phrases.length;

const STORY = {
  warpStartTravel: COMET_START_OFFSET + (TOTAL_PHRASES * COMET_SPACING) + 80,
  endTravel: COMET_START_OFFSET + (TOTAL_PHRASES * COMET_SPACING) + 1800, // Duración del hiperespacio
  finalStopDistance: 80 // Qué tan cerca nos detenemos del cartel final
};
STORY.finalStarBaseZ = -(STORY.endTravel + STORY.finalStopDistance);

let currentSpeed = 0;

function heartPoint(t, scale) {
  const x = 16 * Math.pow(Math.sin(t), 3);
  const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
  return { x: x * scale, y: y * scale };
}

function estimateHeartPerimeter(scale, sampleCount) {
  let perimeter = 0;
  let previous = heartPoint(0, scale);
  for (let i = 1; i <= sampleCount; i++) {
    const t = (i / sampleCount) * Math.PI * 2;
    const current = heartPoint(t, scale);
    perimeter += Math.hypot(current.x - previous.x, current.y - previous.y);
    previous = current;
  }
  return perimeter;
}

function buildHeartOutline(pointCount, scale) {
  const points = [];
  for (let i = 0; i < pointCount; i++) {
    const t1 = (i / pointCount) * Math.PI * 2;
    const p1 = heartPoint(t1, scale);
    points.push({ x: p1.x, y: p1.y });
  }
  return points;
}

const PLANE_WIDTH = CONFIG.planeHeight * CONFIG.planeAspect;
const ALONG_CURVE_SIZE = CONFIG.planeHeight;
const HEART_PERIMETER = estimateHeartPerimeter(CONFIG.heartScale, 2000);
const POINTS_PER_HEART = Math.max(
  24,
  Math.round(HEART_PERIMETER / (ALONG_CURVE_SIZE * (1 - CONFIG.overlapFraction)))
);

const isCoarsePointer = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
const profile = isCoarsePointer ? CONFIG.mobile : CONFIG.desktop;
const RINGS_COUNT = profile.rings;
const TOTAL_INSTANCES = RINGS_COUNT * POINTS_PER_HEART;
const TOTAL_DEPTH = RINGS_COUNT * CONFIG.ringSpacing;

const canvas = document.getElementById("scene");
const hud = document.getElementById("hud");
const loader = document.getElementById("loader");
const startButton = document.getElementById("startButton");

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
} catch (error) {
  loader.innerHTML = '<div class="loader-heart">TU NAVEGADOR NO SOPORTA WEBGL</div>';
  throw error;
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 1);

const fogDensity = CONFIG.fogHiddenFactor / TOTAL_DEPTH;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, fogDensity);

const camera = new THREE.PerspectiveCamera(CONFIG.fov, window.innerWidth / window.innerHeight, CONFIG.cameraNear, CONFIG.cameraFar);
camera.position.set(0, 0, 0);

const tunnelGroup = new THREE.Group();
scene.add(tunnelGroup);

async function createGlowTextTexture(text) {
  const fontFamily = "Cormorant Garamond, serif";
  try { await document.fonts.load(`italic 700 160px "${fontFamily}"`); } catch (error) {}

  const canvasSize = { width: 300, height: 1200 };
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = canvasSize.width; textureCanvas.height = canvasSize.height;
  const ctx = textureCanvas.getContext("2d");

  ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = `italic 700 190px ${fontFamily}`;

  const letters = text.replace(/\s+/g, '').split("");
  const spacing = canvasSize.height / letters.length;

  letters.forEach((letter, index) => {
    const cx = canvasSize.width / 2; const cy = (index + 0.5) * spacing;
    ctx.shadowColor = "rgba(255, 30, 70, 0.85)"; ctx.shadowBlur = 40; ctx.fillStyle = "rgba(255, 30, 70, 0.5)"; ctx.fillText(letter, cx, cy);
    ctx.shadowBlur = 15; ctx.fillStyle = "#ff1236"; ctx.fillText(letter, cx, cy);
    ctx.shadowBlur = 4; ctx.fillStyle = "#ffffff"; ctx.fillText(letter, cx, cy);
  });

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping; texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

async function createHorizontalTextTexture(text, isGiant = false) {
  const fontFamily = "Cormorant Garamond, serif";
  const fontSize = isGiant ? 160 : 90;
  try { await document.fonts.load(`italic 700 ${fontSize}px "${fontFamily}"`); } catch (error) {}

  const canvasSize = isGiant ? { width: 2048, height: 512 } : { width: 1024, height: 256 };
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = canvasSize.width; textureCanvas.height = canvasSize.height;
  const ctx = textureCanvas.getContext("2d");

  ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = `italic 700 ${fontSize}px ${fontFamily}`;

  const cx = canvasSize.width / 2; const cy = canvasSize.height / 2;

  ctx.shadowColor = "rgba(255, 20, 60, 1)"; ctx.shadowBlur = isGiant ? 120 : 70;
  ctx.fillStyle = "rgba(255, 20, 60, 0.4)";
  ctx.fillText(text, cx, cy); ctx.fillText(text, cx, cy); 
  ctx.shadowBlur = isGiant ? 40 : 20; ctx.fillStyle = "#ff1236"; ctx.fillText(text, cx, cy);
  ctx.shadowBlur = 5; ctx.fillStyle = "#ffffff"; ctx.fillText(text, cx, cy);

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
  texture.transparent = true;
  return texture;
}

// CREAR EL RESPLANDOR DE LA ESTRELLA
function createFlareSprite() {
  const flareCanvas = document.createElement("canvas");
  flareCanvas.width = 512; flareCanvas.height = 512;
  const ctxF = flareCanvas.getContext("2d");
  const grad = ctxF.createRadialGradient(256, 256, 0, 256, 256, 256);
  grad.addColorStop(0, "rgba(255, 255, 255, 1)");
  grad.addColorStop(0.15, "rgba(255, 80, 120, 0.9)");
  grad.addColorStop(0.5, "rgba(255, 20, 60, 0.3)");
  grad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctxF.fillStyle = grad; ctxF.fillRect(0,0,512,512);
  
  const flareTex = new THREE.CanvasTexture(flareCanvas);
  const flareMat = new THREE.SpriteMaterial({ map: flareTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const flare = new THREE.Sprite(flareMat);
  flare.scale.set(160, 160, 1);
  return flare;
}

function buildTunnelMesh(texture) {
  const geometry = new THREE.PlaneGeometry(PLANE_WIDTH, CONFIG.planeHeight);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, blending: THREE.NormalBlending, side: THREE.DoubleSide, fog: true });
  const mesh = new THREE.InstancedMesh(geometry, material, TOTAL_INSTANCES);
  mesh.frustumCulled = false;

  const outline = buildHeartOutline(POINTS_PER_HEART, CONFIG.heartScale);
  const baseZValues = new Float32Array(TOTAL_INSTANCES);
  const dummy = new THREE.Object3D();

  let index = 0;
  for (let ring = 0; ring < RINGS_COUNT; ring++) {
    const baseZ = -(ring + 0.5) * CONFIG.ringSpacing;
    for (let p = 0; p < POINTS_PER_HEART; p++) {
      const point = outline[p];
      dummy.position.set(point.x, point.y, baseZ); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1);
      dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix);
      baseZValues[index] = baseZ; index++;
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  return { mesh, baseZValues };
}

function wrapDepth(value, totalDepth) {
  const wrapped = ((value % totalDepth) + totalDepth) % totalDepth;
  return wrapped - totalDepth;
}

const state = { travel: 0, autoMoving: false, yaw: 0, pitch: 0, isDragging: false };
const pointers = new Map();
let lastDragX = 0, lastDragY = 0;

function onPointerDown(event) {
  canvas.setPointerCapture(event.pointerId); pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size === 1) { state.isDragging = true; lastDragX = event.clientX; lastDragY = event.clientY; document.body.classList.add("dragging"); }
}
function onPointerMove(event) {
  if (!pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (state.isDragging && pointers.size === 1) {
    const dx = event.clientX - lastDragX, dy = event.clientY - lastDragY;
    lastDragX = event.clientX; lastDragY = event.clientY;
    state.yaw = Math.max(-CONFIG.maxYaw, Math.min(CONFIG.maxYaw, state.yaw - dx * CONFIG.dragRotationSensitivity));
    state.pitch = Math.max(-CONFIG.maxPitch, Math.min(CONFIG.maxPitch, state.pitch - dy * CONFIG.dragRotationSensitivity));
  }
}
function onPointerUp(event) {
  pointers.delete(event.pointerId);
  if (pointers.size === 0) { state.isDragging = false; document.body.classList.remove("dragging"); }
}
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight);
}
function attachControls() {
  canvas.addEventListener("pointerdown", onPointerDown, { passive: true }); canvas.addEventListener("pointermove", onPointerMove, { passive: true });
  canvas.addEventListener("pointerup", onPointerUp, { passive: true }); canvas.addEventListener("pointercancel", onPointerUp, { passive: true });
  window.addEventListener("resize", onResize);
}

startButton.addEventListener("click", () => {
  state.autoMoving = true; currentSpeed = CONFIG.cruiseSpeed; hud.classList.add("is-hidden"); 
});

async function init() {
  const texture = await createGlowTextTexture(CONFIG.text);
  const { mesh, baseZValues } = buildTunnelMesh(texture);
  tunnelGroup.add(mesh);

  // 1. SISTEMA DE ESTRELLAS
  const starsGeo = new THREE.BufferGeometry();
  const starPos = [];
  for(let i = 0; i < 2000; i++) {
    starPos.push((Math.random() - 0.5) * 600, (Math.random() - 0.5) * 600, -Math.random() * 4000);
  }
  starsGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const starsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, transparent: true, opacity: 0.7, fog: true });
  const starsMesh = new THREE.Points(starsGeo, starsMat);
  scene.add(starsMesh);

  // 2. FRASES ORDENADAS (El viaje lineal)
  const floatingWords = [];
  for (let i = 0; i < TOTAL_PHRASES; i++) {
    const tex = await createHorizontalTextTexture(CONFIG.phrases[i]);
    const geo = new THREE.PlaneGeometry(16, 4); 
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.NormalBlending, side: THREE.DoubleSide, fog: true });
    const wordMesh = new THREE.Mesh(geo, mat);
    
    const isLeft = (i % 2 === 0);
    wordMesh.position.x = (isLeft ? -1 : 1) * (10 + Math.random() * 2);
    wordMesh.position.y = (Math.random() - 0.5) * 6;
    wordMesh.baseZ = -(COMET_START_OFFSET + (i * COMET_SPACING)); 
    wordMesh.rotation.y = isLeft ? 0.6 : -0.6;
    wordMesh.rotation.z = (Math.random() - 0.5) * 0.08;
    
    tunnelGroup.add(wordMesh);
    floatingWords.push(wordMesh);
  }

  // 3. EL GRAN FINAL ("TE AMO" Gigante + Resplandor)
  const finalTex = await createHorizontalTextTexture("TE AMO", true);
  const finalGeo = new THREE.PlaneGeometry(45, 11);
  const finalMat = new THREE.MeshBasicMaterial({ map: finalTex, transparent: true, depthWrite: false, blending: THREE.NormalBlending, fog: false }); // fog: false para que brille en la oscuridad
  const finalMesh = new THREE.Mesh(finalGeo, finalMat);
  finalMesh.baseZ = STORY.finalStarBaseZ;
  
  const starFlare = createFlareSprite();
  finalMesh.add(starFlare); // El resplandor envuelve al cartel
  tunnelGroup.add(finalMesh);

  const instanceArray = mesh.instanceMatrix.array;
  const clock = new THREE.Clock();

  attachControls();
  loader.classList.add("is-hidden");

  function animate() {
    const deltaTime = Math.min(clock.getDelta(), 0.05);

    if (state.autoMoving) {
      // MÁQUINA DE ESTADOS (Crucero -> Warp -> Freno)
      if (state.travel > STORY.warpStartTravel && state.travel < STORY.endTravel - 250) {
        // Fase de hiperespacio
        currentSpeed = THREE.MathUtils.lerp(currentSpeed, CONFIG.warpSpeed, deltaTime * 1.5);
      } else if (state.travel >= STORY.endTravel - 250) {
        // Fase de aterrizaje en la Estrella Final
        const distanceLeft = STORY.endTravel - state.travel;
        if (distanceLeft > 0) {
          currentSpeed = Math.max(0.5, distanceLeft * 0.7); // Frena suavemente
        } else {
          currentSpeed = 0; // Se detiene por completo
        }
      }

      state.travel += currentSpeed * deltaTime;
    }

    camera.rotation.y += (state.yaw - camera.rotation.y) * Math.min(1, 6 * deltaTime);
    camera.rotation.x += (state.pitch - camera.rotation.x) * Math.min(1, 6 * deltaTime);

    // Mover el túnel infinito
    for (let i = 0; i < TOTAL_INSTANCES; i++) {
      instanceArray[i * 16 + 14] = wrapDepth(baseZValues[i] + state.travel, TOTAL_DEPTH);
    }
    mesh.instanceMatrix.needsUpdate = true;

    // Mover estrellas hacia la cámara y reciclar
    const starPositions = starsMesh.geometry.attributes.position.array;
    for(let i = 2; i < starPositions.length; i += 3) {
      starPositions[i] += currentSpeed * deltaTime;
      if(starPositions[i] > 50) { starPositions[i] -= 4000; }
    }
    starsMesh.geometry.attributes.position.needsUpdate = true;

    // Mover las frases
    for (let i = 0; i < floatingWords.length; i++) {
      floatingWords[i].position.z = floatingWords[i].baseZ + state.travel;
    }

    // Mover y actualizar el Cartel Final
    finalMesh.position.z = finalMesh.baseZ + state.travel;
    const finalDist = Math.abs(finalMesh.position.z);
    
    // El destello de la estrella desaparece al acercarnos, revelando el texto limpio
    if (finalDist < 300) {
      starFlare.material.opacity = Math.max(0, (finalDist - STORY.finalStopDistance) / (300 - STORY.finalStopDistance));
    } else {
      starFlare.material.opacity = 1;
    }

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}

init().catch((error) => {
  console.error(error);
  loader.innerHTML = '<div class="loader-heart">ERROR</div>';
});