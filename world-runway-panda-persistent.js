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
    new MutationObserver(schedule).observe(currentLocationLabel, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }
  schedule();
}

function schedule() {
  for (const delay of [120, 360, 900, 1400]) setTimeout(markPanda, delay);
}

function markPanda() {
  if (currentLocationIndex() !== 6) return;
  const panda = window.__readingScene?.getObjectByName?.("china-panda-hotspot-fix");
  if (!panda) return;
  const action = {
    type: "landmark",
    label: "熊貓",
    text: "熊貓是中國珍貴的動物，黑白色的外形十分可愛，也提醒我們保護自然。",
    lang: "zh-HK",
  };
  panda.userData.audioAction = action;
  panda.userData.hotspotFixAction = action;
  panda.traverse((object) => {
    object.userData.audioAction = action;
    object.userData.hotspotFixAction = action;
  });
}

function currentLocationIndex() {
  const text = currentLocationLabel?.textContent || "地方 1";
  const match = text.match(/地方\s*(\d+)/);
  const value = Number(match?.[1] || 1) - 1;
  return Math.max(0, Math.min(9, value));
}
