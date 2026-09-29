import test from 'node:test'
import assert from 'node:assert/strict'

import ProductCatalogLocalRepository from '../hbapp/services/ProductCatalogLocalRepository.js'
import {calculateProductAnalytics} from '../hbapp/services/ProductAnalyticsService.js'
import {formatNormalizedQuantity} from '../hbapp/services/ProductUnitService.js'

const period = {
	dateFrom: new Date(2026, 8, 1, 0, 0, 0, 0).getTime(),
	dateTo: new Date(2026, 8, 30, 23, 59, 59, 999).getTime()
}

const categories = [
	{id: 10, name: 'Овочі'},
	{id: 20, name: 'Молочні'},
	{id: 30, name: 'Напої'}
]

const products = [
	{id: 101, name: 'Помідори', categoryId: 10, categoryName: 'Овочі', measurementType: 'weight'},
	{id: 102, name: 'Картопля', categoryId: 10, categoryName: 'Овочі', measurementType: 'weight'},
	{id: 201, name: 'Молоко', categoryId: 20, categoryName: 'Молочні', measurementType: 'volume'},
	{id: 301, name: 'Вода', categoryId: 30, categoryName: 'Напої', measurementType: 'count'}
]

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

const calculateFromRepository = async repository => calculateProductAnalytics({
	period,
	categories: await repository.getCategories({includeDisabled: true}),
	products: await repository.getProducts({includeDisabled: true}),
	purchases: await repository.getPurchasesByRange(7, period.dateFrom, period.dateTo)
})

test('category aggregation groups multiple products and sorts by spending', () => {
	const analytics = calculateProductAnalytics({
		period,
		categories,
		products,
		purchases: [{
			id: 1,
			purchasedAt: '2026-09-10T12:00:00',
			items: [
				{productId: 101, quantity: 500, unit: 'g', total: 70},
				{productId: 102, quantity: 1, unit: 'kg', total: 50},
				{productId: 201, quantity: 1, unit: 'l', total: 80}
			]
		}]
	})

	assert.deepEqual(analytics.categories.map(category => category.name), ['Овочі', 'Молочні'])
	assert.equal(analytics.categories[0].spent, 120)
	assert.equal(analytics.categories[0].itemsCount, 2)
	assert.equal(analytics.categories[0].percentage, 60)
})

test('product aggregation combines the same product across purchases and counts distinct products', () => {
	const analytics = calculateProductAnalytics({
		period,
		categories,
		products,
		purchases: [
			{id: 1, purchasedAt: '2026-09-10T12:00:00', items: [{productId: 101, quantity: 0.5, unit: 'kg', total: 50}]},
			{id: 2, purchasedAt: '2026-09-11T12:00:00', items: [{productId: 101, quantity: 1500, unit: 'g', total: 120}]},
			{id: 3, purchasedAt: '2026-09-12T12:00:00', items: [{productId: 201, quantity: 1, unit: 'l', total: 40}]}
		]
	})

	const tomatoes = analytics.products.find(product => product.name === 'Помідори')
	assert.equal(analytics.totals.spent, 210)
	assert.equal(analytics.totals.purchasesCount, 3)
	assert.equal(analytics.totals.itemsCount, 3)
	assert.equal(analytics.totals.distinctProducts, 2)
	assert.equal(tomatoes.spent, 170)
	assert.equal(tomatoes.normalizedQuantity, 2000)
	assert.equal(tomatoes.quantityLabel, '2 kg')
	assert.equal(tomatoes.purchaseCount, 2)
})

test('weight volume and count units normalize and format for analytics', () => {
	const analytics = calculateProductAnalytics({
		period,
		categories,
		products,
		purchases: [{
			id: 1,
			purchasedAt: '2026-09-10T12:00:00',
			items: [
				{productId: 101, quantity: 400, unit: 'g', total: 40.79},
				{productId: 101, quantity: 0.4, unit: 'kg', total: 41.21},
				{productId: 201, quantity: 500, unit: 'ml', total: 41.49},
				{productId: 201, quantity: 1.5, unit: 'l', total: 120},
				{productId: 301, quantity: 3, unit: 'pcs', total: 75}
			]
		}]
	})

	assert.equal(analytics.products.find(product => product.name === 'Помідори').quantityLabel, '800 g')
	assert.equal(analytics.products.find(product => product.name === 'Молоко').quantityLabel, '2 l')
	assert.equal(analytics.products.find(product => product.name === 'Вода').quantityLabel, '3 pcs')
	assert.equal(formatNormalizedQuantity(4800, 'g'), '4,8 kg')
	assert.equal(formatNormalizedQuantity(7300, 'ml'), '7,3 l')
})

test('average unit price is weighted by total spend and total normalized quantity', () => {
	const analytics = calculateProductAnalytics({
		period,
		categories,
		products,
		purchases: [
			{id: 1, purchasedAt: '2026-09-10T12:00:00', items: [{productId: 101, quantity: 0.5, unit: 'kg', total: 50}]},
			{id: 2, purchasedAt: '2026-09-11T12:00:00', items: [{productId: 101, quantity: 1.5, unit: 'kg', total: 120}]}
		]
	})

	const tomatoes = analytics.products[0]
	assert.equal(tomatoes.averageUnitPrice, 85)
	assert.equal(tomatoes.priceUnit, 'kg')
})

test('last price uses latest purchasedAt and deterministic purchase/item fallback', () => {
	const analytics = calculateProductAnalytics({
		period,
		categories,
		products,
		purchases: [
			{id: 'a', purchasedAt: '2026-09-10T12:00:00', items: [{id: '1', productId: 101, quantity: 1, unit: 'kg', total: 90}]},
			{id: 'b', purchasedAt: '2026-09-12T12:00:00', items: [{id: '1', productId: 101, quantity: 1, unit: 'kg', total: 95}]},
			{id: 'c', purchasedAt: '2026-09-12T12:00:00', items: [{id: '2', productId: 101, quantity: 1, unit: 'kg', total: 98.5}]}
		]
	})

	const tomatoes = analytics.products[0]
	assert.equal(tomatoes.lastUnitPrice, 98.5)
	assert.equal(tomatoes.lastPurchasedAt, '2026-09-12T12:00:00')
})

test('money aggregation rounds displayed totals and avoids floating point artifacts', () => {
	const analytics = calculateProductAnalytics({
		period,
		categories,
		products,
		purchases: [{
			id: 1,
			purchasedAt: '2026-09-10T12:00:00',
			items: [
				{productId: 101, quantity: 1, unit: 'kg', total: 0.1},
				{productId: 102, quantity: 1, unit: 'kg', total: 0.2}
			]
		}]
	})

	assert.equal(analytics.totals.spent, 0.3)
	assert.equal(analytics.categories.find(category => category.name === 'Овочі').spent, 0.3)
})

test('invalid legacy item data does not crash and unresolved category falls back to Інше', () => {
	const analytics = calculateProductAnalytics({
		period,
		categories,
		products,
		purchases: [{
			id: 1,
			purchasedAt: '2026-09-10T12:00:00',
			items: [
				{productId: null, productName: 'Legacy', quantity: 0, unit: 'kg', total: 25},
				{productId: 101, quantity: 1, unit: 'box', total: 30},
				{productId: 102, quantity: 1, unit: 'kg', total: null}
			]
		}, {
			id: 2,
			syncStatus: 'pending_delete',
			purchasedAt: '2026-09-10T12:00:00',
			items: [{productId: 101, quantity: 1, unit: 'kg', total: 999}]
		}]
	})

	const unknown = analytics.categories.find(category => category.name === 'Інше')
	const tomatoes = analytics.products.find(product => product.name === 'Помідори')
	assert.equal(analytics.totals.spent, 55)
	assert.equal(unknown.spent, 25)
	assert.equal(tomatoes.normalizedQuantity, null)
	assert.equal(tomatoes.averageUnitPrice, null)
})

test('local create sync reconciliation edit and delete recalculate without duplicate contribution', async () => {
	const repository = new ProductCatalogLocalRepository({indexedDbClient: new FakeIndexedDbClient()})
	await repository.saveCategories(categories)
	await repository.saveProducts(products)
	const local = await repository.savePurchase({
		userId: 7,
		purchasedAt: '2026-09-20T12:00:00',
		paymentType: 'cash',
		total: 40,
		items: [{productId: 101, productName: 'Помідори', quantity: 400, unit: 'g', total: 40}]
	}, {syncStatus: 'pending_create', userId: 7})

	let analytics = await calculateFromRepository(repository)
	assert.equal(analytics.totals.spent, 40)
	assert.equal(analytics.products[0].quantityLabel, '400 g')

	await repository.markPurchaseSynced(local.id, {
		id: 900,
		clientMutationId: local.clientMutationId,
		userId: 7,
		purchasedAt: '2026-09-20T12:00:00',
		paymentType: 'cash',
		total: 40,
		items: [{productId: 101, productName: 'Помідори', quantity: 400, unit: 'g', total: 40}]
	})
	analytics = await calculateFromRepository(repository)
	assert.equal(analytics.totals.spent, 40)
	assert.equal(analytics.totals.purchasesCount, 1)

	await repository.savePurchase({
		...local,
		serverId: 900,
		total: 70,
		items: [{productId: 101, productName: 'Помідори', quantity: 700, unit: 'g', total: 70}]
	}, {syncStatus: 'pending_update', userId: 7})
	analytics = await calculateFromRepository(repository)
	assert.equal(analytics.totals.spent, 70)
	assert.equal(analytics.products[0].quantityLabel, '700 g')

	await repository.savePurchase({...local, serverId: 900}, {syncStatus: 'pending_delete', userId: 7})
	analytics = await calculateFromRepository(repository)
	assert.equal(analytics.totals.spent, 0)
	assert.equal(analytics.totals.purchasesCount, 0)
})
