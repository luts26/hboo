import test from 'node:test'
import assert from 'node:assert/strict'

import ProductCatalogLocalRepository from '../hbapp/services/ProductCatalogLocalRepository.js'
import {buildProductDetail, calculateProductAnalytics} from '../hbapp/services/ProductAnalyticsService.js'
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

const merchants = [
	{id: 501, name: 'Novus'},
	{id: 502, name: 'АТБ'},
	{id: 503, name: 'Сільпо'}
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

test('product detail builds exact normalized price points for weight volume and count', () => {
	const weightFromGrams = buildProductDetail({
		productId: 101,
		period,
		categories,
		products,
		merchants,
		purchases: [{id: 1, merchantId: 501, purchasedAt: '2026-09-10T12:00:00', items: [
			{id: 'g', productId: 101, quantity: 400, unit: 'g', total: 40.79}
		]}]
	})
	const weightFromKg = buildProductDetail({
		productId: 101,
		period,
		categories,
		products,
		merchants,
		purchases: [{id: 2, merchantId: 501, purchasedAt: '2026-09-10T12:00:00', items: [
			{id: 'kg', productId: 101, quantity: 0.4, unit: 'kg', total: 40.79}
		]}]
	})
	const volume = buildProductDetail({
		productId: 201,
		period,
		categories,
		products,
		merchants,
		purchases: [{id: 3, merchantId: 501, purchasedAt: '2026-09-10T12:00:00', items: [
			{id: 'ml', productId: 201, quantity: 500, unit: 'ml', total: 41.49}
		]}]
	})
	const count = buildProductDetail({
		productId: 301,
		period,
		categories,
		products,
		merchants,
		purchases: [{id: 4, merchantId: 501, purchasedAt: '2026-09-10T12:00:00', items: [
			{id: 'pcs', productId: 301, quantity: 4, unit: 'pcs', total: 100}
		]}]
	})

	assert.equal(weightFromGrams.history[0].normalizedUnitPrice, 101.98)
	assert.equal(weightFromGrams.history[0].unitPriceLabel, '101,98 грн/kg')
	assert.equal(weightFromKg.history[0].normalizedUnitPrice, 101.98)
	assert.equal(volume.history[0].normalizedUnitPrice, 82.98)
	assert.equal(volume.history[0].unitPriceLabel, '82,98 грн/l')
	assert.equal(count.history[0].normalizedUnitPrice, 25)
	assert.equal(count.history[0].unitPriceLabel, '25,00 грн/pcs')
})

test('product detail average price is weighted by comparable spend and quantity', () => {
	const detail = buildProductDetail({
		productId: 101,
		period,
		categories,
		products,
		merchants,
		purchases: [
			{id: 'a', merchantId: 501, purchasedAt: '2026-09-02T12:00:00', items: [{id: 'a1', productId: 101, quantity: 0.5, unit: 'kg', total: 50}]},
			{id: 'b', merchantId: 502, purchasedAt: '2026-09-14T12:00:00', items: [{id: 'b1', productId: 101, quantity: 1.5, unit: 'kg', total: 120}]}
		]
	})

	assert.equal(detail.spent, 170)
	assert.equal(detail.normalizedQuantity, 2000)
	assert.equal(detail.displayQuantity, '2 kg')
	assert.equal(detail.averageUnitPrice, 85)
	assert.equal(detail.averageUnitPriceLabel, '85,00 грн/kg')
})

test('product detail last price uses latest purchasedAt regardless of insertion order', () => {
	const detail = buildProductDetail({
		productId: 201,
		period,
		categories,
		products,
		merchants,
		purchases: [
			{id: 'late', merchantId: 501, purchasedAt: '2026-09-29T12:00:00', items: [{id: 'late-item', productId: 201, quantity: 1, unit: 'l', total: 64}]},
			{id: 'early', merchantId: 502, purchasedAt: '2026-09-02T12:00:00', items: [{id: 'early-item', productId: 201, quantity: 1, unit: 'l', total: 60}]},
			{id: 'middle', merchantId: 503, purchasedAt: '2026-09-14T12:00:00', items: [{id: 'middle-item', productId: 201, quantity: 1, unit: 'l', total: 58}]}
		]
	})

	assert.equal(detail.lastUnitPrice, 64)
	assert.equal(detail.lastUnitPriceLabel, '64,00 грн/l')
	assert.deepEqual(detail.history.map(point => point.purchaseId), ['early', 'middle', 'late'])
})

test('product detail keeps canonical history chronological and recent purchases newest first', () => {
	const detail = buildProductDetail({
		productId: 201,
		period,
		categories,
		products,
		merchants,
		purchases: [
			{id: '14', merchantId: 501, purchasedAt: '2026-09-14T12:00:00', items: [{id: 'i14', productId: 201, quantity: 1, unit: 'l', total: 61.5}]},
			{id: '29', merchantId: 501, purchasedAt: '2026-09-29T12:00:00', items: [{id: 'i29', productId: 201, quantity: 1, unit: 'l', total: 64.9}]},
			{id: '06', merchantId: 501, purchasedAt: '2026-09-06T12:00:00', items: [{id: 'i06', productId: 201, quantity: 1, unit: 'l', total: 59.2}]},
			{id: '22', merchantId: 501, purchasedAt: '2026-09-22T12:00:00', items: [{id: 'i22', productId: 201, quantity: 1, unit: 'l', total: 58.9}]}
		]
	})

	assert.deepEqual(detail.history.map(point => point.purchaseId), ['06', '14', '22', '29'])
	assert.deepEqual(detail.recentPurchases.map(point => point.purchaseId), ['29', '22', '14', '06'])
})

test('product detail recent purchases sort newest first and resolve merchants', () => {
	const detail = buildProductDetail({
		productId: 201,
		period,
		categories,
		products,
		merchants,
		purchases: [
			{id: 'older', merchantId: 502, purchasedAt: '2026-09-22T12:00:00', items: [{id: 'b', productId: 201, quantity: 1, unit: 'l', total: 58.9}]},
			{id: 'newer', merchantId: 501, purchasedAt: '2026-09-29T12:00:00', items: [{id: 'a', productId: 201, quantity: 900, unit: 'ml', total: 58.41}]},
			{id: 'same-time', merchantName: 'Fallback shop', purchasedAt: '2026-09-29T12:00:00', items: [{id: 'c', productId: 201, quantity: 2, unit: 'l', total: 123}]}
		]
	})

	assert.deepEqual(detail.recentPurchases.map(point => point.purchaseId), ['same-time', 'newer', 'older'])
	assert.equal(detail.recentPurchases.find(point => point.purchaseId === 'newer').merchantName, 'Novus')
	assert.equal(detail.recentPurchases.find(point => point.purchaseId === 'same-time').merchantName, 'Fallback shop')
	assert.equal(detail.recentPurchases.find(point => point.purchaseId === 'newer').quantityLabel, '900 ml')
	assert.equal(detail.recentPurchases.find(point => point.purchaseId === 'newer').unitPriceLabel, '64,90 грн/l')
	assert.equal(detail.recentPurchases.find(point => point.purchaseId === 'newer').total, 58.41)
})

test('product detail chart points are factual valid observations with metadata', () => {
	const detail = buildProductDetail({
		productId: 201,
		period,
		categories,
		products,
		merchants,
		purchases: [
			{id: 'valid-a', merchantId: 501, purchasedAt: '2026-09-21T10:30:00', items: [{id: 'a', productId: 201, quantity: 900, unit: 'ml', total: 58.41}]},
			{id: 'invalid-zero', merchantId: 501, purchasedAt: '2026-09-21T11:00:00', items: [{id: 'bad-zero', productId: 201, quantity: 0, unit: 'ml', total: 10}]},
			{id: 'invalid-unit', merchantId: 501, purchasedAt: '2026-09-21T12:00:00', items: [{id: 'bad-unit', productId: 201, quantity: 1, unit: 'box', total: 10}]},
			{id: 'valid-b', merchantId: 502, purchasedAt: '2026-09-21T18:20:00', items: [{id: 'b', productId: 201, quantity: 1, unit: 'l', total: 60.2}]}
		]
	})

	assert.equal(detail.history.length, 2)
	assert.equal(detail.priceChartPoints.length, 2)
	assert.deepEqual(detail.priceChartPoints.map(point => point.purchaseId), ['valid-a', 'valid-b'])
	assert.equal(detail.priceChartPoints[0].merchantName, 'Novus')
	assert.equal(detail.priceChartPoints[0].price, 64.9)
	assert.equal(detail.priceChartPoints[0].priceLabel, '64,90 грн/l')
	assert.equal(detail.priceChartPoints[0].quantityLabel, '900 ml')
	assert.equal(detail.priceChartPoints[0].totalLabel, '58,41 грн')
	assert.match(detail.priceChartPoints[0].dateLabel, /21 Sep/)
})

test('product detail store prices use weighted average and latest store price', () => {
	const detail = buildProductDetail({
		productId: 101,
		period,
		categories,
		products,
		merchants,
		purchases: [
			{id: 'a1', merchantId: 502, purchasedAt: '2026-09-02T12:00:00', items: [{id: 'a1i', productId: 101, quantity: 0.5, unit: 'kg', total: 50}]},
			{id: 'a2', merchantId: 502, purchasedAt: '2026-09-20T12:00:00', items: [{id: 'a2i', productId: 101, quantity: 1.5, unit: 'kg', total: 120}]},
			{id: 'a3', merchantId: 502, purchasedAt: '2026-09-29T12:00:00', items: [{id: 'a3i', productId: 101, quantity: 1, unit: 'kg', total: 95}]}
		]
	})

	const atb = detail.storePrices[0]
	assert.equal(atb.merchantName, 'АТБ')
	assert.equal(atb.normalizedQuantity, 3000)
	assert.equal(atb.displayQuantity, '3 kg')
	assert.equal(atb.spent, 265)
	assert.equal(atb.averageUnitPrice, 88.33)
	assert.equal(atb.averageUnitPriceLabel, '88,33 грн/kg')
	assert.equal(atb.lastUnitPrice, 95)
	assert.equal(atb.lastUnitPriceLabel, '95,00 грн/kg')
	assert.equal(atb.observationCount, 3)
	assert.equal(atb.purchaseCount, 3)
})

test('product detail store prices count distinct purchases for duplicate item occurrences', () => {
	const detail = buildProductDetail({
		productId: 201,
		period,
		categories,
		products,
		merchants,
		purchases: [{
			id: 'same-receipt',
			merchantId: 501,
			purchasedAt: '2026-09-10T12:00:00',
			items: [
				{id: 'a', productId: 201, quantity: 1, unit: 'l', total: 60},
				{id: 'b', productId: 201, quantity: 2, unit: 'l', total: 116}
			]
		}]
	})

	const store = detail.storePrices[0]
	assert.equal(store.observationCount, 2)
	assert.equal(store.purchaseCount, 1)
	assert.equal(store.normalizedQuantity, 3000)
	assert.equal(store.averageUnitPrice, 58.67)
})

test('product detail store prices aggregate multiple merchants independently and sort neutrally', () => {
	const detail = buildProductDetail({
		productId: 201,
		period,
		categories,
		products,
		merchants,
		purchases: [
			{id: 'atb-1', merchantId: 502, purchasedAt: '2026-09-02T12:00:00', items: [{id: 'a1', productId: 201, quantity: 1, unit: 'l', total: 58}]},
			{id: 'atb-2', merchantId: 502, purchasedAt: '2026-09-29T12:00:00', items: [{id: 'a2', productId: 201, quantity: 1, unit: 'l', total: 60}]},
			{id: 'novus-1', merchantId: 501, purchasedAt: '2026-09-14T12:00:00', items: [{id: 'n1', productId: 201, quantity: 900, unit: 'ml', total: 58.41}]},
			{id: 'silpo-1', merchantId: 503, purchasedAt: '2026-09-20T12:00:00', items: [{id: 's1', productId: 201, quantity: 1, unit: 'l', total: 66.1}]}
		]
	})

	assert.deepEqual(detail.storePrices.map(store => store.merchantName), ['АТБ', 'Сільпо', 'Novus'])
	assert.equal(detail.storePrices.find(store => store.merchantName === 'АТБ').averageUnitPrice, 59)
	assert.equal(detail.storePrices.find(store => store.merchantName === 'АТБ').lastUnitPrice, 60)
	assert.equal(detail.storePrices.find(store => store.merchantName === 'Novus').averageUnitPrice, 64.9)
	assert.equal(detail.storePrices.find(store => store.merchantName === 'Сільпо').averageUnitPrice, 66.1)
})

test('product detail keeps factual item occurrences but counts distinct purchases', () => {
	const detail = buildProductDetail({
		productId: 201,
		period,
		categories,
		products,
		merchants,
		purchases: [{
			id: 100,
			merchantId: 501,
			purchasedAt: '2026-09-10T12:00:00',
			items: [
				{id: 'a', productId: 201, quantity: 1, unit: 'l', total: 60},
				{id: 'b', productId: 201, quantity: 2, unit: 'l', total: 116}
			]
		}]
	})

	assert.equal(detail.spent, 176)
	assert.equal(detail.displayQuantity, '3 l')
	assert.equal(detail.history.length, 2)
	assert.equal(detail.purchaseCount, 1)
})

test('product detail keeps spending when malformed items cannot produce price points', () => {
	const detail = buildProductDetail({
		productId: 101,
		period,
		categories,
		products,
		merchants,
		purchases: [{
			id: 1,
			merchantId: 501,
			purchasedAt: '2026-09-10T12:00:00',
			items: [
				{id: 'bad-zero', productId: 101, quantity: 0, unit: 'kg', total: 25},
				{id: 'bad-unit', productId: 101, quantity: 1, unit: 'box', total: 30}
			]
		}]
	})

	assert.equal(detail.spent, 55)
	assert.equal(detail.displayQuantity, '')
	assert.equal(detail.averageUnitPrice, null)
	assert.equal(detail.lastUnitPrice, null)
	assert.equal(detail.history.length, 0)
	assert.equal(detail.purchaseCount, 1)
})
