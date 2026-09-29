import test from 'node:test'
import assert from 'node:assert/strict'

import ProductCatalogLocalRepository from '../hbapp/services/ProductCatalogLocalRepository.js'
import {calculateCurrentMonthPurchaseSummary} from '../hbapp/services/PurchaseSummaryService.js'

class FakeIndexedDbClient {
	constructor(seed = {}) {
		this.stores = new Map([
			['productCategories', new Map()],
			['products', new Map()],
			['merchants', new Map()],
			['purchases', new Map()]
		])
		Object.entries(seed).forEach(([storeName, records]) => {
			records.forEach(record => this.stores.get(storeName).set(record.id, record))
		})
	}

	async getAll(storeName) {
		return Array.from(this.stores.get(storeName).values())
	}

	async get(storeName, key) {
		return this.stores.get(storeName).get(key)
	}

	async put(storeName, value) {
		this.stores.get(storeName).set(value.id, value)
		return value.id
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

test('fresh sidebar hydration resolves persisted purchase summary without catalog mutation event', async () => {
	const repository = new ProductCatalogLocalRepository({
		indexedDbClient: new FakeIndexedDbClient({
			productCategories: [
				{id: 30, name: 'Молочні', status: 'active', sortOrder: 70},
				{id: 60, name: 'Крупи та макарони', status: 'active', sortOrder: 60},
				{id: 10, name: 'Овочі', status: 'active', sortOrder: 30}
			],
			products: [
				{id: 1, categoryId: 30, categoryName: 'Молочні', name: 'Молоко', measurementType: 'volume', status: 'active'},
				{id: 2, categoryId: 60, categoryName: 'Крупи та макарони', name: 'Рис', measurementType: 'weight', status: 'active'},
				{id: 3, categoryId: 10, categoryName: 'Овочі', name: 'Огірки', measurementType: 'weight', status: 'active'}
			],
			purchases: [
				{id: 'server-purchase-1', serverId: 1, localId: 'server-purchase-1', purchasedAt: '2026-09-05T12:00:00', paymentType: 'bank', syncStatus: 'synced', total: 180, items: [{productId: 1, productName: 'Молоко', categoryId: 30, categoryName: 'Молочні', quantity: 2, unit: 'l', total: 180}]},
				{id: 'server-purchase-2', serverId: 2, localId: 'server-purchase-2', purchasedAt: '2026-09-10T12:00:00', paymentType: 'bank', syncStatus: 'synced', total: 48.56, items: [{productId: 2, productName: 'Рис', categoryId: 60, categoryName: 'Крупи та макарони', quantity: 1, unit: 'kg', total: 48.56}]},
				{id: 'server-purchase-3', serverId: 3, localId: 'server-purchase-3', purchasedAt: '2026-09-20T12:00:00', paymentType: 'cash', syncStatus: 'synced', total: 34.5, items: [{productId: 3, productName: 'Огірки', categoryId: 10, categoryName: 'Овочі', quantity: 1, unit: 'kg', total: 34.5}]},
				{id: 'local-purchase-4', localId: 'local-purchase-4', purchasedAt: '2026-09-29T12:00:00', paymentType: 'bank', syncStatus: 'pending_create', total: 53.49, items: [{productId: 2, productName: 'Рис', categoryId: 60, categoryName: 'Крупи та макарони', quantity: 1, unit: 'kg', total: 53.49}]}
			]
		})
	})

	const [purchases, products, categories] = await Promise.all([
		repository.getPurchases(),
		repository.getProducts({includeDisabled: true}),
		repository.getCategories({includeDisabled: true})
	])
	const summary = calculateCurrentMonthPurchaseSummary({
		now: new Date(2026, 8, 29, 15, 30, 0, 0),
		purchases,
		products,
		categories
	})

	assert.equal(summary.purchaseCount, 4)
	assert.equal(summary.total, 316.55)
	assert.deepEqual(summary.topCategories.map(category => category.name), ['Молочні', 'Крупи та макарони', 'Овочі'])
	assert.deepEqual(summary.topCategories.map(category => Number(category.total.toFixed(2))), [180, 102.05, 34.5])
})
