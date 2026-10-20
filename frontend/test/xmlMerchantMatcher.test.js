import test from 'node:test'
import assert from 'node:assert/strict'
import {getMerchantIdentityKeys, matchXmlMerchant, normalizeLegalName} from '../hbapp/services/XmlMerchantMatcher.js'
import XmlMerchantMappingRepository from '../hbapp/services/XmlMerchantMappingRepository.js'

class MemoryIndexedDbClient {
	constructor() { this.records = new Map() }
	async get(_store, key) { return structuredClone(this.records.get(key) || null) }
	async getAll() { return [...this.records.values()].map(record => structuredClone(record)) }
	async put(_store, value) { this.records.set(value.key, structuredClone(value)) }
}

const merchants = [
	{id: 1, name: 'Novus', status: 'active'},
	{id: 2, name: 'Брусилівські ковбаси', status: 'active'},
	{id: 3, name: 'ТОВ ЛК-ТРАНС', status: 'active'}
]

test('matches exact and conservatively normalized legal Merchant names', () => {
	assert.equal(matchXmlMerchant({merchant: {rawName: 'NOVUS'}, merchants}).match.id, 1)
	assert.equal(matchXmlMerchant({merchant: {legalName: 'ТОВ "ЛК-ТРАНС"'}, merchants}).match.id, 3)
	assert.equal(normalizeLegalName('ТОВ «ЛК-ТРАНС»'), 'лк транс')
})

test('keeps weak, unknown and ambiguous Merchant matches unselected', () => {
	assert.equal(matchXmlMerchant({merchant: {legalName: 'ТОВ "ТД БРУСИЛІВСЬКІ КОВБАСИ"'}, merchants}).match, null)
	assert.equal(matchXmlMerchant({merchant: {legalName: 'Невідомий продавець'}, merchants}).status, 'unmatched')
	const ambiguous = matchXmlMerchant({
		merchant: {legalName: 'ТОВ "МАГАЗИН"'},
		merchants: [{id: 4, name: 'ПП Магазин'}, {id: 5, name: 'ФОП Магазин'}]
	})
	assert.equal(ambiguous.match, null)
	assert.equal(ambiguous.status, 'ambiguous')
})

test('uses a user-confirmed tax identity mapping offline and rejects conflicts', async () => {
	const repository = new XmlMerchantMappingRepository({indexedDbClient: new MemoryIndexedDbClient()})
	const identityKey = getMerchantIdentityKeys({taxId: 'ПН 360036026593'})[0]
	await repository.save({identityKey, merchantId: 1, merchantName: 'Novus', ownerId: 7})
	const mappings = await repository.list(7)
	assert.equal(matchXmlMerchant({merchant: {taxId: '360036026593'}, merchants, mappings}).match.id, 1)
	assert.equal((await repository.list(8)).length, 0)
	await assert.rejects(
		() => repository.save({identityKey, merchantId: 2, merchantName: 'Other', ownerId: 7}),
		/already mapped/
	)
})
