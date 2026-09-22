class NetworkStatusService {

	constructor({windowRef = typeof window !== 'undefined' ? window : null, navigatorRef = typeof navigator !== 'undefined' ? navigator : null} = {}) {
		this.windowRef = windowRef
		this.navigatorRef = navigatorRef
		this.listeners = new Set()
		this.state = this.readState()
		this.isListening = false
		this.handleOnline = () => this.updateFromNavigator()
		this.handleOffline = () => this.updateFromNavigator()
		this.registerListeners()
	}

	readState() {
		if (!this.navigatorRef || typeof this.navigatorRef.onLine === 'undefined') {
			return {network: 'online', online: true}
		}

		const online = this.navigatorRef.onLine !== false
		return {
			network: online ? 'online' : 'offline',
			online
		}
	}

	registerListeners() {
		if (!this.windowRef || this.isListening) return
		this.windowRef.addEventListener('online', this.handleOnline)
		this.windowRef.addEventListener('offline', this.handleOffline)
		this.isListening = true
	}

	updateFromNavigator() {
		const nextState = this.readState()
		if (nextState.network === this.state.network) return
		this.state = nextState
		this.notify()
	}

	getState() {
		return {...this.state}
	}

	isOffline() {
		this.updateFromNavigator()
		return this.getState().network === 'offline'
	}

	subscribe(listener) {
		if (typeof listener !== 'function') return () => {}
		this.listeners.add(listener)
		listener(this.getState())
		return () => this.listeners.delete(listener)
	}

	notify() {
		const state = this.getState()
		this.listeners.forEach(listener => listener(state))
	}
}

export {NetworkStatusService}
export default new NetworkStatusService()
