/**
 * Bounded-concurrency map, shared by the scan sweep and the scan's own
 * persistence pass. Lifted out of index.ts so scanPersistence.ts can use the
 * exact loop the sweep uses — two copies of "four at a time" is how the two
 * halves of one request end up with different concurrency under load.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, limit), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await worker(items[currentIndex]);
      }
    }),
  );

  return results;
}
