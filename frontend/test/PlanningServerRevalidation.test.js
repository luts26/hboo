import test from 'node:test'
import assert from 'node:assert/strict'
import {AUTH_STORAGE_KEY, setAuthState, getAuthState} from '../hbapp/services/AuthSession.js'
import PlanningApiService from '../hbapp/services/PlanningApiService.js'
import {
	analyzePlanningChanges,
	PlanningStore,
	isSamePlanningState
} from '../hbapp/stores/PlanningStore.js'
import {
	readPlanningSyncMetadata,
	writePlanningSyncMetadata
} from '../hbapp/services/PlanningSyncMetadata.js'

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

class FakeRepository {
	constructor(state) {
		this.state = structuredClone(state)
		this.replaceCount = 0
		this.markCleanCount = 0
	}

	async getPlanningState() {
		return structuredClone(this.state)
	}

	async replaceFromServer(remote) {
		this.replaceCount += 1
		this.state = toPlanningState(remote, {dirty: false})
		return this.getPlanningState()
	}

	async markCleanFromState(remote) {
		this.markCleanCount += 1
		this.state = toPlanningState(remote, {dirty: false})
		return this.getPlanningState()
	}

	async setDirty(dirty) {
		this.state.dirty = dirty
		return true
	}

	async updateItem(id, data, {markDirty = true} = {}) {
		this.state.items = this.state.items.map(planningItem => {
			if (String(planningItem.id) !== String(id)) return planningItem
			return {
				...planningItem,
				...data,
				id: planningItem.id,
				periodId: planningItem.periodId,
				updatedAt: Date.now()
			}
		})
		if (markDirty) this.state.dirty = true
		return this.state.items.find(planningItem => String(planningItem.id) === String(id)) || null
	}

	async setStatus(id, status, options = {}) {
		return this.updateItem(id, {status}, options)
	}

	async markCurrentPeriodPersisted(persistedPeriod) {
		this.state.currentPeriod = structuredClone(persistedPeriod)
		this.state.period = structuredClone(persistedPeriod)
		this.state.currentPeriodId = persistedPeriod.id
		this.state.periods = [structuredClone(persistedPeriod)]
		this.state.items = this.state.items.map(planningItem => ({
			...planningItem,
			periodId: persistedPeriod.id
		}))
		this.state.dirty = true
		return this.getPlanningState()
	}

	async markItemPersisted(localItemId, itemToPersist, periodId) {
		const persisted = {...itemToPersist, periodId: String(periodId)}
		this.state.items = this.state.items
			.map(planningItem => String(planningItem.id) === String(localItemId) ? persisted : planningItem)
			.filter((planningItem, index, items) => items.findIndex(candidate => String(candidate.id) === String(planningItem.id)) === index)
		this.state.dirty = true
		return this.getPlanningState()
	}
}

class FakeApi {
	constructor(remote, options = {}) {
		this.remote = structuredClone(remote)
		this.calls = []
		this.deferredItems = options.deferredItems || null
		this.error = options.error || null
		this.nextCreatedId = Number(options.nextCreatedId) || 200
		this.updatedItems = []
	}

	async getCurrentPeriod() {
		this.calls.push('getCurrentPeriod')
		if (this.error) throw this.error
		return structuredClone(this.remote.period)
	}

	async getPeriodItems() {
		this.calls.push('getPeriodItems')
		if (this.deferredItems) return this.deferredItems.promise
		return structuredClone(this.remote.items)
	}

	async getPeriodStatistics() {
		this.calls.push('getPeriodStatistics')
		return this.remote.statistics || null
	}

	async createPeriod(data) {
		this.calls.push('createPeriod')
		const created = {
			...data,
			id: data.id && !String(data.id).includes('-') ? String(data.id) : '10'
		}
		this.remote.period = created
		return structuredClone(created)
	}

	async updatePeriod(data) {
		this.calls.push('updatePeriod')
		this.remote.period = {...this.remote.period, ...data}
		return structuredClone(this.remote.period)
	}

	async createItem(data, periodId) {
		this.calls.push('createItem')
		const created = {
			...data,
			id: String(this.nextCreatedId++),
			periodId: String(periodId || data.periodId || this.remote.period?.id || '10')
		}
		this.remote.items = [...this.remote.items, created]
		return structuredClone(created)
	}

	async updateItem(data) {
		this.calls.push('updateItem')
		this.updatedItems.push(structuredClone(data))
		this.remote.items = this.remote.items.map(remoteItem => {
			if (String(remoteItem.id) !== String(data.id)) return remoteItem
			return {...remoteItem, ...data}
		})
		return structuredClone(this.remote.items.find(remoteItem => String(remoteItem.id) === String(data.id)) || data)
	}

	async deleteItem(itemId) {
		this.calls.push('deleteItem')
		const before = this.remote.items.length
		this.remote.items = this.remote.items.filter(remoteItem => String(remoteItem.id) !== String(itemId))
		return {deleted: before !== this.remote.items.length}
	}
}

class FakeQueue {
	constructor(operation = null) {
		this.operation = operation
		this.enqueued = 0
		this.markedErrors = []
	}

	async getOperation() {
		return this.operation
	}

	async enqueue({reason} = {}) {
		this.enqueued += 1
		this.operation = {
			operationId: 'planning.syncState:user:1',
			status: 'pending',
			reason
		}
		return this.operation
	}

	async markSyncing(operation) {
		this.operation = {...operation, status: 'syncing'}
		return this.operation
	}

	async resumePaused(operation, {reason} = {}) {
		this.operation = {
			...operation,
			status: 'pending',
			reason,
			lastError: null,
			nextAttemptAt: Date.now()
		}
		return this.operation
	}

	async markError(operation, error) {
		const status = Number(error.status || error.statusCode)
		this.operation = {
			...operation,
			status: status === 409 ? 'conflict' : (status === 401 || status === 403 ? 'paused' : 'error'),
			lastError: error
		}
		this.markedErrors.push(this.operation)
		return this.operation
	}

	async complete() {
		this.operation = null
		return true
	}
}

const makeDeferred = () => {
	let resolve
	let reject
	const promise = new Promise((res, rej) => {
		resolve = res
		reject = rej
	})
	return {promise, resolve, reject}
}

const period = (id = '10', budget = 20000) => ({
	id,
	dateFrom: new Date('2026-09-01T00:00:00Z').getTime(),
	dateTo: new Date('2026-09-30T23:59:59Z').getTime(),
	periodBudget: budget,
	status: 'active',
	createdAt: 1,
	updatedAt: 1
})

const item = (id = '100', patch = {}) => ({
	id,
	periodId: '10',
	categoryId: 'food',
	title: 'Groceries',
	desc: 'Groceries',
	sum: 1000,
	actualAmount: null,
	status: 'pending',
	date: new Date('2026-09-12T00:00:00Z').getTime(),
	transactionId: null,
	createdAt: 1,
	updatedAt: 1,
	...patch
})

const snapshot = ({period: snapshotPeriod = period(), items = [item()], statistics = null} = {}) => ({
	period: snapshotPeriod,
	items,
	statistics,
	updatedAt: 1
})

const toPlanningState = ({period: currentPeriod = period(), items = [item()], statistics = null}, patch = {}) => ({
	periods: [currentPeriod],
	currentPeriodId: currentPeriod.id,
	currentPeriod,
	period: currentPeriod,
	items,
	serverSnapshot: snapshot({period: currentPeriod, items, statistics}),
	deletedItemIds: [],
	dirty: false,
	...patch
})

const createStore = ({local, remote, queue = new FakeQueue(), apiOptions = {}}) => {
	const repository = new FakeRepository(local)
	const apiService = new FakeApi(remote, apiOptions)
	const store = new PlanningStore({
		repository,
		apiService,
		syncQueue: queue,
		balanceRepository: {get: () => null},
		transactionRepository: {get: () => null},
		autoRegisterSyncTriggers: false
	})
	return {store, repository, apiService, queue}
}

const createLoadedStore = options => {
	const result = createStore(options)
	result.store.applyPlanningState(options.local, {
		loaded: true,
		loading: false,
		dirty: Boolean(options.local.dirty),
		syncStatus: options.local.dirty ? 'pending' : 'synced'
	})
	return result
}

const createLiveLoadedStore = options => {
	const repository = new FakeRepository(options.local)
	const apiService = new FakeApi(options.remote, options.apiOptions || {})
	const queue = options.queue || new FakeQueue()
	const store = new PlanningStore({
		repository,
		apiService,
		syncQueue: queue,
		balanceRepository: {get: () => null},
		transactionRepository: {get: () => null},
		autoRegisterSyncTriggers: true
	})
	store.applyPlanningState(options.local, {
		loaded: true,
		loading: false,
		dirty: Boolean(options.local.dirty),
		syncStatus: options.local.dirty ? 'paused' : 'synced'
	})
	return {store, repository, apiService, queue}
}

const dirtyState = ({baseItems = [item()], localItems = baseItems, basePeriod = period(), localPeriod = basePeriod, deletedItemIds = []} = {}) => {
	return toPlanningState({
		period: localPeriod,
		items: localItems
	}, {
		serverSnapshot: snapshot({period: basePeriod, items: baseItems}),
		deletedItemIds,
		dirty: true
	})
}

const syncPendingQueue = () => new FakeQueue({
	operationId: 'planning.syncState:user:1',
	status: 'pending',
	attempts: 0
})

const syncPausedQueue = () => new FakeQueue({
	operationId: 'planning.syncState:user:1',
	status: 'paused',
	attempts: 1,
	lastError: {
		message: 'Planning sync paused',
		status: 401,
		at: Date.now()
	},
	nextAttemptAt: null
})

globalThis.localStorage = new LocalStorageMock()
globalThis.structuredClone ||= value => JSON.parse(JSON.stringify(value))

const authenticate = () => {
	localStorage.clear()
	setAuthState({token: 'token', user: {id: 1, username: 'demo'}})
}

const rejectAuth = () => {
	localStorage.clear()
	setAuthState({token: 'stale-token', user: {id: 1, username: 'demo'}})
	const authState = getAuthState()
	localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
		...authState,
		apiAuthStatus: 'rejected',
		apiAuthRejectedToken: 'stale-token',
		apiAuthRejectedStatus: 401
	}))
}

const installLiveStoreGlobals = ({online = true} = {}) => {
	const previousWindow = globalThis.window
	const previousDocument = globalThis.document
	const previousNavigator = globalThis.navigator
	globalThis.window = {addEventListener: () => {}}
	globalThis.document = {
		visibilityState: 'visible',
		addEventListener: () => {}
	}
	Object.defineProperty(globalThis, 'navigator', {
		configurable: true,
		value: {onLine: online}
	})
	return () => {
		if (previousWindow === undefined) delete globalThis.window
		else globalThis.window = previousWindow
		if (previousDocument === undefined) delete globalThis.document
		else globalThis.document = previousDocument
		if (previousNavigator === undefined) delete globalThis.navigator
		else Object.defineProperty(globalThis, 'navigator', {
			configurable: true,
			value: previousNavigator
		})
	}
}

const waitForLiveRecovery = async store => {
	await new Promise(resolve => setTimeout(resolve, 150))
	await store.syncPromise
	await store.serverRevalidationPromise
}

test('clean local + same remote updates server-check timestamp without replacing state', async () => {
	authenticate()
	const base = toPlanningState({period: period(), items: [item()]})
	const {store, repository, apiService} = createStore({local: base, remote: {period: period(), items: [item()]}})

	await store.revalidateFromServer({force: true})

	assert.equal(repository.replaceCount, 0)
	assert.equal(repository.markCleanCount, 0)
	assert.equal(apiService.calls.includes('getCurrentPeriod'), true)
	assert.ok(store.getState().lastSuccessfulServerCheckAt)
})

test('snapshot invariant holds between normalized serverSnapshot and raw API server response', async () => {
	authenticate()
	const rawPeriod = {
		id: '10',
		startDate: '2026-09-01',
		endDate: '2026-09-30',
		budgetAmount: 20000
	}
	const rawItem = {
		id: '100',
		periodId: '10',
		categoryId: 'food',
		title: 'Groceries',
		description: 'Groceries',
		plannedAmount: 1000,
		actualAmount: null,
		status: 'pending',
		plannedAt: '2026-09-12',
		transactionId: null
	}
	const local = toPlanningState({period: period(), items: [item()]})
	const {store, repository} = createStore({local, remote: {period: rawPeriod, items: [rawItem]}})

	await store.revalidateFromServer({force: true})

	const state = await repository.getPlanningState()
	assert.equal(isSamePlanningState(state.serverSnapshot, {period: rawPeriod, items: [rawItem]}), true)
})

test('clean local + remote item edited accepts remote and updates snapshot', async () => {
	authenticate()
	const base = toPlanningState({period: period(), items: [item()]})
	const remoteItem = item('100', {sum: 1500})
	const {store, repository} = createStore({local: base, remote: {period: period(), items: [remoteItem]}})

	await store.revalidateFromServer({force: true})

	const state = await repository.getPlanningState()
	assert.equal(repository.replaceCount, 1)
	assert.equal(state.items[0].sum, 1500)
	assert.equal(state.serverSnapshot.items[0].sum, 1500)
	assert.equal(store.getState().planningItems[0].sum, 1500)
})

test('clean local + remote item created appears locally', async () => {
	authenticate()
	const base = toPlanningState({period: period(), items: [item()]})
	const remoteItems = [item(), item('101', {title: 'Rent', desc: 'Rent', sum: 9000})]
	const {store} = createStore({local: base, remote: {period: period(), items: remoteItems}})

	await store.revalidateFromServer({force: true})

	assert.deepEqual(store.getState().planningItems.map(planningItem => planningItem.id).sort(), ['100', '101'])
})

test('clean local + remote item deleted removes item locally', async () => {
	authenticate()
	const localItems = [item(), item('101', {title: 'Rent', desc: 'Rent', sum: 9000})]
	const base = toPlanningState({period: period(), items: localItems})
	const {store} = createStore({local: base, remote: {period: period(), items: [item()]}})

	await store.revalidateFromServer({force: true})

	assert.deepEqual(store.getState().planningItems.map(planningItem => planningItem.id), ['100'])
})

test('clean local + remote completion and cancel changes are reflected', async () => {
	authenticate()
	const localItems = [item(), item('101', {status: 'pending'})]
	const remoteItems = [item('100', {status: 'completed'}), item('101', {status: 'cancelled'})]
	const base = toPlanningState({period: period(), items: localItems})
	const {store} = createStore({local: base, remote: {period: period(), items: remoteItems}})

	await store.revalidateFromServer({force: true})

	assert.deepEqual(store.getState().planningItems.map(planningItem => planningItem.status), ['completed', 'cancelled'])
})

test('local dirty + remote equals BASE preserves local state', async () => {
	authenticate()
	const baseSnapshot = snapshot({period: period(), items: [item()]})
	const local = toPlanningState({
		period: period(),
		items: [item('100', {sum: 1300})]
	}, {
		serverSnapshot: baseSnapshot,
		dirty: true
	})
	const {store, repository, queue} = createStore({local, remote: {period: period(), items: [item()]}})

	await store.revalidateFromServer({force: true})

	const state = await repository.getPlanningState()
	assert.equal(state.items[0].sum, 1300)
	assert.equal(queue.enqueued, 0)
	assert.ok(store.getState().lastSuccessfulServerCheckAt)
})

test('local dirty + remote changed enters conflict without overwriting local', async () => {
	authenticate()
	const baseSnapshot = snapshot({period: period(), items: [item()]})
	const local = toPlanningState({
		period: period(),
		items: [item('100', {sum: 1300})]
	}, {
		serverSnapshot: baseSnapshot,
		dirty: true
	})
	const {store, repository, queue} = createStore({
		local,
		remote: {period: period(), items: [item('100', {sum: 1500})]}
	})

	await store.revalidateFromServer({force: true})

	const state = await repository.getPlanningState()
	assert.equal(state.items[0].sum, 1300)
	assert.equal(store.getState().syncStatus, 'conflict')
	assert.equal(queue.markedErrors[0].status, 'conflict')
})

test('pull response cannot overwrite a local edit made after request start', async () => {
	authenticate()
	const deferredItems = makeDeferred()
	const base = toPlanningState({period: period(), items: [item()]})
	const {store, repository} = createStore({
		local: base,
		remote: {period: period(), items: [item('100', {sum: 1600})]},
		apiOptions: {deferredItems}
	})

	const pull = store.revalidateFromServer({force: true})
	repository.state = toPlanningState({
		period: period(),
		items: [item('100', {sum: 1300})]
	}, {
		serverSnapshot: base.serverSnapshot,
		dirty: true
	})
	deferredItems.resolve([item('100', {sum: 1600})])
	await pull

	const state = await repository.getPlanningState()
	assert.equal(state.items[0].sum, 1300)
	assert.equal(store.getState().syncStatus, 'conflict')
})

test('push active delays pull application', async () => {
	authenticate()
	const base = toPlanningState({period: period(), items: [item()]})
	const {store, apiService} = createStore({
		local: base,
		remote: {period: period(), items: [item('100', {sum: 1600})]}
	})
	store.syncPromise = Promise.resolve(store.getState())

	await store.revalidateFromServer({force: true})

	assert.equal(apiService.calls.length, 0)
	assert.deepEqual(store.pendingServerRevalidation, {reason: 'revalidation', force: true})
})

test('loaded clean planning still performs server revalidation on open', async () => {
	authenticate()
	const base = toPlanningState({period: period(), items: [item()]})
	const {store, apiService} = createStore({local: base, remote: {period: period(), items: [item()]}})
	store.setState({loaded: true, lastSuccessfulServerCheckAt: null})

	await store.load()
	await store.serverRevalidationPromise

	assert.equal(apiService.calls.includes('getCurrentPeriod'), true)
})

test('offline skips Planning GET and keeps local state', async () => {
	authenticate()
	const base = toPlanningState({period: period(), items: [item()]})
	const {store, apiService} = createStore({local: base, remote: {period: period(), items: [item('100', {sum: 1600})]}})
	store.isOffline = () => true

	await store.revalidateFromServer({force: true})

	assert.equal(apiService.calls.length, 0)
	assert.equal(store.getState().planningItems.length, 0)
})

test('auth rejected skips unnecessary Planning GET and preserves local state', async () => {
	authenticate()
	const authState = getAuthState()
	localStorage.setItem('hboo-auth-v1', JSON.stringify({...authState, apiAuthStatus: 'rejected'}))
	const base = toPlanningState({period: period(), items: [item()]})
	const {store, apiService} = createStore({local: base, remote: {period: period(), items: [item('100', {sum: 1600})]}})

	await store.revalidateFromServer({force: true})

	assert.equal(apiService.calls.length, 0)
})

test('Planning GET 401 leaves local data and marks auth rejected', async () => {
	authenticate()
	const base = toPlanningState({period: period(), items: [item()]})
	const repository = new FakeRepository(base)
	const store = new PlanningStore({
		repository,
		apiService: new PlanningApiService(),
		syncQueue: new FakeQueue(),
		balanceRepository: {get: () => null},
		transactionRepository: {get: () => null},
		autoRegisterSyncTriggers: false
	})
	globalThis.fetch = async () => ({
		status: 401,
		json: async () => ({error: 'Unauthorized'})
	})

	await assert.rejects(() => store.revalidateFromServer({force: true}))
	const state = await repository.getPlanningState()
	assert.equal(state.items[0].sum, 1000)
	assert.equal(getAuthState().apiAuthStatus, 'rejected')
})

test('server failure preserves local data and does not update server-check timestamp', async () => {
	authenticate()
	const error = new Error('Server error')
	error.status = 500
	const base = toPlanningState({period: period(), items: [item()]})
	const {store, repository} = createStore({
		local: base,
		remote: {period: period(), items: [item()]},
		apiOptions: {error}
	})

	await assert.rejects(() => store.revalidateFromServer({force: true}))

	const state = await repository.getPlanningState()
	assert.equal(state.items[0].sum, 1000)
	assert.equal(store.getState().lastSuccessfulServerCheckAt, null)
})

test('server-check timestamp persists across reload', () => {
	authenticate()
	writePlanningSyncMetadata({lastSuccessfulServerCheckAt: 1789106400000})

	assert.equal(readPlanningSyncMetadata(1).lastSuccessfulServerCheckAt, 1789106400000)
})

test('repeated focus style triggers use freshness guard to avoid request storm', async () => {
	authenticate()
	const base = toPlanningState({period: period(), items: [item()]})
	const {store, apiService} = createStore({local: base, remote: {period: period(), items: [item()]}})

	await store.revalidateFromServer({force: true})
	await store.revalidateFromServer({reason: 'focus'})
	await store.revalidateFromServer({reason: 'visible'})

	assert.equal(apiService.calls.filter(call => call === 'getCurrentPeriod').length, 1)
})

test('pre-push allows independent create/create and final state contains both items', async () => {
	authenticate()
	const localB = item('item-local-b', {title: 'FROM B', desc: 'FROM B', sum: 200})
	const remoteA = item('101', {title: 'FROM A', desc: 'FROM A', sum: 100})
	const local = dirtyState({baseItems: [], localItems: [localB]})
	const {store, repository, apiService, queue} = createLoadedStore({
		local,
		remote: {period: period(), items: [remoteA]},
		queue: syncPendingQueue()
	})

	await store.processSyncQueue({force: true, ignoreOffline: true, reason: 'online'})
	await store.serverRevalidationPromise

	const state = await repository.getPlanningState()
	assert.equal(apiService.calls.includes('createItem'), true)
	assert.equal(queue.operation, null)
	assert.deepEqual(state.items.map(planningItem => planningItem.title).sort(), ['FROM A', 'FROM B'])
	assert.deepEqual(state.serverSnapshot.items.map(planningItem => planningItem.title).sort(), ['FROM A', 'FROM B'])
})

test('pre-push allows remote update plus unrelated local create and preserves remote update', async () => {
	authenticate()
	const baseX = item('100', {status: 'pending'})
	const remoteX = item('100', {status: 'completed'})
	const localB = item('item-local-b', {title: 'FROM B', desc: 'FROM B', sum: 200})
	const local = dirtyState({baseItems: [baseX], localItems: [baseX, localB]})
	const {store, repository, apiService} = createLoadedStore({
		local,
		remote: {period: period(), items: [remoteX]},
		queue: syncPendingQueue()
	})

	await store.processSyncQueue({force: true, ignoreOffline: true, reason: 'online'})
	await store.serverRevalidationPromise

	const state = await repository.getPlanningState()
	assert.equal(apiService.calls.includes('createItem'), true)
	assert.equal(apiService.calls.includes('updateItem'), false)
	assert.deepEqual(state.items.map(planningItem => planningItem.status), ['completed', 'pending'])
})

test('pre-push blocks same-item update/update and does not PUT', async () => {
	authenticate()
	const baseX = item('100', {status: 'pending'})
	const localX = item('100', {status: 'cancelled'})
	const remoteX = item('100', {status: 'completed'})
	const local = dirtyState({baseItems: [baseX], localItems: [localX]})
	const {store, repository, apiService, queue} = createLoadedStore({
		local,
		remote: {period: period(), items: [remoteX]},
		queue: syncPendingQueue()
	})

	await store.processSyncQueue({force: true, ignoreOffline: true, reason: 'online'})

	const state = await repository.getPlanningState()
	assert.equal(apiService.calls.includes('updateItem'), false)
	assert.equal(store.getState().syncStatus, 'conflict')
	assert.equal(queue.operation.status, 'conflict')
	assert.equal(state.items[0].status, 'cancelled')
	assert.equal(state.serverSnapshot.items[0].status, 'pending')
	assert.equal(store.getState().lastSuccessfulSyncAt, null)
})

test('pre-push blocks local update when remote deleted same item', async () => {
	authenticate()
	const baseX = item('100', {status: 'pending'})
	const localX = item('100', {status: 'cancelled'})
	const local = dirtyState({baseItems: [baseX], localItems: [localX]})
	const {store, apiService} = createLoadedStore({
		local,
		remote: {period: period(), items: []},
		queue: syncPendingQueue()
	})

	await store.processSyncQueue({force: true, ignoreOffline: true, reason: 'online'})

	assert.equal(apiService.calls.includes('updateItem'), false)
	assert.equal(store.getState().syncStatus, 'conflict')
})

test('pre-push blocks local delete when remote updated same item', async () => {
	authenticate()
	const baseX = item('100', {status: 'pending'})
	const remoteX = item('100', {status: 'completed'})
	const local = dirtyState({baseItems: [baseX], localItems: [], deletedItemIds: ['100']})
	const {store, repository, apiService} = createLoadedStore({
		local,
		remote: {period: period(), items: [remoteX]},
		queue: syncPendingQueue()
	})

	await store.processSyncQueue({force: true, ignoreOffline: true, reason: 'online'})

	const state = await repository.getPlanningState()
	assert.equal(apiService.calls.includes('deleteItem'), false)
	assert.equal(store.getState().syncStatus, 'conflict')
	assert.deepEqual(state.deletedItemIds, ['100'])
	assert.equal(state.serverSnapshot.items[0].status, 'pending')
})

test('pre-push treats local delete and remote delete as compatible', async () => {
	authenticate()
	const baseX = item('100', {status: 'pending'})
	const local = dirtyState({baseItems: [baseX], localItems: [], deletedItemIds: ['100']})
	const {store, repository, apiService} = createLoadedStore({
		local,
		remote: {period: period(), items: []},
		queue: syncPendingQueue()
	})

	await store.processSyncQueue({force: true, ignoreOffline: true, reason: 'online'})
	await store.serverRevalidationPromise

	const state = await repository.getPlanningState()
	assert.equal(apiService.calls.includes('deleteItem'), true)
	assert.equal(store.getState().syncStatus, 'synced')
	assert.deepEqual(state.items, [])
	assert.deepEqual(state.serverSnapshot.items, [])
})

test('pre-push allows local update when remote is unchanged', async () => {
	authenticate()
	const baseX = item('100', {status: 'pending'})
	const localX = item('100', {status: 'cancelled'})
	const local = dirtyState({baseItems: [baseX], localItems: [localX]})
	const {store, repository, apiService} = createLoadedStore({
		local,
		remote: {period: period(), items: [baseX]},
		queue: syncPendingQueue()
	})

	await store.processSyncQueue({force: true, ignoreOffline: true, reason: 'online'})
	await store.serverRevalidationPromise

	const state = await repository.getPlanningState()
	assert.equal(apiService.calls.includes('updateItem'), true)
	assert.equal(state.items[0].status, 'cancelled')
	assert.equal(state.serverSnapshot.items[0].status, 'cancelled')
})

test('pre-push allows normal status update when raw API remote equals BASE', async () => {
	authenticate()
	const baseX = item('100', {status: 'pending'})
	const localX = item('100', {status: 'completed'})
	const rawRemoteX = {
		id: '100',
		periodId: '10',
		categoryId: 'food',
		title: 'Groceries',
		description: 'Groceries',
		plannedAmount: 1000,
		actualAmount: null,
		status: 'pending',
		plannedAt: '2026-09-12',
		transactionId: null
	}
	const rawRemotePeriod = {
		id: '10',
		startDate: '2026-09-01',
		endDate: '2026-09-30',
		budgetAmount: 20000
	}
	const local = dirtyState({baseItems: [baseX], localItems: [localX]})
	const {store, apiService} = createLoadedStore({
		local,
		remote: {period: rawRemotePeriod, items: [rawRemoteX]},
		queue: syncPendingQueue()
	})

	await store.processSyncQueue({force: true, ignoreOffline: true, reason: 'item-status'})
	await store.serverRevalidationPromise

	assert.equal(apiService.calls.includes('updateItem'), true)
	assert.notEqual(store.getState().syncStatus, 'conflict')
})

test('manual completion stores actualAmount locally and queues offline sync', async () => {
	authenticate()
	const base = toPlanningState({period: period(), items: [item('100', {sum: 500, actualAmount: null})]})
	const {store, repository, queue} = createLoadedStore({
		local: base,
		remote: {period: period(), items: [item('100', {sum: 500, actualAmount: null})]}
	})
	store.isOffline = () => true

	await store.updatePlanningItem('100', {
		status: 'completed',
		actualAmount: 424.5
	})

	const state = await repository.getPlanningState()
	assert.equal(state.items[0].status, 'completed')
	assert.equal(state.items[0].actualAmount, 424.5)
	assert.equal(state.dirty, true)
	assert.equal(queue.enqueued, 1)
	assert.equal(store.getState().syncStatus, 'offline')
})

test('manual completion sync sends actualAmount through existing update payload', async () => {
	authenticate()
	const baseX = item('100', {status: 'pending', sum: 500, actualAmount: null})
	const localX = item('100', {status: 'completed', sum: 500, actualAmount: 424.5})
	const local = dirtyState({baseItems: [baseX], localItems: [localX]})
	const {store, repository, apiService} = createLoadedStore({
		local,
		remote: {period: period(), items: [baseX]},
		queue: syncPendingQueue()
	})

	await store.processSyncQueue({force: true, ignoreOffline: true, reason: 'item-update'})
	await store.serverRevalidationPromise

	const state = await repository.getPlanningState()
	assert.equal(apiService.calls.includes('updateItem'), true)
	assert.equal(apiService.updatedItems[0].actualAmount, 424.5)
	assert.equal(apiService.updatedItems[0].status, 'completed')
	assert.equal(state.serverSnapshot.items[0].actualAmount, 424.5)
})

test('pre-push allows normal title and amount update when remote is unchanged', async () => {
	authenticate()
	const baseX = item('100', {status: 'pending'})
	const localX = item('100', {title: 'Updated groceries', desc: 'Updated groceries', sum: 1250})
	const local = dirtyState({baseItems: [baseX], localItems: [localX]})
	const {store, apiService} = createLoadedStore({
		local,
		remote: {period: period(), items: [baseX]},
		queue: syncPendingQueue()
	})

	await store.processSyncQueue({force: true, ignoreOffline: true, reason: 'item-update'})
	await store.serverRevalidationPromise

	assert.equal(apiService.calls.includes('updateItem'), true)
	assert.notEqual(store.getState().syncStatus, 'conflict')
})

test('pre-push preserves remote update with unrelated local operation', async () => {
	authenticate()
	const baseX = item('100', {status: 'pending'})
	const remoteX = item('100', {status: 'completed'})
	const localB = item('item-local-b', {title: 'FROM B', desc: 'FROM B', sum: 200})
	const local = dirtyState({baseItems: [baseX], localItems: [baseX, localB]})
	const {store, repository} = createLoadedStore({
		local,
		remote: {period: period(), items: [remoteX]},
		queue: syncPendingQueue()
	})

	await store.processSyncQueue({force: true, ignoreOffline: true, reason: 'online'})
	await store.serverRevalidationPromise

	const state = await repository.getPlanningState()
	assert.equal(state.items.find(planningItem => planningItem.id === '100').status, 'completed')
	assert.equal(state.items.some(planningItem => planningItem.title === 'FROM B'), true)
})

test('pre-push blocks divergent local and remote period metadata changes', async () => {
	authenticate()
	const basePeriod = period('10', 20000)
	const localPeriod = period('10', 25000)
	const remotePeriod = period('10', 30000)
	const local = dirtyState({basePeriod, localPeriod, baseItems: [item()], localItems: [item()]})
	const {store, apiService} = createLoadedStore({
		local,
		remote: {period: remotePeriod, items: [item()]},
		queue: syncPendingQueue()
	})

	await store.processSyncQueue({force: true, ignoreOffline: true, reason: 'online'})

	assert.equal(apiService.calls.includes('updatePeriod'), false)
	assert.equal(store.getState().syncStatus, 'conflict')
})

test('pre-push network failure does not push and keeps queue for retry', async () => {
	authenticate()
	const error = new Error('Server error')
	error.status = 500
	const baseX = item('100', {status: 'pending'})
	const localX = item('100', {status: 'cancelled'})
	const local = dirtyState({baseItems: [baseX], localItems: [localX]})
	const {store, apiService, queue} = createLoadedStore({
		local,
		remote: {period: period(), items: [baseX]},
		queue: syncPendingQueue(),
		apiOptions: {error}
	})

	await store.processSyncQueue({force: true, ignoreOffline: true, reason: 'online'})

	assert.equal(apiService.calls.includes('updateItem'), false)
	assert.equal(queue.operation.status, 'error')
	assert.equal(store.getState().syncStatus, 'error')
})

test('pre-push 401 does not push and marks API auth rejected', async () => {
	authenticate()
	const baseX = item('100', {status: 'pending'})
	const localX = item('100', {status: 'cancelled'})
	const local = dirtyState({baseItems: [baseX], localItems: [localX]})
	const repository = new FakeRepository(local)
	const queue = syncPendingQueue()
	const urls = []
	const store = new PlanningStore({
		repository,
		apiService: new PlanningApiService(),
		syncQueue: queue,
		balanceRepository: {get: () => null},
		transactionRepository: {get: () => null},
		autoRegisterSyncTriggers: false
	})
	store.applyPlanningState(local, {loaded: true, dirty: true, syncStatus: 'pending'})
	globalThis.fetch = async url => {
		urls.push(String(url))
		return {
			status: 401,
			json: async () => ({error: 'Unauthorized'})
		}
	}

	await store.processSyncQueue({force: true, ignoreOffline: true, reason: 'online'})

	assert.equal(urls.length, 1)
	assert.match(urls[0], /\/planning\/period\/current$/)
	assert.equal(queue.operation.status, 'paused')
	assert.equal(store.getState().syncStatus, 'paused')
	assert.equal(getAuthState().apiAuthStatus, 'rejected')
})

test('successful disjoint sync performs final GET and markCleanFromState', async () => {
	authenticate()
	const baseX = item('100', {status: 'pending'})
	const localB = item('item-local-b', {title: 'FROM B', desc: 'FROM B', sum: 200})
	const local = dirtyState({baseItems: [baseX], localItems: [baseX, localB]})
	const {store, repository, apiService} = createLoadedStore({
		local,
		remote: {period: period(), items: [baseX]},
		queue: syncPendingQueue()
	})

	await store.processSyncQueue({force: true, ignoreOffline: true, reason: 'online'})
	await store.serverRevalidationPromise

	assert.equal(repository.markCleanCount, 1)
	assert.equal(apiService.calls.filter(call => call === 'getPeriodItems').length >= 2, true)
	assert.equal(store.getState().lastSuccessfulSyncAt > 0, true)
})

test('successful push still schedules delayed revalidation after sync', async () => {
	authenticate()
	const baseX = item('100', {status: 'pending'})
	const localB = item('item-local-b', {title: 'FROM B', desc: 'FROM B', sum: 200})
	const local = dirtyState({baseItems: [baseX], localItems: [baseX, localB]})
	const {store, apiService} = createLoadedStore({
		local,
		remote: {period: period(), items: [baseX]},
		queue: syncPendingQueue()
	})

	await store.processSyncQueue({force: true, ignoreOffline: true, reason: 'online'})
	await store.serverRevalidationPromise

	assert.equal(apiService.calls.filter(call => call === 'getCurrentPeriod').length >= 2, true)
	assert.equal(store.getState().lastSuccessfulServerCheckAt > 0, true)
})

test('same-item conflict through reconnect path never calls updateItem', async () => {
	authenticate()
	const baseX = item('100', {status: 'pending'})
	const localX = item('100', {status: 'cancelled'})
	const remoteX = item('100', {status: 'completed'})
	const local = dirtyState({baseItems: [baseX], localItems: [localX]})
	const {store, repository, apiService, queue} = createLoadedStore({
		local,
		remote: {period: period(), items: [remoteX]},
		queue: syncPendingQueue()
	})

	store.handleRecoverySignal('online')
	await new Promise(resolve => setTimeout(resolve, 150))
	await store.syncPromise

	const state = await repository.getPlanningState()
	assert.equal(apiService.calls.includes('updateItem'), false)
	assert.equal(queue.operation.status, 'conflict')
	assert.equal(state.items[0].status, 'cancelled')
	assert.equal(state.serverSnapshot.items[0].status, 'pending')
})

test('create/create reconnect regression keeps remote A and local B', async () => {
	authenticate()
	const localB = item('item-local-b', {title: 'FROM B', desc: 'FROM B', sum: 200})
	const remoteA = item('101', {title: 'FROM A', desc: 'FROM A', sum: 100})
	const local = dirtyState({baseItems: [], localItems: [localB]})
	const {store, repository, queue} = createLoadedStore({
		local,
		remote: {period: period(), items: [remoteA]},
		queue: syncPendingQueue()
	})

	store.handleRecoverySignal('online')
	await new Promise(resolve => setTimeout(resolve, 150))
	await store.syncPromise
	await store.serverRevalidationPromise

	const state = await repository.getPlanningState()
	assert.equal(queue.operation, null)
	assert.deepEqual(state.items.map(planningItem => planningItem.title).sort(), ['FROM A', 'FROM B'])
})

test('live rejected to authenticated resumes paused pending update without store recreation', async () => {
	const restoreGlobals = installLiveStoreGlobals()
	rejectAuth()
	const baseItem = item('100', {sum: 1000})
	const localItem = item('100', {sum: 1500})
	const local = dirtyState({baseItems: [baseItem], localItems: [localItem]})
	const {store, repository, apiService, queue} = createLiveLoadedStore({
		local,
		remote: {period: period(), items: [baseItem]},
		queue: syncPausedQueue()
	})

	setAuthState({token: 'fresh-token', user: {id: 1, username: 'demo'}})
	await waitForLiveRecovery(store)

	const state = await repository.getPlanningState()
	assert.equal(queue.operation, null)
	assert.equal(state.dirty, false)
	assert.equal(store.getState().syncStatus, 'synced')
	assert.equal(apiService.calls.includes('getCurrentPeriod'), true)
	assert.equal(apiService.calls.includes('updateItem'), true)
	assert.equal(apiService.calls.filter(call => call === 'updateItem').length, 1)
	store.unsubscribeAuthStatus?.()
	store.unsubscribeNetworkStatus?.()
	restoreGlobals()
})

test('live rejected to authenticated resumes paused pending create without store recreation', async () => {
	const restoreGlobals = installLiveStoreGlobals()
	rejectAuth()
	const localCreated = item('item-local-b', {title: 'FROM B', desc: 'FROM B', sum: 200})
	const local = dirtyState({baseItems: [], localItems: [localCreated]})
	const {store, repository, apiService, queue} = createLiveLoadedStore({
		local,
		remote: {period: period(), items: []},
		queue: syncPausedQueue()
	})

	setAuthState({token: 'fresh-token', user: {id: 1, username: 'demo'}})
	await waitForLiveRecovery(store)

	const state = await repository.getPlanningState()
	assert.equal(queue.operation, null)
	assert.equal(state.dirty, false)
	assert.equal(state.items.some(planningItem => planningItem.title === 'FROM B'), true)
	assert.equal(apiService.calls.includes('getCurrentPeriod'), true)
	assert.equal(apiService.calls.includes('createItem'), true)
	store.unsubscribeAuthStatus?.()
	store.unsubscribeNetworkStatus?.()
	restoreGlobals()
})

test('live rejected to authenticated with no pending queue does not perform Planning mutation', async () => {
	const restoreGlobals = installLiveStoreGlobals()
	rejectAuth()
	const clean = toPlanningState({period: period(), items: [item()]})
	const {store, apiService, queue} = createLiveLoadedStore({
		local: clean,
		remote: {period: period(), items: [item()]},
		queue: new FakeQueue(null)
	})

	setAuthState({token: 'fresh-token', user: {id: 1, username: 'demo'}})
	await waitForLiveRecovery(store)

	assert.equal(queue.operation, null)
	assert.equal(apiService.calls.includes('createItem'), false)
	assert.equal(apiService.calls.includes('updateItem'), false)
	assert.equal(apiService.calls.includes('deleteItem'), false)
	store.unsubscribeAuthStatus?.()
	store.unsubscribeNetworkStatus?.()
	restoreGlobals()
})

test('live auth-restored paused queue keeps same-item conflict safe and performs no PUT', async () => {
	const restoreGlobals = installLiveStoreGlobals()
	rejectAuth()
	const baseX = item('100', {status: 'pending'})
	const localX = item('100', {status: 'cancelled'})
	const remoteX = item('100', {status: 'completed'})
	const local = dirtyState({baseItems: [baseX], localItems: [localX]})
	const {store, repository, apiService, queue} = createLiveLoadedStore({
		local,
		remote: {period: period(), items: [remoteX]},
		queue: syncPausedQueue()
	})

	setAuthState({token: 'fresh-token', user: {id: 1, username: 'demo'}})
	await waitForLiveRecovery(store)

	const state = await repository.getPlanningState()
	assert.equal(apiService.calls.includes('getCurrentPeriod'), true)
	assert.equal(apiService.calls.includes('updateItem'), false)
	assert.equal(queue.operation.status, 'conflict')
	assert.equal(store.getState().syncStatus, 'conflict')
	assert.equal(state.items[0].status, 'cancelled')
	assert.equal(state.serverSnapshot.items[0].status, 'pending')
	store.unsubscribeAuthStatus?.()
	store.unsubscribeNetworkStatus?.()
	restoreGlobals()
})

test('live auth-restored while offline waits for network recovery and pushes once', async () => {
	const restoreGlobals = installLiveStoreGlobals({online: false})
	rejectAuth()
	const baseItem = item('100', {sum: 1000})
	const localItem = item('100', {sum: 1500})
	const local = dirtyState({baseItems: [baseItem], localItems: [localItem]})
	const {store, apiService, queue} = createLiveLoadedStore({
		local,
		remote: {period: period(), items: [baseItem]},
		queue: syncPausedQueue()
	})
	let offline = true
	store.isOffline = () => offline

	setAuthState({token: 'fresh-token', user: {id: 1, username: 'demo'}})
	await waitForLiveRecovery(store)

	assert.equal(queue.operation.status, 'paused')
	assert.deepEqual(apiService.calls, [])

	offline = false
	store.handleRecoverySignal('online')
	await waitForLiveRecovery(store)

	assert.equal(queue.operation, null)
	assert.equal(apiService.calls.filter(call => call === 'updateItem').length, 1)
	assert.equal(store.getState().syncStatus, 'synced')
	store.unsubscribeAuthStatus?.()
	store.unsubscribeNetworkStatus?.()
	restoreGlobals()
})

test('change analysis reports update/delete overlaps but ignores independent creates', () => {
	const base = {period: period(), items: [item('100')]}
	const local = {period: period(), items: [item('100', {status: 'cancelled'}), item('item-local-b')]}
	const remote = {period: period(), items: [item('100', {status: 'completed'}), item('101')]}
	const analysis = analyzePlanningChanges(base, local, remote)

	assert.deepEqual(analysis.conflicts, [{type: 'item-update-update', itemId: '100'}])
	assert.equal(analysis.local.createdTempIds.has('item-local-b'), true)
	assert.equal(analysis.remote.createdIds.has('101'), true)
})

test('semantic comparison ignores statistics and local checklist UI state', () => {
	const left = {
		period: period(),
		items: [item('100', {checklist: [{id: 'a', title: 'Buy', checked: false}]})],
		statistics: {actualSpent: 100}
	}
	const right = {
		period: period(),
		items: [item('100', {checklist: [{id: 'b', title: 'Other', checked: true}]})],
		statistics: {actualSpent: 200}
	}

	assert.equal(isSamePlanningState(left, right), true)
})
