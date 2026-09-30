import api from '../mixins/apiQueriesHelper.js'
import {API_AUTH_STATUS, getAuthState, subscribeAuthState} from './AuthSession.js'
import networkStatusService from './NetworkStatusService.js'
import ProductCatalogLocalRepository, {isLocalId, toServerId} from './ProductCatalogLocalRepository.js'
import ProductCatalogSyncQueue from './ProductCatalogSyncQueue.js'
import {setState as setSyncState} from './ProductCatalogSyncState.js'
import ReceiptLocalRepository from './ReceiptLocalRepository.js'
import ReceiptApiService from './ReceiptApiService.js'

const hasUsableApiAuth = () => {
	const authState = getAuthState()
	if (!authState?.token || !authState?.user?.id) return false
	return authState.apiAuthStatus !== API_AUTH_STATUS.REJECTED
}

const toApiProduct = product => ({
	name: product.name,
	category_id: product.categoryId,
	measurement_type: product.measurementType,
	status: product.status || 'active'
})

const toApiMerchant = merchant => ({name: merchant.name})

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

export default class ProductCatalogSyncService {
	constructor({
		localRepository = new ProductCatalogLocalRepository(),
		queue = new ProductCatalogSyncQueue(),
		receiptLocalRepository = new ReceiptLocalRepository({indexedDbClient: queue.indexedDbClient}),
		receiptApiService = new ReceiptApiService(),
		autoRegisterSyncTriggers = true
	} = {}) {
		this.localRepository = localRepository
		this.queue = queue
		this.receiptLocalRepository = receiptLocalRepository
		this.receiptApiService = receiptApiService
		this.syncPromise = null
		this.syncDebounce = null
		this.unsubscribeNetworkStatus = null
		this.unsubscribeAuthStatus = null
		if (autoRegisterSyncTriggers) this.registerSyncTriggers()
	}

	registerSyncTriggers() {
		if (typeof window === 'undefined') return
		let previousNetwork = networkStatusService.getState().network
		this.unsubscribeNetworkStatus = networkStatusService.subscribe(state => {
			if (previousNetwork === 'offline' && state.network === 'online') this.handleRecoverySignal('online')
			previousNetwork = state.network
		})
		window.addEventListener('focus', () => this.handleRecoverySignal('focus'))
		if (typeof document !== 'undefined') {
			document.addEventListener('visibilitychange', () => {
				if (document.visibilityState === 'visible') this.handleRecoverySignal('visible')
			})
		}
		let previousApiAuthStatus = getAuthState()?.apiAuthStatus || API_AUTH_STATUS.UNKNOWN
		this.unsubscribeAuthStatus = subscribeAuthState(authState => {
			const nextApiAuthStatus = authState?.apiAuthStatus || API_AUTH_STATUS.UNKNOWN
			if (previousApiAuthStatus === API_AUTH_STATUS.REJECTED && nextApiAuthStatus === API_AUTH_STATUS.AUTHENTICATED) {
				this.handleRecoverySignal('auth-restored')
			}
			previousApiAuthStatus = nextApiAuthStatus
		})
	}

	handleRecoverySignal(reason = 'recovery') {
		if (this.syncDebounce) clearTimeout(this.syncDebounce)
		this.syncDebounce = setTimeout(() => {
			this.syncDebounce = null
			this.processQueue({force: true, reason}).catch(() => {})
		}, 100)
	}

	async enqueueMutation({entityType, entityLocalId, action, reason = 'local-change'} = {}) {
		const operation = await this.queue.enqueue({entityType, entityLocalId, action, reason})
		await this.refreshState()
		this.scheduleProcess({reason})
		return operation
	}

	scheduleProcess({reason = 'local-change', delay = 300} = {}) {
		if (this.syncDebounce) clearTimeout(this.syncDebounce)
		if (networkStatusService.isOffline()) {
			this.refreshState('offline').catch(() => {})
			return
		}
		this.syncDebounce = setTimeout(() => {
			this.syncDebounce = null
			this.processQueue({reason}).catch(() => {})
		}, delay)
	}

	async refreshState(status = null, error = null) {
		const pending = await this.queue.getPendingOperations()
		const syncStatus = status || (pending.length ? 'pending' : 'synced')
		setSyncState({
			syncStatus,
			pendingCount: pending.length,
			syncError: error,
			lastSuccessfulSyncAt: pending.length ? null : Date.now()
		})
		return pending
	}

	async processQueue({force = false, reason = 'autosync'} = {}) {
		if (this.syncPromise) return this.syncPromise
		if (networkStatusService.isOffline()) {
			await this.refreshState('offline')
			return false
		}
		if (!hasUsableApiAuth()) {
			await this.refreshState('paused')
			return false
		}
		this.syncPromise = this.processQueueInternal({force, reason}).finally(() => {
			this.syncPromise = null
		})
		return this.syncPromise
	}

	async processQueueInternal({force = false, reason = 'autosync'} = {}) {
		let operations = await this.queue.getPendingOperations()
		await this.refreshState(operations.length ? 'syncing' : 'synced')

		for (const operation of operations) {
			if (operation.status === 'paused') {
				if (!force || !hasUsableApiAuth()) {
					await this.refreshState('paused', operation.lastError)
					return false
				}
				await this.queue.resumePaused(operation, {reason})
			}
			if (!force && operation.nextAttemptAt && Number(operation.nextAttemptAt) > Date.now()) continue

			const syncing = await this.queue.markSyncing(operation)
			try {
				const completed = await this.processOperation(syncing)
				if (completed) await this.queue.complete(syncing)
			} catch (error) {
				const failed = await this.queue.markError(syncing, error)
				await this.refreshState(failed.status, error)
				return false
			}
		}

		await this.refreshState()
		return true
	}

	async processOperation(operation) {
		if (operation.action === 'cancel_create') {
			if (operation.entityType === 'purchase') await this.localRepository.markPurchaseDeleted(operation.entityLocalId)
			return true
		}
		if (operation.entityType === 'product') return this.processProduct(operation)
		if (operation.entityType === 'merchant') return this.processMerchant(operation)
		if (operation.entityType === 'purchase') return this.processPurchase(operation)
		if (operation.entityType === 'receipt') return this.processReceipt(operation)
		return true
	}

	async processProduct(operation) {
		const product = (await this.localRepository.getProducts({includeDisabled: true}))
			.find(item => String(item.id) === String(operation.entityLocalId))
		if (!product) return true
		if (operation.action === 'create') {
			const saved = await api.post('/products', toApiProduct(product))
			await this.localRepository.replaceProductLocalId(product.id, saved)
			return true
		}
		if (product.serverId) {
			const saved = await api.put(`/products/${encodeURIComponent(product.serverId)}`, toApiProduct(product))
			await this.localRepository.saveProduct({...saved, serverId: saved.id, syncStatus: 'synced'})
		}
		return true
	}

	async processMerchant(operation) {
		const merchant = (await this.localRepository.getMerchants({includeDisabled: true}))
			.find(item => String(item.id) === String(operation.entityLocalId))
		if (!merchant) return true
		if (operation.action === 'create') {
			const saved = await api.post('/merchants', toApiMerchant(merchant))
			await this.localRepository.replaceMerchantLocalId(merchant.id, saved)
			return true
		}
		return true
	}

	async processPurchase(operation) {
		const purchase = await this.localRepository.getPurchase(operation.entityLocalId)
		if (!purchase) return true
		if (operation.action === 'delete') {
			if (!purchase.serverId) {
				await this.localRepository.markPurchaseDeleted(purchase.id)
				return true
			}
			await api.delete(`/purchases/${encodeURIComponent(purchase.serverId)}`)
			await this.localRepository.markPurchaseDeleted(purchase.id)
			return true
		}

		this.assertPurchaseDependenciesReady(purchase)
		if (operation.action === 'create' || !purchase.serverId) {
			const saved = await api.post('/purchases', toApiPurchase(purchase))
			await this.localRepository.markPurchaseSynced(purchase.id, saved)
			await this.receiptLocalRepository.updateServerPurchaseId(purchase.id, saved.id).catch(() => null)
			return true
		}
		const saved = await api.put(`/purchases/${encodeURIComponent(purchase.serverId)}`, toApiPurchase(purchase))
		await this.localRepository.markPurchaseSynced(purchase.id, saved)
		await this.receiptLocalRepository.updateServerPurchaseId(purchase.id, saved.id).catch(() => null)
		return true
	}

	async processReceipt(operation) {
		const receipt = await this.receiptLocalRepository.getByLocalId(operation.entityLocalId, {includeDeleted: true})
			|| await this.receiptLocalRepository.getByPurchaseLocalId(operation.entityLocalId, {includeDeleted: true})
		if (!receipt) return true
		if (!receipt.purchaseLocalId) return this.processStandaloneReceipt(operation, receipt)
		const purchase = await this.localRepository.getPurchase(receipt.purchaseLocalId)
		const purchaseServerId = toServerId(receipt.purchaseServerId || purchase?.serverId)
		if (!purchaseServerId) {
			throw new Error('Receipt sync is waiting for purchase sync')
		}

		if (operation.action === 'delete' || receipt.syncStatus === 'pending_delete') {
			await this.receiptApiService.deleteReceipt(purchaseServerId)
			await this.receiptLocalRepository.markDeleted(receipt.localId)
			return true
		}

		if (!receipt.blob) throw new Error('Receipt image is missing locally')
		const saved = await this.receiptApiService.uploadReceipt(purchaseServerId, {
			...receipt,
			purchaseServerId
		})
		await this.receiptLocalRepository.markSynced(receipt.localId, saved)
		return true
	}

	async processStandaloneReceipt(operation, receipt) {
		if (operation.action === 'delete' || receipt.syncStatus === 'pending_delete') {
			if (receipt.serverReceiptId) await this.receiptApiService.deleteStandaloneReceipt(receipt.serverReceiptId)
			await this.receiptLocalRepository.markDeleted(receipt.localId)
			return true
		}
		if (!receipt.blob) throw new Error('Receipt image is missing locally')
		const saved = await this.receiptApiService.uploadStandaloneReceipt(receipt)
		await this.receiptLocalRepository.markSynced(receipt.localId, saved)
		return true
	}

	assertPurchaseDependenciesReady(purchase) {
		if (purchase.merchantId && isLocalId(purchase.merchantId)) {
			throw new Error('Purchase sync is waiting for merchant sync')
		}
		for (const item of purchase.items || []) {
			if (!toServerId(item.productServerId ?? item.productId)) {
				throw new Error('Purchase sync is waiting for product sync')
			}
		}
		return true
	}
}

const productCatalogSyncService = new ProductCatalogSyncService()

export {productCatalogSyncService, toApiPurchase}
