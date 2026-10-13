import test from 'node:test'
import assert from 'node:assert/strict'

import {
	buildFinancialForecast,
	validateRange
} from '../hbapp/services/FinancialForecastService.js'

const ts = (year, monthIndex, day, hour = 12, minute = 0) => {
	return new Date(year, monthIndex, day, hour, minute, 0, 0).getTime()
}

const dayStart = (year, monthIndex, day) => new Date(year, monthIndex, day, 0, 0, 0, 0).getTime()
const dayEnd = (year, monthIndex, day) => new Date(year, monthIndex, day, 23, 59, 59, 999).getTime()

const balance = (amount = 1000, date = ts(2026, 9, 12)) => ({
	mono: [{
		balance: amount * 100,
		credit_limit: 0,
		currency_code: 980,
		date: Math.floor(date / 1000),
		c_id: 'mono-main'
	}],
	privat: []
})

const period = (from = dayStart(2026, 9, 1), to = dayEnd(2026, 9, 31)) => ({
	id: 'period-1',
	dateFrom: from,
	dateTo: to,
	periodBudget: 20000
})

const item = ({
	id = 'item-1',
	amount = 100,
	date = dayStart(2026, 9, 14),
	dateSource = 'user',
	status = 'pending',
	createdAt = dayStart(2026, 9, 1),
	...patch
} = {}) => ({
	id,
	periodId: 'period-1',
	title: `Expense ${id}`,
	sum: amount,
	status,
	date,
	...(dateSource === undefined ? {} : {dateSource}),
	createdAt,
	...patch
})

test('forecast with no planned expenses preserves starting balance', () => {
	const result = buildFinancialForecast({
		balance: balance(1000),
		planningItems: [],
		period: period(),
		now: new Date(2026, 9, 12, 10)
	})

	assert.equal(result.startingBalance, 1000)
	assert.equal(result.scheduledExpenses, 0)
	assert.equal(result.projectedEndingBalance, 1000)
	assert.equal(result.daily.length, 20)
	assert.equal(result.warnings.length, 0)
})

test('one future expense is deducted on its scheduled local date', () => {
	const result = buildFinancialForecast({
		balance: balance(1000),
		planningItems: [item({amount: 125.25, date: dayStart(2026, 9, 14)})],
		period: period(),
		now: new Date(2026, 9, 12, 10)
	})

	const targetDay = result.daily.find(day => day.dateKey === '2026-10-14')
	assert.equal(result.scheduledExpenses, 125.25)
	assert.equal(result.projectedEndingBalance, 874.75)
	assert.equal(targetDay.expenses, 125.25)
	assert.equal(targetDay.closingBalance, 874.75)
})

test('multiple future expenses are sorted and accumulated', () => {
	const result = buildFinancialForecast({
		balance: balance(1000),
		planningItems: [
			item({id: 'b', amount: 200, date: dayStart(2026, 9, 16)}),
			item({id: 'a', amount: 100, date: dayStart(2026, 9, 14)})
		],
		period: period(),
		now: new Date(2026, 9, 12, 10)
	})

	assert.deepEqual(result.events.map(event => event.planningItemId), ['a', 'b'])
	assert.equal(result.projectedEndingBalance, 700)
	assert.equal(result.minimumProjectedBalance, 700)
	assert.equal(new Date(result.minimumProjectedBalanceDate).getDate(), 16)
})

test('completed and cancelled planning items are excluded', () => {
	const result = buildFinancialForecast({
		balance: balance(1000),
		planningItems: [
			item({id: 'done', amount: 100, status: 'completed'}),
			item({id: 'cancel', amount: 100, status: 'cancelled'})
		],
		period: period(),
		now: new Date(2026, 9, 12, 10)
	})

	assert.equal(result.events.length, 0)
	assert.deepEqual(result.excluded.map(entry => entry.reason), ['completed', 'cancelled'])
	assert.equal(result.projectedEndingBalance, 1000)
})

test('internal transfer and savings planning items are excluded from expense forecast', () => {
	const result = buildFinancialForecast({
		balance: balance(1000),
		planningItems: [
			item({id: 'transfer', amount: 100, categoryId: 1}),
			item({id: 'savings', amount: 100, typeStr: 'savings'})
		],
		period: period(),
		now: new Date(2026, 9, 12, 10)
	})

	assert.equal(result.events.length, 0)
	assert.deepEqual(result.excluded.map(entry => entry.reason), [
		'internal_transfer_or_savings',
		'internal_transfer_or_savings'
	])
	assert.equal(result.projectedEndingBalance, 1000)
})

test('pending linked transaction with zero remaining amount is excluded to avoid double counting', () => {
	const result = buildFinancialForecast({
		balance: balance(1000),
		planningItems: [item({id: 'linked', amount: 300})],
		transactionLinks: {
			linked: {
				linkedTransactions: [{provider: 'mono', providerTransactionId: 'tx-1'}],
				linkedAmount: 300,
				remainingAmount: 0
			}
		},
		period: period(),
		now: new Date(2026, 9, 12, 10)
	})

	assert.equal(result.events.length, 0)
	assert.equal(result.excluded[0].reason, 'linked_transaction_accounted')
	assert.equal(result.projectedEndingBalance, 1000)
})

test('pending linked transaction with reliable remaining amount forecasts only unpaid remainder', () => {
	const result = buildFinancialForecast({
		balance: balance(1000),
		planningItems: [item({id: 'partial', amount: 300, date: dayStart(2026, 9, 20)})],
		transactionLinks: {
			partial: {
				linkedTransactions: [{provider: 'mono', providerTransactionId: 'tx-1'}],
				linkedAmount: 120,
				remainingAmount: 180
			}
		},
		period: period(),
		now: new Date(2026, 9, 12, 10)
	})

	assert.equal(result.events.length, 1)
	assert.equal(result.events[0].amount, 180)
	assert.equal(result.events[0].reason, 'partial_remaining_amount')
	assert.equal(result.projectedEndingBalance, 820)
})

test('linked pending item without reliable remaining amount is ambiguous', () => {
	const result = buildFinancialForecast({
		balance: balance(1000),
		planningItems: [item({id: 'unclear', amount: 300})],
		transactionLinks: {
			unclear: {
				linkedTransactions: [{provider: 'mono', providerTransactionId: 'tx-1'}],
				linkedAmount: 120
			}
		},
		period: period(),
		now: new Date(2026, 9, 12, 10)
	})

	assert.equal(result.events.length, 0)
	assert.equal(result.ambiguous[0].reason, 'linked_transaction_without_reliable_remaining_amount')
})

test('pending item with unknown transaction link state is ambiguous', () => {
	const result = buildFinancialForecast({
		balance: balance(1000),
		planningItems: [item({id: 'unknown-link', amount: 300})],
		transactionLinks: {
			'unknown-link': {
				linkStateKnown: false,
				linkedTransactions: [],
				linkedAmount: 0,
				remainingAmount: null
			}
		},
		period: period(),
		now: new Date(2026, 9, 12, 10)
	})

	assert.equal(result.events.length, 0)
	assert.equal(result.scheduledExpenses, 0)
	assert.equal(result.projectedEndingBalance, 1000)
	assert.equal(result.ambiguous[0].reason, 'transaction_link_state_unavailable')
})

test('pending item with failed transaction link load is ambiguous', () => {
	const result = buildFinancialForecast({
		balance: balance(1000),
		planningItems: [item({id: 'link-error', amount: 300})],
		transactionLinks: {
			'link-error': {
				error: {message: 'offline'},
				linkedTransactions: [],
				linkedAmount: 0,
				remainingAmount: null
			}
		},
		period: period(),
		now: new Date(2026, 9, 12, 10)
	})

	assert.equal(result.events.length, 0)
	assert.equal(result.ambiguous[0].reason, 'transaction_link_state_unavailable')
})

test('missing planning date is ambiguous and no date is invented', () => {
	const result = buildFinancialForecast({
		balance: balance(1000),
		planningItems: [item({id: 'missing-date', amount: 50, date: null, createdAt: null})],
		period: period(),
		now: new Date(2026, 9, 12, 10)
	})

	assert.equal(result.events.length, 0)
	assert.equal(result.ambiguous[0].reason, 'missing_or_unreliable_date')
})

test('generated fallback-like planning date is ambiguous when distinguishable', () => {
	const fallbackDate = dayStart(2026, 9, 12)
	const result = buildFinancialForecast({
		balance: balance(1000),
		planningItems: [item({id: 'fallback-date', amount: 50, date: fallbackDate, dateSource: 'fallback', createdAt: fallbackDate})],
		period: period(),
		now: new Date(2026, 9, 12, 10)
	})

	assert.equal(result.events.length, 0)
	assert.equal(result.ambiguous[0].reason, 'generated_fallback_date')
})

test('date equal to createdAt remains reliable with explicit user date source', () => {
	const date = dayStart(2026, 9, 14)
	const result = buildFinancialForecast({
		balance: balance(1000),
		planningItems: [item({id: 'confirmed', amount: 50, date, dateSource: 'user', createdAt: date})],
		period: period(),
		now: new Date(2026, 9, 12, 10)
	})

	assert.equal(result.events.length, 1)
	assert.equal(result.events[0].planningItemId, 'confirmed')
	assert.equal(result.projectedEndingBalance, 950)
})

test('date equal to createdAt without provenance remains ambiguous', () => {
	const date = dayStart(2026, 9, 14)
	const result = buildFinancialForecast({
		balance: balance(1000),
		planningItems: [item({id: 'legacy', amount: 50, date, dateSource: null, createdAt: date})],
		period: period(),
		now: new Date(2026, 9, 12, 10)
	})

	assert.equal(result.events.length, 0)
	assert.equal(result.ambiguous[0].reason, 'missing_or_unreliable_date')
})

test('explicit server planned date remains reliable', () => {
	const result = buildFinancialForecast({
		balance: balance(1000),
		planningItems: [item({
			id: 'server-planned',
			amount: 75,
			date: null,
			dateSource: null,
			planned_at: '2026-10-15'
		})],
		period: period(),
		now: new Date(2026, 9, 12, 10)
	})

	assert.equal(result.events.length, 1)
	assert.equal(result.events[0].planningItemId, 'server-planned')
	assert.equal(result.events[0].dateKey, '2026-10-15')
})

test('overdue pending expense is reported explicitly instead of silently dropped', () => {
	const result = buildFinancialForecast({
		balance: balance(1000),
		planningItems: [item({id: 'overdue', amount: 75, date: dayStart(2026, 9, 10)})],
		period: period(),
		now: new Date(2026, 9, 12, 10)
	})

	assert.equal(result.events.length, 0)
	assert.equal(result.ambiguous[0].reason, 'overdue_pending')
})

test('negative projected balance produces warnings', () => {
	const result = buildFinancialForecast({
		balance: balance(100),
		planningItems: [item({id: 'large', amount: 150, date: dayStart(2026, 9, 14)})],
		period: period(),
		now: new Date(2026, 9, 12, 10)
	})

	assert.equal(result.projectedEndingBalance, -50)
	assert.equal(result.minimumProjectedBalance, -50)
	assert.equal(result.warnings[0].type, 'negative_balance')
	assert.equal(result.warnings[0].dateKey, '2026-10-14')
})

test('next-7 range includes exactly seven local calendar days', () => {
	const result = buildFinancialForecast({
		balance: balance(1000),
		planningItems: [
			item({id: 'inside', amount: 10, date: dayStart(2026, 9, 18)}),
			item({id: 'outside', amount: 10, date: dayStart(2026, 9, 19)})
		],
		period: period(),
		rangePreset: 'next-7',
		now: new Date(2026, 9, 12, 10)
	})

	assert.equal(result.daily.length, 7)
	assert.equal(result.daily[0].dateKey, '2026-10-12')
	assert.equal(result.daily[6].dateKey, '2026-10-18')
	assert.deepEqual(result.events.map(event => event.planningItemId), ['inside'])
	assert.equal(result.excluded.find(entry => entry.planningItemId === 'outside').reason, 'outside_forecast_range')
})

test('DST-sensitive daily timeline progresses by local calendar days', () => {
	const result = buildFinancialForecast({
		balance: balance(1000, ts(2026, 2, 28)),
		planningItems: [item({
			id: 'dst',
			amount: 10,
			date: dayStart(2026, 2, 29),
			createdAt: dayStart(2026, 2, 1)
		})],
		range: {
			dateFrom: dayStart(2026, 2, 28),
			dateTo: dayEnd(2026, 2, 30)
		},
		now: new Date(2026, 2, 28, 10)
	})

	assert.deepEqual(result.daily.map(day => day.dateKey), ['2026-03-28', '2026-03-29', '2026-03-30'])
	assert.equal(result.daily.find(day => day.dateKey === '2026-03-29').expenses, 10)
})

test('monetary precision uses cents arithmetic', () => {
	const result = buildFinancialForecast({
		balance: balance(1000),
		planningItems: [
			item({id: 'p1', amount: 0.1, date: dayStart(2026, 9, 14)}),
			item({id: 'p2', amount: 0.2, date: dayStart(2026, 9, 15)})
		],
		period: period(),
		now: new Date(2026, 9, 12, 10)
	})

	assert.equal(result.scheduledExpenses, 0.3)
	assert.equal(result.projectedEndingBalance, 999.7)
})

test('invalid ranges are rejected', () => {
	assert.throws(() => validateRange({
		dateFrom: dayStart(2026, 9, 20),
		dateTo: dayEnd(2026, 9, 19)
	}), /dateTo/)

	assert.throws(() => buildFinancialForecast({
		balance: balance(1000),
		period: period(dayStart(2026, 0, 1), dayEnd(2027, 2, 1)),
		now: new Date(2026, 0, 1)
	}), /cannot exceed/)
})

test('incompatible currency accounts are excluded from starting balance', () => {
	const result = buildFinancialForecast({
		balance: {
			mono: [
				{balance: 100000, credit_limit: 0, currency_code: 980, date: Math.floor(ts(2026, 9, 12) / 1000)},
				{balance: 50000, credit_limit: 0, currency_code: 840, date: Math.floor(ts(2026, 9, 12) / 1000)}
			],
			privat: []
		},
		planningItems: [],
		period: period(),
		now: new Date(2026, 9, 12, 10)
	})

	assert.equal(result.startingBalance, 1000)
	assert.equal(result.balance.excludedAccounts[0].reason, 'incompatible_currency')
})

test('forecast does not mutate input data', () => {
	const input = {
		balance: balance(1000),
		planningItems: [item({id: 'immutable', amount: 100, date: dayStart(2026, 9, 14)})],
		transactionLinks: {}
	}
	const before = JSON.stringify(input)

	buildFinancialForecast({
		...input,
		period: period(),
		now: new Date(2026, 9, 12, 10)
	})

	assert.equal(JSON.stringify(input), before)
})
