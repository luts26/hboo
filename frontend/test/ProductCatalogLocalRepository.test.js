import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import ProductCatalogLocalRepository from '../hbapp/services/ProductCatalogLocalRepository.js'
import {normalizeQuantity} from '../hbapp/services/ProductUnitService.js'

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
		this.stores.get(storeName).set(key, value)
		return key
	}

	async delete(storeName, key) {
		this.stores.get(storeName).delete(key)
		return undefined
	}

	async transaction(storeNames, mode, callback) {
		return callback({
			getAll: storeName => this.getAll(storeName),
			put: (storeName, value) => this.put(storeName, value),
			delete: (storeName, key) => this.delete(storeName, key)
		})
	}
}

const makeRepository = () => new ProductCatalogLocalRepository({indexedDbClient: new FakeIndexedDbClient()})

test('product autocomplete searches locally and ignores disabled products by default', async () => {
	const repository = makeRepository()
	await repository.saveProducts([
		{id: 1, categoryId: 10, categoryName: 'Овочі', name: 'Помідори', measurementType: 'weight', status: 'active'},
		{id: 2, categoryId: 10, categoryName: 'Овочі', name: 'Помело', measurementType: 'weight', status: 'disabled'}
	])

	assert.deepEqual((await repository.searchProducts('пом')).map(product => product.name), ['Помідори'])
	assert.deepEqual((await repository.searchProducts('пом', {includeDisabled: true})).map(product => product.name), ['Помело', 'Помідори'].sort((a, b) => a.localeCompare(b, 'uk')))
})

test('created local product is immediately searchable for purchase flow', async () => {
	const repository = makeRepository()
	const product = await repository.createLocalProduct({
		categoryId: 20,
		categoryName: 'Фрукти',
		name: 'Помело',
		measurementType: 'weight'
	})

	const found = await repository.searchProducts('поме')
	assert.equal(found[0].id, product.id)
	assert.equal(found[0].syncStatus, 'pending_create')
	assert.deepEqual(found[0].allowedUnits, ['g', 'kg'])
})

test('server GET merge preserves pending_create purchase and is idempotent across hydration', async () => {
	const repository = makeRepository()
	await repository.mergeServerPurchases([
		{id: 1, merchantId: 5, merchantName: 'Novus', purchasedAt: '2026-09-28T12:00:00', paymentType: 'bank', total: 100, items: []}
	])
	const offline = await repository.savePurchase({
		merchantId: 7,
		merchantName: 'ATB',
		purchasedAt: '2026-09-28T12:00:00',
		paymentType: 'bank',
		total: 254.58,
		items: [{
			productId: 10,
			productName: 'Вода Моршинська',
			categoryId: 1,
			categoryName: 'Напої',
			measurementType: 'volume',
			quantity: 6,
			unit: 'l',
			total: 86.6
		}]
	}, {syncStatus: 'pending_create'})

	await repository.mergeServerPurchases([
		{id: 1, merchantId: 5, merchantName: 'Novus', purchasedAt: '2026-09-28T12:00:00', paymentType: 'bank', total: 100, items: []}
	])
	await repository.mergeServerPurchases([
		{id: 1, merchantId: 5, merchantName: 'Novus', purchasedAt: '2026-09-28T12:00:00', paymentType: 'bank', total: 100, items: []}
	])

	const purchases = await repository.getPurchases()
	assert.equal(purchases.length, 2)
	assert.equal(purchases.filter(purchase => purchase.merchantName === 'Novus').length, 1)
	assert.equal(purchases.filter(purchase => purchase.merchantName === 'ATB').length, 1)
	assert.equal(purchases.find(purchase => purchase.merchantName === 'ATB').id, offline.id)
	assert.equal(purchases.find(purchase => purchase.merchantName === 'ATB').syncStatus, 'pending_create')
})

test('localId survives serverId assignment and later server GET does not duplicate', async () => {
	const repository = makeRepository()
	const local = await repository.savePurchase({
		merchantName: 'ATB',
		purchasedAt: '2026-09-28T12:00:00',
		paymentType: 'bank',
		total: 254.58,
		items: []
	}, {syncStatus: 'pending_create'})

	const synced = await repository.markPurchaseSynced(local.id, {
		id: 42,
		clientMutationId: local.clientMutationId,
		merchantName: 'ATB',
		purchasedAt: '2026-09-28T12:00:00',
		paymentType: 'bank',
		total: 254.58,
		items: []
	})
	await repository.mergeServerPurchases([{id: 42, merchantName: 'ATB', purchasedAt: '2026-09-28T12:00:00', paymentType: 'bank', total: 254.58, items: []}])

	const purchases = await repository.getPurchases()
	assert.equal(purchases.length, 1)
	assert.equal(purchases[0].id, local.id)
	assert.equal(purchases[0].localId, local.id)
	assert.equal(purchases[0].serverId, 42)
	assert.equal(synced.id, local.id)
})

test('server purchase list refresh preserves locally cached item details', async () => {
	const repository = makeRepository()
	await repository.mergeServerPurchases([{
		id: 42,
		merchantName: 'ATB',
		purchasedAt: '2026-09-12T12:00:00',
		paymentType: 'bank',
		total: 316.55,
		items: [{
			productId: 1,
			productName: 'Молоко',
			categoryId: 30,
			categoryName: 'Молочні',
			measurementType: 'volume',
			quantity: 2,
			unit: 'l',
			total: 180
		}]
	}])

	await repository.mergeServerPurchases([{
		id: 42,
		merchantName: 'ATB',
		purchasedAt: '2026-09-12T12:00:00',
		paymentType: 'bank',
		total: 316.55,
		items: []
	}])

	const purchases = await repository.getPurchases()
	assert.equal(purchases.length, 1)
	assert.equal(purchases[0].items.length, 1)
	assert.equal(purchases[0].items[0].total, 180)
})

test('saved purchase is readable offline and keeps item valid after product is disabled', async () => {
	const repository = makeRepository()
	await repository.saveProducts([
		{id: 1, categoryId: 10, categoryName: 'Овочі', name: 'Помідори', measurementType: 'weight', status: 'disabled'}
	])
	const purchase = await repository.savePurchase({
		purchasedAt: '2026-09-28T12:00:00',
		paymentType: 'cash',
		total: 76.42,
		items: [{
			productId: 1,
			productName: 'Помідори',
			categoryId: 10,
			categoryName: 'Овочі',
			measurementType: 'weight',
			productStatus: 'disabled',
			quantity: 0.85,
			unit: 'kg',
			total: 76.42
		}]
	}, {syncStatus: 'pending'})

	const restored = await repository.getPurchase(purchase.id)
	assert.equal(restored.paymentType, 'cash')
	assert.equal(restored.items[0].productName, 'Помідори')
	assert.equal(restored.items[0].unit, 'kg')
	assert.equal(restored.items[0].total, 76.42)
})

test('purchase range query includes pending_create/update and excludes pending_delete', async () => {
	const repository = makeRepository()
	const range = {
		dateFrom: new Date(2026, 8, 1, 0, 0, 0, 0).getTime(),
		dateTo: new Date(2026, 8, 30, 23, 59, 59, 999).getTime()
	}
	await repository.savePurchase({userId: 7, purchasedAt: '2026-09-05T12:00:00', paymentType: 'cash', total: 10, items: []}, {syncStatus: 'pending_create', userId: 7})
	await repository.savePurchase({userId: 7, purchasedAt: '2026-09-06T12:00:00', paymentType: 'cash', total: 20, items: []}, {syncStatus: 'pending_update', userId: 7})
	await repository.savePurchase({userId: 7, purchasedAt: '2026-09-07T12:00:00', paymentType: 'cash', total: 30, items: []}, {syncStatus: 'pending_delete', userId: 7})
	await repository.savePurchase({userId: 8, purchasedAt: '2026-09-08T12:00:00', paymentType: 'cash', total: 40, items: []}, {syncStatus: 'synced', userId: 8})

	const purchases = await repository.getPurchasesByRange(7, range.dateFrom, range.dateTo)

	assert.deepEqual(purchases.map(purchase => purchase.total).sort((a, b) => a - b), [10, 20])
})

test('hydrated purchase range returns saved purchases newest first', async () => {
	const repository = makeRepository()
	const range = {
		dateFrom: new Date(2026, 8, 1, 0, 0, 0, 0).getTime(),
		dateTo: new Date(2026, 8, 30, 23, 59, 59, 999).getTime()
	}
	await repository.mergeServerPurchases([
		{id: 1, userId: 7, merchantName: 'Novus', purchasedAt: '2026-09-27T12:00:00', paymentType: 'cash', total: 27, items: []},
		{id: 2, userId: 7, merchantName: 'АТБ', purchasedAt: '2026-09-29T12:00:00', paymentType: 'cash', total: 29, items: []},
		{id: 3, userId: 7, merchantName: 'Бульварчик', purchasedAt: '2026-09-24T12:00:00', paymentType: 'cash', total: 24, items: []}
	], {userId: 7, range, markComplete: true})

	const purchases = await repository.getPurchasesByRange(7, range.dateFrom, range.dateTo)

	assert.deepEqual(purchases.map(purchase => purchase.merchantName), ['АТБ', 'Novus', 'Бульварчик'])
})

test('offline cached purchase range keeps newest-first ordering after reload', async () => {
	const indexedDbClient = new FakeIndexedDbClient()
	const repository = new ProductCatalogLocalRepository({indexedDbClient})
	const range = {
		dateFrom: new Date(2026, 8, 1, 0, 0, 0, 0).getTime(),
		dateTo: new Date(2026, 8, 30, 23, 59, 59, 999).getTime()
	}
	await repository.mergeServerPurchases([
		{id: 1, userId: 7, merchantName: 'Аврора', purchasedAt: '2026-09-18T12:00:00', paymentType: 'cash', total: 18, items: []},
		{id: 2, userId: 7, merchantName: 'АТБ', purchasedAt: '2026-09-29T12:00:00', paymentType: 'cash', total: 29, items: []},
		{id: 3, userId: 7, merchantName: 'Novus', purchasedAt: '2026-09-27T12:00:00', paymentType: 'cash', total: 27, items: []}
	], {userId: 7, range, markComplete: true})

	const restoredRepository = new ProductCatalogLocalRepository({indexedDbClient})
	const purchases = await restoredRepository.getPurchasesByRange(7, range.dateFrom, range.dateTo)

	assert.deepEqual(purchases.map(purchase => purchase.merchantName), ['АТБ', 'Novus', 'Аврора'])
})

test('offline newly created latest purchase appears at the top and stays single after sync', async () => {
	const repository = makeRepository()
	const range = {
		dateFrom: new Date(2026, 8, 1, 0, 0, 0, 0).getTime(),
		dateTo: new Date(2026, 8, 30, 23, 59, 59, 999).getTime()
	}
	await repository.mergeServerPurchases([
		{id: 1, userId: 7, merchantName: 'Novus', purchasedAt: '2026-09-27T12:00:00', paymentType: 'cash', total: 27, items: []}
	], {userId: 7, range, markComplete: true})
	const local = await repository.savePurchase({
		userId: 7,
		merchantName: 'АТБ',
		purchasedAt: '2026-09-29T18:30:00',
		paymentType: 'cash',
		total: 29,
		items: []
	}, {syncStatus: 'pending_create', userId: 7})

	let purchases = await repository.getPurchasesByRange(7, range.dateFrom, range.dateTo)
	assert.deepEqual(purchases.map(purchase => purchase.merchantName), ['АТБ', 'Novus'])

	await repository.markPurchaseSynced(local.id, {
		id: 900,
		clientMutationId: local.clientMutationId,
		userId: 7,
		merchantName: 'АТБ',
		purchasedAt: '2026-09-29T18:30:00',
		paymentType: 'cash',
		total: 29,
		items: []
	})
	await repository.mergeServerPurchases([
		{id: 900, userId: 7, clientMutationId: local.clientMutationId, merchantName: 'АТБ', purchasedAt: '2026-09-29T18:30:00', paymentType: 'cash', total: 29, items: []}
	], {userId: 7, range, markComplete: true})

	purchases = await repository.getPurchasesByRange(7, range.dateFrom, range.dateTo)
	assert.deepEqual(purchases.map(purchase => purchase.merchantName), ['АТБ', 'Novus'])
	assert.equal(purchases.filter(purchase => purchase.merchantName === 'АТБ').length, 1)
})

test('equal purchasedAt ordering uses deterministic secondary key', async () => {
	const repository = makeRepository()
	const range = {
		dateFrom: new Date(2026, 8, 1, 0, 0, 0, 0).getTime(),
		dateTo: new Date(2026, 8, 30, 23, 59, 59, 999).getTime()
	}
	await repository.mergeServerPurchases([
		{id: 9001, userId: 7, merchantName: 'First deterministic', purchasedAt: '2026-09-29T12:00:00', paymentType: 'cash', total: 1, items: []},
		{id: 9002, userId: 7, merchantName: 'Second deterministic', purchasedAt: '2026-09-29T12:00:00', paymentType: 'cash', total: 2, items: []}
	], {userId: 7, range, markComplete: true})

	const firstRead = await repository.getPurchasesByRange(7, range.dateFrom, range.dateTo)
	const secondRead = await repository.getPurchasesByRange(7, range.dateFrom, range.dateTo)

	assert.deepEqual(firstRead.map(purchase => purchase.merchantName), ['Second deterministic', 'First deterministic'])
	assert.deepEqual(secondRead.map(purchase => purchase.id), firstRead.map(purchase => purchase.id))
})

test('purchase coverage is user scoped and empty complete range is valid coverage', async () => {
	const repository = makeRepository()
	const range = {
		dateFrom: new Date(2026, 6, 1, 0, 0, 0, 0).getTime(),
		dateTo: new Date(2026, 6, 31, 23, 59, 59, 999).getTime()
	}
	await repository.mergeServerPurchases([], {userId: 7, range, markComplete: true, monthKey: '2026-07'})

	const userSeven = await repository.getPurchaseCoverage(7, range.dateFrom, range.dateTo)
	const userEight = await repository.getPurchaseCoverage(8, range.dateFrom, range.dateTo)

	assert.equal(userSeven.complete, true)
	assert.equal(userSeven.status, 'complete')
	assert.equal(userEight.complete, false)
	assert.equal(userEight.status, 'not_fetched')
})

test('current month coverage remains available when requested dateTo advances', async () => {
	const repository = makeRepository()
	const now = new Date()
	const hydratedTo = new Date(now.getTime() - 5 * 60 * 1000)
	const range = {
		dateFrom: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime(),
		dateTo: hydratedTo.getTime()
	}
	await repository.mergeServerPurchases([], {
		userId: 7,
		range,
		markComplete: true,
		monthKey: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
	})

	const coverage = await repository.getPurchaseCoverage(7, range.dateFrom, now.getTime())

	assert.equal(coverage.complete, false)
	assert.equal(coverage.available, true)
	assert.equal(coverage.stale, true)
	assert.equal(coverage.status, 'stale_current_month')
})

test('three month coverage is complete when adjacent monthly windows are covered', async () => {
	const repository = makeRepository()
	const now = new Date(2026, 8, 29, 15, 30, 0, 0)
	const ranges = [
		{dateFrom: new Date(2026, 6, 1, 0, 0, 0, 0).getTime(), dateTo: new Date(2026, 6, 31, 23, 59, 59, 999).getTime(), monthKey: '2026-07'},
		{dateFrom: new Date(2026, 7, 1, 0, 0, 0, 0).getTime(), dateTo: new Date(2026, 7, 31, 23, 59, 59, 999).getTime(), monthKey: '2026-08'},
		{dateFrom: new Date(2026, 8, 1, 0, 0, 0, 0).getTime(), dateTo: now.getTime(), monthKey: '2026-09'}
	]
	for (const range of ranges) {
		await repository.mergeServerPurchases([], {userId: 7, range, markComplete: true, monthKey: range.monthKey})
	}

	const coverage = await repository.getPurchaseCoverage(7, ranges[0].dateFrom, now.getTime())

	assert.equal(coverage.complete, true)
	assert.equal(coverage.available, true)
	assert.equal(coverage.status, 'complete')
})

test('three month coverage remains available when only current month tail is stale', async () => {
	const repository = makeRepository()
	const now = new Date()
	const hydratedTo = new Date(now.getTime() - 5 * 60 * 1000)
	const first = new Date(now.getFullYear(), now.getMonth() - 2, 1, 0, 0, 0, 0)
	const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1, 12, 0, 0, 0)
	const ranges = [
		{dateFrom: first.getTime(), dateTo: new Date(first.getFullYear(), first.getMonth() + 1, 0, 23, 59, 59, 999).getTime(), monthKey: `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}`},
		{dateFrom: new Date(previousMonth.getFullYear(), previousMonth.getMonth(), 1, 0, 0, 0, 0).getTime(), dateTo: new Date(previousMonth.getFullYear(), previousMonth.getMonth() + 1, 0, 23, 59, 59, 999).getTime(), monthKey: `${previousMonth.getFullYear()}-${String(previousMonth.getMonth() + 1).padStart(2, '0')}`},
		{dateFrom: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime(), dateTo: hydratedTo.getTime(), monthKey: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`}
	]
	for (const range of ranges) {
		await repository.mergeServerPurchases([], {userId: 7, range, markComplete: true, monthKey: range.monthKey})
	}

	const coverage = await repository.getPurchaseCoverage(7, first.getTime(), now.getTime())

	assert.equal(coverage.complete, false)
	assert.equal(coverage.available, true)
	assert.equal(coverage.stale, true)
	assert.equal(coverage.status, 'stale_current_month')
})

test('purchase cache cleanup keeps guaranteed months, optional recent months, and pending old purchases', async () => {
	const indexedDbClient = new FakeIndexedDbClient()
	const repository = new ProductCatalogLocalRepository({indexedDbClient})
	const makeMonthRange = (monthIndex, now = new Date(2026, 9, 1, 10, 0, 0, 0)) => ({
		dateFrom: new Date(2026, monthIndex, 1, 0, 0, 0, 0).getTime(),
		dateTo: new Date(2026, monthIndex + 1, 0, 23, 59, 59, 999).getTime(),
		now
	})
	for (const monthIndex of [3, 4, 5, 6, 7, 8, 9]) {
		const range = makeMonthRange(monthIndex)
		await repository.mergeServerPurchases([{
			id: 100 + monthIndex,
			userId: 7,
			purchasedAt: new Date(2026, monthIndex, 10, 12, 0, 0, 0).toISOString(),
			paymentType: 'cash',
			total: monthIndex,
			items: []
		}], {userId: 7, range, markComplete: true, monthKey: `2026-${String(monthIndex + 1).padStart(2, '0')}`})
	}
	await repository.savePurchase({
		userId: 7,
		purchasedAt: '2026-01-15T12:00:00',
		paymentType: 'cash',
		total: 777,
		items: []
	}, {syncStatus: 'pending_create', userId: 7})

	const cleanup = await repository.cleanupPurchaseCache({userId: 7, now: new Date(2026, 9, 1, 10, 0, 0, 0), optionalMonthLimit: 3})
	const purchases = await repository.getPurchases()
	const totals = purchases.map(purchase => purchase.total)

	assert.ok(cleanup.removed >= 1)
	assert.ok(totals.includes(7))
	assert.ok(totals.includes(8))
	assert.ok(totals.includes(9))
	assert.ok(totals.includes(777))
	assert.ok([3, 4, 5, 6].some(total => !totals.includes(total)))
})

test('guaranteed purchase window follows calendar month transition', async () => {
	const {getGuaranteedPurchaseMonthRanges} = await import('../hbapp/services/PurchaseDateRange.js')
	const before = getGuaranteedPurchaseMonthRanges(new Date(2026, 8, 29, 12, 0, 0, 0)).map(range => range.monthKey)
	const after = getGuaranteedPurchaseMonthRanges(new Date(2026, 9, 1, 0, 0, 0, 0)).map(range => range.monthKey)

	assert.deepEqual(before, ['2026-07', '2026-08', '2026-09'])
	assert.deepEqual(after, ['2026-08', '2026-09', '2026-10'])
})

test('unit normalization supports kg/g, l/ml, and pcs', () => {
	assert.deepEqual(normalizeQuantity(1.24, 'kg'), {quantity: 1240, unit: 'g'})
	assert.deepEqual(normalizeQuantity(450, 'g'), {quantity: 450, unit: 'g'})
	assert.deepEqual(normalizeQuantity(0.85, 'l'), {quantity: 850, unit: 'ml'})
	assert.deepEqual(normalizeQuantity(10, 'pcs'), {quantity: 10, unit: 'pcs'})
})

test('existing financial pages do not import purchase layer', () => {
	const files = [
		'frontend/hbapp/pages/HomePage.js',
		'frontend/hbapp/pages/BalancePage.js',
		'frontend/hbapp/pages/TransactionPage.js',
		'frontend/hbapp/pages/PlaningPage.js'
	]
	files.forEach(file => {
		const source = fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')
		assert.doesNotMatch(source, /ProductCatalog|PurchasePage|purchases|purchase_item/)
	})
})
