import * as FS from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js?reading-run-firestore-base=1";

export * from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js?reading-run-firestore-base=1";

const SESSION_KEY = "reading-run-session-v1";

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function isPrivateStudentReference(reference) {
  return Boolean(reference?.path && /^students\/[^/]+$/.test(reference.path));
}

function publicProjection(data = {}) {
  const allowed = ["classId", "studentId", "booksCount", "distance", "updatedAt"];
  return Object.fromEntries(allowed.filter((key) => key in data).map((key) => [key, data[key]]));
}

function publicReference(reference) {
  return FS.doc(reference.firestore, "publicStudents", reference.id);
}

// Do not retain school data in IndexedDB on shared student devices.
export async function enableIndexedDbPersistence() {
  return undefined;
}

// Legacy UI asks for the entire students collection. Redirect that request to
// a public, minimal projection and force it to the signed-in student's class.
export function collection(firestore, ...pathSegments) {
  if (pathSegments.length === 1 && pathSegments[0] === "students") {
    const classId = String(readSession()?.classId || "__NO_CLASS__");
    return FS.query(
      FS.collection(firestore, "publicStudents"),
      FS.where("classId", "==", classId),
    );
  }
  return FS.collection(firestore, ...pathSegments);
}

export async function setDoc(reference, data, options) {
  const result = options
    ? await FS.setDoc(reference, data, options)
    : await FS.setDoc(reference, data);

  if (isPrivateStudentReference(reference)) {
    const projection = publicProjection(data);
    if (Object.keys(projection).length) {
      await FS.setDoc(publicReference(reference), projection, { merge: true });
    }
  }
  return result;
}

export function runTransaction(firestore, updateFunction, options) {
  return FS.runTransaction(firestore, async (transaction) => {
    let proxy;
    proxy = new Proxy(transaction, {
      get(target, property) {
        if (property === "set") {
          return (reference, data, setOptions) => {
            if (setOptions) target.set(reference, data, setOptions);
            else target.set(reference, data);

            if (isPrivateStudentReference(reference)) {
              const projection = publicProjection(data);
              if (Object.keys(projection).length) {
                target.set(publicReference(reference), projection, { merge: true });
              }
            }
            return proxy;
          };
        }
        const value = target[property];
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    return updateFunction(proxy);
  }, options);
}

export const __FIRESTORE_BASE = FS;
