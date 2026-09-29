import test from 'node:test'
import assert from 'node:assert/strict'

import {calculateCurrentMonthPurchaseSummary} from '../hbapp/services/PurchaseSummaryService.js'

const now = new Date(2026, 8, 29, 15, 30, 0, 0)

const products = [
	{id: 1, serverId: 101, name: 'Tomato', categoryId: 10, categoryName: 'Овочі', status: 'active'},
	{id: 2, name: 'Beef', categoryId: 20, categoryName: "М'ясо", status: 'active'},
	{id: 3, name: 'Milk', categoryId: 30, categoryName: 'Молочні', status: 'disabled'},
	{id: 4, name: 'Tea', categoryId: 40, categoryName: 'Напої', status: 'active'}
]

const categories = [
	{id: 10, name: 'Овочі'},
	{id: 20, name: "М'ясо"},
	{id: 30, name: 'Молочні'},
	{id: 40, name: 'Напої'}
]

test('current-month purchase aggregation uses item totals and count', () => {
	const summary = calculateCurrentMonthPurchaseSummary({
		now,
		products,
		categories,
		purchases: [
			{id: 'a', purchasedAt: '2026-09-10T12:00:00', syncStatus: 'synced', items: [
				{productId: 1, total: 780},
				{productId: 2, total: 640}
			]},
			{id: 'b', purchasedAt: '2026-09-29T12:00:00', syncStatus: 'pending_create', items: [
				{productId: 3, total: 430}
			]}
		]
	})

	assert.equal(summary.period.label, 'September')
	assert.equal(summary.total, 1850)
	assert.equal(summary.purchaseCount, 2)
})

test('top 3 product categories are sorted by spending amount', () => {
	const summary = calculateCurrentMonthPurchaseSummary({
		now,
		products,
		categories,
		purchases: [{
			id: 'a',
			purchasedAt: '2026-09-10T12:00:00',
			syncStatus: 'synced',
			items: [
				{productId: 4, total: 120},
				{productId: 3, total: 430},
				{productId: 2, total: 640},
				{productId: 1, total: 780}
			]
		}]
	})

	assert.deepEqual(summary.topCategories.map(category => category.name), ['Овочі', "М'ясо", 'Молочні'])
	assert.deepEqual(summary.topCategories.map(category => category.total), [780, 640, 430])
})

test('purchases outside current month and future local time are excluded', () => {
	const summary = calculateCurrentMonthPurchaseSummary({
		now,
		products,
		categories,
		purchases: [
			{id: 'old', purchasedAt: '2026-08-31T23:59:59', syncStatus: 'synced', items: [{productId: 1, total: 100}]},
			{id: 'future', purchasedAt: '2026-09-30T12:00:00', syncStatus: 'synced', items: [{productId: 1, total: 200}]},
			{id: 'current', purchasedAt: '2026-09-01T00:00:00', syncStatus: 'synced', items: [{productId: 1, total: 300}]}
		]
	})

	assert.equal(summary.total, 300)
	assert.equal(summary.purchaseCount, 1)
})

test('empty current month state has no fake categories', () => {
	const summary = calculateCurrentMonthPurchaseSummary({
		now,
		products,
		categories,
		purchases: [{id: 'old', purchasedAt: '2026-08-15T12:00:00', syncStatus: 'synced', items: [{productId: 1, total: 100}]}]
	})

	assert.equal(summary.total, 0)
	assert.equal(summary.purchaseCount, 0)
	assert.deepEqual(summary.topCategories, [])
})

test('pending local purchase is counted once and server reconciliation does not duplicate totals', () => {
	const local = {
		id: 'local-purchase-1',
		localId: 'local-purchase-1',
		serverId: 42,
		clientMutationId: 'local-purchase-1',
		purchasedAt: '2026-09-12T12:00:00',
		syncStatus: 'synced',
		items: [{productId: 1, total: 254.58}]
	}
	const summary = calculateCurrentMonthPurchaseSummary({
		now,
		products,
		categories,
		purchases: [local]
	})

	assert.equal(summary.total, 254.58)
	assert.equal(summary.purchaseCount, 1)
})

test('pending_delete purchase is excluded from active sidebar statistics', () => {
	const summary = calculateCurrentMonthPurchaseSummary({
		now,
		products,
		categories,
		purchases: [
			{id: 'deleted', purchasedAt: '2026-09-12T12:00:00', syncStatus: 'pending_delete', items: [{productId: 1, total: 500}]},
			{id: 'active', purchasedAt: '2026-09-12T12:00:00', syncStatus: 'pending_update', items: [{productId: 2, total: 100}]}
		]
	})

	assert.equal(summary.total, 100)
	assert.equal(summary.purchaseCount, 1)
})

test('total and count do not depend on category lookup for every item', () => {
	const summary = calculateCurrentMonthPurchaseSummary({
		now,
		products: products.slice(0, 1),
		categories: categories.slice(0, 1),
		purchases: [{
			id: 'mixed',
			purchasedAt: '2026-09-12T12:00:00',
			syncStatus: 'synced',
			items: [
				{productId: 1, total: 100},
				{productId: 'missing-product', total: 25}
			]
		}]
	})

	assert.equal(summary.total, 125)
	assert.equal(summary.purchaseCount, 1)
	assert.deepEqual(summary.topCategories.map(category => category.name), ['Овочі'])
	assert.deepEqual(summary.topCategories.map(category => category.total), [100])
})
