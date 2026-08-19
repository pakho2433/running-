import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const filePath = path.join(root, "dist", "world-runway-audio.js");

function replaceOne(source, search, replacement, label) {
  const count = source.split(search).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}.`);
  return source.replace(search, replacement);
}

let source = await readFile(filePath, "utf8");

source = replaceOne(
  source,
  '    lang: "ar",\n    fallbackText: "Al qira\'ah mumti\'ah.",',
  '    lang: "ar-EG",\n    fallbackText: "Al qiraa\'ah mumti\'ah.",',
  "Egypt Arabic locale",
);

const oldPlayer = `async function playAudioAction(action) {
  const prefix = action.type === "landmark" ? "名勝介紹" : "當地語言";
  announce(\`${'${prefix}'}：${'${action.label}'}｜${'${action.text}'}\`);

  if (!("speechSynthesis" in window)) {
    announce("這部裝置暫時不支援語音播放。");
    return;
  }

  window.speechSynthesis.cancel();
  const voices = await warmUpVoices();
  const voice = findVoice(action.lang, voices);
  const useFallback = action.type === "person" && !voice && action.fallbackText && action.fallbackText !== action.text;

  const utterance = new SpeechSynthesisUtterance(useFallback ? action.fallbackText : action.text);
  utterance.lang = useFallback ? "en-US" : action.lang;
  utterance.rate = action.type === "landmark" ? 1.06 : 0.9;
  utterance.pitch = action.type === "landmark" ? 1.05 : 1;
  utterance.volume = 1;

  const selectedVoice = useFallback ? findVoice("en-US", voices) : voice;
  if (selectedVoice) utterance.voice = selectedVoice;

  window.speechSynthesis.speak(utterance);
}`;

const newPlayer = `async function playAudioAction(action) {
  const prefix = action.type === "landmark" ? "名勝介紹" : "當地語言";
  announce(\`${'${prefix}'}：${'${action.label}'}｜${'${action.text}'}\`);

  if (!("speechSynthesis" in window)) {
    announce("這部裝置暫時不支援語音播放。");
    return;
  }

  const synth = window.speechSynthesis;
  synth.cancel();
  if (synth.paused) synth.resume();

  const voices = await warmUpVoices();
  const primaryVoice = findVoice(action.lang, voices);
  const canFallback = action.type === "person" && action.fallbackText && action.fallbackText !== action.text;
  const useFallbackImmediately = canFallback && !primaryVoice;

  const speakFallback = () => {
    if (!canFallback) return;
    synth.cancel();
    if (synth.paused) synth.resume();
    const fallback = new SpeechSynthesisUtterance(action.fallbackText);
    fallback.lang = "en-US";
    fallback.rate = 0.9;
    fallback.pitch = 1;
    fallback.volume = 1;
    const fallbackVoice = findVoice("en-US", voices);
    if (fallbackVoice) fallback.voice = fallbackVoice;
    announce(\`當地語言：${'${action.label}'}｜${'${action.fallbackText}'}（裝置未能播放原語音，改用拼音）\`);
    synth.speak(fallback);
  };

  if (useFallbackImmediately) {
    speakFallback();
    return;
  }

  const utterance = new SpeechSynthesisUtterance(action.text);
  utterance.lang = action.lang;
  utterance.rate = action.type === "landmark" ? 1.06 : 0.9;
  utterance.pitch = action.type === "landmark" ? 1.05 : 1;
  utterance.volume = 1;
  if (primaryVoice) utterance.voice = primaryVoice;

  let started = false;
  let retried = false;
  const retryFallback = () => {
    if (retried || started || !canFallback) return;
    retried = true;
    speakFallback();
  };
  const watchdog = setTimeout(retryFallback, 1800);
  utterance.onstart = () => {
    started = true;
    clearTimeout(watchdog);
  };
  utterance.onerror = () => {
    clearTimeout(watchdog);
    retryFallback();
  };

  synth.speak(utterance);
}`;

source = replaceOne(source, oldPlayer, newPlayer, "speech player fallback");

const oldFindVoice = `function findVoice(lang, voices = window.speechSynthesis?.getVoices?.() || []) {
  const base = lang.split("-")[0].toLowerCase();
  return voices.find((voice) => voice.lang === lang)
    || voices.find((voice) => voice.lang?.toLowerCase?.() === base)
    || voices.find((voice) => voice.lang?.toLowerCase?.().startsWith(\`${'${base}'}-\`))
    || null;
}`;

const newFindVoice = `function findVoice(lang, voices = window.speechSynthesis?.getVoices?.() || []) {
  const requested = String(lang || "").toLowerCase();
  const base = requested.split("-")[0];
  const exact = voices.filter((voice) => voice.lang?.toLowerCase?.() === requested);
  const family = voices.filter((voice) => voice.lang?.toLowerCase?.() === base || voice.lang?.toLowerCase?.().startsWith(\`${'${base}'}-\`));
  return exact.find((voice) => voice.localService)
    || family.find((voice) => voice.localService)
    || exact[0]
    || family[0]
    || null;
}`;

source = replaceOne(source, oldFindVoice, newFindVoice, "local voice preference");

await writeFile(filePath, source, "utf8");
console.log("✅ Applied staging Egypt audio fix: ar-EG + reliable fallback.");
