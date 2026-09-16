const STORAGE_KEY = 'hboo-balance-cache-v1'
const STORAGE_VERSION = 1

const cloneData = data => JSON.parse(JSON.stringify(data))

const isValidBalanceData = data => {
	return data && Array.isArray(data.mono) && Array.isArray(data.privat)
}

export default class BalanceLocalRepository {

	constructor(storageKey = STORAGE_KEY) {
		this.storageKey = storageKey
	}

	get() {
		try {
			const rawData = localStorage.getItem(this.storageKey)
			if (!rawData) return null
			const cache = JSON.parse(rawData)
			if (cache?.version !== STORAGE_VERSION) return null
			if (!Number.isFinite(Number(cache.updatedAt))) return null
			if (!isValidBalanceData(cache.data)) return null

			return {
				version: STORAGE_VERSION,
				updatedAt: Number(cache.updatedAt),
				data: cloneData(cache.data)
			}
		} catch (error) {
			console.warn('Balance cache is not readable', error)
			return null
		}
	}

	save(data) {
		if (!isValidBalanceData(data)) return null
		const cache = {
			version: STORAGE_VERSION,
			updatedAt: Date.now(),
			data: cloneData(data)
		}
		localStorage.setItem(this.storageKey, JSON.stringify(cache))
		return cache
	}
}
