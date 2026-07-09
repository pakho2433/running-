import * as THREE from "./three-reading-wrapper.js";

const WORLD_AUDIO_STAGES = [
  {
    country: "日本",
    flag: "🇯🇵",
    landmark: "富士山與鳥居",
    person: "👘",
    personLabel: "日本語",
    intro: "日本的富士山和鳥居，是日本文化的重要象徵。多閱讀，就像登山一樣一步一步前進。",
    readingFun: "読書は楽しいです",
    lang: "ja-JP",
    fallbackText: "Dokusho wa tanoshii desu.",
    color: 0xd93b35,
    accent: 0xf7fbff,
  },
  {
    country: "法國",
    flag: "🇫🇷",
    landmark: "巴黎鐵塔",
    person: "🧑‍🎨",
    personLabel: "Français",
    intro: "這裏是法國巴黎鐵塔，代表創意和工程智慧。打開書本，就像展開一趟藝術旅行。",
    readingFun: "La lecture est amusante.",
    lang: "fr-FR",
    fallbackText: "La lecture est amusante.",
    color: 0x4b6fd8,
    accent: 0xf4d6a0,
  },
  {
    country: "埃及",
    flag: "🇪🇬",
    landmark: "金字塔",
    person: "🧕",
    personLabel: "العربية",
    intro: "埃及金字塔保存了古代文明的秘密。閱讀歷史故事，可以帶我們穿越幾千年。",
    readingFun: "القراءة ممتعة",
    lang: "ar",
    fallbackText: "Al qira'ah mumti'ah.",
    color: 0xd8aa57,
    accent: 0x845c2c,
  },
  {
    country: "澳洲",
    flag: "🇦🇺",
    landmark: "悉尼歌劇院",
    person: "🧑‍🌾",
    personLabel: "English",
    intro: "澳洲的悉尼歌劇院外形像白色帆船。閱讀讓想像力出海，探索更遠的世界。",
    readingFun: "Reading is fun.",
    lang: "en-AU",
    fallbackText: "Reading is fun.",
    color: 0x4da6d9,
    accent: 0xf9f7ed,
  },
  {
    country: "英國",
    flag: "🇬🇧",
    landmark: "大笨鐘",
    person: "💂",
    personLabel: "English",
    intro: "英國大笨鐘是倫敦著名地標。每天用一點時間閱讀，知識就會慢慢累積。",
    readingFun: "Reading is fun.",
    lang: "en-GB",
    fallbackText: "Reading is fun.",
    color: 0xd22f39,
    accent: 0xc9a469,
  },
  {
    country: "美國",
    flag: "🇺🇸",
    landmark: "自由女神像",
    person: "🧢",
    personLabel: "English",
    intro: "美國自由女神像象徵希望和勇氣。閱讀可以打開新想法，讓我們更有信心。",
    readingFun: "Reading is fun.",
    lang: "en-US",
    fallbackText: "Reading is fun.",
    color: 0x69a997,
    accent: 0xff8a3d,
  },
  {
    country: "中國",
    flag: "🇨🇳",
    landmark: "萬里長城",
    person: "🧑‍🏫",
    personLabel: "中文",
    intro: "中國萬里長城綿延千里，代表堅毅精神。持續閱讀，也能一步一步走得更遠。",
    readingFun: "閱讀很有趣",
    lang: "zh-CN",
    fallbackText: "閱讀很有趣",
    color: 0xb53535,
    accent: 0xf2cf63,
  },
  {
    country: "巴西",
    flag: "🇧🇷",
    landmark: "基督像",
    person: "⚽",
    personLabel: "Português",
    intro: "巴西里約的基督像張開雙臂迎接世界。閱讀也會打開心胸，認識不同文化。",
    readingFun: "Ler é divertido.",
    lang: "pt-BR",
    fallbackText: "Ler é divertido.",
    color: 0x3c8c61,
    accent: 0xf5d63d,
  },
  {
    country: "印度",
    flag: "🇮🇳",
    landmark: "泰姬陵",
    person: "🧑‍🍳",
    personLabel: "हिन्दी",
    intro: "印度泰姬陵以白色大理石建成，非常優雅。閱讀故事，能感受世界的美。",
    readingFun: "पढ़ना मज़ेदार है।",
    lang: "hi-IN",
    fallbackText: "Padhna mazedaar hai.",
    color: 0xf0a04b,
    accent: 0xf7f4e9,
  },
  {
    country: "意大利",
    flag: "🇮🇹",
    landmark: "羅馬競技場",
    person: "🧑‍🍳",
    personLabel: "Italiano",
    intro: "意大利羅馬競技場見證古羅馬歷史。閱讀讓古老故事重新在眼前出現。",
    readingFun: "Leggere è divertente.",
    lang: "it-IT",
    fallbackText: "Leggere è divertente.",
    color: 0xb98d5d,
    accent: 0x70b76b,
  },
];

const currentLocationLabel = document.querySelector("#currentLocationLabel");
const trackCanvas = document.querySelector("#trackCanvas");
const shell = document.querySelector(".track-shell");
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

let activeGroup = null;
let activeIndex = -1;
let readyAttempts = 0;
let pointerStart = null;
let toast = null;
let voicePromise = null;

injectStyle();
waitForTrack();

function waitForTrack() {
  if (!window.__readingScene || !window.__readingCamera || !window.__readingRenderer) {
    readyAttempts += 1;
    if (readyAttempts < 600) requestAnimationFrame(waitForTrack);
    return;
  }

  bindPointerAudio();
  warmUpVoices();

  if (currentLocationLabel) {
    new MutationObserver(syncWorldAudioStage).observe(currentLocationLabel, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  syncWorldAudioStage();
}

function syncWorldAudioStage() {
  const index = currentLocationIndex();
  if (index === activeIndex && activeGroup) return;

  removeActiveGroup();
  clearLandmarkAudioMarks();
  activeIndex = index;

  const definition = WORLD_AUDIO_STAGES[index] || WORLD_AUDIO_STAGES[0];
  const group = new THREE.Group();
  group.name = `world-audio-stage-${index + 1}`;
  group.userData.worldAudioStage = true;

  const landmarkPin = makeLandmarkAudioPin(definition);
  landmarkPin.position.set(-31, 0.35, -17);
  makeClickable(landmarkPin, landmarkAction(definition));

  const guide = makeGuidePerson(definition);
  guide.position.set(31, 0.35, -28);
  makeClickable(guide, personAction(definition));

  group.add(landmarkPin, guide);
  setShadows(group);
  window.__readingScene.add(group);
  activeGroup = group;

  markExistingLandmarkScene(definition, index, 0);
}

function landmarkAction(definition) {
  return {
    type: "landmark",
    text: definition.intro,
    lang: "zh-HK",
    fallbackText: definition.intro,
    label: `${definition.flag} ${definition.landmark}`,
  };
}

function personAction(definition) {
  return {
    type: "person",
    text: definition.readingFun,
    lang: definition.lang,
    fallbackText: definition.fallbackText || definition.readingFun,
    label: `${definition.flag} ${definition.personLabel}`,
  };
}

function currentLocationIndex() {
  const text = currentLocationLabel?.textContent || "地方 1";
  const match = text.match(/地方\s*(\d+)/);
  const value = Number(match?.[1] || 1) - 1;
  return Math.max(0, Math.min(WORLD_AUDIO_STAGES.length - 1, value));
}

function markExistingLandmarkScene(definition, index, attempt) {
  const scene = window.__readingScene;
  if (!scene || index !== activeIndex) return;

  const countryGroup = scene.children.find((child) => child.name === `country-landmarks-${index + 1}` || child.userData?.landmarkScene);
  if (!countryGroup) {
    if (attempt < 20) setTimeout(() => markExistingLandmarkScene(definition, index, attempt + 1), 120);
    return;
  }

  const action = landmarkAction(definition);
  countryGroup.traverse((object) => {
    if (!object.isMesh && !object.isSprite) return;
    object.userData.audioAction = action;
    object.userData.worldAudioLandmark = true;
  });
}

function clearLandmarkAudioMarks() {
  const scene = window.__readingScene;
  if (!scene) return;
  scene.traverse((object) => {
    if (!object.userData?.worldAudioLandmark) return;
    delete object.userData.audioAction;
    delete object.userData.worldAudioLandmark;
  });
}

function bindPointerAudio() {
  const element = window.__readingRenderer?.domElement || trackCanvas;
  if (!element || element.dataset.worldAudioBound === "true") return;
  element.dataset.worldAudioBound = "true";

  element.addEventListener("pointerdown", (event) => {
    pointerStart = { x: event.clientX, y: event.clientY, time: performance.now() };
  }, { passive: true });

  element.addEventListener("click", (event) => {
    if (!activeGroup) return;
    if (pointerStart) {
      const distance = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
      const elapsed = performance.now() - pointerStart.time;
      pointerStart = null;
      if (distance > 9 || elapsed > 900) return;
    }

    const action = pickAudioAction(event);
    if (!action) return;

    event.preventDefault();
    event.stopPropagation();
    void playAudioAction(action);
  }, true);
}

function pickAudioAction(event) {
  const camera = window.__readingCamera;
  const element = window.__readingRenderer?.domElement;
  const scene = window.__readingScene;
  if (!camera || !element || !scene) return null;

  const rect = element.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
  pointer.y = -(((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);

  raycaster.setFromCamera(pointer, camera);
  const candidates = [];
  scene.traverse((object) => {
    if (object.visible !== false && object.userData?.audioAction) candidates.push(object);
  });

  const hits = raycaster.intersectObjects(candidates, true);
  if (!hits.length) return null;

  let object = hits[0].object;
  while (object && !object.userData?.audioAction) object = object.parent;
  return object?.userData?.audioAction || null;
}

async function playAudioAction(action) {
  const prefix = action.type === "landmark" ? "名勝介紹" : "當地語言";
  announce(`${prefix}：${action.label}｜${action.text}`);

  if (!("speechSynthesis" in window)) {
    announce("這部裝置暫時不支援語音播放。");
    return;
  }

  window.speechSynthesis.cancel();
  const voices = await warmUpVoices();
  const voice = findVoice(action.lang, voices);
  const useFallback = action.type === "person" && !voice && action.fallbackText && action.fallbackText !== action.text;

  const utterance = new SpeechSynthesisUtterance(useFallback ? action.fallbackText : action.text);
  utterance.lang = useFallback ? "en-US" : action.lang;
  utterance.rate = action.type === "landmark" ? 1.06 : 0.9;
  utterance.pitch = action.type === "landmark" ? 1.05 : 1;
  utterance.volume = 1;

  const selectedVoice = useFallback ? findVoice("en-US", voices) : voice;
  if (selectedVoice) utterance.voice = selectedVoice;

  window.speechSynthesis.speak(utterance);
}

function warmUpVoices() {
  if (!("speechSynthesis" in window)) return Promise.resolve([]);
  const existing = window.speechSynthesis.getVoices();
  if (existing.length) return Promise.resolve(existing);
  if (voicePromise) return voicePromise;

  voicePromise = new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(window.speechSynthesis.getVoices() || []);
    };
    window.speechSynthesis.onvoiceschanged = finish;
    setTimeout(finish, 700);
  });
  return voicePromise;
}

function findVoice(lang, voices = window.speechSynthesis?.getVoices?.() || []) {
  const base = lang.split("-")[0].toLowerCase();
  return voices.find((voice) => voice.lang === lang)
    || voices.find((voice) => voice.lang?.toLowerCase?.() === base)
    || voices.find((voice) => voice.lang?.toLowerCase?.().startsWith(`${base}-`))
    || null;
}

function makeLandmarkAudioPin(definition) {
  const root = new THREE.Group();

  const base = cylinder(1.35, 1.55, 0.42, 24, 0xffffff, 0, 0.22, 0);
  const rim = cylinder(1.5, 1.5, 0.1, 24, definition.color, 0, 0.5, 0);
  const pole = cylinder(0.09, 0.09, 2.4, 10, definition.color, 0, 1.65, 0);
  const orb = sphere(0.42, definition.accent, 0, 3.02, 0, 16, 10);
  root.add(base, rim, pole, orb);

  const label = makeTextSprite("🔊 名勝", "點擊模型", {
    width: 420,
    height: 180,
    titleSize: 48,
    subtitleSize: 30,
    background: "rgba(255,255,255,.92)",
    border: "#596dff",
    titleColor: "#173f5f",
    subtitleColor: "#7257bb",
  });
  label.position.set(0, 4.05, 0.35);
  label.scale.set(4.8, 2.0, 1);
  root.add(label);

  const hitbox = new THREE.Mesh(
    new THREE.PlaneGeometry(5.2, 5.4),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.02, depthWrite: false, side: THREE.DoubleSide }),
  );
  hitbox.position.set(0, 2.8, 0.65);
  root.add(hitbox);
  return root;
}

function makeGuidePerson(definition) {
  const root = new THREE.Group();

  const shadow = cylinder(1.85, 1.85, 0.08, 28, 0x173f5f, 0, 0.04, 0);
  shadow.material.transparent = true;
  shadow.material.opacity = 0.16;
  root.add(shadow);

  const legLeft = box(0.42, 2.0, 0.42, 0x26364f, -0.42, 1.05, 0);
  const legRight = box(0.42, 2.0, 0.42, 0x26364f, 0.42, 1.05, 0);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.75, 1.45, 6, 14), material(definition.color));
  body.position.y = 2.75;

  const head = sphere(0.68, 0xf1bd8c, 0, 4.35, 0, 18, 12);
  const hair = sphere(0.72, 0x38261c, 0, 4.66, -0.06, 18, 8);
  hair.scale.y = 0.55;

  const armLeft = cylinder(0.16, 0.18, 2.1, 10, 0xf1bd8c, -0.9, 3.05, 0, 0, 0, 0.55);
  const armRight = cylinder(0.16, 0.18, 2.1, 10, 0xf1bd8c, 0.9, 3.05, 0, 0, 0, -0.55);
  const badge = cylinder(0.42, 0.42, 0.08, 20, definition.accent, 0, 3.22, 0.68, Math.PI / 2, 0, 0);
  root.add(legLeft, legRight, body, head, hair, armLeft, armRight, badge);

  const icon = makeTextSprite(`${definition.person} ${definition.flag}`, "按人物", {
    width: 420,
    height: 190,
    titleSize: 54,
    subtitleSize: 32,
    background: "rgba(255,255,255,.92)",
    border: "#18a999",
    titleColor: "#173f5f",
    subtitleColor: "#095c68",
  });
  icon.position.set(3.7, 5.3, 0.45);
  icon.scale.set(4.9, 2.0, 1);
  root.add(icon);

  const phrase = makeTextSprite(definition.personLabel, definition.readingFun, {
    width: 620,
    height: 210,
    titleSize: 34,
    subtitleSize: 36,
    background: "rgba(255,255,255,.88)",
    border: "#18a999",
    titleColor: "#173f5f",
    subtitleColor: "#095c68",
  });
  phrase.position.set(4.0, 3.25, 0.5);
  phrase.scale.set(5.6, 1.9, 1);
  root.add(phrase);

  const hitbox = new THREE.Mesh(
    new THREE.PlaneGeometry(7.5, 7.2),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.02, depthWrite: false, side: THREE.DoubleSide }),
  );
  hitbox.position.set(1.7, 3.7, 0.85);
  root.add(hitbox);
  return root;
}

function makeClickable(root, action) {
  root.userData.audioAction = action;
  root.traverse((object) => {
    object.userData.audioAction = action;
  });
}

function makeTextSprite(title, subtitle, options = {}) {
  const width = options.width || 768;
  const height = options.height || 260;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  context.fillStyle = options.background || "rgba(255,255,255,.94)";
  roundedRect(context, 10, 10, width - 20, height - 20, Math.min(38, height / 4));
  context.fill();

  context.strokeStyle = options.border || "#596dff";
  context.lineWidth = 7;
  context.stroke();

  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = options.titleColor || "#173f5f";
  context.font = `900 ${options.titleSize || 62}px "Arial", "Noto Sans TC", sans-serif`;
  context.fillText(title, width / 2, height * 0.38, width - 54);

  if (subtitle) {
    context.fillStyle = options.subtitleColor || "#7257bb";
    context.font = `800 ${options.subtitleSize || 38}px "Arial", "Noto Sans TC", sans-serif`;
    context.fillText(subtitle, width / 2, height * 0.72, width - 54);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.renderOrder = 18;
  return sprite;
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

function injectStyle() {
  if (document.querySelector("#worldRunwayAudioStyle")) return;
  const style = document.createElement("style");
  style.id = "worldRunwayAudioStyle";
  style.textContent = `
    .track-shell { position: relative; }
    .world-audio-toast {
      position: absolute;
      left: 50%;
      bottom: 18px;
      z-index: 30;
      max-width: min(680px, calc(100% - 36px));
      transform: translateX(-50%) translateY(12px);
      padding: 10px 16px;
      border-radius: 18px;
      background: rgba(255,255,255,.96);
      color: #173f5f;
      box-shadow: 0 16px 36px rgba(31,47,70,.18);
      font-weight: 900;
      line-height: 1.38;
      letter-spacing: .02em;
      text-align: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity .2s ease, transform .2s ease;
    }
    .world-audio-toast.is-visible {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    #trackCanvas canvas {
      cursor: pointer;
    }
  `;
  document.head.append(style);
}

function removeActiveGroup() {
  if (!activeGroup || !window.__readingScene) return;
  window.__readingScene.remove(activeGroup);
  activeGroup.traverse((object) => {
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.filter(Boolean).forEach((item) => {
      item.map?.dispose?.();
      item.dispose?.();
    });
  });
  activeGroup = null;
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

function sphere(radius, color, x = 0, y = 0, z = 0, widthSegments = 14, heightSegments = 10) {
  const object = new THREE.Mesh(new THREE.SphereGeometry(radius, widthSegments, heightSegments), material(color));
  object.position.set(x, y, z);
  return object;
}

function material(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.03 });
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
  window.speechSynthesis?.cancel?.();
  clearLandmarkAudioMarks();
  removeActiveGroup();
});
