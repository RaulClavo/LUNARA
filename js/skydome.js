import * as THREE from 'three';

const R_SKY = 400;
const R_SUN = 22;
const R_EARTH = 24;
const SENSITIVITY = 0.005;
const PITCH_LIMIT = Math.PI / 2 - 0.02;

let scene, camera, renderer, domElement;
let sunMesh, earthMesh;
let initialized = false;

export function initSkyDome(initialSunEl, initialSunAz, initialEarthEl, initialEarthAz) {
  const container = document.getElementById('skydome');
  if (!container || initialized) return;

  const w = container.clientWidth || 800;
  const h = 400;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(85, w / h, 0.1, 2000);
  camera.position.set(0, 0, 0);
  camera.rotation.order = 'YXZ';

  if (initialEarthEl !== undefined && initialEarthAz !== undefined) {
    camera.rotation.y = -initialEarthAz * Math.PI / 180;
    let xRot = initialEarthEl * Math.PI / 180;
    camera.rotation.x = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, xRot));
  } else {
    camera.rotation.x = -0.5;
  }

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);
  domElement = renderer.domElement;
  domElement.style.cursor = 'grab';
  domElement.style.touchAction = 'none';

  const skyGeo = new THREE.SphereGeometry(R_SKY, 32, 32);
  const skyMat = new THREE.MeshBasicMaterial({ color: 0x000814, side: THREE.BackSide });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  const starGeometry = new THREE.BufferGeometry();
  const starCount = 3000;
  const positions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount * 3; i += 3) {
    const r = R_SKY * 0.99;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos((Math.random() * 2) - 1);
    positions[i] = r * Math.sin(phi) * Math.cos(theta);
    positions[i+1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i+2] = r * Math.cos(phi);
  }
  starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0.8 });
  const stars = new THREE.Points(starGeometry, starMaterial);
  scene.add(stars);

  const horizonGeo = new THREE.RingGeometry(R_SKY * 0.95, R_SKY, 96);
  const horizonMat = new THREE.MeshBasicMaterial({ color: 0x4da6ff, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
  const horizon = new THREE.Mesh(horizonGeo, horizonMat);
  horizon.rotation.x = Math.PI / 2;
  scene.add(horizon);

  const groundGeo = new THREE.CircleGeometry(R_SKY * 0.95, 64);
  const groundMat = new THREE.MeshBasicMaterial({ 
    color: 0x555555,
    map: createCraterTexture(), 
    side: THREE.DoubleSide
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1;
  scene.add(ground);

  addCardinal('N', 0, 0xff5e5e);
  addCardinal('S', 180, 0xff5e5e);
  addCardinal('E', 90, 0x4da6ff);
  addCardinal('W', 270, 0x4da6ff);

  const sunGeo = new THREE.SphereGeometry(R_SUN, 32, 32);
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xffcc33 });
  sunMesh = new THREE.Mesh(sunGeo, sunMat);
  const sunGlowGeo = new THREE.SphereGeometry(R_SUN * 1.8, 16, 16);
  const sunGlowMat = new THREE.MeshBasicMaterial({ color: 0xffcc33, transparent: true, opacity: 0.2 });
  sunMesh.add(new THREE.Mesh(sunGlowGeo, sunGlowMat));
  sunMesh.add(createTextSprite('SOL', '#ffcc33', R_SUN + 15));
  scene.add(sunMesh);

  const earthGeo = new THREE.SphereGeometry(R_EARTH, 32, 32);
  const earthMat = new THREE.MeshBasicMaterial({ color: 0x4da6ff });
  earthMesh = new THREE.Mesh(earthGeo, earthMat);
  const earthGlowGeo = new THREE.SphereGeometry(R_EARTH * 1.8, 16, 16);
  const earthGlowMat = new THREE.MeshBasicMaterial({ color: 0x4da6ff, transparent: true, opacity: 0.25 });
  earthMesh.add(new THREE.Mesh(earthGlowGeo, earthGlowMat));
  earthMesh.add(createTextSprite('TIERRA', '#4da6ff', R_EARTH + 15));
  scene.add(earthMesh);

  setupControls();
  initialized = true;
  animate();

  window.addEventListener('resize', () => {
    const w = container.clientWidth;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  });
}

function createCraterTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = '#2d333b';
  ctx.fillRect(0, 0, 1024, 1024);
  
  for (let i = 0; i < 250; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const radius = Math.random() * 40 + 5;
    
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fill();
    
    ctx.beginPath();
    ctx.arc(x + radius*0.15, y + radius*0.15, radius * 0.75, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fill();
  }
  
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

function createTextSprite(message, color, yOffset) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.font = 'bold 48px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(message, 128, 64);
  
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(60, 30, 1);
  sprite.position.set(0, yOffset, 0);
  return sprite;
}

function addCardinal(label, azDeg, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
  ctx.font = 'bold 80px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 64, 64);

  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.scale.set(50, 50, 1);
  const az = azDeg * Math.PI / 180;
  const R = R_SKY * 0.9;
  sprite.position.set(R * Math.sin(az), 8, -R * Math.cos(az));
  scene.add(sprite);
}

let isDragging = false;
let prevX = 0, prevY = 0;

function setupControls() {
  domElement.addEventListener('mousedown', (e) => {
    isDragging = true;
    prevX = e.clientX;
    prevY = e.clientY;
    domElement.style.cursor = 'grabbing';
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
    if (domElement) domElement.style.cursor = 'grab';
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - prevX;
    const dy = e.clientY - prevY;
    prevX = e.clientX;
    prevY = e.clientY;
    camera.rotation.y += dx * SENSITIVITY;
    camera.rotation.x += dy * SENSITIVITY;
    camera.rotation.x = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, camera.rotation.x));
  });

  domElement.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    isDragging = true;
    prevX = e.touches[0].clientX;
    prevY = e.touches[0].clientY;
  }, { passive: true });

  domElement.addEventListener('touchend', () => {
    isDragging = false;
  });

  domElement.addEventListener('touchmove', (e) => {
    if (!isDragging || e.touches.length !== 1) return;
    e.preventDefault();
    const dx = e.touches[0].clientX - prevX;
    const dy = e.touches[0].clientY - prevY;
    prevX = e.touches[0].clientX;
    prevY = e.touches[0].clientY;
    camera.rotation.y += dx * SENSITIVITY;
    camera.rotation.x += dy * SENSITIVITY;
    camera.rotation.x = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, camera.rotation.x));
  }, { passive: false });
}

export function updateSkyDome(sunEl, sunAz, earthEl, earthAz) {
  if (!initialized) return;
  const R = R_SKY * 0.85;

  const elS = sunEl * Math.PI / 180;
  const azS = sunAz * Math.PI / 180;
  sunMesh.position.set(
    R * Math.cos(elS) * Math.sin(azS),
    R * Math.sin(elS),
    -R * Math.cos(elS) * Math.cos(azS)
  );

  const elE = earthEl * Math.PI / 180;
  const azE = earthAz * Math.PI / 180;
  earthMesh.position.set(
    R * Math.cos(elE) * Math.sin(azE),
    R * Math.sin(elE),
    -R * Math.cos(elE) * Math.cos(azE)
  );
}

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}