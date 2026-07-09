import * as THREE from "./three-reading-wrapper.js";

const HOTSPOT_DATA = [
  {
    country: "日本",
    childActions: [
      [0, "日本鳥居", "鳥居是日本神社入口的標誌，象徵由日常世界進入神聖地方。"],
      [1, "富士山", "富士山是日本最高的山，也是日本最著名的自然地標之一。"],
      [2, "櫻花", "櫻花在春天盛開，常常代表新的開始和珍惜美好時刻。"],
      [3, "櫻花", "櫻花花期很短，提醒我們把握時間，多閱讀、多學習。"],
    ],
  },
  {
    country: "法國",
    childActions: [
      [0, "巴黎鐵塔", "巴黎鐵塔是法國巴黎的代表地標，原本為世界博覽會而建。"],
      [1, "凱旋門", "凱旋門位於巴黎香榭麗舍大道西端，用來紀念重要歷史事件。"],
    ],
  },
  {
    country: "埃及",
    childActions: [
      [0, "金字塔", "埃及金字塔是古代法老的陵墓，展現古埃及人的建築智慧。"],
      [1, "金字塔", "金字塔巨石層層堆疊，是世界上最有名的古文明建築之一。"],
      [2, "金字塔", "小金字塔和大金字塔一起形成壯觀的沙漠景色。"],
      [3, "獅身人面像", "獅身人面像有獅子的身體和人的頭像，是埃及文明的神秘象徵。"],
    ],
  },
  {
    country: "澳洲",
    childActions: [
      [1, "悉尼歌劇院", "悉尼歌劇院外形像白色帆船，是澳洲最著名的表演藝術中心。"],
      [2, "悉尼港灣大橋", "悉尼港灣大橋連接港口兩岸，是澳洲重要的交通和城市地標。"],
    ],
  },
  {
    country: "英國",
    childActions: [
      [0, "大笨鐘", "大笨鐘是倫敦著名鐘樓，提醒我們善用時間閱讀。"],
      [1, "紅色雙層巴士", "紅色雙層巴士是倫敦街道的經典交通工具。"],
    ],
  },
  {
    country: "美國",
    childActions: [
      [0, "自由女神像", "自由女神像位於紐約港，象徵自由、希望和勇氣。"],
      [1, "美國城市天際線", "高樓大廈組成城市天際線，展現現代城市的活力。"],
    ],
  },
  {
    country: "中國",
    childActions: [
      [0, "萬里長城", "萬里長城沿著山脈延伸，是中國重要的歷史建築。"],
      [1, "長城烽火台", "烽火台以前用來傳遞訊息，是古代防禦系統的一部分。"],
      [2, "中國塔樓", "中國塔樓有層層向上的屋頂，展現傳統建築特色。"],
    ],
  },
  {
    country: "巴西",
    childActions: [
      [0, "綠色山丘", "巴西有壯麗的山丘和海岸景色，展示熱帶自然風貌。"],
      [1, "基督像", "里約熱內盧的基督像張開雙臂，是巴西著名地標。"],
      [2, "棕櫚樹", "棕櫚樹常見於熱帶地區，讓人想到陽光和海灘。"],
      [5, "足球", "足球是巴西最受歡迎的運動之一，代表熱情和團隊合作。"],
    ],
  },
  {
    country: "印度",
    childActions: [
      [0, "泰姬陵", "泰姬陵以白色大理石建成，是印度最著名的世界文化遺產之一。"],
      [1, "倒影水池", "泰姬陵前方的水池讓建築倒影更加美麗。"],
      [2, "印度花園", "花園和水道令泰姬陵周圍環境更加平衡和優雅。"],
    ],
  },
  {
    country: "意大利",
    childActions: [
      [0, "羅馬競技場", "羅馬競技場是古羅馬大型建築，見證古代城市生活和歷史。"],
      [1, "比薩斜塔", "比薩斜塔因為地基下陷而傾斜，成為意大利有名的地標。"],
    ],
  },
];

const currentLocationLabel = document.querySelector("#currentLocationLabel");
const trackCanvas = document.querySelector("#trackCanvas");
const shell = document.querySelector(".track-shell");
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const screenPoint = new THREE.Vector3();
let bound = false;
let readyAttempts = 0;
let pointerStart = null;
let panda = null;
let toast = null;

waitForScene();

function waitForScene() {
  if (!window.__readingScene || !window.__readingCamera || !window.__readingRenderer) {
    readyAttempts += 1;
    if (readyAttempts < 600) requestAnimationFrame(waitForScene);
    return;
  }

  bindRobustClick();
  if (currentLocationLabel) {
    new MutationObserver(scheduleSync).observe(currentLocationLabel, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }
  scheduleSync();
}

function scheduleSync() {
  for (const delay of [0, 160, 420, 900]) setTimeout(syncHotspots, delay);
}

function syncHotspots() {
  const scene = window.__readingScene;
  if (!scene) return;

  clearHotspots();
  removePandaIfNeeded();

  const index = currentLocationIndex();
  const group = scene.children.find((child) => child.name === `country-landmarks-${index + 1}` || child.userData?.landmarkScene);
  const data = HOTSPOT_DATA[index];
  if (!group || !data) return;

  const contentRoot = group.children.find((child) => child.isGroup && !child.isSprite) || group.children[0];
  if (contentRoot?.children?.length) {
    data.childActions.forEach(([childIndex, label, text]) => {
      const target = contentRoot.children[childIndex];
      if (target) markHotspot(target, makeAction(label, text));
    });
  }

  if (index === 6) addPanda(scene);
}

function clearHotspots() {
  const scene = window.__readingScene;
  if (!scene) return;
  scene.traverse((object) => {
    if (!object.userData?.hotspotFix) return;
    delete object.userData.hotspotFix;
    delete object.userData.hotspotFixAction;
    delete object.userData.audioAction;
  });
}

function makeAction(label, text) {
  return { type: "landmark", label, text, lang: "zh-HK" };
}

function markHotspot(root, action) {
  root.userData.hotspotFix = true;
  root.userData.hotspotFixAction = action;
  root.userData.audioAction = action;
  root.traverse((object) => {
    if (!object.isMesh && !object.isSprite && !object.isGroup) return;
    object.userData.hotspotFix = true;
    object.userData.hotspotFixAction = action;
    object.userData.audioAction = action;
  });
}

function addPanda(scene) {
  if (panda) return;
  panda = makePanda();
  panda.name = "china-panda-hotspot-fix";
  panda.position.set(31, 0.35, -43);
  markHotspot(panda, makeAction("熊貓", "熊貓是中國珍貴的動物，黑白色的外形十分可愛，也提醒我們保護自然。"));
  scene.add(panda);
}

function removePandaIfNeeded() {
  if (!panda || !window.__readingScene) return;
  if (currentLocationIndex() === 6) return;
  window.__readingScene.remove(panda);
  panda.traverse((object) => {
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.filter(Boolean).forEach((material) => material.dispose?.());
  });
  panda = null;
}

function makePanda() {
  const group = new THREE.Group();
  const white = material(0xf8f8f2);
  const black = material(0x222733);
  group.add(
    sphere(1.65, white, 0, 2.1, 0, 18, 12),
    sphere(1.25, white, 0, 4.0, 0, 18, 12),
    sphere(0.42, black, -0.78, 4.95, 0, 12, 8),
    sphere(0.42, black, 0.78, 4.95, 0, 12, 8),
    sphere(0.32, black, -0.42, 4.1, 1.0, 10, 8),
    sphere(0.32, black, 0.42, 4.1, 1.0, 10, 8),
    sphere(0.18, black, 0, 3.82, 1.08, 10, 8),
    cylinder(0.34, 0.38, 1.9, 10, 0x222733, -1.25, 1.65, 0, 0, 0, 0.18),
    cylinder(0.34, 0.38, 1.9, 10, 0x222733, 1.25, 1.65, 0, 0, 0, -0.18),
    cylinder(0.28, 0.34, 1.7, 10, 0x222733, -0.62, 0.85, 0.1, 0, 0, 0.08),
    cylinder(0.28, 0.34, 1.7, 10, 0x222733, 0.62, 0.85, 0.1, 0, 0, -0.08),
  );
  const label = makeTextSprite("🐼 熊貓", "點擊介紹");
  label.position.set(0, 6.2, 0.3);
  label.scale.set(5.4, 1.9, 1);
  group.add(label);
  group.rotation.y = -0.25;
  return group;
}

function bindRobustClick() {
  const element = window.__readingRenderer?.domElement || trackCanvas;
  if (!element || bound) return;
  bound = true;

  element.addEventListener("pointerdown", (event) => {
    pointerStart = { x: event.clientX, y: event.clientY, time: performance.now() };
  }, { passive: true });

  element.addEventListener("click", (event) => {
    if (pointerStart) {
      const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
      const elapsed = performance.now() - pointerStart.time;
      pointerStart = null;
      if (moved > 10 || elapsed > 1000) return;
    }

    const action = pickAction(event);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    speak(action);
  }, true);
}

function pickAction(event) {
  const camera = window.__readingCamera;
  const scene = window.__readingScene;
  const element = window.__readingRenderer?.domElement;
  if (!camera || !scene || !element) return null;

  const rect = element.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
  pointer.y = -(((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);

  const candidates = [];
  scene.traverse((object) => {
    if (object.visible === false) return;
    if (object.userData?.hotspotFixAction || object.userData?.audioAction) candidates.push(object);
  });

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(candidates, true);
  if (hits.length) {
    let object = hits[0].object;
    while (object && !object.userData?.hotspotFixAction && !object.userData?.audioAction) object = object.parent;
    return object?.userData?.hotspotFixAction || object?.userData?.audioAction || null;
  }

  return nearestScreenAction(event, candidates, camera, rect);
}

function nearestScreenAction(event, candidates, camera, rect) {
  let best = null;
  const roots = new Set();
  candidates.forEach((object) => {
    let root = object;
    while (root.parent && !root.userData?.hotspotFixAction && !root.userData?.audioAction) root = root.parent;
    if (root.userData?.hotspotFixAction || root.userData?.audioAction) roots.add(root);
  });

  roots.forEach((object) => {
    object.getWorldPosition(screenPoint);
    screenPoint.project(camera);
    if (screenPoint.z < -1 || screenPoint.z > 1) return;
    const x = rect.left + (screenPoint.x + 1) * rect.width / 2;
    const y = rect.top + (-screenPoint.y + 1) * rect.height / 2;
    const distance = Math.hypot(event.clientX - x, event.clientY - y);
    const threshold = object.userData?.audioAction?.type === "person" ? 135 : 115;
    if (distance <= threshold && (!best || distance < best.distance)) {
      best = { distance, action: object.userData.hotspotFixAction || object.userData.audioAction };
    }
  });

  return best?.action || null;
}

function speak(action) {
  const label = action.type === "person" ? "當地語言" : "名勝介紹";
  announce(`${label}：${action.label || "地標"}｜${action.text}`);

  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(action.text);
  utterance.lang = action.lang || "zh-HK";
  utterance.rate = action.type === "person" ? 0.9 : 1.05;
  utterance.pitch = 1;
  const voice = findVoice(utterance.lang);
  if (voice) utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
}

function findVoice(lang) {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  const base = String(lang || "").split("-")[0].toLowerCase();
  return voices.find((voice) => voice.lang === lang)
    || voices.find((voice) => voice.lang?.toLowerCase?.().startsWith(`${base}-`))
    || null;
}

function announce(message) {
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "world-audio-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    (shell || trackCanvas || document.body).append(toast);
  }
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toast.hideTimer);
  toast.hideTimer = setTimeout(() => toast?.classList.remove("is-visible"), 4300);
}

function currentLocationIndex() {
  const text = currentLocationLabel?.textContent || "地方 1";
  const match = text.match(/地方\s*(\d+)/);
  const value = Number(match?.[1] || 1) - 1;
  return Math.max(0, Math.min(HOTSPOT_DATA.length - 1, value));
}

function makeTextSprite(title, subtitle) {
  const canvas = document.createElement("canvas");
  canvas.width = 520;
  canvas.height = 190;
  const context = canvas.getContext("2d");
  context.fillStyle = "rgba(255,255,255,.92)";
  roundedRect(context, 8, 8, 504, 174, 34);
  context.fill();
  context.strokeStyle = "#18a999";
  context.lineWidth = 7;
  context.stroke();
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#173f5f";
  context.font = '900 52px "Arial", sans-serif';
  context.fillText(title, 260, 70, 460);
  context.fillStyle = "#7257bb";
  context.font = '800 32px "Arial", sans-serif';
  context.fillText(subtitle, 260, 130, 460);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.renderOrder = 26;
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

function sphere(radius, matOrColor, x = 0, y = 0, z = 0, widthSegments = 14, heightSegments = 10) {
  const object = new THREE.Mesh(new THREE.SphereGeometry(radius, widthSegments, heightSegments), typeof matOrColor === "number" ? material(matOrColor) : matOrColor);
  object.position.set(x, y, z);
  return object;
}

function material(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.03 });
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
