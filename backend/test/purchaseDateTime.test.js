import test from 'node:test';
import assert from 'node:assert/strict';

import {
    formatPurchaseRangeBoundary,
    getDefaultPurchaseRange,
    parsePurchaseDateTime
} from '../src/services/PurchaseDateTime.js';

test('strict Purchase datetime parsing preserves local wall-clock components', () => {
    assert.equal(parsePurchaseDateTime('2026-10-20T12:00:00'), '2026-10-20 12:00:00');
    assert.equal(parsePurchaseDateTime('2026-10-20 12:00:00'), '2026-10-20 12:00:00');
    assert.equal(parsePurchaseDateTime('2026-10-20T12:00:00.000Z'), '2026-10-20 12:00:00');
    assert.equal(parsePurchaseDateTime('2026-02-29T12:00:00'), null);
    assert.equal(parsePurchaseDateTime('2026-10-20T24:00:00'), null);
    assert.equal(parsePurchaseDateTime('2026-10-20'), null);
    assert.equal(parsePurchaseDateTime('2026-10-20T12:00:00+03:00'), null);
});

test('Purchase range boundaries use Europe/Kyiv in summer and winter', () => {
    assert.equal(formatPurchaseRangeBoundary(Date.parse('2026-07-20T09:00:00Z')), '2026-07-20 12:00:00');
    assert.equal(formatPurchaseRangeBoundary(Date.parse('2026-01-20T10:00:00Z')), '2026-01-20 12:00:00');
    assert.equal(formatPurchaseRangeBoundary(Date.parse('2026-09-30T21:00:00Z')), '2026-10-01 00:00:00');
});

test('backend default range covers the current Kyiv day but excludes tomorrow', () => {
    const range = getDefaultPurchaseRange(new Date('2026-10-20T05:30:00Z'));
    assert.equal(formatPurchaseRangeBoundary(range.dateFrom), '2026-10-01 00:00:00');
    assert.equal(formatPurchaseRangeBoundary(range.dateTo), '2026-10-20 23:59:59');
    assert.ok(Date.parse('2026-10-20T09:00:00Z') <= range.dateTo);
    assert.ok(Date.parse('2026-10-20T21:00:00Z') > range.dateTo);
});

