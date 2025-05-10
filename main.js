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
  waveAmplitude: 0.5,
  waveFrequency: 1,
  windForce: 0.05,
  sinkingThreshold: 250
};

class Boat {
  constructor(onLoadCallback) {
    this.sinkingSound = document.getElementById('sinkingSound');
    this.sinkingSound.isPlaying = false;
    loader.load("helpers/boat/scene.gltf", (gltf) => {
      scene.add(gltf.scene);
      gltf.scene.scale.set(5, 5.2, 5);
      gltf.scene.position.set(5, 13, 50);
      gltf.scene.rotation.y = 1.5;
      this.boat = gltf.scene;
      this.speed = {
        vel: 0,
        rot: 0,
        angularVelocity: 0,
        turnRadius: 0
      };
      this.isStopping = false;
      this.isSinking = false;
      this.sinkingTimer = 0;
      if (onLoadCallback) onLoadCallback();
    });
  }

  calculateTilt() {
    const maxTiltAngle = Math.PI / 6;
    const tilt = this.speed.angularVelocity * this.speed.turnRadius * 0.1;
    return Math.min(maxTiltAngle, tilt);
  }

  applyCentrifugalForce() {
    if (this.speed.angularVelocity > 0 && this.speed.turnRadius > 0) {
      const radius = this.speed.turnRadius;
      const angularVelocity = this.speed.angularVelocity;
      const centrifugalForce = boatForces.mass * angularVelocity * angularVelocity * radius;
  
      const adjustment = centrifugalForce * 0.001;
      this.boat.position.x += adjustment;

      const tilt = this.calculateTilt();
      this.boat.rotation.z = tilt * Math.sign(this.speed.rot);
    }
  }
  
  stop() {
    this.isStopping = true;
  }

  update() {
    if (this.boat) {
        if (!this.isSinking) {
          const thrustAcceleration = keyStates["KeyW"] ? boatForces.thrustForce / boatForces.mass : 0;
          const dragForce = 0.5 * boatForces.dragCoefficient * this.speed.vel * this.speed.vel;
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
          wind.applyWindEffect(this);
          this.applyCentrifugalForce();

          if (boatForces.mass > boatForces.sinkingThreshold) {
            this.applyBuoyancyEffect();
          } else {
              this.boat.rotation.y += this.speed.rot;
              this.boat.translateX(this.speed.vel);
          }
        } else {
          this.sink();
        }
    }
  }

  applyWaveEffect() {
    const waveEffect = Math.sin(performance.now() * 0.001 * boatForces.waveFrequency) * boatForces.waveAmplitude;
    this.boat.position.y = 13 + waveEffect;
  }

  getBuoyancyForce() {
    const boatHeight = this.boat.scale.y;
    const boatLength = this.boat.scale.z;
    const boatWidth = this.boat.scale.x;

    const submergedHeight = Math.max(0, boatHeight - this.boat.position.y);

    const volumeDisplaced = submergedHeight * boatLength * boatWidth;

    const waterDensity = 1000;

    const buoyancyForce = waterDensity * volumeDisplaced * 9.81;

    return buoyancyForce;
  }

  applyBuoyancyEffect() {
    const gravityForce = 9.81 * boatForces.mass; 
    const buoyancyForce = this.getBuoyancyForce(); 
    const netForce = buoyancyForce - gravityForce;

    const waterResistance = this.speed.vel * this.speed.vel * 0.05;

    if (netForce < 0) {
        this.isSinking = true;
    } else {
        const netAcceleration = (netForce - waterResistance) / boatForces.mass;
        this.speed.vel += netAcceleration;
        this.boat.position.y += this.speed.vel * 0.01;
        
        if (this.boat.position.y < -boatHeight / 2) {
            this.boat.position.y = -boatHeight / 2;
            this.speed.vel = 0;
        }
    }
  }

  sink() {
    this.sinkingTimer += 0.001; 
    this.boat.position.y -= this.sinkingTimer; 
    if (!this.sinkingSound.isPlaying) {
      this.sinkingSound.play();
      this.sinkingSound.isPlaying = true;
    }
    if (this.boat.position.y < -100) { 
        this.boat.position.y = -100;
        this.speed.vel = 0;
    }
  }
}

const boat = new Boat(() => {
  controls.target.copy(boat.boat.position);
  controls.update();
});

class Wind {
  constructor() {
    this.direction = new THREE.Vector3(1, 0, 0);
    this.speed = 0.1;
  }

  updateWind(newDirection, newSpeed) {
    this.direction = newDirection.normalize();
    this.speed = newSpeed;
  }

  applyWindEffect(boat) {
    if (boat.boat) {
        const windDirection = this.direction.clone().normalize();
        
        const windImpact = windDirection.multiplyScalar(this.speed * boatForces.windForce);
        
        boat.boat.position.add(windImpact);

      const sideImpact = windDirection.dot(new THREE.Vector3(1, 0, 0));
      boat.speed.rot += sideImpact * 0.0001;
      boat.speed.rot = Math.max(Math.min(boat.speed.rot, 0.02), -0.02);
  }
}

}
const wind = new Wind();

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
    gui.add(boatForces, 'thrustForce', 0, 20, 0.1).name('Thrust Force');
    gui.add(boatForces, 'dragCoefficient', 0, 2, 0.01).name('Drag Coefficient');
    gui.add(boatForces, 'waterReactionForce', 0, 0.1, 0.001).name('Water Reaction Force');
    gui.add(boatForces, 'mass', 30, 300, 1).name('Boat Mass');
    gui.add(boatForces, 'decelerationRate', 0.9, 1, 0.001).name('Deceleration Rate');
    gui.add(boatForces, 'waveAmplitude', 0, 4, 0.1).name('Wave Amplitude').onChange(updateWater);
    gui.add(boatForces, 'waveFrequency', 0, 5, 0.1).name('Wave Frequency').onChange(updateWater);
    gui.add(boatForces, 'windForce', 0, 0.5, 0.01).name('Wind Force');
    const windGui = gui.addFolder('Wind Settings');
   windGui.open();
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
        boat.speed.rot = 0.05;
        boat.speed.angularVelocity = 0.1;
        boat.speed.turnRadius = 1;
    }

    if (keyStates["KeyD"]) {
        boat.speed.rot = -0.05;
        boat.speed.angularVelocity = 0.1;
        boat.speed.turnRadius = 1;
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

    wind.updateWind(
        new THREE.Vector3(
            wind.direction.x,
            wind.direction.y,
            wind.direction.z
        ),
        wind.speed
    );
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