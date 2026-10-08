import test from 'node:test';
import assert from 'node:assert/strict';

import {buildPlanningProductComparison} from '../src/services/PlanningProductComparisonService.js';

const shopping = overrides => ({
    productId: 12,
    productName: 'Молоко',
    name: 'Молоко',
    amount: 1,
    unit: 'l',
    checked: false,
    position: 0,
    ...overrides
});

const purchase = overrides => ({
    productId: 12,
    productName: 'Молоко',
    quantity: 900,
    unit: 'ml',
    total: 40,
    ...overrides
});

test('matches canonical product_id and classifies under quantity', () => {
    const comparison = buildPlanningProductComparison(
        [shopping()],
        [purchase()]
    );

    assert.equal(comparison.planned[0].productId, 12);
    assert.equal(comparison.planned[0].status, 'under');
    assert.deepEqual(comparison.planned[0].planned, {amount: 1, unit: 'l'});
    assert.deepEqual(comparison.planned[0].purchased, {amount: 900, unit: 'ml'});
});

test('normalizes compatible weight and volume units', () => {
    const weight = buildPlanningProductComparison(
        [shopping({productId: 20, productName: 'Банани', name: 'Банани', amount: 1, unit: 'kg'})],
        [purchase({productId: 20, productName: 'Банани', quantity: 1000, unit: 'g'})]
    );
    const volume = buildPlanningProductComparison(
        [shopping({amount: 1, unit: 'l'})],
        [purchase({quantity: 1000, unit: 'ml'})]
    );

    assert.equal(weight.planned[0].status, 'matched');
    assert.equal(volume.planned[0].status, 'matched');
});

test('aggregates multiple factual rows for the same Product', () => {
    const comparison = buildPlanningProductComparison(
        [shopping()],
        [
            purchase({quantity: 500, unit: 'ml'}),
            purchase({quantity: 400, unit: 'ml'})
        ]
    );

    assert.equal(comparison.planned[0].status, 'under');
    assert.deepEqual(comparison.planned[0].purchased, {amount: 900, unit: 'ml'});
});

test('aggregates multiple planned rows without mutating Shopping List rows', () => {
    const comparison = buildPlanningProductComparison(
        [
            shopping({amount: 500, unit: 'ml'}),
            shopping({amount: 500, unit: 'ml', position: 1})
        ],
        [purchase({quantity: 1, unit: 'l'})]
    );

    assert.equal(comparison.planned[0].status, 'matched');
    assert.deepEqual(comparison.planned[0].planned, {amount: 1000, unit: 'ml'});
});

test('missing planned amount still shows Product as purchased', () => {
    const comparison = buildPlanningProductComparison(
        [shopping({amount: null, unit: null})],
        [purchase()]
    );

    assert.equal(comparison.planned[0].status, 'purchased');
    assert.deepEqual(comparison.planned[0].planned, {amount: null, unit: null});
});

test('marks planned Product absent only when resolved factual Products exist', () => {
    const comparison = buildPlanningProductComparison(
        [shopping({productId: 20, productName: 'Банани', name: 'Банани', amount: 1, unit: 'kg'})],
        [purchase({productId: 12, productName: 'Молоко'})]
    );

    assert.equal(comparison.planned[0].status, 'not_purchased');
});

test('reports canonical factual Products that were not planned', () => {
    const comparison = buildPlanningProductComparison(
        [shopping()],
        [
            purchase(),
            purchase({productId: 30, productName: 'Шоколад', quantity: 100, unit: 'g'})
        ]
    );

    assert.equal(comparison.unplannedPurchased.length, 1);
    assert.equal(comparison.unplannedPurchased[0].productName, 'Шоколад');
    assert.equal(comparison.unplannedPurchased[0].status, 'unplanned');
});

test('does not match same text with a different product_id', () => {
    const comparison = buildPlanningProductComparison(
        [shopping({productId: 12, name: 'Молоко'})],
        [purchase({productId: 13, productName: 'Молоко'})]
    );

    assert.equal(comparison.planned[0].status, 'not_purchased');
    assert.equal(comparison.unplannedPurchased[0].productId, 13);
});

test('matches same product_id even when display text differs', () => {
    const comparison = buildPlanningProductComparison(
        [shopping({name: 'Milk planned'})],
        [purchase({productName: 'Receipt milk'})]
    );

    assert.equal(comparison.planned[0].status, 'under');
});

test('same product_id with incompatible units is not comparable', () => {
    const comparison = buildPlanningProductComparison(
        [shopping({amount: 1, unit: 'l'})],
        [purchase({quantity: 1, unit: 'pcs'})]
    );

    assert.equal(comparison.planned[0].status, 'not_comparable');
});

test('unresolved factual items do not falsely mark planned Products as absent', () => {
    const comparison = buildPlanningProductComparison(
        [shopping({productId: 20, productName: 'Банани', name: 'Банани'})],
        [{productId: null, rawName: 'Банани вагові', quantity: 1, unit: 'kg', total: 50}]
    );

    assert.equal(comparison.planned[0].status, 'not_comparable');
    assert.equal(comparison.summary.unresolvedPurchaseItems, 1);
    assert.equal(comparison.summary.notPurchasedProducts, 0);
});

test('Shopping List checked state is ignored by factual comparison', () => {
    const comparison = buildPlanningProductComparison(
        [shopping({checked: false})],
        [purchase()]
    );

    assert.equal(comparison.planned[0].status, 'under');
});
