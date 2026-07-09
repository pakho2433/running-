import { Vector3 } from "./three-reading-wrapper.js";

const canvasHost = document.querySelector("#trackCanvas");
const firstPersonButton = document.querySelector("#firstPersonButton");
const orbitButton = document.querySelector("#orbitViewButton");
const target = new Vector3();
let attempts = 0;

waitForCamera();

function waitForCamera() {
  if (!window.__readingCamera || !window.__readingScene || !window.__readingRenderer) {
    attempts += 1;
    if (attempts < 3000) requestAnimationFrame(waitForCamera);
    return;
  }
  requestAnimationFrame(fitLoop);
}

function fitLoop() {
  const camera = window.__readingCamera;
  const renderer = window.__readingRenderer;
  if (camera && renderer && isOverviewMode()) {
    applyResponsiveOverview(camera, renderer);
  }
  requestAnimationFrame(fitLoop);
}

function isOverviewMode() {
  return !firstPersonButton?.classList.contains("is-active") && !orbitButton?.classList.contains("is-active");
}

function applyResponsiveOverview(camera, renderer) {
  const rect = renderer.domElement.getBoundingClientRect();
  const width = Math.max(1, rect.width || canvasHost?.clientWidth || window.innerWidth || 1);
  const height = Math.max(1, rect.height || canvasHost?.clientHeight || window.innerHeight || 1);
  const aspect = width / height;

  if (aspect < 0.72) {
    camera.position.set(0, 62, 118);
    target.set(0, 2.2, -42);
    camera.fov = 72;
  } else if (aspect < 1.18) {
    camera.position.set(0, 54, 104);
    target.set(0, 2.0, -42);
    camera.fov = 66;
  } else if (aspect < 1.55) {
    camera.position.set(0, 46, 94);
    target.set(0, 2.0, -42);
    camera.fov = 62;
  } else {
    camera.position.set(0, 38, 82);
    target.set(0, 2.0, -42);
    camera.fov = 58;
  }

  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
