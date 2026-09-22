import TransactionApiService from '../services/TransactionApiService.js'
import TransactionLocalRepository from '../services/TransactionLocalRepository.js'
import networkStatusService from '../services/NetworkStatusService.js'
import {
	getDefaultTransactionRange,
	normalizeTransactionRange
} from '../services/TransactionDateRange.js'

const cloneData = data => data ? JSON.parse(JSON.stringify(data)) : null
const FILTER_STORAGE_KEY = 'hboo-transaction-filter-v1'

const getDefaultRange = getDefaultTransactionRange

const getRangeFromQuery = query => {
	const defaults = getDefaultRange()
	const params = new URLSearchParams(String(query || '').replace(/^\?/, ''))
	const dateFrom = params.has('date_from') ? Number(params.get('date_from')) : NaN
	const dateTo = params.has('date_to') ? Number(params.get('date_to')) : NaN
	return normalizeTransactionRange({
		dateFrom: Number.isFinite(dateFrom) ? dateFrom : defaults.dateFrom,
		dateTo: Number.isFinite(dateTo) ? dateTo : defaults.dateTo
	}, {normalizeTimestamps: false})
}

const hasQueryDateRange = query => {
	const params = new URLSearchParams(String(query || '').replace(/^\?/, ''))
	return params.has('date_from')
		&& params.has('date_to')
		&& Number.isFinite(Number(params.get('date_from')))
		&& Number.isFinite(Number(params.get('date_to')))
}

const getQueryFromRange = range => `?date_from=${Number(range.dateFrom)}&date_to=${Number(range.dateTo)}`

const getRequestQuery = (query = '', range = getDefaultRange()) => {
	const params = new URLSearchParams(String(query || '').replace(/^\?/, ''))
	params.set('date_from', String(Number(range.dateFrom)))
	params.set('date_to', String(Number(range.dateTo)))
	return `?${params.toString()}`
}

const isValidRange = range => {
	const dateFrom = Number(range?.dateFrom)
	const dateTo = Number(range?.dateTo)
	return Number.isFinite(dateFrom) && Number.isFinite(dateTo) && dateFrom <= dateTo
}

const getSavedRange = () => {
	try {
		const rawData = localStorage.getItem(FILTER_STORAGE_KEY)
		if (!rawData) return null
		const data = JSON.parse(rawData)
		const range = {
			dateFrom: Number(data?.dateFrom),
			dateTo: Number(data?.dateTo)
		}
		return isValidRange(range) ? normalizeTransactionRange(range) : null
	} catch {
		return null
	}
}

const saveTransactionRangePreference = range => {
	if (!isValidRange(range)) return null
	const data = {
		version: 1,
		dateFrom: Number(range.dateFrom),
		dateTo: Number(range.dateTo),
		updatedAt: Date.now()
	}
	localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(data))
	return data
}

const getInitialRange = query => {
	if (hasQueryDateRange(query)) return getRangeFromQuery(query)
	return getSavedRange() || getDefaultRange()
}

const isOffline = () => {
	return networkStatusService.isOffline()
}

class TransactionStore {

	constructor({apiService = new TransactionApiService(), repository = new TransactionLocalRepository()} = {}) {
		this.apiService = apiService
		this.repository = repository
		this.listeners = new Set()
		this.loadPromise = null
		this.state = {
			data: null,
			updatedAt: null,
			loading: false,
			loaded: false,
			source: null,
			stale: false,
			coverage: null,
			range: getDefaultRange(),
			error: null
		}
	}

	getState() {
		return {
			...this.state,
			data: cloneData(this.state.data)
		}
	}

	subscribe(listener) {
		if (typeof listener !== 'function') return () => {}
		this.listeners.add(listener)
		listener(this.getState())
		return () => this.listeners.delete(listener)
	}

	notify() {
		const state = this.getState()
		this.listeners.forEach(listener => listener(state))
	}

	setState(patch) {
		this.state = {
			...this.state,
			...patch
		}
		this.notify()
	}

	async hydrateFromCache(range = this.state.range) {
		if (this.state.loaded || this.state.data) return this.getState()
		const cache = await this.repository.getRange(range)
		if (!cache) return this.getState()

		this.setState({
			data: cache.data,
			updatedAt: cache.updatedAt,
			loaded: true,
			source: 'cache',
			stale: false,
			coverage: cache.coverage || null,
			range,
			error: null
		})
		return this.getState()
	}

	load(query = '') {
		if (this.loadPromise) return this.loadPromise
		const range = getInitialRange(query)
		const requestQuery = getRequestQuery(query, range)

		this.loadPromise = this.refresh(requestQuery, {range})
			.finally(() => {
				this.loadPromise = null
			})

		return this.loadPromise
	}

	async refresh(query = '', {range = getRangeFromQuery(query)} = {}) {
		range = normalizeTransactionRange(range, {normalizeTimestamps: false})
		const requestQuery = getRequestQuery(query, range)
		const cache = await this.repository.getRange(range)
		const offline = isOffline()
		if (cache) {
			this.setState({
				data: cache.data,
				updatedAt: cache.updatedAt,
				loading: !offline,
				loaded: true,
				source: 'cache',
				stale: offline,
				coverage: cache.coverage || null,
				range,
				error: null
			})
		} else {
			this.setState({
				data: {mono: [], privat: []},
				updatedAt: null,
				loading: !offline,
				loaded: true,
				source: 'cache',
				stale: offline,
				coverage: {status: 'not_fetched', complete: false, windows: []},
				range,
				error: null
			})
		}

		if (offline) {
			return this.getState()
		}

		try {
			const data = await this.apiService.getTransactions(requestQuery)
			const savedCache = await this.repository.saveRange(data, range)
			this.setState({
				data: savedCache?.data || data,
				updatedAt: savedCache?.updatedAt || Date.now(),
				loading: false,
				loaded: true,
				source: 'api',
				stale: false,
				coverage: savedCache?.coverage || {status: 'complete', complete: true, windows: []},
				range,
				error: null
			})
			return this.getState()
		} catch (error) {
			const latestCache = await this.repository.getRange(range)
			this.setState({
				data: latestCache?.data || {mono: [], privat: []},
				updatedAt: latestCache?.updatedAt || null,
				loading: false,
				loaded: true,
				source: 'cache',
				stale: true,
				coverage: latestCache?.coverage || null,
				range,
				error
			})
			return this.getState()
		}
	}

	saveSelectedRange(range = this.state.range) {
		return saveTransactionRangePreference(range)
	}
}

export {
	FILTER_STORAGE_KEY,
	TransactionStore,
	getInitialRange,
	getQueryFromRange,
	getRangeFromQuery,
	getRequestQuery,
	saveTransactionRangePreference
}
export default new TransactionStore()
