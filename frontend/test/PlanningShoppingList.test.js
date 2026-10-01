import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import PlanningLocalRepository from '../hbapp/services/PlanningLocalRepository.js'
import {loadProductsForSuggestions, searchProductsFromCache} from '../hbapp/services/ProductSearchService.js'
import {
	applySelectedShoppingProduct,
	buildShoppingItemFromFormData,
	getShoppingItemEditorData,
	renderShoppingProductSuggestions,
	syncShoppingProductIdentityFromNameInput
} from '../hbapp/services/PlanningShoppingListUiService.js'
import {PlanningStore} from '../hbapp/stores/PlanningStore.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.join(__dirname, '..')
const read = relativePath => fs.readFileSync(path.join(frontendRoot, relativePath), 'utf8')

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

class FakeQueue {
	constructor() {
		this.operation = null
	}

	async enqueue({reason = 'local-change'} = {}) {
		this.operation = {
			operationId: 'planning.syncState:user:1',
			status: 'pending',
			reason,
			nextAttemptAt: Date.now()
		}
		return this.operation
	}

	async getOperation() {
		return this.operation
	}

	async markSyncing(operation) {
		this.operation = {...operation, status: 'syncing'}
		return this.operation
	}

	async complete() {
		this.operation = null
		return true
	}

	async markError(operation, error) {
		this.operation = {...operation, status: 'error', lastError: error}
		return this.operation
	}
}

class FakeApi {
	constructor() {
		this.period = null
		this.items = []
		this.nextPeriodId = 10
		this.nextItemId = 100
		this.nextShoppingItemId = 1000
		this.createItemCalls = 0
	}

	async getCurrentPeriod() {
		if (!this.period) {
			const error = new Error('Planning period not found')
			error.status = 404
			throw error
		}
		return structuredClone(this.period)
	}

	async getPeriodItems() {
		return structuredClone(this.items)
	}

	async getPeriodStatistics() {
		return null
	}

	async createPeriod(period) {
		this.period = {
			id: this.nextPeriodId++,
			startDate: '2026-10-01',
			endDate: '2026-10-31',
			budgetAmount: period.periodBudget || 0,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		}
		return structuredClone(this.period)
	}

	async updatePeriod(period) {
		this.period = {...this.period, ...period}
		return structuredClone(this.period)
	}

	async createItem(item, periodId) {
		this.createItemCalls += 1
		const created = this.persistItem({...item, id: this.nextItemId++, periodId})
		this.items.push(created)
		return structuredClone(created)
	}

	async updateItem(item) {
		const updated = this.persistItem(item)
		this.items = this.items.map(current => String(current.id) === String(updated.id) ? updated : current)
		return structuredClone(updated)
	}

	async deleteItem(itemId) {
		this.items = this.items.filter(item => String(item.id) !== String(itemId))
		return {deleted: true}
	}

	persistItem(item) {
		const shoppingItems = (item.shoppingItems || item.checklist || []).map((shoppingItem, index) => ({
			id: Number.isFinite(Number(shoppingItem.serverId ?? shoppingItem.id)) && !String(shoppingItem.id).includes('-')
				? Number(shoppingItem.serverId ?? shoppingItem.id)
				: this.nextShoppingItemId++,
			localId: shoppingItem.localId || shoppingItem.id,
			planningItemId: Number(item.id),
			productId: shoppingItem.productId ? Number(shoppingItem.productId) : null,
			name: shoppingItem.name || shoppingItem.title,
			amount: shoppingItem.amount ?? null,
			unit: shoppingItem.unit || null,
			checked: Boolean(shoppingItem.checked),
			position: Number.isFinite(Number(shoppingItem.position)) ? Number(shoppingItem.position) : index,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		}))

		return {
			...item,
			periodId: Number(item.periodId),
			shoppingItems,
			createdAt: item.createdAt || new Date().toISOString(),
			updatedAt: new Date().toISOString()
		}
	}
}

class FakeNetwork {
	isOffline() {
		return false
	}
}

globalThis.localStorage = new LocalStorageMock()

test('planning shopping items persist locally with free text, product id, checked state and order', async () => {
	localStorage.clear()
	const repository = new PlanningLocalRepository({storageKey: 'shopping-list-local-test'})
	const item = await repository.createItem({
		sum: 500,
		title: 'Groceries',
		shoppingItems: [
			{localId: 'shopping-bread', name: 'Хліб', productId: 7, checked: false, position: 0},
			{localId: 'shopping-tea', name: 'щось до чаю', productId: null, amount: null, unit: null, checked: true, position: 1}
		]
	})

	const restored = await new PlanningLocalRepository({storageKey: 'shopping-list-local-test'}).getPlanningState()
	const restoredItem = restored.items.find(candidate => candidate.id === item.id)

	assert.equal(restoredItem.shoppingItems[0].productId, 7)
	assert.equal(restoredItem.shoppingItems[1].productId, null)
	assert.equal(restoredItem.shoppingItems[1].amount, null)
	assert.equal(restoredItem.shoppingItems[1].unit, null)
	assert.equal(restoredItem.shoppingItems[1].checked, true)
	assert.deepEqual(restoredItem.shoppingItems.map(shoppingItem => shoppingItem.name), ['Хліб', 'щось до чаю'])
})

test('legacy checklist migrates idempotently into planning shopping items', async () => {
	localStorage.clear()
	localStorage.setItem('legacy-shopping', JSON.stringify({
		version: 2,
		currentPeriodId: 'period-1',
		periods: [{id: 'period-1', dateFrom: Date.now(), dateTo: Date.now(), periodBudget: 1000}],
		items: [{
			id: 'item-1',
			periodId: 'period-1',
			sum: 100,
			title: 'Groceries',
			checklist: [{id: 'checklist-1', title: 'Молоко', checked: true}]
		}],
		deletedItemIds: [],
		dirty: false
	}))

	const first = await new PlanningLocalRepository({storageKey: 'legacy-shopping'}).getPlanningState()
	const second = await new PlanningLocalRepository({storageKey: 'legacy-shopping'}).getPlanningState()

	assert.equal(first.items[0].shoppingItems.length, 1)
	assert.equal(second.items[0].shoppingItems.length, 1)
	assert.equal(second.items[0].shoppingItems[0].name, 'Молоко')
	assert.equal(second.items[0].shoppingItems[0].checked, true)
})

test('offline shopping edits survive reload and synced create is coalesced into one server row', async () => {
	localStorage.clear()
	const repository = new PlanningLocalRepository({storageKey: 'shopping-sync-test'})
	const api = new FakeApi()
	const store = new PlanningStore({
		repository,
		apiService: api,
		syncQueue: new FakeQueue(),
		balanceRepository: {get: () => ({data: null})},
		transactionRepository: {get: () => ({data: null})},
		autoRegisterSyncTriggers: false
	})
	store.isOffline = () => true

	await store.load({force: true})
	await store.createPlanningItem({sum: 300, title: 'Groceries', shoppingItems: []})
	const itemId = store.getState().planningItems[0].id
	await store.updatePlanningShoppingItems(itemId, [{localId: 'shopping-1', name: 'Молоко', productId: 2, checked: false, position: 0}], {reason: 'shopping-create'})
	await store.updatePlanningShoppingItems(itemId, [{localId: 'shopping-1', name: 'Молоко 2 л', productId: 2, checked: true, position: 0}], {reason: 'shopping-edit'})

	const restored = await new PlanningLocalRepository({storageKey: 'shopping-sync-test'}).getPlanningState()
	assert.equal(restored.items[0].shoppingItems[0].name, 'Молоко 2 л')
	assert.equal(restored.items[0].shoppingItems[0].checked, true)

	store.isOffline = () => false
	await store.processSyncQueue({force: true, ignoreOffline: true})
	await store.processSyncQueue({force: true, ignoreOffline: true})

	assert.equal(api.createItemCalls, 1)
	assert.equal(api.items.length, 1)
	assert.equal(api.items[0].shoppingItems.length, 1)
	assert.equal(api.items[0].shoppingItems[0].name, 'Молоко 2 л')
})

test('existing product cache suggestions work offline without forcing product selection', () => {
	const products = [
		{id: 1, name: 'Молоко', status: 'active'},
		{id: 2, name: 'Молоко безлактозне', status: 'active'},
		{id: 3, name: 'Помідори', status: 'active'}
	]

	assert.deepEqual(searchProductsFromCache(products, 'мол').map(product => product.id), [1, 2])
	assert.deepEqual(searchProductsFromCache(products, 'щось до чаю').map(product => product.id), [])
})

test('planning shopping input renders matching product suggestions without rerendering the modal', async () => {
	const products = [
		{id: 1, name: 'Молоко', categoryName: 'Молочні', status: 'active'},
		{id: 2, name: 'Молоко безлактозне', categoryName: 'Молочні', status: 'active'},
		{id: 3, name: 'Помідори', categoryName: 'Овочі', status: 'active'}
	]
	const matches = searchProductsFromCache(products, 'мол', {limit: 6})
	const html = renderShoppingProductSuggestions(matches)
	const planningSource = read('hbapp/pages/PlaningPage.js')

	assert.match(html, /Молоко/)
	assert.match(html, /Молоко безлактозне/)
	assert.doesNotMatch(html, /Помідори/)
	assert.match(planningSource, /container\.innerHTML = renderShoppingProductSuggestions/)
	assert.match(planningSource, /this\.bindShoppingItemEditors\(container\)/)
	assert.match(planningSource, /data-shopping-editor/)
	assert.match(planningSource, /input\.addEventListener\('input'/)
	assert.doesNotMatch(planningSource.match(/async updateShoppingSuggestions[\s\S]*?\n\t\}/)?.[0] || '', /this\.render\(/)
	assert.doesNotMatch(planningSource.match(/getChecklistSummaryTemplate[\s\S]*?\n\t\}/)?.[0] || '', /if \(!checklist\.length\) return ''/)
})

test('planning shopping suggestion selection stores product id and canonical product name in the form', async () => {
	const product = {id: 2, name: 'Молоко безлактозне', categoryName: 'Молочні', status: 'active'}
	const nameInput = {value: ''}
	const hiddenProductId = {value: ''}
	const suggestions = {innerHTML: '<button>Молоко безлактозне</button>'}
	const amountInput = {focused: false, focus() { this.focused = true }}
	const form = {
		querySelector: selector => {
			if (selector === '[name="name"]') return nameInput
			if (selector === '[name="productId"]') return hiddenProductId
			if (selector === '[data-shopping-suggestions]') return suggestions
			if (selector === '[name="amount"]') return amountInput
			return null
		}
	}

	applySelectedShoppingProduct(form, product)
	const shoppingItem = buildShoppingItemFromFormData({
		get: key => ({
			name: nameInput.value,
			productId: hiddenProductId.value,
			amount: '',
			unit: ''
		})[key]
	}, {createId: () => 'shopping-milk', position: 0, now: () => 100})

	assert.equal(nameInput.value, 'Молоко безлактозне')
	assert.equal(hiddenProductId.value, 2)
	assert.equal(suggestions.innerHTML, '')
	assert.equal(amountInput.focused, true)
	assert.equal(shoppingItem.productId, 2)
	assert.equal(shoppingItem.name, 'Молоко безлактозне')
})

test('planning shopping arbitrary free text keeps product id null', () => {
	const shoppingItem = buildShoppingItemFromFormData({
		get: key => ({
			name: 'щось до чаю',
			productId: '',
			amount: '',
			unit: ''
		})[key]
	}, {createId: () => 'shopping-free-text', position: 3, now: () => 100})

	assert.equal(shoppingItem.productId, null)
	assert.equal(shoppingItem.name, 'щось до чаю')
	assert.equal(shoppingItem.position, 3)
})

test('planning modal shopping row serializes selected product identity, amount and unit', () => {
	const row = {
		dataset: {
			checklistId: 'shopping-row-1',
			shoppingId: 'shopping-row-1',
			shoppingLocalId: 'shopping-row-1',
			shoppingServerId: '',
			checklistChecked: 'false',
			shoppingCreatedAt: '100'
		},
		querySelector: selector => {
			if (selector === '[name="name"]') return {value: 'Молоко'}
			if (selector === '[name="productId"]') return {value: '2'}
			if (selector === '[name="amount"]') return {value: '1.5'}
			if (selector === '[name="unit"]') return {value: 'l'}
			return null
		}
	}

	const item = getShoppingItemEditorData(row, {createId: () => 'unused', position: 0, now: () => 200})

	assert.equal(item.localId, 'shopping-row-1')
	assert.equal(item.productId, '2')
	assert.equal(item.name, 'Молоко')
	assert.equal(item.amount, 1.5)
	assert.equal(item.unit, 'l')
	assert.equal(item.checked, false)
	assert.equal(item.createdAt, 100)
})

test('editing selected product text clears stale product id before serialization', () => {
	const productIdInput = {value: '2'}
	const editor = {
		querySelector: selector => selector === '[name="productId"]' ? productIdInput : null
	}
	const input = {
		value: 'Молоко 2 л',
		dataset: {selectedProductName: 'Молоко'},
		closest: selector => selector === '[data-shopping-editor]' ? editor : null
	}

	syncShoppingProductIdentityFromNameInput(input)

	assert.equal(productIdInput.value, '')
	assert.equal(input.dataset.selectedProductName, '')
})

test('planning product suggestions load from IndexedDB cache without API refresh when offline cache exists', async () => {
	const indexedDbClient = {
		async getAll(storeName) {
			assert.equal(storeName, 'products')
			return [
				{id: 1, name: 'Молоко', status: 'active'},
				{id: 2, name: 'Помідори', status: 'active'}
			]
		}
	}
	const apiService = {
		async loadCatalog() {
			throw new Error('API must not be called when cache has products')
		}
	}

	const products = await loadProductsForSuggestions({indexedDbClient, apiService})

	assert.deepEqual(products.map(product => product.name), ['Молоко', 'Помідори'])
	assert.deepEqual(searchProductsFromCache(products, 'мол').map(product => product.id), [1])
})
