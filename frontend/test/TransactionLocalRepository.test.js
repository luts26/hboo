import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

class LocalStorageMock {
	constructor() {
		this.data = new Map()
	}

	getItem(key) {
		return this.data.has(key) ? this.data.get(key) : null
	}

	setItem(key, value) {
		this.data.set(key, String(value))
	}

	removeItem(key) {
		this.data.delete(key)
	}

	clear() {
		this.data.clear()
	}
}

class FakeIndexedDbClient {
	constructor({fail = false} = {}) {
		this.fail = fail
		this.stores = {
			meta: new Map(),
			transactions: new Map(),
			transactionWindows: new Map()
		}
	}

	keyFor(storeName, value) {
		if (storeName === 'transactions') return `${value.provider}:${value.providerTransactionId}`
		if (storeName === 'transactionWindows') return value.windowKey
		if (storeName === 'meta') return value.key
		return value.id
	}

	async get(storeName, key) {
		if (this.fail) throw new Error('IndexedDB unavailable')
		return this.stores[storeName].get(Array.isArray(key) ? key.join(':') : key) || null
	}

	async getAll(storeName) {
		if (this.fail) throw new Error('IndexedDB unavailable')
		return Array.from(this.stores[storeName].values())
	}

	async getAllFromIndex(storeName, indexName, query = null) {
		if (this.fail) throw new Error('IndexedDB unavailable')
		assert.equal(indexName, 'timestamp')
		return Array.from(this.stores[storeName].values())
			.filter(record => record.timestamp >= query.lower && record.timestamp <= query.upper)
	}

	async transaction(storeNames, mode, callback) {
		if (this.fail) throw new Error('IndexedDB unavailable')
		return callback({
			put: async (storeName, value) => {
				this.stores[storeName].set(this.keyFor(storeName, value), value)
				return this.keyFor(storeName, value)
			},
			get: async (storeName, key) => this.get(storeName, key),
			getAllFromIndex: async (storeName, indexName, query) => this.getAllFromIndex(storeName, indexName, query)
		})
	}
}

globalThis.IDBKeyRange = {
	bound: (lower, upper) => ({lower, upper})
}
globalThis.localStorage = new LocalStorageMock()
Object.defineProperty(globalThis, 'navigator', {
	value: {onLine: true},
	configurable: true
})

const {
	default: TransactionLocalRepository,
	MIGRATION_MARKER_KEY,
	normalizeProviderTransaction
} = await import('../hbapp/services/TransactionLocalRepository.js')
const {
	FILTER_STORAGE_KEY,
	TransactionStore,
	getInitialRange,
	getQueryFromRange,
	saveTransactionRangePreference
} = await import('../hbapp/stores/TransactionStore.js')
const {
	getDateInputValue,
	getDefaultTransactionRange,
	normalizeTransactionDateSelection
} = await import('../hbapp/services/TransactionDateRange.js')
const {
	addCoverageToMonthlyIncomeExpenses,
	getMonthlyIncomeExpenses,
	getRecentMonthRange
} = await import('../hbapp/services/FinancialAnalyticsService.js')

const makeRepo = client => new TransactionLocalRepository('hboo-transaction-cache-v1', {indexedDbClient: client})
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(__dirname, '..')
const read = filePath => fs.readFileSync(path.join(frontendRoot, filePath), 'utf8')
const waitFor = async predicate => {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		if (predicate()) return
		await new Promise(resolve => setTimeout(resolve, 0))
	}
}

const monoTx = {
	id: 1,
	t_id: 'mono-1',
	time: 1000,
	amount: '-10.50',
	description: 'Mono shop',
	mcc: 5411,
	cashback_amount: '1.00',
	commission_rate: '0.25',
	category: {id: 10, code: 'food', name: 'Food', icon: 'food-icon'}
}

const privatTx = {
	id: 2,
	t_id: 'privat-1',
	date: '2000000',
	amount: '-20.00',
	details: 'Privat shop',
	category_details: 'Groceries',
	category: {id: 11, code: 'products', name: 'Products', icon: 'food-icon'},
	rawCategory: '10',
	bankCategory: '10'
}

const monoTxB = {
	...monoTx,
	id: 3,
	t_id: 'mono-2',
	time: 3000,
	amount: '-30.00',
	description: 'Mono transport',
	category: {id: 20, code: 'transport', name: 'Transport', icon: 'car-icon'}
}

const monoTxApi = {
	...monoTx,
	id: 4,
	t_id: 'mono-api',
	time: 1200,
	amount: '-12.00',
	description: 'Mono API refreshed'
}

const monoTxSeptember = {
	...monoTx,
	id: 5,
	t_id: 'mono-september',
	time: Math.floor(new Date(2026, 8, 10, 12, 0, 0, 0).getTime() / 1000),
	description: 'Mono September cached'
}

const monoTxSeptemberLater = {
	...monoTx,
	id: 6,
	t_id: 'mono-september-later',
	time: Math.floor(new Date(2026, 8, 20, 12, 0, 0, 0).getTime() / 1000),
	description: 'Mono September outside selected subset'
}

test.beforeEach(() => {
	localStorage.clear()
	navigator.onLine = true
})

test('normalizes Mono seconds to milliseconds and uses provider + t_id key', () => {
	const record = normalizeProviderTransaction('mono', monoTx, 123)
	assert.equal(record.provider, 'mono')
	assert.equal(record.providerTransactionId, 'mono-1')
	assert.equal(record.timestamp, 1000000)
	assert.equal(record.amount, -10.5)
})

test('normalizes Privat milliseconds as milliseconds', () => {
	const record = normalizeProviderTransaction('privat', privatTx, 123)
	assert.equal(record.provider, 'privat')
	assert.equal(record.providerTransactionId, 'privat-1')
	assert.equal(record.timestamp, 2000000)
	assert.equal(record.amount, -20)
})

test('repeated API response upserts instead of duplicating records', async () => {
	const client = new FakeIndexedDbClient()
	const repo = makeRepo(client)
	const range = {dateFrom: 0, dateTo: 3000000}
	await repo.saveRange({mono: [monoTx], privat: []}, range)
	await repo.saveRange({mono: [monoTx], privat: []}, range)
	assert.equal(client.stores.transactions.size, 1)
	const cached = await repo.getRange(range)
	assert.equal(cached.data.mono.length, 1)
})

test('loading range B does not delete cached range A and range A remains available offline', async () => {
	const client = new FakeIndexedDbClient()
	const repo = makeRepo(client)
	const rangeA = {dateFrom: 0, dateTo: 1500000}
	const rangeB = {dateFrom: 1500001, dateTo: 3000000}
	await repo.saveRange({mono: [monoTx], privat: []}, rangeA)
	await repo.saveRange({mono: [], privat: [privatTx]}, rangeB)
	const cachedA = await repo.getRange(rangeA)
	const cachedB = await repo.getRange(rangeB)
	assert.equal(cachedA.data.mono[0].providerTransactionId, 'mono-1')
	assert.equal(cachedB.data.privat[0].providerTransactionId, 'privat-1')
})

test('fetched empty range is complete with itemCount 0', async () => {
	const client = new FakeIndexedDbClient()
	const repo = makeRepo(client)
	const range = {dateFrom: 3000001, dateTo: 4000000}
	await repo.saveRange({mono: [], privat: []}, range)
	const cached = await repo.getRange(range)
	assert.equal(cached.coverage.status, 'complete')
	assert.equal(cached.coverage.complete, true)
	assert.deepEqual(cached.coverage.windows.map(window => window.itemCount), [0, 0])
})

test('never-fetched empty range is distinct from fetched empty range', async () => {
	const repo = makeRepo(new FakeIndexedDbClient())
	const cached = await repo.getRange({dateFrom: 5000000, dateTo: 6000000})
	assert.equal(cached.coverage.status, 'not_fetched')
	assert.equal(cached.coverage.complete, false)
	assert.equal(cached.data.mono.length + cached.data.privat.length, 0)
})

test('localStorage migration is partial and idempotent without duplicate transactions', async () => {
	localStorage.setItem('hboo-transaction-cache-v1', JSON.stringify({
		version: 1,
		updatedAt: 123,
		data: {mono: [monoTx], privat: []}
	}))
	const client = new FakeIndexedDbClient()
	const repo = makeRepo(client)
	await repo.ensureMigrated()
	await repo.ensureMigrated()
	const marker = client.stores.meta.get(MIGRATION_MARKER_KEY)
	const cached = await repo.getRange({dateFrom: 0, dateTo: 1500000})
	assert.equal(marker.value, true)
	assert.equal(client.stores.transactions.size, 1)
	assert.equal(cached.coverage.status, 'partial')
})

test('IndexedDB failure falls back to existing localStorage cache', async () => {
	localStorage.setItem('hboo-transaction-cache-v1', JSON.stringify({
		version: 1,
		updatedAt: 123,
		data: {mono: [monoTx], privat: []}
	}))
	const repo = makeRepo(new FakeIndexedDbClient({fail: true}))
	const cached = await repo.getRange({dateFrom: 0, dateTo: 1500000})
	assert.equal(cached.fallback, true)
	assert.equal(cached.data.mono.length, 1)
	assert.equal(cached.coverage.status, 'partial')
})

test('complete cached range renders locally without treating skipped API as stale', async () => {
	const client = new FakeIndexedDbClient()
	const repo = makeRepo(client)
	const range = {dateFrom: 0, dateTo: 1500000}
	await repo.saveRange({mono: [monoTx], privat: []}, range)
	let apiCalls = 0
	const store = new TransactionStore({
		repository: repo,
		apiService: {
			getTransactions: async () => {
				apiCalls += 1
				throw new Error('network down')
			}
		}
	})
	const state = await store.refresh('?date_from=0&date_to=1500000')
	assert.equal(state.loaded, true)
	assert.equal(state.stale, false)
	assert.equal(apiCalls, 0)
	assert.equal(state.data.mono.length, 1)
})

test('offline selecting cached range A after range B replaces state with A', async () => {
	const repo = makeRepo(new FakeIndexedDbClient())
	const rangeA = {dateFrom: 0, dateTo: 1500000}
	const rangeB = {dateFrom: 2500000, dateTo: 3500000}
	await repo.saveRange({mono: [monoTx], privat: []}, rangeA)
	await repo.saveRange({mono: [monoTxB], privat: []}, rangeB)
	const store = new TransactionStore({
		repository: repo,
		apiService: {
			getTransactions: async () => {
				throw new Error('offline')
			}
		}
	})

	navigator.onLine = false
	await store.refresh('?date_from=2500000&date_to=3500000')
	const state = await store.refresh('?date_from=0&date_to=1500000')

	assert.equal(state.data.mono.length, 1)
	assert.equal(state.data.mono[0].providerTransactionId, 'mono-1')
	assert.equal(state.coverage.status, 'complete')
})

test('offline A to B to A switches transaction state each time', async () => {
	const repo = makeRepo(new FakeIndexedDbClient())
	const rangeA = {dateFrom: 0, dateTo: 1500000}
	const rangeB = {dateFrom: 2500000, dateTo: 3500000}
	await repo.saveRange({mono: [monoTx], privat: []}, rangeA)
	await repo.saveRange({mono: [monoTxB], privat: []}, rangeB)
	const store = new TransactionStore({
		repository: repo,
		apiService: {
			getTransactions: async () => {
				throw new Error('offline')
			}
		}
	})

	navigator.onLine = false
	const stateA1 = await store.refresh('?date_from=0&date_to=1500000')
	const stateB = await store.refresh('?date_from=2500000&date_to=3500000')
	const stateA2 = await store.refresh('?date_from=0&date_to=1500000')

	assert.equal(stateA1.data.mono[0].providerTransactionId, 'mono-1')
	assert.equal(stateB.data.mono[0].providerTransactionId, 'mono-2')
	assert.equal(stateA2.data.mono[0].providerTransactionId, 'mono-1')
})

test('offline selecting never-fetched range clears previous transactions', async () => {
	const repo = makeRepo(new FakeIndexedDbClient())
	await repo.saveRange({mono: [monoTx], privat: []}, {dateFrom: 0, dateTo: 1500000})
	const store = new TransactionStore({
		repository: repo,
		apiService: {
			getTransactions: async () => {
				throw new Error('offline')
			}
		}
	})

	navigator.onLine = false
	await store.refresh('?date_from=0&date_to=1500000')
	const state = await store.refresh('?date_from=7000000&date_to=8000000')

	assert.equal(state.loaded, true)
	assert.equal(state.data.mono.length, 0)
	assert.equal(state.data.privat.length, 0)
	assert.equal(state.coverage.status, 'not_fetched')
})

test('offline selecting known-complete empty range renders empty complete state', async () => {
	const repo = makeRepo(new FakeIndexedDbClient())
	await repo.saveRange({mono: [monoTx], privat: []}, {dateFrom: 0, dateTo: 1500000})
	await repo.saveRange({mono: [], privat: []}, {dateFrom: 9000000, dateTo: 9500000})
	const store = new TransactionStore({
		repository: repo,
		apiService: {
			getTransactions: async () => {
				throw new Error('offline')
			}
		}
	})

	navigator.onLine = false
	const state = await store.refresh('?date_from=9000000&date_to=9500000')

	assert.equal(state.data.mono.length + state.data.privat.length, 0)
	assert.equal(state.coverage.status, 'complete')
	assert.equal(state.coverage.complete, true)
})

test('local complete cached range remains visible online without unnecessary API refresh', async () => {
	const repo = makeRepo(new FakeIndexedDbClient())
	await repo.saveRange({mono: [monoTx], privat: []}, {dateFrom: 0, dateTo: 1500000})
	let apiCalls = 0
	const store = new TransactionStore({
		repository: repo,
		apiService: {
			getTransactions: async () => {
				apiCalls += 1
				throw new Error('server down')
			}
		}
	})

	navigator.onLine = true
	const state = await store.refresh('?date_from=0&date_to=1500000')

	assert.equal(state.stale, false)
	assert.equal(apiCalls, 0)
	assert.equal(state.data.mono[0].providerTransactionId, 'mono-1')
})

test('category filtering operates on the newly selected offline range', async () => {
	const repo = makeRepo(new FakeIndexedDbClient())
	await repo.saveRange({mono: [monoTx], privat: []}, {dateFrom: 0, dateTo: 1500000})
	await repo.saveRange({mono: [monoTxB], privat: []}, {dateFrom: 2500000, dateTo: 3500000})
	const store = new TransactionStore({
		repository: repo,
		apiService: {
			getTransactions: async () => {
				throw new Error('offline')
			}
		}
	})

	navigator.onLine = false
	const state = await store.refresh('?date_from=2500000&date_to=3500000')
	const filtered = state.data.mono.filter(transaction => String(transaction.category?.id || '') === '20')

	assert.equal(filtered.length, 1)
	assert.equal(filtered[0].providerTransactionId, 'mono-2')
})

test('online selected complete range renders local data without API refresh', async () => {
	const repo = makeRepo(new FakeIndexedDbClient())
	await repo.saveRange({mono: [monoTx], privat: []}, {dateFrom: 0, dateTo: 1500000})
	const states = []
	let apiCalls = 0
	const store = new TransactionStore({
		repository: repo,
		apiService: {
			getTransactions: async () => {
				apiCalls += 1
				return {mono: [monoTxApi], privat: []}
			}
		}
	})
	store.subscribe(state => states.push(state))

	navigator.onLine = true
	const finalState = await store.refresh('?date_from=0&date_to=1500000')
	const localState = states.find(state => state.source === 'cache')

	assert.equal(localState.data.mono[0].providerTransactionId, 'mono-1')
	assert.equal(localState.loading, false)
	assert.equal(apiCalls, 0)
	assert.equal(finalState.source, 'cache')
	assert.equal(finalState.data.mono[0].providerTransactionId, 'mono-1')
})

test('restored September range loads from cache after offline reload', async () => {
	const repo = makeRepo(new FakeIndexedDbClient())
	const septemberRange = {
		dateFrom: new Date(2026, 8, 1, 0, 0, 0, 0).getTime(),
		dateTo: new Date(2026, 8, 18, 23, 59, 59, 999).getTime()
	}
	await repo.saveRange({mono: [monoTxSeptember], privat: []}, septemberRange)
	saveTransactionRangePreference(septemberRange)
	let apiCalls = 0
	const store = new TransactionStore({
		repository: repo,
		apiService: {
			getTransactions: async () => {
				apiCalls += 1
				throw new Error('offline')
			}
		}
	})

	navigator.onLine = false
	const state = await store.load('')

	assert.equal(apiCalls, 0)
	assert.equal(state.range.dateFrom, septemberRange.dateFrom)
	assert.equal(state.range.dateTo, septemberRange.dateTo)
	assert.equal(state.data.mono[0].providerTransactionId, 'mono-september')
})

test('startup online renders complete restored local range without unnecessary API request', async () => {
	const repo = makeRepo(new FakeIndexedDbClient())
	const range = {
		dateFrom: new Date(2026, 8, 1, 0, 0, 0, 0).getTime(),
		dateTo: new Date(2026, 8, 18, 23, 59, 59, 999).getTime()
	}
	await repo.saveRange({mono: [monoTxSeptember], privat: []}, range)
	saveTransactionRangePreference(range)
	const states = []
	let requestedQuery = null
	const store = new TransactionStore({
		repository: repo,
		apiService: {
			getTransactions: async query => {
				requestedQuery = query
				throw new Error('complete cache should not fetch')
			}
		}
	})
	store.subscribe(state => states.push(state))

	navigator.onLine = true
	const state = await store.load('')
	const localState = states.find(item => item.source === 'cache')

	assert.equal(localState.loading, false)
	assert.equal(requestedQuery, null)
	assert.equal(state.source, 'cache')
	assert.equal(state.range.dateFrom, range.dateFrom)
	assert.equal(state.range.dateTo, range.dateTo)
})

test('startup online fetches API when restored range cache is incomplete', async () => {
	const repo = makeRepo(new FakeIndexedDbClient())
	const range = {
		dateFrom: new Date(2026, 7, 1, 0, 0, 0, 0).getTime(),
		dateTo: new Date(2026, 7, 31, 23, 59, 59, 999).getTime()
	}
	saveTransactionRangePreference(range)
	let requestedQuery = null
	const store = new TransactionStore({
		repository: repo,
		apiService: {
			getTransactions: async query => {
				requestedQuery = query
				return {mono: [monoTxApi], privat: []}
			}
		}
	})

	navigator.onLine = true
	const state = await store.load('')

	assert.equal(requestedQuery, getQueryFromRange(range))
	assert.equal(state.source, 'api')
	assert.equal(state.range.dateFrom, range.dateFrom)
	assert.equal(state.range.dateTo, range.dateTo)
})

test('transaction page date filter lifecycle keeps selected August range authoritative', async () => {
	const previousDocument = globalThis.document
	const previousLocation = globalThis.location
	const previousFetch = globalThis.fetch
	const septemberRange = normalizeTransactionDateSelection({
		from: '2026-09-01',
		to: '2026-09-28'
	}, {now: new Date(2026, 8, 28, 12, 0, 0, 0)})
	const augustRange = normalizeTransactionDateSelection({
		from: '2026-08-01',
		to: '2026-08-31'
	}, {now: new Date(2026, 8, 28, 12, 0, 0, 0)})
	const inputFrom = {value: '2026-09-01', classList: {add() {}, remove() {}}, addEventListener() {}}
	const inputTo = {value: '2026-09-28', classList: {add() {}, remove() {}}, addEventListener() {}}
	const fakeElement = () => ({
		dataset: {},
		classList: {add() {}, remove() {}, toggle() {}},
		style: {},
		children: [],
		append(child) { this.children.push(child) },
		appendChild(child) { this.children.push(child) },
		remove() {},
		addEventListener() {},
		set innerHTML(value) { this.html = value },
		get innerHTML() { return this.html || '' },
		querySelector() { return null },
		querySelectorAll() { return [] }
	})
	const calendarTable = fakeElement()
	const fakeDatePicker = fakeElement()
	const monthSelect = {...fakeElement(), value: '7'}
	const yearSelect = {...fakeElement(), value: '2026'}
	fakeDatePicker.querySelector = selector => {
		if (selector === '.input-date-picker-from') return inputFrom
		if (selector === '.input-date-picker-to') return inputTo
		if (selector === '.calendar-table') return calendarTable
		if (selector === '#smonth') return monthSelect
		if (selector === '#syear') return yearSelect
		if (selector === 'td.active') return null
		return null
	}
	const body = fakeElement()
	const appRoot = fakeElement()
	const headerDate = fakeElement()
	const documentRef = {
		body,
		head: fakeElement(),
		createElement: () => fakeElement(),
		getElementById: () => null,
		querySelector: selector => {
			if (selector === 'date-picker') return fakeDatePicker
			if (selector === 'body') return body
			if (selector === 'hb-app') return appRoot
			if (selector === '.transactions-today-date') return headerDate
			return null
		}
	}
	const hbappRoot = fakeElement()
	hbappRoot.querySelector = selector => {
		if (selector === 'date-picker') return fakeDatePicker
		if (selector === '.transaction-filters .input-date-picker-from') return inputFrom
		if (selector === '.transaction-filters .input-date-picker-to') return inputTo
		return null
	}
	globalThis.document = documentRef
	globalThis.location = {search: ''}
	globalThis.fetch = async () => ({status: 200, json: async () => []})

	const {default: transactionStore} = await import('../hbapp/stores/TransactionStore.js')
	const {default: router} = await import('../hbapp/router/router.js')
	const TransactionPage = router.routers.transaction
	const originalStore = {
		getState: transactionStore.getState,
		subscribe: transactionStore.subscribe,
		load: transactionStore.load,
		refresh: transactionStore.refresh,
		saveSelectedRange: transactionStore.saveSelectedRange
	}
	let storeState = {
		data: {mono: [monoTxSeptember], privat: []},
		updatedAt: 1,
		loading: false,
		loaded: true,
		source: 'cache',
		stale: false,
		coverage: {complete: true, status: 'complete', windows: []},
		range: septemberRange,
		error: null
	}
	const listeners = new Set()
	const refreshCalls = []
	transactionStore.getState = () => ({...storeState, data: JSON.parse(JSON.stringify(storeState.data))})
	transactionStore.subscribe = listener => {
		listeners.add(listener)
		listener(transactionStore.getState())
		return () => listeners.delete(listener)
	}
	transactionStore.load = () => Promise.resolve(transactionStore.getState())
	transactionStore.refresh = async (query = '', {range} = {}) => {
		refreshCalls.push({query, range})
		storeState = {
			...storeState,
			data: {mono: [], privat: []},
			loading: true,
			loaded: true,
			source: 'cache',
			range
		}
		listeners.forEach(listener => listener(transactionStore.getState()))
		await Promise.resolve()
		storeState = {
			...storeState,
			data: {mono: [{...monoTxB, time: Math.floor(new Date(2026, 7, 15, 12).getTime() / 1000)}], privat: []},
			loading: false,
			source: 'api',
			range
		}
		listeners.forEach(listener => listener(transactionStore.getState()))
		return transactionStore.getState()
	}
	let savedRange = null
	transactionStore.saveSelectedRange = range => {
		savedRange = range
		return range
	}

	try {
		const page = new TransactionPage(hbappRoot)
		inputFrom.value = '2026-08-01'
		inputTo.value = '2026-08-31'
		await page.processingClickEvent({
			target: {
				closest: selector => selector === '[data-action]' || selector === '.filter-by-date'
					? {dataset: {action: 'apply-date-filter'}}
					: null,
				classList: {contains: () => false}
			},
			preventDefault() {}
		})
		await Promise.resolve()

		assert.equal(refreshCalls.length, 1)
		assert.equal(refreshCalls[0].range.dateFrom, augustRange.dateFrom)
		assert.equal(refreshCalls[0].range.dateTo, augustRange.dateTo)
		assert.equal(inputFrom.value, '2026-08-01')
		assert.equal(inputTo.value, '2026-08-31')
		assert.equal(page.appliedDateRange.from, '2026-08-01')
		assert.equal(page.appliedDateRange.to, '2026-08-31')
		assert.equal(transactionStore.getState().range.dateFrom, augustRange.dateFrom)
		assert.equal(transactionStore.getState().range.dateTo, augustRange.dateTo)
		assert.equal(savedRange.dateFrom, augustRange.dateFrom)
		assert.equal(savedRange.dateTo, augustRange.dateTo)
	} finally {
		Object.assign(transactionStore, originalStore)
		globalThis.document = previousDocument
		globalThis.location = previousLocation
		globalThis.fetch = previousFetch
	}
})

test('transaction filter modal apply reads overlay inputs outside page root before refresh', async () => {
	const previousDocument = globalThis.document
	const previousLocation = globalThis.location
	const previousFetch = globalThis.fetch
	const septemberRange = normalizeTransactionDateSelection({
		from: '2026-09-01',
		to: '2026-09-28'
	}, {now: new Date(2026, 8, 28, 12, 0, 0, 0)})
	const augustRange = normalizeTransactionDateSelection({
		from: '2026-08-01',
		to: '2026-08-31'
	}, {now: new Date(2026, 8, 28, 12, 0, 0, 0)})
	const fakeElement = () => ({
		dataset: {},
		classList: {add() {}, remove() {}, toggle() {}},
		children: [],
		append(child) { this.children.push(child) },
		appendChild(child) { this.children.push(child) },
		remove() {},
		addEventListener() {},
		set innerHTML(value) { this.html = value },
		get innerHTML() { return this.html || '' },
		querySelector() { return null },
		querySelectorAll() { return [] }
	})
	const modalFrom = {value: '2026-08-01'}
	const modalTo = {value: '2026-08-31'}
	const modalCategory = {value: 'ALL'}
	const modal = fakeElement()
	modal.querySelector = selector => {
		if (selector === '[data-filter-field="from"]') return modalFrom
		if (selector === '[data-filter-field="to"]') return modalTo
		if (selector === '.transaction-filter-modal-category') return modalCategory
		return null
	}
	const body = fakeElement()
	const appRoot = fakeElement()
	const headerDate = fakeElement()
	const documentRef = {
		body,
		head: fakeElement(),
		createElement: () => fakeElement(),
		getElementById: () => null,
		querySelector: selector => {
			if (selector === '.transaction-filter-modal') return modal
			if (selector === 'body') return body
			if (selector === 'hb-app') return appRoot
			if (selector === '.transactions-today-date') return headerDate
			return null
		}
	}
	const hbappRoot = fakeElement()
	hbappRoot.querySelector = selector => {
		if (selector === '[data-filter-field="from"]') return null
		if (selector === '[data-filter-field="to"]') return null
		return null
	}
	globalThis.document = documentRef
	globalThis.location = {search: ''}
	globalThis.fetch = async () => ({status: 200, json: async () => []})

	const {default: transactionStore} = await import('../hbapp/stores/TransactionStore.js')
	const {default: router} = await import('../hbapp/router/router.js')
	const TransactionPage = router.routers.transaction
	const originalStore = {
		getState: transactionStore.getState,
		subscribe: transactionStore.subscribe,
		load: transactionStore.load,
		refresh: transactionStore.refresh,
		saveSelectedRange: transactionStore.saveSelectedRange
	}
	let storeState = {
		data: {mono: [monoTxSeptember], privat: []},
		updatedAt: 1,
		loading: false,
		loaded: true,
		source: 'cache',
		stale: false,
		coverage: {complete: true, status: 'complete', windows: []},
		range: septemberRange,
		error: null
	}
	const listeners = new Set()
	const refreshCalls = []
	transactionStore.getState = () => ({...storeState, data: JSON.parse(JSON.stringify(storeState.data))})
	transactionStore.subscribe = listener => {
		listeners.add(listener)
		listener(transactionStore.getState())
		return () => listeners.delete(listener)
	}
	transactionStore.load = () => Promise.resolve(transactionStore.getState())
	transactionStore.refresh = async (query = '', {range} = {}) => {
		refreshCalls.push({query, range})
		storeState = {
			...storeState,
			data: {mono: [], privat: []},
			loaded: true,
			source: 'api',
			range
		}
		listeners.forEach(listener => listener(transactionStore.getState()))
		return transactionStore.getState()
	}
	transactionStore.saveSelectedRange = range => range

	try {
		const page = new TransactionPage(hbappRoot)
		page.appliedDateRange = {from: '2026-09-01', to: '2026-09-28'}
		page.filterDraft = {
			from: '2026-09-01',
			to: '2026-09-28',
			categoryId: 'ALL',
			banks: ['mono', 'privat']
		}
		page.filtersModalOpen = true
		await page.applyFilterModal()

		assert.equal(refreshCalls.length, 1)
		assert.equal(refreshCalls[0].range.dateFrom, augustRange.dateFrom)
		assert.equal(refreshCalls[0].range.dateTo, augustRange.dateTo)
		assert.equal(page.appliedDateRange.from, '2026-08-01')
		assert.equal(page.appliedDateRange.to, '2026-08-31')
	} finally {
		Object.assign(transactionStore, originalStore)
		globalThis.document = previousDocument
		globalThis.location = previousLocation
		globalThis.fetch = previousFetch
	}
})

test('late default startup refresh cannot overwrite a newer selected transaction range', async () => {
	const repo = makeRepo(new FakeIndexedDbClient())
	const defaultRange = {
		dateFrom: new Date(2026, 8, 1, 0, 0, 0, 0).getTime(),
		dateTo: new Date(2026, 8, 28, 12, 0, 0, 0).getTime()
	}
	const augustRange = normalizeTransactionDateSelection({
		from: '2026-08-01',
		to: '2026-08-31'
	}, {now: new Date(2026, 8, 28, 12, 0, 0, 0)})
	const augustTransaction = {
		...monoTxB,
		time: Math.floor(new Date(2026, 7, 15, 12, 0, 0, 0).getTime() / 1000)
	}
	const pending = new Map()
	const apiService = {
		getTransactions: query => new Promise(resolve => {
			pending.set(query, resolve)
		})
	}
	const store = new TransactionStore({repository: repo, apiService})

	navigator.onLine = true
	const defaultPromise = store.refresh('', {range: defaultRange})
	await waitFor(() => pending.has(getQueryFromRange(defaultRange)))
	const augustPromise = store.refresh('', {range: augustRange})
	await waitFor(() => pending.has(getQueryFromRange(augustRange)))

	pending.get(getQueryFromRange(augustRange))({mono: [augustTransaction], privat: []})
	const augustState = await augustPromise
	pending.get(getQueryFromRange(defaultRange))({mono: [monoTxSeptember], privat: []})
	const finalState = await defaultPromise

	assert.equal(augustState.range.dateFrom, augustRange.dateFrom)
	assert.equal(augustState.range.dateTo, augustRange.dateTo)
	assert.equal(getDateInputValue(augustState.range.dateFrom), '2026-08-01')
	assert.equal(getDateInputValue(augustState.range.dateTo), '2026-08-31')
	assert.equal(finalState.range.dateFrom, augustRange.dateFrom)
	assert.equal(finalState.range.dateTo, augustRange.dateTo)
	assert.equal(getDateInputValue(finalState.range.dateFrom), '2026-08-01')
	assert.equal(getDateInputValue(finalState.range.dateTo), '2026-08-31')
	assert.equal(store.getState().data.mono[0].providerTransactionId, 'mono-2')
})

test('API-normalized historical transactions persist to IDB and feed Home 6M monthly analytics', async () => {
	const repo = makeRepo(new FakeIndexedDbClient())
	const julyRange = normalizeTransactionDateSelection({
		from: '2026-07-01',
		to: '2026-07-31'
	}, {now: new Date(2026, 8, 28, 12, 0, 0, 0)})
	const augustRange = normalizeTransactionDateSelection({
		from: '2026-08-01',
		to: '2026-08-31'
	}, {now: new Date(2026, 8, 28, 12, 0, 0, 0)})
	const apiTx = ({id, t_id, time, amount, description = 'Synthetic transaction'}) => ({
		id,
		t_id,
		time: Math.floor(time / 1000),
		amount: String(amount),
		description,
		mcc: 5411,
		category: {id: 10, code: 'food', name: 'Food', icon: 'food-icon'}
	})

	await repo.saveRange({
		mono: [
			apiTx({id: 1001, t_id: 'july-income', time: new Date(2026, 6, 2, 12).getTime(), amount: '55500.00'}),
			apiTx({id: 1002, t_id: 'july-expense', time: new Date(2026, 6, 14, 12).getTime(), amount: '-34650.75'})
		],
		privat: []
	}, julyRange)
	await repo.saveRange({
		mono: [
			apiTx({id: 2001, t_id: 'august-income', time: new Date(2026, 7, 2, 12).getTime(), amount: '55700.00'}),
			apiTx({id: 2002, t_id: 'august-expense', time: new Date(2026, 7, 18, 12).getTime(), amount: '-48560.40'})
		],
		privat: []
	}, augustRange)

	const homeRange = getRecentMonthRange(6, new Date(2026, 8, 28, 12, 0, 0, 0))
	const cache = await repo.getRange(homeRange)
	const coverage = await repo.getCoverage(homeRange)
	const monthly = addCoverageToMonthlyIncomeExpenses(
		getMonthlyIncomeExpenses(cache.data, homeRange),
		coverage
	)
	const july = monthly.find(item => item.month === '2026-07')
	const august = monthly.find(item => item.month === '2026-08')

	assert.equal(cache.data.mono.length, 4)
	assert.equal(july.income, 55500)
	assert.equal(july.expenses, 34650.75)
	assert.equal(august.income, 55700)
	assert.equal(august.expenses, 48560.4)
	assert.equal(july.coverage, 'complete')
	assert.equal(august.coverage, 'complete')
})

test('manual transaction refresh still fetches API for a complete cached range', async () => {
	const repo = makeRepo(new FakeIndexedDbClient())
	const range = {dateFrom: 0, dateTo: 1500000}
	await repo.saveRange({mono: [monoTx], privat: []}, range)
	let requestedQuery = null
	const store = new TransactionStore({
		repository: repo,
		apiService: {
			getTransactions: async query => {
				requestedQuery = query
				return {mono: [monoTxApi], privat: []}
			}
		}
	})

	navigator.onLine = true
	const state = await store.refresh('?updateTransaction=1', {range})

	assert.match(requestedQuery, /updateTransaction=1/)
	assert.equal(state.source, 'api')
	assert.equal(state.data.mono[0].providerTransactionId, 'mono-api')
})

test('API, IndexedDB range lookup, saveRange and transactionWindows use identical boundaries', async () => {
	const repo = makeRepo(new FakeIndexedDbClient())
	const selectedRange = normalizeTransactionDateSelection({
		from: '2026-09-01',
		to: '2026-09-18'
	}, {now: new Date(2026, 8, 21, 12, 0, 0, 0)})
	const calls = {
		apiQuery: null,
		getRanges: [],
		saveRanges: []
	}
	const originalGetRange = repo.getRange.bind(repo)
	const originalSaveRange = repo.saveRange.bind(repo)
	repo.getRange = async range => {
		calls.getRanges.push({...range})
		return originalGetRange(range)
	}
	repo.saveRange = async (data, range) => {
		calls.saveRanges.push({...range})
		return originalSaveRange(data, range)
	}
	const store = new TransactionStore({
		repository: repo,
		apiService: {
			getTransactions: async query => {
				calls.apiQuery = query
				return {mono: [monoTxSeptember], privat: []}
			}
		}
	})

	navigator.onLine = true
	const state = await store.refresh('', {range: selectedRange})
	const params = new URLSearchParams(calls.apiQuery.replace(/^\?/, ''))
	const windows = Array.from(repo.indexedDbClient.stores.transactionWindows.values())

	assert.deepEqual(calls.getRanges[0], selectedRange)
	assert.deepEqual(calls.saveRanges[0], selectedRange)
	assert.equal(Number(params.get('date_from')), selectedRange.dateFrom)
	assert.equal(Number(params.get('date_to')), selectedRange.dateTo)
	assert.equal(state.range.dateFrom, selectedRange.dateFrom)
	assert.equal(state.range.dateTo, selectedRange.dateTo)
	assert.equal(windows.length, 2)
	assert.ok(windows.every(window => window.dateFrom === selectedRange.dateFrom && window.dateTo === selectedRange.dateTo))
})

test('uncached empty historical range fetches API, stores complete empty window and does not fall back', async () => {
	const repo = makeRepo(new FakeIndexedDbClient())
	const emptyRange = normalizeTransactionDateSelection({
		from: '2026-06-01',
		to: '2026-06-02'
	}, {now: new Date(2026, 8, 28, 12, 0, 0, 0)})
	let requestedQuery = null
	const store = new TransactionStore({
		repository: repo,
		apiService: {
			getTransactions: async query => {
				requestedQuery = query
				return {mono: [], privat: []}
			}
		}
	})

	navigator.onLine = true
	const state = await store.refresh('', {range: emptyRange})
	const cached = await repo.getRange(emptyRange)

	assert.equal(requestedQuery, getQueryFromRange(emptyRange))
	assert.equal(state.range.dateFrom, emptyRange.dateFrom)
	assert.equal(state.range.dateTo, emptyRange.dateTo)
	assert.equal(state.data.mono.length, 0)
	assert.equal(state.data.privat.length, 0)
	assert.equal(cached.coverage.complete, true)
	assert.equal(getDateInputValue(state.range.dateFrom), '2026-06-01')
	assert.equal(getDateInputValue(state.range.dateTo), '2026-06-02')
})

test('subset of complete cached month stays selected, renders only subset and skips API', async () => {
	const repo = makeRepo(new FakeIndexedDbClient())
	const septemberRange = normalizeTransactionDateSelection({
		from: '2026-09-01',
		to: '2026-09-28'
	}, {now: new Date(2026, 8, 28, 12, 0, 0, 0)})
	const selectedRange = normalizeTransactionDateSelection({
		from: '2026-09-10',
		to: '2026-09-15'
	}, {now: new Date(2026, 8, 28, 12, 0, 0, 0)})
	await repo.saveRange({mono: [monoTxSeptember, monoTxSeptemberLater], privat: []}, septemberRange)
	let apiCalls = 0
	const store = new TransactionStore({
		repository: repo,
		apiService: {
			getTransactions: async () => {
				apiCalls += 1
				throw new Error('complete superset cache should satisfy subset')
			}
		}
	})

	navigator.onLine = true
	const state = await store.refresh('', {range: selectedRange})

	assert.equal(apiCalls, 0)
	assert.equal(state.range.dateFrom, selectedRange.dateFrom)
	assert.equal(state.range.dateTo, selectedRange.dateTo)
	assert.equal(state.coverage.complete, true)
	assert.deepEqual(state.data.mono.map(item => item.providerTransactionId), ['mono-september'])
	assert.equal(getDateInputValue(state.range.dateFrom), '2026-09-10')
	assert.equal(getDateInputValue(state.range.dateTo), '2026-09-15')
})

test('restored shifted filter preserves calendar dates and normalizes boundaries', () => {
	const shiftedRange = {
		dateFrom: new Date(2026, 8, 1, 3, 0, 0, 0).getTime(),
		dateTo: new Date(2026, 8, 18, 3, 0, 0, 0).getTime()
	}
	localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({
		version: 1,
		...shiftedRange,
		updatedAt: 1
	}))

	const range = getInitialRange('')

	assert.equal(getDateInputValue(range.dateFrom), '2026-09-01')
	assert.equal(getDateInputValue(range.dateTo), '2026-09-18')
	assert.equal(range.dateFrom, new Date(2026, 8, 1, 0, 0, 0, 0).getTime())
	assert.equal(range.dateTo, new Date(2026, 8, 18, 23, 59, 59, 999).getTime())
})

test('startup offline with restored range does not require API', async () => {
	const repo = makeRepo(new FakeIndexedDbClient())
	const range = {dateFrom: 0, dateTo: 1500000}
	await repo.saveRange({mono: [monoTx], privat: []}, range)
	saveTransactionRangePreference(range)
	let apiCalls = 0
	const store = new TransactionStore({
		repository: repo,
		apiService: {
			getTransactions: async () => {
				apiCalls += 1
				throw new Error('offline')
			}
		}
	})

	navigator.onLine = false
	const state = await store.load('')

	assert.equal(apiCalls, 0)
	assert.equal(state.data.mono[0].providerTransactionId, 'mono-1')
})

test('no saved transaction range falls back to current month default', () => {
	localStorage.removeItem(FILTER_STORAGE_KEY)
	const range = getInitialRange('')
	const now = new Date()
	const expectedFrom = new Date(now.getFullYear(), now.getMonth(), 1)
	expectedFrom.setHours(0, 0, 0, 0)

	assert.equal(range.dateFrom, expectedFrom.getTime())
	assert.ok(range.dateTo >= expectedFrom.getTime())
})

test('default current-month range starts at first local day boundary and ends at now', () => {
	const now = new Date(2026, 8, 21, 14, 15, 16, 789)
	const range = getDefaultTransactionRange(now)

	assert.equal(range.dateFrom, new Date(2026, 8, 1, 0, 0, 0, 0).getTime())
	assert.equal(range.dateTo, now.getTime())
})

test('historical from date normalizes to local start of day', () => {
	const now = new Date(2026, 8, 21, 14, 15, 16, 789)
	const range = normalizeTransactionDateSelection({from: '2026-09-10', to: '2026-09-12'}, {now})

	assert.equal(range.dateFrom, new Date(2026, 8, 10, 0, 0, 0, 0).getTime())
})

test('historical to date normalizes to local end of day', () => {
	const now = new Date(2026, 8, 21, 14, 15, 16, 789)
	const range = normalizeTransactionDateSelection({from: '2026-09-10', to: '2026-09-12'}, {now})

	assert.equal(range.dateTo, new Date(2026, 8, 12, 23, 59, 59, 999).getTime())
})

test('explicit historical August range survives normalization instead of reverting to current month', () => {
	const now = new Date(2026, 8, 28, 14, 15, 16, 789)
	const range = normalizeTransactionDateSelection({from: '2026-08-01', to: '2026-08-31'}, {now})

	assert.equal(range.dateFrom, new Date(2026, 7, 1, 0, 0, 0, 0).getTime())
	assert.equal(range.dateTo, new Date(2026, 7, 31, 23, 59, 59, 999).getTime())
	assert.equal(getDateInputValue(range.dateFrom), '2026-08-01')
	assert.equal(getDateInputValue(range.dateTo), '2026-08-31')
})

test('date picker writes zero-padded day values accepted by transaction range parser', () => {
	const source = read('hbapp/mixins/calendarHelper.js')

	assert.match(source, /selectedDay\.textContent\.padStart\(2, '0'\)/)
	assert.equal(
		normalizeTransactionDateSelection({from: '2026-08-1', to: '2026-08-31'}, {now: new Date(2026, 8, 28)}).dateFrom,
		getDefaultTransactionRange(new Date(2026, 8, 28)).dateFrom
	)
})

test('today to date normalizes to now instead of day start or end', () => {
	const now = new Date(2026, 8, 21, 14, 15, 16, 789)
	const range = normalizeTransactionDateSelection({from: '2026-09-01', to: '2026-09-21'}, {now})

	assert.equal(range.dateTo, now.getTime())
	assert.notEqual(range.dateTo, new Date(2026, 8, 21, 0, 0, 0, 0).getTime())
	assert.notEqual(range.dateTo, new Date(2026, 8, 21, 23, 59, 59, 999).getTime())
})

test('DST-sensitive dates use local calendar construction', () => {
	const now = new Date(2026, 9, 27, 12, 0, 0, 0)
	const range = normalizeTransactionDateSelection({from: '2026-10-25', to: '2026-10-25'}, {now})
	const from = new Date(range.dateFrom)
	const to = new Date(range.dateTo)

	assert.equal(range.dateFrom, new Date(2026, 9, 25, 0, 0, 0, 0).getTime())
	assert.equal(range.dateTo, new Date(2026, 9, 25, 23, 59, 59, 999).getTime())
	assert.equal(from.getFullYear(), 2026)
	assert.equal(from.getMonth(), 9)
	assert.equal(from.getDate(), 25)
	assert.equal(from.getHours(), 0)
	assert.equal(to.getHours(), 23)
	assert.equal(to.getMinutes(), 59)
	assert.equal(to.getSeconds(), 59)
	assert.equal(to.getMilliseconds(), 999)
})

test('invalid saved transaction range safely falls back to default range', () => {
	localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({
		version: 1,
		dateFrom: 2000,
		dateTo: 1000
	}))
	const range = getInitialRange('')

	assert.notEqual(range.dateFrom, 2000)
	assert.notEqual(range.dateTo, 1000)
	assert.ok(range.dateFrom <= range.dateTo)
})

test('snake_case and camelCase provider fields remain available for UI', async () => {
	const repo = makeRepo(new FakeIndexedDbClient())
	await repo.saveRange({mono: [monoTx], privat: [privatTx]}, {dateFrom: 0, dateTo: 3000000})
	const cached = await repo.getRange({dateFrom: 0, dateTo: 3000000})
	assert.equal(cached.data.mono[0].cashbackAmount, '1.00')
	assert.equal(cached.data.mono[0].cashback_amount, '1.00')
	assert.equal(cached.data.privat[0].categoryDetails, 'Groceries')
	assert.equal(cached.data.privat[0].category_details, 'Groceries')
})

test('manual updateTransaction query is passed through unchanged', async () => {
	const originalFetch = globalThis.fetch
	let requestedUrl = null
	globalThis.fetch = async url => {
		requestedUrl = url
		return {
			status: 200,
			json: async () => ({mono: [], privat: []})
		}
	}
	try {
		const {default: TransactionApiService} = await import('../hbapp/services/TransactionApiService.js')
		const service = new TransactionApiService()
		await service.getTransactions('?updateTransaction=1')
		assert.equal(requestedUrl, '/api/hbv2/transaction?updateTransaction=1')
	} finally {
		globalThis.fetch = originalFetch
	}
})
