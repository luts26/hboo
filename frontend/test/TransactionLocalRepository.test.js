import test from 'node:test'
import assert from 'node:assert/strict'

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

const makeRepo = client => new TransactionLocalRepository('hboo-transaction-cache-v1', {indexedDbClient: client})

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
	time: Math.floor(Date.parse('2026-09-10T12:00:00') / 1000),
	description: 'Mono September cached'
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

test('API/network failure keeps already rendered local transactions visible', async () => {
	const client = new FakeIndexedDbClient()
	const repo = makeRepo(client)
	const range = {dateFrom: 0, dateTo: 1500000}
	await repo.saveRange({mono: [monoTx], privat: []}, range)
	const store = new TransactionStore({
		repository: repo,
		apiService: {
			getTransactions: async () => {
				throw new Error('network down')
			}
		}
	})
	const state = await store.refresh('?date_from=0&date_to=1500000')
	assert.equal(state.loaded, true)
	assert.equal(state.stale, true)
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

test('local cached range remains visible when online API refresh fails', async () => {
	const repo = makeRepo(new FakeIndexedDbClient())
	await repo.saveRange({mono: [monoTx], privat: []}, {dateFrom: 0, dateTo: 1500000})
	const store = new TransactionStore({
		repository: repo,
		apiService: {
			getTransactions: async () => {
				throw new Error('server down')
			}
		}
	})

	navigator.onLine = true
	const state = await store.refresh('?date_from=0&date_to=1500000')

	assert.equal(state.stale, true)
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

test('online selected range renders local data first, then API refreshed data', async () => {
	const repo = makeRepo(new FakeIndexedDbClient())
	await repo.saveRange({mono: [monoTx], privat: []}, {dateFrom: 0, dateTo: 1500000})
	const states = []
	const store = new TransactionStore({
		repository: repo,
		apiService: {
			getTransactions: async () => ({mono: [monoTxApi], privat: []})
		}
	})
	store.subscribe(state => states.push(state))

	navigator.onLine = true
	const finalState = await store.refresh('?date_from=0&date_to=1500000')
	const localState = states.find(state => state.source === 'cache' && state.loading)

	assert.equal(localState.data.mono[0].providerTransactionId, 'mono-1')
	assert.equal(finalState.source, 'api')
	assert.equal(finalState.data.mono[0].providerTransactionId, 'mono-api')
})

test('restored September range loads from cache after offline reload', async () => {
	const repo = makeRepo(new FakeIndexedDbClient())
	const septemberRange = {dateFrom: Date.parse('2026-09-01T00:00:00'), dateTo: Date.parse('2026-09-18T23:59:59')}
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

test('startup online renders restored local range first and refreshes exact same API range', async () => {
	const repo = makeRepo(new FakeIndexedDbClient())
	const range = {dateFrom: 1000, dateTo: 1500000}
	await repo.saveRange({mono: [monoTx], privat: []}, range)
	saveTransactionRangePreference(range)
	const states = []
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
	store.subscribe(state => states.push(state))

	navigator.onLine = true
	const state = await store.load('')
	const localState = states.find(item => item.source === 'cache' && item.loading)

	assert.equal(localState.data.mono[0].providerTransactionId, 'mono-1')
	assert.equal(requestedQuery, getQueryFromRange(range))
	assert.equal(state.source, 'api')
	assert.equal(state.range.dateFrom, range.dateFrom)
	assert.equal(state.range.dateTo, range.dateTo)
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
