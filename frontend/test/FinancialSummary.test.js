import test from 'node:test'
import assert from 'node:assert/strict'

import FinancialSummary from '../hbapp/components/FinancialSummary.js'

class TestElement {
	constructor() {
		this.innerHTML = ''
	}
}

test('sidebar transaction expenses use statistics accounting rules and exclude internal transfers', () => {
	const root = new TestElement()
	const summary = new FinancialSummary(root)
	const timestamp = new Date(2026, 9, 2, 12, 0, 0, 0).getTime()

	summary.render({
		periodBudget: 36000,
		isBudgetConfigured: true,
		transactionState: {
			data: {
				mono: [
					{providerTransactionId: 'transfer-out', timestamp, amount: -1200, categoryId: 1},
					{providerTransactionId: 'expense-out', timestamp, amount: -5134.45, categoryId: 3}
				],
				privat: []
			}
		}
	})

	assert.match(root.innerHTML, /Expenses/)
	assert.match(root.innerHTML, /-5 134\.45 грн/)
	assert.doesNotMatch(root.innerHTML, /-6 334\.45 грн/)
})
