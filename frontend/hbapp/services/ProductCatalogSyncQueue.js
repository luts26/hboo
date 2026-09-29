import {getAuthenticatedUserId} from './AuthSession.js'
import IndexedDbClient from './IndexedDbClient.js'

const OPERATION_TYPE = 'productCatalog.mutation'
const MAX_BACKOFF_MS = 5 * 60 * 1000
const BASE_BACKOFF_MS = 5000

const getBackoffDelay = attempts => {
	const retry = Math.max(1, Number(attempts) || 1)
	return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * (2 ** (retry - 1)))
}

const getOperationId = ({entityType, entityLocalId}) => `${OPERATION_TYPE}:${entityType}:${entityLocalId}`

export default class ProductCatalogSyncQueue {
	constructor(indexedDbClient = new IndexedDbClient()) {
		this.indexedDbClient = indexedDbClient
	}

	getUserId() {
		return getAuthenticatedUserId()
	}

	async enqueue({entityType, entityLocalId, action, reason = 'local-change'} = {}) {
		const userId = this.getUserId()
		if (!entityType || !entityLocalId || !action) return null
		const operationId = getOperationId({entityType, entityLocalId})
		const existing = await this.indexedDbClient.get('syncQueue', operationId).catch(() => null)
		const now = Date.now()
		const nextAction = this.coalesceAction(existing?.action, action)
		const operation = {
			...(existing || {}),
			operationId,
			type: OPERATION_TYPE,
			entityType,
			entityLocalId,
			userId: userId ? Number(userId) : null,
			action: nextAction,
			status: 'pending',
			reason,
			attempts: existing?.status === 'error' ? Number(existing.attempts) || 0 : 0,
			lastError: null,
			createdAt: existing?.createdAt || now,
			updatedAt: now,
			nextAttemptAt: now
		}
		await this.indexedDbClient.put('syncQueue', operation)
		return operation
	}

	coalesceAction(previous, next) {
		if (previous === 'create' && next === 'update') return 'create'
		if (previous === 'create' && next === 'delete') return 'cancel_create'
		if (next === 'delete') return 'delete'
		if (previous === 'create') return 'create'
		return next
	}

	async getPendingOperations() {
		const records = await this.indexedDbClient.getAll('syncQueue').catch(() => [])
		return records
			.filter(record => record.type === OPERATION_TYPE)
			.filter(record => ['pending', 'error', 'paused'].includes(record.status))
			.sort((left, right) => {
				const rank = {product: 1, merchant: 2, purchase: 3}
				return (rank[left.entityType] || 9) - (rank[right.entityType] || 9)
					|| Number(left.createdAt || 0) - Number(right.createdAt || 0)
			})
	}

	async markSyncing(operation) {
		const next = {...operation, status: 'syncing', startedAt: Date.now(), updatedAt: Date.now(), lastError: null}
		await this.indexedDbClient.put('syncQueue', next)
		return next
	}

	async resumePaused(operation, {reason = 'auth-restored'} = {}) {
		const next = {...operation, status: 'pending', reason, lastError: null, updatedAt: Date.now(), nextAttemptAt: Date.now()}
		await this.indexedDbClient.put('syncQueue', next)
		return next
	}

	async markError(operation, error) {
		const attempts = (Number(operation.attempts) || 0) + 1
		const status = this.getFailureStatus(error)
		const now = Date.now()
		const next = {
			...operation,
			status,
			attempts,
			lastError: {
				message: error?.message || 'Product catalog sync failed',
				status: error?.status || error?.statusCode || null,
				at: now
			},
			updatedAt: now,
			nextAttemptAt: status === 'error' ? now + getBackoffDelay(attempts) : null
		}
		await this.indexedDbClient.put('syncQueue', next)
		return next
	}

	async complete(operation) {
		await this.indexedDbClient.delete('syncQueue', operation.operationId)
		return true
	}

	getFailureStatus(error) {
		const status = Number(error?.status || error?.statusCode)
		if (status === 401 || status === 403) return 'paused'
		return 'error'
	}
}

export {OPERATION_TYPE as PRODUCT_CATALOG_SYNC_OPERATION_TYPE}
