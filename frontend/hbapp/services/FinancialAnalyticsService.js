const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_NAMES_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const UNCATEGORIZED_CATEGORY_ID = 'uncategorized'
const COVERAGE_COMPLETE = 'complete'
const COVERAGE_PARTIAL = 'partial'
const COVERAGE_MISSING = 'missing'

const toNumber = value => {
	const num = Number(value)
	return Number.isFinite(num) ? num : 0
}

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

const addLocalMonths = (value, count) => {
	const date = new Date(value)
	return new Date(date.getFullYear(), date.getMonth() + count, 1, 0, 0, 0, 0).getTime()
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

	normalizeTransactionList(transactions).forEach(transaction => {
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

const getCategorySpending = (transactions, range) => {
	const totals = new Map()

	normalizeTransactionList(transactions).forEach(transaction => {
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
	getCategorySpending,
	getCoverageForRange,
	getCoveragePresentation,
	getCurrentMonthRange,
	getMonthlyIncomeExpenses,
	getRecentMonthRange,
	normalizeDateRange,
	normalizeTransactionList,
	startOfLocalDay,
	endOfLocalDay,
	startOfLocalMonth,
	endOfLocalMonth
}
