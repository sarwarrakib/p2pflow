'use strict';

function boundedInt(value, fallback = 1, min = 1, max = 32) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return [];
  const limit = Math.min(list.length, boundedInt(concurrency, 1, 1, 32));
  const results = new Array(list.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= list.length) return;
      results[index] = await mapper(list[index], index);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

module.exports = { mapWithConcurrency, boundedInt };
