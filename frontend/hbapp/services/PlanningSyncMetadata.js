import {getAuthenticatedUserId} from './AuthSession.js'

const STORAGE_KEY_PREFIX = 'hboo-planning-sync-meta-v1'

const getStorage = () => typeof localStorage !== 'undefined' ? localStorage : null

const getMetadataKey = (userId = getAuthenticatedUserId()) => {
	return `${STORAGE_KEY_PREFIX}:user:${userId ? Number(userId) : 'anonymous'}`
}

const readPlanningSyncMetadata = (userId = getAuthenticatedUserId()) => {
	const storage = getStorage()
	if (!storage) return {lastSuccessfulSyncAt: null, lastSuccessfulServerCheckAt: null}

	try {
		const rawData = storage.getItem(getMetadataKey(userId))
		const data = rawData ? JSON.parse(rawData) : null
		const lastSuccessfulSyncAt = Number(data?.lastSuccessfulSyncAt)
		const lastSuccessfulServerCheckAt = Number(data?.lastSuccessfulServerCheckAt)

		return {
			lastSuccessfulSyncAt: Number.isFinite(lastSuccessfulSyncAt) && lastSuccessfulSyncAt > 0
				? lastSuccessfulSyncAt
				: null,
			lastSuccessfulServerCheckAt: Number.isFinite(lastSuccessfulServerCheckAt) && lastSuccessfulServerCheckAt > 0
				? lastSuccessfulServerCheckAt
				: null
		}
	} catch {
		return {lastSuccessfulSyncAt: null, lastSuccessfulServerCheckAt: null}
	}
}

const writePlanningSyncMetadata = (metadata = {}, userId = getAuthenticatedUserId()) => {
	const storage = getStorage()
	const nextMetadata = {
		lastSuccessfulSyncAt: Number(metadata.lastSuccessfulSyncAt) || null,
		lastSuccessfulServerCheckAt: Number(metadata.lastSuccessfulServerCheckAt) || null
	}

	if (!storage) return nextMetadata
	storage.setItem(getMetadataKey(userId), JSON.stringify(nextMetadata))
	return nextMetadata
}

const markPlanningSyncSucceeded = (timestamp = Date.now(), userId = getAuthenticatedUserId()) => {
	const previous = readPlanningSyncMetadata(userId)
	return writePlanningSyncMetadata({
		...previous,
		lastSuccessfulSyncAt: Number(timestamp) || Date.now()
	}, userId)
}

const markPlanningServerCheckSucceeded = (timestamp = Date.now(), userId = getAuthenticatedUserId()) => {
	const previous = readPlanningSyncMetadata(userId)
	return writePlanningSyncMetadata({
		...previous,
		lastSuccessfulServerCheckAt: Number(timestamp) || Date.now()
	}, userId)
}

export {
	getMetadataKey,
	markPlanningServerCheckSucceeded,
	markPlanningSyncSucceeded,
	readPlanningSyncMetadata,
	writePlanningSyncMetadata
}
