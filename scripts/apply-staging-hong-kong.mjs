import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const VERSION = "20260820-hong-kong-1";

function replaceOne(source, search, replacement, label) {
  if (typeof search === "string") {
    const count = source.split(search).length - 1;
    if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}.`);
    return source.replace(search, replacement);
  }
  const flags = search.flags.includes("g") ? search.flags : `${search.flags}g`;
  const probe = new RegExp(search.source, flags);
  const matches = [...source.matchAll(probe)];
  if (matches.length !== 1) throw new Error(`${label}: expected 1 match, found ${matches.length}.`);
  return source.replace(search, replacement);
}

async function patch(relativePath, transform) {
  const filePath = path.join(dist, relativePath);
  const before = await readFile(filePath, "utf8");
  const after = transform(before);
  if (after === before) throw new Error(`${relativePath}: staging Hong Kong patch made no changes.`);
  await writeFile(filePath, after, "utf8");
  console.log(`✓ patched ${relativePath}`);
}

await patch("app-config.js", (source) => {
  source = replaceOne(source, "trackDistance: 15000,", "trackDistance: 16500,", "track distance");
  source = replaceOne(source, "trackLocations: 10,", "trackLocations: 11,", "track locations");
  return source;
});

await patch("index.html", (source) => {
  source = replaceOne(source, "CLASS 3D TRACK · 15,000 里", "CLASS 3D TRACK · 16,500 里", "track heading");
  source = replaceOne(source, "10 COUNTRIES", "11 PLACES", "place count heading");
  source = replaceOne(
    source,
    /\.\/country-scenes\.js\?v=[^\"']+/,
    `./country-scenes.js?v=${VERSION}`,
    "country scenes cache key",
  );
  return source;
});

await patch("country-scenes.js", (source) => replaceOne(
  source,
  /\.\/country-scenes-secure\.js\?v=[^\"']+/,
  `./country-scenes-secure.js?v=${VERSION}`,
  "secure country scenes cache key",
));

await patch("country-scenes-secure.js", (source) => {
  source = replaceOne(
    source,
    'const SCENES = [\n  ["日本", "🇯🇵", "🗻  ⛩️", "富士山與鳥居", "#9ee7ff", "#76c873"],',
    'const SCENES = [\n  ["香港", "🇭🇰", "🌃  ⛴️", "維多利亞港", "#9fdcff", "#6fc58b"],\n  ["日本", "🇯🇵", "🗻  ⛩️", "富士山與鳥居", "#9ee7ff", "#76c873"],',
    "Hong Kong scene card",
  );
  for (const file of [
    "country-landmarks-3d.js",
    "world-runway-audio.js",
    "world-runway-layout-fix.js",
    "world-runway-hotspot-fix.js",
    "world-runway-panda-persistent.js",
    "world-runway-stable-interaction.js",
  ]) {
    const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\./${escaped}\\?v=[^\\\"']+`);
    source = replaceOne(source, re, `./${file}?v=${VERSION}`, `${file} cache key`);
  }
  return source;
});

const hongKongLandmarkDefinition = '  { country: "香港", flag: "🇭🇰", landmark: "維多利亞港與城市天際線", build: buildHongKong },\n';
const hongKongBuilder = `function buildHongKong() {
  const root = new THREE.Group();

  const harbour = box(42, 0.22, 30, 0x4ca6d8, 0, 0.08, -45);
  harbour.material.roughness = 0.28;
  harbour.material.metalness = 0.06;
  root.add(harbour);

  const skyline = new THREE.Group();
  const heights = [6.5, 10, 7.5, 14, 9, 12, 8];
  heights.forEach((height, index) => {
    const colours = [0x5d7d9a, 0x7a91a8, 0x4d6f8c, 0x8aa0b4];
    const building = box(2.7, height, 3.2, colours[index % colours.length], (index - 3) * 3.15, height / 2, 0);
    skyline.add(building);
    if (index === 3) {
      skyline.add(cone(0.7, 3.5, 4, 0xd8e7f0, 0, height + 1.75, 0));
    }
  });
  skyline.position.set(-20, 0, -63);
  skyline.rotation.y = 0.08;
  root.add(skyline);

  const junk = new THREE.Group();
  junk.add(
    box(7.2, 0.8, 2.7, 0x74452f, 0, 0.8, 0),
    cylinder(0.16, 0.2, 6.8, 8, 0x5f402f, 0, 4.3, 0),
  );
  const sailLeft = new THREE.Mesh(new THREE.ConeGeometry(3.2, 5.8, 3), material(0xd84f4f));
  sailLeft.position.set(-1.6, 4.6, 0);
  sailLeft.rotation.z = -0.28;
  const sailRight = new THREE.Mesh(new THREE.ConeGeometry(2.4, 4.8, 3), material(0xf3d36a));
  sailRight.position.set(1.5, 4.2, 0);
  sailRight.rotation.z = 0.3;
  junk.add(sailLeft, sailRight);
  junk.position.set(22, 0, -29);
  junk.rotation.y = -0.18;
  root.add(junk);

  const peak = cone(9, 9, 22, 0x3f7f62, 25, 4.5, -79);
  peak.scale.z = 0.72;
  root.add(peak);

  return root;
}

`;

await patch("country-landmarks-3d.js", (source) => {
  source = replaceOne(
    source,
    'const COUNTRY_LANDMARKS = [\n  { country: "日本",',
    `const COUNTRY_LANDMARKS = [\n${hongKongLandmarkDefinition}  { country: "日本",`,
    "Hong Kong landmark definition",
  );
  source = replaceOne(source, "function buildJapan() {", `${hongKongBuilder}function buildJapan() {`, "Hong Kong 3D builder");
  return source;
});

const hongKongAudioStage = `  {
    country: "香港",
    flag: "🇭🇰",
    landmark: "維多利亞港",
    person: "🧑‍🎓",
    personLabel: "廣東話",
    intro: "香港的維多利亞港連接九龍和香港島，兩岸高樓形成著名的城市天際線。閱讀也像乘船出發，帶我們探索更廣闊的世界。",
    readingFun: "閱讀真係好有趣！",
    lang: "zh-HK",
    fallbackText: "閱讀真係好有趣！",
    color: 0x2f88c5,
    accent: 0xf5d36c,
  },
`;

await patch("world-runway-audio.js", (source) => replaceOne(
  source,
  'const WORLD_AUDIO_STAGES = [\n  {\n    country: "日本",',
  `const WORLD_AUDIO_STAGES = [\n${hongKongAudioStage}  {\n    country: "日本",`,
  "Hong Kong audio stage",
));

const hongKongHotspotObject = `  {
    country: "香港",
    childActions: [
      [0, "維多利亞港", "維多利亞港位於香港島和九龍之間，是香港最具代表性的海港景色之一。"],
      [1, "香港城市天際線", "維港兩岸的高樓形成香港著名的城市天際線。"],
      [2, "中式帆船", "傳統帆船讓人想起香港作為港口城市的歷史。"],
      [3, "太平山", "太平山是俯瞰維多利亞港和香港市區的著名地點。"],
    ],
  },
`;

await patch("world-runway-hotspot-fix.js", (source) => {
  source = replaceOne(
    source,
    'const HOTSPOT_DATA = [\n  {\n    country: "日本",',
    `const HOTSPOT_DATA = [\n${hongKongHotspotObject}  {\n    country: "日本",`,
    "Hong Kong hotspot data",
  );
  if (!source.includes("index === 6")) throw new Error("world-runway-hotspot-fix.js: China index marker missing.");
  source = source.replaceAll("index === 6", "index === 7");
  return source;
});

const hongKongStableRow = '  [[0, "維多利亞港", "維多利亞港位於香港島和九龍之間，是香港最具代表性的海港景色之一。"], [1, "香港城市天際線", "維港兩岸的高樓形成香港著名的城市天際線。"], [2, "中式帆船", "傳統帆船讓人想起香港作為港口城市的歷史。"], [3, "太平山", "太平山是俯瞰維多利亞港和香港市區的著名地點。"]],\n';

await patch("world-runway-stable-interaction.js", (source) => {
  source = replaceOne(
    source,
    'const HOTSPOT_DATA = [\n  [[0, "日本鳥居",',
    `const HOTSPOT_DATA = [\n${hongKongStableRow}  [[0, "日本鳥居",`,
    "Hong Kong stable hotspot row",
  );
  if (!source.includes("index === 6")) throw new Error("world-runway-stable-interaction.js: China index marker missing.");
  source = source.replaceAll("index === 6", "index === 7");
  source = source.replace(/\.\/country-landmarks-3d\.js\?v=[^\"']+/g, `./country-landmarks-3d.js?v=${VERSION}`);
  source = source.replace(/\.\/world-runway-audio\.js\?v=[^\"']+/g, `./world-runway-audio.js?v=${VERSION}`);
  return source;
});

await patch("world-runway-panda-persistent.js", (source) => {
  source = replaceOne(source, "currentLocationIndex() !== 6", "currentLocationIndex() !== 7", "China panda location");
  source = replaceOne(source, "Math.min(9, value)", "Math.min(10, value)", "panda location clamp");
  return source;
});

await patch("world-runway-layout-fix.js", (source) => replaceOne(
  source,
  "Math.min(9, value)",
  "Math.min(10, value)",
  "layout location clamp",
));

console.log("✅ Applied staging-only Hong Kong place 1 patch: 11 places / 16,500 li.");
