import appLockService from './AppLockService.js'

class AppLockSession {

	constructor({
		service = appLockService,
		documentRef = typeof document !== 'undefined' ? document : null,
		windowRef = typeof window !== 'undefined' ? window : null,
		clock = () => Date.now()
	} = {}) {
		this.service = service
		this.documentRef = documentRef
		this.windowRef = windowRef
		this.clock = clock
		this.listeners = new Set()
		this.hiddenAt = null
		this.started = false
		this.locked = this.service.isEnabled()
		this.handleVisibilityChange = () => this.onVisibilityChange()
	}

	start() {
		if (this.started) return
		this.started = true
		this.locked = this.service.isEnabled()
		if (this.documentRef) {
			this.documentRef.addEventListener('visibilitychange', this.handleVisibilityChange)
		}
		this.notify()
	}

	stop() {
		if (!this.started) return
		this.started = false
		if (this.documentRef) {
			this.documentRef.removeEventListener('visibilitychange', this.handleVisibilityChange)
		}
	}

	isLocked() {
		return this.service.isEnabled() && this.locked
	}

	isUnlocked() {
		return !this.isLocked()
	}

	lock() {
		if (!this.service.isEnabled()) {
			this.locked = false
			this.notify()
			return false
		}
		if (this.locked) return true
		this.locked = true
		this.notify()
		return true
	}

	unlock() {
		if (!this.locked) return true
		this.locked = false
		this.hiddenAt = null
		this.notify()
		return true
	}

	refreshFromConfig() {
		const enabled = this.service.isEnabled()
		if (!enabled) {
			this.locked = false
			this.hiddenAt = null
			this.notify()
			return
		}
		this.notify()
	}

	subscribe(listener) {
		if (typeof listener !== 'function') return () => {}
		this.listeners.add(listener)
		listener(this.getState())
		return () => this.listeners.delete(listener)
	}

	getState() {
		return {
			enabled: this.service.isEnabled(),
			locked: this.isLocked(),
			unlocked: this.isUnlocked()
		}
	}

	notify() {
		const state = this.getState()
		this.listeners.forEach(listener => listener(state))
	}

	onVisibilityChange() {
		if (!this.documentRef || !this.service.isEnabled()) return
		if (this.documentRef.visibilityState === 'hidden') {
			this.hiddenAt = this.clock()
			return
		}
		if (this.documentRef.visibilityState !== 'visible') return
		if (this.locked || this.hiddenAt === null) return

		const hiddenFor = Math.max(0, this.clock() - this.hiddenAt)
		const timeout = this.service.getLockTimeoutMs()
		this.hiddenAt = null
		if (timeout === 0 || hiddenFor >= timeout) this.lock()
	}
}

export {AppLockSession}
export default new AppLockSession()
