import { loadBuildConfig, requiredEnv } from "./deployment-env.mjs";

const config = loadBuildConfig();
if (config.deploymentEnv === "ci") {
  throw new Error("CI builds cannot deploy.");
}

const expectedOwner = requiredEnv("SCHOOL_GITHUB_ORG");
const actualOwner = requiredEnv("GITHUB_REPOSITORY_OWNER");
const repository = requiredEnv("GITHUB_REPOSITORY");
const ownerType = requiredEnv("REPOSITORY_OWNER_TYPE");
const ref = requiredEnv("GITHUB_REF");
const refProtected = requiredEnv("GITHUB_REF_PROTECTED");
const workloadIdentityProvider = requiredEnv("GCP_WORKLOAD_IDENTITY_PROVIDER");
const serviceAccount = requiredEnv("GCP_SERVICE_ACCOUNT");

if (expectedOwner.toLowerCase() === "pakho2433" || expectedOwner !== actualOwner) {
  throw new Error("Deployment is allowed only from the configured school GitHub Organization.");
}
if (ownerType !== "Organization" || !repository.startsWith(`${expectedOwner}/`)) {
  throw new Error("The deployment repository must be owned by a GitHub Organization.");
}
if (refProtected !== "true") {
  throw new Error("The deployment branch must have GitHub branch protection enabled.");
}

const expectedRef = config.deploymentEnv === "production" ? "refs/heads/main" : "refs/heads/staging";
if (ref !== expectedRef) {
  throw new Error(`${config.deploymentEnv} may deploy only from ${expectedRef}.`);
}
if (!/^projects\/\d+\/locations\/global\/workloadIdentityPools\/[a-z0-9-]+\/providers\/[a-z0-9-]+$/.test(workloadIdentityProvider)) {
  throw new Error("GCP_WORKLOAD_IDENTITY_PROVIDER has an unexpected resource name.");
}
if (!/^[a-z0-9-]+@[a-z][a-z0-9-]{4,28}[a-z0-9]\.iam\.gserviceaccount\.com$/.test(serviceAccount)) {
  throw new Error("GCP_SERVICE_ACCOUNT has an unexpected service-account email.");
}

console.log(`Deployment guard accepted ${repository}@${ref} for ${config.deploymentEnv}.`);
