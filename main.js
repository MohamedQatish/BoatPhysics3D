import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Water } from "three/examples/jsm/objects/Water.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as dat from 'dat.gui';

let camera, camera2, scene, renderer;
let controls, water, sun;
const loader = new GLTFLoader();
const keyStates = {};
let useCamera1 = true;

class TropicalIsland {
  constructor() {
    loader.load("helpers/tropical_island/scene.gltf", (gltf) => {
      scene.add(gltf.scene);
      gltf.scene.scale.set(200, 100, 100);
      gltf.scene.position.set(-900, -10, 50);
      gltf.scene.rotation.y = 1.5;
    });
  }
}

const tropicalIsland = new TropicalIsland();

const sizes = {
  width: window.innerWidth,
  height: window.innerHeight
};

const boatForces = {
  thrustForce: 10,
  dragCoefficient: 0.1,
  waterReactionForce: 0.01,
  mass: 100,
  decelerationRate: 0.98,
  waveAmplitude: 0,
  waveFrequency: 1,
  windForce: 0.05,
  sinkingThreshold: 300
};

class Boat {
  constructor(onLoadCallback) {
    loader.load("helpers/boat/scene.gltf", (gltf) => {
      scene.add(gltf.scene);
      gltf.scene.scale.set(5, 5.2, 5);
      gltf.scene.position.set(5, 13, 50);
      gltf.scene.rotation.y = 1.5;
      this.boat = gltf.scene;
      this.speed = {
        vel: 0,
        rot: 0,
      };
      this.isStopping = false;
      if (onLoadCallback) onLoadCallback();
    });
  }

  stop() {
    this.isStopping = true;
  }

  update() {
    if (this.boat) {
      const thrustAcceleration = keyStates["KeyW"] ? boatForces.thrustForce / boatForces.mass : 0;
      const dragForce = boatForces.dragCoefficient * this.speed.vel * this.speed.vel;
      const dragAcceleration = -Math.sign(this.speed.vel) * dragForce / boatForces.mass;
      const waterReactionAcceleration = -this.speed.vel * boatForces.waterReactionForce;

      const totalAcceleration = thrustAcceleration + dragAcceleration + waterReactionAcceleration;

      this.speed.vel += totalAcceleration;

      if (this.isStopping) {
        this.speed.vel *= boatForces.decelerationRate;
        if (Math.abs(this.speed.vel) < 0.01) {
          this.speed.vel = 0;
          this.isStopping = false;
        }
      }

      this.applyWaveEffect();
      this.applyWindEffect();
      this.applyBuoyancyEffect();

      if (boatForces.mass > boatForces.sinkingThreshold) {
        this.sink();
      } else {
        this.boat.rotation.y += this.speed.rot;
        this.boat.translateX(this.speed.vel);
      }
    }
  }

  applyWaveEffect() {
    const waveEffect = Math.sin(performance.now() * 0.001 * boatForces.waveFrequency) * boatForces.waveAmplitude;
    this.boat.position.y = 13 + waveEffect; // Adjusting the Y position of the boat
  }

  applyWindEffect() {
    const windEffect = boatForces.windForce * Math.cos(performance.now() * 0.001);
    this.boat.position.x += windEffect; // Adjusting the X position of the boat
  }

  applyBuoyancyEffect() {
    const buoyancyForce = 9.81 * boatForces.mass; // قوة الطفو = كتلة القارب * تسارع الجاذبية الأرضية
    const displacement = this.boat.position.y < 0 ? -this.boat.position.y : 0; // إزاحة القارب تحت الماء
    const buoyancyEffect = buoyancyForce * displacement;
    this.boat.position.y += buoyancyEffect * 0.01; // تعديل قوة الطفو
  }

  sink() {
    this.boat.position.y -=1; // Sinking the boat
    if (this.boat.position.y < -80) { // Once the boat is completely sunk
      this.boat.position.y = -80;
    }
  }
}

// إنشاء كائن القارب
const boat = new Boat(() => {
  controls.target.copy(boat.boat.position);
  controls.update();
});

// تهيئة المشهد وإعداداته
async function init() {
  renderer = new THREE.WebGLRenderer();
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.body.appendChild(renderer.domElement);

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 20000);
  camera.position.set(30, 30, 100);

  camera2 = new THREE.PerspectiveCamera(100, window.innerWidth / window.innerHeight, 1, 20000);
  camera2.position.set(0, 10, 10);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const waterGeometry = new THREE.PlaneGeometry(100000, 100000);
  water = new Water(waterGeometry, {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: new THREE.TextureLoader().load("helpers/waternormals.jpg", function (texture) {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    }),
    sunDirection: new THREE.Vector3(),
    sunColor: 0xffffff,
    waterColor: 0x001e0f,
    distortionScale: 3.7,
    fog: scene.fog !== undefined,
  });
  water.rotation.x = -Math.PI / 2;
  scene.add(water);

  const sky = new Sky();
  sky.scale.setScalar(100000);
  scene.add(sky);

  sun = new THREE.Vector3();
  sun.copy(sky.position);

  const parameters = {
    elevation: 2,
    azimuth: 180,
  };
  const sunGeometry = new THREE.SphereGeometry(10, 32, 32);
  const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFF32 });
  const sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);

  sunMesh.position.set(0, 1000, -20000);
  sunMesh.scale.set(100, 100, 100);

  const pmremGenerator = new THREE.PMREMGenerator(renderer);

  function updateSun() {
    const phi = THREE.MathUtils.degToRad(90 - parameters.elevation);
    const theta = THREE.MathUtils.degToRad(parameters.azimuth);

    sun.setFromSphericalCoords(1, phi, theta);

    sky.material.uniforms["sunPosition"].value.copy(sun);
    water.material.uniforms["sunDirection"].value.copy(sun).normalize();

    scene.environment = pmremGenerator.fromScene(sky).texture;
  }

  updateSun();

  controls = new OrbitControls(camera, renderer.domElement);
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 40.0;
  controls.maxDistance = 200.0;
  controls.update();

  window.addEventListener("resize", onWindowResize);
  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  const gui = new dat.GUI();
  gui.add(boatForces, 'thrustForce', 0, 50, 0.1).name('Thrust Force');
  gui.add(boatForces, 'dragCoefficient', 0, 1, 0.01).name('Drag Coefficient');
  gui.add(boatForces, 'waterReactionForce', 0, 0.1, 0.001).name('Water Reaction Force');
  gui.add(boatForces, 'mass', 33, 500, 1).name('Boat Mass');
  gui.add(boatForces, 'decelerationRate', 0.9, 1, 0.001).name('Deceleration Rate');
  gui.add(boatForces, 'waveAmplitude', 0, 40, 0.1).name('Wave Amplitude').onChange(updateWater);
  gui.add(boatForces, 'waveFrequency', 0, 3, 0.1).name('Wave Frequency').onChange(updateWater);
  gui.add(boatForces, 'windForce', 0, 0.5, 0.01).name('Wind Force');
  gui.add(boatForces, 'sinkingThreshold', 100, 500, 1).name('Sinking Threshold');
}

function updateWater() {
  water.material.uniforms["distortionScale"].value = boatForces.waveAmplitude;
  water.material.uniforms["time"].value = boatForces.waveFrequency;
}

window.addEventListener("keyup", (event) => {
  keyStates[event.code] = false;
  if (event.code === "KeyW") {
    boat.stop();
  }
  if (event.code === "KeyA" || event.code === "KeyD") {
    boat.speed.rot = 0;
  }
});
window.addEventListener("keydown", (event) => {
  keyStates[event.code] = true;
});

let speed = 0;
function myControls() {
  if (keyStates["KeyW"]) {
    boat.isStopping = false;
    boat.speed.vel += boatForces.thrustForce / boatForces.mass;
  }

  if (keyStates["KeyS"]) {
    boat.isStopping = false;
    boat.speed.vel = -1;
  }

  if (keyStates["KeyA"]) {
    boat.speed.rot = 0.01;
  }

  if (keyStates["KeyD"]) {
    boat.speed.rot = -0.01;
  }
}

function toggleCamera() {
  useCamera1 = !useCamera1;
  if (useCamera1) {
    controls.enabled = true;
    camera2.position.copy(camera.position);
    camera2.quaternion.copy(camera.quaternion);
    renderer.render(scene, camera);
  } else {
    controls.enabled = true;
    camera.position.copy(camera2.position);
    camera.quaternion.copy(camera2.quaternion);
    renderer.render(scene, camera2);
  }
}

window.addEventListener("keydown", (event) => {
  if (event.code === "KeyC") {
    toggleCamera();
  }
});

window.addEventListener('dblclick', () => {
  if (!document.fullscreenElement) {
    renderer.domElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
});

const clock = new THREE.Clock();
let oldElapsedTime = 0;

async function animate() {
  const elapsedTime = clock.getElapsedTime();
  const deltaTime = elapsedTime - oldElapsedTime;
  oldElapsedTime = elapsedTime;

  boat.update();
  myControls();
  updateCamera();
  updateCamera2();
  render();
  controls.update();
  requestAnimationFrame(animate);
}

function updateCamera() {
  if (boat.boat) {
    if (useCamera1) {
      controls.target.copy(boat.boat.position);
      camera.position.y = 50;
    }
  }
}

function updateCamera2() {
  if (boat.boat) {
    camera2.position.copy(boat.boat.position);
    camera2.position.y += 23;
    camera2.position.z += 3;
    camera2.lookAt(boat.boat.position.x, boat.boat.position.y + 17, boat.boat.position.z);
    camera2.rotation.x = 0.1;
  }
}

function render() {
  water.material.uniforms["time"].value += 1.0 / 60.0;
  if (useCamera1) {
    renderer.render(scene, camera);
  } else {
    renderer.render(scene, camera2);
  }
}

init();
animate();
