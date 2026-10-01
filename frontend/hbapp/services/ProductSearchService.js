import {normalizeSearchText} from './ProductUnitService.js'
import IndexedDbClient from './IndexedDbClient.js'
import ProductCatalogApiService from './ProductCatalogApiService.js'

const matchesProductQuery = (productName, query) => {
	const needle = normalizeSearchText(query)
	if (!needle) return false
	const haystack = normalizeSearchText(productName)
	if (haystack.includes(needle)) return true
	const tokens = needle.split(/\s+/).filter(Boolean)
	return tokens.length > 1 && tokens.every(token => haystack.includes(token))
}

const searchProductsFromCache = (products = [], query, {limit = 6, includeDisabled = false} = {}) => {
	if (!normalizeSearchText(query)) return []
	return products
		.filter(product => includeDisabled || product.status === 'active')
		.filter(product => matchesProductQuery(product.name, query))
		.slice(0, limit)
}

const loadProductsFromOfflineCache = async (indexedDbClient = new IndexedDbClient(), {includeDisabled = false} = {}) => {
	try {
		const records = await indexedDbClient.getAll('products')
		return records
			.filter(product => includeDisabled || product.status === 'active')
			.sort((a, b) => String(a.name).localeCompare(String(b.name), 'uk'))
	} catch {
		return []
	}
}

const loadProductsForSuggestions = async ({
	indexedDbClient = new IndexedDbClient(),
	apiService = new ProductCatalogApiService(),
	includeDisabled = false,
	refreshIfEmpty = true
} = {}) => {
	const cached = await loadProductsFromOfflineCache(indexedDbClient, {includeDisabled})
	if (cached.length || !refreshIfEmpty) return cached

	const catalog = await apiService.loadCatalog({refresh: true}).catch(() => null)
	if (Array.isArray(catalog?.products) && catalog.products.length) {
		return catalog.products
			.filter(product => includeDisabled || product.status === 'active')
			.sort((a, b) => String(a.name).localeCompare(String(b.name), 'uk'))
	}

	return loadProductsFromOfflineCache(indexedDbClient, {includeDisabled})
}

export {
	loadProductsFromOfflineCache,
	loadProductsForSuggestions,
	matchesProductQuery,
	searchProductsFromCache
}
