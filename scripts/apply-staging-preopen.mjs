import fs from "node:fs";

const domainPath = "functions/lib/reading-domain.mjs";
const testPath = "functions/test/reading-domain.test.mjs";
const stagingTestPath = "functions/test/staging-preopen.test.mjs";

function replaceOnce(text, needle, replacement, label) {
  const count = text.split(needle).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return text.replace(needle, replacement);
}

let domain = fs.readFileSync(domainPath, "utf8");

if (!domain.includes('STAGING_PREOPEN_PROJECT_ID = "scysps-reading-stg-20260818-a"')) {
  domain = replaceOnce(
    domain,
    'export const MAX_TEACHER_PAGE_SIZE = 500;\n',
    `export const MAX_TEACHER_PAGE_SIZE = 500;\n\nconst STAGING_PREOPEN_PROJECT_ID = "scysps-reading-stg-20260818-a";\n\nexport function isStagingPreSchoolYearTestingEnabled(environment = process.env) {\n  const directProjectId = String(\n    environment.GCLOUD_PROJECT\n      || environment.GOOGLE_CLOUD_PROJECT\n      || "",\n  ).trim();\n  if (directProjectId) return directProjectId === STAGING_PREOPEN_PROJECT_ID;\n\n  try {\n    const firebaseConfig = JSON.parse(String(environment.FIREBASE_CONFIG || "{}"));\n    return String(firebaseConfig.projectId || "").trim() === STAGING_PREOPEN_PROJECT_ID;\n  } catch {\n    return false;\n  }\n}\n`,
    "insert staging project guard",
  );

  domain = replaceOnce(
    domain,
    '  const bounds = academicYearBounds(schoolYear);\n  assertPlainObject(input, "Submission payload must be an object.");\n',
    `  const bounds = academicYearBounds(schoolYear);\n  const allowPreSchoolYearTesting = options.allowPreSchoolYearTesting === undefined\n    ? isStagingPreSchoolYearTestingEnabled()\n    : options.allowPreSchoolYearTesting === true;\n  assertPlainObject(input, "Submission payload must be an object.");\n`,
    "insert pre-open option",
  );

  domain = replaceOnce(
    domain,
    '  if (submissionDateKey < bounds.firstDate || submissionDateKey > bounds.lastDate) {\n    throw new DomainError("failed-precondition", "Reading submissions are closed for this academic year.");\n  }\n',
    `  if (\n    (!allowPreSchoolYearTesting && submissionDateKey < bounds.firstDate)\n    || submissionDateKey > bounds.lastDate\n  ) {\n    throw new DomainError("failed-precondition", "Reading submissions are closed for this academic year.");\n  }\n`,
    "relax server-date gate for staging",
  );

  domain = replaceOnce(
    domain,
    '  if (readingDate < bounds.firstDate || readingDate > bounds.lastDate || readingDate > submissionDateKey) {\n    throw new DomainError("invalid-argument", "readingDate must be within the active academic year and not in the future.");\n  }\n',
    `  if (\n    (!allowPreSchoolYearTesting && readingDate < bounds.firstDate)\n    || readingDate > bounds.lastDate\n    || readingDate > submissionDateKey\n  ) {\n    throw new DomainError("invalid-argument", "readingDate must be within the active academic year and not in the future.");\n  }\n`,
    "relax reading-date gate for staging",
  );

  fs.writeFileSync(domainPath, domain);
}

let tests = fs.readFileSync(testPath, "utf8");
const originalOutsideYear = '    () => parseReadingSubmission(VALID, { now: new Date("2026-08-18T04:00:00Z") }),\n';
if (tests.includes(originalOutsideYear)) {
  tests = tests.replace(
    originalOutsideYear,
    '    () => parseReadingSubmission(VALID, { now: new Date("2026-08-18T04:00:00Z"), allowPreSchoolYearTesting: false }),\n',
  );
  fs.writeFileSync(testPath, tests);
}

fs.writeFileSync(stagingTestPath, `import assert from "node:assert/strict";\nimport test from "node:test";\nimport {\n  DomainError,\n  isStagingPreSchoolYearTestingEnabled,\n  parseReadingSubmission,\n} from "../lib/reading-domain.mjs";\n\nconst NOW = new Date("2026-08-19T04:00:00.000Z");\nconst VALID = Object.freeze({\n  idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",\n  readingDate: "2026-08-19",\n  title: "西遊記",\n  author: "吳承恩",\n  readingType: "小說",\n  subject: "中文",\n  completed: "yes",\n});\n\ntest("only the named staging project enables pre-open testing", () => {\n  assert.equal(isStagingPreSchoolYearTestingEnabled({ GCLOUD_PROJECT: "scysps-reading-stg-20260818-a" }), true);\n  assert.equal(isStagingPreSchoolYearTestingEnabled({ GCLOUD_PROJECT: "reading-production" }), false);\n});\n\ntest("production still rejects August submissions", () => {\n  assert.throws(() => parseReadingSubmission(VALID, { now: NOW, allowPreSchoolYearTesting: false }),\n    (error) => error instanceof DomainError && error.code === "failed-precondition");\n});\n\ntest("staging accepts August pre-open submissions", () => {\n  const result = parseReadingSubmission(VALID, { now: NOW, allowPreSchoolYearTesting: true });\n  assert.equal(result.submissionDateKey, "2026-08-19");\n  assert.equal(result.record.readingDate, "2026-08-19");\n  assert.equal(result.distanceAwarded, 120);\n});\n\ntest("staging still rejects future reading dates", () => {\n  assert.throws(() => parseReadingSubmission({ ...VALID, readingDate: "2026-08-20" }, { now: NOW, allowPreSchoolYearTesting: true }),\n    (error) => error instanceof DomainError && error.code === "invalid-argument");\n});\n\ntest("staging still closes after the academic year ends", () => {\n  assert.throws(() => parseReadingSubmission({ ...VALID, readingDate: "2027-08-31" }, {\n    now: new Date("2027-09-01T04:00:00.000Z"),\n    allowPreSchoolYearTesting: true,\n  }), (error) => error instanceof DomainError && error.code === "failed-precondition");\n});\n`);

console.log("✅ staging-only pre-open patch applied");
