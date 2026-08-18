import assert from "node:assert/strict";
import test from "node:test";
import {
  applyImportState,
  buildReconciliationEntry,
  isPlaceholderPassword,
  parseCsv,
  preflightCsvRows,
  validateExistingState,
} from "../import-users-from-csv.mjs";

const config = Object.freeze({ schoolYear: "2026-2027", schoolCode: "scysps" });

function rows(text) {
  return parseCsv(`role,classId,studentId,email,pin,displayAlias,active\n${text}`);
}

test("CSV preflight accepts distinct random credentials and normalises identities", () => {
  const result = preflightCsvRows(rows([
    "student,c01,s0001,,9uH!m2Q#x7Lp,翡翠跑手,true",
    "student,C01,S0002,student-2@example.invalid,V4@kT8!qN2wZ,,false",
  ].join("\n")), config);

  assert.equal(result.length, 2);
  assert.equal(result[0].classId, "C01");
  assert.equal(result[0].studentId, "S0001");
  assert.equal(result[0].email, "scysps.20262027.c01.s0001@students.readingrun.invalid");
  assert.equal(result[1].active, false);
  assert.equal(result[0].schoolYear, "2026-2027");
});

test("CSV preflight rejects known and numbered placeholder credentials", () => {
  assert.equal(isPlaceholderPassword("CHANGE_TO_UNIQUE_12_CHAR_PASSWORD"), true);
  assert.equal(isPlaceholderPassword("REPLACE_WITH_UNIQUE_RANDOM_PASSWORD_001"), true);
  assert.throws(
    () => preflightCsvRows(rows("student,C01,S0001,,REPLACE_WITH_UNIQUE_RANDOM_PASSWORD_001,,true"), config),
    /placeholder/iu,
  );
});

test("CSV preflight rejects duplicate passwords without echoing the password", () => {
  const secret = "Same!Random#Secret2026";
  assert.throws(
    () => preflightCsvRows(rows([
      `student,C01,S0001,,${secret},,true`,
      `student,C01,S0002,,${secret},,true`,
    ].join("\n")), config),
    (error) => /pin\/password is duplicated/iu.test(error.message) && !error.message.includes(secret),
  );
});

test("CSV preflight rejects duplicate email and normalised class/student identity", () => {
  assert.throws(
    () => preflightCsvRows(rows([
      "student,c01,s0001,DUPLICATE@example.invalid,9uH!m2Q#x7Lp,,true",
      "student,C01,S0001,duplicate@example.invalid,V4@kT8!qN2wZ,,true",
    ].join("\n")), config),
    (error) => /email is duplicated/iu.test(error.message) && /classId \+ studentId is duplicated/iu.test(error.message),
  );
});

test("existing-state preflight preserves verified counters and the safest prior alias", () => {
  const [row] = preflightCsvRows(
    rows("student,C01,S0001,,9uH!m2Q#x7Lp,,true"),
    config,
  );
  const uid = "auth-uid-123";
  const studentKey = `2026-2027__${uid}`;
  const result = validateExistingState(row, {
    uid,
    profile: {
      role: "student",
      classId: "C01",
      studentId: "S0001",
      schoolYear: "2026-2027",
      studentKey,
      email: row.email,
      displayAlias: "藍鯨跑手",
    },
    student: {
      authUid: uid,
      classId: "C01",
      studentId: "S0001",
      schoolYear: "2026-2027",
      studentKey,
      email: row.email,
      booksCount: 23,
      distance: 720,
      dailyBooksCount: 2,
    },
    publicStudent: {
      classId: "C01",
      schoolYear: "2026-2027",
      displayAlias: "舊公開名稱",
      booksCount: 23,
      distance: 720,
    },
  });

  assert.equal(result.displayAlias, "藍鯨跑手");
  assert.equal(result.booksCount, 23);
  assert.equal(result.distance, 720);
  assert.equal(result.dailyBooksCount, 2);
  assert.equal(result.studentExists, true);
});

test("existing-state preflight rejects identity and counter conflicts", () => {
  const [row] = preflightCsvRows(
    rows("student,C01,S0001,,9uH!m2Q#x7Lp,,true"),
    config,
  );
  assert.throws(
    () => validateExistingState(row, {
      uid: "auth-uid-123",
      profile: { classId: "C02" },
    }),
    /classId conflicts/iu,
  );
  assert.throws(
    () => validateExistingState(row, {
      uid: "auth-uid-123",
      student: { booksCount: 5, distance: 50, dailyBooksCount: 0 },
      publicStudent: { booksCount: 4, distance: 50 },
    }),
    /counters do not match/iu,
  );
});

test("reconciliation records are structurally unable to include a password", () => {
  const secret = "NeverPrint!This2026";
  const entry = buildReconciliationEntry({
    row: { rowNumber: 9, email: "student@example.invalid", password: secret },
    uid: "uid-9",
    accountState: "existing-auth-updated-firestore-failed",
    firestoreError: new Error(secret),
  });
  const serialised = JSON.stringify(entry);
  assert.equal(Object.hasOwn(entry, "password"), false);
  assert.equal(serialised.includes(secret), false);
  assert.equal(entry.accountState, "existing-auth-updated-firestore-failed");
});

test("new Auth users are deleted with their possible Firestore documents after a batch failure", async () => {
  const commits = [];
  const deletedUsers = [];
  const db = fakeDb(async (batch) => {
    commits.push(batch);
    if (commits.length === 1) throw firebaseError("firestore/unavailable");
  });
  const auth = {
    async createUser() { return { uid: "new-uid-1" }; },
    async deleteUser(uid) { deletedUsers.push(uid); },
  };
  const result = await applyImportState({
    kind: "new",
    row: importRow("New!Random#Secret2026"),
  }, { auth, db });

  assert.equal(result.ok, false);
  assert.equal(result.rolledBack, true);
  assert.deepEqual(deletedUsers, ["new-uid-1"]);
  assert.equal(commits.length, 2);
  assert.deepEqual(commits[1].deletes.map((item) => item.path), [
    "users/new-uid-1",
    "students/2026-2027__new-uid-1",
    "publicStudents/2026-2027__new-uid-1",
  ]);
});

test("existing Auth updates produce password-free reconciliation after Firestore failure", async () => {
  const secret = "Existing!Random#Secret2026";
  const auth = {
    async updateUser(uid) { return { uid }; },
  };
  const db = fakeDb(async () => { throw firebaseError("firestore/aborted"); });
  const row = importRow(secret);
  const result = await applyImportState({
    kind: "existing",
    row,
    userRecord: { uid: "existing-uid-1" },
    persistence: {
      studentKey: "2026-2027__existing-uid-1",
      displayAlias: "安全跑手",
      booksCount: 0,
      distance: 0,
      dailyBooksCount: 0,
      studentExists: false,
    },
  }, { auth, db });

  assert.equal(result.ok, false);
  assert.equal(result.stage, "firestore");
  assert.equal(result.reconciliation.accountState, "existing-auth-updated-firestore-failed");
  assert.equal(JSON.stringify(result.reconciliation).includes(secret), false);
});

function importRow(password) {
  return {
    rowNumber: 2,
    classId: "C01",
    studentId: "S0001",
    email: "student@example.invalid",
    password,
    displayAlias: "安全跑手",
    active: true,
    schoolYear: "2026-2027",
  };
}

function fakeDb(onCommit) {
  return {
    doc(path) { return { path }; },
    batch() {
      const batch = {
        sets: [],
        deletes: [],
        set(reference, value, options) { this.sets.push({ reference, value, options }); },
        delete(reference) { this.deletes.push(reference); },
        async commit() { await onCommit(this); },
      };
      return batch;
    },
  };
}

function firebaseError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
