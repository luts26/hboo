import IndexedDbClient from './IndexedDbClient.js'

const STORAGE_KEY_PREFIX = 'hboo-categories-v1'
const STORAGE_VERSION = 1
const MIGRATION_MARKER_PREFIX = 'categories.localStorageMigration.v1'

const cloneCategories = categories => JSON.parse(JSON.stringify(categories))

const normalizeLanguage = language => String(language || 'uk').trim() || 'uk'

const isValidCategory = category => {
	return category
		&& category.id !== undefined
		&& category.id !== null
		&& typeof category.code === 'string'
		&& typeof category.name === 'string'
		&& typeof category.icon === 'string'
}

const isValidCategories = categories => {
	return Array.isArray(categories)
		&& categories.length > 0
		&& categories.every(isValidCategory)
}

const normalizeCategoryRecord = (language, category, updatedAt = new Date().toISOString()) => ({
	language: normalizeLanguage(language),
	id: category.id,
	code: category.code,
	name: category.name,
	icon: category.icon,
	type: category.type,
	updatedAt,
	raw: cloneCategories(category)
})

const recordsToCategories = records => records
	.sort((a, b) => Number(a.id) - Number(b.id))
	.map(record => ({
		...cloneCategories(record.raw || {}),
		id: record.id,
		code: record.code,
		name: record.name,
		icon: record.icon,
		type: record.type
	}))

export {
	MIGRATION_MARKER_PREFIX,
	isValidCategories,
	normalizeCategoryRecord,
	normalizeLanguage,
	recordsToCategories
}

export default class CategoryLocalRepository {

	constructor({indexedDbClient = new IndexedDbClient()} = {}) {
		this.indexedDbClient = indexedDbClient
		this.indexedDbFailed = false
		this.migrationPromises = new Map()
	}

	getStorageKey(language = 'uk') {
		return `${STORAGE_KEY_PREFIX}:${normalizeLanguage(language)}`
	}

	getMigrationMarkerKey(language = 'uk') {
		return `${MIGRATION_MARKER_PREFIX}:${normalizeLanguage(language)}`
	}

	get(language = 'uk') {
		return this.readLegacyCache(language)
	}

	readLegacyCache(language = 'uk') {
		const normalizedLanguage = normalizeLanguage(language)
		const storageKey = this.getStorageKey(normalizedLanguage)
		const removeInvalidCache = () => {
			this.remove(normalizedLanguage)
			return null
		}

		try {
			const rawData = localStorage.getItem(storageKey)
			if (!rawData) return null

			const cache = JSON.parse(rawData)
			if (cache?.version !== STORAGE_VERSION) return removeInvalidCache()
			if (cache.language !== normalizedLanguage) return removeInvalidCache()
			if (!cache.updatedAt || Number.isNaN(Date.parse(cache.updatedAt))) return removeInvalidCache()
			if (!isValidCategories(cache.items)) return removeInvalidCache()

			return {
				version: STORAGE_VERSION,
				language: normalizedLanguage,
				updatedAt: cache.updatedAt,
				items: cloneCategories(cache.items)
			}
		} catch (error) {
			console.warn('Category cache is not readable', error)
			this.remove(normalizedLanguage)
			return null
		}
	}

	save(language = 'uk', categories = []) {
		return this.writeLegacyCache(language, categories)
	}

	writeLegacyCache(language = 'uk', categories = []) {
		const normalizedLanguage = normalizeLanguage(language)
		if (!isValidCategories(categories)) return null

		const cache = {
			version: STORAGE_VERSION,
			language: normalizedLanguage,
			updatedAt: new Date().toISOString(),
			items: cloneCategories(categories)
		}

		localStorage.setItem(this.getStorageKey(normalizedLanguage), JSON.stringify(cache))
		return cache
	}

	remove(language = 'uk') {
		localStorage.removeItem(this.getStorageKey(language))
	}

	async ensureMigrated(language = 'uk') {
		const normalizedLanguage = normalizeLanguage(language)
		if (this.indexedDbFailed) return false
		if (this.migrationPromises.has(normalizedLanguage)) return this.migrationPromises.get(normalizedLanguage)

		const migrationPromise = this.migrateLegacyCache(normalizedLanguage)
			.catch(error => {
				this.indexedDbFailed = true
				console.warn('Category IndexedDB migration failed', error)
				return false
			})
			.finally(() => {
				this.migrationPromises.delete(normalizedLanguage)
			})

		this.migrationPromises.set(normalizedLanguage, migrationPromise)
		return migrationPromise
	}

	async migrateLegacyCache(language = 'uk') {
		const normalizedLanguage = normalizeLanguage(language)
		const markerKey = this.getMigrationMarkerKey(normalizedLanguage)
		const marker = await this.indexedDbClient.get('meta', markerKey)
		if (marker?.value === true) return true

		const legacyCache = this.readLegacyCache(normalizedLanguage)
		const records = legacyCache
			? legacyCache.items.map(category => normalizeCategoryRecord(normalizedLanguage, category, legacyCache.updatedAt))
			: []

		await this.indexedDbClient.transaction(['categories', 'meta'], 'readwrite', async ({put}) => {
			await Promise.all(records.map(record => put('categories', record)))
			await put('meta', {
				key: markerKey,
				value: true,
				language: normalizedLanguage,
				migratedAt: new Date().toISOString(),
				itemCount: records.length
			})
		})

		return true
	}

	async getCached(language = 'uk') {
		const normalizedLanguage = normalizeLanguage(language)

		try {
			await this.ensureMigrated(normalizedLanguage)
			if (this.indexedDbFailed) throw new Error('IndexedDB unavailable')

			const records = await this.indexedDbClient.getAllFromIndex('categories', 'language', IDBKeyRange.only(normalizedLanguage))
			if (!records.length) return null
			const updatedAt = records.reduce((latest, record) => {
				return String(record.updatedAt || '') > String(latest || '') ? record.updatedAt : latest
			}, null)
			const items = recordsToCategories(records)

			return {
				version: STORAGE_VERSION,
				language: normalizedLanguage,
				updatedAt,
				items
			}
		} catch (error) {
			this.indexedDbFailed = true
			console.warn('Category IndexedDB read failed; using localStorage fallback', error)
			const fallback = this.readLegacyCache(normalizedLanguage)
			return fallback ? {...fallback, fallback: true} : null
		}
	}

	async saveCached(language = 'uk', categories = []) {
		const normalizedLanguage = normalizeLanguage(language)
		const updatedAt = new Date().toISOString()

		try {
			await this.ensureMigrated(normalizedLanguage)
			if (this.indexedDbFailed) throw new Error('IndexedDB unavailable')
			if (!isValidCategories(categories)) return null

			const records = categories.map(category => normalizeCategoryRecord(normalizedLanguage, category, updatedAt))
			await this.indexedDbClient.transaction(['categories'], 'readwrite', async ({put}) => {
				await Promise.all(records.map(record => put('categories', record)))
			})

			this.writeLegacyCache(normalizedLanguage, categories)
			return this.getCached(normalizedLanguage)
		} catch (error) {
			this.indexedDbFailed = true
			console.warn('Category IndexedDB save failed; using localStorage fallback', error)
			const fallback = this.writeLegacyCache(normalizedLanguage, categories)
			return fallback ? {...fallback, fallback: true} : null
		}
	}
}
