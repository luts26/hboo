import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import PlanningLocalRepository from '../hbapp/services/PlanningLocalRepository.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(__dirname, '..')
const read = filePath => fs.readFileSync(path.join(frontendRoot, filePath), 'utf8')

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

const dayStart = (year, monthIndex, day) => new Date(year, monthIndex, day, 0, 0, 0, 0).getTime()

test('repository preserves user dateSource for new planning item', async () => {
	localStorage.clear()
	const repository = new PlanningLocalRepository({storageKey: 'date-source-new'})
	const date = dayStart(2026, 9, 14)

	const created = await repository.createItem({
		sum: 500,
		title: 'Confirmed expense',
		date,
		dateSource: 'user'
	})
	const restored = await new PlanningLocalRepository({storageKey: 'date-source-new'}).getPlanningState()

	assert.equal(created.dateSource, 'user')
	assert.equal(restored.items[0].dateSource, 'user')
	assert.equal(restored.items[0].date, date)
})

test('repository stores server dateSource when planned_at is explicit', async () => {
	localStorage.clear()
	const repository = new PlanningLocalRepository({storageKey: 'date-source-server'})

	await repository.replaceFromServer({
		period: {
			id: 'period-1',
			dateFrom: dayStart(2026, 9, 1),
			dateTo: dayStart(2026, 9, 31),
			periodBudget: 10000
		},
		items: [{
			id: 101,
			period_id: 'period-1',
			title: 'Server expense',
			planned_amount: 300,
			status: 'pending',
			planned_at: '2026-10-15'
		}]
	})
	const restored = await repository.getPlanningState()

	assert.equal(restored.items[0].dateSource, 'server')
	assert.equal(restored.items[0].date, dayStart(2026, 9, 15))
})

test('repository marks generated item date as fallback when no date is supplied', async () => {
	localStorage.clear()
	const repository = new PlanningLocalRepository({storageKey: 'date-source-fallback'})

	const created = await repository.createItem({
		sum: 100,
		title: 'Fallback expense'
	})

	assert.equal(created.dateSource, 'fallback')
})

test('unrelated edit does not silently confirm legacy date', async () => {
	localStorage.clear()
	const repository = new PlanningLocalRepository({storageKey: 'date-source-legacy'})
	const date = dayStart(2026, 9, 14)
	const created = await repository.createItem({
		sum: 100,
		title: 'Legacy expense',
		date,
		dateSource: 'fallback'
	})

	await repository.updateItem(created.id, {
		title: 'Legacy expense renamed'
	})
	const restored = await repository.getPlanningState()

	assert.equal(restored.items[0].dateSource, 'fallback')
	assert.equal(restored.items[0].date, date)
})

test('edited item can be explicitly confirmed with user dateSource', async () => {
	localStorage.clear()
	const repository = new PlanningLocalRepository({storageKey: 'date-source-confirmed'})
	const date = dayStart(2026, 9, 14)
	const created = await repository.createItem({
		sum: 100,
		title: 'Legacy expense',
		date,
		dateSource: 'fallback'
	})

	await repository.updateItem(created.id, {
		date,
		dateSource: 'user'
	})
	const restored = await repository.getPlanningState()

	assert.equal(restored.items[0].dateSource, 'user')
})

test('Planning page sets dateSource only through create or explicit date confirmation', () => {
	const source = read('hbapp/pages/PlaningPage.js')

	assert.match(source, /dateSource: 'user'/)
	assert.match(source, /data-date-confirmed="false"/)
	assert.match(source, /form\.dataset\.dateConfirmed = 'true'/)
	assert.match(source, /if \(dateWasConfirmed \|\| dateWasChanged\) patch\.dateSource = 'user'/)
	assert.doesNotMatch(source, /patch\.dateSource = 'user'[\s\S]{0,120}title: currentItem/)
})
