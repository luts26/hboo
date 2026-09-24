import IndexedDbClient from './IndexedDbClient.js'
import {
	getDefaultTransactionRange,
	normalizeTransactionRange
} from './TransactionDateRange.js'

const STORAGE_KEY = 'hboo-transaction-cache-v1'
const STORAGE_VERSION = 1
const MAX_ITEMS_PER_BANK = 100
const MIGRATION_MARKER_KEY = 'transactions.localStorageMigration.v1'
const PROVIDERS = ['mono', 'privat']

const cloneData = data => JSON.parse(JSON.stringify(data))

const isValidTransactionData = data => {
	return data && Array.isArray(data.mono) && Array.isArray(data.privat)
}

const toNumber = value => {
	const num = Number(value)
	return Number.isFinite(num) ? num : 0
}

const toOptionalString = value => {
	if (value === null || value === undefined || value === '') return null
	return String(value)
}

const getDefaultRange = getDefaultTransactionRange

const normalizeRange = range => {
	return normalizeTransactionRange(range, {normalizeTimestamps: false})
}

const getMonoTimestamp = transaction => {
	const timestamp = toNumber(transaction?.timestamp)
	if (timestamp > 0) return timestamp
	return toNumber(transaction?.time) * 1000
}

const getPrivatTimestamp = transaction => {
	const timestamp = toNumber(transaction?.timestamp)
	if (timestamp > 0) return timestamp
	return toNumber(transaction?.date)
}

const getProviderTransactionId = transaction => {
	return toOptionalString(transaction?.providerTransactionId ?? transaction?.provider_transaction_id ?? transaction?.t_id)
}

const getRawCategory = (transaction, provider) => {
	if (provider === 'mono') return toOptionalString(transaction?.mcc ?? transaction?.sourceCategoryCode)
	return toOptionalString(
		transaction?.rawCategory
		?? transaction?.bankCategory
		?? transaction?.sourceCategoryCode
		?? (typeof transaction?.category === 'object' ? null : transaction?.category)
	)
}

const getCategory = transaction => {
	return transaction?.category && typeof transaction.category === 'object' ? transaction.category : null
}

const getDescription = (transaction, provider) => {
	if (provider === 'mono') return transaction?.description || 'Transaction'
	return [transaction?.details, transaction?.categoryDetails ?? transaction?.category_details].filter(Boolean).join(': ') || transaction?.description || 'Transaction'
}

const normalizeProviderTransaction = (provider, transaction, fetchedAt = Date.now()) => {
	const providerTransactionId = getProviderTransactionId(transaction)
	const timestamp = provider === 'mono'
		? getMonoTimestamp(transaction)
		: getPrivatTimestamp(transaction)

	if (!providerTransactionId || !timestamp) return null

	const category = getCategory(transaction)
	const sourceCategoryCode = getRawCategory(transaction, provider)

	return {
		provider,
		providerTransactionId,
		timestamp,
		amount: toNumber(transaction?.amount),
		categoryId: category?.id === undefined || category?.id === null ? null : String(category.id),
		category,
		description: getDescription(transaction, provider),
		sourceCategoryCode,
		raw: cloneData(transaction),
		fetchedAt,
		updatedAt: fetchedAt
	}
}

const normalizeTransactionData = (data, fetchedAt = Date.now()) => {
	return PROVIDERS.flatMap(provider => {
		const items = Array.isArray(data?.[provider]) ? data[provider] : []
		return items
			.map(item => normalizeProviderTransaction(provider, item, fetchedAt))
			.filter(Boolean)
	})
}

const getMonoSortValue = item => {
	return toNumber(item?.timestamp) || toNumber(item?.time) * 1000 || toNumber(item?.date) || toNumber(item?.id)
}

const getPrivatSortValue = item => {
	return toNumber(item?.timestamp) || toNumber(item?.date) || toNumber(item?.time) * 1000 || toNumber(item?.id)
}

const getIdSortValue = item => {
	return toNumber(item?.id) || toNumber(item?.t_id) || toNumber(item?.providerTransactionId)
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

const normalizeForLegacyCache = data => {
	return {
		mono: limitItems(Array.isArray(data?.mono) ? data.mono : [], getMonoSortValue),
		privat: limitItems(Array.isArray(data?.privat) ? data.privat : [], getPrivatSortValue)
	}
}

const toMonoUiTransaction = record => {
	const raw = cloneData(record.raw || {})
	return {
		...raw,
		provider: 'mono',
		providerTransactionId: record.providerTransactionId,
		t_id: raw.t_id ?? record.providerTransactionId,
		timestamp: record.timestamp,
		amount: record.amount,
		time: toNumber(raw.time) || Math.floor(record.timestamp / 1000),
		category: record.category,
		categoryId: record.categoryId,
		description: record.description,
		sourceCategoryCode: record.sourceCategoryCode,
		cashbackAmount: raw.cashbackAmount ?? raw.cashback_amount ?? 0,
		cashback_amount: raw.cashback_amount ?? raw.cashbackAmount ?? 0,
		commissionRate: raw.commissionRate ?? raw.commission_rate ?? 0,
		commission_rate: raw.commission_rate ?? raw.commissionRate ?? 0,
		currencyCode: raw.currencyCode ?? raw.currency_code,
		currency_code: raw.currency_code ?? raw.currencyCode,
		operationAmount: raw.operationAmount ?? raw.operation_amount,
		operation_amount: raw.operation_amount ?? raw.operationAmount,
		originalMcc: raw.originalMcc ?? raw.original_mcc,
		original_mcc: raw.original_mcc ?? raw.originalMcc,
		receiptId: raw.receiptId ?? raw.receipt_id,
		receipt_id: raw.receipt_id ?? raw.receiptId
	}
}

const toPrivatUiTransaction = record => {
	const raw = cloneData(record.raw || {})
	const sourceCategoryCode = record.sourceCategoryCode
	return {
		...raw,
		provider: 'privat',
		providerTransactionId: record.providerTransactionId,
		t_id: raw.t_id ?? record.providerTransactionId,
		timestamp: record.timestamp,
		amount: record.amount,
		date: record.timestamp,
		category: record.category,
		categoryId: record.categoryId,
		sourceCategoryCode,
		description: record.description,
		rawCategory: raw.rawCategory ?? raw.raw_category ?? sourceCategoryCode,
		bankCategory: raw.bankCategory ?? raw.bank_category ?? sourceCategoryCode,
		categoryDetails: raw.categoryDetails ?? raw.category_details ?? '',
		category_details: raw.category_details ?? raw.categoryDetails ?? '',
		details: raw.details ?? ''
	}
}

const recordsToGroupedData = records => {
	const data = {mono: [], privat: []}
	records.forEach(record => {
		if (record.provider === 'mono') data.mono.push(toMonoUiTransaction(record))
		if (record.provider === 'privat') data.privat.push(toPrivatUiTransaction(record))
	})
	data.mono.sort((a, b) => getMonoSortValue(b) - getMonoSortValue(a))
	data.privat.sort((a, b) => getPrivatSortValue(b) - getPrivatSortValue(a))
	return data
}

const getCoverageStatus = (data, windows) => {
	const complete = PROVIDERS.every(provider => windows.some(window => window?.provider === provider && window.complete))
	if (complete) return 'complete'
	const hasTransactions = PROVIDERS.some(provider => Array.isArray(data?.[provider]) && data[provider].length > 0)
	return hasTransactions ? 'partial' : 'not_fetched'
}

export {
	MIGRATION_MARKER_KEY,
	normalizeProviderTransaction,
	normalizeTransactionData,
	recordsToGroupedData
}

export default class TransactionLocalRepository {

	constructor(storageKey = STORAGE_KEY, {indexedDbClient = new IndexedDbClient()} = {}) {
		this.storageKey = storageKey
		this.indexedDbClient = indexedDbClient
		this.migrationPromise = null
		this.indexedDbFailed = false
	}

	readLegacyCache() {
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

	writeLegacyCache(data) {
		if (!isValidTransactionData(data)) return null
		const cache = {
			version: STORAGE_VERSION,
			updatedAt: Date.now(),
			data: normalizeForLegacyCache(data)
		}
		localStorage.setItem(this.storageKey, JSON.stringify(cache))
		return cache
	}

	get() {
		return this.readLegacyCache()
	}

	async save(data) {
		return this.saveRange(data, getDefaultRange())
	}

	async ensureMigrated() {
		if (this.indexedDbFailed) return false
		if (this.migrationPromise) return this.migrationPromise

		this.migrationPromise = this.migrateLegacyCache()
			.catch(error => {
				this.indexedDbFailed = true
				console.warn('Transaction IndexedDB migration failed', error)
				return false
			})
			.finally(() => {
				this.migrationPromise = null
			})

		return this.migrationPromise
	}

	async migrateLegacyCache() {
		const marker = await this.indexedDbClient.get('meta', MIGRATION_MARKER_KEY)
		if (marker?.value === true) return true

		const legacyCache = this.readLegacyCache()
		const records = legacyCache ? normalizeTransactionData(legacyCache.data, legacyCache.updatedAt) : []
		await this.indexedDbClient.transaction(['transactions', 'meta'], 'readwrite', async ({put}) => {
			await Promise.all(records.map(record => put('transactions', record)))
			await put('meta', {
				key: MIGRATION_MARKER_KEY,
				value: true,
				migratedAt: Date.now(),
				itemCount: records.length
			})
		})

		return true
	}

	async getWindows(dateFrom, dateTo) {
		return Promise.all(PROVIDERS.map(provider => {
			const windowKey = `${provider}:${dateFrom}:${dateTo}`
			return this.indexedDbClient.get('transactionWindows', windowKey)
		}))
	}

	async getCoverage(range = {}) {
		const {dateFrom, dateTo} = normalizeRange(range)

		try {
			await this.ensureMigrated()
			if (this.indexedDbFailed) throw new Error('IndexedDB unavailable')

			const windows = (await this.indexedDbClient.getAll('transactionWindows'))
				.filter(window => window?.complete && toNumber(window.dateFrom) <= dateTo && toNumber(window.dateTo) >= dateFrom)

			return {
				status: windows.length ? 'partial' : 'not_fetched',
				complete: false,
				windows
			}
		} catch (error) {
			this.indexedDbFailed = true
			console.warn('Transaction IndexedDB coverage read failed; using partial fallback', error)
			return {
				status: 'partial',
				complete: false,
				windows: []
			}
		}
	}

	async getRange(range = {}) {
		const {dateFrom, dateTo} = normalizeRange(range)

		try {
			await this.ensureMigrated()
			if (this.indexedDbFailed) throw new Error('IndexedDB unavailable')

			const query = IDBKeyRange.bound(dateFrom, dateTo)
			const [records, windows] = await Promise.all([
				this.indexedDbClient.getAllFromIndex('transactions', 'timestamp', query),
				this.getWindows(dateFrom, dateTo)
			])
			const data = recordsToGroupedData(records)
			const updatedAt = records.reduce((latest, record) => Math.max(latest, toNumber(record.fetchedAt), toNumber(record.updatedAt)), 0)
			const completeWindows = windows.filter(window => window?.complete)

			return {
				version: STORAGE_VERSION,
				updatedAt: updatedAt || completeWindows.reduce((latest, window) => Math.max(latest, toNumber(window.fetchedAt)), 0) || null,
				data,
				coverage: {
					status: getCoverageStatus(data, windows),
					complete: PROVIDERS.every(provider => windows.some(window => window?.provider === provider && window.complete)),
					windows: windows.filter(Boolean)
				}
			}
		} catch (error) {
			this.indexedDbFailed = true
			console.warn('Transaction IndexedDB read failed; using localStorage fallback', error)
			const fallback = this.readLegacyCache()
			if (!fallback) return {
				version: STORAGE_VERSION,
				updatedAt: null,
				data: {mono: [], privat: []},
				coverage: {status: 'not_fetched', complete: false, windows: []},
				fallback: true
			}
			return {
				...fallback,
				coverage: {status: 'partial', complete: false, windows: []},
				fallback: true
			}
		}
	}

	async saveRange(data, range = {}) {
		const {dateFrom, dateTo} = normalizeRange(range)
		const fetchedAt = Date.now()

		try {
			await this.ensureMigrated()
			if (this.indexedDbFailed) throw new Error('IndexedDB unavailable')

			const records = normalizeTransactionData(data, fetchedAt)
			const counts = records.reduce((result, record) => {
				result[record.provider] += 1
				return result
			}, {mono: 0, privat: 0})

			await this.indexedDbClient.transaction(['transactions', 'transactionWindows'], 'readwrite', async ({put}) => {
				await Promise.all(records.map(record => put('transactions', record)))
				await Promise.all(PROVIDERS.map(provider => put('transactionWindows', {
					windowKey: `${provider}:${dateFrom}:${dateTo}`,
					provider,
					dateFrom,
					dateTo,
					fetchedAt,
					source: 'api',
					complete: true,
					itemCount: counts[provider]
				})))
			})

			this.writeLegacyCache(data)
			return this.getRange({dateFrom, dateTo})
		} catch (error) {
			this.indexedDbFailed = true
			console.warn('Transaction IndexedDB save failed; using localStorage fallback', error)
			const fallback = this.writeLegacyCache(data)
			return {
				version: STORAGE_VERSION,
				updatedAt: fallback?.updatedAt || fetchedAt,
				data: fallback?.data || normalizeForLegacyCache(data),
				coverage: {status: 'partial', complete: false, windows: []},
				fallback: true
			}
		}
	}
}
