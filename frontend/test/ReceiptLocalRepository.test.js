import test from 'node:test'
import assert from 'node:assert/strict'

import {setAuthState} from '../hbapp/services/AuthSession.js'
import ReceiptLocalRepository from '../hbapp/services/ReceiptLocalRepository.js'

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
		this.stores = new Map([['receiptDrafts', new Map()]])
	}
	async getAll(storeName) {
		return Array.from(this.stores.get(storeName).values())
	}
	async getAllFromIndex(storeName, indexName, query) {
		return Array.from(this.stores.get(storeName).values()).filter(record => String(record[indexName]) === String(query))
	}
	async get(storeName, key) {
		return this.stores.get(storeName).get(key)
	}
	async put(storeName, value) {
		this.stores.get(storeName).set(value.localId, {...value})
		return value.localId
	}
	async delete(storeName, key) {
		this.stores.get(storeName).delete(key)
	}
}

const setup = userId => {
	globalThis.localStorage = new MemoryStorage()
	setAuthState({token: 'test-token', user: {id: userId, username: `u${userId}`}})
	const indexedDbClient = new FakeIndexedDbClient()
	return {
		indexedDbClient,
		repository: new ReceiptLocalRepository({indexedDbClient})
	}
}

const fakeImage = () => ({
	blob: new Blob(['fake-receipt'], {type: 'image/jpeg'}),
	mimeType: 'image/jpeg',
	originalFilename: 'fake.jpg',
	size: 12
})

test('receipt blob persists with user scope and purchase localId association', async () => {
	const {repository} = setup(7)
	const receipt = await repository.saveForPurchase({
		purchase: {id: 'local-purchase-1', userId: 7, serverId: null},
		image: fakeImage()
	})

	assert.equal(receipt.userId, 7)
	assert.equal(receipt.purchaseLocalId, 'local-purchase-1')
	assert.equal(receipt.syncStatus, 'pending_upload')
	assert.equal(receipt.blob.type, 'image/jpeg')
	assert.equal((await repository.getByPurchaseLocalId('local-purchase-1')).localId, receipt.localId)
})

test('receipt local data is scoped by authenticated user', async () => {
	const {repository} = setup(7)
	await repository.saveForPurchase({
		purchase: {id: 'local-purchase-1', userId: 7},
		image: fakeImage()
	})
	setAuthState({token: 'test-token-2', user: {id: 8, username: 'u8'}})

	assert.equal(await repository.getByPurchaseLocalId('local-purchase-1'), null)
	assert.deepEqual(await repository.listByUser(), [])
})

test('local-only removal deletes receipt blob without server mutation state', async () => {
	const {repository, indexedDbClient} = setup(7)
	await repository.saveForPurchase({
		purchase: {id: 'local-purchase-1', userId: 7},
		image: fakeImage()
	})

	const result = await repository.markPendingDelete({id: 'local-purchase-1', userId: 7, hasReceipt: false})

	assert.equal(result, null)
	assert.equal((await indexedDbClient.getAll('receiptDrafts')).length, 0)
})

test('server-only removal creates pending delete state and hides normal lookup', async () => {
	const {repository} = setup(7)
	const pendingDelete = await repository.markPendingDelete({
		id: 'server-purchase-42',
		userId: 7,
		serverId: 42,
		hasReceipt: true,
		receipt: {id: 9}
	})

	assert.equal(pendingDelete.syncStatus, 'pending_delete')
	assert.equal(pendingDelete.purchaseServerId, 42)
	assert.equal(pendingDelete.serverReceiptId, 9)
	assert.equal(await repository.getByPurchaseLocalId('server-purchase-42'), null)
	assert.equal((await repository.getByPurchaseLocalId('server-purchase-42', {includeDeleted: true})).syncStatus, 'pending_delete')
})

test('replacement keeps one canonical local receipt for a purchase', async () => {
	const {repository} = setup(7)
	const first = await repository.saveForPurchase({
		purchase: {id: 'server-purchase-42', userId: 7, serverId: 42, hasReceipt: true, receipt: {id: 9}},
		image: fakeImage()
	})
	const second = await repository.saveForPurchase({
		purchase: {id: 'server-purchase-42', userId: 7, serverId: 42, hasReceipt: true, receipt: {id: 9}},
		image: {...fakeImage(), originalFilename: 'replacement.jpg'}
	})

	assert.equal(second.localId, first.localId)
	assert.equal(second.syncStatus, 'pending_replace')
	assert.equal((await repository.listByUser()).length, 1)
	assert.equal((await repository.getByPurchaseLocalId('server-purchase-42')).originalFilename, 'replacement.jpg')
})

test('standalone receipt persists without purchase ids and survives list reload', async () => {
	const {repository} = setup(7)
	const receipt = await repository.saveStandalone({image: fakeImage()})

	assert.equal(receipt.purchaseLocalId, null)
	assert.equal(receipt.purchaseServerId, null)
	assert.equal(receipt.syncStatus, 'pending_upload')
	assert.equal((await repository.getByLocalId(receipt.localId)).blob.type, 'image/jpeg')
	assert.deepEqual((await repository.listStandaloneByUser()).map(item => item.localId), [receipt.localId])
})

test('standalone delete removes local-only receipt and marks synced receipt pending delete', async () => {
	const {repository} = setup(7)
	const local = await repository.saveStandalone({image: fakeImage()})
	assert.equal(await repository.markStandalonePendingDelete(local.localId), null)
	assert.deepEqual(await repository.listStandaloneByUser(), [])

	const synced = await repository.saveStandalone({image: fakeImage()})
	await repository.markSynced(synced.localId, {id: 55, purchaseId: null, mimeType: 'image/jpeg', sizeBytes: 12})
	const pendingDelete = await repository.markStandalonePendingDelete(synced.localId)

	assert.equal(pendingDelete.syncStatus, 'pending_delete')
	assert.equal((await repository.listStandaloneByUser()).length, 0)
	assert.equal((await repository.listStandaloneByUser(7, {includeDeleted: true})).length, 1)
})
