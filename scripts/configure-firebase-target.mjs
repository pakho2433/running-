import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadHostingTarget } from "./deployment-env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { projectId, hostingSite } = loadHostingTarget();
const firebaserc = {
  projects: { default: projectId },
  targets: {
    [projectId]: {
      hosting: { reading: [hostingSite] }
    }
  }
};

await writeFile(path.join(root, ".firebaserc"), `${JSON.stringify(firebaserc, null, 2)}\n`, {
  encoding: "utf8",
  mode: 0o600
});
console.log(`Configured Firebase project ${projectId} and Hosting target ${hostingSite}.`);
