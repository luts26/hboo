import test from 'node:test'
import assert from 'node:assert/strict'

import {setAuthState} from '../hbapp/services/AuthSession.js'
import networkStatusService from '../hbapp/services/NetworkStatusService.js'
import PlanningLocalRepository from '../hbapp/services/PlanningLocalRepository.js'
import {buildForecastFromStates} from '../hbapp/services/FinancialForecastAdapter.js'
import {PlanningStore} from '../hbapp/stores/PlanningStore.js'

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

class FakeQueue {
	async enqueue() {
		return null
	}

	async getOperation() {
		return null
	}
}

class FakeApi {
	constructor({period, items, linked = {}}) {
		this.period = period
		this.items = items
		this.linked = linked
		this.calls = []
	}

	async getCurrentPeriod() {
		this.calls.push('getCurrentPeriod')
		return this.period
	}

	async getPeriodItems() {
		this.calls.push('getPeriodItems')
		return this.items
	}

	async getPeriodStatistics() {
		this.calls.push('getPeriodStatistics')
		return null
	}

	async getTransactionCandidates(itemId) {
		this.calls.push(`getTransactionCandidates:${itemId}`)
		return []
	}

	async getLinkedTransactions(itemId) {
		this.calls.push(`getLinkedTransactions:${itemId}`)
		return this.linked[String(itemId)] || {
			transactions: [],
			linkedAmount: 0,
			remainingAmount: this.items.find(item => String(item.id) === String(itemId))?.sum || 0
		}
	}

	async linkTransaction(itemId) {
		this.calls.push(`linkTransaction:${itemId}`)
		return this.linked[String(itemId)]
	}

	async unlinkTransaction(itemId) {
		this.calls.push(`unlinkTransaction:${itemId}`)
		return this.linked[String(itemId)]
	}
}

const dayStart = (year, monthIndex, day) => new Date(year, monthIndex, day, 0, 0, 0, 0).getTime()
const dayEnd = (year, monthIndex, day) => new Date(year, monthIndex, day, 23, 59, 59, 999).getTime()

const period = {
	id: 'period-1',
	dateFrom: dayStart(2026, 9, 1),
	dateTo: dayEnd(2026, 9, 31),
	periodBudget: 20000
}

const item = ({
	id = '101',
	sum = 300,
	status = 'pending',
	date = dayStart(2026, 9, 20),
	dateSource = 'user'
} = {}) => ({
	id,
	periodId: period.id,
	title: `Expense ${id}`,
	sum,
	status,
	date,
	dateSource,
	createdAt: dayStart(2026, 9, 1),
	updatedAt: dayStart(2026, 9, 1)
})

const planningState = ({items = [item()], dirty = false} = {}) => ({
	version: 2,
	periods: [period],
	currentPeriodId: period.id,
	currentPeriod: period,
	items,
	serverSnapshot: {period, items, statistics: null, updatedAt: dayStart(2026, 9, 12)},
	deletedItemIds: [],
	dirty
})

const balanceState = {
	data: {
		mono: [{
			balance: 100000,
			credit_limit: 0,
			currency_code: 980,
			date: Math.floor(dayStart(2026, 9, 12) / 1000)
		}],
		privat: []
	},
	updatedAt: dayStart(2026, 9, 12)
}

const setNetworkOffline = offline => {
	const original = networkStatusService.isOffline
	networkStatusService.isOffline = () => offline
	return () => {
		networkStatusService.isOffline = original
	}
}

const setEnvironment = origin => {
	const previous = Object.getOwnPropertyDescriptor(globalThis, 'location')
	Object.defineProperty(globalThis, 'location', {
		value: {origin},
		configurable: true
	})
	return () => {
		if (previous) Object.defineProperty(globalThis, 'location', previous)
		else delete globalThis.location
	}
}

const setupStorage = () => {
	globalThis.localStorage = new LocalStorageMock()
	setAuthState({token: 'test-token', user: {id: 1, username: 'demo'}})
}

const makeStore = ({repository, apiService, offline = true}) => {
	const restoreNetwork = setNetworkOffline(offline)
	const store = new PlanningStore({
		repository,
		apiService,
		syncQueue: new FakeQueue(),
		balanceRepository: {get: () => balanceState},
		transactionRepository: {get: () => ({data: {mono: [], privat: []}})},
		autoRegisterSyncTriggers: false
	})
	return {store, restoreNetwork}
}

test('offline F5 restores cached linked state and forecasts remaining amount', async () => {
	setupStorage()
	const restoreEnvironment = setEnvironment('https://dev.hboo.test')
	const repository = new PlanningLocalRepository({storageKey: 'forecast-offline-planning', userId: 1})
	await repository.writeStorage(planningState())
	await repository.saveTransactionLinkState('101', {
		linkedTransactions: [{provider: 'mono', providerTransactionId: 'tx-1'}],
		linkedAmount: 125,
		remainingAmount: 175
	})

	const {store, restoreNetwork} = makeStore({
		repository: new PlanningLocalRepository({storageKey: 'forecast-offline-planning', userId: 1}),
		apiService: new FakeApi({period, items: [item()]})
	})
	await store.load()
	const state = store.getState()
	const forecast = buildForecastFromStates({planningState: state, balanceState, now: new Date(2026, 9, 12, 10)})

	assert.equal(state.transactionLinks['101'].remainingAmount, 175)
	assert.equal(forecast.scheduledExpenses, 175)
	assert.equal(forecast.events[0].reason, 'partial_remaining_amount')

	restoreNetwork()
	restoreEnvironment()
})

test('offline F5 without cached link state remains unknown instead of confirmed zero links', async () => {
	setupStorage()
	const restoreEnvironment = setEnvironment('https://dev.hboo.test')
	const repository = new PlanningLocalRepository({storageKey: 'forecast-offline-missing', userId: 1})
	await repository.writeStorage(planningState())

	const {store, restoreNetwork} = makeStore({
		repository: new PlanningLocalRepository({storageKey: 'forecast-offline-missing', userId: 1}),
		apiService: new FakeApi({period, items: [item()]})
	})
	await store.load()
	const forecast = buildForecastFromStates({planningState: store.getState(), balanceState, now: new Date(2026, 9, 12, 10)})

	assert.equal(forecast.scheduledExpenses, 0)
	assert.equal(forecast.ambiguous[0].reason, 'transaction_link_state_unavailable')

	restoreNetwork()
	restoreEnvironment()
})

test('confirmed zero links are forecast as full planned amount', async () => {
	setupStorage()
	const restoreEnvironment = setEnvironment('https://dev.hboo.test')
	const repository = new PlanningLocalRepository({storageKey: 'forecast-zero-links', userId: 1})
	await repository.writeStorage(planningState())
	await repository.saveTransactionLinkState('101', {
		linkedTransactions: [],
		linkedAmount: 0,
		remainingAmount: 300
	})

	const {store, restoreNetwork} = makeStore({
		repository: new PlanningLocalRepository({storageKey: 'forecast-zero-links', userId: 1}),
		apiService: new FakeApi({period, items: [item()]})
	})
	await store.load()
	const forecast = buildForecastFromStates({planningState: store.getState(), balanceState, now: new Date(2026, 9, 12, 10)})

	assert.equal(forecast.scheduledExpenses, 300)
	assert.equal(forecast.ambiguous.length, 0)

	restoreNetwork()
	restoreEnvironment()
})

test('link state cache is isolated by user and environment', async () => {
	setupStorage()
	const restoreDevEnvironment = setEnvironment('https://dev.hboo.test')
	const userOneRepository = new PlanningLocalRepository({storageKey: 'forecast-user-one', userId: 1})
	await userOneRepository.saveTransactionLinkState('101', {
		linkedTransactions: [{provider: 'mono', providerTransactionId: 'dev-user-1'}],
		linkedAmount: 50,
		remainingAmount: 250
	})

	const userTwoLinks = await new PlanningLocalRepository({storageKey: 'forecast-user-two', userId: 2}).getTransactionLinkStates()
	restoreDevEnvironment()
	const restoreRealEnvironment = setEnvironment('https://real.hboo.test')
	const realLinks = await new PlanningLocalRepository({storageKey: 'forecast-user-one', userId: 1}).getTransactionLinkStates()

	assert.deepEqual(userTwoLinks, {})
	assert.deepEqual(realLinks, {})

	restoreRealEnvironment()
})

test('partially paid planning item does not double count after offline reload', async () => {
	setupStorage()
	const restoreEnvironment = setEnvironment('https://dev.hboo.test')
	const repository = new PlanningLocalRepository({storageKey: 'forecast-no-double-count', userId: 1})
	await repository.writeStorage(planningState())
	await repository.saveTransactionLinkState('101', {
		linkedTransactions: [{provider: 'mono', providerTransactionId: 'tx-paid'}],
		linkedAmount: 300,
		remainingAmount: 0
	})

	const {store, restoreNetwork} = makeStore({
		repository: new PlanningLocalRepository({storageKey: 'forecast-no-double-count', userId: 1}),
		apiService: new FakeApi({period, items: [item()]})
	})
	await store.load()
	const forecast = buildForecastFromStates({planningState: store.getState(), balanceState, now: new Date(2026, 9, 12, 10)})

	assert.equal(forecast.scheduledExpenses, 0)
	assert.equal(forecast.excluded[0].reason, 'linked_transaction_accounted')

	restoreNetwork()
	restoreEnvironment()
})

test('link and unlink operations update cached link state', async () => {
	setupStorage()
	const restoreEnvironment = setEnvironment('https://dev.hboo.test')
	const repository = new PlanningLocalRepository({storageKey: 'forecast-link-update', userId: 1})
	await repository.writeStorage(planningState())
	const apiService = new FakeApi({
		period,
		items: [item()],
		linked: {
			101: {
				transactions: [{provider: 'mono', providerTransactionId: 'tx-linked'}],
				linkedAmount: 125,
				remainingAmount: 175
			}
		}
	})
	const {store, restoreNetwork} = makeStore({repository, apiService, offline: false})

	await store.load()
	await store.linkPlanningTransaction('101', {provider: 'mono', providerTransactionId: 'tx-linked'})
	assert.equal((await repository.getTransactionLinkStates())['101'].remainingAmount, 175)

	apiService.linked['101'] = {transactions: [], linkedAmount: 0, remainingAmount: 300}
	await store.unlinkPlanningTransaction('101', {provider: 'mono', providerTransactionId: 'tx-linked'})
	assert.equal((await repository.getTransactionLinkStates())['101'].linkedTransactions.length, 0)
	assert.equal((await repository.getTransactionLinkStates())['101'].remainingAmount, 300)

	restoreNetwork()
	restoreEnvironment()
})

test('planning item amount change invalidates cached remainingAmount and preserves dateSource', async () => {
	setupStorage()
	const restoreEnvironment = setEnvironment('https://dev.hboo.test')
	const repository = new PlanningLocalRepository({storageKey: 'forecast-link-invalidate', userId: 1})
	await repository.writeStorage(planningState())
	await repository.saveTransactionLinkState('101', {
		linkedTransactions: [{provider: 'mono', providerTransactionId: 'tx-1'}],
		linkedAmount: 125,
		remainingAmount: 175
	})
	const {store, restoreNetwork} = makeStore({
		repository,
		apiService: new FakeApi({period, items: [item()]})
	})

	await store.load()
	await store.updatePlanningItem('101', {sum: 400})
	const restored = await repository.getPlanningState()
	const forecast = buildForecastFromStates({planningState: store.getState(), balanceState, now: new Date(2026, 9, 12, 10)})

	assert.deepEqual(await repository.getTransactionLinkStates(), {})
	assert.equal(restored.items[0].dateSource, 'user')
	assert.equal(forecast.ambiguous[0].reason, 'transaction_link_state_unavailable')

	restoreNetwork()
	restoreEnvironment()
})

test('reconnection refresh revalidates cached link state', async () => {
	setupStorage()
	const restoreEnvironment = setEnvironment('https://dev.hboo.test')
	const repository = new PlanningLocalRepository({storageKey: 'forecast-reconnect', userId: 1})
	await repository.writeStorage(planningState())
	await repository.saveTransactionLinkState('101', {
		linkedTransactions: [{provider: 'mono', providerTransactionId: 'old'}],
		linkedAmount: 50,
		remainingAmount: 250
	})
	const apiService = new FakeApi({
		period,
		items: [item()],
		linked: {
			101: {
				transactions: [{provider: 'mono', providerTransactionId: 'new'}],
				linkedAmount: 125,
				remainingAmount: 175
			}
		}
	})
	const {store, restoreNetwork} = makeStore({repository, apiService, offline: false})

	await store.load()
	await store.refreshForecastTransactionLinks()
	const links = await repository.getTransactionLinkStates()

	assert.equal(links['101'].remainingAmount, 175)
	assert.equal(links['101'].linkedTransactions[0].providerTransactionId, 'new')

	restoreNetwork()
	restoreEnvironment()
})
