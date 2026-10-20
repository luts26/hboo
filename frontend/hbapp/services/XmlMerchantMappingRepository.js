import IndexedDbClient from './IndexedDbClient.js'
import {getAuthenticatedUserId} from './AuthSession.js'

const PREFIX = 'xml-merchant-map'
const userId = value => Number(value ?? getAuthenticatedUserId()) || null
const storageKey = (ownerId, identityKey) => `${PREFIX}:${ownerId || 'anonymous'}:${identityKey}`

export default class XmlMerchantMappingRepository {
	constructor({indexedDbClient = new IndexedDbClient()} = {}) {
		this.indexedDbClient = indexedDbClient
	}

	async list(ownerId = userId()) {
		const records = await this.indexedDbClient.getAll('meta').catch(() => [])
		return records
			.filter(record => record.type === PREFIX && Number(record.userId || 0) === Number(ownerId || 0))
			.map(record => ({...record}))
	}

	async save({identityKey, merchantId, merchantName, ownerId = userId()} = {}) {
		if (!identityKey || !merchantId) throw new Error('Merchant mapping requires an XML identity and Merchant.')
		const key = storageKey(ownerId, identityKey)
		const existing = await this.indexedDbClient.get('meta', key).catch(() => null)
		if (existing && String(existing.merchantId) !== String(merchantId)) {
			throw new Error('This XML Merchant identity is already mapped to another Merchant.')
		}
		const record = {
			key,
			type: PREFIX,
			userId: ownerId,
			identityKey,
			merchantId,
			merchantName: merchantName || null,
			createdAt: existing?.createdAt || new Date().toISOString(),
			updatedAt: new Date().toISOString()
		}
		await this.indexedDbClient.put('meta', record)
		return {...record}
	}
}
