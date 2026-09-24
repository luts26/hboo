import test from 'node:test'
import assert from 'node:assert/strict'

import {
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
