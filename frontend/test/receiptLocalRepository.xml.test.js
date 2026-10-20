import test from 'node:test'
import assert from 'node:assert/strict'
import ReceiptLocalRepository from '../hbapp/services/ReceiptLocalRepository.js'

globalThis.localStorage = {
	data: new Map([['hboo-auth-v1', JSON.stringify({token: 'test', user: {id: 7}})]]),
	getItem(key) { return this.data.get(key) || null },
	setItem(key, value) { this.data.set(key, value) },
	removeItem(key) { this.data.delete(key) }
}

class MemoryIndexedDbClient {
	constructor() { this.records = new Map() }
	async put(_store, value) { this.records.set(value.localId, structuredClone(value)) }
	async get(_store, key) { return structuredClone(this.records.get(key) || null) }
	async getAll() { return [...this.records.values()].map(record => structuredClone(record)) }
	async getAllFromIndex(_store, index, value) {
		return [...this.records.values()].filter(record => record[index] === value).map(record => structuredClone(record))
	}
	async delete(_store, key) { this.records.delete(key) }
}

const draft = hash => ({
	sourceType: 'xml', sourceFormat: 'RQ', sourceHash: hash,
	fiscalIdentity: {fiscalRegisterNumber: '3000000000', receiptNumber: '42', timestamp: '20261019120000'},
	items: [], warnings: []
})

test('persists, reloads, scopes and deletes an XML draft locally', async () => {
	const repository = new ReceiptLocalRepository({indexedDbClient: new MemoryIndexedDbClient()})
	const saved = await repository.saveXmlDraft({draft: draft('abc'), rawXml: '<RQ/>', file: {name: 'receipt.xml', size: 5}})
	assert.equal(saved.duplicate, false)
	const loaded = await repository.getByLocalId(saved.receipt.localId)
	assert.equal(loaded.rawXml, '<RQ/>')
	assert.equal(loaded.xmlDraft.sourceHash, 'abc')
	assert.equal(loaded.syncStatus, 'local_draft')
	assert.equal(await repository.getByLocalId(saved.receipt.localId, {userId: 8}), null)
	await repository.markStandalonePendingDelete(saved.receipt.localId)
	assert.equal(await repository.getByLocalId(saved.receipt.localId), null)
})

test('detects duplicates by hash and fiscal identity without overwriting', async () => {
	const client = new MemoryIndexedDbClient()
	const repository = new ReceiptLocalRepository({indexedDbClient: client})
	const first = await repository.saveXmlDraft({draft: draft('same'), rawXml: '<RQ id="first"/>', file: {name: 'a.xml', size: 1}})
	const sameHash = await repository.saveXmlDraft({draft: {...draft('same'), fiscalIdentity: {}}, rawXml: '<RQ id="second"/>', file: {name: 'b.xml', size: 2}})
	assert.equal(sameHash.duplicate, true)
	assert.equal(sameHash.receipt.localId, first.receipt.localId)
	assert.equal(sameHash.receipt.rawXml, '<RQ id="first"/>')
	const sameIdentity = await repository.saveXmlDraft({draft: draft('different'), rawXml: '<RQ/>', file: {name: 'c.xml', size: 1}})
	assert.equal(sameIdentity.duplicate, true)
	assert.equal(client.records.size, 1)
})

test('persists a manually selected XML Merchant for review after reload', async () => {
	const repository = new ReceiptLocalRepository({indexedDbClient: new MemoryIndexedDbClient()})
	const saved = await repository.saveXmlDraft({draft: draft('merchant'), rawXml: '<RQ/>', file: {name: 'merchant.xml', size: 5}})
	await repository.updateXmlReview(saved.receipt.localId, {merchantId: 'local-merchant-1'})
	const reloaded = await repository.getByLocalId(saved.receipt.localId)
	assert.equal(reloaded.xmlDraft.review.merchantId, 'local-merchant-1')
})
