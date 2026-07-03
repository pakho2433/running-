import * as THREE_BASE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js?reading-base=1";

export * from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js?reading-base=1";

window.__readingThree = THREE_BASE;

export class Scene extends THREE_BASE.Scene {
  constructor(...args) {
    super(...args);
    window.__readingScene = this;
  }
}

export class PerspectiveCamera extends THREE_BASE.PerspectiveCamera {
  constructor(...args) {
    super(...args);
    window.__readingCamera = this;
  }
}

export class WebGLRenderer extends THREE_BASE.WebGLRenderer {
  constructor(...args) {
    super(...args);
    window.__readingRenderer = this;
  }
}
