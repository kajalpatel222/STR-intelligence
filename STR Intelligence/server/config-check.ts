import { getServerConfigurationStatus } from "./config/env.js";

const status = getServerConfigurationStatus();
const requiredReady = status.apifyApiToken && status.apifyZillowActorId && status.apifyAirbnbDiscoveryActorId && status.apifyAirbnbCalendarActorId;

console.log("STR Intelligence server configuration");
console.log(`Apify API token: ${status.apifyApiToken ? "configured" : "missing"}`);
console.log(`Zillow Actor ID: ${status.apifyZillowActorId ? "configured" : "missing"}`);
console.log(`Airbnb discovery Actor ID: ${status.apifyAirbnbDiscoveryActorId ? "configured" : "missing"}`);
console.log(`Airbnb calendar Actor ID: ${status.apifyAirbnbCalendarActorId ? "configured" : "missing"}`);

if (!requiredReady) {
  process.exitCode = 1;
}
