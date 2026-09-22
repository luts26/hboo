const AUTH_STORAGE_KEY = 'hboo-auth-v1'
const TOKEN_STORAGE_KEY = 'skfhb'
const API_AUTH_STATUS = {
	AUTHENTICATED: 'authenticated',
	UNKNOWN: 'unknown',
	REJECTED: 'rejected'
}
const listeners = new Set()

const getBearerToken = authorization => {
	const value = String(authorization || '').trim()
	const match = value.match(/^Bearer\s+(.+)$/i)
	return match ? match[1] : null
}

const readJson = (storageKey, fallback = null) => {
	try {
		if (typeof localStorage === 'undefined') return fallback
		const rawData = localStorage.getItem(storageKey)
		return rawData ? JSON.parse(rawData) : fallback
	} catch {
		return fallback
	}
}

const normalizeAuthState = data => {
	const token = data?.token || null
	const userData = data?.user || data || null
	const userId = userData?.id ?? userData?.userId ?? userData?.user_id
	const username = userData?.username ?? data?.username ?? null
	const apiAuthStatus = Object.values(API_AUTH_STATUS).includes(data?.apiAuthStatus)
		? data.apiAuthStatus
		: API_AUTH_STATUS.UNKNOWN

	if (!token) return null

	return {
		token,
		apiAuthStatus,
		apiAuthRejectedAt: data?.apiAuthRejectedAt || null,
		apiAuthRejectedStatus: data?.apiAuthRejectedStatus || null,
		apiAuthRejectedToken: data?.apiAuthRejectedToken || null,
		user: userId
			? {
				id: Number(userId),
				username: username || ''
			}
			: null
	}
}

const getAuthState = () => normalizeAuthState(readJson(AUTH_STORAGE_KEY, null))

const writeAuthState = authState => {
	if (typeof localStorage === 'undefined') return authState
	localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authState))
	localStorage.setItem(TOKEN_STORAGE_KEY, authState.token)
	return authState
}

const notifyAuthState = () => {
	const state = getAuthState()
	listeners.forEach(listener => listener(state))
}

const subscribeAuthState = listener => {
	if (typeof listener !== 'function') return () => {}
	listeners.add(listener)
	listener(getAuthState())
	return () => listeners.delete(listener)
}

const setAuthState = data => {
	const authState = normalizeAuthState({
		...data,
		apiAuthStatus: API_AUTH_STATUS.AUTHENTICATED,
		apiAuthRejectedAt: null,
		apiAuthRejectedStatus: null,
		apiAuthRejectedToken: null
	})
	if (!authState) return null
	if (typeof localStorage === 'undefined') return authState

	writeAuthState(authState)
	notifyAuthState()

	return authState
}

const clearAuthState = () => {
	if (typeof localStorage === 'undefined') return
	localStorage.removeItem(AUTH_STORAGE_KEY)
	localStorage.removeItem(TOKEN_STORAGE_KEY)
	notifyAuthState()
}

const getAuthToken = () => getAuthState()?.token || (typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_STORAGE_KEY) : null)

const getAuthenticatedUserId = () => getAuthState()?.user?.id || null

const getApiAuthStatus = () => getAuthState()?.apiAuthStatus || API_AUTH_STATUS.UNKNOWN

const markApiAuthRejected = (status, {credentialToken = null} = {}) => {
	const authState = getAuthState()
	if (!authState) return null
	const nextState = {
		...authState,
		apiAuthStatus: API_AUTH_STATUS.REJECTED,
		apiAuthRejectedAt: Date.now(),
		apiAuthRejectedStatus: Number(status) || null,
		apiAuthRejectedToken: credentialToken || authState.token || null
	}
	writeAuthState(nextState)
	notifyAuthState()
	return nextState
}

const markApiAuthAuthenticated = ({credentialToken = null} = {}) => {
	const authState = getAuthState()
	if (!authState) return null
	if (credentialToken && credentialToken !== authState.token) return authState
	if (
		authState.apiAuthStatus === API_AUTH_STATUS.REJECTED
		&& (!credentialToken || credentialToken === authState.apiAuthRejectedToken || credentialToken === authState.token)
	) {
		return authState
	}
	if (authState.apiAuthStatus === API_AUTH_STATUS.AUTHENTICATED) return authState
	const nextState = {
		...authState,
		apiAuthStatus: API_AUTH_STATUS.AUTHENTICATED,
		apiAuthRejectedAt: null,
		apiAuthRejectedStatus: null,
		apiAuthRejectedToken: null
	}
	writeAuthState(nextState)
	notifyAuthState()
	return nextState
}

const observeAuthenticatedResponse = (response, {hadAuth = false, authorization = null, credentialToken = null} = {}) => {
	if (!hadAuth || !response) return getAuthState()
	const token = credentialToken || getBearerToken(authorization)
	const status = Number(response.status)
	if (status === 401 || status === 403) return markApiAuthRejected(status, {credentialToken: token})
	if (status >= 200 && status < 300) return markApiAuthAuthenticated({credentialToken: token})
	return getAuthState()
}

export {
	API_AUTH_STATUS,
	AUTH_STORAGE_KEY,
	TOKEN_STORAGE_KEY,
	clearAuthState,
	getApiAuthStatus,
	getAuthenticatedUserId,
	getAuthState,
	getAuthToken,
	markApiAuthAuthenticated,
	markApiAuthRejected,
	observeAuthenticatedResponse,
	subscribeAuthState,
	setAuthState
}
