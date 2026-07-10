import * as THREE from "./three-reading-wrapper.js";

const BRIDGE_VERSION = "20260711-map-fit-1";
const clickRaycaster = new THREE.Raycaster();
const ndcPointer = new THREE.Vector2();
const worldPosition = new THREE.Vector3();

let bootAttempts = 0;
let pointerStart = null;
let resizeFrame = 0;

startBridge();

function startBridge() {
  if (window.__worldRunwayInteractionBridge === BRIDGE_VERSION) return;
  if (!getRenderer() || !getCamera() || !getCanvasHost()) {
    bootAttempts += 1;
    if (bootAttempts < 3000) requestAnimationFrame(startBridge);
    return;
  }

  window.__worldRunwayInteractionBridge = BRIDGE_VERSION;
  installResizeBridge();
  installAudioBridge();
  resizeBurst("boot");
}

function getRenderer() {
  return window.__readingRenderer || null;
}

function getCamera() {
  return window.__readingCamera || null;
}

function getScene() {
  return window.__readingScene || null;
}

function getCanvasHost() {
  return document.querySelector("#trackCanvas");
}

function getShell() {
  return document.querySelector(".track-shell");
}

function getRendererCanvas() {
  return getRenderer()?.domElement || getCanvasHost()?.querySelector("canvas") || null;
}

function installResizeBridge() {
  const host = getCanvasHost();
  const shell = getShell();
  const appShell = document.querySelector("#appShell");
  const label = document.querySelector("#currentLocationLabel");

  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(() => resizeBurst("resize-observer"));
    if (host) observer.observe(host);
    if (shell) observer.observe(shell);
  }

  const mutationObserver = new MutationObserver(() => resizeBurst("mutation"));
  [host, shell, appShell, label].filter(Boolean).forEach((node) => {
    mutationObserver.observe(node, {
      attributes: true,
      childList: node === label,
      subtree: node === label,
      attributeFilter: ["class", "style"],
    });
  });

  window.addEventListener("resize", () => resizeBurst("window-resize"), { passive: true });
  window.addEventListener("orientationchange", () => resizeBurst("orientation"), { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) resizeBurst("visible");
  });

  document.addEventListener("click", (event) => {
    if (event.target?.closest?.("#mapExpandButton, #mapExitButton, #resetViewButton, #orbitViewButton, #firstPersonButton")) {
      resizeBurst("map-control");
    }
  }, true);
}

function resizeBurst(reason) {
  resizeSoon(reason);
  [80, 240, 640, 1200].forEach((delay) => {
    window.setTimeout(() => resizeSoon(reason), delay);
  });
}

function resizeSoon(reason) {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => applyCanvasSize(reason));
}

function applyCanvasSize() {
  const renderer = getRenderer();
  const camera = getCamera();
  const host = getCanvasHost();
  if (!renderer || !camera || !host) return false;

  const rect = host.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width || host.clientWidth || 0));
  const height = Math.max(1, Math.round(rect.height || host.clientHeight || 0));
  if (width <= 1 || height <= 1) return false;

  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2.5);
  renderer.setPixelRatio?.(pixelRatio);
  renderer.setSize?.(width, height, false);

  const canvas = renderer.domElement;
  if (canvas) {
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
  }

  camera.aspect = width / height;
  camera.updateProjectionMatrix?.();
  return true;
}

function installAudioBridge() {
  document.addEventListener("pointerdown", (event) => {
    if (!isCanvasEvent(event)) return;
    pointerStart = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
    };
    window.speechSynthesis?.resume?.();
  }, true);

  document.addEventListener("click", (event) => {
    if (!isCanvasEvent(event)) return;
    if (!isTapLike(event)) return;

    const action = pickAudioAction(event);
    if (!action) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    playAudioAction(action);
  }, true);
}

function isCanvasEvent(event) {
  const host = getCanvasHost();
  const canvas = getRendererCanvas();
  if (!host) return false;
  const target = event.target;
  if (target?.closest?.("button, a, input, select, textarea, [role='button']")) return false;
  return target === canvas || host.contains(target);
}

function isTapLike(event) {
  if (!pointerStart) return true;
  const elapsed = performance.now() - pointerStart.time;
  const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
  return elapsed < 1300 && moved < 24;
}

function pickAudioAction(event) {
  const scene = getScene();
  const camera = getCamera();
  const rect = getPickRect();
  if (!scene || !camera || !rect.width || !rect.height) return null;

  const candidates = collectAudioCandidates(scene);
  if (!candidates.length) return null;

  ndcPointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  ndcPointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  clickRaycaster.setFromCamera(ndcPointer, camera);

  const intersections = clickRaycaster.intersectObjects(candidates, true);
  for (const hit of intersections) {
    const action = actionForObject(hit.object);
    if (action) return action;
  }

  return nearestScreenAction(event, candidates, camera, rect);
}

function getPickRect() {
  const canvas = getRendererCanvas();
  const host = getCanvasHost();
  const canvasRect = canvas?.getBoundingClientRect?.();
  if (canvasRect?.width && canvasRect?.height) return canvasRect;
  return host?.getBoundingClientRect?.() || { left: 0, top: 0, width: 0, height: 0 };
}

function collectAudioCandidates(scene) {
  const candidates = [];
  scene.traverse((object) => {
    if (!isVisibleObject(object)) return;
    if (actionForObject(object)) candidates.push(object);
  });
  return candidates;
}

function isVisibleObject(object) {
  let current = object;
  while (current) {
    if (current.visible === false) return false;
    current = current.parent;
  }
  return true;
}

function actionForObject(object) {
  let current = object;
  while (current) {
    const data = current.userData || {};
    const action = data.stableAction || data.hotspotFixAction || data.audioAction;
    if (action) return action;
    current = current.parent;
  }
  return null;
}

function nearestScreenAction(event, candidates, camera, rect) {
  let best = null;
  const seen = new Set();

  for (const object of candidates) {
    const action = actionForObject(object);
    if (!action) continue;

    const key = action.label || action.text || object.uuid;
    if (seen.has(key)) continue;
    seen.add(key);

    object.getWorldPosition(worldPosition);
    const projected = worldPosition.project(camera);
    if (projected.z < -1 || projected.z > 1) continue;

    const x = rect.left + ((projected.x + 1) / 2) * rect.width;
    const y = rect.top + ((1 - projected.y) / 2) * rect.height;
    const distance = Math.hypot(event.clientX - x, event.clientY - y);
    const threshold = nearestThreshold(action, rect);

    if (distance <= threshold && (!best || distance < best.distance)) {
      best = { action, distance };
    }
  }

  return best?.action || null;
}

function nearestThreshold(action, rect) {
  const shell = getShell();
  const shortSide = Math.min(rect.width, rect.height);
  let threshold = shortSide < 520 ? 132 : 108;
  if (shell?.classList.contains("is-map-expanded")) threshold += 34;
  if (action.type === "person" || action.type === "guide") threshold += 22;
  return threshold;
}

function playAudioAction(action) {
  const text = String(action.text || action.description || action.label || "").trim();
  if (!text) return;

  showAudioToast(action);

  const synth = window.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === "undefined") return;

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = action.lang || inferLang(text);
  utterance.rate = Number(action.rate) || (utterance.lang.startsWith("zh") ? 0.94 : 0.86);
  utterance.pitch = Number(action.pitch) || 1;

  const voice = chooseVoice(utterance.lang);
  if (voice) utterance.voice = voice;

  synth.cancel();
  synth.resume?.();
  synth.speak(utterance);
  window.setTimeout(() => synth.resume?.(), 90);
}

function inferLang(text) {
  return /[\u4e00-\u9fff]/.test(text) ? "zh-HK" : "en-US";
}

function chooseVoice(lang) {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  return voices.find((voice) => voice.lang === lang)
    || voices.find((voice) => voice.lang?.toLowerCase?.().startsWith(lang.slice(0, 2).toLowerCase()))
    || voices[0]
    || null;
}

function showAudioToast(action) {
  const label = action.label || (action.type === "person" || action.type === "guide" ? "\u4eba\u7269" : "\u540d\u52dd");
  let toast = document.querySelector(".world-audio-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "world-audio-toast";
    getShell()?.appendChild(toast);
  }
  toast.textContent = `\u6b63\u5728\u64ad\u653e\uff1a${label}`;
  toast.classList.add("is-visible");
  window.clearTimeout(showAudioToast.hideTimer);
  showAudioToast.hideTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 1800);
}
