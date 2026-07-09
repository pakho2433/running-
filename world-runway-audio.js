import * as THREE from "./three-reading-wrapper.js";

const WORLD_AUDIO_STAGES = [
  {
    country: "日本",
    flag: "🇯🇵",
    landmark: "富士山與鳥居",
    emoji: "🗻 ⛩️",
    person: "👘",
    personLabel: "日本語",
    intro: "日本的富士山和鳥居，是日本文化的重要象徵。多閱讀，就像登山一樣一步一步前進。",
    readingFun: "読書は楽しいです",
    lang: "ja-JP",
    color: 0xd93b35,
    accent: 0xf7fbff,
  },
  {
    country: "法國",
    flag: "🇫🇷",
    landmark: "巴黎鐵塔",
    emoji: "🗼 🥐",
    person: "🧑‍🎨",
    personLabel: "Français",
    intro: "這裏是法國巴黎鐵塔，代表創意和工程智慧。打開書本，就像展開一趟藝術旅行。",
    readingFun: "La lecture est amusante.",
    lang: "fr-FR",
    color: 0x4b6fd8,
    accent: 0xf4d6a0,
  },
  {
    country: "埃及",
    flag: "🇪🇬",
    landmark: "金字塔",
    emoji: "🔺 🐪",
    person: "🧕",
    personLabel: "العربية",
    intro: "埃及金字塔保存了古代文明的秘密。閱讀歷史故事，可以帶我們穿越幾千年。",
    readingFun: "القراءة ممتعة",
    lang: "ar-EG",
    color: 0xd8aa57,
    accent: 0x845c2c,
  },
  {
    country: "澳洲",
    flag: "🇦🇺",
    landmark: "悉尼歌劇院",
    emoji: "🏛️ 🦘",
    person: "🧑‍🌾",
    personLabel: "English",
    intro: "澳洲的悉尼歌劇院外形像白色帆船。閱讀讓想像力出海，探索更遠的世界。",
    readingFun: "Reading is fun.",
    lang: "en-AU",
    color: 0x4da6d9,
    accent: 0xf9f7ed,
  },
  {
    country: "英國",
    flag: "🇬🇧",
    landmark: "大笨鐘",
    emoji: "🕰️ 🚌",
    person: "💂",
    personLabel: "English",
    intro: "英國大笨鐘是倫敦著名地標。每天用一點時間閱讀，知識就會慢慢累積。",
    readingFun: "Reading is fun.",
    lang: "en-GB",
    color: 0xd22f39,
    accent: 0xc9a469,
  },
  {
    country: "美國",
    flag: "🇺🇸",
    landmark: "自由女神像",
    emoji: "🗽 🌉",
    person: "🧢",
    personLabel: "English",
    intro: "美國自由女神像象徵希望和勇氣。閱讀可以打開新想法，讓我們更有信心。",
    readingFun: "Reading is fun.",
    lang: "en-US",
    color: 0x69a997,
    accent: 0xff8a3d,
  },
  {
    country: "中國",
    flag: "🇨🇳",
    landmark: "萬里長城",
    emoji: "🏯 🐼",
    person: "🧑‍🏫",
    personLabel: "中文",
    intro: "中國萬里長城綿延千里，代表堅毅精神。持續閱讀，也能一步一步走得更遠。",
    readingFun: "閱讀很有趣",
    lang: "zh-CN",
    color: 0xb53535,
    accent: 0xf2cf63,
  },
  {
    country: "巴西",
    flag: "🇧🇷",
    landmark: "基督像",
    emoji: "🗿 🌴",
    person: "⚽",
    personLabel: "Português",
    intro: "巴西里約的基督像張開雙臂迎接世界。閱讀也會打開心胸，認識不同文化。",
    readingFun: "Ler é divertido.",
    lang: "pt-BR",
    color: 0x3c8c61,
    accent: 0xf5d63d,
  },
  {
    country: "印度",
    flag: "🇮🇳",
    landmark: "泰姬陵",
    emoji: "🕌 🐘",
    person: "🧑‍🍳",
    personLabel: "हिन्दी",
    intro: "印度泰姬陵以白色大理石建成，非常優雅。閱讀故事，能感受世界的美。",
    readingFun: "पढ़ना मज़ेदार है।",
    lang: "hi-IN",
    color: 0xf0a04b,
    accent: 0xf7f4e9,
  },
  {
    country: "意大利",
    flag: "🇮🇹",
    landmark: "羅馬競技場",
    emoji: "🏛️ 🍕",
    person: "🧑‍🍳",
    personLabel: "Italiano",
    intro: "意大利羅馬競技場見證古羅馬歷史。閱讀讓古老故事重新在眼前出現。",
    readingFun: "Leggere è divertente.",
    lang: "it-IT",
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

injectStyle();
waitForTrack();

function waitForTrack() {
  if (!window.__readingScene || !window.__readingCamera || !window.__readingRenderer) {
    readyAttempts += 1;
    if (readyAttempts < 600) requestAnimationFrame(waitForTrack);
    return;
  }

  bindPointerAudio();

  if (currentLocationLabel) {
    new MutationObserver(syncWorldAudioStage).observe(currentLocationLabel, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  syncWorldAudioStage();
  announce("按名勝聽 5 秒介紹；按人物聽當地語言版 Reading is fun。");
}

function syncWorldAudioStage() {
  const index = currentLocationIndex();
  if (index === activeIndex && activeGroup) return;

  removeActiveGroup();
  activeIndex = index;

  const definition = WORLD_AUDIO_STAGES[index] || WORLD_AUDIO_STAGES[0];
  const group = new THREE.Group();
  group.name = `world-audio-stage-${index + 1}`;
  group.userData.worldAudioStage = true;

  const landmark = makeLandmark(definition);
  landmark.position.set(-29, 0.35, -39);
  makeClickable(landmark, {
    type: "landmark",
    text: definition.intro,
    lang: "zh-HK",
    label: `${definition.flag} ${definition.landmark}`,
  });

  const guide = makeGuidePerson(definition);
  guide.position.set(29, 0.35, -29);
  makeClickable(guide, {
    type: "person",
    text: definition.readingFun,
    lang: definition.lang,
    label: `${definition.flag} ${definition.personLabel}`,
  });

  group.add(landmark, guide);
  setShadows(group);
  window.__readingScene.add(group);
  activeGroup = group;
}

function currentLocationIndex() {
  const text = currentLocationLabel?.textContent || "地方 1";
  const match = text.match(/地方\s*(\d+)/);
  const value = Number(match?.[1] || 1) - 1;
  return Math.max(0, Math.min(WORLD_AUDIO_STAGES.length - 1, value));
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
    playAudioAction(action);
  }, true);
}

function pickAudioAction(event) {
  const camera = window.__readingCamera;
  const element = window.__readingRenderer?.domElement;
  if (!camera || !element || !activeGroup) return null;

  const rect = element.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
  pointer.y = -(((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);

  raycaster.setFromCamera(pointer, camera);
  const candidates = [];
  activeGroup.traverse((object) => {
    if (object.userData?.audioAction) candidates.push(object);
  });

  const hits = raycaster.intersectObjects(candidates, true);
  if (!hits.length) return null;

  let object = hits[0].object;
  while (object && !object.userData?.audioAction) object = object.parent;
  return object?.userData?.audioAction || null;
}

function playAudioAction(action) {
  const prefix = action.type === "landmark" ? "名勝介紹" : "當地語言";
  announce(`${prefix}：${action.label}｜${action.text}`);

  if (!("speechSynthesis" in window)) {
    announce("這部裝置暫時不支援語音播放。");
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(action.text);
  utterance.lang = action.lang;
  utterance.rate = action.type === "landmark" ? 1.08 : 0.92;
  utterance.pitch = action.type === "landmark" ? 1.05 : 1;
  utterance.volume = 1;

  const voice = findVoice(action.lang);
  if (voice) utterance.voice = voice;

  window.speechSynthesis.speak(utterance);
}

function findVoice(lang) {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  const base = lang.split("-")[0];
  return voices.find((voice) => voice.lang === lang)
    || voices.find((voice) => voice.lang?.toLowerCase?.().startsWith(`${base.toLowerCase()}-`))
    || null;
}

function makeLandmark(definition) {
  const root = new THREE.Group();

  const base = cylinder(5.8, 6.6, 1.1, 24, 0xffffff, 0, 0.55, 0);
  base.material.roughness = 0.55;
  const ring = cylinder(6.1, 6.1, 0.14, 24, definition.color, 0, 1.18, 0);
  root.add(base, ring);

  const pole = cylinder(0.15, 0.15, 8.2, 12, definition.color, -5.3, 5.2, 0);
  const banner = makeTextSprite(`${definition.flag} ${definition.landmark}`, "點我聽名勝介紹", {
    width: 900,
    height: 280,
    titleSize: 60,
    subtitleSize: 36,
    background: "rgba(255,255,255,.96)",
    border: "#596dff",
    titleColor: "#173f5f",
    subtitleColor: "#7257bb",
  });
  banner.position.set(0, 10.2, 0.2);
  banner.scale.set(13.8, 4.3, 1);
  root.add(pole, banner);

  const icon = makeTextSprite(definition.emoji, definition.country, {
    width: 700,
    height: 520,
    titleSize: 150,
    subtitleSize: 46,
    background: "rgba(255,255,255,.78)",
    border: "#ffffff",
    titleColor: "#173f5f",
    subtitleColor: "#173f5f",
  });
  icon.position.set(0, 5.5, 0.4);
  icon.scale.set(10.5, 7.6, 1);
  root.add(icon);

  const hitbox = new THREE.Mesh(
    new THREE.PlaneGeometry(13, 12),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.02, depthWrite: false, side: THREE.DoubleSide }),
  );
  hitbox.position.set(0, 6.2, 0.7);
  root.add(hitbox);

  root.userData.float = 0.08;
  root.userData.baseY = root.position.y;
  return root;
}

function makeGuidePerson(definition) {
  const root = new THREE.Group();

  const shadow = cylinder(2.2, 2.2, 0.08, 28, 0x173f5f, 0, 0.04, 0);
  shadow.material.transparent = true;
  shadow.material.opacity = 0.16;
  root.add(shadow);

  const legLeft = box(0.45, 2.2, 0.45, 0x26364f, -0.45, 1.15, 0);
  const legRight = box(0.45, 2.2, 0.45, 0x26364f, 0.45, 1.15, 0);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.85, 1.65, 6, 14), material(definition.color));
  body.position.y = 3.0;

  const head = sphere(0.8, 0xf1bd8c, 0, 4.8, 0, 18, 12);
  const hair = sphere(0.86, 0x38261c, 0, 5.15, -0.06, 18, 8);
  hair.scale.y = 0.55;

  const armLeft = cylinder(0.18, 0.2, 2.35, 10, 0xf1bd8c, -1.05, 3.25, 0, 0, 0, 0.55);
  const armRight = cylinder(0.18, 0.2, 2.35, 10, 0xf1bd8c, 1.05, 3.25, 0, 0, 0, -0.55);

  const badge = cylinder(0.48, 0.48, 0.08, 20, definition.accent, 0, 3.48, 0.78, Math.PI / 2, 0, 0);
  root.add(legLeft, legRight, body, head, hair, armLeft, armRight, badge);

  const bubble = makeTextSprite(`${definition.person} ${definition.flag}`, `"${definition.readingFun}"`, {
    width: 900,
    height: 330,
    titleSize: 82,
    subtitleSize: 44,
    background: "rgba(255,255,255,.96)",
    border: "#18a999",
    titleColor: "#173f5f",
    subtitleColor: "#095c68",
  });
  bubble.position.set(0, 8.4, 0.4);
  bubble.scale.set(12.2, 4.5, 1);
  root.add(bubble);

  const label = makeTextSprite("按人物", "聽當地語言", {
    width: 520,
    height: 190,
    titleSize: 48,
    subtitleSize: 34,
    background: "rgba(255,255,255,.90)",
    border: "#18a999",
    titleColor: "#173f5f",
    subtitleColor: "#7257bb",
  });
  label.position.set(0, 6.25, 0.5);
  label.scale.set(6.6, 2.25, 1);
  root.add(label);

  const hitbox = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 12),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.02, depthWrite: false, side: THREE.DoubleSide }),
  );
  hitbox.position.set(0, 5.0, 0.85);
  root.add(hitbox);

  root.userData.float = 0.1;
  root.userData.baseY = root.position.y;
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
  roundedRect(context, 10, 10, width - 20, height - 20, Math.min(48, height / 4));
  context.fill();

  context.strokeStyle = options.border || "#596dff";
  context.lineWidth = 8;
  context.stroke();

  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = options.titleColor || "#173f5f";
  context.font = `900 ${options.titleSize || 62}px "Arial", "Noto Sans TC", sans-serif`;
  context.fillText(title, width / 2, height * 0.38, width - 72);

  if (subtitle) {
    context.fillStyle = options.subtitleColor || "#7257bb";
    context.font = `800 ${options.subtitleSize || 38}px "Arial", "Noto Sans TC", sans-serif`;
    context.fillText(subtitle, width / 2, height * 0.72, width - 72);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.renderOrder = 20;
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
  toast.hideTimer = setTimeout(() => toast?.classList.remove("is-visible"), 5200);
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
      z-index: 12;
      max-width: min(760px, calc(100% - 36px));
      transform: translateX(-50%) translateY(12px);
      padding: 12px 18px;
      border-radius: 999px;
      background: rgba(255,255,255,.96);
      color: #173f5f;
      box-shadow: 0 16px 36px rgba(31,47,70,.18);
      font-weight: 900;
      letter-spacing: .03em;
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
  removeActiveGroup();
});
