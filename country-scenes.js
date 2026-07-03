const COUNTRY_SCENES = [
  { country: "日本", flag: "🇯🇵", landmark: "🗻  ⛩️", caption: "富士山與鳥居", sky: "#9ee7ff", ground: "#76c873" },
  { country: "法國", flag: "🇫🇷", landmark: "🗼  🥐", caption: "巴黎鐵塔", sky: "#b9ddff", ground: "#7bc27b" },
  { country: "埃及", flag: "🇪🇬", landmark: "🔺  🐪", caption: "金色金字塔", sky: "#ffd28b", ground: "#dca94e" },
  { country: "澳洲", flag: "🇦🇺", landmark: "🦘  🏛️", caption: "悉尼海港", sky: "#8edcff", ground: "#65c58b" },
  { country: "英國", flag: "🇬🇧", landmark: "🕰️  🚌", caption: "大笨鐘與紅巴士", sky: "#bfd8ef", ground: "#75b975" },
  { country: "美國", flag: "🇺🇸", landmark: "🗽  🌉", caption: "自由女神像", sky: "#a7dcff", ground: "#69be91" },
  { country: "中國", flag: "🇨🇳", landmark: "🏯  🐼", caption: "長城與熊貓", sky: "#ffd0ad", ground: "#70b76b" },
  { country: "巴西", flag: "🇧🇷", landmark: "🗿  🌴", caption: "里約熱內盧", sky: "#8fe3ff", ground: "#4dbf73" },
  { country: "印度", flag: "🇮🇳", landmark: "🕌  🐘", caption: "泰姬陵", sky: "#ffd5b2", ground: "#7bcf8f" },
  { country: "意大利", flag: "🇮🇹", landmark: "🏛️  🍕", caption: "羅馬競技場", sky: "#a9e1ff", ground: "#84c77d" },
];

const locationButtons = document.querySelector("#locationButtons");
const currentLocationLabel = document.querySelector("#currentLocationLabel");

loadDeviceLayout();
loadDailyLimitAssets();

if (locationButtons) {
  new MutationObserver(decorateLocationCards).observe(locationButtons, { childList: true });
  decorateLocationCards();
}

if (currentLocationLabel) {
  new MutationObserver(decorateCurrentLocationLabel).observe(currentLocationLabel, {
    childList: true,
    characterData: true,
    subtree: true,
  });
  decorateCurrentLocationLabel();
}

function decorateLocationCards() {
  [...document.querySelectorAll("#locationButtons .location-card")].forEach((card, index) => {
    const scene = COUNTRY_SCENES[index];
    if (!scene || card.dataset.countryDecorated === "true") return;

    card.dataset.countryDecorated = "true";
    card.classList.add("country-location-card");

    const image = document.createElement("img");
    image.className = "country-scene-image";
    image.alt = `${scene.country}${scene.caption}的 3D 卡通場景`;
    image.loading = "lazy";
    image.decoding = "async";
    image.src = makeSceneImage(scene, index);
    card.prepend(image);

    const title = card.querySelector("strong");
    if (title) {
      title.classList.add("country-location-title");
      title.textContent = `${scene.flag} 地方 ${index + 1} · ${scene.country}`;
    }

    const caption = document.createElement("span");
    caption.className = "country-location-caption";
    caption.textContent = scene.caption;
    image.insertAdjacentElement("afterend", caption);

    const range = card.querySelector("small")?.textContent || "";
    const count = card.querySelector(".location-count")?.textContent || "";
    card.setAttribute("aria-label", `前往地方 ${index + 1}，${scene.country}，${range}，${count}`);
  });
}

function decorateCurrentLocationLabel() {
  const original = currentLocationLabel.textContent || "";
  const match = original.match(/地方\s*(\d+)/);
  if (!match) return;
  const scene = COUNTRY_SCENES[Number(match[1]) - 1];
  if (!scene || original.includes(scene.country)) return;
  currentLocationLabel.textContent = `${scene.flag} ${original} · ${scene.country}`;
}

function makeSceneImage(scene, index) {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="520" height="300" viewBox="0 0 520 300">
    <defs>
      <linearGradient id="sky${index}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${scene.sky}"/>
        <stop offset="1" stop-color="#f8fcff"/>
      </linearGradient>
      <linearGradient id="hill${index}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${scene.ground}"/>
        <stop offset="1" stop-color="#3c9d67"/>
      </linearGradient>
      <filter id="shadow${index}" x="-40%" y="-40%" width="180%" height="200%">
        <feDropShadow dx="0" dy="14" stdDeviation="8" flood-color="#173f5f" flood-opacity=".28"/>
      </filter>
    </defs>
    <rect width="520" height="300" rx="28" fill="url(#sky${index})"/>
    <circle cx="430" cy="62" r="34" fill="#ffe36f"/>
    <g fill="#fff" opacity=".9">
      <ellipse cx="90" cy="64" rx="52" ry="21"/>
      <ellipse cx="133" cy="62" rx="31" ry="15"/>
      <ellipse cx="309" cy="83" rx="48" ry="18"/>
    </g>
    <path d="M0 198 Q116 132 226 190 T520 177 V300 H0Z" fill="url(#hill${index})"/>
    <path d="M0 232 Q128 188 251 231 T520 218 V300 H0Z" fill="#2f8e61" opacity=".45"/>
    <ellipse cx="265" cy="253" rx="150" ry="25" fill="#173f5f" opacity=".16"/>
    <g filter="url(#shadow${index})">
      <text x="265" y="200" text-anchor="middle" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif" font-size="105">${scene.landmark}</text>
    </g>
    <g transform="translate(22 222)">
      <rect width="152" height="52" rx="24" fill="#fff" opacity=".94"/>
      <text x="76" y="34" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="900" fill="#173f5f">${scene.flag} ${scene.country}</text>
    </g>
  </svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function loadDeviceLayout() {
  if (!document.querySelector('link[data-device-layout="true"]')) {
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = "./device-layout.css?v=20260703-device-layout-1";
    stylesheet.dataset.deviceLayout = "true";
    document.head.append(stylesheet);
  }

  if (!document.querySelector('script[data-device-layout="true"]')) {
    const script = document.createElement("script");
    script.src = "./device-layout.js?v=20260703-device-layout-1";
    script.dataset.deviceLayout = "true";
    document.head.append(script);
  }
}

function loadDailyLimitAssets() {
  if (!document.querySelector('link[data-daily-limit="true"]')) {
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = "./daily-limit.css?v=20260704-daily-limit-2";
    stylesheet.dataset.dailyLimit = "true";
    document.head.append(stylesheet);
  }

  import("./daily-limit-v2.js?v=20260704-daily-limit-2").catch((error) => {
    console.error("Unable to load daily submission limit", error);
  });
}

loadLandmarkAssets();

function loadLandmarkAssets() {
  if (!document.querySelector('link[data-country-landmarks="true"]')) {
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = "./country-landmarks-3d.css?v=20260703-landmarks-1";
    stylesheet.dataset.countryLandmarks = "true";
    document.head.append(stylesheet);
  }

  import("./country-landmarks-3d.js?v=20260703-landmarks-1").catch((error) => {
    console.error("Unable to load country landmark models", error);
  });
}
