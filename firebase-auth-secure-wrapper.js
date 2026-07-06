import * as AUTH from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js?reading-run-auth-base=1";

export * from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js?reading-run-auth-base=1";

// Legacy modules call signInAnonymously during startup. In the hardened build,
// anonymous identities are never created. A pre-authenticated Firebase user is
// returned; otherwise startup continues without granting database access.
export async function signInAnonymously(auth) {
  return { user: auth.currentUser || null };
}

export const __AUTH_BASE = AUTH;
