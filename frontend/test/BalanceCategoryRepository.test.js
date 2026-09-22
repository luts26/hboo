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
			balances: new Map(),
			categories: new Map()
		}
	}

	keyFor(storeName, value) {
		if (storeName === 'balances') return `${value.provider}:${value.accountId}`
		if (storeName === 'categories') return `${value.language}:${value.id}`
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
		return Array.from(this.stores[storeName].values()).filter(record => {
			if (query?.only !== undefined) return record[indexName] === query.only
			return true
		})
	}

	async transaction(storeNames, mode, callback) {
		if (this.fail) throw new Error('IndexedDB unavailable')
		return callback({
			put: async (storeName, value) => {
				this.stores[storeName].set(this.keyFor(storeName, value), value)
				return this.keyFor(storeName, value)
			},
			get: async (storeName, key) => this.get(storeName, key),
			getAll: async storeName => this.getAll(storeName),
			getAllFromIndex: async (storeName, indexName, query) => this.getAllFromIndex(storeName, indexName, query)
		})
	}
}

globalThis.IDBKeyRange = {
	only: value => ({only: value})
}
globalThis.localStorage = new LocalStorageMock()

const setUser = id => {
	localStorage.setItem('hboo-auth-v1', JSON.stringify({
		token: `token-${id}`,
		user: {id, username: `user-${id}`}
	}))
	localStorage.setItem('skfhb', `token-${id}`)
}

setUser(1)

const {
	default: BalanceLocalRepository,
	MIGRATION_MARKER_KEY: BALANCE_MIGRATION_MARKER,
	normalizeBalanceRecord
} = await import('../hbapp/services/BalanceLocalRepository.js')
const {BalanceStore} = await import('../hbapp/stores/BalanceStore.js')
const {
	default: CategoryLocalRepository,
	MIGRATION_MARKER_PREFIX,
	normalizeCategoryRecord
} = await import('../hbapp/services/CategoryLocalRepository.js')
const {default: CategoryApiService} = await import('../hbapp/services/CategoryApiService.js')

const monoBalance = {
	id: 1,
	balance: 1250000,
	credit_limit: 500000,
	c_id: 'mono-alpha',
	date: '1789106400',
	type: 'black'
}

const monoBalanceRefresh = {
	...monoBalance,
	balance: 1300000,
	date: '1789106500'
}

const privatBalance = {
	id: 2,
	account: 'privat-alpha',
	card_number: 'card-alpha',
	balance: 8600,
	credit_limit: 0,
	date: '1789106400000'
}

const categoryUk = {id: 3, code: 'food', name: 'Продукти', icon: 'food-icon', type: 'expense'}
const categoryEn = {id: 3, code: 'food', name: 'Food', icon: 'food-icon', type: 'expense'}

const makeBalanceRepo = client => new BalanceLocalRepository('hboo-balance-cache-v1', {indexedDbClient: client})
const makeCategoryRepo = client => new CategoryLocalRepository({indexedDbClient: client})

test.beforeEach(() => {
	localStorage.clear()
	setUser(1)
})

test('Balance legacy localStorage migrates into IndexedDB records', async () => {
	localStorage.setItem('hboo-balance-cache-v1', JSON.stringify({
		version: 1,
		updatedAt: 123,
		data: {mono: [monoBalance], privat: [privatBalance]}
	}))
	const client = new FakeIndexedDbClient()
	const repo = makeBalanceRepo(client)
	const cache = await repo.getLatest()

	assert.equal(cache.data.mono.length, 1)
	assert.equal(cache.data.privat.length, 1)
	assert.equal(client.stores.balances.size, 2)
	assert.equal(client.stores.meta.get(`${BALANCE_MIGRATION_MARKER}:1`).value, true)
})

test('Balance migration repeated is idempotent', async () => {
	localStorage.setItem('hboo-balance-cache-v1', JSON.stringify({
		version: 1,
		updatedAt: 123,
		data: {mono: [monoBalance], privat: [privatBalance]}
	}))
	const client = new FakeIndexedDbClient()
	const repo = makeBalanceRepo(client)
	await repo.ensureMigrated()
	await repo.ensureMigrated()

	assert.equal(client.stores.balances.size, 2)
})

test('Mono and Privat balances are stored independently', async () => {
	const client = new FakeIndexedDbClient()
	const repo = makeBalanceRepo(client)
	await repo.saveLatest({mono: [monoBalance], privat: [privatBalance]})

	assert.ok(client.stores.balances.has('mono:1:mono-alpha'))
	assert.ok(client.stores.balances.has('privat:1:privat-alpha'))
})

test('same provider/account balance refresh upserts instead of duplicating', async () => {
	const client = new FakeIndexedDbClient()
	const repo = makeBalanceRepo(client)
	await repo.saveLatest({mono: [monoBalance], privat: []})
	await repo.saveLatest({mono: [monoBalanceRefresh], privat: []})
	const cache = await repo.getLatest()

	assert.equal(client.stores.balances.size, 1)
	assert.equal(cache.data.mono[0].balance, 1300000)
})

test('Balance offline startup returns last known IndexedDB balances', async () => {
	const repo = makeBalanceRepo(new FakeIndexedDbClient())
	await repo.saveLatest({mono: [monoBalance], privat: [privatBalance]})
	const cache = await repo.getLatest()

	assert.equal(cache.data.mono[0].c_id, 'mono-alpha')
	assert.equal(cache.data.privat[0].account, 'privat-alpha')
})

test('Balance local data remains visible when API fails', async () => {
	const repo = makeBalanceRepo(new FakeIndexedDbClient())
	await repo.saveLatest({mono: [monoBalance], privat: []})
	const store = new BalanceStore({
		repository: repo,
		apiService: {
			getBalance: async () => {
				throw new Error('network down')
			}
		}
	})

	const state = await store.load()

	assert.equal(state.loaded, true)
	assert.equal(state.stale, true)
	assert.equal(state.data.mono[0].c_id, 'mono-alpha')
})

test('Balance successful API refresh updates IndexedDB', async () => {
	const repo = makeBalanceRepo(new FakeIndexedDbClient())
	const store = new BalanceStore({
		repository: repo,
		apiService: {
			getBalance: async () => ({mono: [monoBalanceRefresh], privat: []})
		}
	})

	const state = await store.load()
	const cache = await repo.getLatest()

	assert.equal(state.source, 'api')
	assert.equal(cache.data.mono[0].balance, 1300000)
})

test('Balance snapshotAt uses bank snapshot timestamp, not fetchedAt', () => {
	const record = normalizeBalanceRecord('mono', monoBalance, 9999999999999, '1')

	assert.equal(record.snapshotAt, 1789106400000)
	assert.equal(record.fetchedAt, 9999999999999)
})

test('Balance IndexedDB failure falls back to legacy localStorage', async () => {
	localStorage.setItem('hboo-balance-cache-v1', JSON.stringify({
		version: 1,
		updatedAt: 123,
		userId: '1',
		data: {mono: [monoBalance], privat: []}
	}))
	const repo = makeBalanceRepo(new FakeIndexedDbClient({fail: true}))
	const cache = await repo.getLatest()

	assert.equal(cache.fallback, true)
	assert.equal(cache.data.mono[0].c_id, 'mono-alpha')
})

test('Balance cache is isolated by user', async () => {
	const client = new FakeIndexedDbClient()
	const repo = makeBalanceRepo(client)
	await repo.saveLatest({mono: [monoBalance], privat: []})
	setUser(2)
	const cache = await repo.getLatest()

	assert.equal(cache.data.mono.length, 0)
})

test('Category legacy language cache migrates into IndexedDB records', async () => {
	localStorage.setItem('hboo-categories-v1:uk', JSON.stringify({
		version: 1,
		language: 'uk',
		updatedAt: '2026-09-01T00:00:00.000Z',
		items: [categoryUk]
	}))
	const client = new FakeIndexedDbClient()
	const repo = makeCategoryRepo(client)
	const cache = await repo.getCached('uk')

	assert.equal(cache.items[0].name, 'Продукти')
	assert.equal(client.stores.categories.size, 1)
	assert.equal(client.stores.meta.get(`${MIGRATION_MARKER_PREFIX}:uk`).value, true)
})

test('Category migration repeated does not duplicate records', async () => {
	localStorage.setItem('hboo-categories-v1:uk', JSON.stringify({
		version: 1,
		language: 'uk',
		updatedAt: '2026-09-01T00:00:00.000Z',
		items: [categoryUk]
	}))
	const client = new FakeIndexedDbClient()
	const repo = makeCategoryRepo(client)
	await repo.ensureMigrated('uk')
	await repo.ensureMigrated('uk')

	assert.equal(client.stores.categories.size, 1)
})

test('same category id in two languages stays isolated', async () => {
	const repo = makeCategoryRepo(new FakeIndexedDbClient())
	await repo.saveCached('uk', [categoryUk])
	await repo.saveCached('en', [categoryEn])

	const uk = await repo.getCached('uk')
	const en = await repo.getCached('en')
	assert.equal(uk.items[0].name, 'Продукти')
	assert.equal(en.items[0].name, 'Food')
})

test('reading category language A does not return language B', async () => {
	const repo = makeCategoryRepo(new FakeIndexedDbClient())
	await repo.saveCached('en', [categoryEn])
	const uk = await repo.getCached('uk')

	assert.equal(uk, null)
})

test('offline cached categories are returned without API dependency', async () => {
	const repo = makeCategoryRepo(new FakeIndexedDbClient())
	await repo.saveCached('uk', [categoryUk])
	const service = new CategoryApiService(repo)
	const originalFetch = globalThis.fetch
	globalThis.fetch = async () => {
		throw new Error('offline')
	}
	try {
		const items = await service.loadCategories('uk')
		assert.equal(items[0].name, 'Продукти')
	} finally {
		globalThis.fetch = originalFetch
	}
})

test('Planning route with cached categories uses local data without network refresh', async () => {
	const repo = makeCategoryRepo(new FakeIndexedDbClient())
	await repo.saveCached('uk', [categoryUk])
	const service = new CategoryApiService(repo)
	const originalFetch = globalThis.fetch
	let fetchCount = 0
	globalThis.fetch = async () => {
		fetchCount += 1
		throw new Error('network should not be used')
	}
	try {
		const items = await service.loadCategories('uk')
		assert.equal(items[0].name, 'Продукти')
		assert.equal(fetchCount, 0)
	} finally {
		globalThis.fetch = originalFetch
	}
})

test('Transactions route with cached categories uses local data without network refresh', async () => {
	const repo = makeCategoryRepo(new FakeIndexedDbClient())
	await repo.saveCached('uk', [categoryUk])
	const service = new CategoryApiService(repo)
	const originalFetch = globalThis.fetch
	let fetchCount = 0
	globalThis.fetch = async () => {
		fetchCount += 1
		throw new Error('network should not be used')
	}
	try {
		const items = await service.getCategories('uk')
		assert.equal(items[0].name, 'Продукти')
		assert.equal(fetchCount, 0)
	} finally {
		globalThis.fetch = originalFetch
	}
})

test('never-cached language does not use another language fallback', async () => {
	const repo = makeCategoryRepo(new FakeIndexedDbClient())
	await repo.saveCached('en', [categoryEn])
	const service = new CategoryApiService(repo)
	const originalFetch = globalThis.fetch
	globalThis.fetch = async () => {
		throw new Error('offline')
	}
	try {
		await assert.rejects(() => service.loadCategories('uk'))
	} finally {
		globalThis.fetch = originalFetch
	}
})

test('missing categories cache fetches from API and persists result', async () => {
	const repo = makeCategoryRepo(new FakeIndexedDbClient())
	const service = new CategoryApiService(repo)
	const originalFetch = globalThis.fetch
	let fetchCount = 0
	globalThis.fetch = async (url, request = {}) => {
		fetchCount += 1
		assert.equal(request.headers.Authorization, undefined)
		assert.match(String(url), /\/api\/categories\?lang=uk/)
		return {
			status: 200,
			json: async () => [categoryUk]
		}
	}
	try {
		const items = await service.loadCategories('uk')
		const cache = await repo.getCached('uk')
		assert.equal(fetchCount, 1)
		assert.equal(items[0].name, 'Продукти')
		assert.equal(cache.items[0].name, 'Продукти')
	} finally {
		globalThis.fetch = originalFetch
	}
})

test('cached categories for wrong language fetch and store requested language separately', async () => {
	const repo = makeCategoryRepo(new FakeIndexedDbClient())
	await repo.saveCached('en', [categoryEn])
	const service = new CategoryApiService(repo)
	const originalFetch = globalThis.fetch
	let fetchCount = 0
	globalThis.fetch = async url => {
		fetchCount += 1
		assert.match(String(url), /\/api\/categories\?lang=uk/)
		return {
			status: 200,
			json: async () => [categoryUk]
		}
	}
	try {
		const items = await service.loadCategories('uk')
		const uk = await repo.getCached('uk')
		const en = await repo.getCached('en')
		assert.equal(fetchCount, 1)
		assert.equal(items[0].name, 'Продукти')
		assert.equal(uk.items[0].name, 'Продукти')
		assert.equal(en.items[0].name, 'Food')
	} finally {
		globalThis.fetch = originalFetch
	}
})

test('Category API refresh upserts IndexedDB categories', async () => {
	const repo = makeCategoryRepo(new FakeIndexedDbClient())
	const service = new CategoryApiService(repo)
	const originalFetch = globalThis.fetch
	globalThis.fetch = async () => ({
		status: 200,
		json: async () => [categoryUk]
	})
	try {
		const items = await service.refreshCategories('uk')
		const cache = await repo.getCached('uk')
		assert.equal(items[0].id, 3)
		assert.equal(cache.items[0].name, 'Продукти')
	} finally {
		globalThis.fetch = originalFetch
	}
})

test('Category id/code/name/icon remain consumer-compatible', () => {
	const record = normalizeCategoryRecord('uk', categoryUk, '2026-09-01T00:00:00.000Z')

	assert.equal(record.id, 3)
	assert.equal(record.code, 'food')
	assert.equal(record.name, 'Продукти')
	assert.equal(record.icon, 'food-icon')
})

test('Category IndexedDB failure falls back to localStorage', async () => {
	localStorage.setItem('hboo-categories-v1:uk', JSON.stringify({
		version: 1,
		language: 'uk',
		updatedAt: '2026-09-01T00:00:00.000Z',
		items: [categoryUk]
	}))
	const repo = makeCategoryRepo(new FakeIndexedDbClient({fail: true}))
	const cache = await repo.getCached('uk')

	assert.equal(cache.fallback, true)
	assert.equal(cache.items[0].name, 'Продукти')
})
