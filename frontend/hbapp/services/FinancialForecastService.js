import {normalizeBalance} from './PlanningCalculator.js'
import {getSnapshotTimestamp} from './BalanceSnapshotNormalizer.js'

const MAX_FORECAST_DAYS = 370
const RANGE_PRESETS = new Set(['current-period', 'next-7', 'next-14', 'next-30'])
const INTERNAL_TRANSFER_CATEGORY_IDS = new Set(['1', '19'])
const INTERNAL_TRANSFER_CATEGORY_CODES = new Set(['transfers', 'savings'])
const UAH_VALUES = {
	mono: new Set(['980']),
	privat: new Set(['UAH', '980'])
}

const toNumber = value => {
	const num = Number(value)
	return Number.isFinite(num) ? num : 0
}

const toMoneyCents = value => Math.round((toNumber(value) + Number.EPSILON) * 100)
const fromMoneyCents = value => Math.round(toNumber(value)) / 100

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value))

const normalizeTimestamp = value => {
	if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
		const [year, month, day] = value.slice(0, 10).split('-').map(Number)
		return new Date(year, month - 1, day, 0, 0, 0, 0).getTime()
	}
	const timestamp = Number(value)
	if (!Number.isFinite(timestamp) || timestamp <= 0) return null
	return Math.abs(timestamp) <= 9999999999 ? timestamp * 1000 : timestamp
}

const startOfLocalDay = value => {
	const timestamp = normalizeTimestamp(value)
	if (!timestamp) return null
	const date = new Date(timestamp)
	date.setHours(0, 0, 0, 0)
	return date.getTime()
}

const endOfLocalDay = value => {
	const timestamp = normalizeTimestamp(value)
	if (!timestamp) return null
	const date = new Date(timestamp)
	date.setHours(23, 59, 59, 999)
	return date.getTime()
}

const addLocalDays = (value, count) => {
	const date = new Date(value)
	date.setDate(date.getDate() + count)
	return date.getTime()
}

const getLocalDateKey = value => {
	const date = new Date(value)
	return [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, '0'),
		String(date.getDate()).padStart(2, '0')
	].join('-')
}

const countLocalDaysInclusive = (dateFrom, dateTo) => {
	let cursor = startOfLocalDay(dateFrom)
	const last = startOfLocalDay(dateTo)
	let days = 0

	while (cursor <= last) {
		days++
		if (days > MAX_FORECAST_DAYS + 1) return days
		const next = addLocalDays(cursor, 1)
		if (!Number.isFinite(next) || next <= cursor) {
			throw new Error('Forecast range date progression failed.')
		}
		cursor = next
	}

	return days
}

const normalizeStatus = status => {
	const map = {
		approve: 'completed',
		approved: 'completed',
		completed: 'completed',
		disable: 'cancelled',
		disabled: 'cancelled',
		cancelled: 'cancelled',
		pending: 'pending'
	}
	return map[status] || 'pending'
}

const getPlannedAmount = item => toMoneyCents(item?.sum ?? item?.plannedAmount ?? item?.planned_amount)

const getItemId = item => String(item?.id ?? item?.localId ?? item?.local_id ?? '')

const isInternalPlanningOperation = item => {
	const categoryId = item?.categoryId ?? item?.category_id
	if (categoryId !== null && categoryId !== undefined && INTERNAL_TRANSFER_CATEGORY_IDS.has(String(categoryId))) return true
	const code = String(item?.categoryCode ?? item?.category_code ?? item?.typeStr ?? '').trim().toLowerCase()
	return INTERNAL_TRANSFER_CATEGORY_CODES.has(code)
}

const getExplicitPlanningDate = item => {
	const explicit = item?.plannedAt ?? item?.planned_at ?? item?.scheduledAt ?? item?.scheduled_at
	const explicitStart = startOfLocalDay(explicit)
	if (explicitStart) return {date: explicitStart, reliable: true, source: 'explicit'}

	const date = startOfLocalDay(item?.date)
	if (!date) return {date: null, reliable: false, source: 'missing'}
	const dateSource = String(item?.dateSource ?? item?.date_source ?? '').trim().toLowerCase()
	if (dateSource === 'user' || dateSource === 'server') return {date, reliable: true, source: dateSource}
	if (dateSource === 'fallback') return {date, reliable: false, source: 'fallback'}
	if (item?.hasScheduledDate === true) return {date, reliable: true, source: 'flag'}
	if (['planned', 'scheduled', 'user'].includes(String(item?.dateSource || '').toLowerCase())) {
		return {date, reliable: true, source: 'dateSource'}
	}

	return {date, reliable: false, source: 'unknown'}
}

const getProviderCurrency = (provider, account = {}) => {
	if (provider === 'mono') return account.currency_code ?? account.currencyCode ?? null
	return account.currency ?? null
}

const isCompatibleCurrency = (provider, account = {}) => {
	const raw = getProviderCurrency(provider, account)
	if (raw === null || raw === undefined || raw === '') return true
	const allowed = UAH_VALUES[provider]
	if (!allowed) return false
	return allowed.has(String(raw).trim().toUpperCase())
}

const getCompatibleBalanceData = balance => {
	const excludedAccounts = []
	const data = {
		mono: [],
		privat: []
	}

	Object.keys(data).forEach(provider => {
		const accounts = Array.isArray(balance?.[provider]) ? balance[provider] : []
		accounts.forEach((account, index) => {
			if (isCompatibleCurrency(provider, account)) {
				data[provider].push(account)
				return
			}
			excludedAccounts.push({
				provider,
				index,
				currency: getProviderCurrency(provider, account),
				reason: 'incompatible_currency'
			})
		})
	})

	return {data, excludedAccounts}
}

const getBalanceFreshness = (balance, explicitUpdatedAt = null) => {
	const timestamps = []
	;['mono', 'privat'].forEach(provider => {
		;(Array.isArray(balance?.[provider]) ? balance[provider] : []).forEach(account => {
			const timestamp = getSnapshotTimestamp(provider, account)
			if (timestamp) timestamps.push(timestamp)
		})
	})
	const snapshotAt = timestamps.length ? Math.max(...timestamps) : null
	const updatedAt = normalizeTimestamp(explicitUpdatedAt) || snapshotAt || null

	return {
		snapshotAt,
		updatedAt,
		hasSnapshotTimestamp: Boolean(snapshotAt)
	}
}

const getForecastRange = ({rangePreset = 'current-period', period = null, now = new Date()} = {}) => {
	if (!RANGE_PRESETS.has(rangePreset)) {
		throw new Error(`Unsupported forecast range preset: ${rangePreset}`)
	}

	const today = startOfLocalDay(now)
	if (!today) throw new Error('Forecast now must be a valid date.')

	if (rangePreset === 'current-period') {
		const dateTo = endOfLocalDay(period?.dateTo ?? period?.to ?? period?.endDate ?? period?.end_date)
		if (!dateTo) throw new Error('Current period forecast requires a valid period end date.')
		if (dateTo < today) throw new Error('Current period end date must not be before today.')
		return validateRange({dateFrom: today, dateTo, rangePreset})
	}

	const days = Number(rangePreset.replace('next-', ''))
	return validateRange({
		dateFrom: today,
		dateTo: endOfLocalDay(addLocalDays(today, days - 1)),
		rangePreset
	})
}

const validateRange = ({dateFrom, dateTo, rangePreset = 'custom'} = {}) => {
	const from = startOfLocalDay(dateFrom)
	const to = endOfLocalDay(dateTo)
	if (!from || !to) throw new Error('Forecast range requires valid dateFrom and dateTo.')
	if (to < from) throw new Error('Forecast range dateTo must be greater than or equal to dateFrom.')
	const days = countLocalDaysInclusive(from, to)
	if (!Number.isFinite(days) || days < 1) throw new Error('Forecast range day count is invalid.')
	if (days > MAX_FORECAST_DAYS) throw new Error(`Forecast range cannot exceed ${MAX_FORECAST_DAYS} days.`)
	return {dateFrom: from, dateTo: to, days, rangePreset}
}

const getTransactionLinkState = (item, transactionLinks = {}) => {
	const id = getItemId(item)
	return transactionLinks?.[id] || transactionLinks?.[Number(id)] || null
}

const hasLegacyTransactionLink = item => Boolean(item?.transactionId ?? item?.transaction_id)

const isUnknownTransactionLinkState = linkState => {
	if (!linkState) return false
	if (linkState.linkStateKnown === false) return true
	if (linkState.loading) return true
	if (linkState.error) return true
	return false
}

const normalizeForecastEvent = ({
	item,
	amountCents,
	date,
	reason = null,
	remainingAmount = null,
	linkedAmount = 0
}) => ({
	id: `planning:${getItemId(item)}`,
	source: 'planning',
	type: 'expense',
	planningItemId: getItemId(item),
	title: item?.title || item?.desc || item?.description || 'Planning expense',
	date,
	dateKey: getLocalDateKey(date),
	amount: fromMoneyCents(amountCents),
	amountCents,
	reason,
	remainingAmount,
	linkedAmount
})

const classifyPlanningItem = ({item, range, transactionLinks}) => {
	const itemId = getItemId(item)
	const status = normalizeStatus(item?.status)
	const plannedAmountCents = getPlannedAmount(item)
	const linkState = getTransactionLinkState(item, transactionLinks)
	const linkedTransactions = Array.isArray(linkState?.linkedTransactions)
		? linkState.linkedTransactions
		: (Array.isArray(linkState?.transactions) ? linkState.transactions : [])
	const linkedAmount = toNumber(linkState?.linkedAmount)
	const hasLinkedTransaction = linkedTransactions.length > 0 || linkedAmount > 0 || hasLegacyTransactionLink(item)

	if (status === 'completed') return {action: 'exclude', reason: 'completed'}
	if (status === 'cancelled') return {action: 'exclude', reason: 'cancelled'}
	if (status !== 'pending') return {action: 'ambiguous', reason: 'unsupported_status'}
	if (isInternalPlanningOperation(item)) return {action: 'exclude', reason: 'internal_transfer_or_savings'}
	if (plannedAmountCents <= 0) return {action: 'ambiguous', reason: 'missing_or_zero_amount'}
	if (isUnknownTransactionLinkState(linkState)) {
		return {action: 'ambiguous', reason: 'transaction_link_state_unavailable'}
	}

	let amountCents = plannedAmountCents
	let remainingAmount = null

	if (hasLinkedTransaction) {
		if (Number.isFinite(Number(linkState?.remainingAmount))) {
			remainingAmount = Math.max(0, toNumber(linkState.remainingAmount))
			amountCents = toMoneyCents(remainingAmount)
			if (amountCents <= 0) return {action: 'exclude', reason: 'linked_transaction_accounted'}
		} else {
			return {action: 'ambiguous', reason: 'linked_transaction_without_reliable_remaining_amount'}
		}
	}

	const planningDate = getExplicitPlanningDate(item)
	if (!planningDate.date || !planningDate.reliable) {
		return {
			action: 'ambiguous',
			reason: planningDate.source === 'fallback' ? 'generated_fallback_date' : 'missing_or_unreliable_date',
			date: planningDate.date
		}
	}

	if (planningDate.date < range.dateFrom) {
		return {action: 'ambiguous', reason: 'overdue_pending', date: planningDate.date}
	}
	if (planningDate.date > range.dateTo) {
		return {action: 'exclude', reason: 'outside_forecast_range', date: planningDate.date}
	}

	return {
		action: 'include',
		event: normalizeForecastEvent({
			item,
			amountCents,
			date: planningDate.date,
			remainingAmount,
			linkedAmount,
			reason: hasLinkedTransaction ? 'partial_remaining_amount' : null
		})
	}
}

const normalizePlanningEvents = ({planningItems = [], range, transactionLinks = {}} = {}) => {
	const events = []
	const excluded = []
	const ambiguous = []

	;(Array.isArray(planningItems) ? planningItems : []).forEach(item => {
		const result = classifyPlanningItem({item, range, transactionLinks})
		const record = {
			source: 'planning',
			planningItemId: getItemId(item),
			title: item?.title || item?.desc || item?.description || 'Planning expense',
			status: normalizeStatus(item?.status),
			amount: fromMoneyCents(getPlannedAmount(item)),
			date: result.date || null,
			dateKey: result.date ? getLocalDateKey(result.date) : null,
			reason: result.reason
		}
		if (result.action === 'include') events.push(result.event)
		else if (result.action === 'ambiguous') ambiguous.push(record)
		else excluded.push(record)
	})

	events.sort((left, right) => left.date - right.date || left.id.localeCompare(right.id))
	return {events, excluded, ambiguous}
}

const buildDailyTimeline = ({range, startingBalanceCents, events}) => {
	const eventsByDate = new Map()
	events.forEach(event => {
		const list = eventsByDate.get(event.dateKey) || []
		list.push(event)
		eventsByDate.set(event.dateKey, list)
	})

	const daily = []
	let cursor = range.dateFrom
	let balanceCents = startingBalanceCents
	let minimumBalanceCents = startingBalanceCents
	let minimumBalanceDate = range.dateFrom

	for (let index = 0; index < range.days; index++) {
		const dateKey = getLocalDateKey(cursor)
		const dayEvents = eventsByDate.get(dateKey) || []
		const openingBalanceCents = balanceCents
		const expenseCents = dayEvents.reduce((sum, event) => sum + event.amountCents, 0)
		balanceCents -= expenseCents

		if (balanceCents < minimumBalanceCents) {
			minimumBalanceCents = balanceCents
			minimumBalanceDate = cursor
		}

		daily.push({
			date: cursor,
			dateKey,
			openingBalance: fromMoneyCents(openingBalanceCents),
			income: 0,
			expenses: fromMoneyCents(expenseCents),
			closingBalance: fromMoneyCents(balanceCents),
			events: dayEvents.map(event => clone(event))
		})

		const next = addLocalDays(cursor, 1)
		if (!Number.isFinite(next) || next <= cursor) {
			throw new Error('Forecast daily timeline progression failed.')
		}
		cursor = next
	}

	return {
		daily,
		endingBalanceCents: balanceCents,
		minimumBalanceCents,
		minimumBalanceDate
	}
}

const buildWarnings = daily => daily
	.filter(day => toMoneyCents(day.closingBalance) < 0)
	.map(day => ({
		type: 'negative_balance',
		date: day.date,
		dateKey: day.dateKey,
		balance: day.closingBalance
	}))

const buildFinancialForecast = ({
	balance = null,
	balanceUpdatedAt = null,
	planningItems = [],
	period = null,
	transactionLinks = {},
	range = null,
	rangePreset = 'current-period',
	now = new Date()
} = {}) => {
	const resolvedRange = range
		? validateRange({...range, rangePreset: range.rangePreset || 'custom'})
		: getForecastRange({rangePreset, period, now})
	const {data: compatibleBalance, excludedAccounts} = getCompatibleBalanceData(balance)
	const normalizedBalance = normalizeBalance(compatibleBalance)
	const startingBalanceCents = toMoneyCents(normalizedBalance.current)
	const freshness = getBalanceFreshness(compatibleBalance, balanceUpdatedAt)
	const normalizedEvents = normalizePlanningEvents({planningItems, range: resolvedRange, transactionLinks})
	const timeline = buildDailyTimeline({
		range: resolvedRange,
		startingBalanceCents,
		events: normalizedEvents.events
	})
	const scheduledExpenseCents = normalizedEvents.events.reduce((sum, event) => sum + event.amountCents, 0)

	return {
		range: resolvedRange,
		startingBalance: fromMoneyCents(startingBalanceCents),
		startingBalanceSource: 'bank_snapshot',
		balance: {
			...normalizedBalance,
			freshness,
			excludedAccounts
		},
		scheduledExpenses: fromMoneyCents(scheduledExpenseCents),
		projectedEndingBalance: fromMoneyCents(timeline.endingBalanceCents),
		minimumProjectedBalance: fromMoneyCents(timeline.minimumBalanceCents),
		minimumProjectedBalanceDate: timeline.minimumBalanceDate,
		events: normalizedEvents.events.map(event => clone(event)),
		daily: timeline.daily,
		warnings: buildWarnings(timeline.daily),
		excluded: normalizedEvents.excluded,
		ambiguous: normalizedEvents.ambiguous,
		unsupported: {
			futureIncomeIncluded: false,
			historicalTransactionsReplayed: false,
			purchasesIncludedAsEvents: false,
			receiptsIncludedAsEvents: false
		}
	}
}

export {
	MAX_FORECAST_DAYS,
	buildFinancialForecast,
	getForecastRange,
	normalizePlanningEvents,
	validateRange
}
