// Emergency privacy mode for student-facing modules.
// The real Firebase configuration remains in firebase-config.js and is imported only
// by secured teacher/recommendation modules using a cache-busted specifier.
export const firebaseConfig = {
  apiKey: "DISABLED",
  authDomain: "DISABLED",
  projectId: "DISABLED",
  storageBucket: "DISABLED",
  messagingSenderId: "DISABLED",
  appId: "DISABLED",
  measurementId: "DISABLED",
};
