import * as AUTH from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js?reading-run-auth-base=1";

export * from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js?reading-run-auth-base=1";

// Legacy modules call signInAnonymously during startup. In the hardened build,
// anonymous identities are never created. Wait for Firebase to restore the
// persisted student account, then return it without creating a new identity.
export async function signInAnonymously(auth) {
  if (typeof auth.authStateReady === "function") {
    await auth.authStateReady();
  } else if (!auth.currentUser) {
    await new Promise((resolve) => {
      const unsubscribe = AUTH.onAuthStateChanged(auth, () => {
        unsubscribe();
        resolve();
      });
    });
  }
  return { user: auth.currentUser || null };
}

export const __AUTH_BASE = AUTH;
