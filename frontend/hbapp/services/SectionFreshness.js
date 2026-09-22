const normalizeRoute = route => String(route || '').replace(/^\//, '').split(/[?#]/)[0] || 'home'

const getTimestamp = value => {
	const timestamp = Number(value)
	return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null
}

const isSameDay = (left, right) => {
	return left.getFullYear() === right.getFullYear()
		&& left.getMonth() === right.getMonth()
		&& left.getDate() === right.getDate()
}

const formatClock = date => {
	return new Intl.DateTimeFormat('en-US', {
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	}).format(date)
}

const formatFreshnessTime = (timestamp, now = Date.now()) => {
	const value = getTimestamp(timestamp)
	if (!value) return null

	const date = new Date(value)
	const current = new Date(Number(now) || Date.now())
	if (Number.isNaN(date.getTime()) || Number.isNaN(current.getTime())) return null

	const diffMs = Math.max(0, current.getTime() - date.getTime())
	const diffMinutes = Math.floor(diffMs / 60000)
	if (diffMinutes < 1) return 'just now'
	if (diffMinutes < 60) return `${diffMinutes} min ago`

	const diffHours = Math.floor(diffMinutes / 60)
	if (diffHours < 24) return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`

	if (isSameDay(date, current)) return `today, ${formatClock(date)}`

	const yesterday = new Date(current)
	yesterday.setDate(current.getDate() - 1)
	if (isSameDay(date, yesterday)) return `yesterday, ${formatClock(date)}`

	return new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	}).format(date)
}

const getSectionTimestamp = (route, states = {}) => {
	if (route === 'balance') return getTimestamp(states.balanceState?.updatedAt)
	if (route === 'transaction') return getTimestamp(states.transactionState?.updatedAt)
	if (route === 'planing') return getTimestamp(states.planningState?.lastSuccessfulSyncAt)
	return null
}

const getSectionLabel = route => {
	if (route === 'balance') return 'Balance updated'
	if (route === 'transaction') return 'Transactions updated'
	if (route === 'planing') return 'Planning synced'
	return null
}

const deriveSectionFreshness = ({route, balanceState = {}, transactionState = {}, planningState = {}, now = Date.now()} = {}) => {
	const currentRoute = normalizeRoute(route)
	const label = getSectionLabel(currentRoute)
	if (!label) return null

	const timestamp = getSectionTimestamp(currentRoute, {balanceState, transactionState, planningState})
	const formatted = formatFreshnessTime(timestamp, now)
	if (!formatted) return null

	return {
		route: currentRoute,
		label,
		timestamp,
		text: `${label} ${formatted}`
	}
}

export {
	deriveSectionFreshness,
	formatFreshnessTime,
	normalizeRoute
}
