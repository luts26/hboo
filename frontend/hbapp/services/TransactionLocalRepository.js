const STORAGE_KEY = 'hboo-transaction-cache-v1'
const STORAGE_VERSION = 1
const MAX_ITEMS_PER_BANK = 100

const cloneData = data => JSON.parse(JSON.stringify(data))

const isValidTransactionData = data => {
	return data && Array.isArray(data.mono) && Array.isArray(data.privat)
}

const toNumber = value => {
	const num = Number(value)
	return Number.isFinite(num) ? num : 0
}

const getMonoSortValue = item => {
	return toNumber(item?.time) || toNumber(item?.date) || toNumber(item?.id)
}

const getPrivatSortValue = item => {
	return toNumber(item?.date) || toNumber(item?.time) || toNumber(item?.id)
}

const getIdSortValue = item => {
	return toNumber(item?.id) || toNumber(item?.t_id)
}

const limitItems = (items, getDateValue) => {
	return cloneData(items)
		.sort((a, b) => {
			const dateDiff = getDateValue(b) - getDateValue(a)
			if (dateDiff) return dateDiff
			return getIdSortValue(b) - getIdSortValue(a)
		})
		.slice(0, MAX_ITEMS_PER_BANK)
}

const normalizeForCache = data => {
	return {
		mono: limitItems(data.mono, getMonoSortValue),
		privat: limitItems(data.privat, getPrivatSortValue)
	}
}

export default class TransactionLocalRepository {

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
			if (!isValidTransactionData(cache.data)) return null

			return {
				version: STORAGE_VERSION,
				updatedAt: Number(cache.updatedAt),
				data: cloneData(cache.data)
			}
		} catch (error) {
			console.warn('Transaction cache is not readable', error)
			return null
		}
	}

	save(data) {
		if (!isValidTransactionData(data)) return null
		const cache = {
			version: STORAGE_VERSION,
			updatedAt: Date.now(),
			data: normalizeForCache(data)
		}
		localStorage.setItem(this.storageKey, JSON.stringify(cache))
		return cache
	}
}
