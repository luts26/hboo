const STORAGE_KEY_PREFIX = 'hboo-categories-v1'
const STORAGE_VERSION = 1

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

export {isValidCategories}

export default class CategoryLocalRepository {

	getStorageKey(language = 'uk') {
		return `${STORAGE_KEY_PREFIX}:${normalizeLanguage(language)}`
	}

	get(language = 'uk') {
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
}
