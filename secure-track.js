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
        if (Array.isArray(object.material)) object.material.forEach((item) => item.dispose?.());
        else object.material?.dispose?.();
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
      group.add(torso, head);
      group.userData = { phase: index * 0.7, torso, baseY: group.position.y };
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
    });
    this.renderer.render(this.scene, this.camera);
  };
}
