import test from 'node:test'
import assert from 'node:assert/strict'

import {calculatePlanVsFact} from '../hbapp/services/PlanVsFactService.js'

const item = (patch = {}) => ({
	id: patch.id || '1',
	title: patch.title || 'Expense',
	sum: patch.sum ?? 100,
	actualAmount: Object.prototype.hasOwnProperty.call(patch, 'actualAmount') ? patch.actualAmount : 100,
	status: patch.status || 'completed',
	date: new Date(2026, 8, 10).getTime(),
	...patch
})

test('completed item under plan is comparable', () => {
	const result = calculatePlanVsFact([item({sum: 2000, actualAmount: 1700})])
	assert.equal(result.items[0].difference, 300)
	assert.equal(result.items[0].result, 'under')
	assert.equal(result.summary.underPlanCount, 1)
})

test('completed item over plan is comparable', () => {
	const result = calculatePlanVsFact([item({sum: 2000, actualAmount: 2400})])
	assert.equal(result.items[0].difference, -400)
	assert.equal(result.items[0].result, 'over')
	assert.equal(result.summary.overPlanCount, 1)
})

test('exact plan and fact is classified separately', () => {
	const result = calculatePlanVsFact([item({sum: 300, actualAmount: 300})])
	assert.equal(result.items[0].difference, 0)
	assert.equal(result.items[0].result, 'exact')
	assert.equal(result.summary.exactCount, 1)
})

test('pending item does not become actual zero', () => {
	const result = calculatePlanVsFact([item({status: 'pending', sum: 12000, actualAmount: null})])
	assert.equal(result.items.length, 0)
	assert.equal(result.summary.pendingCount, 1)
	assert.equal(result.summary.plannedComparable, 0)
	assert.equal(result.summary.difference, 0)
})

test('cancelled and disabled items are excluded from savings', () => {
	const result = calculatePlanVsFact([
		item({status: 'cancelled', sum: 5000, actualAmount: null}),
		item({status: 'disabled', sum: 3000, actualAmount: null})
	])
	assert.equal(result.items.length, 0)
	assert.equal(result.summary.cancelledCount, 2)
	assert.equal(result.summary.plannedComparable, 0)
})

test('completed item without fact is unavailable, not exact', () => {
	const result = calculatePlanVsFact([item({status: 'completed', sum: 900, actualAmount: null})])
	assert.equal(result.items.length, 0)
	assert.equal(result.unavailableItems.length, 1)
	assert.equal(result.unavailableItems[0].result, 'unavailable')
	assert.equal(result.summary.completedWithoutFactCount, 1)
})

test('aggregate compares the same comparable population', () => {
	const result = calculatePlanVsFact([
		item({id: '1', status: 'completed', sum: 1000, actualAmount: 800}),
		item({id: '2', status: 'pending', sum: 2000, actualAmount: null}),
		item({id: '3', status: 'cancelled', sum: 3000, actualAmount: null}),
		item({id: '4', status: 'completed', sum: 4000, actualAmount: null})
	])
	assert.equal(result.summary.plannedComparable, 1000)
	assert.equal(result.summary.actualComparable, 800)
	assert.equal(result.summary.difference, 200)
	assert.equal(result.summary.comparableCount, 1)
})

test('multiple comparable items are aggregated and counted', () => {
	const result = calculatePlanVsFact([
		item({id: '1', sum: 1000, actualAmount: 800}),
		item({id: '2', sum: 1000, actualAmount: 1200}),
		item({id: '3', sum: 1000, actualAmount: 1000})
	])
	assert.equal(result.summary.plannedComparable, 3000)
	assert.equal(result.summary.actualComparable, 3000)
	assert.equal(result.summary.difference, 0)
	assert.equal(result.summary.underPlanCount, 1)
	assert.equal(result.summary.overPlanCount, 1)
	assert.equal(result.summary.exactCount, 1)
})

test('decimal amounts are rounded to money precision', () => {
	const result = calculatePlanVsFact([item({sum: 10.10, actualAmount: 6.67})])
	assert.equal(result.items[0].difference, 3.43)
	assert.equal(result.summary.difference, 3.43)
})

test('zero actual amount is a legitimate fact value', () => {
	const result = calculatePlanVsFact([item({sum: 50, actualAmount: 0})])
	assert.equal(result.items.length, 1)
	assert.equal(result.items[0].actualAmount, 0)
	assert.equal(result.items[0].difference, 50)
	assert.equal(result.items[0].result, 'under')
})

test('missing actual is distinguished from numeric zero', () => {
	const result = calculatePlanVsFact([
		item({id: 'zero', sum: 50, actualAmount: 0}),
		item({id: 'missing', sum: 50, actualAmount: undefined})
	])
	assert.equal(result.summary.comparableCount, 1)
	assert.equal(result.summary.completedWithoutFactCount, 1)
	assert.deepEqual(result.items.map(planItem => planItem.itemId), ['zero'])
})
