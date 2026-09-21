import IndexedDbClient from './IndexedDbClient.js'
import {getAuthenticatedUserId} from './AuthSession.js'

const STORAGE_KEY = 'hboo-balance-cache-v1'
const STORAGE_VERSION = 1
const MIGRATION_MARKER_KEY = 'balance.localStorageMigration.v1'
const PROVIDERS = ['mono', 'privat']

const cloneData = data => JSON.parse(JSON.stringify(data))

const isValidBalanceData = data => {
	return data && Array.isArray(data.mono) && Array.isArray(data.privat)
}

const toNumber = value => {
	const num = Number(value)
	return Number.isFinite(num) ? num : 0
}

const getCurrentUserKey = () => {
	const userId = getAuthenticatedUserId()
	return userId ? String(userId) : 'anonymous'
}

const getProviderAccountId = (provider, account = {}) => {
	if (provider === 'mono') return String(account.c_id || account.iban || account.id || 'default')
	return String(account.account || account.card_number || account.id || 'default')
}

const getAccountId = (provider, account = {}, userKey = getCurrentUserKey()) => {
	return `${userKey}:${getProviderAccountId(provider, account)}`
}

const getSnapshotAt = (provider, account = {}) => {
	const date = toNumber(account.date)
	if (!date) return null
	return provider === 'mono' ? date * 1000 : date
}

const normalizeBalanceRecord = (provider, account = {}, fetchedAt = Date.now(), userKey = getCurrentUserKey()) => {
	const amountScale = provider === 'mono' ? 100 : 1
	const current = toNumber(account.balance) / amountScale
	const credit = toNumber(account.credit_limit) / amountScale

	return {
		provider,
		accountId: getAccountId(provider, account, userKey),
		userId: userKey,
		providerAccountId: getProviderAccountId(provider, account),
		total: current - credit,
		current,
		credit,
		snapshotAt: getSnapshotAt(provider, account),
		fetchedAt,
		raw: cloneData(account)
	}
}

const normalizeBalanceData = (data, fetchedAt = Date.now(), userKey = getCurrentUserKey()) => {
	return PROVIDERS.flatMap(provider => {
		const accounts = Array.isArray(data?.[provider]) ? data[provider] : []
		return accounts.map(account => normalizeBalanceRecord(provider, account, fetchedAt, userKey))
	})
}

const recordsToBalanceData = records => {
	const data = {mono: [], privat: []}
	records.forEach(record => {
		if (!data[record.provider]) return
		data[record.provider].push(cloneData(record.raw || {}))
	})
	return data
}

export {
	MIGRATION_MARKER_KEY,
	getAccountId,
	getSnapshotAt,
	normalizeBalanceData,
	normalizeBalanceRecord,
	recordsToBalanceData
}

export default class BalanceLocalRepository {

	constructor(storageKey = STORAGE_KEY, {indexedDbClient = new IndexedDbClient()} = {}) {
		this.storageKey = storageKey
		this.indexedDbClient = indexedDbClient
		this.indexedDbFailed = false
		this.migrationPromise = null
	}

	get() {
		return this.readLegacyCache()
	}

	save(data) {
		return this.writeLegacyCache(data)
	}

	readLegacyCache() {
		try {
			const rawData = localStorage.getItem(this.storageKey)
			if (!rawData) return null
			const cache = JSON.parse(rawData)
			if (cache?.version !== STORAGE_VERSION) return null
			if (!Number.isFinite(Number(cache.updatedAt))) return null
			if (cache.userId && cache.userId !== getCurrentUserKey()) return null
			if (!isValidBalanceData(cache.data)) return null

			return {
				version: STORAGE_VERSION,
				updatedAt: Number(cache.updatedAt),
				userId: cache.userId || null,
				data: cloneData(cache.data)
			}
		} catch (error) {
			console.warn('Balance cache is not readable', error)
			return null
		}
	}

	writeLegacyCache(data) {
		if (!isValidBalanceData(data)) return null
		const cache = {
			version: STORAGE_VERSION,
			updatedAt: Date.now(),
			userId: getCurrentUserKey(),
			data: cloneData(data)
		}
		localStorage.setItem(this.storageKey, JSON.stringify(cache))
		return cache
	}

	async ensureMigrated() {
		if (this.indexedDbFailed) return false
		if (this.migrationPromise) return this.migrationPromise

		this.migrationPromise = this.migrateLegacyCache()
			.catch(error => {
				this.indexedDbFailed = true
				console.warn('Balance IndexedDB migration failed', error)
				return false
			})
			.finally(() => {
				this.migrationPromise = null
			})

		return this.migrationPromise
	}

	async migrateLegacyCache() {
		const userKey = getCurrentUserKey()
		const markerKey = `${MIGRATION_MARKER_KEY}:${userKey}`
		const marker = await this.indexedDbClient.get('meta', markerKey)
		if (marker?.value === true) return true

		const legacyCache = this.readLegacyCache()
		const records = legacyCache ? normalizeBalanceData(legacyCache.data, legacyCache.updatedAt, userKey) : []

		await this.indexedDbClient.transaction(['balances', 'meta'], 'readwrite', async ({put}) => {
			await Promise.all(records.map(record => put('balances', record)))
			await put('meta', {
				key: markerKey,
				value: true,
				migratedAt: Date.now(),
				itemCount: records.length,
				userId: userKey
			})
		})

		return true
	}

	async getLatest() {
		try {
			await this.ensureMigrated()
			if (this.indexedDbFailed) throw new Error('IndexedDB unavailable')

			const userKey = getCurrentUserKey()
			const records = (await this.indexedDbClient.getAll('balances'))
				.filter(record => record.userId === userKey)
				.sort((a, b) => {
					const snapshotDiff = toNumber(b.snapshotAt) - toNumber(a.snapshotAt)
					if (snapshotDiff) return snapshotDiff
					return toNumber(b.fetchedAt) - toNumber(a.fetchedAt)
				})
			const data = recordsToBalanceData(records)
			const updatedAt = records.reduce((latest, record) => Math.max(latest, toNumber(record.fetchedAt)), 0)

			if (!isValidBalanceData(data)) return null
			return {
				version: STORAGE_VERSION,
				updatedAt: updatedAt || null,
				data
			}
		} catch (error) {
			this.indexedDbFailed = true
			console.warn('Balance IndexedDB read failed; using localStorage fallback', error)
			const fallback = this.readLegacyCache()
			return fallback ? {...fallback, fallback: true} : null
		}
	}

	async saveLatest(data) {
		const fetchedAt = Date.now()
		try {
			await this.ensureMigrated()
			if (this.indexedDbFailed) throw new Error('IndexedDB unavailable')

			const records = normalizeBalanceData(data, fetchedAt, getCurrentUserKey())
			await this.indexedDbClient.transaction(['balances'], 'readwrite', async ({put}) => {
				await Promise.all(records.map(record => put('balances', record)))
			})

			this.writeLegacyCache(data)
			return this.getLatest()
		} catch (error) {
			this.indexedDbFailed = true
			console.warn('Balance IndexedDB save failed; using localStorage fallback', error)
			const fallback = this.writeLegacyCache(data)
			return fallback ? {...fallback, fallback: true} : null
		}
	}
}
