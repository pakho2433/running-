const currentLocationLabel = document.querySelector("#currentLocationLabel");
let attempts = 0;

waitForScene();

function waitForScene() {
  if (!window.__readingScene) {
    attempts += 1;
    if (attempts < 600) requestAnimationFrame(waitForScene);
    return;
  }

  if (currentLocationLabel) {
    new MutationObserver(scheduleFix).observe(currentLocationLabel, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  scheduleFix();
}

function scheduleFix() {
  for (const delay of [0, 120, 360, 720]) {
    setTimeout(fixCountryBillboard, delay);
  }
}

function fixCountryBillboard() {
  const scene = window.__readingScene;
  if (!scene) return;

  const index = currentLocationIndex();
  const group = scene.children.find((child) => child.name === `country-landmarks-${index + 1}` || child.userData?.landmarkScene);
  if (!group) return;

  group.children.forEach((child) => {
    if (!child.isSprite) return;
    child.position.set(0, 12.4, -8);
    child.scale.set(8.6, 2.45, 1);
    child.renderOrder = 4;
    if (child.material) {
      child.material.depthTest = false;
      child.material.depthWrite = false;
    }
  });
}

function currentLocationIndex() {
  const text = currentLocationLabel?.textContent || "地方 1";
  const match = text.match(/地方\s*(\d+)/);
  const value = Number(match?.[1] || 1) - 1;
  return Math.max(0, Math.min(9, value));
}
