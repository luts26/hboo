import {getAuthenticatedUserId} from './AuthSession.js'

const STORAGE_KEY_PREFIX = 'hboo-planning-sync-meta-v1'

const getStorage = () => typeof localStorage !== 'undefined' ? localStorage : null

const getMetadataKey = (userId = getAuthenticatedUserId()) => {
	return `${STORAGE_KEY_PREFIX}:user:${userId ? Number(userId) : 'anonymous'}`
}

const readPlanningSyncMetadata = (userId = getAuthenticatedUserId()) => {
	const storage = getStorage()
	if (!storage) return {lastSuccessfulSyncAt: null}

	try {
		const rawData = storage.getItem(getMetadataKey(userId))
		const data = rawData ? JSON.parse(rawData) : null
		const lastSuccessfulSyncAt = Number(data?.lastSuccessfulSyncAt)

		return {
			lastSuccessfulSyncAt: Number.isFinite(lastSuccessfulSyncAt) && lastSuccessfulSyncAt > 0
				? lastSuccessfulSyncAt
				: null
		}
	} catch {
		return {lastSuccessfulSyncAt: null}
	}
}

const writePlanningSyncMetadata = (metadata = {}, userId = getAuthenticatedUserId()) => {
	const storage = getStorage()
	const nextMetadata = {
		lastSuccessfulSyncAt: Number(metadata.lastSuccessfulSyncAt) || null
	}

	if (!storage) return nextMetadata
	storage.setItem(getMetadataKey(userId), JSON.stringify(nextMetadata))
	return nextMetadata
}

const markPlanningSyncSucceeded = (timestamp = Date.now(), userId = getAuthenticatedUserId()) => {
	return writePlanningSyncMetadata({lastSuccessfulSyncAt: Number(timestamp) || Date.now()}, userId)
}

export {
	getMetadataKey,
	markPlanningSyncSucceeded,
	readPlanningSyncMetadata,
	writePlanningSyncMetadata
}
