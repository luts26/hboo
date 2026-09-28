const PROVIDER_CONFIG = {
	mono: {
		amountScale: 100,
		dateScale: 1000,
		currencyField: 'currency_code',
		uahValues: ['980']
	},
	privat: {
		amountScale: 1,
		dateScale: 1,
		currencyField: 'currency',
		uahValues: ['UAH', '980']
	}
}

const toNumber = value => {
	const number = Number(value)
	return Number.isFinite(number) ? number : 0
}

const getPositionState = position => {
	if (position > 0) return 'own'
	if (position < 0) return 'credit'
	return 'zero'
}

const getProviderAccountId = (provider, account = {}) => {
	if (provider === 'mono') return String(account.c_id || account.iban || account.send_id || account.id || 'default')
	return String(account.account || account.card_number || account.id || 'default')
}

const getAccountId = (provider, account = {}, userKey = 'anonymous') => {
	return `${userKey}:${getProviderAccountId(provider, account)}`
}

const getSnapshotTimestamp = (provider, account = {}) => {
	const config = PROVIDER_CONFIG[provider]
	const date = toNumber(account.date)
	if (!config || !date) return null
	return date * config.dateScale
}

const getSnapshotId = ({provider, accountId, timestamp, sourceId}) => {
	return `${provider}:${accountId}:${timestamp}:${sourceId || 'unknown'}`
}

const isUahRecord = (provider, account = {}) => {
	const config = PROVIDER_CONFIG[provider]
	if (!config) return false
	const raw = account[config.currencyField]
	if (raw === undefined || raw === null || raw === '') return true
	return config.uahValues.includes(String(raw).trim().toUpperCase())
}

const normalizeBalanceSnapshot = (provider, account = {}, {userKey = 'anonymous', inRange = true, fetchedAt = Date.now()} = {}) => {
	const config = PROVIDER_CONFIG[provider]
	if (!config || !isUahRecord(provider, account)) return null

	const timestamp = getSnapshotTimestamp(provider, account)
	if (!timestamp) return null

	const current = toNumber(account.balance) / config.amountScale
	const creditLimit = toNumber(account.credit_limit) / config.amountScale
	const position = current - creditLimit
	const providerAccountId = getProviderAccountId(provider, account)
	const accountId = getAccountId(provider, account, userKey)
	const sourceId = account.id === undefined || account.id === null ? null : String(account.id)

	return {
		id: getSnapshotId({provider, accountId, timestamp, sourceId}),
		provider,
		accountId,
		userId: userKey,
		providerAccountId,
		currency: 'UAH',
		timestamp,
		current,
		creditLimit,
		position,
		state: getPositionState(position),
		observed: true,
		inRange,
		sourceId,
		fetchedAt,
		raw: JSON.parse(JSON.stringify(account))
	}
}

const normalizeApiBalanceSnapshot = (snapshot = {}, {userKey = 'anonymous', fetchedAt = Date.now()} = {}) => {
	const provider = String(snapshot.provider || '').toLowerCase()
	const timestamp = toNumber(snapshot.timestamp)
	if (!PROVIDER_CONFIG[provider] || !timestamp) return null
	const current = toNumber(snapshot.current)
	const creditLimit = toNumber(snapshot.creditLimit)
	const position = snapshot.position === undefined || snapshot.position === null
		? current - creditLimit
		: toNumber(snapshot.position)
	const providerAccountId = String(snapshot.accountId || snapshot.providerAccountId || 'default')
	const accountId = `${userKey}:${providerAccountId}`
	const sourceId = snapshot.sourceId === undefined || snapshot.sourceId === null ? null : String(snapshot.sourceId)
	const sourceSnapshotId = String(snapshot.id || getSnapshotId({provider, accountId, timestamp, sourceId}))

	return {
		id: `${userKey}:${sourceSnapshotId}`,
		sourceSnapshotId,
		provider,
		accountId,
		userId: userKey,
		providerAccountId,
		currency: 'UAH',
		timestamp,
		current,
		creditLimit,
		position,
		state: getPositionState(position),
		observed: snapshot.observed !== false,
		inRange: snapshot.inRange !== false,
		sourceId,
		fetchedAt
	}
}

export {
	PROVIDER_CONFIG,
	getAccountId,
	getPositionState,
	getProviderAccountId,
	getSnapshotTimestamp,
	normalizeApiBalanceSnapshot,
	normalizeBalanceSnapshot,
	toNumber
}
