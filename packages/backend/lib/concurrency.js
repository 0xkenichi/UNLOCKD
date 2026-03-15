// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).

const mapWithConcurrency = async (items, worker, concurrency = 4) => {
    if (!Array.isArray(items) || !items.length) return [];
    const safeConcurrency = Math.max(1, Math.min(concurrency, items.length));
    const results = new Array(items.length);
    let cursor = 0;
    const runner = async () => {
        while (cursor < items.length) {
            const idx = cursor;
            cursor += 1;
            results[idx] = await worker(items[idx], idx);
        }
    };
    await Promise.all(Array.from({ length: safeConcurrency }, runner));
    return results;
};

module.exports = { mapWithConcurrency };
