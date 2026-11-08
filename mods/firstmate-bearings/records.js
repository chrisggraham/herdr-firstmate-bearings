// Keeps the full task records of one Firstmate, by task id. A record is fetched once; it is fetched
// again only when the snapshot entry for that id changes. Pure: the cache (a Map) is passed in.

// A record that failed to load is tried again after this long, so a broken Firstmate does not fill the log.
export const RETRY_MS = 5 * 60 * 1000;

// The keys ({ id, signature }) whose record is missing, was fetched for an older signature,
// or failed to load (`failedAt`, in milliseconds) at least RETRY_MS ago.
export function keysToFetch(keys, cache, now) {
  return keys.filter(({ id, signature }) => {
    const entry = cache.get(id);
    if (entry?.signature !== signature) return true;
    return entry.failedAt !== undefined && now - entry.failedAt >= RETRY_MS;
  });
}

// Makes every failed record due now, for a click on the refresh button.
export function retryFailedRecords(cache) {
  for (const [id, entry] of cache) if (entry.failedAt !== undefined) cache.delete(id);
}

// Forgets the records of ids that are no longer in the snapshot.
export function dropGoneRecords(keys, cache) {
  const present = new Set(keys.map((key) => key.id));
  for (const id of cache.keys()) if (!present.has(id)) cache.delete(id);
}
