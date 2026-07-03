import * as THREE from "./three-reading-wrapper.js";

const COUNTRY_LANDMARKS = [
  { country: "日本", flag: "🇯🇵", landmark: "富士山與鳥居", build: buildJapan },
  { country: "法國", flag: "🇫🇷", landmark: "巴黎鐵塔", build: buildFrance },
  { country: "埃及", flag: "🇪🇬", landmark: "金字塔與獅身人面像", build: buildEgypt },
  { country: "澳洲", flag: "🇦🇺", landmark: "悉尼歌劇院", build: buildAustralia },
  { country: "英國", flag: "🇬🇧", landmark: "大笨鐘", build: buildUnitedKingdom },
  { country: "美國", flag: "🇺🇸", landmark: "自由女神像", build: buildUnitedStates },
  { country: "中國", flag: "🇨🇳", landmark: "萬里長城", build: buildChina },
  { country: "巴西", flag: "🇧🇷", landmark: "基督像", build: buildBrazil },
  { country: "印度", flag: "🇮🇳", landmark: "泰姬陵", build: buildIndia },
  { country: "意大利", flag: "🇮🇹", landmark: "羅馬競技場", build: buildItaly },
];

const currentLocationLabel = document.querySelector("#currentLocationLabel");
const trackEmpty = document.querySelector("#trackEmpty");
let activeScene = null;
let activeIndex = -1;
let animationFrame = null;
let sceneReadyAttempts = 0;

waitForScene();

function waitForScene() {
  const scene = window.__readingScene;
  if (!scene) {
    sceneReadyAttempts += 1;
    if (sceneReadyAttempts < 600) requestAnimationFrame(waitForScene);
    return;
  }

  if (currentLocationLabel) {
    new MutationObserver(syncCountryScene).observe(currentLocationLabel, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  syncCountryScene();
  animateLandmarks();
}

function syncCountryScene() {
  const locationIndex = currentLocationIndex();
  if (locationIndex === activeIndex && activeScene) return;

  removeActiveScene();
  activeIndex = locationIndex;

  const definition = COUNTRY_LANDMARKS[locationIndex] || COUNTRY_LANDMARKS[0];
  const group = new THREE.Group();
  group.name = `country-landmarks-${locationIndex + 1}`;
  group.userData.landmarkScene = true;
  group.userData.phase = locationIndex * 0.7;

  const content = definition.build();
  group.add(content);

  const sign = makeBillboard(`${definition.flag} ${definition.country}`, definition.landmark);
  sign.position.set(-23, 14.5, 17);
  group.add(sign);

  setShadows(group);
  window.__readingScene.add(group);
  activeScene = group;

  if (trackEmpty) {
    trackEmpty.dataset.country = definition.country;
  }
}

function currentLocationIndex() {
  const text = currentLocationLabel?.textContent || "地方 1";
  const match = text.match(/地方\s*(\d+)/);
  const value = Number(match?.[1] || 1) - 1;
  return Math.max(0, Math.min(COUNTRY_LANDMARKS.length - 1, value));
}

function removeActiveScene() {
  if (!activeScene || !window.__readingScene) return;
  window.__readingScene.remove(activeScene);
  activeScene.traverse((object) => {
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.filter(Boolean).forEach((material) => {
      material.map?.dispose?.();
      material.dispose?.();
    });
  });
  activeScene = null;
}

function animateLandmarks() {
  animationFrame = requestAnimationFrame(animateLandmarks);
  if (!activeScene) return;
  const time = performance.now() / 1000;
  activeScene.rotation.y = Math.sin(time * 0.32 + activeScene.userData.phase) * 0.012;
  activeScene.traverse((object) => {
    if (object.userData?.spin) object.rotation.y += object.userData.spin;
    if (object.userData?.float) {
      object.position.y = object.userData.baseY + Math.sin(time * object.userData.speed + object.userData.phase) * object.userData.float;
    }
  });
}

function buildJapan() {
  const root = new THREE.Group();

  const torii = new THREE.Group();
  torii.add(
    box(0.8, 8, 0.8, 0xd93b35, -3, 4, 0),
    box(0.8, 8, 0.8, 0xd93b35, 3, 4, 0),
    box(8.2, 0.9, 1.1, 0xd93b35, 0, 8.2, 0),
    box(6.8, 0.5, 0.85, 0xe6544f, 0, 7.1, 0),
    box(1.25, 0.45, 1.25, 0x2c3141, -3, 0.3, 0),
    box(1.25, 0.45, 1.25, 0x2c3141, 3, 0.3, 0),
  );
  torii.position.set(-23, 0, -24);
  torii.rotation.y = 0.12;
  root.add(torii);

  const fuji = new THREE.Group();
  const mountain = cone(7.8, 11, 24, 0x547c97, 0, 5.5, 0);
  mountain.scale.z = 0.8;
  const snow = cone(3.5, 4.6, 24, 0xf7fbff, 0, 10.6, 0);
  snow.scale.z = 0.8;
  fuji.add(mountain, snow);
  fuji.position.set(24, 0, -72);
  root.add(fuji);

  root.add(makeCherryTree(22, -28, 1.2), makeCherryTree(28, -42, 0.9));
  return root;
}

function buildFrance() {
  const root = new THREE.Group();
  const tower = new THREE.Group();
  tower.add(
    frustum(2.8, 5.6, 6, 0x555b66, 0, 3, 0),
    frustum(1.45, 2.8, 5.2, 0x5d626c, 0, 8.6, 0),
    frustum(0.28, 1.45, 5, 0x656a73, 0, 13.7, 0),
    box(7.1, 0.45, 7.1, 0x414750, 0, 6.15, 0),
    box(4.2, 0.35, 4.2, 0x414750, 0, 11.2, 0),
    cylinder(0.18, 0.18, 4.2, 10, 0x414750, 0, 18.2, 0),
  );
  tower.rotation.y = Math.PI / 4;
  tower.position.set(-23, 0, -48);
  root.add(tower);

  const arch = new THREE.Group();
  arch.add(
    box(2, 6, 2.4, 0xe8d2aa, -2.6, 3, 0),
    box(2, 6, 2.4, 0xe8d2aa, 2.6, 3, 0),
    box(7.2, 2, 2.4, 0xe8d2aa, 0, 7, 0),
    box(2.2, 1.2, 2.8, 0xd6bd90, 0, 5.3, 0),
  );
  arch.position.set(24, 0, -22);
  arch.rotation.y = -0.15;
  root.add(arch);

  root.add(makeTree(27, -65, 1.1), makeTree(19, -78, 0.85));
  return root;
}

function buildEgypt() {
  const root = new THREE.Group();
  const pyramidMaterial = 0xd8aa57;
  const pyramid1 = cone(7.5, 11.5, 4, pyramidMaterial, -24, 5.75, -58);
  pyramid1.rotation.y = Math.PI / 4;
  const pyramid2 = cone(5.2, 8.3, 4, 0xc99749, 24, 4.15, -77);
  pyramid2.rotation.y = Math.PI / 4;
  const pyramid3 = cone(3.8, 6.2, 4, 0xe3b867, 20, 3.1, -34);
  pyramid3.rotation.y = Math.PI / 4;
  root.add(pyramid1, pyramid2, pyramid3);

  const sphinx = new THREE.Group();
  const body = box(7.2, 2.4, 3, 0xd0a355, 0, 1.8, 0);
  body.rotation.y = -0.08;
  const chest = box(2.7, 3.2, 2.8, 0xd7ad63, -2.2, 3.3, 0);
  const head = sphere(1.35, 0xe0b875, -2.2, 5.2, 0, 16, 10);
  const headdress = frustum(1.6, 2.3, 2.5, 0x4b78a8, -2.2, 4.9, 0);
  headdress.rotation.z = Math.PI;
  sphinx.add(body, chest, headdress, head);
  sphinx.position.set(-22, 0, -18);
  sphinx.rotation.y = 0.1;
  root.add(sphinx);
  return root;
}

function buildAustralia() {
  const root = new THREE.Group();
  const water = box(17, 0.25, 16, 0x4da6d9, -23, 0.05, -45);
  water.material.metalness = 0.08;
  water.material.roughness = 0.35;
  root.add(water);

  const opera = new THREE.Group();
  opera.add(box(15, 0.8, 8.5, 0xd8d2c2, 0, 0.4, 0));
  const shellPositions = [
    [-4.5, 0.3, 1.2, -0.55],
    [-1.5, -0.4, 1.45, -0.32],
    [1.7, 0.1, 1.35, 0.3],
    [4.4, -0.2, 1.1, 0.48],
  ];
  shellPositions.forEach(([x, z, scale, tilt]) => {
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(3.2, 18, 10, 0, Math.PI, 0, Math.PI / 2),
      material(0xf9f7ed, { roughness: 0.58 }),
    );
    shell.scale.set(0.55 * scale, 1.65 * scale, 1.05 * scale);
    shell.position.set(x, 1.1 + scale * 1.5, z);
    shell.rotation.z = tilt;
    shell.rotation.y = Math.PI / 2;
    opera.add(shell);
  });
  opera.position.set(-23, 0, -43);
  opera.rotation.y = 0.08;
  root.add(opera);

  const bridge = new THREE.Group();
  bridge.add(
    box(13, 0.5, 1.3, 0x596a77, 0, 3.2, 0),
    box(0.7, 7, 1.2, 0x596a77, -6, 3.5, 0),
    box(0.7, 7, 1.2, 0x596a77, 6, 3.5, 0),
  );
  const arch = new THREE.Mesh(
    new THREE.TorusGeometry(6.1, 0.35, 8, 24, Math.PI),
    material(0x596a77),
  );
  arch.rotation.z = Math.PI;
  arch.position.y = 3.2;
  bridge.add(arch);
  bridge.position.set(23, 0, -73);
  root.add(bridge);
  return root;
}

function buildUnitedKingdom() {
  const root = new THREE.Group();
  const tower = new THREE.Group();
  tower.add(
    box(4.3, 11.5, 4.3, 0xc9a469, 0, 5.75, 0),
    box(5, 2.4, 5, 0xd5b47b, 0, 12.3, 0),
    cone(3.2, 4.6, 4, 0x3a4654, 0, 15.8, 0),
    cylinder(0.18, 0.18, 3.4, 8, 0x3a4654, 0, 19.6, 0),
  );
  [0, Math.PI / 2, Math.PI, -Math.PI / 2].forEach((rotation) => {
    const face = new THREE.Mesh(new THREE.CircleGeometry(1.25, 28), material(0xf8f3dd));
    face.position.set(Math.sin(rotation) * 2.53, 12.4, Math.cos(rotation) * 2.53);
    face.rotation.y = rotation;
    const hand1 = box(0.12, 0.85, 0.08, 0x233142, 0, 0.2, 0.06);
    hand1.rotation.z = -0.45;
    const hand2 = box(0.1, 0.65, 0.08, 0x233142, 0, -0.05, 0.07);
    hand2.rotation.z = 1.0;
    face.add(hand1, hand2);
    tower.add(face);
  });
  tower.position.set(-23, 0, -52);
  tower.rotation.y = 0.15;
  root.add(tower);

  const bus = new THREE.Group();
  bus.add(
    box(7.6, 4.8, 3.1, 0xd22f39, 0, 2.7, 0),
    box(7.2, 1.55, 3.2, 0xf5f2e8, 0, 3.5, 0),
    cylinder(0.75, 0.75, 0.55, 16, 0x232b35, -2.5, 0.65, 1.6, Math.PI / 2, 0, 0),
    cylinder(0.75, 0.75, 0.55, 16, 0x232b35, 2.5, 0.65, 1.6, Math.PI / 2, 0, 0),
  );
  bus.position.set(23, 0, -22);
  bus.rotation.y = -0.16;
  root.add(bus);
  return root;
}

function buildUnitedStates() {
  const root = new THREE.Group();
  const statue = new THREE.Group();
  statue.add(
    box(6.6, 2.2, 6.6, 0xb99a70, 0, 1.1, 0),
    box(4.8, 4.8, 4.8, 0xd3b487, 0, 4.6, 0),
    frustum(1.7, 2.7, 6.5, 0x69a997, 0, 10.2, 0),
    sphere(1.35, 0x78b8a5, 0, 14.15, 0, 18, 12),
  );
  const leftArm = cylinder(0.4, 0.5, 5.2, 10, 0x69a997, -2.3, 10.3, 0, 0, 0, -1.28);
  const rightArm = cylinder(0.38, 0.48, 6.4, 10, 0x69a997, 1.7, 12.2, 0, 0, 0, 0.5);
  statue.add(leftArm, rightArm);
  const torch = cylinder(0.25, 0.35, 2.2, 10, 0x7f5a35, 3.2, 15.4, 0);
  const flame = cone(0.8, 2, 12, 0xff8a3d, 3.2, 17.5, 0);
  flame.userData.float = 0.12;
  flame.userData.baseY = flame.position.y;
  flame.userData.speed = 3.2;
  flame.userData.phase = 0.4;
  statue.add(torch, flame);
  for (let index = 0; index < 7; index += 1) {
    const spike = cone(0.18, 1.1, 6, 0x69a997, 0, 15.3, 0);
    const angle = (index / 7) * Math.PI * 2;
    spike.position.x = Math.cos(angle) * 1.1;
    spike.position.z = Math.sin(angle) * 1.1;
    spike.rotation.z = Math.cos(angle) * 0.4;
    spike.rotation.x = Math.sin(angle) * 0.4;
    statue.add(spike);
  }
  statue.position.set(-23, 0, -51);
  statue.rotation.y = 0.12;
  root.add(statue);

  const skyline = new THREE.Group();
  [6, 9, 5, 11, 7].forEach((height, index) => {
    skyline.add(box(2.8, height, 3, index % 2 ? 0x587a9d : 0x6f8da8, (index - 2) * 3.2, height / 2, 0));
  });
  skyline.position.set(24, 0, -76);
  root.add(skyline);
  return root;
}

function buildChina() {
  const root = new THREE.Group();
  const wall = new THREE.Group();
  for (let index = 0; index < 7; index += 1) {
    const segment = box(5.5, 2.1, 2.4, 0x9d8967, index * 4.6, 1.3 + Math.sin(index * 0.8) * 0.35, -index * 8.5);
    segment.rotation.y = -0.18 + index * 0.025;
    wall.add(segment);
    for (let blockIndex = 0; blockIndex < 4; blockIndex += 1) {
      const crenel = box(0.7, 0.7, 0.8, 0xb5a07b, index * 4.6 - 1.8 + blockIndex * 1.2, 2.65 + Math.sin(index * 0.8) * 0.35, -index * 8.5);
      crenel.rotation.y = segment.rotation.y;
      wall.add(crenel);
    }
  }
  wall.position.set(-34, 0, -16);
  wall.rotation.y = -0.06;
  root.add(wall);

  const watchTower = new THREE.Group();
  watchTower.add(
    box(6.5, 5.2, 6.5, 0x9d8967, 0, 2.6, 0),
    box(7.3, 0.7, 7.3, 0x604b37, 0, 5.55, 0),
  );
  watchTower.position.set(-22, 0, -70);
  root.add(watchTower);

  const pagoda = new THREE.Group();
  pagoda.add(box(5, 3.4, 5, 0xb53535, 0, 1.7, 0));
  [3.5, 6.0, 8.2].forEach((height, index) => {
    pagoda.add(cone(4.2 - index * 0.65, 1.4, 4, index % 2 ? 0x2f3f4d : 0x344d3f, 0, height, 0));
    if (index < 2) pagoda.add(box(3.4 - index * 0.5, 2.2, 3.4 - index * 0.5, 0xb53535, 0, height + 1.35, 0));
  });
  pagoda.position.set(24, 0, -28);
  pagoda.rotation.y = Math.PI / 4;
  root.add(pagoda);
  return root;
}

function buildBrazil() {
  const root = new THREE.Group();
  const mountain = cone(9, 7.5, 20, 0x3c8c61, -23, 3.75, -55);
  mountain.scale.z = 0.82;
  root.add(mountain);

  const christ = new THREE.Group();
  christ.add(
    frustum(1.1, 1.8, 7.5, 0xdad7ca, 0, 6.5, 0),
    sphere(1.25, 0xdad7ca, 0, 11.1, 0, 16, 12),
    box(10.8, 0.95, 1.05, 0xdad7ca, 0, 8.7, 0),
  );
  christ.position.set(-23, 5.2, -55);
  christ.rotation.y = 0.08;
  root.add(christ);

  root.add(makePalmTree(22, -28, 1.15), makePalmTree(27, -42, 0.95), makePalmTree(19, -74, 0.8));
  const football = sphere(1.2, 0xf5f5f5, 24, 1.25, -18, 16, 12);
  football.userData.float = 0.14;
  football.userData.baseY = football.position.y;
  football.userData.speed = 2.3;
  football.userData.phase = 0.8;
  root.add(football);
  return root;
}

function buildIndia() {
  const root = new THREE.Group();
  const taj = new THREE.Group();
  taj.add(
    box(14, 1.1, 9, 0xece8d9, 0, 0.55, 0),
    box(9.5, 7, 7, 0xf7f4e9, 0, 4.6, 0),
    cylinder(2.5, 2.8, 1.2, 20, 0xf7f4e9, 0, 8.7, 0),
  );
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(3.25, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    material(0xf9f6ed),
  );
  dome.scale.y = 1.25;
  dome.position.y = 9.15;
  taj.add(dome, cone(0.35, 2.3, 8, 0xc7a24e, 0, 13.25, 0));

  [-5.7, 5.7].forEach((x) => {
    const arch = new THREE.Mesh(new THREE.CircleGeometry(1.25, 22, 0, Math.PI), material(0x5c6d7a));
    arch.position.set(x * 0.42, 4.4, 3.52);
    taj.add(arch);
  });

  [[-7.6, -4.2], [7.6, -4.2], [-7.6, 4.2], [7.6, 4.2]].forEach(([x, z]) => {
    taj.add(
      cylinder(0.48, 0.62, 10.2, 14, 0xf4f0e2, x, 5.1, z),
      sphere(0.7, 0xf4f0e2, x, 10.5, z, 14, 8),
      cone(0.18, 1.8, 8, 0xc7a24e, x, 11.9, z),
    );
  });
  taj.position.set(-23, 0, -51);
  taj.rotation.y = 0.06;
  root.add(taj);

  const pool = box(5.2, 0.15, 20, 0x4bb4cf, 23, 0.08, -48);
  pool.material.roughness = 0.25;
  root.add(pool, makeTree(19, -22, 0.9), makeTree(27, -72, 0.9));
  return root;
}

function buildItaly() {
  const root = new THREE.Group();
  const colosseum = new THREE.Group();
  const columns = 22;
  for (let index = 0; index < columns; index += 1) {
    const angle = (index / columns) * Math.PI * 2;
    const x = Math.cos(angle) * 7.2;
    const z = Math.sin(angle) * 4.8;
    const column = box(0.75, 5.4, 0.9, 0xc7a070, x, 2.7, z);
    column.rotation.y = -angle;
    colosseum.add(column);

    if (index % 2 === 0) {
      const archDark = box(1.15, 2.6, 0.5, 0x5f4c3a, x * 0.92, 2.25, z * 0.92);
      archDark.rotation.y = -angle;
      colosseum.add(archDark);
    }
  }
  const lowerRing = new THREE.Mesh(new THREE.TorusGeometry(6.1, 0.65, 8, 36), material(0xb98d5d));
  lowerRing.rotation.x = Math.PI / 2;
  lowerRing.scale.z = 0.7;
  lowerRing.position.y = 0.8;
  const upperRing = lowerRing.clone();
  upperRing.material = material(0xb98d5d);
  upperRing.scale.set(1.18, 1.18, 0.82);
  upperRing.position.y = 5.5;
  colosseum.add(lowerRing, upperRing);
  colosseum.position.set(-23, 0, -52);
  colosseum.rotation.y = 0.16;
  root.add(colosseum);

  const leaningTower = new THREE.Group();
  for (let floor = 0; floor < 6; floor += 1) {
    leaningTower.add(
      cylinder(2.2, 2.35, 1.15, 20, 0xe6dcc8, 0, 0.6 + floor * 1.15, 0),
      new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.16, 6, 20), material(0xbcae96)),
    );
    const torus = leaningTower.children[leaningTower.children.length - 1];
    torus.rotation.x = Math.PI / 2;
    torus.position.y = 1.1 + floor * 1.15;
  }
  leaningTower.rotation.z = -0.12;
  leaningTower.position.set(23, 0, -28);
  root.add(leaningTower);
  return root;
}

function makeCherryTree(x, z, scale = 1) {
  const tree = new THREE.Group();
  tree.add(cylinder(0.35, 0.55, 4.6, 8, 0x7b5137, 0, 2.3, 0));
  [[0, 5.2, 0], [-1.1, 4.7, 0.2], [1.2, 4.9, -0.2], [0.3, 5.8, 0.5]].forEach(([px, py, pz]) => {
    tree.add(sphere(1.55, 0xff9fc6, px, py, pz, 12, 8));
  });
  tree.scale.setScalar(scale);
  tree.position.set(x, 0, z);
  return tree;
}

function makeTree(x, z, scale = 1) {
  const tree = new THREE.Group();
  tree.add(
    cylinder(0.32, 0.48, 4, 8, 0x79543b, 0, 2, 0),
    sphere(1.8, 0x4caa65, 0, 5.2, 0, 10, 8),
    sphere(1.4, 0x62bd72, -1, 4.8, 0.2, 10, 8),
    sphere(1.4, 0x62bd72, 1, 4.8, -0.2, 10, 8),
  );
  tree.scale.setScalar(scale);
  tree.position.set(x, 0, z);
  return tree;
}

function makePalmTree(x, z, scale = 1) {
  const tree = new THREE.Group();
  const trunk = cylinder(0.3, 0.55, 6, 10, 0xa66f3e, 0, 3, 0);
  trunk.rotation.z = 0.08;
  tree.add(trunk);
  for (let index = 0; index < 7; index += 1) {
    const leaf = box(0.45, 0.18, 4.3, 0x2e9b57, 0, 6.2, 0);
    leaf.rotation.y = (index / 7) * Math.PI * 2;
    leaf.rotation.x = 0.35;
    leaf.position.x = Math.sin(leaf.rotation.y) * 1.7;
    leaf.position.z = Math.cos(leaf.rotation.y) * 1.7;
    tree.add(leaf);
  }
  tree.scale.setScalar(scale);
  tree.position.set(x, 0, z);
  return tree;
}

function makeBillboard(title, subtitle) {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 220;
  const context = canvas.getContext("2d");
  context.fillStyle = "rgba(255,255,255,.94)";
  roundedRect(context, 10, 10, 748, 200, 46);
  context.fill();
  context.strokeStyle = "rgba(89,109,255,.38)";
  context.lineWidth = 8;
  context.stroke();
  context.fillStyle = "#173f5f";
  context.font = "900 66px sans-serif";
  context.textAlign = "center";
  context.fillText(title, 384, 88, 690);
  context.fillStyle = "#7257bb";
  context.font = "700 42px sans-serif";
  context.fillText(subtitle, 384, 157, 680);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(12.5, 3.6, 1);
  sprite.renderOrder = 8;
  return sprite;
}

function box(width, height, depth, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const object = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material(color));
  object.position.set(x, y, z);
  object.rotation.set(rx, ry, rz);
  return object;
}

function cylinder(top, bottom, height, segments, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const object = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, segments), material(color));
  object.position.set(x, y, z);
  object.rotation.set(rx, ry, rz);
  return object;
}

function frustum(top, bottom, height, color, x = 0, y = 0, z = 0) {
  const object = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, 4), material(color));
  object.position.set(x, y, z);
  return object;
}

function cone(radius, height, segments, color, x = 0, y = 0, z = 0) {
  const object = new THREE.Mesh(new THREE.ConeGeometry(radius, height, segments), material(color));
  object.position.set(x, y, z);
  return object;
}

function sphere(radius, color, x = 0, y = 0, z = 0, widthSegments = 14, heightSegments = 10) {
  const object = new THREE.Mesh(new THREE.SphereGeometry(radius, widthSegments, heightSegments), material(color));
  object.position.set(x, y, z);
  return object;
}

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.78,
    metalness: options.metalness ?? 0.03,
    side: options.side ?? THREE.FrontSide,
  });
}

function setShadows(root) {
  root.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
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

addEventListener("pagehide", () => {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  removeActiveScene();
});
