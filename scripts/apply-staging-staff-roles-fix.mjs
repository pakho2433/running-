import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const filePath = path.join(root, "dist", "secure-password-ui-app.js");
let source = await readFile(filePath, "utf8");
const oldLine = "  const recentReaders = students.filter((item) => daysSinceReading(item.lastReadingDate) <= 7).length;";
const newLine = `  const recentReaders = students.filter((item) => {
    const days = daysSinceReading(item.lastReadingDate);
    return days !== null && days <= 7;
  }).length;`;
if (source.includes(oldLine)) {
  source = source.replace(oldLine, newLine);
} else if (!source.includes("return days !== null && days <= 7;")) {
  throw new Error("Could not apply staff continuity metric fix.");
}
await writeFile(filePath, source, "utf8");
console.log("✅ Fixed staging 7-day reading metric: missing dates are not counted as recent readers.");
