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
			['receiptDrafts', new Map()],
			['syncQueue', new Map()]
		])
	}

	async getAll(storeName) {
		return Array.from(this.stores.get(storeName).values())
	}

	async get(storeName, key) {
		return this.stores.get(storeName).get(key)
	}

	async getAllFromIndex(storeName, indexName, query) {
		return Array.from(this.stores.get(storeName).values()).filter(record => String(record[indexName]) === String(query))
	}

	async put(storeName, value) {
		const key = storeName === 'syncQueue' ? value.operationId : (value.id ?? value.localId)
		this.stores.get(storeName).set(key, {...value})
		return key
	}

	async delete(storeName, key) {
		this.stores.get(storeName).delete(key)
	}

	async transaction(storeNames, mode, callback) {
		return callback({
			getAll: storeName => this.getAll(storeName),
			getAllFromIndex: (storeName, indexName, query) => this.getAllFromIndex(storeName, indexName, query),
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

test('receipt upload waits for purchase server id, then uploads once with stable mutation id', async () => {
	const {repository, syncService, queue} = setup()
	const uploads = []
	const originalPost = api.post
	api.post = async (path, payload) => {
		if (path === '/purchases') return {...payload, id: 45, merchantName: 'ATB', total: 86.6, items: []}
		throw new Error(`Unexpected ${path}`)
	}
	syncService.receiptApiService = {
		uploadReceipt: async (purchaseServerId, receipt) => {
			uploads.push({purchaseServerId, clientMutationId: receipt.clientMutationId})
			return {id: 301, purchaseId: purchaseServerId, mimeType: receipt.mimeType, sizeBytes: receipt.size}
		},
		deleteReceipt: async () => true
	}

	try {
		const purchase = await repository.savePurchase({
			merchantName: 'ATB',
			purchasedAt: '2026-09-28T12:00:00',
			paymentType: 'bank',
			total: 86.6,
			items: [{productId: 10, productServerId: 10, productName: 'Вода', categoryId: 1, categoryName: 'Напої', measurementType: 'volume', quantity: 1, unit: 'l', total: 86.6}]
		}, {syncStatus: 'pending_create'})
		const receipt = await syncService.receiptLocalRepository.saveForPurchase({
			purchase,
			image: {blob: new Blob(['receipt'], {type: 'image/jpeg'}), mimeType: 'image/jpeg', originalFilename: 'r.jpg', size: 7}
		})
		await queue.enqueue({entityType: 'receipt', entityLocalId: purchase.id, action: 'upsert'})
		await queue.enqueue({entityType: 'purchase', entityLocalId: purchase.id, action: 'create'})
		await syncService.processQueue({force: true})
		await syncService.processQueue({force: true})

		const syncedReceipt = await syncService.receiptLocalRepository.getByPurchaseLocalId(purchase.id)
		assert.equal(uploads.length, 1)
		assert.equal(uploads[0].purchaseServerId, 45)
		assert.equal(uploads[0].clientMutationId, receipt.clientMutationId)
		assert.equal(syncedReceipt.serverReceiptId, 301)
		assert.equal(syncedReceipt.syncStatus, 'synced')
		assert.equal((await queue.getPendingOperations()).length, 0)
	} finally {
		api.post = originalPost
	}
})

test('pending receipt delete executes after server purchase identity exists', async () => {
	const {repository, syncService, queue} = setup()
	const deleted = []
	syncService.receiptApiService = {
		uploadReceipt: async () => {
			throw new Error('upload should not run')
		},
		deleteReceipt: async purchaseServerId => {
			deleted.push(purchaseServerId)
			return true
		}
	}
	const purchase = await repository.savePurchase({
		id: 'server-purchase-42',
		serverId: 42,
		merchantName: 'ATB',
		purchasedAt: '2026-09-28T12:00:00',
		paymentType: 'bank',
		hasReceipt: true,
		receipt: {id: 9},
		total: 10,
		items: []
	}, {syncStatus: 'synced'})
	await syncService.receiptLocalRepository.markPendingDelete(purchase)
	await queue.enqueue({entityType: 'receipt', entityLocalId: purchase.id, action: 'delete'})

	await syncService.processQueue({force: true})

	assert.deepEqual(deleted, [42])
	assert.equal(await syncService.receiptLocalRepository.getByPurchaseLocalId(purchase.id, {includeDeleted: true}), null)
	assert.equal((await queue.getPendingOperations()).length, 0)
})

test('standalone receipt uploads without purchase dependency', async () => {
	const {syncService, queue} = setup()
	const uploads = []
	syncService.receiptApiService = {
		uploadStandaloneReceipt: async receipt => {
			uploads.push(receipt.clientMutationId)
			return {id: 501, purchaseId: null, mimeType: receipt.mimeType, sizeBytes: receipt.size}
		},
		deleteStandaloneReceipt: async () => true
	}
	const receipt = await syncService.receiptLocalRepository.saveStandalone({
		image: {blob: new Blob(['receipt'], {type: 'image/jpeg'}), mimeType: 'image/jpeg', originalFilename: 'r.jpg', size: 7}
	})
	await queue.enqueue({entityType: 'receipt', entityLocalId: receipt.localId, action: 'upsert'})

	await syncService.processQueue({force: true})

	const synced = await syncService.receiptLocalRepository.getByLocalId(receipt.localId)
	assert.deepEqual(uploads, [receipt.clientMutationId])
	assert.equal(synced.serverReceiptId, 501)
	assert.equal(synced.purchaseLocalId, null)
	assert.equal((await queue.getPendingOperations()).length, 0)
})

test('standalone synced receipt delete dispatches standalone delete API', async () => {
	const {syncService, queue} = setup()
	const deleted = []
	syncService.receiptApiService = {
		uploadStandaloneReceipt: async () => {
			throw new Error('upload should not run')
		},
		deleteStandaloneReceipt: async receiptServerId => {
			deleted.push(receiptServerId)
			return true
		}
	}
	const receipt = await syncService.receiptLocalRepository.saveStandalone({
		image: {blob: new Blob(['receipt'], {type: 'image/jpeg'}), mimeType: 'image/jpeg', originalFilename: 'r.jpg', size: 7}
	})
	await syncService.receiptLocalRepository.markSynced(receipt.localId, {id: 502, purchaseId: null, mimeType: 'image/jpeg', sizeBytes: 7})
	await syncService.receiptLocalRepository.markStandalonePendingDelete(receipt.localId)
	await queue.enqueue({entityType: 'receipt', entityLocalId: receipt.localId, action: 'delete'})

	await syncService.processQueue({force: true})

	assert.deepEqual(deleted, [502])
	assert.equal(await syncService.receiptLocalRepository.getByLocalId(receipt.localId, {includeDeleted: true}), null)
})
