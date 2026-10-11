import test from 'node:test'
import assert from 'node:assert/strict'

import {
	COVERAGE_COMPLETE,
	COVERAGE_MISSING,
	COVERAGE_PARTIAL,
	UNCATEGORIZED_CATEGORY_ID,
	addCoverageToMonthlyIncomeExpenses,
	buildStatistics,
	createTrendBuckets,
	getCategorySpendingV2,
	getChange,
	getCategorySpending,
	getCoverageForRange,
	getCoveragePresentation,
	getCurrentMonthRange,
	getFinancialTotals,
	getMonthlyIncomeExpenses,
	getPlanningSummary,
	getPreviousEquivalentRange,
	getRecentMonthRange,
	getSpendingTrend,
	normalizeDateRange
} from '../hbapp/services/FinancialAnalyticsService.js'

const ts = (year, monthIndex, day, hour = 12, minute = 0) => {
	return new Date(year, monthIndex, day, hour, minute, 0, 0).getTime()
}

const range = (from, to) => ({dateFrom: from, dateTo: to})

const coverageFor = windows => ({windows})

const completeWindow = (provider, from, to) => ({
	provider,
	dateFrom: from,
	dateTo: to,
	complete: true
})

test('monthly income aggregation sums positive transaction amounts', () => {
	const data = {
		mono: [
			{timestamp: ts(2026, 3, 4), amount: 1000},
			{timestamp: ts(2026, 3, 8), amount: 250}
		],
		privat: []
	}

	const result = getMonthlyIncomeExpenses(data, range(ts(2026, 3, 1, 0), ts(2026, 3, 30, 23)))

	assert.equal(result[0].month, '2026-04')
	assert.equal(result[0].income, 1250)
})

test('monthly expense aggregation sums absolute negative transaction amounts', () => {
	const data = {
		mono: [{timestamp: ts(2026, 4, 4), amount: -300}],
		privat: [{timestamp: ts(2026, 4, 5), amount: -120.5}]
	}

	const result = getMonthlyIncomeExpenses(data, range(ts(2026, 4, 1, 0), ts(2026, 4, 31, 23)))

	assert.equal(result[0].expenses, 420.5)
})

test('income is not counted as expense', () => {
	const data = {mono: [{timestamp: ts(2026, 5, 10), amount: 900}], privat: []}

	const result = getMonthlyIncomeExpenses(data, range(ts(2026, 5, 1, 0), ts(2026, 5, 30, 23)))

	assert.equal(result[0].income, 900)
	assert.equal(result[0].expenses, 0)
})

test('transactions are grouped into the correct local calendar month', () => {
	const data = {
		mono: [
			{timestamp: new Date(2026, 6, 31, 23, 30, 0, 0).getTime(), amount: -100},
			{timestamp: new Date(2026, 7, 1, 0, 15, 0, 0).getTime(), amount: -200}
		],
		privat: []
	}

	const result = getMonthlyIncomeExpenses(data, range(ts(2026, 6, 1, 0), ts(2026, 7, 31, 23)))

	assert.equal(result[0].month, '2026-07')
	assert.equal(result[0].expenses, 100)
	assert.equal(result[1].month, '2026-08')
	assert.equal(result[1].expenses, 200)
})

test('empty month appears with zero values', () => {
	const data = {mono: [{timestamp: ts(2026, 0, 10), amount: 500}], privat: []}

	const result = getMonthlyIncomeExpenses(data, range(ts(2026, 0, 1, 0), ts(2026, 2, 31, 23)))

	assert.deepEqual(result.map(item => [item.month, item.income, item.expenses]), [
		['2026-01', 500, 0],
		['2026-02', 0, 0],
		['2026-03', 0, 0]
	])
})

test('6-month range includes current month and five previous local months', () => {
	const now = new Date(2026, 8, 24, 10, 0, 0, 0)

	const result = getRecentMonthRange(6, now)
	const months = getMonthlyIncomeExpenses({}, result).map(item => item.month)

	assert.equal(result.dateFrom, new Date(2026, 3, 1, 0, 0, 0, 0).getTime())
	assert.deepEqual(months, ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'])
})

test('12-month range includes current month and eleven previous local months', () => {
	const now = new Date(2026, 8, 24, 10, 0, 0, 0)

	const result = getRecentMonthRange(12, now)
	const months = getMonthlyIncomeExpenses({}, result).map(item => item.month)

	assert.equal(result.dateFrom, new Date(2025, 9, 1, 0, 0, 0, 0).getTime())
	assert.equal(months.length, 12)
	assert.equal(months[0], '2025-10')
	assert.equal(months[11], '2026-09')
})

test('category aggregation includes only expenses', () => {
	const data = {
		mono: [
			{timestamp: ts(2026, 8, 2), amount: -100, categoryId: 'food'},
			{timestamp: ts(2026, 8, 3), amount: 500, categoryId: 'food'}
		],
		privat: []
	}

	const result = getCategorySpending(data, range(ts(2026, 8, 1, 0), ts(2026, 8, 30, 23)))

	assert.equal(result.total, 100)
	assert.equal(result.items[0].categoryId, 'food')
	assert.equal(result.items[0].amount, 100)
})

test('category spending is sorted descending', () => {
	const data = {
		mono: [
			{timestamp: ts(2026, 8, 2), amount: -100, categoryId: 'food'},
			{timestamp: ts(2026, 8, 3), amount: -300, categoryId: 'home'}
		],
		privat: []
	}

	const result = getCategorySpending(data, range(ts(2026, 8, 1, 0), ts(2026, 8, 30, 23)))

	assert.deepEqual(result.items.map(item => item.categoryId), ['home', 'food'])
})

test('category percentages are calculated from total expenses', () => {
	const data = {
		mono: [
			{timestamp: ts(2026, 8, 2), amount: -25, categoryId: 'food'},
			{timestamp: ts(2026, 8, 3), amount: -75, categoryId: 'home'}
		],
		privat: []
	}

	const result = getCategorySpending(data, range(ts(2026, 8, 1, 0), ts(2026, 8, 30, 23)))

	assert.equal(result.items.find(item => item.categoryId === 'food').percentage, 25)
	assert.equal(result.items.find(item => item.categoryId === 'home').percentage, 75)
})

test('uncategorized transactions are handled explicitly', () => {
	const data = {mono: [{timestamp: ts(2026, 8, 2), amount: -44}], privat: []}

	const result = getCategorySpending(data, range(ts(2026, 8, 1, 0), ts(2026, 8, 30, 23)))

	assert.equal(result.items[0].categoryId, UNCATEGORIZED_CATEGORY_ID)
})

test('selected date range boundaries include the full local from and to days', () => {
	const selected = normalizeDateRange({dateFrom: '2026-09-10', dateTo: '2026-09-12'}, new Date(2026, 8, 24))
	const data = {
		mono: [
			{timestamp: new Date(2026, 8, 10, 0, 0, 0, 0).getTime(), amount: -10, categoryId: 'food'},
			{timestamp: new Date(2026, 8, 12, 23, 59, 59, 999).getTime(), amount: -15, categoryId: 'food'},
			{timestamp: new Date(2026, 8, 13, 0, 0, 0, 0).getTime(), amount: -20, categoryId: 'food'}
		],
		privat: []
	}

	const result = getCategorySpending(data, selected)

	assert.equal(result.total, 25)
})

test('current month range starts at local month boundary', () => {
	const now = new Date(2026, 8, 24, 10, 0, 0, 0)

	const result = getCurrentMonthRange(now)

	assert.equal(result.dateFrom, new Date(2026, 8, 1, 0, 0, 0, 0).getTime())
	assert.equal(result.dateTo, now.getTime())
})

test('partial local transaction coverage is presented distinctly', () => {
	assert.equal(getCoveragePresentation({complete: true}).status, 'complete')
	assert.equal(getCoveragePresentation({status: 'partial', complete: false}).status, 'partial')
	assert.equal(getCoveragePresentation({status: 'not_fetched', complete: false}).status, 'not_fetched')
})

test('historical full month covered is complete', () => {
	const from = new Date(2026, 7, 1, 0, 0, 0, 0).getTime()
	const to = new Date(2026, 7, 31, 23, 59, 59, 999).getTime()
	const coverage = coverageFor([
		completeWindow('mono', from, to),
		completeWindow('privat', from, to)
	])

	assert.equal(getCoverageForRange({coverage, dateFrom: from, dateTo: to}), COVERAGE_COMPLETE)
})

test('historical partially covered month is partial', () => {
	const from = new Date(2026, 7, 1, 0, 0, 0, 0).getTime()
	const to = new Date(2026, 7, 31, 23, 59, 59, 999).getTime()
	const coverage = coverageFor([
		completeWindow('mono', from, new Date(2026, 7, 15, 23, 59, 59, 999).getTime()),
		completeWindow('privat', from, to)
	])

	assert.equal(getCoverageForRange({coverage, dateFrom: from, dateTo: to}), COVERAGE_PARTIAL)
})

test('historical month without coverage is missing', () => {
	const from = new Date(2026, 7, 1, 0, 0, 0, 0).getTime()
	const to = new Date(2026, 7, 31, 23, 59, 59, 999).getTime()

	assert.equal(getCoverageForRange({coverage: coverageFor([]), dateFrom: from, dateTo: to}), COVERAGE_MISSING)
})

test('current month only requires coverage through current required boundary', () => {
	const now = new Date(2026, 8, 24, 10, 0, 0, 0)
	const currentRange = getRecentMonthRange(1, now)
	const coverage = coverageFor([
		completeWindow('mono', currentRange.dateFrom, currentRange.dateTo),
		completeWindow('privat', currentRange.dateFrom, currentRange.dateTo)
	])

	assert.equal(currentRange.dateTo, now.getTime())
	assert.equal(getCoverageForRange({coverage, dateFrom: currentRange.dateFrom, dateTo: currentRange.dateTo}), COVERAGE_COMPLETE)
})

test('current month does not require future dates', () => {
	const now = new Date(2026, 8, 24, 10, 0, 0, 0)
	const monthly = getMonthlyIncomeExpenses({}, getRecentMonthRange(1, now))

	assert.equal(monthly[0].dateTo, now.getTime())
	assert.notEqual(monthly[0].dateTo, new Date(2026, 8, 30, 23, 59, 59, 999).getTime())
})

test('adjacent transaction windows combine into complete coverage', () => {
	const from = new Date(2026, 7, 1, 0, 0, 0, 0).getTime()
	const middle = new Date(2026, 7, 15, 23, 59, 59, 999).getTime()
	const next = middle + 1
	const to = new Date(2026, 7, 31, 23, 59, 59, 999).getTime()
	const coverage = coverageFor([
		completeWindow('mono', from, middle),
		completeWindow('mono', next, to),
		completeWindow('privat', from, middle),
		completeWindow('privat', next, to)
	])

	assert.equal(getCoverageForRange({coverage, dateFrom: from, dateTo: to}), COVERAGE_COMPLETE)
})

test('local date boundaries do not shift due UTC parsing', () => {
	const selected = normalizeDateRange({dateFrom: '2026-10-25', dateTo: '2026-10-25'}, new Date(2026, 9, 25, 12))

	assert.equal(selected.dateFrom, new Date(2026, 9, 25, 0, 0, 0, 0).getTime())
	assert.equal(selected.dateTo, new Date(2026, 9, 25, 23, 59, 59, 999).getTime())
})

test('month details read-model includes income expenses and net values', () => {
	const data = {
		mono: [
			{timestamp: ts(2026, 8, 5), amount: 1000},
			{timestamp: ts(2026, 8, 6), amount: -250}
		],
		privat: []
	}
	const monthRange = range(new Date(2026, 8, 1, 0, 0, 0, 0).getTime(), new Date(2026, 8, 30, 23, 59, 59, 999).getTime())
	const monthly = addCoverageToMonthlyIncomeExpenses(getMonthlyIncomeExpenses(data, monthRange), coverageFor([
		completeWindow('mono', monthRange.dateFrom, monthRange.dateTo),
		completeWindow('privat', monthRange.dateFrom, monthRange.dateTo)
	]))

	assert.equal(monthly[0].income, 1000)
	assert.equal(monthly[0].expenses, 250)
	assert.equal(monthly[0].net, 750)
	assert.equal(monthly[0].coverage, COVERAGE_COMPLETE)
})

test('partial month retains known values with partial state', () => {
	const monthRange = range(new Date(2026, 8, 1, 0, 0, 0, 0).getTime(), new Date(2026, 8, 30, 23, 59, 59, 999).getTime())
	const monthly = addCoverageToMonthlyIncomeExpenses(getMonthlyIncomeExpenses({
		mono: [{timestamp: ts(2026, 8, 5), amount: -80}],
		privat: []
	}, monthRange), coverageFor([
		completeWindow('mono', monthRange.dateFrom, ts(2026, 8, 10, 23, 59)),
		completeWindow('privat', monthRange.dateFrom, monthRange.dateTo)
	]))

	assert.equal(monthly[0].expenses, 80)
	assert.equal(monthly[0].coverage, COVERAGE_PARTIAL)
})

test('missing month does not become a misleading confirmed zero month', () => {
	const monthRange = range(new Date(2026, 8, 1, 0, 0, 0, 0).getTime(), new Date(2026, 8, 30, 23, 59, 59, 999).getTime())
	const monthly = addCoverageToMonthlyIncomeExpenses(getMonthlyIncomeExpenses({}, monthRange), coverageFor([]))

	assert.equal(monthly[0].income, 0)
	assert.equal(monthly[0].expenses, 0)
	assert.equal(monthly[0].coverage, COVERAGE_MISSING)
})

test('statistics totals use income expenses and precise money arithmetic', () => {
	const data = {
		mono: [
			{providerTransactionId: 'income-1', timestamp: ts(2026, 9, 1), amount: 1000.10},
			{providerTransactionId: 'expense-1', timestamp: ts(2026, 9, 2), amount: -0.10},
			{providerTransactionId: 'expense-2', timestamp: ts(2026, 9, 3), amount: -0.20}
		],
		privat: []
	}

	const result = getFinancialTotals(data, range(ts(2026, 9, 1, 0), ts(2026, 9, 31, 23)), [])

	assert.equal(result.income, 1000.1)
	assert.equal(result.expenses, 0.3)
	assert.equal(result.net, 999.8)
})

test('internal transfers are excluded from income and expense totals', () => {
	const categories = [{id: 1, code: 'transfers', name: 'Перекази', icon: 'transfer-money-icon'}]
	const data = {
		mono: [
			{providerTransactionId: 'transfer-out', timestamp: ts(2026, 9, 2), amount: -500, categoryId: 1},
			{providerTransactionId: 'transfer-in', timestamp: ts(2026, 9, 3), amount: 500, categoryId: 1},
			{providerTransactionId: 'shop', timestamp: ts(2026, 9, 4), amount: -120, categoryId: 3}
		],
		privat: []
	}

	const result = getFinancialTotals(data, range(ts(2026, 9, 1, 0), ts(2026, 9, 31, 23)), categories)

	assert.equal(result.income, 0)
	assert.equal(result.expenses, 120)
	assert.equal(result.transferCount, 2)
})

test('duplicate transactions are counted once by provider transaction id', () => {
	const data = {
		mono: [
			{providerTransactionId: 'dup-1', timestamp: ts(2026, 9, 2), amount: -100},
			{providerTransactionId: 'dup-1', timestamp: ts(2026, 9, 2), amount: -100}
		],
		privat: [
			{providerTransactionId: 'dup-1', timestamp: ts(2026, 9, 2), amount: -50}
		]
	}

	const result = getFinancialTotals(data, range(ts(2026, 9, 1, 0), ts(2026, 9, 31, 23)), [])

	assert.equal(result.expenses, 150)
})

test('linked purchases are not counted as extra expenses in statistics totals', () => {
	const data = {
		mono: [
			{providerTransactionId: 'bank-payment', timestamp: ts(2026, 9, 2), amount: -240, linkedPurchaseId: 10}
		],
		privat: []
	}

	const result = buildStatistics({
		transactions: data,
		categories: [],
		planningState: {
			currentPeriod: {dateFrom: ts(2026, 9, 1, 0), dateTo: ts(2026, 9, 31, 23), periodBudget: 1000},
			items: []
		},
		range: range(ts(2026, 9, 1, 0), ts(2026, 9, 31, 23)),
		comparisonRange: range(ts(2026, 8, 1, 0), ts(2026, 8, 30, 23))
	})

	assert.equal(result.totals.expenses, 240)
})

test('planned expenses are kept separate from actual bank spending', () => {
	const data = {mono: [{providerTransactionId: 'tx-1', timestamp: ts(2026, 9, 2), amount: -100}], privat: []}
	const result = buildStatistics({
		transactions: data,
		categories: [],
		planningState: {
			currentPeriod: {dateFrom: ts(2026, 9, 1, 0), dateTo: ts(2026, 9, 31, 23), periodBudget: 1000},
			items: [{id: 'p1', date: ts(2026, 9, 4), sum: 500, status: 'pending'}]
		},
		range: range(ts(2026, 9, 1, 0), ts(2026, 9, 31, 23)),
		comparisonRange: range(ts(2026, 8, 1, 0), ts(2026, 8, 30, 23))
	})

	assert.equal(result.totals.expenses, 100)
	assert.equal(result.planning.planned, 500)
	assert.equal(result.planning.actual, 0)
})

test('category totals match overall expenses and include one-sided comparison categories', () => {
	const categories = [
		{id: 2, code: 'restaurants', name: 'Restaurants', icon: 'restoran-icon'},
		{id: 3, code: 'groceries', name: 'Groceries', icon: 'food-icon'}
	]
	const data = {
		mono: [
			{providerTransactionId: 'current-food', timestamp: ts(2026, 9, 4), amount: -120, categoryId: 3},
			{providerTransactionId: 'previous-rest', timestamp: ts(2026, 8, 4), amount: -80, categoryId: 2}
		],
		privat: []
	}
	const result = buildStatistics({
		transactions: data,
		categories,
		range: range(ts(2026, 9, 1, 0), ts(2026, 9, 31, 23)),
		comparisonRange: range(ts(2026, 8, 1, 0), ts(2026, 8, 30, 23))
	})

	assert.equal(result.categories.total, result.totals.expenses)
	assert.deepEqual(result.categories.items.map(item => String(item.categoryId)).sort(), ['2', '3'])
	assert.equal(result.categories.items.find(item => String(item.categoryId) === '2').current, 0)
	assert.equal(result.categories.items.find(item => String(item.categoryId) === '3').previous, 0)
})

test('partial current month comparison uses same elapsed previous month period', () => {
	const now = new Date(2026, 9, 10, 15, 30, 0, 0)
	const current = getCurrentMonthRange(now)
	const previous = getPreviousEquivalentRange(current, now)

	assert.equal(previous.mode, 'same_elapsed')
	assert.equal(previous.dateFrom, new Date(2026, 8, 1, 0, 0, 0, 0).getTime())
	assert.equal(previous.dateTo, new Date(2026, 8, 10, 15, 30, 0, 0).getTime())
})

test('zero previous value does not produce misleading percentage', () => {
	const change = getChange(120, 0)

	assert.equal(change.absolute, 120)
	assert.equal(change.percentage, null)
	assert.equal(change.direction, 'up')
})

test('previous equivalent range handles leap-year month boundaries', () => {
	const current = range(
		new Date(2024, 2, 1, 0, 0, 0, 0).getTime(),
		new Date(2024, 2, 31, 23, 59, 59, 999).getTime()
	)
	const previous = getPreviousEquivalentRange(current, new Date(2024, 3, 1, 12))

	assert.equal(previous.dateFrom, new Date(2024, 1, 1, 0, 0, 0, 0).getTime())
	assert.equal(previous.dateTo, new Date(2024, 1, 29, 23, 59, 59, 999).getTime())
})

test('planning summary counts only confirmed actuals and keeps pending planned items open', () => {
	const summary = getPlanningSummary({
		range: range(ts(2026, 9, 1, 0), ts(2026, 9, 31, 23)),
		planningState: {
			currentPeriod: {dateFrom: ts(2026, 9, 1, 0), dateTo: ts(2026, 9, 31, 23)},
			items: [
				{id: 'done', date: ts(2026, 9, 2), sum: 100, actualAmount: 90, status: 'completed'},
				{id: 'linked-actual', date: ts(2026, 9, 3), sum: 50, actualAmount: 45, status: 'pending', transactionId: 'tx-1'},
				{id: 'linked-without-actual', date: ts(2026, 9, 4), sum: 60, status: 'pending', transactionId: 'tx-2'},
				{id: 'pending', date: ts(2026, 9, 5), sum: 70, status: 'pending'},
				{id: 'cancelled', date: ts(2026, 9, 6), sum: 80, status: 'cancelled'}
			]
		}
	})

	assert.equal(summary.planned, 280)
	assert.equal(summary.actual, 135)
	assert.equal(summary.difference, 145)
	assert.equal(summary.completedCount, 1)
	assert.equal(summary.pendingCount, 3)
	assert.equal(summary.cancelledCount, 1)
})

test('offline calculations work from supplied cached transactions only', () => {
	const cached = {mono: [{providerTransactionId: 'cache-1', timestamp: ts(2026, 9, 2), amount: -45}], privat: []}
	const result = getCategorySpendingV2(cached, range(ts(2026, 9, 1, 0), ts(2026, 9, 31, 23)), [])

	assert.equal(result.total, 45)
	assert.equal(result.items.length, 1)
})

test('statistics recalculate after local transaction updates', () => {
	const selectedRange = range(ts(2026, 9, 1, 0), ts(2026, 9, 31, 23))
	const first = getFinancialTotals({mono: [{providerTransactionId: 'tx-1', timestamp: ts(2026, 9, 2), amount: -40}], privat: []}, selectedRange, [])
	const second = getFinancialTotals({mono: [{providerTransactionId: 'tx-1', timestamp: ts(2026, 9, 2), amount: -40}, {providerTransactionId: 'tx-2', timestamp: ts(2026, 9, 3), amount: -60}], privat: []}, selectedRange, [])

	assert.equal(first.expenses, 40)
	assert.equal(second.expenses, 100)
})

test('longer ranges use weekly or monthly trend aggregation instead of daily totals', () => {
	const weekly = getSpendingTrend({}, range(ts(2026, 0, 1, 0), ts(2026, 3, 30, 23)), [])
	const monthly = getSpendingTrend({}, range(ts(2025, 0, 1, 0), ts(2026, 0, 31, 23)), [])

	assert.equal(weekly.granularity, 'week')
	assert.equal(monthly.granularity, 'month')
})

test('October 2026 daily statistics buckets advance once per local day', () => {
	const buckets = createTrendBuckets(range(
		new Date(2026, 9, 1, 0, 0, 0, 0).getTime(),
		new Date(2026, 9, 31, 23, 59, 59, 999).getTime()
	), 'day')

	assert.equal(buckets.length, 31)
	assert.equal(buckets[0].key, '2026-10-01')
	assert.equal(buckets[30].key, '2026-10-31')
	assert.deepEqual(new Set(buckets.map(item => item.dateFrom)).size, buckets.length)
	buckets.slice(1).forEach((bucket, index) => {
		assert.ok(bucket.dateFrom > buckets[index].dateFrom)
	})
})

test('weekly statistics buckets advance without repeated timestamps', () => {
	const buckets = createTrendBuckets(range(
		new Date(2026, 9, 1, 0, 0, 0, 0).getTime(),
		new Date(2026, 9, 31, 23, 59, 59, 999).getTime()
	), 'week')

	assert.equal(buckets.length, 5)
	assert.match(buckets[0].label, /Week of/)
	assert.deepEqual(new Set(buckets.map(item => item.dateFrom)).size, buckets.length)
	buckets.slice(1).forEach((bucket, index) => {
		assert.ok(bucket.dateFrom > buckets[index].dateFrom)
	})
})

test('monthly statistics buckets handle month boundaries', () => {
	const buckets = createTrendBuckets(range(
		new Date(2026, 0, 31, 12, 0, 0, 0).getTime(),
		new Date(2026, 2, 31, 23, 59, 59, 999).getTime()
	), 'month')

	assert.deepEqual(buckets.map(item => item.key), ['2026-01', '2026-02', '2026-03'])
	assert.equal(buckets[0].dateFrom, new Date(2026, 0, 31, 12, 0, 0, 0).getTime())
	assert.equal(buckets[2].dateTo, new Date(2026, 2, 31, 23, 59, 59, 999).getTime())
})

test('statistics trend rejects invalid date ranges before bucket generation', () => {
	assert.throws(
		() => createTrendBuckets({dateFrom: Number.NaN, dateTo: ts(2026, 9, 31)}, 'day'),
		/finite timestamp/
	)
	assert.throws(
		() => createTrendBuckets(range(ts(2026, 9, 31), ts(2026, 9, 1)), 'day'),
		/dateTo must be greater than or equal to dateFrom/
	)
	assert.throws(
		() => createTrendBuckets(range(0, ts(2026, 9, 1)), 'day'),
		/positive timestamp/
	)
})

test('statistics trend accepts Unix seconds and normalizes them to milliseconds', () => {
	const fromSeconds = Math.floor(new Date(2026, 9, 1, 0, 0, 0, 0).getTime() / 1000)
	const toSeconds = Math.floor(new Date(2026, 9, 31, 23, 59, 59, 999).getTime() / 1000)

	const buckets = createTrendBuckets(range(fromSeconds, toSeconds), 'day')

	assert.equal(buckets.length, 31)
	assert.equal(buckets[0].key, '2026-10-01')
	assert.equal(buckets[30].key, '2026-10-31')
})

test('statistics trend advances across DST transitions without repeated buckets', () => {
	const buckets = createTrendBuckets(range(
		new Date(2026, 9, 24, 0, 0, 0, 0).getTime(),
		new Date(2026, 9, 27, 23, 59, 59, 999).getTime()
	), 'day')

	assert.deepEqual(buckets.map(item => item.key), ['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27'])
	assert.deepEqual(new Set(buckets.map(item => item.dateFrom)).size, buckets.length)
	buckets.slice(1).forEach((bucket, index) => {
		assert.ok(bucket.dateFrom > buckets[index].dateFrom)
	})
})

test('statistics trend safety bound prevents excessive synchronous bucket loops', () => {
	assert.throws(
		() => createTrendBuckets(range(
			new Date(2020, 0, 1, 0, 0, 0, 0).getTime(),
			new Date(2026, 9, 31, 23, 59, 59, 999).getTime()
		), 'day'),
		/exceeds the safety limit/
	)
})
