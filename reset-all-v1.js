(() => {
  const RESET_ID = "2026-07-03-full-reset-1";
  const MARKER_KEY = "reading-run-reset-id";

  if (localStorage.getItem(MARKER_KEY) === RESET_ID) return;

  [
    "reading-run-session-v1",
    "reading-run-demo-students-v1",
    "reading-run-pending-books-v1",
  ].forEach((key) => localStorage.removeItem(key));

  localStorage.setItem(MARKER_KEY, RESET_ID);

  // Best-effort removal of this app's cached Firestore database so old
  // offline data cannot briefly reappear after the server-side reset.
  if (typeof indexedDB?.databases === "function") {
    indexedDB.databases().then((databases) => {
      databases
        .map((database) => database.name || "")
        .filter((name) => /firestore/i.test(name) && /book-running/i.test(name))
        .forEach((name) => indexedDB.deleteDatabase(name));
    }).catch(() => {});
  }
})();
