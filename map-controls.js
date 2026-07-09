import { MathUtils, Vector3 } from "./three-reading-wrapper.js";

const state = {
  mode: "overview",
  yaw: 0,
  pitch: -0.2,
  orbitDistance: 58,
  dragging: false,
  activePointers: new Map(),
  lastPointer: null,
  lastPinchDistance: null,
  hiddenRunner: null,
};

const DEFAULT_POSITION = new Vector3(0, 24, 42);
const DEFAULT_TARGET = new Vector3(0, 1.5, -40);
const MOBILE_POSITION = new Vector3(0, 42, 86);
const MOBILE_TARGET = new Vector3(0, 1.8, -44);
const TABLET_POSITION = new Vector3(0, 34, 68);
const TABLET_TARGET = new Vector3(0, 1.8, -42);
const tempPosition = new Vector3();
const tempTarget = new Vector3();
const tempDirection = new Vector3();
let lastRendererPixelRatio = 0;

const shell = document.querySelector(".track-shell");
const canvasHost = document.querySelector("#trackCanvas");
const expandButton = document.querySelector("#mapExpandButton");
const exitButton = document.querySelector("#mapExitButton");
const firstPersonButton = document.querySelector("#firstPersonButton");
const orbitButton = document.querySelector("#orbitViewButton");
const resetButton = document.querySelector("#resetViewButton");
const hint = document.querySelector("#mapViewHint");

if (shell && canvasHost && expandButton && exitButton && firstPersonButton && orbitButton && resetButton && hint) {
  bindButtons();
  bindPointerControls();
  updateControls();
  requestAnimationFrame(updateCameraLoop);
  window.addEventListener("resize", () => {
    resetToOverview();
    resizeRenderer();
  });
  window.addEventListener("orientationchange", () => {
    resetToOverview();
    setTimeout(resizeRenderer, 120);
    setTimeout(resizeRenderer, 420);
  });
}

function bindButtons() {
  expandButton.addEventListener("click", () => {
    setExpanded(!shell.classList.contains("is-map-expanded"));
  });

  exitButton.addEventListener("click", () => {
    setExpanded(false);
  });

  firstPersonButton.addEventListener("click", () => {
    state.mode = state.mode === "first" ? "overview" : "first";
    state.yaw = 0;
    state.pitch = 0;
    updateControls();
  });

  orbitButton.addEventListener("click", () => {
    state.mode = state.mode === "orbit" ? "overview" : "orbit";
    state.yaw = 0;
    state.pitch = -0.28;
    state.orbitDistance = getDefaultOrbitDistance();
    updateControls();
  });

  resetButton.addEventListener("click", () => {
    resetToOverview();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && shell.classList.contains("is-map-expanded")) {
      setExpanded(false);
    }
  });
}

function resetToOverview() {
  state.mode = "overview";
  state.yaw = 0;
  state.pitch = -0.2;
  state.orbitDistance = getDefaultOrbitDistance();
  restoreRunner();
  updateControls();
}

function getViewportKind() {
  const width = window.innerWidth || document.documentElement.clientWidth || 1024;
  const height = window.innerHeight || document.documentElement.clientHeight || 768;
  if (width <= 760 || width < height * 0.82) return "mobile";
  if (width <= 1100) return "tablet";
  return "desktop";
}

function getDefaultOrbitDistance() {
  const viewport = getViewportKind();
  if (viewport === "mobile") return 92;
  if (viewport === "tablet") return 76;
  return 58;
}

function setExpanded(expanded) {
  shell.classList.toggle("is-map-expanded", expanded);
  document.body.classList.toggle("map-expanded", expanded);
  expandButton.textContent = expanded ? "↙ 縮小地圖" : "⛶ 放大地圖";
  expandButton.setAttribute("aria-pressed", String(expanded));
  exitButton.setAttribute("aria-hidden", String(!expanded));
  resetToOverview();
  setTimeout(resizeRenderer, 80);
  setTimeout(resizeRenderer, 260);
}

function bindPointerControls() {
  canvasHost.addEventListener("pointerdown", (event) => {
    if (state.mode === "overview") return;
    canvasHost.setPointerCapture?.(event.pointerId);
    state.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    state.lastPointer = { x: event.clientX, y: event.clientY };
    state.dragging = true;
    canvasHost.classList.add("is-dragging");
    if (state.activePointers.size === 2) state.lastPinchDistance = pointerDistance();
    event.preventDefault();
  });

  canvasHost.addEventListener("pointermove", (event) => {
    if (!state.activePointers.has(event.pointerId) || state.mode === "overview") return;
    const previous = state.activePointers.get(event.pointerId);
    state.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (state.activePointers.size >= 2) {
      const distance = pointerDistance();
      if (state.lastPinchDistance && distance > 0) {
        const ratio = state.lastPinchDistance / distance;
        state.orbitDistance = MathUtils.clamp(state.orbitDistance * ratio, 16, 150);
      }
      state.lastPinchDistance = distance;
    } else {
      const dx = event.clientX - previous.x;
      const dy = event.clientY - previous.y;
      state.yaw -= dx * 0.007;
      state.pitch = MathUtils.clamp(state.pitch - dy * 0.006, -1.15, 1.15);
    }
    event.preventDefault();
  });

  const release = (event) => {
    state.activePointers.delete(event.pointerId);
    state.lastPinchDistance = state.activePointers.size === 2 ? pointerDistance() : null;
    if (!state.activePointers.size) {
      state.dragging = false;
      state.lastPointer = null;
      canvasHost.classList.remove("is-dragging");
    }
  };

  canvasHost.addEventListener("pointerup", release);
  canvasHost.addEventListener("pointercancel", release);
  canvasHost.addEventListener("lostpointercapture", release);

  canvasHost.addEventListener("wheel", (event) => {
    // Mouse wheel should zoom the map directly, even before the user presses 360°.
    if (state.mode === "overview") {
      state.mode = "orbit";
      state.yaw = 0;
      state.pitch = -0.28;
      state.orbitDistance = getDefaultOrbitDistance();
      updateControls();
    }

    const zoomSpeed = event.ctrlKey ? 0.08 : 0.045;
    state.orbitDistance = MathUtils.clamp(state.orbitDistance + event.deltaY * zoomSpeed, 16, 150);
    event.preventDefault();
  }, { passive: false });
}

function pointerDistance() {
  const points = [...state.activePointers.values()];
  if (points.length < 2) return 0;
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
}

function updateCameraLoop() {
  const camera = window.__readingCamera;
  const scene = window.__readingScene;
  const renderer = window.__readingRenderer;
  if (camera && scene) applyCamera(camera, scene);
  if (renderer) ensureRendererQuality(renderer);
  requestAnimationFrame(updateCameraLoop);
}

function ensureRendererQuality(renderer) {
  const targetPixelRatio = Math.min(window.devicePixelRatio || 1, 2.5);
  if (Math.abs(targetPixelRatio - lastRendererPixelRatio) > 0.01) {
    lastRendererPixelRatio = targetPixelRatio;
    renderer.setPixelRatio?.(targetPixelRatio);
    renderer.setSize?.(Math.max(1, canvasHost.clientWidth), Math.max(1, canvasHost.clientHeight), false);
  }
  if (renderer.outputColorSpace !== undefined && window.__readingThree?.SRGBColorSpace) {
    renderer.outputColorSpace = window.__readingThree.SRGBColorSpace;
  }
}

function applyCamera(camera, scene) {
  if (state.mode === "overview") {
    restoreRunner();
    const viewport = getViewportKind();
    if (viewport === "mobile") {
      camera.position.copy(MOBILE_POSITION);
      camera.lookAt(MOBILE_TARGET);
      camera.fov = 62;
    } else if (viewport === "tablet") {
      camera.position.copy(TABLET_POSITION);
      camera.lookAt(TABLET_TARGET);
      camera.fov = 54;
    } else {
      camera.position.copy(DEFAULT_POSITION);
      camera.lookAt(DEFAULT_TARGET);
      camera.fov = 46;
    }
    camera.up.set(0, 1, 0);
    camera.updateProjectionMatrix();
    return;
  }

  const runner = findCurrentRunner(scene);

  if (state.mode === "first") {
    if (runner) {
      if (state.hiddenRunner && state.hiddenRunner !== runner) state.hiddenRunner.visible = true;
      state.hiddenRunner = runner;
      runner.visible = false;
      runner.getWorldPosition(tempPosition);
      camera.position.set(tempPosition.x, tempPosition.y + 4.05, tempPosition.z - 0.35);
    } else {
      restoreRunner();
      camera.position.set(0, 4.2, 16);
    }

    const cosPitch = Math.cos(state.pitch);
    tempDirection.set(
      Math.sin(state.yaw) * cosPitch,
      Math.sin(state.pitch),
      -Math.cos(state.yaw) * cosPitch,
    ).normalize();
    tempTarget.copy(camera.position).addScaledVector(tempDirection, 20);
    camera.up.set(0, 1, 0);
    camera.lookAt(tempTarget);
    camera.fov = 68;
    camera.updateProjectionMatrix();
    return;
  }

  restoreRunner();
  if (runner) runner.getWorldPosition(tempTarget);
  else tempTarget.set(0, 2, -40);
  tempTarget.y += 2.2;

  const horizontal = state.orbitDistance * Math.cos(state.pitch);
  camera.position.set(
    tempTarget.x + Math.sin(state.yaw) * horizontal,
    tempTarget.y + Math.sin(state.pitch) * state.orbitDistance,
    tempTarget.z + Math.cos(state.yaw) * horizontal,
  );
  camera.up.set(0, 1, 0);
  camera.lookAt(tempTarget);
  camera.fov = getViewportKind() === "mobile" ? 60 : 52;
  camera.updateProjectionMatrix();
}

function findCurrentRunner(scene) {
  let result = null;
  for (const child of scene.children) {
    if (!child?.isGroup || !child.visible) continue;
    let isCurrent = false;
    child.traverse((object) => {
      if (isCurrent || !object?.isMesh) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      isCurrent = materials.some((material) => material?.color?.getHex?.() === 0xffb703);
    });
    if (isCurrent) {
      result = child;
      break;
    }
  }
  return result || state.hiddenRunner;
}

function restoreRunner() {
  if (state.hiddenRunner) state.hiddenRunner.visible = true;
  state.hiddenRunner = null;
}

function updateControls() {
  firstPersonButton.classList.toggle("is-active", state.mode === "first");
  orbitButton.classList.toggle("is-active", state.mode === "orbit");
  firstPersonButton.setAttribute("aria-pressed", String(state.mode === "first"));
  orbitButton.setAttribute("aria-pressed", String(state.mode === "orbit"));
  canvasHost.classList.toggle("is-interactive", state.mode !== "overview");

  if (state.mode === "first") {
    hint.textContent = "第一身視角：在地圖拖曳可上下左右觀看；按「重設視角」返回全景。";
  } else if (state.mode === "orbit") {
    hint.textContent = "360° 自由觀看：滑鼠滾輪可放大縮小；拖曳旋轉；雙指可縮放。";
  } else {
    hint.textContent = "滑鼠滾輪可直接放大；按「放大地圖」看全屏；按「360°」可自由旋轉。";
  }
}

function resizeRenderer() {
  const renderer = window.__readingRenderer;
  const camera = window.__readingCamera;
  if (!renderer || !camera) return;
  const width = Math.max(1, canvasHost.clientWidth);
  const height = Math.max(1, canvasHost.clientHeight);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2.5);
  lastRendererPixelRatio = pixelRatio;
  renderer.setPixelRatio?.(pixelRatio);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
