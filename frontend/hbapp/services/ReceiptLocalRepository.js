import IndexedDbClient from './IndexedDbClient.js'
import {createLocalId, toServerId} from './ProductCatalogLocalRepository.js'
import {getAuthenticatedUserId} from './AuthSession.js'
import {notifyProductCatalogChanged} from './ProductCatalogEvents.js'

const STORE = 'receiptDrafts'
const PENDING_STATES = new Set(['pending_upload', 'pending_replace', 'pending_delete', 'syncing', 'error'])

const cloneReceipt = receipt => receipt ? {...receipt} : null

const nowIso = () => new Date().toISOString()

const getUserId = value => {
	const number = Number(value ?? getAuthenticatedUserId())
	return Number.isInteger(number) && number > 0 ? number : null
}

const normalizeReceipt = receipt => {
	const localId = receipt.localId || createLocalId('receipt')
	const syncStatus = receipt.syncStatus || (receipt.serverReceiptId ? 'synced' : 'pending_upload')
	const purchaseLocalId = receipt.purchaseLocalId === undefined || receipt.purchaseLocalId === null || receipt.purchaseLocalId === ''
		? null
		: String(receipt.purchaseLocalId)
	return {
		localId,
		userId: getUserId(receipt.userId),
		purchaseLocalId,
		purchaseServerId: toServerId(receipt.purchaseServerId),
		serverReceiptId: toServerId(receipt.serverReceiptId),
		clientMutationId: receipt.clientMutationId || localId,
		blob: receipt.blob || null,
		mimeType: receipt.mimeType || 'image/jpeg',
		originalFilename: receipt.originalFilename || null,
		size: Number(receipt.size || receipt.blob?.size || 0),
		ocr: normalizeOcr(receipt.ocr),
		syncStatus,
		error: receipt.error || null,
		createdAt: receipt.createdAt || nowIso(),
		updatedAt: nowIso()
	}
}

const normalizeOcr = ocr => {
	if (!ocr) return null
	return {
		receiptId: toServerId(ocr.receiptId),
		status: ocr.status || null,
		rawText: ocr.rawText === undefined || ocr.rawText === null ? null : String(ocr.rawText),
		engine: ocr.engine || null,
		engineVersion: ocr.engineVersion || null,
		language: ocr.language || null,
		error: ocr.error || null,
		durationMs: ocr.durationMs === undefined || ocr.durationMs === null ? null : Number(ocr.durationMs),
		createdAt: ocr.createdAt || null,
		updatedAt: ocr.updatedAt || nowIso(),
		cachedAt: ocr.cachedAt || nowIso()
	}
}

export default class ReceiptLocalRepository {
	constructor({indexedDbClient = new IndexedDbClient()} = {}) {
		this.indexedDbClient = indexedDbClient
	}

	async getByPurchaseLocalId(purchaseLocalId, {includeDeleted = false, userId = getUserId()} = {}) {
		if (purchaseLocalId === null || purchaseLocalId === undefined || purchaseLocalId === '') return null
		const records = await this.indexedDbClient.getAllFromIndex(STORE, 'purchaseLocalId', String(purchaseLocalId)).catch(() => [])
		const receipt = records
			.map(normalizeReceipt)
			.filter(record => !userId || !record.userId || Number(record.userId) === Number(userId))
			.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0] || null
		if (!receipt) return null
		if (!includeDeleted && receipt.syncStatus === 'pending_delete') return null
		return cloneReceipt(receipt)
	}

	async getByLocalId(localId, {includeDeleted = false, userId = getUserId()} = {}) {
		const record = await this.indexedDbClient.get(STORE, localId).catch(() => null)
		if (!record) return null
		const receipt = normalizeReceipt(record)
		if (userId && receipt.userId && Number(receipt.userId) !== Number(userId)) return null
		if (!includeDeleted && receipt.syncStatus === 'pending_delete') return null
		return cloneReceipt(receipt)
	}

	async listByUser(userId = getUserId()) {
		const records = await this.indexedDbClient.getAll(STORE).catch(() => [])
		return records.map(normalizeReceipt)
			.filter(record => !userId || !record.userId || Number(record.userId) === Number(userId))
			.map(cloneReceipt)
	}

	async listStandaloneByUser(userId = getUserId(), {includeDeleted = false} = {}) {
		const records = await this.listByUser(userId)
		return records
			.filter(record => record.purchaseLocalId === null)
			.filter(record => includeDeleted || record.syncStatus !== 'pending_delete')
			.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || String(b.localId).localeCompare(String(a.localId)))
	}

	async saveStandalone({image, syncStatus = 'pending_upload'} = {}) {
		const record = normalizeReceipt({
			userId: getUserId(),
			purchaseLocalId: null,
			purchaseServerId: null,
			serverReceiptId: null,
			clientMutationId: createLocalId('receipt-mutation'),
			blob: image.blob,
			mimeType: image.mimeType,
			originalFilename: image.originalFilename,
			size: image.size,
			syncStatus,
			error: null
		})
		await this.indexedDbClient.put(STORE, record)
		notifyProductCatalogChanged({entityType: 'purchase', action: 'standalone-receipt-save'})
		return cloneReceipt(record)
	}

	async saveForPurchase({purchase, image, syncStatus = null}) {
		const existing = await this.getByPurchaseLocalId(purchase.id || purchase.localId, {includeDeleted: true})
		const record = normalizeReceipt({
			...(existing || {}),
			userId: getUserId(purchase.userId),
			purchaseLocalId: purchase.id || purchase.localId,
			purchaseServerId: purchase.serverId,
			serverReceiptId: existing?.serverReceiptId || purchase.receipt?.id || null,
			clientMutationId: existing?.clientMutationId || createLocalId('receipt-mutation'),
			blob: image.blob,
			mimeType: image.mimeType,
			originalFilename: image.originalFilename,
			size: image.size,
			syncStatus: syncStatus || (existing?.serverReceiptId || purchase.hasReceipt ? 'pending_replace' : 'pending_upload'),
			error: null
		})
		await this.indexedDbClient.put(STORE, record)
		notifyProductCatalogChanged({entityType: 'purchase', action: 'receipt-save'})
		return cloneReceipt(record)
	}

	async markPendingDelete(purchase) {
		const existing = await this.getByPurchaseLocalId(purchase.id || purchase.localId, {includeDeleted: true})
		if (!existing || (!existing.serverReceiptId && !purchase.hasReceipt)) {
			if (existing) {
				await this.indexedDbClient.delete(STORE, existing.localId)
				notifyProductCatalogChanged({entityType: 'purchase', action: 'receipt-delete-local'})
				return null
			}
			if (purchase.hasReceipt || purchase.receipt?.id) {
				const record = normalizeReceipt({
					userId: getUserId(purchase.userId),
					purchaseLocalId: purchase.id || purchase.localId,
					purchaseServerId: purchase.serverId,
					serverReceiptId: purchase.receipt?.id || null,
					clientMutationId: createLocalId('receipt-delete'),
					blob: null,
					mimeType: 'image/jpeg',
					originalFilename: null,
					size: 0,
					syncStatus: 'pending_delete',
					error: null
				})
				await this.indexedDbClient.put(STORE, record)
				notifyProductCatalogChanged({entityType: 'purchase', action: 'receipt-delete'})
				return cloneReceipt(record)
			}
			notifyProductCatalogChanged({entityType: 'purchase', action: 'receipt-delete-local'})
			return null
		}
		const record = normalizeReceipt({
			...existing,
			userId: getUserId(purchase.userId),
			purchaseServerId: purchase.serverId || existing.purchaseServerId,
			serverReceiptId: existing.serverReceiptId || purchase.receipt?.id || null,
			blob: existing.blob,
			syncStatus: 'pending_delete',
			error: null
		})
		await this.indexedDbClient.put(STORE, record)
		notifyProductCatalogChanged({entityType: 'purchase', action: 'receipt-delete'})
		return cloneReceipt(record)
	}

	async markSynced(receiptLocalId, serverReceipt) {
		const existing = await this.indexedDbClient.get(STORE, receiptLocalId)
		if (!existing) return null
		const record = normalizeReceipt({
			...existing,
			serverReceiptId: serverReceipt?.id,
			purchaseServerId: serverReceipt?.purchaseId || existing.purchaseServerId,
			mimeType: serverReceipt?.mimeType || existing.mimeType,
			size: serverReceipt?.sizeBytes || existing.size,
			syncStatus: 'synced',
			error: null
		})
		await this.indexedDbClient.put(STORE, record)
		notifyProductCatalogChanged({entityType: 'purchase', action: 'receipt-synced'})
		return cloneReceipt(record)
	}

	async cacheOcrResult(receiptLocalId, ocr) {
		const existing = await this.indexedDbClient.get(STORE, receiptLocalId)
		if (!existing) return null
		const record = normalizeReceipt({
			...existing,
			ocr: normalizeOcr({...ocr, cachedAt: nowIso()})
		})
		await this.indexedDbClient.put(STORE, record)
		notifyProductCatalogChanged({entityType: 'purchase', action: 'receipt-ocr-cache'})
		return cloneReceipt(record)
	}

	async linkStandaloneToPurchase(receiptLocalId, purchase) {
		const existing = await this.indexedDbClient.get(STORE, receiptLocalId)
		if (!existing) return null
		const purchaseLocalId = purchase?.id || purchase?.localId || null
		const record = normalizeReceipt({
			...existing,
			purchaseLocalId,
			purchaseServerId: toServerId(purchase?.serverId ?? purchase?.id),
			serverReceiptId: existing.serverReceiptId || purchase?.receipt?.id || null,
			syncStatus: 'synced',
			error: null
		})
		await this.indexedDbClient.put(STORE, record)
		notifyProductCatalogChanged({entityType: 'purchase', action: 'standalone-receipt-linked'})
		return cloneReceipt(record)
	}

	async updateServerPurchaseId(purchaseLocalId, purchaseServerId) {
		const receipt = await this.getByPurchaseLocalId(purchaseLocalId, {includeDeleted: true})
		if (!receipt || receipt.purchaseServerId) return receipt
		const record = normalizeReceipt({...receipt, purchaseServerId})
		await this.indexedDbClient.put(STORE, record)
		return cloneReceipt(record)
	}

	async markDeleted(receiptLocalId) {
		await this.indexedDbClient.delete(STORE, receiptLocalId)
		notifyProductCatalogChanged({entityType: 'purchase', action: 'receipt-deleted'})
		return true
	}

	async markStandalonePendingDelete(receiptLocalId) {
		const existing = await this.getByLocalId(receiptLocalId, {includeDeleted: true})
		if (!existing) return null
		if (!existing.serverReceiptId) {
			await this.markDeleted(existing.localId)
			return null
		}
		const record = normalizeReceipt({
			...existing,
			syncStatus: 'pending_delete',
			error: null
		})
		await this.indexedDbClient.put(STORE, record)
		notifyProductCatalogChanged({entityType: 'purchase', action: 'standalone-receipt-delete'})
		return cloneReceipt(record)
	}

	async markError(receiptLocalId, error) {
		const existing = await this.indexedDbClient.get(STORE, receiptLocalId)
		if (!existing) return null
		const record = normalizeReceipt({
			...existing,
			syncStatus: 'error',
			error: error?.message || 'Receipt sync failed'
		})
		await this.indexedDbClient.put(STORE, record)
		return cloneReceipt(record)
	}

	isPending(receipt) {
		return PENDING_STATES.has(receipt?.syncStatus)
	}
}

export {PENDING_STATES, normalizeReceipt}
