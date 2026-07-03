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
const tempPosition = new Vector3();
const tempTarget = new Vector3();
const tempDirection = new Vector3();

const shell = document.querySelector(".track-shell");
const canvasHost = document.querySelector("#trackCanvas");
const expandButton = document.querySelector("#mapExpandButton");
const firstPersonButton = document.querySelector("#firstPersonButton");
const orbitButton = document.querySelector("#orbitViewButton");
const resetButton = document.querySelector("#resetViewButton");
const hint = document.querySelector("#mapViewHint");

if (shell && canvasHost && expandButton && firstPersonButton && orbitButton && resetButton) {
  bindButtons();
  bindPointerControls();
  updateControls();
  requestAnimationFrame(updateCameraLoop);
}

function bindButtons() {
  expandButton.addEventListener("click", () => {
    const expanded = !shell.classList.contains("is-map-expanded");
    shell.classList.toggle("is-map-expanded", expanded);
    document.body.classList.toggle("map-expanded", expanded);
    expandButton.textContent = expanded ? "↙ 縮小地圖" : "⛶ 放大地圖";
    expandButton.setAttribute("aria-pressed", String(expanded));
    setTimeout(resizeRenderer, 80);
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
    state.pitch = -0.2;
    state.orbitDistance = 58;
    updateControls();
  });

  resetButton.addEventListener("click", () => {
    state.mode = "overview";
    state.yaw = 0;
    state.pitch = -0.2;
    state.orbitDistance = 58;
    restoreRunner();
    updateControls();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && shell.classList.contains("is-map-expanded")) {
      shell.classList.remove("is-map-expanded");
      document.body.classList.remove("map-expanded");
      expandButton.textContent = "⛶ 放大地圖";
      expandButton.setAttribute("aria-pressed", "false");
      setTimeout(resizeRenderer, 80);
    }
  });
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
        state.orbitDistance = MathUtils.clamp(state.orbitDistance * ratio, 12, 115);
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
    if (state.mode === "overview") return;
    state.orbitDistance = MathUtils.clamp(state.orbitDistance + event.deltaY * 0.045, 12, 115);
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
  if (camera && scene) applyCamera(camera, scene);
  requestAnimationFrame(updateCameraLoop);
}

function applyCamera(camera, scene) {
  if (state.mode === "overview") {
    restoreRunner();
    camera.position.copy(DEFAULT_POSITION);
    camera.up.set(0, 1, 0);
    camera.lookAt(DEFAULT_TARGET);
    camera.fov = 46;
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
  camera.fov = 52;
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
    hint.textContent = "第一身視角：在地圖拖曳可上下左右觀看；再次按按鈕可返回全景。";
  } else if (state.mode === "orbit") {
    hint.textContent = "360° 自由觀看：拖曳旋轉；滑鼠滾輪或雙指可縮放；按重設返回原位。";
  } else {
    hint.textContent = "按「第一身」跟隨自己；按「360°」後拖曳旋轉，滾輪或雙指縮放。";
  }
}

function resizeRenderer() {
  const renderer = window.__readingRenderer;
  const camera = window.__readingCamera;
  if (!renderer || !camera) return;
  const width = Math.max(1, canvasHost.clientWidth);
  const height = Math.max(1, canvasHost.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
