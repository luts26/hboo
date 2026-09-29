import api from '../mixins/apiQueriesHelper.js'
import ProductCatalogLocalRepository, {isLocalId, toServerId} from './ProductCatalogLocalRepository.js'
import {productCatalogSyncService} from './ProductCatalogSyncService.js'
import {getAuthenticatedUserId} from './AuthSession.js'
import networkStatusService from './NetworkStatusService.js'
import {
	getCurrentPurchaseRange,
	getGuaranteedPurchaseMonthRanges,
	normalizePurchaseRange
} from './PurchaseDateRange.js'

const toApiPurchase = purchase => ({
	client_mutation_id: purchase.clientMutationId || purchase.localId || purchase.id,
	merchant_id: toServerId(purchase.merchantServerId ?? purchase.merchantId),
	purchased_at: purchase.purchasedAt,
	payment_type: purchase.paymentType,
	transaction_provider: purchase.transactionProvider || null,
	transaction_id: purchase.transactionId || null,
	note: purchase.note || null,
	items: (purchase.items || []).map(item => ({
		product_id: toServerId(item.productServerId ?? item.productId),
		quantity: Number(item.quantity),
		unit: item.unit,
		total: Number(item.total)
	}))
})

const PURCHASE_COVERAGE_TTL_MS = 15 * 60 * 1000

const getDefaultPurchaseRange = getCurrentPurchaseRange

const buildPurchaseQuery = range => {
	const params = new URLSearchParams()
	if (Number.isFinite(Number(range?.dateFrom))) params.set('date_from', String(Number(range.dateFrom)))
	if (Number.isFinite(Number(range?.dateTo))) params.set('date_to', String(Number(range.dateTo)))
	const query = params.toString()
	return query ? `?${query}` : ''
}

export default class ProductCatalogApiService {

	constructor(localRepository = new ProductCatalogLocalRepository(), syncService = productCatalogSyncService) {
		this.localRepository = localRepository
		this.syncService = syncService
	}

	getUserId() {
		return getAuthenticatedUserId()
	}

	async loadCatalog({refresh = true} = {}) {
		const cached = {
			categories: await this.localRepository.getCategories(),
			products: await this.localRepository.getProducts(),
			merchants: await this.localRepository.getMerchants()
		}

		if (cached.categories.length && cached.products.length && !refresh) return cached

		try {
			const [categories, products, merchants] = await Promise.all([
				api.get('/product-categories'),
				api.get('/products?includeDisabled=true'),
				api.get('/merchants')
			])
			await Promise.all([
				this.localRepository.saveCategories(categories),
				this.localRepository.saveProducts(products),
				this.localRepository.saveMerchants(merchants)
			])
			return {
				categories: await this.localRepository.getCategories(),
				products: await this.localRepository.getProducts({includeDisabled: true}),
				merchants: await this.localRepository.getMerchants({includeDisabled: true}),
				source: 'api'
			}
		} catch (error) {
			return {...cached, source: 'cache', error}
		}
	}

	async loadPurchases({refresh = true, range = getDefaultPurchaseRange(), allowOfflineIncomplete = false} = {}) {
		const result = await this.loadPurchasesByRange({refresh, range, allowOfflineIncomplete})
		return result.purchases
	}

	async loadPurchasesByRange({refresh = true, range = getDefaultPurchaseRange(), allowOfflineIncomplete = false} = {}) {
		const normalizedRange = normalizePurchaseRange(range, {normalizeTimestamps: false})
		const userId = this.getUserId()
		const coverage = await this.localRepository.getPurchaseCoverage(userId, normalizedRange.dateFrom, normalizedRange.dateTo)
		const cached = await this.localRepository.getPurchasesByRange(userId, normalizedRange.dateFrom, normalizedRange.dateTo)
		const newestFetch = coverage.windows.reduce((latest, window) => Math.max(latest, Number(window.fetchedAt) || 0), 0)
		const fresh = coverage.complete && newestFetch && Date.now() - newestFetch < PURCHASE_COVERAGE_TTL_MS
		const locallyAvailable = coverage.complete || coverage.available || cached.length > 0

		if (locallyAvailable && (!refresh || fresh || networkStatusService.isOffline())) {
			await this.localRepository.touchPurchaseCoverage(userId, normalizedRange.dateFrom, normalizedRange.dateTo)
			return {purchases: cached, coverage, source: 'cache', unavailableOffline: false}
		}

		if (networkStatusService.isOffline()) {
			return {
				purchases: locallyAvailable || allowOfflineIncomplete ? cached : [],
				coverage,
				source: 'cache',
				unavailableOffline: !locallyAvailable
			}
		}

		try {
			const purchases = await api.get(`/purchases${buildPurchaseQuery(normalizedRange)}`)
			const merged = await this.localRepository.mergeServerPurchases(purchases, {
				userId,
				range: normalizedRange,
				markComplete: true,
				monthKey: range.monthKey || null
			})
			await this.localRepository.cleanupPurchaseCache({userId})
			const nextCoverage = await this.localRepository.getPurchaseCoverage(userId, normalizedRange.dateFrom, normalizedRange.dateTo)
			return {purchases: merged, coverage: nextCoverage, source: 'api', unavailableOffline: false}
		} catch (error) {
			if (locallyAvailable || allowOfflineIncomplete) {
				return {purchases: cached, coverage, source: 'cache', error, unavailableOffline: false}
			}
			return {purchases: [], coverage, source: 'cache', error, unavailableOffline: true}
		}
	}

	async hydrateGuaranteedPurchaseWindow({refresh = true, now = new Date()} = {}) {
		const ranges = getGuaranteedPurchaseMonthRanges(now)
		const results = []
		for (const range of ranges) {
			results.push(await this.loadPurchasesByRange({refresh, range}))
		}
		return results
	}

	async getPurchase(id) {
		const cached = await this.localRepository.getPurchase(id)
		if (cached) return cached

		const purchase = await api.get(`/purchases/${encodeURIComponent(id)}`)
		await this.localRepository.mergeServerPurchases([purchase])
		return this.localRepository.getPurchase(id)
	}

	async createProduct(product) {
		const localProduct = await this.localRepository.createLocalProduct(product)
		await this.syncService.enqueueMutation({
			entityType: 'product',
			entityLocalId: localProduct.id,
			action: 'create',
			reason: 'product-create'
		})
		return localProduct
	}

	async updateProduct(product) {
		const localProduct = await this.localRepository.saveProduct(product, {
			syncStatus: isLocalId(product.id) || !product.serverId ? 'pending_create' : 'pending_update'
		})
		await this.syncService.enqueueMutation({
			entityType: 'product',
			entityLocalId: localProduct.id,
			action: isLocalId(localProduct.id) || !localProduct.serverId ? 'create' : 'update',
			reason: 'product-update'
		})
		return localProduct
	}

	async createMerchant(name) {
		const localMerchant = await this.localRepository.saveMerchant({name, status: 'active'}, {syncStatus: 'pending_create'})
		await this.syncService.enqueueMutation({
			entityType: 'merchant',
			entityLocalId: localMerchant.id,
			action: 'create',
			reason: 'merchant-create'
		})
		return localMerchant
	}

	async savePurchase(purchase) {
		const localPurchase = await this.localRepository.savePurchase(purchase, {
			syncStatus: purchase.serverId || (!isLocalId(purchase.id) && toServerId(purchase.id)) ? 'pending_update' : 'pending_create',
			userId: this.getUserId()
		})
		await this.syncService.enqueueMutation({
			entityType: 'purchase',
			entityLocalId: localPurchase.id,
			action: localPurchase.serverId ? 'update' : 'create',
			reason: 'purchase-save'
		})
		return localPurchase
	}

	async deletePurchase(purchase) {
		const localPurchase = typeof purchase === 'string' ? await this.localRepository.getPurchase(purchase) : purchase
		if (!localPurchase) return false
		if (localPurchase.syncStatus === 'pending_create' && !localPurchase.serverId) {
			await this.localRepository.markPurchaseDeleted(localPurchase.id)
			await this.syncService.enqueueMutation({
				entityType: 'purchase',
				entityLocalId: localPurchase.id,
				action: 'delete',
				reason: 'purchase-delete'
			})
			return true
		}
		await this.localRepository.savePurchase(localPurchase, {syncStatus: 'pending_delete'})
		await this.syncService.enqueueMutation({
			entityType: 'purchase',
			entityLocalId: localPurchase.id,
			action: 'delete',
			reason: 'purchase-delete'
		})
		return true
	}
}

export {getDefaultPurchaseRange, isLocalId, toApiPurchase}
