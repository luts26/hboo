import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import AuthForm from '../hbapp/components/AuthForm.js'
import {AuthModal} from '../hbapp/components/AuthModal.js'
import {
	API_AUTH_STATUS,
	AUTH_STORAGE_KEY,
	getAuthState,
	setAuthState
} from '../hbapp/services/AuthSession.js'

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

class FakeClassList {
	constructor() {
		this.values = new Set()
	}

	add(value) {
		this.values.add(value)
	}

	remove(value) {
		this.values.delete(value)
	}

	contains(value) {
		return this.values.has(value)
	}
}

const createAuthRoot = ({username = 'demo', password = 'secret'} = {}) => {
	const listeners = new Map()
	const nodes = {
		form: {
			addEventListener: (eventName, listener) => listeners.set(`form:${eventName}`, listener),
			removeEventListener: () => {}
		},
		email: {
			value: username,
			focused: false,
			focus() {
				this.focused = true
			}
		},
		password: {value: password},
		cancel: {
			addEventListener: (eventName, listener) => listeners.set(`cancel:${eventName}`, listener),
			removeEventListener: () => {}
		}
	}

	return {
		nodes,
		listeners,
		html: '',
		set innerHTML(value) {
			this.html = value
		},
		get innerHTML() {
			return this.html
		},
		querySelector(selector) {
			if (selector === '[data-auth-form]') return nodes.form
			if (selector === '.email') return nodes.email
			if (selector === '.password') return nodes.password
			if (selector === '[data-auth-cancel]') return nodes.cancel
			return null
		}
	}
}

const createNetworkService = ({offline = false} = {}) => ({
	isOffline: () => offline,
	subscribe: listener => {
		listener({network: offline ? 'offline' : 'online'})
		return () => {}
	}
})

globalThis.localStorage = new LocalStorageMock()

test('rejected auth plus HBOO Sync click opens auth modal without route changes', () => {
	const hbappSource = fs.readFileSync(path.join(frontendRoot, 'hbapp/hbapp.js'), 'utf8')

	assert.match(hbappSource, /data-action="hboo-sync-status"[\s\S]*connectionSyncStatus\.getState\(\)\.api === 'auth_required'[\s\S]*authModal\.open\(\)/)
	assert.doesNotMatch(hbappSource, /authModal\.open\(\)[\s\S]{0,120}redirectRouter/)
})

test('AuthModal close and Continue offline do not logout, clear identity, clear queue, or navigate', () => {
	const authModalSource = fs.readFileSync(path.join(frontendRoot, 'hbapp/components/AuthModal.js'), 'utf8')

	assert.doesNotMatch(authModalSource, /clearAuthState|logoutApp|redirectRouter|location\.reload|indexedDB|syncQueue/)
	assert.match(authModalSource, /onCancel: \(\) => this\.close\(\)/)
})

test('successful login uses login API, authenticates, clears rejected token metadata, and preserves route', async () => {
	localStorage.clear()
	setAuthState({token: 'stale-token', user: {id: 1, username: 'demo'}})
	const rejected = getAuthState()
	localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
		...rejected,
		apiAuthStatus: API_AUTH_STATUS.REJECTED,
		apiAuthRejectedToken: 'stale-token',
		apiAuthRejectedStatus: 401
	}))

	let loginCalled = false
	let successCalled = false
	const root = createAuthRoot()
	const form = new AuthForm({
		root,
		networkService: createNetworkService(),
		loginApi: async credentials => {
			loginCalled = true
			assert.deepEqual(credentials, {username: 'demo', password: 'secret'})
			return {token: 'fresh-token', user: {id: 1, username: 'demo'}}
		},
		onSuccess: () => {
			successCalled = true
		}
	})

	await form.submit()
	const authState = getAuthState()

	assert.equal(loginCalled, true)
	assert.equal(successCalled, true)
	assert.equal(authState.apiAuthStatus, API_AUTH_STATUS.AUTHENTICATED)
	assert.equal(authState.token, 'fresh-token')
	assert.equal(authState.apiAuthRejectedToken, null)
	assert.doesNotMatch(fs.readFileSync(path.join(frontendRoot, 'hbapp/components/AuthForm.js'), 'utf8'), /redirectRouter|location\.reload/)
})

test('invalid credentials keep auth form open and local state untouched', async () => {
	localStorage.clear()
	setAuthState({token: 'stale-token', user: {id: 1, username: 'demo'}})
	const before = getAuthState()
	const root = createAuthRoot()
	const form = new AuthForm({
		root,
		networkService: createNetworkService(),
		loginApi: async () => {
			const error = new Error('Unauthorized')
			error.status = 401
			throw error
		}
	})

	const result = await form.submit()

	assert.equal(result, null)
	assert.equal(root.html.includes('Invalid login or password.'), true)
	assert.deepEqual(getAuthState(), before)
})

test('offline auth form disables destructive login and keeps local app usable', async () => {
	localStorage.clear()
	setAuthState({token: 'stale-token', user: {id: 1, username: 'demo'}})
	let loginCalled = false
	const root = createAuthRoot()
	const form = new AuthForm({
		root,
		networkService: createNetworkService({offline: true}),
		loginApi: async () => {
			loginCalled = true
			return {token: 'fresh-token', user: {id: 1, username: 'demo'}}
		}
	})

	const result = await form.submit()

	assert.equal(result, null)
	assert.equal(loginCalled, false)
	assert.equal(root.html.includes('Connection is unavailable'), true)
	assert.equal(getAuthState().token, 'stale-token')
})

test('successful login with pending Planning queue resumes through recovery signal, not direct Planning PUTs from modal', () => {
	const planningStoreSource = fs.readFileSync(path.join(frontendRoot, 'hbapp/stores/PlanningStore.js'), 'utf8')
	const authModalSource = fs.readFileSync(path.join(frontendRoot, 'hbapp/components/AuthModal.js'), 'utf8')
	const authFormSource = fs.readFileSync(path.join(frontendRoot, 'hbapp/components/AuthForm.js'), 'utf8')

	assert.match(planningStoreSource, /subscribeAuthState/)
	assert.match(planningStoreSource, /previousApiAuthStatus === API_AUTH_STATUS\.REJECTED[\s\S]*nextApiAuthStatus === API_AUTH_STATUS\.AUTHENTICATED[\s\S]*handleRecoverySignal\('auth-restored'\)/)
	assert.doesNotMatch(authModalSource + authFormSource, /createItem|updateItem|deleteItem|processSyncQueue|PlanningApiService/)
})

test('authenticated HBOO Sync card click does not open auth modal', () => {
	const hbappSource = fs.readFileSync(path.join(frontendRoot, 'hbapp/hbapp.js'), 'utf8')

	assert.match(hbappSource, /connectionSyncStatus\.getState\(\)\.api === 'auth_required'/)
	assert.doesNotMatch(hbappSource, /state\.presentation === 'synced'[\s\S]*authModal\.open\(\)/)
})

test('401 and 403 update auth-required state but do not auto-open auth modal', () => {
	const apiSource = fs.readFileSync(path.join(frontendRoot, 'hbapp/mixins/apiQueriesHelper.js'), 'utf8')
	const authSessionSource = fs.readFileSync(path.join(frontendRoot, 'hbapp/services/AuthSession.js'), 'utf8')

	assert.match(authSessionSource, /status === 401 \|\| status === 403/)
	assert.doesNotMatch(apiSource + authSessionSource, /authModal|AuthModal|openAuth/)
})

test('public categories 200 after rejected auth remains public and does not restore auth', () => {
	const categorySource = fs.readFileSync(path.join(frontendRoot, 'hbapp/services/CategoryApiService.js'), 'utf8')

	assert.match(categorySource, /api\.getPublicHeaders\(\)/)
	assert.doesNotMatch(categorySource, /Authorization|observeResponseAuth|markApiAuthAuthenticated|setAuthState/)
})

test('route preservation covers /planing on modal success and close', () => {
	const authModalSource = fs.readFileSync(path.join(frontendRoot, 'hbapp/components/AuthModal.js'), 'utf8')
	const authFormSource = fs.readFileSync(path.join(frontendRoot, 'hbapp/components/AuthForm.js'), 'utf8')

	assert.doesNotMatch(authModalSource + authFormSource, /pushState|redirectRouter|location\.href|location\.assign|location\.reload|window\.history/)
})

test('Planning conflict behavior is not bypassed or cleared by auth modal changes', () => {
	const planningStoreSource = fs.readFileSync(path.join(frontendRoot, 'hbapp/stores/PlanningStore.js'), 'utf8')
	const authModalSource = fs.readFileSync(path.join(frontendRoot, 'hbapp/components/AuthModal.js'), 'utf8')

	assert.match(planningStoreSource, /operation\.status === 'conflict'/)
	assert.match(planningStoreSource, /markServerRevalidationConflict/)
	assert.doesNotMatch(authModalSource, /conflict|markCleanFromState|replaceFromServer/)
})

test('AuthModal open and close restore focus and leave current route untouched', () => {
	const focusTarget = {
		focused: false,
		focus() {
			this.focused = true
		}
	}
	const body = {
		classList: new FakeClassList(),
		appended: [],
		append(node) {
			this.appended.push(node)
		}
	}
	const modalBody = createAuthRoot()
	const closeButton = {
		addEventListener: () => {}
	}
	const documentRef = {
		activeElement: focusTarget,
		body,
		events: new Map(),
		createElement: () => ({
			className: '',
			removed: false,
			set innerHTML(value) {
				this.html = value
			},
			get innerHTML() {
				return this.html
			},
			querySelector(selector) {
				if (selector === '.auth-modal-body') return modalBody
				if (selector === '.auth-modal-close') return closeButton
				return null
			},
			remove() {
				this.removed = true
			}
		}),
		addEventListener(eventName, listener) {
			this.events.set(eventName, listener)
		},
		removeEventListener(eventName) {
			this.events.delete(eventName)
		}
	}
	const modal = new AuthModal({documentRef})

	modal.open()
	assert.equal(modal.isOpen(), true)
	assert.equal(body.classList.contains('hboo-auth-modal-open'), true)

	modal.close()
	assert.equal(modal.isOpen(), false)
	assert.equal(body.classList.contains('hboo-auth-modal-open'), false)
	assert.equal(focusTarget.focused, true)
})
