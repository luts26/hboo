const AUTH_STORAGE_KEY = 'hboo-auth-v1'
const TOKEN_STORAGE_KEY = 'skfhb'

const readJson = (storageKey, fallback = null) => {
	try {
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

	if (!token) return null

	return {
		token,
		user: userId
			? {
				id: Number(userId),
				username: username || ''
			}
			: null
	}
}

const getAuthState = () => normalizeAuthState(readJson(AUTH_STORAGE_KEY, null))

const setAuthState = data => {
	const authState = normalizeAuthState(data)
	if (!authState) return null

	localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authState))
	localStorage.setItem(TOKEN_STORAGE_KEY, authState.token)

	return authState
}

const clearAuthState = () => {
	localStorage.removeItem(AUTH_STORAGE_KEY)
	localStorage.removeItem(TOKEN_STORAGE_KEY)
}

const getAuthToken = () => getAuthState()?.token || localStorage.getItem(TOKEN_STORAGE_KEY)

const getAuthenticatedUserId = () => getAuthState()?.user?.id || null

export {
	AUTH_STORAGE_KEY,
	TOKEN_STORAGE_KEY,
	clearAuthState,
	getAuthenticatedUserId,
	getAuthState,
	getAuthToken,
	setAuthState
}
