import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { RELEASE_SCHOOL_YEAR, loadBuildConfig } from "../scripts/deployment-env.mjs";

const functionsSource = await readFile(new URL("../functions/lib/reading-domain.mjs", import.meta.url), "utf8");
const rulesSource = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
const importerSource = await readFile(new URL("../admin-tools/import-users-from-csv.mjs", import.meta.url), "utf8");
const teacherToolSource = await readFile(new URL("../admin-tools/create-teacher.mjs", import.meta.url), "utf8");

function buildEnvironment(schoolYear) {
  return {
    DEPLOYMENT_ENV: "ci",
    FIREBASE_API_KEY: "dummy-api-key-for-contract-test",
    FIREBASE_AUTH_DOMAIN: "reading-ci.firebaseapp.com",
    FIREBASE_PROJECT_ID: "reading-ci-school",
    FIREBASE_STORAGE_BUCKET: "reading-ci-school.firebasestorage.app",
    FIREBASE_MESSAGING_SENDER_ID: "123456789012",
    FIREBASE_APP_ID: "1:123456789012:web:abcdef123456",
    FIREBASE_APP_CHECK_SITE_KEY: "dummy-app-check-site-key",
    SCHOOL_CODE: "scysps",
    SCHOOL_NAME: "School Reading Run",
    SCHOOL_YEAR: schoolYear,
    SCHOOL_SITE_ORIGIN: "https://reading-ci.example.edu.hk",
  };
}

test("release year is identical in deployment, Functions and Firestore Rules", () => {
  assert.match(functionsSource, new RegExp(`DEFAULT_SCHOOL_YEAR = ["']${RELEASE_SCHOOL_YEAR}["']`, "u"));
  const yearLiterals = new Set(rulesSource.match(/20\d{2}-20\d{2}/gu) || []);
  assert.deepEqual([...yearLiterals], [RELEASE_SCHOOL_YEAR]);
  assert.match(importerSource, new RegExp(`DEFAULT_SCHOOL_YEAR = ["']${RELEASE_SCHOOL_YEAR}["']`, "u"));
  assert.match(teacherToolSource, new RegExp(`schoolYear !== ["']${RELEASE_SCHOOL_YEAR}["']`, "u"));
  assert.equal(loadBuildConfig(buildEnvironment(RELEASE_SCHOOL_YEAR)).schoolYear, RELEASE_SCHOOL_YEAR);
});

test("a future school year fails closed until all three layers are updated together", () => {
  assert.throws(
    () => loadBuildConfig(buildEnvironment("2027-2028")),
    /only supports SCHOOL_YEAR=2026-2027/u,
  );
});
