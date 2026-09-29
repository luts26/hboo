import test from 'node:test'
import assert from 'node:assert/strict'

import api from '../hbapp/mixins/apiQueriesHelper.js'
import ProductCatalogApiService, {getDefaultPurchaseRange} from '../hbapp/services/ProductCatalogApiService.js'
import ProductCatalogLocalRepository from '../hbapp/services/ProductCatalogLocalRepository.js'
import {calculateCurrentMonthPurchaseSummary} from '../hbapp/services/PurchaseSummaryService.js'
import networkStatusService from '../hbapp/services/NetworkStatusService.js'

class FakeLocalRepository {
	constructor() {
		this.purchases = []
		this.coverage = {complete: false, status: 'not_fetched', windows: []}
	}

	async getPurchaseCoverage() {
		return this.coverage
	}

	async getPurchasesByRange() {
		return this.purchases
	}

	async touchPurchaseCoverage() {
		return this.coverage
	}

	async cleanupPurchaseCache() {
		return {removed: 0}
	}

	async getPurchases() {
		return this.purchases
	}

	async mergeServerPurchases(purchases, options = {}) {
		this.purchases = purchases
		if (options.markComplete) this.coverage = {complete: true, status: 'complete', windows: [{...options.range, complete: true, fetchedAt: Date.now()}]}
		return this.purchases
	}
}

class FakeIndexedDbClient {
	constructor() {
		this.stores = new Map([
			['productCategories', new Map()],
			['products', new Map()],
			['merchants', new Map()],
			['purchases', new Map()],
			['purchaseWindows', new Map()],
			['syncQueue', new Map()]
		])
	}

	async getAll(storeName) {
		return Array.from(this.stores.get(storeName).values())
	}

	async get(storeName, key) {
		return this.stores.get(storeName).get(key)
	}

	async put(storeName, value) {
		const key = value.id ?? value.windowKey ?? value.operationId
		this.stores.get(storeName).set(key, JSON.parse(JSON.stringify(value)))
		return key
	}

	async delete(storeName, key) {
		this.stores.get(storeName).delete(key)
	}

	async transaction(storeNames, mode, callback) {
		return callback({
			getAll: storeName => this.getAll(storeName),
			put: (storeName, value) => this.put(storeName, value),
			delete: (storeName, key) => this.delete(storeName, key)
		})
	}
}

test('loadPurchases requests bounded date range with timestamp query params', async () => {
	const originalGet = api.get
	const calls = []
	api.get = async path => {
		calls.push(path)
		return []
	}

	try {
		const service = new ProductCatalogApiService(new FakeLocalRepository(), {enqueueMutation: async () => {}})
		await service.loadPurchases({
			refresh: true,
			range: {
				dateFrom: 1790000000000,
				dateTo: 1790050000000
			}
		})

		assert.equal(calls.length, 1)
		const [path, query = ''] = calls[0].split('?')
		const params = new URLSearchParams(query)
		assert.equal(path, '/purchases')
		assert.equal(Number(params.get('date_from')), 1790000000000)
		assert.equal(Number(params.get('date_to')), 1790050000000)
	} finally {
		api.get = originalGet
	}
})

test('default purchase range is current local calendar month to now', () => {
	const now = new Date(2026, 8, 29, 15, 30, 0, 0)
	const range = getDefaultPurchaseRange(now)

	assert.equal(range.dateFrom, new Date(2026, 8, 1, 0, 0, 0, 0).getTime())
	assert.equal(range.dateTo, now.getTime())
})

test('clean local hydration stores complete server purchases and feeds sidebar projection', async () => {
	const originalGet = api.get
	api.get = async () => ([
		{id: 1, merchantName: 'Novus', purchasedAt: '2026-09-29T12:00:00', paymentType: 'bank', total: 180, items: [
			{id: 11, purchaseId: 1, productId: 101, productName: 'Молоко', categoryId: 30, categoryName: 'Молочні', measurementType: 'volume', productStatus: 'active', quantity: 2, unit: 'l', total: 180}
		]},
		{id: 2, merchantName: 'АТБ', purchasedAt: '2026-09-28T12:00:00', paymentType: 'bank', total: 48.56, items: [
			{id: 12, purchaseId: 2, productId: 102, productName: 'Рис', categoryId: 60, categoryName: 'Крупи та макарони', measurementType: 'weight', productStatus: 'active', quantity: 1, unit: 'kg', total: 48.56}
		]}
	])

	try {
		const repository = new ProductCatalogLocalRepository({indexedDbClient: new FakeIndexedDbClient()})
		const service = new ProductCatalogApiService(repository, {enqueueMutation: async () => {}})
		await service.loadPurchases({
			refresh: true,
			range: {
				dateFrom: new Date(2026, 8, 1, 0, 0, 0, 0).getTime(),
				dateTo: new Date(2026, 8, 29, 15, 30, 0, 0).getTime()
			}
		})

		const purchases = await repository.getPurchases()
		const summary = calculateCurrentMonthPurchaseSummary({
			now: new Date(2026, 8, 29, 15, 30, 0, 0),
			purchases,
			products: [],
			categories: []
		})

		assert.equal(purchases.length, 2)
		assert.equal(purchases[0].items.length, 1)
		assert.equal(purchases[1].items.length, 1)
		assert.equal(summary.purchaseCount, 2)
		assert.equal(summary.total, 228.56)
		assert.deepEqual(summary.topCategories.map(category => category.name), ['Молочні', 'Крупи та макарони'])
	} finally {
		api.get = originalGet
	}
})

test('covered empty purchase range is complete and returns zero purchases offline', async () => {
	const originalOffline = networkStatusStub(true)
	const repository = new ProductCatalogLocalRepository({indexedDbClient: new FakeIndexedDbClient()})
	await repository.mergeServerPurchases([], {
		userId: 7,
		range: {
			dateFrom: new Date(2026, 6, 1, 0, 0, 0, 0).getTime(),
			dateTo: new Date(2026, 6, 31, 23, 59, 59, 999).getTime()
		},
		markComplete: true,
		monthKey: '2026-07'
	})
	const service = new ProductCatalogApiService(repository, {enqueueMutation: async () => {}})
	service.getUserId = () => 7

	try {
		const result = await service.loadPurchasesByRange({
			refresh: true,
			range: {
				dateFrom: new Date(2026, 6, 1, 0, 0, 0, 0).getTime(),
				dateTo: new Date(2026, 6, 31, 23, 59, 59, 999).getTime()
			}
		})

		assert.equal(result.unavailableOffline, false)
		assert.equal(result.coverage.complete, true)
		assert.deepEqual(result.purchases, [])
	} finally {
		originalOffline()
	}
})

test('uncovered historical purchase range reports unavailable while offline', async () => {
	const restoreOffline = networkStatusStub(true)
	const service = new ProductCatalogApiService(new FakeLocalRepository(), {enqueueMutation: async () => {}})

	try {
		const result = await service.loadPurchasesByRange({
			refresh: true,
			range: {
				dateFrom: new Date(2026, 4, 1, 0, 0, 0, 0).getTime(),
				dateTo: new Date(2026, 4, 31, 23, 59, 59, 999).getTime()
			}
		})

		assert.equal(result.unavailableOffline, true)
		assert.deepEqual(result.purchases, [])
		assert.equal(result.coverage.complete, false)
	} finally {
		restoreOffline()
	}
})

test('offline purchase range returns local records even when coverage is unknown', async () => {
	const restoreOffline = networkStatusStub(true)
	const repository = new FakeLocalRepository()
	repository.purchases = [{id: 'local-purchase-1', purchasedAt: '2026-09-10T12:00:00', total: 100, items: []}]
	const service = new ProductCatalogApiService(repository, {enqueueMutation: async () => {}})

	try {
		const result = await service.loadPurchasesByRange({
			refresh: true,
			range: {
				dateFrom: new Date(2026, 8, 1, 0, 0, 0, 0).getTime(),
				dateTo: new Date(2026, 8, 29, 17, 35, 0, 0).getTime()
			}
		})

		assert.equal(result.unavailableOffline, false)
		assert.equal(result.purchases.length, 1)
		assert.equal(result.source, 'cache')
	} finally {
		restoreOffline()
	}
})

test('offline current month remains available when now advances after hydration', async () => {
	const restoreOffline = networkStatusStub(true)
	const repository = new FakeLocalRepository()
	const now = new Date()
	const hydratedTo = new Date(now.getTime() - 5 * 60 * 1000)
	const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime()
	repository.coverage = {
		complete: false,
		available: true,
		stale: true,
		status: 'stale_current_month',
		windows: [{
			dateFrom: monthStart,
			dateTo: hydratedTo.getTime(),
			monthKey: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
			complete: true,
			fetchedAt: hydratedTo.getTime()
		}]
	}
	const service = new ProductCatalogApiService(repository, {enqueueMutation: async () => {}})

	try {
		const result = await service.loadPurchasesByRange({
			refresh: true,
			range: {
				dateFrom: monthStart,
				dateTo: now.getTime()
			}
		})

		assert.equal(result.unavailableOffline, false)
		assert.deepEqual(result.purchases, [])
		assert.equal(result.coverage.status, 'stale_current_month')
	} finally {
		restoreOffline()
	}
})

test('missing purchase range hydrates online then becomes locally available for analytics', async () => {
	const originalGet = api.get
	const calls = []
	api.get = async path => {
		calls.push(path)
		return [{
			id: 77,
			purchasedAt: '2026-08-10T12:00:00',
			paymentType: 'cash',
			total: 42,
			items: [{productId: 1, productName: 'Молоко', categoryId: 2, categoryName: 'Молочні', quantity: 1, unit: 'l', total: 42}]
		}]
	}
	const repository = new ProductCatalogLocalRepository({indexedDbClient: new FakeIndexedDbClient()})
	const service = new ProductCatalogApiService(repository, {enqueueMutation: async () => {}})
	service.getUserId = () => 7
	const range = {
		dateFrom: new Date(2026, 7, 1, 0, 0, 0, 0).getTime(),
		dateTo: new Date(2026, 7, 31, 23, 59, 59, 999).getTime()
	}

	try {
		const result = await service.loadPurchasesByRange({refresh: true, range})
		const coverage = await repository.getPurchaseCoverage(7, range.dateFrom, range.dateTo)

		assert.equal(calls.length, 1)
		assert.equal(result.source, 'api')
		assert.equal(result.purchases.length, 1)
		assert.equal(coverage.complete, true)
	} finally {
		api.get = originalGet
	}
})

test('covered three month purchase range works offline from local monthly windows', async () => {
	const restoreOffline = networkStatusStub(true)
	const repository = new ProductCatalogLocalRepository({indexedDbClient: new FakeIndexedDbClient()})
	const ranges = [
		{dateFrom: new Date(2026, 6, 1, 0, 0, 0, 0).getTime(), dateTo: new Date(2026, 6, 31, 23, 59, 59, 999).getTime(), monthKey: '2026-07'},
		{dateFrom: new Date(2026, 7, 1, 0, 0, 0, 0).getTime(), dateTo: new Date(2026, 7, 31, 23, 59, 59, 999).getTime(), monthKey: '2026-08'},
		{dateFrom: new Date(2026, 8, 1, 0, 0, 0, 0).getTime(), dateTo: new Date(2026, 8, 29, 15, 30, 0, 0).getTime(), monthKey: '2026-09'}
	]
	await repository.mergeServerPurchases([], {userId: 7, range: ranges[0], markComplete: true, monthKey: ranges[0].monthKey})
	await repository.mergeServerPurchases([{
		id: 88,
		purchasedAt: '2026-08-12T12:00:00',
		paymentType: 'cash',
		total: 55,
		items: [{productId: 1, quantity: 1, unit: 'pcs', total: 55}]
	}], {userId: 7, range: ranges[1], markComplete: true, monthKey: ranges[1].monthKey})
	await repository.mergeServerPurchases([], {userId: 7, range: ranges[2], markComplete: true, monthKey: ranges[2].monthKey})
	const service = new ProductCatalogApiService(repository, {enqueueMutation: async () => {}})
	service.getUserId = () => 7

	try {
		const result = await service.loadPurchasesByRange({
			refresh: true,
			range: {dateFrom: ranges[0].dateFrom, dateTo: ranges[2].dateTo}
		})

		assert.equal(result.unavailableOffline, false)
		assert.equal(result.coverage.complete, true)
		assert.equal(result.purchases.length, 1)
	} finally {
		restoreOffline()
	}
})

function networkStatusStub(value) {
	const original = networkStatusService.isOffline
	networkStatusService.isOffline = () => value
	return () => {
		networkStatusService.isOffline = original
	}
}
