(() => {
  const RESET_ID = "2026-07-09-student-only-reset-1";
  const MARKER_KEY = "reading-run-reset-id";

  const MOBILE_FIX_ID = "reading-run-mobile-map-fix";
  if (!document.getElementById(MOBILE_FIX_ID)) {
    const link = document.createElement("link");
    link.id = MOBILE_FIX_ID;
    link.rel = "stylesheet";
    link.href = "./mobile-map-fix.css?v=20260709-student-only-reset-1";
    document.head.appendChild(link);
  }

  window.addEventListener("load", () => {
    setTimeout(() => window.dispatchEvent(new Event("resize")), 250);
    setTimeout(() => window.dispatchEvent(new Event("resize")), 1000);
  });

  if (localStorage.getItem(MARKER_KEY) === RESET_ID) return;

  [
    "reading-run-session-v1",
    "reading-run-demo-students-v1",
    "reading-run-pending-books-v1",
  ].forEach((key) => localStorage.removeItem(key));
  localStorage.setItem(MARKER_KEY, RESET_ID);

  // Remove legacy Firestore IndexedDB caches. The secure application does not
  // enable persistent Firestore storage on shared student devices.
  if (typeof indexedDB?.databases === "function") {
    indexedDB.databases().then((databases) => {
      databases
        .map((database) => database.name || "")
        .filter((name) => /firestore/i.test(name) && /book-running/i.test(name))
        .forEach((name) => indexedDB.deleteDatabase(name));
    }).catch(() => {});
  }
})();
