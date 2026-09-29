import test from 'node:test'
import assert from 'node:assert/strict'

import api from '../hbapp/mixins/apiQueriesHelper.js'
import {setAuthState} from '../hbapp/services/AuthSession.js'
import ProductCatalogLocalRepository from '../hbapp/services/ProductCatalogLocalRepository.js'
import ProductCatalogSyncQueue from '../hbapp/services/ProductCatalogSyncQueue.js'
import ProductCatalogSyncService from '../hbapp/services/ProductCatalogSyncService.js'

class MemoryStorage {
	constructor() {
		this.values = new Map()
	}
	getItem(key) {
		return this.values.get(key) || null
	}
	setItem(key, value) {
		this.values.set(key, String(value))
	}
	removeItem(key) {
		this.values.delete(key)
	}
}

class FakeIndexedDbClient {
	constructor() {
		this.stores = new Map([
			['productCategories', new Map()],
			['products', new Map()],
			['merchants', new Map()],
			['purchases', new Map()],
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
		const key = storeName === 'syncQueue' ? value.operationId : value.id
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

const setup = () => {
	globalThis.localStorage = new MemoryStorage()
	setAuthState({token: 'test-token', user: {id: 1, username: 'dev'}})
	const indexedDbClient = new FakeIndexedDbClient()
	const repository = new ProductCatalogLocalRepository({indexedDbClient})
	const queue = new ProductCatalogSyncQueue(indexedDbClient)
	const syncService = new ProductCatalogSyncService({
		localRepository: repository,
		queue,
		autoRegisterSyncTriggers: false
	})
	return {indexedDbClient, repository, queue, syncService}
}

test('pending purchase create syncs once and keeps localId after server id assignment', async () => {
	const {repository, syncService, queue} = setup()
	let posts = 0
	const originalPost = api.post
	api.post = async (path, payload) => {
		posts += 1
		assert.equal(path, '/purchases')
		return {...payload, id: 42, merchantName: 'ATB', total: 254.58, items: []}
	}

	try {
		const purchase = await repository.savePurchase({
			merchantName: 'ATB',
			purchasedAt: '2026-09-28T12:00:00',
			paymentType: 'bank',
			total: 254.58,
			items: []
		}, {syncStatus: 'pending_create'})
		await queue.enqueue({entityType: 'purchase', entityLocalId: purchase.id, action: 'create'})
		await syncService.processQueue({force: true})
		await syncService.processQueue({force: true})

		const purchases = await repository.getPurchases()
		assert.equal(posts, 1)
		assert.equal(purchases.length, 1)
		assert.equal(purchases[0].id, purchase.id)
		assert.equal(purchases[0].serverId, 42)
		assert.equal((await queue.getPendingOperations()).length, 0)
	} finally {
		api.post = originalPost
	}
})

test('auth failure preserves local purchase and pauses queue', async () => {
	const {repository, syncService, queue} = setup()
	const originalPost = api.post
	api.post = async () => {
		const error = new Error('Unauthorized')
		error.status = 401
		throw error
	}

	try {
		const purchase = await repository.savePurchase({
			merchantName: 'ATB',
			purchasedAt: '2026-09-28T12:00:00',
			paymentType: 'bank',
			total: 254.58,
			items: []
		}, {syncStatus: 'pending_create'})
		await queue.enqueue({entityType: 'purchase', entityLocalId: purchase.id, action: 'create'})
		await syncService.processQueue({force: true})

		const operations = await queue.getPendingOperations()
		assert.equal((await repository.getPurchases()).length, 1)
		assert.equal(operations.length, 1)
		assert.equal(operations[0].status, 'paused')
	} finally {
		api.post = originalPost
	}
})

test('network failure preserves queue and later retry succeeds without duplicate local purchase', async () => {
	const {repository, syncService, queue} = setup()
	const originalPost = api.post
	let fail = true
	api.post = async (path, payload) => {
		if (fail) {
			fail = false
			throw new Error('Network down')
		}
		return {...payload, id: 43, merchantName: 'ATB', total: 254.58, items: []}
	}

	try {
		const purchase = await repository.savePurchase({
			merchantName: 'ATB',
			purchasedAt: '2026-09-28T12:00:00',
			paymentType: 'bank',
			total: 254.58,
			items: []
		}, {syncStatus: 'pending_create'})
		await queue.enqueue({entityType: 'purchase', entityLocalId: purchase.id, action: 'create'})
		await syncService.processQueue({force: true})
		assert.equal((await queue.getPendingOperations())[0].status, 'error')

		await syncService.processQueue({force: true})
		const purchases = await repository.getPurchases()
		assert.equal(purchases.length, 1)
		assert.equal(purchases[0].serverId, 43)
		assert.equal((await queue.getPendingOperations()).length, 0)
	} finally {
		api.post = originalPost
	}
})

test('local product dependency syncs before offline purchase upload', async () => {
	const {repository, syncService, queue} = setup()
	const calls = []
	const originalPost = api.post
	api.post = async (path, payload) => {
		calls.push(path)
		if (path === '/products') return {id: 10, categoryId: payload.category_id, categoryName: 'Напої', name: payload.name, measurementType: payload.measurement_type, status: 'active'}
		if (path === '/purchases') {
			assert.equal(payload.items[0].product_id, 10)
			return {...payload, id: 44, merchantName: 'ATB', total: 86.6, items: []}
		}
		throw new Error(`Unexpected ${path}`)
	}

	try {
		const product = await repository.createLocalProduct({
			categoryId: 1,
			categoryName: 'Напої',
			name: 'Вода Моршинська',
			measurementType: 'volume'
		})
		const purchase = await repository.savePurchase({
			merchantName: 'ATB',
			purchasedAt: '2026-09-28T12:00:00',
			paymentType: 'bank',
			total: 86.6,
			items: [{
				productId: product.id,
				productName: product.name,
				categoryId: 1,
				categoryName: 'Напої',
				measurementType: 'volume',
				quantity: 6,
				unit: 'l',
				total: 86.6
			}]
		}, {syncStatus: 'pending_create'})
		await queue.enqueue({entityType: 'purchase', entityLocalId: purchase.id, action: 'create'})
		await queue.enqueue({entityType: 'product', entityLocalId: product.id, action: 'create'})
		await syncService.processQueue({force: true})

		const purchases = await repository.getPurchases()
		assert.deepEqual(calls, ['/products', '/purchases'])
		assert.equal(purchases.length, 1)
		assert.equal(purchases[0].serverId, 44)
	} finally {
		api.post = originalPost
	}
})
