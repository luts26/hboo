const APP_LOCK_STORAGE_KEY = 'hboo-app-lock-v1'
const APP_LOCK_VERSION = 1
const APP_LOCK_DEFAULT_TIMEOUT_MS = 5 * 60 * 1000
const APP_LOCK_DEFAULT_ITERATIONS = 210000
const APP_LOCK_TIMEOUT_OPTIONS = [
	{value: 0, label: 'Immediately'},
	{value: 60 * 1000, label: '1 minute'},
	{value: 5 * 60 * 1000, label: '5 minutes'},
	{value: 15 * 60 * 1000, label: '15 minutes'}
]

const PIN_PATTERN = /^\d{4,8}$/

const getStorage = () => typeof localStorage !== 'undefined' ? localStorage : null

const normalizeTimeout = value => {
	const timeout = Number(value)
	return APP_LOCK_TIMEOUT_OPTIONS.some(option => option.value === timeout)
		? timeout
		: APP_LOCK_DEFAULT_TIMEOUT_MS
}

const bytesToBase64 = bytes => {
	let binary = ''
	bytes.forEach(byte => {
		binary += String.fromCharCode(byte)
	})
	return btoa(binary)
}

const base64ToBytes = value => {
	const binary = atob(String(value || ''))
	const bytes = new Uint8Array(binary.length)
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index)
	}
	return bytes
}

const timingSafeEqual = (left, right) => {
	if (!(left instanceof Uint8Array) || !(right instanceof Uint8Array)) return false
	let diff = left.length ^ right.length
	const length = Math.max(left.length, right.length)
	for (let index = 0; index < length; index += 1) {
		diff |= (left[index] || 0) ^ (right[index] || 0)
	}
	return diff === 0
}

class AppLockService {

	constructor({
		storageKey = APP_LOCK_STORAGE_KEY,
		storage = getStorage(),
		cryptoRef = globalThis.crypto,
		iterations = APP_LOCK_DEFAULT_ITERATIONS
	} = {}) {
		this.storageKey = storageKey
		this.storage = storage
		this.cryptoRef = cryptoRef
		this.iterations = iterations
	}

	loadConfig() {
		try {
			const rawData = this.storage?.getItem(this.storageKey)
			if (!rawData) return null
			const config = JSON.parse(rawData)
			if (config?.version !== APP_LOCK_VERSION || config.enabled !== true) return null
			if (!config.salt || !config.verifier || !config.pbkdf2) return null
			return {
				version: APP_LOCK_VERSION,
				enabled: true,
				salt: String(config.salt),
				verifier: String(config.verifier),
				pbkdf2: {
					hash: config.pbkdf2.hash === 'SHA-256' ? 'SHA-256' : 'SHA-256',
					iterations: Math.max(1, Number(config.pbkdf2.iterations) || this.iterations),
					length: Math.max(128, Number(config.pbkdf2.length) || 256)
				},
				lockTimeoutMs: normalizeTimeout(config.lockTimeoutMs)
			}
		} catch {
			return null
		}
	}

	isEnabled() {
		return this.loadConfig()?.enabled === true
	}

	getLockTimeoutMs() {
		return this.loadConfig()?.lockTimeoutMs ?? APP_LOCK_DEFAULT_TIMEOUT_MS
	}

	validatePin(pin) {
		return PIN_PATTERN.test(String(pin || ''))
	}

	assertPin(pin) {
		if (!this.validatePin(pin)) {
			throw new Error('PIN must contain 4-8 digits.')
		}
	}

	assertCryptoAvailable() {
		if (!this.cryptoRef?.getRandomValues || !this.cryptoRef?.subtle) {
			throw new Error('Local PIN protection is not available in this browser.')
		}
	}

	async setupPin(pin, {lockTimeoutMs = this.getLockTimeoutMs()} = {}) {
		this.assertPin(pin)
		this.assertCryptoAvailable()
		const salt = new Uint8Array(16)
		this.cryptoRef.getRandomValues(salt)
		const pbkdf2 = {
			hash: 'SHA-256',
			iterations: this.iterations,
			length: 256
		}
		const verifier = await this.deriveVerifier(pin, salt, pbkdf2)
		const config = {
			version: APP_LOCK_VERSION,
			enabled: true,
			salt: bytesToBase64(salt),
			verifier: bytesToBase64(verifier),
			pbkdf2,
			lockTimeoutMs: normalizeTimeout(lockTimeoutMs)
		}
		this.storage?.setItem(this.storageKey, JSON.stringify(config))
		return config
	}

	async verifyPin(pin) {
		if (!this.validatePin(pin)) return false
		const config = this.loadConfig()
		if (!config) return false
		this.assertCryptoAvailable()
		const salt = base64ToBytes(config.salt)
		const expected = base64ToBytes(config.verifier)
		const actual = await this.deriveVerifier(pin, salt, config.pbkdf2)
		return timingSafeEqual(actual, expected)
	}

	async changePin(currentPin, nextPin, {lockTimeoutMs = this.getLockTimeoutMs()} = {}) {
		const verified = await this.verifyPin(currentPin)
		if (!verified) throw new Error('Incorrect PIN.')
		return this.setupPin(nextPin, {lockTimeoutMs})
	}

	async disablePin(pin) {
		const verified = await this.verifyPin(pin)
		if (!verified) throw new Error('Incorrect PIN.')
		this.storage?.removeItem(this.storageKey)
		return true
	}

	setLockTimeoutMs(lockTimeoutMs) {
		const config = this.loadConfig()
		if (!config) return null
		const nextConfig = {
			...config,
			lockTimeoutMs: normalizeTimeout(lockTimeoutMs)
		}
		this.storage?.setItem(this.storageKey, JSON.stringify(nextConfig))
		return nextConfig
	}

	async deriveVerifier(pin, salt, pbkdf2) {
		const keyMaterial = await this.cryptoRef.subtle.importKey(
			'raw',
			new TextEncoder().encode(String(pin)),
			'PBKDF2',
			false,
			['deriveBits']
		)
		const bits = await this.cryptoRef.subtle.deriveBits(
			{
				name: 'PBKDF2',
				salt,
				iterations: pbkdf2.iterations,
				hash: pbkdf2.hash
			},
			keyMaterial,
			pbkdf2.length
		)
		return new Uint8Array(bits)
	}
}

export {
	APP_LOCK_DEFAULT_ITERATIONS,
	APP_LOCK_DEFAULT_TIMEOUT_MS,
	APP_LOCK_STORAGE_KEY,
	APP_LOCK_TIMEOUT_OPTIONS,
	APP_LOCK_VERSION,
	AppLockService,
	normalizeTimeout
}
export default new AppLockService()
