// Keeps the full task records of one Firstmate, by task id. A record is fetched once; it is fetched
// again only when the snapshot entry for that id changes. Pure: the cache (a Map) is passed in.

// The keys ({ id, signature }) whose record is missing or was fetched for an older signature.
export function keysToFetch(keys, cache) {
  return keys.filter(({ id, signature }) => cache.get(id)?.signature !== signature);
}

// Forgets the records of ids that are no longer in the snapshot.
export function dropGoneRecords(keys, cache) {
  const present = new Set(keys.map((key) => key.id));
  for (const id of cache.keys()) if (!present.has(id)) cache.delete(id);
}
