import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js";

export class SecureTrack {
  constructor(container, stageDistance) {
    this.container = container;
    this.stageDistance = stageDistance;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xccecff);
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 400);
    this.camera.position.set(0, 24, 42);
    this.camera.lookAt(0, 1.5, -40);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.append(this.renderer.domElement);
    this.runners = [];
    this.clock = new THREE.Clock();
    this.buildTrack();
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.animate();
  }

  buildTrack() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x53735b, 2.4));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(15, 32, 22);
    this.scene.add(sun);

    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 190),
      new THREE.MeshStandardMaterial({ color: 0x70b75d }),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(0, -0.25, -42);
    this.scene.add(grass);

    const road = new THREE.Mesh(
      new THREE.BoxGeometry(25, 0.45, 145),
      new THREE.MeshStandardMaterial({ color: 0xc65f48 }),
    );
    road.position.set(0, 0, -43);
    this.scene.add(road);

    for (let lane = 0; lane <= 8; lane += 1) {
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.04, 143),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      line.position.set(-12.25 + lane * 3.06, 0.25, -43);
      this.scene.add(line);
    }
  }

  setStudents(students, currentKey, locationIndex) {
    this.runners.forEach((runner) => {
      this.scene.remove(runner);
      runner.traverse((object) => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) {
          object.material.forEach((item) => {
            item.map?.dispose?.();
            item.dispose?.();
          });
        } else {
          object.material?.map?.dispose?.();
          object.material?.dispose?.();
        }
      });
    });

    this.runners = students.map((student, index) => {
      const group = new THREE.Group();
      const start = locationIndex * this.stageDistance;
      const progress = Math.max(0, Math.min(1, (Number(student.distance || 0) - start) / this.stageDistance));
      group.position.set(-10.7 + (index % 8) * 3.06, 0.35, 17.5 - progress * 121 - Math.floor(index / 8) * 1.3);

      const current = student.id === currentKey;
      const skin = new THREE.MeshStandardMaterial({ color: 0xf1bd8c });
      const colours = [0x176b87, 0xff7b54, 0x6a4c93, 0x2a9d8f];
      const shirt = new THREE.MeshStandardMaterial({ color: current ? 0xffb703 : colours[index % colours.length] });
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 0.8, 5, 8), shirt);
      torso.position.y = 2.2;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.43, 14, 12), skin);
      head.position.y = 3.4;

      const nameLabel = createNameLabel(student.displayAlias, current);
      nameLabel.position.set(0, 4.65, 0);
      group.add(torso, head, nameLabel);
      group.userData = {
        phase: index * 0.7,
        torso,
        nameLabel,
        baseY: group.position.y,
      };
      this.scene.add(group);
      return group;
    });
  }

  resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.5));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  animate = () => {
    requestAnimationFrame(this.animate);
    const time = this.clock.getElapsedTime();
    this.runners.forEach((runner) => {
      runner.position.y = runner.userData.baseY + Math.abs(Math.sin(time * 6 + runner.userData.phase)) * 0.12;
      runner.userData.torso.rotation.z = Math.sin(time * 3 + runner.userData.phase) * 0.05;

      // Keep labels readable while zooming or rotating the camera. THREE.Sprite
      // already faces the camera; this modest distance compensation prevents
      // far-away runners' names from becoming illegibly tiny.
      const label = runner.userData.nameLabel;
      if (label) {
        const distance = this.camera.position.distanceTo(runner.position);
        const factor = THREE.MathUtils.clamp(distance / 48, 0.85, 1.75);
        label.scale.set(label.userData.baseWidth * factor, label.userData.baseHeight * factor, 1);
      }
    });
    this.renderer.render(this.scene, this.camera);
  };
}

function createNameLabel(displayAlias, current) {
  const text = String(displayAlias || "同學").trim().slice(0, 10) || "同學";
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const fontSize = Math.round(34 * pixelRatio);
  const horizontalPadding = Math.round(22 * pixelRatio);
  const verticalPadding = Math.round(13 * pixelRatio);
  const radius = Math.round(16 * pixelRatio);

  context.font = `700 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", "Noto Sans TC", sans-serif`;
  const measured = Math.ceil(context.measureText(text).width);
  canvas.width = Math.max(Math.round(150 * pixelRatio), measured + horizontalPadding * 2);
  canvas.height = fontSize + verticalPadding * 2;

  context.font = `700 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", "Noto Sans TC", sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  roundedRect(context, 1, 1, canvas.width - 2, canvas.height - 2, radius);
  context.fillStyle = current ? "rgba(255, 247, 202, 0.96)" : "rgba(255, 255, 255, 0.94)";
  context.fill();
  context.lineWidth = Math.max(2, Math.round(2 * pixelRatio));
  context.strokeStyle = current ? "rgba(202, 145, 0, 0.95)" : "rgba(25, 74, 104, 0.72)";
  context.stroke();
  context.fillStyle = "#153b57";
  context.fillText(text, canvas.width / 2, canvas.height / 2 + pixelRatio);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  const baseHeight = current ? 1.65 : 1.5;
  const baseWidth = baseHeight * (canvas.width / canvas.height);
  sprite.scale.set(baseWidth, baseHeight, 1);
  sprite.renderOrder = 1000;
  sprite.userData = { baseWidth, baseHeight };
  return sprite;
}

function roundedRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}
