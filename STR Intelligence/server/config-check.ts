import { getServerConfigurationStatus } from "./config/env.js";

const status = getServerConfigurationStatus();
const requiredReady = status.apifyApiToken && status.apifyZillowActorId;

console.log("STR Intelligence server configuration");
console.log(`Apify API token: ${status.apifyApiToken ? "configured" : "missing"}`);
console.log(`Zillow Actor ID: ${status.apifyZillowActorId ? "configured" : "missing"}`);

if (!requiredReady) {
  process.exitCode = 1;
}
