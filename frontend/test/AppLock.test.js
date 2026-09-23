import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {
	APP_LOCK_STORAGE_KEY,
	AppLockService
} from '../hbapp/services/AppLockService.js'
import {AppLockSession} from '../hbapp/services/AppLockSession.js'
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

class FakeDocument {
	constructor() {
		this.visibilityState = 'visible'
		this.listeners = new Map()
	}

	addEventListener(eventName, listener) {
		this.listeners.set(eventName, listener)
	}

	removeEventListener(eventName) {
		this.listeners.delete(eventName)
	}

	setVisibility(visibilityState) {
		this.visibilityState = visibilityState
		this.listeners.get('visibilitychange')?.()
	}
}

const createService = storage => new AppLockService({
	storage,
	cryptoRef: globalThis.crypto,
	iterations: 1000
})

const setupEnabledService = async (storage, pin = '1234') => {
	const service = createService(storage)
	await service.setupPin(pin)
	return service
}

globalThis.localStorage = new LocalStorageMock()

test('App Lock disabled keeps a new session unlocked', () => {
	const service = createService(new LocalStorageMock())
	const session = new AppLockSession({service})

	assert.equal(service.isEnabled(), false)
	assert.equal(session.isLocked(), false)
	assert.equal(session.isUnlocked(), true)
})

test('valid PIN setup creates versioned verifier config without plaintext PIN', async () => {
	const storage = new LocalStorageMock()
	const service = createService(storage)

	await service.setupPin('1234')
	const rawData = storage.getItem(APP_LOCK_STORAGE_KEY)
	const config = JSON.parse(rawData)

	assert.equal(config.version, 1)
	assert.equal(config.enabled, true)
	assert.equal(config.pbkdf2.hash, 'SHA-256')
	assert.equal(config.pbkdf2.iterations, 1000)
	assert.ok(config.salt)
	assert.ok(config.verifier)
	assert.equal(rawData.includes('1234'), false)
	assert.equal(rawData.includes('"pin"'), false)
})

test('invalid setup PIN values do not enable App Lock', async () => {
	for (const pin of ['123', '123456789', '12ab']) {
		const storage = new LocalStorageMock()
		const service = createService(storage)

		await assert.rejects(() => service.setupPin(pin), /4-8 digits/)
		assert.equal(storage.getItem(APP_LOCK_STORAGE_KEY), null)
	}
})

test('setup confirmation mismatch is rejected before persistence', async () => {
	const storage = new LocalStorageMock()
	const service = createService(storage)

	const setupWithConfirmation = async (pin, confirmPin) => {
		service.assertPin(pin)
		if (pin !== confirmPin) throw new Error('PIN values do not match.')
		await service.setupPin(pin)
	}

	await assert.rejects(() => setupWithConfirmation('1234', '4321'), /match/)
	assert.equal(storage.getItem(APP_LOCK_STORAGE_KEY), null)
})

test('enabled config cold-starts locked in a new runtime session', async () => {
	const storage = new LocalStorageMock()
	const service = await setupEnabledService(storage)
	const session = new AppLockSession({service})

	assert.equal(session.isLocked(), true)
})

test('correct PIN unlocks and wrong PIN remains locked', async () => {
	const storage = new LocalStorageMock()
	const service = await setupEnabledService(storage, '2468')
	const session = new AppLockSession({service})

	assert.equal(await service.verifyPin('1357'), false)
	assert.equal(session.isLocked(), true)
	assert.equal(await service.verifyPin('2468'), true)
	session.unlock()
	assert.equal(session.isUnlocked(), true)
})

test('unlock does not alter AuthSession authenticated or rejected state', async () => {
	const storage = new LocalStorageMock()
	const service = await setupEnabledService(storage)
	const session = new AppLockSession({service})

	localStorage.clear()
	setAuthState({token: 'token-auth', user: {id: 1, username: 'demo'}})
	const authenticatedBefore = getAuthState()
	session.unlock()
	assert.deepEqual(getAuthState(), authenticatedBefore)

	localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
		...authenticatedBefore,
		apiAuthStatus: API_AUTH_STATUS.REJECTED,
		apiAuthRejectedToken: 'token-auth',
		apiAuthRejectedStatus: 401
	}))
	const rejectedBefore = getAuthState()
	session.lock()
	session.unlock()
	assert.deepEqual(getAuthState(), rejectedBefore)
})

test('lock does not alter Planning queue operation objects', async () => {
	const storage = new LocalStorageMock()
	const service = await setupEnabledService(storage)
	const session = new AppLockSession({service})
	const operation = {operationId: 'planning.syncState:user:1', status: 'paused', attempts: 1}
	const before = JSON.stringify(operation)

	session.lock()

	assert.equal(JSON.stringify(operation), before)
})

test('Lock now locks without changing the current route', async () => {
	const storage = new LocalStorageMock()
	const service = await setupEnabledService(storage)
	const session = new AppLockSession({service})
	const route = '/planing'

	session.unlock()
	session.lock()

	assert.equal(route, '/planing')
	assert.equal(session.isLocked(), true)
})

test('background less than timeout remains unlocked', async () => {
	const storage = new LocalStorageMock()
	const service = await setupEnabledService(storage)
	service.setLockTimeoutMs(5 * 60 * 1000)
	let now = 1000
	const documentRef = new FakeDocument()
	const session = new AppLockSession({service, documentRef, clock: () => now})
	session.start()
	session.unlock()

	documentRef.setVisibility('hidden')
	now += 60 * 1000
	documentRef.setVisibility('visible')

	assert.equal(session.isUnlocked(), true)
})

test('background greater than timeout locks', async () => {
	const storage = new LocalStorageMock()
	const service = await setupEnabledService(storage)
	service.setLockTimeoutMs(60 * 1000)
	let now = 1000
	const documentRef = new FakeDocument()
	const session = new AppLockSession({service, documentRef, clock: () => now})
	session.start()
	session.unlock()

	documentRef.setVisibility('hidden')
	now += 61 * 1000
	documentRef.setVisibility('visible')

	assert.equal(session.isLocked(), true)
})

test('immediate timeout locks after hide and visible', async () => {
	const storage = new LocalStorageMock()
	const service = await setupEnabledService(storage)
	service.setLockTimeoutMs(0)
	let now = 1000
	const documentRef = new FakeDocument()
	const session = new AppLockSession({service, documentRef, clock: () => now})
	session.start()
	session.unlock()

	documentRef.setVisibility('hidden')
	now += 1
	documentRef.setVisibility('visible')

	assert.equal(session.isLocked(), true)
})

test('route preservation source covers /planing without redirect on lock or unlock', () => {
	const sessionSource = fs.readFileSync(path.join(frontendRoot, 'hbapp/services/AppLockSession.js'), 'utf8')
	const screenSource = fs.readFileSync(path.join(frontendRoot, 'hbapp/components/AppLockScreen.js'), 'utf8')

	assert.doesNotMatch(sessionSource + screenSource, /redirectRouter|pushState|location\.href|location\.assign|location\.reload/)
})

test('offline unlock verifies locally without API calls', async () => {
	const storage = new LocalStorageMock()
	const service = await setupEnabledService(storage, '8642')
	let fetchCalled = false
	globalThis.fetch = async () => {
		fetchCalled = true
		return {status: 200}
	}

	assert.equal(await service.verifyPin('8642'), true)
	assert.equal(fetchCalled, false)
})

test('disable App Lock requires correct PIN and leaves auth and local financial data untouched', async () => {
	const storage = new LocalStorageMock()
	const service = await setupEnabledService(storage, '2222')
	storage.setItem('hboo-balance-cache-v1', JSON.stringify({balance: 100}))
	localStorage.clear()
	setAuthState({token: 'auth-token', user: {id: 1, username: 'demo'}})
	const authBefore = getAuthState()

	await assert.rejects(() => service.disablePin('3333'), /Incorrect PIN/)
	assert.equal(service.isEnabled(), true)
	await service.disablePin('2222')

	assert.equal(service.isEnabled(), false)
	assert.equal(storage.getItem(APP_LOCK_STORAGE_KEY), null)
	assert.equal(storage.getItem('hboo-balance-cache-v1'), JSON.stringify({balance: 100}))
	assert.deepEqual(getAuthState(), authBefore)
})

test('change PIN replaces salt, old PIN fails, and new PIN works', async () => {
	const storage = new LocalStorageMock()
	const service = await setupEnabledService(storage, '1111')
	const before = JSON.parse(storage.getItem(APP_LOCK_STORAGE_KEY))

	await service.changePin('1111', '9876')
	const after = JSON.parse(storage.getItem(APP_LOCK_STORAGE_KEY))

	assert.notEqual(after.salt, before.salt)
	assert.equal(await service.verifyPin('1111'), false)
	assert.equal(await service.verifyPin('9876'), true)
})

test('serialized config never contains plaintext PIN', async () => {
	const storage = new LocalStorageMock()
	const service = createService(storage)

	await service.setupPin('5555')

	assert.equal(storage.getItem(APP_LOCK_STORAGE_KEY).includes('5555'), false)
})

test('AppLockScreen is layered above AuthModal', () => {
	const cssSource = fs.readFileSync(path.join(frontendRoot, 'hbapp/assets/styles/main.css'), 'utf8')
	const authModalZIndex = Number(cssSource.match(/\.app-modal-backdrop\s*\{[\s\S]*?z-index:\s*(\d+)/)?.[1])
	const appLockZIndex = Number(cssSource.match(/\.app-lock-screen\s*\{[\s\S]*?z-index:\s*(\d+)/)?.[1])

	assert.ok(appLockZIndex > authModalZIndex)
})

test('App Lock source stays independent from API auth, IndexedDB clearing, and Planning sync processing', () => {
	const serviceSource = fs.readFileSync(path.join(frontendRoot, 'hbapp/services/AppLockService.js'), 'utf8')
	const sessionSource = fs.readFileSync(path.join(frontendRoot, 'hbapp/services/AppLockSession.js'), 'utf8')
	const screenSource = fs.readFileSync(path.join(frontendRoot, 'hbapp/components/AppLockScreen.js'), 'utf8')
	const combined = serviceSource + sessionSource + screenSource

	assert.doesNotMatch(combined, /clearAuthState|logoutApp|setAuthState|\/auth\/login/)
	assert.doesNotMatch(combined, /indexedDB|deleteDatabase|syncQueue|processSyncQueue/)
})
