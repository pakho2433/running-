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
    camera.position.set(0, 42, 84);
    target.set(0, 1.8, -44);
    camera.fov = 60;
  } else if (aspect < 1.18) {
    camera.position.set(0, 36, 72);
    target.set(0, 1.8, -43);
    camera.fov = 55;
  } else if (aspect < 1.55) {
    camera.position.set(0, 31, 62);
    target.set(0, 1.8, -42);
    camera.fov = 51;
  } else {
    camera.position.set(0, 26, 50);
    target.set(0, 1.7, -40);
    camera.fov = 47;
  }

  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
