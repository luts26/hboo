import test from 'node:test'
import assert from 'node:assert/strict'

import {
	buildForecastFromStates,
	getMissingLinkedStateItemIds,
	mapForecastInput
} from '../hbapp/services/FinancialForecastAdapter.js'

const dayStart = (year, monthIndex, day) => new Date(year, monthIndex, day, 0, 0, 0, 0).getTime()
const dayEnd = (year, monthIndex, day) => new Date(year, monthIndex, day, 23, 59, 59, 999).getTime()

const planningState = ({
	items = [],
	transactionLinks = {},
	currentPeriod = {
		id: 'period-1',
		dateFrom: dayStart(2026, 9, 1),
		dateTo: dayEnd(2026, 9, 31),
		periodBudget: 20000
	}
} = {}) => ({
	planningItems: items,
	currentPeriod,
	transactionLinks
})

const balanceState = (amount = 1000) => ({
	data: {
		mono: [{
			balance: amount * 100,
			credit_limit: 0,
			currency_code: 980,
			date: Math.floor(dayStart(2026, 9, 12) / 1000)
		}],
		privat: []
	},
	updatedAt: dayStart(2026, 9, 12)
})

const item = ({id = '101', status = 'pending', amount = 300} = {}) => ({
	id,
	periodId: 'period-1',
	title: `Expense ${id}`,
	sum: amount,
	status,
	date: dayStart(2026, 9, 14),
	dateSource: 'user',
	createdAt: dayStart(2026, 9, 1)
})

test('adapter marks missing persisted pending link state as unknown', () => {
	const input = mapForecastInput({
		planningState: planningState({items: [item({id: '101'})]}),
		balanceState: balanceState(),
		now: new Date(2026, 9, 12, 10)
	})

	assert.equal(input.transactionLinks['101'].linkStateKnown, false)
	assert.equal(input.transactionLinks['101'].remainingAmount, null)
})

test('adapter does not require link hydration for temporary local planning items', () => {
	const state = planningState({items: [item({id: 'local-1'})]})

	assert.deepEqual(getMissingLinkedStateItemIds(state), [])
	assert.equal(mapForecastInput({planningState: state}).transactionLinks['local-1'], undefined)
})

test('adapter requests hydration retry for failed link states', () => {
	const state = planningState({
		items: [item({id: '101'})],
		transactionLinks: {
			101: {
				error: {message: 'offline'},
				linkedTransactions: [],
				linkedAmount: 0,
				remainingAmount: null
			}
		}
	})

	assert.deepEqual(getMissingLinkedStateItemIds(state), ['101'])
})

test('forecast from states excludes unknown link state from projection', () => {
	const result = buildForecastFromStates({
		planningState: planningState({items: [item({id: '101', amount: 300})]}),
		balanceState: balanceState(1000),
		now: new Date(2026, 9, 12, 10)
	})

	assert.equal(result.scheduledExpenses, 0)
	assert.equal(result.projectedEndingBalance, 1000)
	assert.equal(result.ambiguous[0].reason, 'transaction_link_state_unavailable')
})

test('adapter preserves loaded remainingAmount for linked planning items', () => {
	const result = buildForecastFromStates({
		planningState: planningState({
			items: [item({id: '101', amount: 300})],
			transactionLinks: {
				101: {
					linkedTransactions: [{provider: 'mono', providerTransactionId: 'tx-1'}],
					linkedAmount: 125,
					remainingAmount: 175
				}
			}
		}),
		balanceState: balanceState(1000),
		now: new Date(2026, 9, 12, 10)
	})

	assert.equal(result.scheduledExpenses, 175)
	assert.equal(result.projectedEndingBalance, 825)
	assert.equal(result.events[0].reason, 'partial_remaining_amount')
})
