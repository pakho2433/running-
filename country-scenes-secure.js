const SCENES = [
  ["日本", "🇯🇵", "🗻  ⛩️", "富士山與鳥居", "#9ee7ff", "#76c873"],
  ["法國", "🇫🇷", "🗼  🥐", "巴黎鐵塔", "#b9ddff", "#7bc27b"],
  ["埃及", "🇪🇬", "🔺  🐪", "金色金字塔", "#ffd28b", "#dca94e"],
  ["澳洲", "🇦🇺", "🦘  🏛️", "悉尼海港", "#8edcff", "#65c58b"],
  ["英國", "🇬🇧", "🕰️  🚌", "大笨鐘與紅巴士", "#bfd8ef", "#75b975"],
  ["美國", "🇺🇸", "🗽  🌉", "自由女神像", "#a7dcff", "#69be91"],
  ["中國", "🇨🇳", "🏯  🐼", "長城與熊貓", "#ffd0ad", "#70b76b"],
  ["巴西", "🇧🇷", "🗿  🌴", "里約熱內盧", "#8fe3ff", "#4dbf73"],
  ["印度", "🇮🇳", "🕌  🐘", "泰姬陵", "#ffd5b2", "#7bcf8f"],
  ["意大利", "🇮🇹", "🏛️  🍕", "羅馬競技場", "#a9e1ff", "#84c77d"],
].map(([country, flag, landmark, caption, sky, ground]) => ({ country, flag, landmark, caption, sky, ground }));

loadStyle("device-layout-secure", "./device-layout.css?v=20260709-student-only-1");
loadScript("device-layout-secure", "./device-layout.js?v=20260709-student-only-1");
loadStyle("daily-recommendation-secure", "./daily-book-recommendation.css?v=20260709-student-only-1");
loadStyle("country-landmarks-secure", "./country-landmarks-3d.css?v=20260709-student-only-1");

import("./daily-book-recommendation-secure.js?v=20260709-student-only-1").catch(console.error);
import("./country-landmarks-3d.js?v=20260709-student-only-1").catch(console.error);

const buttons = document.querySelector("#locationButtons");
const label = document.querySelector("#currentLocationLabel");
if (buttons) {
  new MutationObserver(decorate).observe(buttons, { childList: true });
  decorate();
}
if (label) {
  new MutationObserver(decorateLabel).observe(label, { childList: true, characterData: true, subtree: true });
  decorateLabel();
}

function decorate() {
  document.querySelectorAll("#locationButtons .location-card").forEach((card, index) => {
    const scene = SCENES[index];
    if (!scene || card.dataset.countryDecorated === "true") return;
    card.dataset.countryDecorated = "true";
    card.classList.add("country-location-card");
    const image = document.createElement("img");
    image.className = "country-scene-image";
    image.alt = `${scene.country}${scene.caption}的 3D 卡通場景`;
    image.loading = "lazy";
    image.src = sceneImage(scene, index);
    card.prepend(image);
    const title = card.querySelector("strong");
    if (title) title.textContent = `${scene.flag} 地方 ${index + 1} · ${scene.country}`;
    const caption = document.createElement("span");
    caption.className = "country-location-caption";
    caption.textContent = scene.caption;
    image.insertAdjacentElement("afterend", caption);
  });
}

function decorateLabel() {
  const text = label?.textContent || "";
  const match = text.match(/地方\s*(\d+)/);
  if (!match) return;
  const scene = SCENES[Number(match[1]) - 1];
  if (scene && !text.includes(scene.country)) label.textContent = `${scene.flag} ${text} · ${scene.country}`;
}

function sceneImage(scene, index) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="300" viewBox="0 0 520 300"><defs><linearGradient id="s${index}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${scene.sky}"/><stop offset="1" stop-color="#f8fcff"/></linearGradient></defs><rect width="520" height="300" rx="28" fill="url(#s${index})"/><circle cx="430" cy="62" r="34" fill="#ffe36f"/><path d="M0 198 Q116 132 226 190 T520 177 V300 H0Z" fill="${scene.ground}"/><ellipse cx="265" cy="253" rx="150" ry="25" fill="#173f5f" opacity=".16"/><text x="265" y="200" text-anchor="middle" font-family="Apple Color Emoji,Segoe UI Emoji,sans-serif" font-size="105">${scene.landmark}</text><rect x="22" y="222" width="152" height="52" rx="24" fill="#fff" opacity=".94"/><text x="98" y="256" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" font-weight="900" fill="#173f5f">${scene.flag} ${scene.country}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function loadStyle(id, href) {
  if (document.querySelector(`link[data-secure-asset="${id}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.secureAsset = id;
  document.head.append(link);
}

function loadScript(id, src) {
  if (document.querySelector(`script[data-secure-asset="${id}"]`)) return;
  const script = document.createElement("script");
  script.src = src;
  script.dataset.secureAsset = id;
  document.head.append(script);
}
