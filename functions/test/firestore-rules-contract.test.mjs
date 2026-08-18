import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rulesPath = fileURLToPath(new URL("../../firestore.rules", import.meta.url));
const rules = await readFile(rulesPath, "utf8");

test("clients cannot write server-owned progress and log collections", () => {
  assert.equal((rules.match(/allow create, update, delete: if false;/gu) || []).length >= 5, true);
  assert.doesNotMatch(rules, /allow\s+(?:create|update|write)[^;]*isStudent/gu);
});

test("student document keys are based on academic year and auth UID", () => {
  assert.match(rules, /return "2026-2027__" \+ request\.auth\.uid;/u);
  assert.doesNotMatch(rules, /profile\(\)\.classId \+ "__" \+ profile\(\)\.studentId/u);
});

test("student reads require active-year ownership or same-class public data", () => {
  assert.match(rules, /resource\.data\.authUid == request\.auth\.uid/u);
  assert.match(rules, /resource\.data\.classId == profile\(\)\.classId/u);
  assert.match(rules, /resource\.data\.schoolYear == "2026-2027"/u);
});
