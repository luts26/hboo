import api from '../mixins/apiQueriesHelper.js'
import CategoryLocalRepository, {isValidCategories} from './CategoryLocalRepository.js'

const refreshRequests = new Map()

const fetchCategories = async language => {
	const response = await fetch(`${api.apiurl}/categories?lang=${encodeURIComponent(language)}`, {
		method: 'GET',
		headers: api.getHeaders()
	})

	if (![200, 201].includes(response.status)) {
		throw new Error('Categories request failed')
	}

	return response.json()
}

export default class CategoryApiService {

	constructor(localRepository = new CategoryLocalRepository()) {
		this.localRepository = localRepository
	}

	async getCategories(language = 'uk') {
		return this.loadCategories(language)
	}

	loadCategories(language = 'uk', options = {}) {
		const cached = this.localRepository.get(language)

		if (cached) {
			this.refreshCategories(language, options).catch(() => {})
			return Promise.resolve(cached.items)
		}

		return this.refreshCategories(language)
	}

	refreshCategories(language = 'uk', options = {}) {
		const cacheKey = String(language || 'uk')

		if (!refreshRequests.has(cacheKey)) {
			const request = fetchCategories(cacheKey)
				.then(categories => {
					if (!isValidCategories(categories)) {
						throw new Error('Invalid categories response')
					}

					this.localRepository.save(cacheKey, categories)
					return categories
				})
				.finally(() => {
					refreshRequests.delete(cacheKey)
				})

			refreshRequests.set(cacheKey, request)
		}

		return refreshRequests.get(cacheKey)
			.then(categories => {
				if (typeof options.onRefresh === 'function') {
					options.onRefresh(categories)
				}
				return categories
			})
	}
}
