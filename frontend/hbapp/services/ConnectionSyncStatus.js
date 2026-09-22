import planningStore from '../stores/PlanningStore.js'
import {API_AUTH_STATUS, getAuthState, subscribeAuthState} from './AuthSession.js'
import networkStatusService from './NetworkStatusService.js'

const AUTH_PAUSED_STATUSES = new Set(['paused', 'auth-paused'])
const ERROR_STATUSES = new Set(['error'])
const PENDING_STATUSES = new Set(['pending', 'offline'])

const getPendingCount = (planningState = {}) => {
	if (Number.isFinite(Number(planningState.pendingCount))) return Math.max(0, Number(planningState.pendingCount))
	if (planningState.dirty) return 1
	if (PENDING_STATUSES.has(planningState.syncStatus)) return 1
	return 0
}

const formatPending = count => {
	if (!count) return null
	return count === 1 ? '1 change pending' : `${count} changes pending`
}

const deriveConnectionSyncState = ({
	networkState = {},
	authState = {},
	planningState = {}
} = {}) => {
	const network = networkState.network || (networkState.online === false ? 'offline' : 'online')
	const syncStatus = planningState.syncStatus || 'idle'
	const pendingCount = getPendingCount(planningState)
	const apiAuthStatus = authState.apiAuthStatus || authState.apiStatus || API_AUTH_STATUS.UNKNOWN
	const hasAuth = Boolean(authState.authenticated || (authState.token && authState.userId))
	const isAuthRejected = apiAuthStatus === API_AUTH_STATUS.REJECTED
	const api = AUTH_PAUSED_STATUSES.has(syncStatus) || isAuthRejected || !hasAuth ? 'auth_required' : 'authenticated'
	let sync = syncStatus
	let presentation = 'synced'
	let title = 'Synced'
	let detail = 'All changes synced'
	let tone = 'synced'

	if (syncStatus === 'conflict') {
		presentation = 'conflict'
		title = 'Sync conflict'
		detail = 'Review required'
		tone = 'attention'
		sync = 'conflict'
	} else if (api === 'auth_required') {
		presentation = 'auth-required'
		title = 'Sign in to sync'
		detail = 'Local mode'
		tone = 'attention'
		sync = AUTH_PAUSED_STATUSES.has(syncStatus) ? 'auth-paused' : syncStatus
	} else if (ERROR_STATUSES.has(syncStatus)) {
		presentation = 'error'
		title = 'Sync error'
		detail = 'Changes kept locally'
		tone = 'attention'
		sync = 'error'
	} else if (network === 'offline') {
		presentation = 'offline'
		title = 'Offline'
		detail = formatPending(pendingCount) || 'Local data available'
		tone = 'offline'
		sync = pendingCount ? 'pending' : 'synced'
	} else if (syncStatus === 'syncing') {
		presentation = 'syncing'
		title = 'Syncing...'
		detail = formatPending(pendingCount) || 'Sync in progress'
		tone = 'syncing'
		sync = 'syncing'
	} else if (pendingCount > 0 || syncStatus === 'pending') {
		presentation = 'pending'
		title = 'Pending sync'
		detail = formatPending(pendingCount) || 'Changes pending'
		tone = 'pending'
		sync = 'pending'
	} else {
		sync = 'synced'
	}

	return {
		network,
		api,
		apiAuthStatus,
		sync,
		pendingCount,
		presentation,
		tone,
		title,
		detail
	}
}

class ConnectionSyncStatus {

	constructor({planning = planningStore, networkService = networkStatusService} = {}) {
		this.planningStore = planning
		this.networkService = networkService
		this.listeners = new Set()
		this.state = this.derive()
		this.unsubscribePlanning = this.planningStore.subscribe(() => this.refresh())
		this.unsubscribeNetwork = this.networkService.subscribe(() => this.refresh())
		this.unsubscribeAuth = subscribeAuthState(() => this.refresh())
	}

	getAuthSnapshot() {
		const authState = getAuthState()
		return {
			token: authState?.token || null,
			userId: authState?.user?.id || null,
			apiAuthStatus: authState?.apiAuthStatus || API_AUTH_STATUS.UNKNOWN
		}
	}

	derive() {
		return deriveConnectionSyncState({
			networkState: this.networkService.getState(),
			authState: this.getAuthSnapshot(),
			planningState: this.planningStore.getState()
		})
	}

	refresh() {
		const nextState = this.derive()
		if (JSON.stringify(nextState) === JSON.stringify(this.state)) return
		this.state = nextState
		this.notify()
	}

	getState() {
		return {...this.state}
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

export {ConnectionSyncStatus, deriveConnectionSyncState}
export default new ConnectionSyncStatus()
