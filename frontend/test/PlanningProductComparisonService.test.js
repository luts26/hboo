import test from 'node:test'
import assert from 'node:assert/strict'

import {buildPlanningProductComparison} from '../hbapp/services/PlanningProductComparisonService.js'

const shopping = overrides => ({
	productId: 12,
	productName: 'Молоко',
	name: 'Молоко',
	amount: 1,
	unit: 'l',
	checked: false,
	position: 0,
	...overrides
})

const purchase = overrides => ({
	productId: 12,
	productName: 'Молоко',
	quantity: 900,
	unit: 'ml',
	total: 40,
	...overrides
})

test('Shopping Plan vs Fact uses canonical Product identity and unit normalization', () => {
	const comparison = buildPlanningProductComparison(
		[shopping()],
		[purchase()]
	)

	assert.equal(comparison.planned[0].status, 'under')
	assert.deepEqual(comparison.planned[0].planned, {amount: 1, unit: 'l'})
	assert.deepEqual(comparison.planned[0].purchased, {amount: 900, unit: 'ml'})
})

test('multiple factual and planned rows are aggregated by product_id', () => {
	const factualRows = buildPlanningProductComparison(
		[shopping()],
		[purchase({quantity: 500, unit: 'ml'}), purchase({quantity: 400, unit: 'ml'})]
	)
	const plannedRows = buildPlanningProductComparison(
		[shopping({amount: 500, unit: 'ml'}), shopping({amount: 500, unit: 'ml', position: 1})],
		[purchase({quantity: 1, unit: 'l'})]
	)

	assert.equal(factualRows.planned[0].status, 'under')
	assert.deepEqual(factualRows.planned[0].purchased, {amount: 900, unit: 'ml'})
	assert.equal(plannedRows.planned[0].status, 'matched')
})

test('missing planned amount is purchased, incompatible units are not comparable', () => {
	const missingPlannedAmount = buildPlanningProductComparison(
		[shopping({amount: null, unit: null})],
		[purchase()]
	)
	const incompatible = buildPlanningProductComparison(
		[shopping({amount: 1, unit: 'l'})],
		[purchase({quantity: 1, unit: 'pcs'})]
	)

	assert.equal(missingPlannedAmount.planned[0].status, 'purchased')
	assert.equal(incompatible.planned[0].status, 'not_comparable')
})

test('same text with different product_id does not match and unplanned Product is reported', () => {
	const comparison = buildPlanningProductComparison(
		[shopping({productId: 12, name: 'Молоко'})],
		[purchase({productId: 13, productName: 'Молоко'})]
	)

	assert.equal(comparison.planned[0].status, 'not_purchased')
	assert.equal(comparison.unplannedPurchased[0].productId, 13)
})

test('same product_id with different text matches and checked state is ignored', () => {
	const comparison = buildPlanningProductComparison(
		[shopping({name: 'Milk planned', checked: false})],
		[purchase({productName: 'Receipt milk'})]
	)

	assert.equal(comparison.planned[0].status, 'under')
})

test('unresolved factual rows are not treated as confirmed absence', () => {
	const comparison = buildPlanningProductComparison(
		[shopping({productId: 20, productName: 'Банани', name: 'Банани'})],
		[{productId: null, rawName: 'Банани вагові', quantity: 1, unit: 'kg', total: 50}]
	)

	assert.equal(comparison.planned[0].status, 'not_comparable')
	assert.equal(comparison.summary.notPurchasedProducts, 0)
	assert.equal(comparison.summary.unresolvedPurchaseItems, 1)
})
