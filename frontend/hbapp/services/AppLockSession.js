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
		this.shielded = false
		this.handleVisibilityChange = () => this.onVisibilityChange()
		this.handlePageHide = () => this.enterBackground()
		this.handlePageShow = () => this.resumeFromBackground()
		this.handleFocus = () => this.resumeFromBackground()
	}

	start() {
		if (this.started) return
		this.started = true
		this.locked = this.service.isEnabled()
		if (this.documentRef) {
			this.documentRef.addEventListener('visibilitychange', this.handleVisibilityChange)
		}
		if (this.windowRef) {
			this.windowRef.addEventListener('pagehide', this.handlePageHide)
			this.windowRef.addEventListener('pageshow', this.handlePageShow)
			this.windowRef.addEventListener('focus', this.handleFocus)
		}
		this.notify()
	}

	stop() {
		if (!this.started) return
		this.started = false
		if (this.documentRef) {
			this.documentRef.removeEventListener('visibilitychange', this.handleVisibilityChange)
		}
		if (this.windowRef) {
			this.windowRef.removeEventListener('pagehide', this.handlePageHide)
			this.windowRef.removeEventListener('pageshow', this.handlePageShow)
			this.windowRef.removeEventListener('focus', this.handleFocus)
		}
	}

	isLocked() {
		return this.service.isEnabled() && this.locked
	}

	isUnlocked() {
		return !this.isLocked()
	}

	isShielded() {
		return this.service.isEnabled() && this.shielded
	}

	isPrivacyCovered() {
		return this.isLocked() || this.isShielded()
	}

	lock() {
		if (!this.service.isEnabled()) {
			this.locked = false
			this.shielded = false
			this.notify()
			return false
		}
		if (this.locked && !this.shielded) return true
		this.locked = true
		this.shielded = false
		this.notify()
		return true
	}

	unlock() {
		if (!this.locked && !this.shielded) return true
		this.locked = false
		this.shielded = false
		this.hiddenAt = null
		this.notify()
		return true
	}

	refreshFromConfig() {
		const enabled = this.service.isEnabled()
		if (!enabled) {
			this.locked = false
			this.shielded = false
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
			unlocked: this.isUnlocked(),
			shielded: this.isShielded(),
			privacyCovered: this.isPrivacyCovered()
		}
	}

	notify() {
		const state = this.getState()
		this.listeners.forEach(listener => listener(state))
	}

	onVisibilityChange() {
		if (!this.documentRef || !this.service.isEnabled()) return
		if (this.documentRef.visibilityState === 'hidden') {
			this.enterBackground()
			return
		}
		if (this.documentRef.visibilityState !== 'visible') return
		this.resumeFromBackground()
	}

	enterBackground() {
		if (!this.service.isEnabled()) return
		if (this.hiddenAt === null) this.hiddenAt = this.clock()
		if (this.locked) return
		if (this.service.getLockTimeoutMs() === 0) {
			this.lock()
			return
		}
		if (this.shielded) return
		this.shielded = true
		this.notify()
	}

	resumeFromBackground() {
		if (!this.service.isEnabled()) return
		if (this.documentRef?.visibilityState === 'hidden') return
		if (this.locked || this.hiddenAt === null) return

		const hiddenFor = Math.max(0, this.clock() - this.hiddenAt)
		const timeout = this.service.getLockTimeoutMs()
		this.hiddenAt = null
		if (timeout === 0 || hiddenFor >= timeout) {
			this.lock()
			return
		}
		if (!this.shielded) return
		this.shielded = false
		this.notify()
	}
}

export {AppLockSession}
export default new AppLockSession()
