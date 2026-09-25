import test from 'node:test'
import assert from 'node:assert/strict'

import PlanningLocalRepository from '../hbapp/services/PlanningLocalRepository.js'
import {calculatePlanVsFact} from '../hbapp/services/PlanVsFactService.js'

class LocalStorageMock {
	constructor() {
		this.data = new Map()
	}

	getItem(key) {
		return this.data.has(key) ? this.data.get(key) : null
	}

	setItem(key, value) {
		this.data.set(key, String(value))
	}

	removeItem(key) {
		this.data.delete(key)
	}

	clear() {
		this.data.clear()
	}
}

globalThis.localStorage = new LocalStorageMock()

test('manual completion actualAmount survives local persistence and feeds Plan vs Fact', async () => {
	localStorage.clear()
	const repository = new PlanningLocalRepository({storageKey: 'manual-completion-test'})
	const created = await repository.createItem({
		sum: 500,
		title: 'Cash groceries',
		desc: 'Cash groceries',
		actualAmount: null,
		status: 'pending'
	})

	await repository.updateItem(created.id, {
		status: 'completed',
		actualAmount: 424.5
	})

	const restoredRepository = new PlanningLocalRepository({storageKey: 'manual-completion-test'})
	const state = await restoredRepository.getPlanningState()
	const restoredItem = state.items.find(item => item.id === created.id)
	const planVsFact = calculatePlanVsFact(state.items)

	assert.equal(restoredItem.status, 'completed')
	assert.equal(restoredItem.actualAmount, 424.5)
	assert.equal(planVsFact.summary.comparableCount, 1)
	assert.equal(planVsFact.summary.difference, 75.5)
	assert.equal(planVsFact.items[0].result, 'under')
})

test('manual completion can persist legitimate zero actual amount', async () => {
	localStorage.clear()
	const repository = new PlanningLocalRepository({storageKey: 'manual-completion-zero-test'})
	const created = await repository.createItem({
		sum: 50,
		title: 'Covered expense',
		actualAmount: null,
		status: 'pending'
	})

	await repository.updateItem(created.id, {
		status: 'completed',
		actualAmount: 0
	})

	const state = await repository.getPlanningState()
	const planVsFact = calculatePlanVsFact(state.items)

	assert.equal(state.items[0].actualAmount, 0)
	assert.equal(planVsFact.summary.comparableCount, 1)
	assert.equal(planVsFact.items[0].actualAmount, 0)
})
