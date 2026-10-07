import IndexedDbClient from './IndexedDbClient.js'
import {getAllowedUnits, normalizeSearchText} from './ProductUnitService.js'
import {notifyProductCatalogChanged} from './ProductCatalogEvents.js'
import {
	getCurrentPurchaseRange,
	getGuaranteedPurchaseMonthRanges,
	getPurchaseMonthKeyFromTimestamp,
	normalizePurchaseRange,
	parsePurchaseTime
} from './PurchaseDateRange.js'

const TEMP_PREFIX = 'local-'
const SERVER_PREFIX = 'server-'
const SYNC_STATES = new Set(['synced', 'pending_create', 'pending_update', 'pending_delete', 'syncing', 'error'])

const clone = value => JSON.parse(JSON.stringify(value))

const nowIso = () => new Date().toISOString()

const createLocalId = prefix => {
	if (globalThis.crypto?.randomUUID) return `${TEMP_PREFIX}${prefix}-${globalThis.crypto.randomUUID()}`
	return `${TEMP_PREFIX}${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const isLocalId = id => String(id || '').startsWith(TEMP_PREFIX)

const toServerId = value => {
	if (value === null || value === undefined || value === '') return null
	const number = Number(value)
	return Number.isInteger(number) && number > 0 ? number : null
}

const toUserId = value => {
	const number = Number(value)
	return Number.isInteger(number) && number > 0 ? number : null
}

const getServerBackedLocalId = (entityType, serverId) => `${SERVER_PREFIX}${entityType}-${Number(serverId)}`

const normalizeSyncState = (value, fallback = 'synced') => {
	if (SYNC_STATES.has(value)) return value
	if (value === 'pending') return 'pending_create'
	return fallback
}

const normalizeProduct = product => {
	const serverId = toServerId(product.serverId ?? (isLocalId(product.id) ? null : product.id))
	const id = product.id || (serverId ? serverId : createLocalId('product'))
	return {
		id,
		localId: product.localId || String(id),
		serverId,
		categoryId: Number(product.categoryId),
		categoryName: product.categoryName || null,
		name: String(product.name || '').trim(),
		measurementType: product.measurementType,
		status: product.status || 'active',
		allowedUnits: product.allowedUnits || getAllowedUnits(product.measurementType),
		syncStatus: normalizeSyncState(product.syncStatus, serverId ? 'synced' : 'pending_create'),
		createdAt: product.createdAt || nowIso(),
		updatedAt: product.updatedAt || nowIso()
	}
}

const normalizeCategory = category => ({
	id: Number(category.id),
	name: category.name,
	sortOrder: Number(category.sortOrder || 0),
	status: category.status || 'active',
	createdAt: category.createdAt || null,
	updatedAt: category.updatedAt || nowIso()
})

const normalizeMerchant = merchant => {
	const serverId = toServerId(merchant.serverId ?? (isLocalId(merchant.id) ? null : merchant.id))
	const id = merchant.id || (serverId ? serverId : createLocalId('merchant'))
	return {
		id,
		localId: merchant.localId || String(id),
		serverId,
		name: String(merchant.name || '').trim(),
		status: merchant.status || 'active',
		syncStatus: normalizeSyncState(merchant.syncStatus, serverId ? 'synced' : 'pending_create'),
		createdAt: merchant.createdAt || nowIso(),
		updatedAt: merchant.updatedAt || nowIso()
	}
}

const normalizePurchase = purchase => {
	const serverId = toServerId(purchase.serverId ?? (isLocalId(purchase.id) ? null : purchase.id))
	const localId = purchase.localId || (serverId ? getServerBackedLocalId('purchase', serverId) : (purchase.id || createLocalId('purchase')))
	const syncStatus = normalizeSyncState(purchase.syncStatus, serverId ? 'synced' : 'pending_create')
	return {
		id: localId,
		localId,
		userId: purchase.userId === undefined ? null : toUserId(purchase.userId),
		serverId,
		clientMutationId: purchase.clientMutationId || localId,
		merchantId: purchase.merchantId === undefined ? null : purchase.merchantId,
		merchantServerId: purchase.merchantServerId === undefined ? toServerId(purchase.merchantId) : toServerId(purchase.merchantServerId),
		merchantName: purchase.merchantName || null,
		purchasedAt: purchase.purchasedAt,
		purchaseTime: parsePurchaseTime(purchase.purchasedAt),
		paymentType: purchase.paymentType || 'cash',
		transactionProvider: purchase.transactionProvider || null,
		transactionId: purchase.transactionId || null,
		linkedTransaction: purchase.linkedTransaction || null,
		total: Number(purchase.total) || 0,
		note: purchase.note || null,
		hasReceipt: Boolean(purchase.hasReceipt || purchase.receipt?.id),
		receipt: purchase.receipt || null,
		items: Array.isArray(purchase.items) ? purchase.items.map(item => ({
			id: item.id || createLocalId('purchase-item'),
			purchaseId: localId,
			productId: item.productId,
			productServerId: item.productServerId === undefined ? toServerId(item.productId) : toServerId(item.productServerId),
			productName: item.productName,
			categoryId: item.categoryId,
			categoryName: item.categoryName,
			measurementType: item.measurementType,
			productStatus: item.productStatus || item.status || 'active',
			quantity: Number(item.quantity),
			unit: item.unit,
			total: Number(item.total) || 0
		})) : [],
		syncStatus,
		createdAt: purchase.createdAt || nowIso(),
		updatedAt: purchase.updatedAt || nowIso()
	}
}

const isPendingLocalChange = record => ['pending_create', 'pending_update', 'pending_delete', 'syncing', 'error'].includes(record?.syncStatus)

const getPurchaseWindowKey = ({userId, dateFrom, dateTo}) => `${toUserId(userId) || 'anonymous'}:${Number(dateFrom)}:${Number(dateTo)}`

const getRangeCoverageState = (windows, dateFrom, dateTo) => {
	const sorted = windows
		.filter(window => window?.complete)
		.map(window => ({
			...window,
			dateFrom: Number(window.dateFrom),
			dateTo: Number(window.dateTo)
		}))
		.filter(window => Number.isFinite(window.dateFrom) && Number.isFinite(window.dateTo))
		.sort((a, b) => a.dateFrom - b.dateFrom || a.dateTo - b.dateTo)
	let coveredTo = null

	for (const window of sorted) {
		if (window.dateTo < dateFrom) continue
		if (coveredTo === null) {
			if (window.dateFrom > dateFrom) break
			coveredTo = window.dateTo
			continue
		}
		if (window.dateFrom > coveredTo + 1) break
		coveredTo = Math.max(coveredTo, window.dateTo)
	}

	const complete = coveredTo !== null && coveredTo >= dateTo
	const currentRange = getCurrentPurchaseRange()
	const requestEndsInCurrentMonth = getPurchaseMonthKeyFromTimestamp(dateTo) === currentRange.monthKey
	const stale = !complete && requestEndsInCurrentMonth && coveredTo !== null && coveredTo >= currentRange.dateFrom
	return {
		complete,
		available: complete || stale,
		stale
	}
}

export default class ProductCatalogLocalRepository {

	constructor({indexedDbClient = new IndexedDbClient()} = {}) {
		this.indexedDbClient = indexedDbClient
		this.indexedDbFailed = false
	}

	async getCategories({includeDisabled = false} = {}) {
		try {
			const records = await this.indexedDbClient.getAll('productCategories')
			return records
				.filter(category => includeDisabled || category.status === 'active')
				.sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder) || String(a.name).localeCompare(String(b.name), 'uk'))
				.map(clone)
		} catch (error) {
			this.indexedDbFailed = true
			console.warn('Product category cache is not readable', error)
			return []
		}
	}

	async saveCategories(categories = []) {
		try {
			await this.indexedDbClient.transaction(['productCategories'], 'readwrite', async ({put}) => {
				await Promise.all(categories.map(category => put('productCategories', normalizeCategory(category))))
			})
			notifyProductCatalogChanged({entityType: 'category', action: 'save-many'})
			return this.getCategories({includeDisabled: true})
		} catch (error) {
			this.indexedDbFailed = true
			console.warn('Product category cache is not writable', error)
			return []
		}
	}

	async getProducts({includeDisabled = false} = {}) {
		try {
			const records = await this.indexedDbClient.getAll('products')
			return records
				.filter(product => includeDisabled || product.status === 'active')
				.sort((a, b) => String(a.name).localeCompare(String(b.name), 'uk'))
				.map(clone)
		} catch (error) {
			this.indexedDbFailed = true
			console.warn('Product cache is not readable', error)
			return []
		}
	}

	async saveProducts(products = []) {
		try {
			await this.indexedDbClient.transaction(['products'], 'readwrite', async ({put}) => {
				await Promise.all(products.map(product => put('products', normalizeProduct({
					...product,
					serverId: product.serverId ?? product.id,
					syncStatus: product.syncStatus || 'synced'
				}))))
			})
			notifyProductCatalogChanged({entityType: 'product', action: 'save-many'})
			return this.getProducts({includeDisabled: true})
		} catch (error) {
			this.indexedDbFailed = true
			console.warn('Product cache is not writable', error)
			return []
		}
	}

	async saveProduct(product, {syncStatus = product.syncStatus || 'synced'} = {}) {
		const record = normalizeProduct({...product, syncStatus})
		await this.indexedDbClient.put('products', record)
		notifyProductCatalogChanged({entityType: 'product', action: 'save'})
		return clone(record)
	}

	async createLocalProduct(product) {
		return this.saveProduct({
			...product,
			id: createLocalId('product'),
			status: product.status || 'active',
			createdAt: nowIso(),
			updatedAt: nowIso()
		}, {syncStatus: 'pending'})
	}

	async searchProducts(query, {includeDisabled = false, limit = 8} = {}) {
		const needle = normalizeSearchText(query)
		if (!needle) return []
		const products = await this.getProducts({includeDisabled})
		return products
			.filter(product => normalizeSearchText(product.name).includes(needle))
			.slice(0, limit)
	}

	async getMerchants({includeDisabled = false} = {}) {
		try {
			const records = await this.indexedDbClient.getAll('merchants')
			return records
				.filter(merchant => includeDisabled || merchant.status === 'active')
				.sort((a, b) => String(a.name).localeCompare(String(b.name), 'uk'))
				.map(clone)
		} catch (error) {
			this.indexedDbFailed = true
			console.warn('Merchant cache is not readable', error)
			return []
		}
	}

	async saveMerchants(merchants = []) {
		try {
			await this.indexedDbClient.transaction(['merchants'], 'readwrite', async ({put}) => {
				await Promise.all(merchants.map(merchant => put('merchants', normalizeMerchant({
					...merchant,
					serverId: merchant.serverId ?? merchant.id,
					syncStatus: merchant.syncStatus || 'synced'
				}))))
			})
			notifyProductCatalogChanged({entityType: 'merchant', action: 'save-many'})
			return this.getMerchants({includeDisabled: true})
		} catch (error) {
			this.indexedDbFailed = true
			console.warn('Merchant cache is not writable', error)
			return []
		}
	}

	async saveMerchant(merchant, {syncStatus = merchant.syncStatus || 'synced'} = {}) {
		const record = normalizeMerchant({...merchant, syncStatus})
		await this.indexedDbClient.put('merchants', record)
		notifyProductCatalogChanged({entityType: 'merchant', action: 'save'})
		return clone(record)
	}

	async getPurchases() {
		try {
			const records = await this.indexedDbClient.getAll('purchases')
			const normalized = await this.normalizeStoredPurchases(records)
			return normalized
				.filter(purchase => purchase.syncStatus !== 'pending_delete')
				.sort((a, b) => String(b.purchasedAt).localeCompare(String(a.purchasedAt)) || String(b.id).localeCompare(String(a.id)))
				.map(clone)
		} catch (error) {
			this.indexedDbFailed = true
			console.warn('Purchase cache is not readable', error)
			return []
		}
	}

	async getPurchasesByRange(userId, dateFrom, dateTo) {
		const range = normalizePurchaseRange({dateFrom, dateTo}, {normalizeTimestamps: false})
		const requestedUserId = toUserId(userId)
		try {
			const records = await this.indexedDbClient.getAll('purchases')
			const normalized = await this.normalizeStoredPurchases(records)
			return normalized
				.filter(purchase => !requestedUserId || !purchase.userId || Number(purchase.userId) === requestedUserId)
				.filter(purchase => purchase.syncStatus !== 'pending_delete')
				.filter(purchase => {
					const time = parsePurchaseTime(purchase.purchasedAt)
					return time !== null && time >= range.dateFrom && time <= range.dateTo
				})
				.sort((a, b) => String(b.purchasedAt).localeCompare(String(a.purchasedAt)) || String(b.id).localeCompare(String(a.id)))
				.map(clone)
		} catch (error) {
			this.indexedDbFailed = true
			console.warn('Purchase range cache is not readable', error)
			return []
		}
	}

	async getPurchaseCoverage(userId, dateFrom, dateTo) {
		const range = normalizePurchaseRange({dateFrom, dateTo}, {normalizeTimestamps: false})
		const requestedUserId = toUserId(userId)
		try {
			const windows = (await this.indexedDbClient.getAll('purchaseWindows'))
				.filter(window => window?.complete)
				.filter(window => Number(window.userId || 0) === Number(requestedUserId || 0))
				.filter(window => Number(window.dateFrom) <= range.dateTo && Number(window.dateTo) >= range.dateFrom)
			const coverageState = getRangeCoverageState(windows, range.dateFrom, range.dateTo)
			return {
				status: coverageState.complete ? 'complete' : (coverageState.stale ? 'stale_current_month' : (windows.length ? 'partial' : 'not_fetched')),
				complete: coverageState.complete,
				available: coverageState.available,
				stale: coverageState.stale,
				windows: windows.map(clone)
			}
		} catch (error) {
			this.indexedDbFailed = true
			console.warn('Purchase coverage is not readable', error)
			return {status: 'not_fetched', complete: false, available: false, stale: false, windows: []}
		}
	}

	async touchPurchaseCoverage(userId, dateFrom, dateTo) {
		const coverage = await this.getPurchaseCoverage(userId, dateFrom, dateTo)
		if (!coverage.complete) return coverage
		const now = Date.now()
		await this.indexedDbClient.transaction(['purchaseWindows'], 'readwrite', async ({put}) => {
			for (const window of coverage.windows) {
				await put('purchaseWindows', {...window, lastAccessedAt: now})
			}
		})
		return this.getPurchaseCoverage(userId, dateFrom, dateTo)
	}

	async getPurchase(id) {
		try {
			const record = await this.indexedDbClient.get('purchases', id)
			if (record) return clone(normalizePurchase(record))
			const serverId = toServerId(id)
			if (!serverId) return null
			const purchases = await this.getPurchases()
			return purchases.find(purchase => Number(purchase.serverId) === serverId) || null
		} catch (error) {
			this.indexedDbFailed = true
			console.warn('Purchase cache item is not readable', error)
			return null
		}
	}

	async normalizeStoredPurchases(records = []) {
		const byId = new Map()
		const obsoleteKeys = []
		records.forEach(record => {
			const normalized = normalizePurchase(record)
			if (record.id !== normalized.id) obsoleteKeys.push(record.id)
			const existing = byId.get(normalized.id)
			if (!existing || isPendingLocalChange(existing)) byId.set(normalized.id, normalized)
		})

		if (obsoleteKeys.length) {
			await this.indexedDbClient.transaction(['purchases'], 'readwrite', async ({put, delete: deleteRecord}) => {
				for (const record of byId.values()) await put('purchases', record)
				for (const key of obsoleteKeys) await deleteRecord('purchases', key)
			})
		}

		return Array.from(byId.values())
	}

	async mergeServerPurchases(purchases = [], {userId = null, range = null, markComplete = false, monthKey = null} = {}) {
		try {
			await this.indexedDbClient.transaction(['purchases', 'purchaseWindows'], 'readwrite', async ({getAll, put, delete: deleteRecord}) => {
				const localRecords = (await getAll('purchases')).map(record => normalizePurchase(record))
				const localByServerId = new Map()
				const localById = new Map()
				localRecords.forEach(record => {
					localById.set(String(record.id), record)
					if (record.serverId) localByServerId.set(String(record.serverId), record)
				})

				for (const serverPurchase of purchases) {
					const serverRecord = normalizePurchase({
						...serverPurchase,
						userId: toUserId(userId) || serverPurchase.userId || null,
						serverId: serverPurchase.serverId ?? serverPurchase.id,
						syncStatus: 'synced'
					})
					const existing = localByServerId.get(String(serverRecord.serverId))
					if (existing?.syncStatus === 'pending_delete') continue
					if (existing && ['pending_update', 'syncing', 'error'].includes(existing.syncStatus)) continue

					const next = existing
						? normalizePurchase({
							...serverRecord,
							id: existing.id,
							localId: existing.localId,
							clientMutationId: existing.clientMutationId,
							items: serverRecord.items.length ? serverRecord.items : existing.items
						})
						: serverRecord

					await put('purchases', next)
					localById.set(String(next.id), next)
				}

				const activeIds = new Set(Array.from(localById.values()).map(record => String(record.id)))
				for (const record of localRecords) {
					const normalizedId = normalizePurchase(record).id
					if (String(record.id) !== String(normalizedId) && activeIds.has(String(normalizedId))) {
						await deleteRecord('purchases', record.id)
					}
				}

				if (markComplete && range) {
					const normalizedRange = normalizePurchaseRange(range, {normalizeTimestamps: false})
					const fetchedAt = Date.now()
					await put('purchaseWindows', {
						windowKey: getPurchaseWindowKey({userId, ...normalizedRange}),
						userId: toUserId(userId),
						dateFrom: normalizedRange.dateFrom,
						dateTo: normalizedRange.dateTo,
						monthKey: monthKey || getPurchaseMonthKeyFromTimestamp(normalizedRange.dateFrom),
						fetchedAt,
						lastAccessedAt: fetchedAt,
						source: 'api',
						complete: true,
						itemCount: purchases.length
					})
				}
			})
			notifyProductCatalogChanged({entityType: 'purchase', action: 'merge-server'})
			return range ? this.getPurchasesByRange(userId, range.dateFrom, range.dateTo) : this.getPurchases()
		} catch (error) {
			this.indexedDbFailed = true
			console.warn('Purchase cache is not writable', error)
			return []
		}
	}

	async savePurchases(purchases = []) {
		return this.mergeServerPurchases(purchases)
	}

	async savePurchase(purchase, {syncStatus = purchase.syncStatus || 'synced', userId = purchase.userId ?? null} = {}) {
		const id = purchase.localId || purchase.id || createLocalId('purchase')
		const record = normalizePurchase({
			...purchase,
			userId: toUserId(userId) || purchase.userId || null,
			id,
			localId: id,
			syncStatus,
			createdAt: purchase.createdAt || nowIso(),
			updatedAt: nowIso(),
			items: (purchase.items || []).map(item => ({...item, purchaseId: id}))
		})
		await this.indexedDbClient.put('purchases', record)
		notifyProductCatalogChanged({entityType: 'purchase', action: 'save'})
		return clone(record)
	}

	async markPurchaseSynced(localId, serverPurchase) {
		const current = await this.getPurchase(localId)
		const record = normalizePurchase({
			...(serverPurchase || {}),
			userId: current?.userId || serverPurchase?.userId || null,
			id: current?.id || localId,
			localId: current?.localId || localId,
			clientMutationId: current?.clientMutationId || localId,
			serverId: serverPurchase?.serverId ?? serverPurchase?.id,
			syncStatus: 'synced'
		})
		await this.indexedDbClient.put('purchases', record)
		notifyProductCatalogChanged({entityType: 'purchase', action: 'mark-synced'})
		return clone(record)
	}

	async markPurchaseDeleted(localId) {
		await this.indexedDbClient.delete('purchases', localId)
		notifyProductCatalogChanged({entityType: 'purchase', action: 'delete'})
		return true
	}

	async cleanupPurchaseCache({userId = null, now = new Date(), optionalMonthLimit = 3} = {}) {
		const requestedUserId = toUserId(userId)
		try {
			const guaranteed = getGuaranteedPurchaseMonthRanges(now).map(range => range.monthKey)
			const windows = (await this.indexedDbClient.getAll('purchaseWindows'))
				.filter(window => window?.complete)
				.filter(window => Number(window.userId || 0) === Number(requestedUserId || 0))
			const optional = windows
				.filter(window => window.monthKey && !guaranteed.includes(window.monthKey))
				.sort((a, b) => Number(b.lastAccessedAt || b.fetchedAt || 0) - Number(a.lastAccessedAt || a.fetchedAt || 0))
				.slice(0, optionalMonthLimit)
				.map(window => window.monthKey)
			const retainedMonths = new Set([...guaranteed, ...optional])

			let removed = 0
			await this.indexedDbClient.transaction(['purchases', 'purchaseWindows', 'syncQueue'], 'readwrite', async ({getAll, delete: deleteRecord}) => {
				const queue = await getAll('syncQueue').catch(() => [])
				const protectedPurchaseIds = new Set(queue
					.filter(operation => operation.entityType === 'purchase')
					.filter(operation => ['pending', 'syncing', 'error', 'paused'].includes(operation.status))
					.map(operation => String(operation.entityLocalId)))
				const purchases = (await getAll('purchases')).map(record => normalizePurchase(record))
				for (const purchase of purchases) {
					if (requestedUserId && purchase.userId && Number(purchase.userId) !== requestedUserId) continue
					if (isPendingLocalChange(purchase)) continue
					if (protectedPurchaseIds.has(String(purchase.id))) continue
					const time = parsePurchaseTime(purchase.purchasedAt)
					const monthKey = getPurchaseMonthKeyFromTimestamp(time)
					if (!monthKey || retainedMonths.has(monthKey)) continue
					await deleteRecord('purchases', purchase.id)
					removed += 1
				}
				for (const window of windows) {
					if (!window.monthKey || retainedMonths.has(window.monthKey)) continue
					await deleteRecord('purchaseWindows', window.windowKey)
				}
			})
			if (removed) notifyProductCatalogChanged({entityType: 'purchase', action: 'cleanup-cache'})
			return {removed, retainedMonths: Array.from(retainedMonths)}
		} catch (error) {
			this.indexedDbFailed = true
			console.warn('Purchase cache cleanup failed', error)
			return {removed: 0, retainedMonths: []}
		}
	}

	async replaceProductLocalId(localId, serverProduct) {
		const existing = await this.indexedDbClient.get('products', localId)
		const saved = normalizeProduct({
			...(serverProduct || {}),
			id: serverProduct?.id,
			serverId: serverProduct?.serverId ?? serverProduct?.id,
			localId: String(serverProduct?.id),
			syncStatus: 'synced'
		})

		await this.indexedDbClient.transaction(['products', 'purchases'], 'readwrite', async ({getAll, put, delete: deleteRecord}) => {
			await put('products', saved)
			if (existing) await deleteRecord('products', localId)
			const purchases = await getAll('purchases')
			for (const purchase of purchases) {
				const nextItems = (purchase.items || []).map(item => String(item.productId) === String(localId)
					? {...item, productId: saved.id, productServerId: saved.serverId}
					: item)
				if (JSON.stringify(nextItems) !== JSON.stringify(purchase.items || [])) {
					await put('purchases', normalizePurchase({...purchase, items: nextItems}))
				}
			}
		})
		notifyProductCatalogChanged({entityType: 'product', action: 'replace-local-id'})
		return clone(saved)
	}

	async replaceMerchantLocalId(localId, serverMerchant) {
		const existing = await this.indexedDbClient.get('merchants', localId)
		const saved = normalizeMerchant({
			...(serverMerchant || {}),
			id: serverMerchant?.id,
			serverId: serverMerchant?.serverId ?? serverMerchant?.id,
			localId: String(serverMerchant?.id),
			syncStatus: 'synced'
		})

		await this.indexedDbClient.transaction(['merchants', 'purchases'], 'readwrite', async ({getAll, put, delete: deleteRecord}) => {
			await put('merchants', saved)
			if (existing) await deleteRecord('merchants', localId)
			const purchases = await getAll('purchases')
			for (const purchase of purchases) {
				if (String(purchase.merchantId || '') !== String(localId)) continue
				await put('purchases', normalizePurchase({
					...purchase,
					merchantId: saved.id,
					merchantServerId: saved.serverId,
					merchantName: saved.name
				}))
			}
		})
		notifyProductCatalogChanged({entityType: 'merchant', action: 'replace-local-id'})
		return clone(saved)
	}
}

export {
	createLocalId,
	getGuaranteedPurchaseMonthRanges,
	isLocalId,
	normalizeProduct,
	normalizePurchase,
	normalizeSearchText,
	toServerId
}
