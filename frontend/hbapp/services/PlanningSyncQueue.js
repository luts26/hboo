import {getAuthenticatedUserId} from './AuthSession.js'
import IndexedDbClient from './IndexedDbClient.js'

const OPERATION_TYPE = 'planning.syncState'
const ENTITY_TYPE = 'planning'
const MAX_BACKOFF_MS = 5 * 60 * 1000
const BASE_BACKOFF_MS = 5000

const getOperationId = userId => `${OPERATION_TYPE}:user:${Number(userId)}`

const getBackoffDelay = attempts => {
	const retry = Math.max(1, Number(attempts) || 1)
	return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * (2 ** (retry - 1)))
}

export default class PlanningSyncQueue {

	constructor(indexedDbClient = new IndexedDbClient()) {
		this.indexedDbClient = indexedDbClient
	}

	getUserId() {
		return getAuthenticatedUserId()
	}

	getOperationId(userId = this.getUserId()) {
		return userId ? getOperationId(userId) : null
	}

	async getOperation(userId = this.getUserId()) {
		const operationId = this.getOperationId(userId)
		if (!operationId) return null

		try {
			await this.indexedDbClient.openDatabase()
			return await this.indexedDbClient.get('syncQueue', operationId)
		} catch (error) {
			console.warn('Planning sync queue is not readable', error)
			return null
		}
	}

	async enqueue({reason = 'local-change'} = {}) {
		const userId = this.getUserId()
		const operationId = this.getOperationId(userId)
		if (!operationId) return null

		try {
			await this.indexedDbClient.openDatabase()
			const existing = await this.indexedDbClient.get('syncQueue', operationId)
			if (existing?.status === 'conflict') return existing

			const now = Date.now()
			const operation = {
				...(existing || {}),
				operationId,
				type: OPERATION_TYPE,
				entityType: ENTITY_TYPE,
				entityLocalId: `user:${Number(userId)}:planning`,
				userId: Number(userId),
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
		} catch (error) {
			console.warn('Planning sync queue is not writable', error)
			return null
		}
	}

	async markSyncing(operation) {
		const next = {
			...operation,
			status: 'syncing',
			startedAt: Date.now(),
			updatedAt: Date.now(),
			lastError: null
		}
		await this.indexedDbClient.put('syncQueue', next)
		return next
	}

	async resumePaused(operation, {reason = 'auth-restored'} = {}) {
		if (!operation) return null
		const next = {
			...operation,
			status: 'pending',
			reason,
			lastError: null,
			updatedAt: Date.now(),
			nextAttemptAt: Date.now()
		}
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
				message: error?.message || 'Planning sync failed',
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
		if (status === 409) return 'conflict'
		return 'error'
	}
}

export {OPERATION_TYPE as PLANNING_SYNC_OPERATION_TYPE}
