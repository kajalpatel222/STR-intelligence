import type { StoredComparableLibraryItem } from "../str-comparator/repository.js";

export type StrComparableLibraryRepository = Readonly<{
  listComparableLibrary(limit?: number): Promise<readonly StoredComparableLibraryItem[]>;
}>;

export function createStrComparableLibraryHandler(repository: StrComparableLibraryRepository) {
  return async function getLibrary() {
    const items = await repository.listComparableLibrary(200);
    return {
      statusCode: 200,
      body: {
        status: "available",
        comparables: items.map(toPublicLibraryItem),
      },
    } as const;
  };
}

function toPublicLibraryItem(item: StoredComparableLibraryItem) {
  const comparable = item.comparable;
  return {
    listingUrl: comparable.listingUrl,
    title: comparable.title,
    imageUrl: comparable.imageUrl,
    distanceMiles: comparable.distanceMiles,
    propertyType: comparable.propertyType,
    roomType: comparable.roomType,
    bedrooms: comparable.bedrooms,
    bathrooms: comparable.bathrooms,
    guestCapacity: comparable.guestCapacity,
    rating: comparable.rating,
    reviewCount: comparable.reviewCount,
    isSuperhost: comparable.isSuperhost,
    amenities: comparable.amenities.slice(0, 12),
    observedNightlyPriceUsd: comparable.observedNightlyPriceUsd,
    observedCheckIn: comparable.observedCheckIn,
    observedCheckOut: comparable.observedCheckOut,
    similarityScore: comparable.similarityScore,
    matchReasons: comparable.matchReasons,
    calendarUnavailablePercentage: comparable.calendarUnavailablePercentage,
    calendarUnavailableNights: comparable.calendarUnavailableNights,
    calendarWindows: comparable.calendarWindows,
    calendarObservedAt: comparable.calendarObservedAt,
    calendarObservationCount: comparable.calendarObservationCount,
    associatedPropertyCount: item.associatedPropertyCount,
    associatedProperties: item.associatedProperties.map((property) => ({ listingUrl: property.listingUrl, address: property.address })),
    firstObservedAt: item.firstObservedAt,
    latestObservedAt: item.latestObservedAt,
    comparisonReference: item.comparisonReference,
  };
}
