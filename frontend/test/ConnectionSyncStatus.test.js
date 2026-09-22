import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import api from '../hbapp/mixins/apiQueriesHelper.js'
import {
	API_AUTH_STATUS,
	getAuthState,
	setAuthState
} from '../hbapp/services/AuthSession.js'
import {deriveConnectionSyncState} from '../hbapp/services/ConnectionSyncStatus.js'
import {NetworkStatusService} from '../hbapp/services/NetworkStatusService.js'
import {
	markPlanningSyncSucceeded,
	readPlanningSyncMetadata,
	writePlanningSyncMetadata
} from '../hbapp/services/PlanningSyncMetadata.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(__dirname, '..')

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

globalThis.localStorage = new LocalStorageMock()

const authenticated = {token: 'token', userId: 1}

const derive = ({network = 'online', authState = authenticated, planningState = {syncStatus: 'synced', dirty: false}} = {}) => {
	return deriveConnectionSyncState({
		networkState: {network},
		authState,
		planningState
	})
}

test('online authenticated clean planning presents as synced', () => {
	const state = derive()

	assert.equal(state.network, 'online')
	assert.equal(state.api, 'authenticated')
	assert.equal(state.sync, 'synced')
	assert.equal(state.pendingCount, 0)
	assert.equal(state.presentation, 'synced')
	assert.equal(state.title, 'Synced')
	assert.equal(state.detail, 'All changes synced')
})

test('connection status carries Planning sync timestamp without formatting route freshness', () => {
	const state = derive({
		planningState: {
			syncStatus: 'synced',
			dirty: false,
			lastSuccessfulSyncAt: 1789106400000
		}
	})

	assert.equal(state.lastSuccessfulSyncAt, 1789106400000)
	assert.equal(state.secondaryDetail, undefined)
})

test('online syncing presents as syncing with pending count when dirty', () => {
	const state = derive({planningState: {syncStatus: 'syncing', dirty: true}})

	assert.equal(state.presentation, 'syncing')
	assert.equal(state.title, 'Syncing...')
	assert.equal(state.pendingCount, 1)
	assert.equal(state.detail, '1 change pending')
})

test('offline without pending changes presents local data available', () => {
	const state = derive({network: 'offline'})

	assert.equal(state.presentation, 'offline')
	assert.equal(state.title, 'Offline')
	assert.equal(state.pendingCount, 0)
	assert.equal(state.detail, 'Local data available')
})

test('offline with pending changes presents offline and pending count', () => {
	const state = derive({
		network: 'offline',
		planningState: {syncStatus: 'offline', dirty: true}
	})

	assert.equal(state.presentation, 'offline')
	assert.equal(state.title, 'Offline')
	assert.equal(state.pendingCount, 1)
	assert.equal(state.detail, '1 change pending')
})

test('online auth required presents sign in to sync', () => {
	const state = derive({
		authState: {token: null, userId: null},
		planningState: {syncStatus: 'idle', dirty: false}
	})

	assert.equal(state.api, 'auth_required')
	assert.equal(state.presentation, 'auth-required')
	assert.equal(state.title, 'Sign in to sync')
	assert.equal(state.detail, 'Local mode')
})

test('sync error presents sync error while keeping local changes', () => {
	const state = derive({planningState: {syncStatus: 'error', dirty: true, lastSuccessfulSyncAt: 1789106400000}})

	assert.equal(state.presentation, 'error')
	assert.equal(state.title, 'Sync error')
	assert.equal(state.detail, 'Changes kept locally')
	assert.equal(state.lastSuccessfulSyncAt, 1789106400000)
})

test('conflict has highest presentation priority', () => {
	const state = derive({
		network: 'offline',
		authState: {token: null, userId: null},
		planningState: {syncStatus: 'conflict', dirty: true}
	})

	assert.equal(state.presentation, 'conflict')
	assert.equal(state.title, 'Sync conflict')
	assert.equal(state.detail, 'Review required')
})

test('auth paused from planning sync 401 or 403 does not become synced because network is online', () => {
	const state = derive({planningState: {syncStatus: 'paused', dirty: true}})

	assert.equal(state.network, 'online')
	assert.equal(state.api, 'auth_required')
	assert.equal(state.sync, 'auth-paused')
	assert.equal(state.presentation, 'auth-required')
	assert.notEqual(state.presentation, 'synced')
})

test('authenticated API 401 with existing token marks clean planning as auth required, not synced', async () => {
	localStorage.clear()
	setAuthState({token: 'stale-token', user: {id: 1, username: 'demo'}})
	globalThis.fetch = async () => ({
		status: 401,
		json: async () => ({error: 'Unauthorized'})
	})

	await assert.rejects(() => api.get('/hbv2/balance'))

	const authState = getAuthState()
	const state = derive({
		authState: {
			token: authState.token,
			userId: authState.user.id,
			apiAuthStatus: authState.apiAuthStatus
		},
		planningState: {syncStatus: 'synced', dirty: false}
	})

	assert.equal(authState.apiAuthStatus, API_AUTH_STATUS.REJECTED)
	assert.equal(authState.token, 'stale-token')
	assert.equal(authState.user.id, 1)
	assert.equal(state.api, 'auth_required')
	assert.equal(state.presentation, 'auth-required')
	assert.equal(state.title, 'Sign in to sync')
	assert.notEqual(state.presentation, 'synced')
})

test('auth required remains auth required after navigator online event', () => {
	const listeners = new Map()
	const windowRef = {
		addEventListener: (eventName, listener) => listeners.set(eventName, listener)
	}
	const navigatorRef = {onLine: false}
	const service = new NetworkStatusService({windowRef, navigatorRef})
	const rejectedAuth = {
		token: 'stale-token',
		userId: 1,
		apiAuthStatus: API_AUTH_STATUS.REJECTED
	}

	navigatorRef.onLine = true
	listeners.get('online')()

	const state = deriveConnectionSyncState({
		networkState: service.getState(),
		authState: rejectedAuth,
		planningState: {syncStatus: 'synced', dirty: false}
	})

	assert.equal(state.network, 'online')
	assert.equal(state.api, 'auth_required')
	assert.equal(state.presentation, 'auth-required')
})

test('auth required remains auth required when planning queue is clean', () => {
	const state = derive({
		authState: {token: 'stale-token', userId: 1, apiAuthStatus: API_AUTH_STATUS.REJECTED},
		planningState: {syncStatus: 'synced', dirty: false}
	})

	assert.equal(state.pendingCount, 0)
	assert.equal(state.presentation, 'auth-required')
})

test('auth required remains auth required after local planning edit while preserving pending data', () => {
	const state = derive({
		authState: {token: 'stale-token', userId: 1, apiAuthStatus: API_AUTH_STATUS.REJECTED},
		planningState: {syncStatus: 'pending', dirty: true}
	})

	assert.equal(state.api, 'auth_required')
	assert.equal(state.presentation, 'auth-required')
	assert.equal(state.pendingCount, 1)
})

test('offline with previously valid auth presents offline', () => {
	const state = derive({
		network: 'offline',
		authState: {token: 'token', userId: 1, apiAuthStatus: API_AUTH_STATUS.AUTHENTICATED},
		planningState: {syncStatus: 'synced', dirty: false}
	})

	assert.equal(state.api, 'authenticated')
	assert.equal(state.presentation, 'offline')
	assert.equal(state.detail, 'Local data available')
})

test('successful authentication after auth required restores authenticated API state', () => {
	localStorage.clear()
	setAuthState({token: 'stale-token', user: {id: 1, username: 'demo'}})
	const rejected = getAuthState()
	localStorage.setItem('hboo-auth-v1', JSON.stringify({
		...rejected,
		apiAuthStatus: API_AUTH_STATUS.REJECTED,
		apiAuthRejectedStatus: 401
	}))

	setAuthState({token: 'fresh-token', user: {id: 1, username: 'demo'}})
	const authState = getAuthState()

	assert.equal(authState.apiAuthStatus, API_AUTH_STATUS.AUTHENTICATED)
	assert.equal(authState.token, 'fresh-token')
})

test('successful authenticated response after a 401 recovery leaves API state authenticated', async () => {
	localStorage.clear()
	setAuthState({token: 'recoverable-token', user: {id: 1, username: 'demo'}})
	globalThis.fetch = async () => ({
		status: 401,
		json: async () => ({error: 'Unauthorized'})
	})

	await assert.rejects(() => api.get('/hbv2/balance'))
	assert.equal(getAuthState().apiAuthStatus, API_AUTH_STATUS.REJECTED)

	setAuthState({token: 'fresh-token', user: {id: 1, username: 'demo'}})
	globalThis.fetch = async () => ({
		status: 200,
		json: async () => ({ok: true})
	})

	await api.get('/hbv2/balance')
	assert.equal(getAuthState().apiAuthStatus, API_AUTH_STATUS.AUTHENTICATED)
})

test('old in-flight authenticated 200 after rejection does not restore same token', async () => {
	localStorage.clear()
	setAuthState({token: 'stale-token', user: {id: 1, username: 'demo'}})
	globalThis.fetch = async () => ({
		status: 401,
		json: async () => ({error: 'Unauthorized'})
	})

	await assert.rejects(() => api.get('/hbv2/balance'))
	assert.equal(getAuthState().apiAuthStatus, API_AUTH_STATUS.REJECTED)

	api.observeResponseAuth({status: 200}, {Authorization: 'Bearer stale-token'})

	assert.equal(getAuthState().apiAuthStatus, API_AUTH_STATUS.REJECTED)
})

test('authenticated request 401 followed by public categories 200 keeps auth rejected', async () => {
	localStorage.clear()
	setAuthState({token: 'stale-token', user: {id: 1, username: 'demo'}})
	globalThis.fetch = async () => ({
		status: 401,
		json: async () => ({error: 'Unauthorized'})
	})

	await assert.rejects(() => api.get('/hbv2/transaction'))
	assert.equal(getAuthState().apiAuthStatus, API_AUTH_STATUS.REJECTED)

	api.observeResponseAuth({status: 200}, {})

	assert.equal(getAuthState().apiAuthStatus, API_AUTH_STATUS.REJECTED)
})

test('categories 200 alone does not set authenticated', () => {
	localStorage.clear()
	setAuthState({token: 'token', user: {id: 1, username: 'demo'}})
	const authState = getAuthState()
	localStorage.setItem('hboo-auth-v1', JSON.stringify({
		...authState,
		apiAuthStatus: API_AUTH_STATUS.UNKNOWN
	}))

	api.observeResponseAuth({status: 200}, {})

	assert.equal(getAuthState().apiAuthStatus, API_AUTH_STATUS.UNKNOWN)
})

test('unknown auth plus public categories 200 remains unknown', () => {
	localStorage.clear()
	api.observeResponseAuth({status: 200}, {})

	assert.equal(getAuthState(), null)
})

test('unknown auth plus genuinely authenticated 200 becomes authenticated', () => {
	localStorage.clear()
	setAuthState({token: 'token', user: {id: 1, username: 'demo'}})
	const authState = getAuthState()
	localStorage.setItem('hboo-auth-v1', JSON.stringify({
		...authState,
		apiAuthStatus: API_AUTH_STATUS.UNKNOWN
	}))

	api.observeResponseAuth({status: 200}, {Authorization: 'Bearer token'})

	assert.equal(getAuthState().apiAuthStatus, API_AUTH_STATUS.AUTHENTICATED)
})

test('transactions 401 followed by categories 200 presents sign in to sync', async () => {
	localStorage.clear()
	setAuthState({token: 'stale-token', user: {id: 1, username: 'demo'}})
	globalThis.fetch = async () => ({
		status: 401,
		json: async () => ({error: 'Unauthorized'})
	})

	await assert.rejects(() => api.get('/hbv2/transaction'))
	api.observeResponseAuth({status: 200}, {})

	const authState = getAuthState()
	const state = derive({
		authState: {
			token: authState.token,
			userId: authState.user.id,
			apiAuthStatus: authState.apiAuthStatus
		},
		planningState: {syncStatus: 'synced', dirty: false}
	})

	assert.equal(state.presentation, 'auth-required')
	assert.equal(state.title, 'Sign in to sync')
})

test('successful public response does not restore rejected API auth state', () => {
	localStorage.clear()
	setAuthState({token: 'stale-token', user: {id: 1, username: 'demo'}})
	const rejected = getAuthState()
	localStorage.setItem('hboo-auth-v1', JSON.stringify({
		...rejected,
		apiAuthStatus: API_AUTH_STATUS.REJECTED,
		apiAuthRejectedStatus: 401
	}))

	api.observeResponseAuth({status: 200}, {})

	assert.equal(getAuthState().apiAuthStatus, API_AUTH_STATUS.REJECTED)
})

test('Planning sync metadata persists last successful sync locally per user', () => {
	localStorage.clear()
	setAuthState({token: 'token', user: {id: 7, username: 'demo'}})

	const metadata = markPlanningSyncSucceeded(1789106400000)
	const restored = readPlanningSyncMetadata(7)

	assert.equal(metadata.lastSuccessfulSyncAt, 1789106400000)
	assert.equal(restored.lastSuccessfulSyncAt, 1789106400000)
})

test('public and authenticated API activity does not update Planning sync metadata', () => {
	localStorage.clear()
	setAuthState({token: 'token', user: {id: 8, username: 'demo'}})
	writePlanningSyncMetadata({lastSuccessfulSyncAt: 1789106400000}, 8)

	api.observeResponseAuth({status: 200}, {})
	api.observeResponseAuth({status: 200}, {Authorization: 'Bearer token'})

	assert.equal(readPlanningSyncMetadata(8).lastSuccessfulSyncAt, 1789106400000)
})

test('network status service emits offline to online transition', () => {
	const listeners = new Map()
	const windowRef = {
		addEventListener: (eventName, listener) => listeners.set(eventName, listener)
	}
	const navigatorRef = {onLine: false}
	const service = new NetworkStatusService({windowRef, navigatorRef})
	const states = []

	service.subscribe(state => states.push(state.network))
	assert.equal(service.getState().network, 'offline')

	navigatorRef.onLine = true
	listeners.get('online')()

	assert.deepEqual(states, ['offline', 'online'])
	assert.equal(service.getState().network, 'online')
})

test('network online listener is centralized outside PlanningStore', () => {
	const planningStoreSource = fs.readFileSync(path.join(frontendRoot, 'hbapp/stores/PlanningStore.js'), 'utf8')
	const transactionStoreSource = fs.readFileSync(path.join(frontendRoot, 'hbapp/stores/TransactionStore.js'), 'utf8')
	const networkServiceSource = fs.readFileSync(path.join(frontendRoot, 'hbapp/services/NetworkStatusService.js'), 'utf8')

	assert.doesNotMatch(planningStoreSource, /addEventListener\(['"]online['"]/)
	assert.doesNotMatch(planningStoreSource, /navigator\.onLine/)
	assert.doesNotMatch(transactionStoreSource, /navigator\.onLine/)
	assert.match(networkServiceSource, /addEventListener\('online'/)
})

test('API auth rejection is centralized outside feature stores', () => {
	const balanceStoreSource = fs.readFileSync(path.join(frontendRoot, 'hbapp/stores/BalanceStore.js'), 'utf8')
	const transactionStoreSource = fs.readFileSync(path.join(frontendRoot, 'hbapp/stores/TransactionStore.js'), 'utf8')
	const planningStoreSource = fs.readFileSync(path.join(frontendRoot, 'hbapp/stores/PlanningStore.js'), 'utf8')
	const authSessionSource = fs.readFileSync(path.join(frontendRoot, 'hbapp/services/AuthSession.js'), 'utf8')
	const apiSource = fs.readFileSync(path.join(frontendRoot, 'hbapp/mixins/apiQueriesHelper.js'), 'utf8')

	assert.doesNotMatch(balanceStoreSource, /401|403|markApiAuthRejected/)
	assert.doesNotMatch(transactionStoreSource, /401|403|markApiAuthRejected/)
	assert.doesNotMatch(planningStoreSource, /markApiAuthRejected/)
	assert.match(authSessionSource, /markApiAuthRejected/)
	assert.match(apiSource, /observeAuthenticatedResponse/)
})

test('Planning sync timestamp is updated only from PlanningStore sync completion path', () => {
	const apiSource = fs.readFileSync(path.join(frontendRoot, 'hbapp/mixins/apiQueriesHelper.js'), 'utf8')
	const balanceStoreSource = fs.readFileSync(path.join(frontendRoot, 'hbapp/stores/BalanceStore.js'), 'utf8')
	const transactionStoreSource = fs.readFileSync(path.join(frontendRoot, 'hbapp/stores/TransactionStore.js'), 'utf8')
	const categorySource = fs.readFileSync(path.join(frontendRoot, 'hbapp/services/CategoryApiService.js'), 'utf8')
	const planningStoreSource = fs.readFileSync(path.join(frontendRoot, 'hbapp/stores/PlanningStore.js'), 'utf8')

	assert.doesNotMatch(apiSource, /markPlanningSyncSucceeded/)
	assert.doesNotMatch(balanceStoreSource, /markPlanningSyncSucceeded/)
	assert.doesNotMatch(transactionStoreSource, /markPlanningSyncSucceeded/)
	assert.doesNotMatch(categorySource, /markPlanningSyncSucceeded/)
	assert.match(planningStoreSource, /syncQueue\.complete\(syncingOperation\)[\s\S]*markPlanningSyncSucceeded/)
})
