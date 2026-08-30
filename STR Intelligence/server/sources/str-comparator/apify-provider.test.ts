import { strict as assert } from "node:assert";
import test from "node:test";
import { ApifyAirbnbProvider, type ApifyClientPort, normalizeCalendar, normalizeDiscovery } from "./apify-provider.js";

class FakeApifyClient implements ApifyClientPort {
  calls: Array<{ actorId: string; input: Record<string, unknown>; options: Record<string, unknown> }> = [];
  datasetCalls: Array<{ datasetId: string; options: Record<string, unknown> }> = [];
  items: unknown[] = [];
  run: { status?: string; defaultDatasetId?: string } = { status: "SUCCEEDED", defaultDatasetId: "dataset-1" };
  error?: Error;
  neverResolves = false;

  actor(actorId: string) {
    return { call: async (input: Record<string, unknown>, options: { waitSecs: number }) => {
      this.calls.push({ actorId, input, options });
      if (this.neverResolves) return new Promise<never>(() => undefined);
      if (this.error) throw this.error;
      return this.run;
    } };
  }

  dataset(datasetId: string) {
    return { listItems: async (options: { limit: number; clean: boolean }) => {
      this.datasetCalls.push({ datasetId, options });
      return { items: this.items };
    } };
  }
}

function provider(client: FakeApifyClient, timeoutMs = 100) {
  return new ApifyAirbnbProvider({ client, discoveryActorId: "unfenced/discovery", calendarActorId: "cirkit/calendar", timeoutMs });
}

test("caps discovery at 15 in actor input, dataset read, and returned records", async () => {
  const client = new FakeApifyClient();
  client.items = Array.from({ length: 20 }, (_, index) => ({ id: String(index), url: `https://airbnb.test/rooms/${index}` }));
  const result = await provider(client).discover({ location: "Oakhurst, CA", limit: 100 });

  assert.equal(client.calls[0]?.actorId, "unfenced/discovery");
  assert.equal(client.calls[0]?.input.maxResults, 15);
  assert.equal(client.calls[0]?.options.waitSecs, 1);
  assert.deepEqual(client.datasetCalls[0]?.options, { limit: 15, clean: true });
  assert.equal(result.records.length, 15);
  assert.equal(result.errors.length, 0);
});

test("normalizes documented unfenced snake_case and common camelCase discovery variants", () => {
  const snake = normalizeDiscovery({
    id: "123", url: "https://airbnb.com/rooms/123", title: "Cabin", room_type: "Entire home/apt",
    property_type: "Cabin", price_per_night: 245, pricing_currency: "USD", overall_rating: 4.9,
    review_count: 80, max_guests: 6, main_image_url: "https://img.test/a.jpg", scraped_at: "2026-08-30T00:00:00Z",
  });
  const camel = normalizeDiscovery({ listingId: 456, listingUrl: "https://airbnb.com/rooms/456", roomType: "Private room", pricePerNight: "$99" });

  assert.equal("code" in snake, false);
  if ("code" in snake) return;
  assert.equal(snake.nightlyRate, 245);
  assert.equal(snake.maxGuests, 6);
  assert.equal(snake.imageUrl, "https://img.test/a.jpg");
  assert.equal("code" in camel, false);
  if ("code" in camel) return;
  assert.equal(camel.listingId, "456");
  assert.equal(camel.nightlyRate, 99);
});

test("caps calendar collection at five listings and bounds months", async () => {
  const client = new FakeApifyClient();
  client.items = Array.from({ length: 8 }, (_, index) => ({ listingId: String(index), days: [] }));
  const listings = Array.from({ length: 8 }, (_, index) => ({ listingId: String(index), url: `https://airbnb.test/rooms/${index}` }));
  const result = await provider(client).collectCalendars({ listings, months: 99 });

  assert.equal(client.calls[0]?.actorId, "cirkit/calendar");
  assert.equal((client.calls[0]?.input.listingIds as string[]).length, 5);
  assert.equal(client.calls[0]?.input.months, 12);
  assert.equal(client.calls[0]?.input.maxItems, 5);
  assert.equal(client.datasetCalls[0]?.options.limit, 5);
  assert.equal(result.records.length, 5);
});

test("normalizes cirkit days and unfenced calendar_data variants", () => {
  const cirkit = normalizeCalendar({ listingId: "123", currency: "USD", days: [{ calendarDate: "2026-09-01", available: true, bookable: true, minNights: 2, priceFormatted: "$250" }] });
  const unfenced = normalizeCalendar({ id: "456", pricing_currency: "USD", calendar_data: [{ date: "2026-09-02", available: false, available_for_checkin: false, min_nights: 3 }] });

  assert.equal("code" in cirkit, false);
  if ("code" in cirkit) return;
  assert.equal(cirkit.days[0]?.nightlyRate, 250);
  assert.equal(cirkit.days[0]?.bookable, true);
  assert.equal("code" in unfenced, false);
  if ("code" in unfenced) return;
  assert.equal(unfenced.days[0]?.availableForCheckin, false);
  assert.equal(unfenced.days[0]?.minNights, 3);
});

test("contains malformed rows and warning rows without exposing raw payload", async () => {
  const client = new FakeApifyClient();
  client.items = [{ secret: "must-not-leak" }, { listingId: "22", warning: "removed", secret: "also-private" }];
  const result = await provider(client).collectCalendars({ listings: [
    { listingId: "1", url: "https://airbnb.test/rooms/1" },
    { listingId: "22", url: "https://airbnb.test/rooms/22" },
  ] });

  assert.equal(result.records.length, 0);
  assert.equal(result.errors.length, 2);
  assert.equal(JSON.stringify(result).includes("must-not-leak"), false);
  assert.equal(JSON.stringify(result).includes("removed"), false);
});

test("contains actor exceptions and unfinished runs", async () => {
  const throwing = new FakeApifyClient();
  throwing.error = new Error("token=secret");
  const failed = await provider(throwing).discover({ location: "Mariposa, CA" });
  assert.deepEqual(failed.errors.map(({ code, message }) => ({ code, message })), [{ code: "provider_failure", message: "Apify discovery failed" }]);

  const running = new FakeApifyClient();
  running.run = { status: "RUNNING", defaultDatasetId: "partial" };
  const unfinished = await provider(running).discover({ location: "Mariposa, CA" });
  assert.equal(unfinished.errors[0]?.code, "provider_timeout");
  assert.equal(running.datasetCalls.length, 0);
});

test("enforces a local timeout and returns a contained timeout error", async () => {
  const client = new FakeApifyClient();
  client.neverResolves = true;
  const result = await provider(client, 10).discover({ location: "Oakhurst, CA" });
  assert.equal(result.errors[0]?.code, "provider_timeout");
  assert.equal(result.errors[0]?.message, "Apify discovery timed out");
});
