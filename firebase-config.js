// Firebase configuration fallback.
// During GitHub Pages deployment, the workflow refreshes firebase-runtime-config.json
// directly from Firebase Hosting's official /__/firebase/init.json endpoint.
const fallbackFirebaseConfig = {
  apiKey: "AIzaSyB2Drw3jtbvMuAtR_4KGN1J63_BU01EC00",
  authDomain: "book-running.firebaseapp.com",
  projectId: "book-running",
  storageBucket: "book-running.firebasestorage.app",
  messagingSenderId: "290164830206",
  appId: "1:290164830206:web:49509d69e702593e1c5aaf",
  measurementId: "G-LY7ZCKGE98",
};

async function loadFirebaseConfig() {
  try {
    const response = await fetch("./firebase-runtime-config.json", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Firebase runtime config returned ${response.status}`);
    }

    const config = await response.json();
    const requiredFields = [
      "apiKey",
      "authDomain",
      "projectId",
      "messagingSenderId",
      "appId",
    ];

    if (!requiredFields.every((field) => typeof config[field] === "string" && config[field])) {
      throw new Error("Firebase runtime config is incomplete");
    }

    return config;
  } catch (error) {
    console.warn("Using bundled Firebase configuration fallback.", error);
    return fallbackFirebaseConfig;
  }
}

export const firebaseConfig = await loadFirebaseConfig();
