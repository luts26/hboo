const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_NAMES_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const UNCATEGORIZED_CATEGORY_ID = 'uncategorized'
const COVERAGE_COMPLETE = 'complete'
const COVERAGE_PARTIAL = 'partial'
const COVERAGE_MISSING = 'missing'
const INTERNAL_TRANSFER_CATEGORY_CODES = new Set(['transfers', 'savings'])
const INTERNAL_TRANSFER_CATEGORY_IDS = new Set(['1', '19'])
const INTERNAL_TRANSFER_EXTERNAL_CODES = new Set(['8', '4829', '100000000000896', '1000000000054736'])
const UNIX_SECONDS_MAX = 9999999999
const MAX_TREND_BUCKETS = 1200

const toNumber = value => {
	const num = Number(value)
	return Number.isFinite(num) ? num : 0
}

const toMoneyCents = value => Math.round((toNumber(value) + Number.EPSILON) * 100)
const fromMoneyCents = value => Math.round(toNumber(value)) / 100
const roundMoney = value => fromMoneyCents(toMoneyCents(value))

const getNowTime = now => {
	const date = now instanceof Date ? now : new Date(now)
	return Number.isNaN(date.getTime()) ? Date.now() : date.getTime()
}

const parseLocalDateValue = value => {
	if (typeof value === 'string') {
		const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
		if (match) {
			return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0).getTime()
		}
	}
	const number = Number(value)
	return Number.isFinite(number) ? number : 0
}

const startOfLocalDay = value => {
	const date = new Date(value)
	date.setHours(0, 0, 0, 0)
	return date.getTime()
}

const endOfLocalDay = value => {
	const date = new Date(value)
	date.setHours(23, 59, 59, 999)
	return date.getTime()
}

const startOfLocalMonth = value => {
	const date = new Date(value)
	return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0).getTime()
}

const endOfLocalMonth = value => {
	const date = new Date(value)
	return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999).getTime()
}

const isSameLocalDay = (left, right) => {
	const leftDate = new Date(left)
	const rightDate = new Date(right)
	return leftDate.getFullYear() === rightDate.getFullYear()
		&& leftDate.getMonth() === rightDate.getMonth()
		&& leftDate.getDate() === rightDate.getDate()
}

const getLocalDayCount = range => {
	const from = startOfLocalDay(normalizeAnalyticsTimestamp(range?.dateFrom, 'dateFrom'))
	const to = startOfLocalDay(normalizeAnalyticsTimestamp(range?.dateTo, 'dateTo'))
	if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) return 0
	return Math.floor((to - from) / (24 * 60 * 60 * 1000)) + 1
}

const normalizeAnalyticsTimestamp = (value, fieldName = 'timestamp') => {
	const timestamp = Number(value)
	if (!Number.isFinite(timestamp)) {
		throw new Error(`Statistics range ${fieldName} must be a finite timestamp.`)
	}
	if (timestamp <= 0) {
		throw new Error(`Statistics range ${fieldName} must be a positive timestamp.`)
	}
	return Math.abs(timestamp) <= UNIX_SECONDS_MAX ? timestamp * 1000 : timestamp
}

const normalizeAnalyticsRange = (range = {}) => {
	const dateFrom = normalizeAnalyticsTimestamp(range.dateFrom, 'dateFrom')
	const dateTo = normalizeAnalyticsTimestamp(range.dateTo, 'dateTo')
	if (dateTo < dateFrom) {
		throw new Error('Statistics range dateTo must be greater than or equal to dateFrom.')
	}
	return {dateFrom, dateTo}
}

const addLocalMonths = (value, count) => {
	const date = new Date(value)
	return new Date(date.getFullYear(), date.getMonth() + count, 1, 0, 0, 0, 0).getTime()
}

const addLocalMonthsClamped = (value, count, endOfDayValue = false) => {
	const date = new Date(value)
	const targetYear = date.getFullYear()
	const targetMonth = date.getMonth() + count
	const targetLastDay = new Date(targetYear, targetMonth + 1, 0).getDate()
	const day = Math.min(date.getDate(), targetLastDay)
	const result = new Date(
		targetYear,
		targetMonth,
		day,
		date.getHours(),
		date.getMinutes(),
		date.getSeconds(),
		date.getMilliseconds()
	)
	if (endOfDayValue) result.setHours(23, 59, 59, 999)
	return result.getTime()
}

const getMonthKey = value => {
	const date = new Date(value)
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

const getMonthLabel = monthKey => {
	const [year, month] = String(monthKey).split('-').map(Number)
	if (!year || !month) return monthKey
	return `${MONTH_NAMES[month - 1]} ${String(year).slice(-2)}`
}

const getMonthLongLabel = monthKey => {
	const [year, month] = String(monthKey).split('-').map(Number)
	if (!year || !month) return monthKey
	return `${MONTH_NAMES_FULL[month - 1]} ${year}`
}

const getTransactionTimestamp = (transaction = {}) => {
	const timestamp = toNumber(transaction.timestamp)
	if (timestamp > 0) return timestamp
	const time = toNumber(transaction.time)
	if (time > 0) return time * 1000
	return toNumber(transaction.date)
}

const normalizeTransactionList = transactions => {
	const mono = Array.isArray(transactions?.mono) ? transactions.mono : []
	const privat = Array.isArray(transactions?.privat) ? transactions.privat : []
	return [
		...mono.map(item => ({...item, provider: item.provider || 'mono'})),
		...privat.map(item => ({...item, provider: item.provider || 'privat'}))
	].map(item => ({
		...item,
		timestamp: getTransactionTimestamp(item),
		amount: toNumber(item.amount)
	})).filter(item => item.timestamp > 0)
}

const getTransactionKey = transaction => {
	const provider = transaction?.provider || 'unknown'
	const id = transaction?.providerTransactionId ?? transaction?.provider_transaction_id ?? transaction?.t_id ?? transaction?.id
	return `${provider}:${id || `${transaction?.timestamp}:${transaction?.amount}:${transaction?.description || ''}`}`
}

const getUniqueTransactions = transactions => {
	const seen = new Set()
	return normalizeTransactionList(transactions).filter(transaction => {
		const key = getTransactionKey(transaction)
		if (seen.has(key)) return false
		seen.add(key)
		return true
	})
}

const getRecentMonthRange = (monthCount = 6, now = new Date()) => {
	const count = Math.max(1, Number(monthCount) || 6)
	const currentMonthStart = startOfLocalMonth(now)
	return {
		dateFrom: addLocalMonths(currentMonthStart, -(count - 1)),
		dateTo: Math.min(getNowTime(now), endOfLocalMonth(now))
	}
}

const getCurrentMonthRange = (now = new Date()) => ({
	dateFrom: startOfLocalMonth(now),
	dateTo: Math.min(getNowTime(now), endOfLocalMonth(now))
})

const getFullCurrentMonthRange = (now = new Date()) => ({
	dateFrom: startOfLocalMonth(now),
	dateTo: endOfLocalMonth(now)
})

const getPreviousMonthRange = (now = new Date()) => {
	const currentMonthStart = startOfLocalMonth(now)
	const previousMonthStart = addLocalMonths(currentMonthStart, -1)
	return {
		dateFrom: previousMonthStart,
		dateTo: endOfLocalMonth(previousMonthStart)
	}
}

const normalizeDateRange = ({dateFrom, dateTo} = {}, now = new Date()) => {
	const fallback = getCurrentMonthRange(now)
	const from = parseLocalDateValue(dateFrom)
	const to = parseLocalDateValue(dateTo)
	if (!from || !to || from > to) return fallback
	return {
		dateFrom: startOfLocalDay(from),
		dateTo: endOfLocalDay(to)
	}
}

const getPeriodPresetRange = (preset = 'current-month', now = new Date()) => {
	if (preset === 'previous-month') return getPreviousMonthRange(now)
	if (preset === 'current-month') return getCurrentMonthRange(now)
	return getCurrentMonthRange(now)
}

const getPreviousEquivalentRange = (range, now = new Date()) => {
	const nowTime = getNowTime(now)
	const current = {
		dateFrom: startOfLocalDay(range?.dateFrom),
		dateTo: toNumber(range?.dateTo)
	}
	if (!current.dateFrom || !current.dateTo || current.dateFrom > current.dateTo) {
		return getPreviousMonthRange(now)
	}

	const fullCurrentMonth = getFullCurrentMonthRange(now)
	const selectedStartsThisMonth = current.dateFrom === fullCurrentMonth.dateFrom
		&& current.dateTo <= fullCurrentMonth.dateTo
	const selectedCurrentMonthInProgress = selectedStartsThisMonth
		&& current.dateTo >= nowTime
		&& nowTime < fullCurrentMonth.dateTo
	const selectedCurrentMonthIncomplete = selectedStartsThisMonth
		&& current.dateTo < fullCurrentMonth.dateTo

	if (selectedCurrentMonthInProgress || selectedCurrentMonthIncomplete) {
		const elapsedDateTo = selectedCurrentMonthInProgress ? nowTime : current.dateTo
		return {
			dateFrom: addLocalMonths(current.dateFrom, -1),
			dateTo: Math.min(
				addLocalMonthsClamped(elapsedDateTo, -1),
				endOfLocalMonth(addLocalMonths(current.dateFrom, -1))
			),
			mode: 'same_elapsed'
		}
	}

	const fullMonth = current.dateFrom === startOfLocalMonth(current.dateFrom)
		&& current.dateTo === endOfLocalMonth(current.dateFrom)
	if (fullMonth) {
		const previousMonthStart = addLocalMonths(current.dateFrom, -1)
		return {
			dateFrom: previousMonthStart,
			dateTo: endOfLocalMonth(previousMonthStart),
			mode: 'full_period'
		}
	}

	const duration = current.dateTo - current.dateFrom
	return {
		dateFrom: startOfLocalDay(current.dateFrom - duration - 1),
		dateTo: endOfLocalDay(current.dateFrom - 1),
		mode: 'equivalent_range'
	}
}

const getPreviousFullPeriodRange = (range = {}) => {
	const previousMonthStart = addLocalMonths(startOfLocalMonth(range.dateFrom), -1)
	return {
		dateFrom: previousMonthStart,
		dateTo: endOfLocalMonth(previousMonthStart),
		mode: 'full_period'
	}
}

const createMonthBuckets = range => {
	const buckets = []
	let cursor = startOfLocalMonth(range.dateFrom)
	const last = startOfLocalMonth(range.dateTo)

	while (cursor <= last) {
		const month = getMonthKey(cursor)
		buckets.push({
			month,
			label: getMonthLabel(month),
			longLabel: getMonthLongLabel(month),
			dateFrom: Math.max(startOfLocalMonth(cursor), range.dateFrom),
			dateTo: Math.min(endOfLocalMonth(cursor), range.dateTo),
			income: 0,
			expenses: 0
		})
		cursor = addLocalMonths(cursor, 1)
	}

	return buckets
}

const getMonthlyIncomeExpenses = (transactions, range) => {
	const buckets = createMonthBuckets(range)
	const byMonth = new Map(buckets.map(item => [item.month, item]))

	getUniqueTransactions(transactions).forEach(transaction => {
		if (transaction.timestamp < range.dateFrom || transaction.timestamp > range.dateTo) return
		const bucket = byMonth.get(getMonthKey(transaction.timestamp))
		if (!bucket) return
		if (transaction.amount > 0) bucket.income += transaction.amount
		if (transaction.amount < 0) bucket.expenses += Math.abs(transaction.amount)
	})

	return buckets
}

const resolveTransactionCategoryId = transaction => {
	const categoryId = transaction.categoryId === undefined || transaction.categoryId === null || transaction.categoryId === ''
		? null
		: String(transaction.categoryId)
	if (categoryId) return categoryId
	const inlineCategoryId = transaction.category?.id === undefined || transaction.category?.id === null || transaction.category?.id === ''
		? null
		: String(transaction.category.id)
	return inlineCategoryId || UNCATEGORIZED_CATEGORY_ID
}

const normalizeCategoryId = value => {
	if (value === undefined || value === null || value === '') return null
	return String(value)
}

const getCategoryMap = categories => {
	const map = new Map()
	;(Array.isArray(categories) ? categories : []).forEach(category => {
		const key = normalizeCategoryId(category?.id)
		if (key) map.set(key, category)
	})
	return map
}

const isInternalTransfer = (transaction, categoriesById = new Map()) => {
	const categoryId = normalizeCategoryId(resolveTransactionCategoryId(transaction))
	const category = categoriesById.get(categoryId)
	const code = String(category?.code || '').toLowerCase()
	if (INTERNAL_TRANSFER_CATEGORY_CODES.has(code)) return true
	if (INTERNAL_TRANSFER_CATEGORY_IDS.has(categoryId)) return true
	const rawCode = String(transaction?.sourceCategoryCode ?? transaction?.mcc ?? transaction?.rawCategory ?? transaction?.bankCategory ?? '').trim()
	return INTERNAL_TRANSFER_EXTERNAL_CODES.has(rawCode)
}

const classifyTransaction = (transaction, categoriesById = new Map()) => {
	const amountCents = toMoneyCents(transaction?.amount)
	if (!amountCents) return 'neutral'
	if (isInternalTransfer(transaction, categoriesById)) return 'transfer'
	return amountCents > 0 ? 'income' : 'expense'
}

const getCategorySpending = (transactions, range) => {
	const totals = new Map()

	getUniqueTransactions(transactions).forEach(transaction => {
		if (transaction.timestamp < range.dateFrom || transaction.timestamp > range.dateTo) return
		if (transaction.amount >= 0) return
		const categoryId = resolveTransactionCategoryId(transaction)
		const current = totals.get(categoryId) || {
			categoryId,
			amount: 0,
			percentage: 0,
			count: 0
		}
		current.amount += Math.abs(transaction.amount)
		current.count++
		totals.set(categoryId, current)
	})

	const total = Array.from(totals.values()).reduce((sum, item) => sum + item.amount, 0)
	const items = Array.from(totals.values())
		.map(item => ({
			...item,
			percentage: total > 0 ? (item.amount / total) * 100 : 0
		}))
		.sort((left, right) => right.amount - left.amount || String(left.categoryId).localeCompare(String(right.categoryId)))

	return {total, items}
}

const getFinancialTotals = (transactions, range, categories = []) => {
	const categoriesById = getCategoryMap(categories)
	const totals = getUniqueTransactions(transactions).reduce((result, transaction) => {
		if (transaction.timestamp < range.dateFrom || transaction.timestamp > range.dateTo) return result
		const amountCents = toMoneyCents(transaction.amount)
		const kind = classifyTransaction(transaction, categoriesById)
		if (kind === 'income') {
			result.incomeCents += amountCents
			result.incomeCount++
		}
		if (kind === 'expense') {
			result.expenseCents += Math.abs(amountCents)
			result.expenseCount++
		}
		if (kind === 'transfer') result.transferCount++
		result.transactionCount++
		return result
	}, {
		incomeCents: 0,
		expenseCents: 0,
		incomeCount: 0,
		expenseCount: 0,
		transferCount: 0,
		transactionCount: 0
	})

	return {
		income: fromMoneyCents(totals.incomeCents),
		expenses: fromMoneyCents(totals.expenseCents),
		net: fromMoneyCents(totals.incomeCents - totals.expenseCents),
		incomeCount: totals.incomeCount,
		expenseCount: totals.expenseCount,
		transferCount: totals.transferCount,
		transactionCount: totals.transactionCount
	}
}

const getChange = (current, previous) => {
	const currentValue = roundMoney(current)
	const previousValue = roundMoney(previous)
	const absolute = roundMoney(currentValue - previousValue)
	return {
		absolute,
		percentage: previousValue === 0 ? null : roundMoney((absolute / Math.abs(previousValue)) * 100),
		direction: absolute > 0 ? 'up' : absolute < 0 ? 'down' : 'flat'
	}
}

const getCategorySpendingV2 = (transactions, range, categories = []) => {
	const categoriesById = getCategoryMap(categories)
	const totals = new Map()

	getUniqueTransactions(transactions).forEach(transaction => {
		if (transaction.timestamp < range.dateFrom || transaction.timestamp > range.dateTo) return
		if (classifyTransaction(transaction, categoriesById) !== 'expense') return
		const categoryId = resolveTransactionCategoryId(transaction)
		const amountCents = Math.abs(toMoneyCents(transaction.amount))
		const current = totals.get(categoryId) || {
			categoryId,
			amountCents: 0,
			amount: 0,
			percentage: 0,
			count: 0
		}
		current.amountCents += amountCents
		current.amount = fromMoneyCents(current.amountCents)
		current.count++
		totals.set(categoryId, current)
	})

	const totalCents = Array.from(totals.values()).reduce((sum, item) => sum + item.amountCents, 0)
	const total = fromMoneyCents(totalCents)
	const items = Array.from(totals.values())
		.map(item => ({
			categoryId: item.categoryId,
			amount: item.amount,
			percentage: totalCents > 0 ? roundMoney(item.amountCents / totalCents * 100) : 0,
			count: item.count
		}))
		.sort((left, right) => right.amount - left.amount || String(left.categoryId).localeCompare(String(right.categoryId)))

	return {total, items}
}

const getCategoryComparison = (current, previous) => {
	const byId = new Map()
	current.items.forEach(item => {
		byId.set(String(item.categoryId), {
			categoryId: item.categoryId,
			current: item.amount,
			previous: 0,
			percentage: item.percentage
		})
	})
	previous.items.forEach(item => {
		const key = String(item.categoryId)
		const currentItem = byId.get(key) || {
			categoryId: item.categoryId,
			current: 0,
			previous: 0,
			percentage: 0
		}
		currentItem.previous = item.amount
		byId.set(key, currentItem)
	})

	return Array.from(byId.values())
		.map(item => ({
			...item,
			change: getChange(item.current, item.previous)
		}))
		.sort((left, right) => right.current - left.current || right.previous - left.previous || String(left.categoryId).localeCompare(String(right.categoryId)))
}

const getBucketKey = (timestamp, granularity) => {
	const date = new Date(timestamp)
	if (granularity === 'month') return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
	if (granularity === 'week') {
		const day = date.getDay() || 7
		const monday = startOfLocalDay(timestamp) - ((day - 1) * 24 * 60 * 60 * 1000)
		const weekDate = new Date(monday)
		return `${weekDate.getFullYear()}-W${String(Math.floor((monday - new Date(weekDate.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1).padStart(2, '0')}`
	}
	return [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, '0'),
		String(date.getDate()).padStart(2, '0')
	].join('-')
}

const getBucketLabel = (timestamp, granularity) => {
	const date = new Date(timestamp)
	if (granularity === 'month') return date.toLocaleDateString('en-US', {month: 'short', year: '2-digit'})
	if (granularity === 'week') return `Week of ${date.toLocaleDateString('en-GB', {day: 'numeric', month: 'short'})}`
	return date.toLocaleDateString('en-GB', {day: 'numeric', month: 'short'})
}

const getTrendGranularity = range => {
	const days = getLocalDayCount(range)
	if (days <= 62) return 'day'
	if (days <= 180) return 'week'
	return 'month'
}

const addBucketStep = (timestamp, granularity) => {
	const normalizedTimestamp = normalizeAnalyticsTimestamp(timestamp)
	const date = new Date(normalizedTimestamp)
	if (granularity === 'month') return new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime()
	date.setHours(0, 0, 0, 0)
	if (granularity === 'week') {
		date.setDate(date.getDate() + 7)
		return date.getTime()
	}
	if (granularity === 'day') {
		date.setDate(date.getDate() + 1)
		return date.getTime()
	}
	throw new Error(`Unsupported statistics trend granularity: ${granularity}`)
}

const getMonthBucketCount = (dateFrom, dateTo) => {
	const from = new Date(startOfLocalMonth(dateFrom))
	const to = new Date(startOfLocalMonth(dateTo))
	return ((to.getFullYear() - from.getFullYear()) * 12) + (to.getMonth() - from.getMonth()) + 1
}

const getExpectedTrendBucketCount = (range, granularity) => {
	const days = getLocalDayCount(range)
	if (granularity === 'day') return days
	if (granularity === 'week') return Math.ceil(days / 7) + 1
	if (granularity === 'month') return getMonthBucketCount(range.dateFrom, range.dateTo)
	throw new Error(`Unsupported statistics trend granularity: ${granularity}`)
}

const assertTrendBucketCount = (range, granularity) => {
	const expectedBuckets = getExpectedTrendBucketCount(range, granularity)
	if (!Number.isFinite(expectedBuckets) || expectedBuckets < 1) {
		throw new Error('Statistics trend bucket count could not be derived from the selected range.')
	}
	if (expectedBuckets > MAX_TREND_BUCKETS) {
		throw new Error(`Statistics trend range creates ${expectedBuckets} ${granularity} buckets, which exceeds the safety limit of ${MAX_TREND_BUCKETS}.`)
	}
	return expectedBuckets
}

const createTrendBuckets = (range, granularity = getTrendGranularity(range)) => {
	const normalizedRange = normalizeAnalyticsRange(range)
	assertTrendBucketCount(normalizedRange, granularity)
	const buckets = []
	let cursor = startOfLocalDay(normalizedRange.dateFrom)
	if (granularity === 'month') cursor = startOfLocalMonth(normalizedRange.dateFrom)
	if (granularity === 'week') {
		const date = new Date(cursor)
		const day = date.getDay() || 7
		cursor -= (day - 1) * 24 * 60 * 60 * 1000
	}

	while (cursor <= normalizedRange.dateTo) {
		const next = addBucketStep(cursor, granularity)
		if (!Number.isFinite(next) || next <= cursor) {
			throw new Error(`Statistics trend bucket progression failed for ${granularity} at ${cursor}.`)
		}
		if (buckets.length >= MAX_TREND_BUCKETS) {
			throw new Error(`Statistics trend exceeded the safety limit of ${MAX_TREND_BUCKETS} buckets.`)
		}
		const dateFrom = Math.max(cursor, normalizedRange.dateFrom)
		const dateTo = Math.min(next - 1, normalizedRange.dateTo)
		buckets.push({
			key: getBucketKey(cursor, granularity),
			label: getBucketLabel(cursor, granularity),
			dateFrom,
			dateTo,
			income: 0,
			expenses: 0
		})
		cursor = next
	}
	return buckets
}

const getSpendingTrend = (transactions, range, categories = []) => {
	const normalizedRange = normalizeAnalyticsRange(range)
	const granularity = getTrendGranularity(normalizedRange)
	const buckets = createTrendBuckets(normalizedRange, granularity)
	const byKey = new Map(buckets.map(bucket => [bucket.key, bucket]))
	const categoriesById = getCategoryMap(categories)

	getUniqueTransactions(transactions).forEach(transaction => {
		if (transaction.timestamp < normalizedRange.dateFrom || transaction.timestamp > normalizedRange.dateTo) return
		const bucket = byKey.get(getBucketKey(transaction.timestamp, granularity))
		if (!bucket) return
		const kind = classifyTransaction(transaction, categoriesById)
		if (kind === 'income') bucket.income = roundMoney(bucket.income + Math.abs(transaction.amount))
		if (kind === 'expense') bucket.expenses = roundMoney(bucket.expenses + Math.abs(transaction.amount))
	})

	return {granularity, items: buckets}
}

const rangesOverlap = (left = {}, right = {}) => {
	const leftFrom = toNumber(left.dateFrom)
	const leftTo = toNumber(left.dateTo)
	const rightFrom = toNumber(right.dateFrom)
	const rightTo = toNumber(right.dateTo)
	return Boolean(leftFrom && leftTo && rightFrom && rightTo && leftFrom <= rightTo && rightFrom <= leftTo)
}

const normalizePlanningStatus = status => {
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

const getPlanningSummary = ({planningState = {}, range = {}} = {}) => {
	const period = planningState.currentPeriod || planningState.period || null
	const items = Array.isArray(planningState.planningItems)
		? planningState.planningItems
		: (Array.isArray(planningState.items) ? planningState.items : [])
	const inScope = period && rangesOverlap(period, range)
	const scopedItems = inScope
		? items.filter(item => {
			const date = toNumber(item.date || item.plannedAt || item.createdAt)
			return date >= range.dateFrom && date <= range.dateTo
		})
		: []
	const result = scopedItems.reduce((summary, item) => {
		const status = normalizePlanningStatus(item.status)
		const plannedAmount = roundMoney(item.sum ?? item.plannedAmount ?? item.planned_amount)
		const hasActualAmount = item.actualAmount !== null && item.actualAmount !== undefined
			|| item.actual_amount !== null && item.actual_amount !== undefined
		const actualAmount = hasActualAmount
			? roundMoney(item.actualAmount ?? item.actual_amount)
			: null
		const isCompleted = status === 'completed'
		const isCancelled = status === 'cancelled'
		const isLinked = Boolean(item.transactionId || item.transaction_id)
		if (!isCancelled) summary.planned += plannedAmount
		if (isCompleted) summary.actual += actualAmount === null ? plannedAmount : actualAmount
		else if (isLinked && actualAmount !== null) summary.actual += actualAmount
		if (isCompleted) summary.completedCount += 1
		else if (isCancelled) summary.cancelledCount += 1
		else summary.pendingCount += 1
		summary.totalCount += 1
		return summary
	}, {
		planned: 0,
		actual: 0,
		difference: 0,
		completedCount: 0,
		pendingCount: 0,
		cancelledCount: 0,
		totalCount: 0,
		inScope,
		period
	})
	result.planned = roundMoney(result.planned)
	result.actual = roundMoney(result.actual)
	result.difference = roundMoney(result.planned - result.actual)
	return result
}

const getBudgetForRange = ({planningState = {}, range = {}} = {}) => {
	const period = planningState.currentPeriod || planningState.period || null
	if (!period || !rangesOverlap(period, range)) {
		return {
			amount: null,
			available: false
		}
	}
	return {
		amount: roundMoney(period.periodBudget),
		available: toNumber(period.periodBudget) > 0,
		period
	}
}

const buildStatistics = ({
	transactions,
	categories = [],
	planningState = {},
	range = getCurrentMonthRange(),
	comparisonRange = getPreviousEquivalentRange(range),
	coverage = null
} = {}) => {
	const normalizedRange = normalizeAnalyticsRange(range)
	const normalizedComparisonRange = normalizeAnalyticsRange(comparisonRange)
	const currentTotals = getFinancialTotals(transactions, normalizedRange, categories)
	const previousTotals = getFinancialTotals(transactions, normalizedComparisonRange, categories)
	const currentCategories = getCategorySpendingV2(transactions, normalizedRange, categories)
	const previousCategories = getCategorySpendingV2(transactions, normalizedComparisonRange, categories)
	const budget = getBudgetForRange({planningState, range: normalizedRange})
	const budgetUtilization = budget.available && budget.amount > 0
		? roundMoney(currentTotals.expenses / budget.amount * 100)
		: null

	return {
		range: normalizedRange,
		comparisonRange: normalizedComparisonRange,
		coverage: getCoveragePresentation(coverage),
		comparisonMode: comparisonRange.mode || 'equivalent_range',
		totals: {
			...currentTotals,
			budgetAmount: budget.available ? budget.amount : null,
			budgetUtilization,
			changes: {
				income: getChange(currentTotals.income, previousTotals.income),
				expenses: getChange(currentTotals.expenses, previousTotals.expenses),
				net: getChange(currentTotals.net, previousTotals.net),
				budgetUtilization: budgetUtilization === null ? null : getChange(budgetUtilization, 0)
			}
		},
		previousTotals,
		categories: {
			total: currentCategories.total,
			items: getCategoryComparison(currentCategories, previousCategories)
		},
		trend: getSpendingTrend(transactions, normalizedRange, categories),
		planning: getPlanningSummary({planningState, range: normalizedRange})
	}
}

const getCoverageWindows = coverage => {
	return Array.isArray(coverage?.windows) ? coverage.windows : []
}

const mergeIntervals = intervals => {
	return intervals
		.map(interval => ({
			from: toNumber(interval.from),
			to: toNumber(interval.to)
		}))
		.filter(interval => interval.from > 0 && interval.to > 0 && interval.from <= interval.to)
		.sort((left, right) => left.from - right.from)
		.reduce((merged, interval) => {
			const previous = merged[merged.length - 1]
			if (!previous || interval.from > previous.to + 1) {
				merged.push({...interval})
				return merged
			}
			previous.to = Math.max(previous.to, interval.to)
			return merged
		}, [])
}

const intervalFullyCovers = (intervals, requiredFrom, requiredTo) => {
	const merged = mergeIntervals(intervals)
	return merged.some(interval => interval.from <= requiredFrom && interval.to >= requiredTo)
}

const intervalOverlaps = (intervals, requiredFrom, requiredTo) => {
	return intervals.some(interval => {
		const from = toNumber(interval.from)
		const to = toNumber(interval.to)
		return from <= requiredTo && to >= requiredFrom
	})
}

const getCoverageForRange = ({coverage, dateFrom, dateTo, providers = ['mono', 'privat']} = {}) => {
	const requiredFrom = toNumber(dateFrom)
	const requiredTo = toNumber(dateTo)
	if (!requiredFrom || !requiredTo || requiredFrom > requiredTo) return COVERAGE_MISSING

	const windows = getCoverageWindows(coverage).filter(window => window?.complete)
	const providerIntervals = providers.map(provider => {
		return windows
			.filter(window => window.provider === provider)
			.map(window => ({
				from: toNumber(window.dateFrom),
				to: toNumber(window.dateTo)
			}))
	})

	if (providerIntervals.every(intervals => intervalFullyCovers(intervals, requiredFrom, requiredTo))) {
		return COVERAGE_COMPLETE
	}

	if (providerIntervals.some(intervals => intervalOverlaps(intervals, requiredFrom, requiredTo))) {
		return COVERAGE_PARTIAL
	}

	return COVERAGE_MISSING
}

const addCoverageToMonthlyIncomeExpenses = (monthlyItems, coverage) => {
	return monthlyItems.map(item => ({
		...item,
		net: item.income - item.expenses,
		coverage: getCoverageForRange({
			coverage,
			dateFrom: item.dateFrom,
			dateTo: item.dateTo
		})
	}))
}

const getCoveragePresentation = coverage => {
	if (coverage?.complete) return {
		status: 'complete',
		complete: true,
		label: 'Local history is complete for this period.'
	}
	if (coverage?.status === 'not_fetched') return {
		status: 'not_fetched',
		complete: false,
		label: 'This period has not been cached locally yet.'
	}
	return {
		status: 'partial',
		complete: false,
		label: 'Analytics use locally available history. Some period data may be missing.'
	}
}

export {
	COVERAGE_COMPLETE,
	COVERAGE_MISSING,
	COVERAGE_PARTIAL,
	UNCATEGORIZED_CATEGORY_ID,
	addCoverageToMonthlyIncomeExpenses,
	buildStatistics,
	classifyTransaction,
	createTrendBuckets,
	fromMoneyCents,
	getCategorySpending,
	getCategorySpendingV2,
	getChange,
	getCoverageForRange,
	getCoveragePresentation,
	getCurrentMonthRange,
	getFinancialTotals,
	getFullCurrentMonthRange,
	getMonthlyIncomeExpenses,
	normalizeAnalyticsRange,
	getPeriodPresetRange,
	getPlanningSummary,
	getPreviousEquivalentRange,
	getPreviousFullPeriodRange,
	getPreviousMonthRange,
	getRecentMonthRange,
	getSpendingTrend,
	getUniqueTransactions,
	isInternalTransfer,
	normalizeDateRange,
	normalizeTransactionList,
	roundMoney,
	startOfLocalDay,
	endOfLocalDay,
	startOfLocalMonth,
	endOfLocalMonth
}
