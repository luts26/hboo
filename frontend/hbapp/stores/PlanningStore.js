import BalanceLocalRepository from '../services/BalanceLocalRepository.js'
import PlanningApiService from '../services/PlanningApiService.js'
import PlanningLocalRepository from '../services/PlanningLocalRepository.js'
import TransactionLocalRepository from '../services/TransactionLocalRepository.js'
import {calculateSummary, endOfDay, startOfDay} from '../services/PlanningCalculator.js'

const getDefaultPeriod = () => {
	const now = new Date()
	return {
		id: null,
		dateFrom: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)),
		dateTo: endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
		periodBudget: 0,
		status: 'active',
		createdAt: Date.now(),
		updatedAt: Date.now()
	}
}

const isTemporaryId = id => String(id || '').includes('-')

const toDateKey = value => {
	const date = new Date(Number(value))
	return [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, '0'),
		String(date.getDate()).padStart(2, '0')
	].join('-')
}

const toAmount = value => {
	if (value === null || value === undefined || value === '') return null
	const amount = Number(value)
	return Number.isFinite(amount) ? Math.round((amount + Number.EPSILON) * 100) / 100 : null
}

const normalizeComparableItem = item => ({
	categoryId: item.categoryId ? String(item.categoryId) : null,
	title: item.title || item.desc || 'Planning expense',
	description: item.desc || '',
	plannedAmount: toAmount(item.sum) || 0,
	actualAmount: toAmount(item.actualAmount),
	status: item.status || 'pending',
	plannedAt: toDateKey(item.date || Date.now()),
	transactionId: item.transactionId || null
})

const normalizeComparablePeriod = period => ({
	startDate: toDateKey(period?.dateFrom || Date.now()),
	endDate: toDateKey(period?.dateTo || Date.now()),
	budgetAmount: toAmount(period?.periodBudget) || 0
})

const isPlanningItemChanged = (current, snapshot) => {
	const currentData = normalizeComparableItem(current)
	const snapshotData = normalizeComparableItem(snapshot)

	return currentData.categoryId !== snapshotData.categoryId
		|| currentData.title !== snapshotData.title
		|| currentData.description !== snapshotData.description
		|| currentData.plannedAmount !== snapshotData.plannedAmount
		|| currentData.actualAmount !== snapshotData.actualAmount
		|| currentData.status !== snapshotData.status
		|| currentData.plannedAt !== snapshotData.plannedAt
		|| currentData.transactionId !== snapshotData.transactionId
}

const isPlanningPeriodChanged = (current, snapshot) => {
	const currentData = normalizeComparablePeriod(current)
	const snapshotData = normalizeComparablePeriod(snapshot)

	return currentData.startDate !== snapshotData.startDate
		|| currentData.endDate !== snapshotData.endDate
		|| currentData.budgetAmount !== snapshotData.budgetAmount
}

const hasServerBackedItemPatch = (currentItem, patch = {}) => {
	const nextItem = {
		...currentItem,
		...patch
	}

	return isPlanningItemChanged(nextItem, currentItem)
}

const getStatisticsActualSpent = statistics => {
	const amount = Number(statistics?.actualSpent)
	return Number.isFinite(amount) ? amount : null
}

const getCurrentActualSpent = state => {
	if (!state.serverSnapshot?.period) return null
	if (isPlanningPeriodChanged(state.currentPeriod, state.serverSnapshot.period)) return null

	return getStatisticsActualSpent(state.serverSnapshot.statistics)
}

class PlanningStore {

	constructor() {
		this.repository = new PlanningLocalRepository()
		this.apiService = new PlanningApiService()
		this.balanceRepository = new BalanceLocalRepository()
		this.transactionRepository = new TransactionLocalRepository()
		this.listeners = new Set()
		this.loadPromise = null
		this.state = {
			balance: null,
			transactions: null,
			planningItems: [],
			periods: [],
			currentPeriodId: null,
			currentPeriod: getDefaultPeriod(),
			period: getDefaultPeriod(),
			serverSnapshot: null,
			deletedItemIds: [],
			summary: null,
			loading: false,
			saving: false,
			loaded: false,
			dirty: false,
			source: 'cache',
			stale: false,
			error: null,
			saveError: null,
			lastUpdated: null
		}
	}

	getState() {
		return {
			...this.state,
			currentPeriod: {...this.state.currentPeriod},
			period: {...this.state.currentPeriod},
			periods: [...this.state.periods],
			planningItems: [...this.state.planningItems],
			deletedItemIds: [...this.state.deletedItemIds]
		}
	}

	subscribe(listener) {
		if (typeof listener !== 'function') return () => {}
		this.listeners.add(listener)
		listener(this.getState())
		return () => this.listeners.delete(listener)
	}

	notify() {
		const state = this.getState()
		this.listeners.forEach(listener => listener(state))
	}

	setState(patch) {
		this.state = {
			...this.state,
			...patch
		}
		this.notify()
	}

	applyPlanningState(planningState, patch = {}) {
		this.state = {
			...this.state,
			periods: planningState.periods,
			currentPeriodId: planningState.currentPeriodId,
			currentPeriod: planningState.currentPeriod || getDefaultPeriod(),
			period: planningState.currentPeriod || getDefaultPeriod(),
			planningItems: planningState.items,
			serverSnapshot: planningState.serverSnapshot || null,
			deletedItemIds: planningState.deletedItemIds || [],
			dirty: Boolean(planningState.dirty),
			...patch
		}
		this.updateSummary()
	}

	updateSummary() {
		const summary = {
			...calculateSummary({
				balance: this.state.balance,
				transactions: this.state.transactions,
				planningItems: this.state.planningItems,
				period: this.state.currentPeriod
			}),
			actualSpent: getCurrentActualSpent(this.state)
		}
		this.setState({summary})
	}

	getSummaryViewModel(state = this.state) {
		const summary = state.summary
		if (!summary) {
			return {
				currentBalance: 0,
				plannedExpenses: 0,
				pendingPlanningExpenses: 0,
				completedPlanningExpenses: 0,
				cancelledPlanningExpenses: 0,
				pendingPlanningCount: 0,
				completedPlanningCount: 0,
				cancelledPlanningCount: 0,
				totalPlanningCount: 0,
				totalPlannedExpenses: 0,
				planningStatusStats: {
					pending: {count: 0, amount: 0},
					completed: {count: 0, amount: 0},
					cancelled: {count: 0, amount: 0},
					total: {count: 0, amount: 0}
				},
				pendingExpenses: 0,
				freeAfterPlannedExpenses: null,
				remainingBudget: null,
				periodBudget: state.currentPeriod?.periodBudget || 0,
				isBudgetConfigured: false,
				targetDate: state.currentPeriod?.dateTo,
				daysLeft: 0,
				recommendedDailyLimit: null,
				todaySpent: 0,
				availableToday: null,
				actualSpent: getCurrentActualSpent(state),
				status: state.loading ? 'loading' : 'empty'
			}
		}

		const actualSpent = getCurrentActualSpent(state)

		return {
			currentBalance: summary.balance.current,
			plannedExpenses: summary.plannedAmount,
			pendingPlanningExpenses: summary.pendingSpending,
			completedPlanningExpenses: summary.completedSpending,
			cancelledPlanningExpenses: summary.cancelledSpending,
			approvedPlanningExpenses: summary.completedSpending,
			disabledPlanningExpenses: summary.cancelledSpending,
			pendingPlanningCount: summary.counters.pending.count,
			completedPlanningCount: summary.counters.completed.count,
			cancelledPlanningCount: summary.counters.cancelled.count,
			approvedPlanningCount: summary.counters.completed.count,
			disabledPlanningCount: summary.counters.cancelled.count,
			totalPlanningCount: summary.counters.total.count,
			totalPlannedExpenses: summary.plannedAmount,
			planningStatusStats: {
				pending: {count: summary.counters.pending.count, amount: summary.counters.pending.sum},
				completed: {count: summary.counters.completed.count, amount: summary.counters.completed.sum},
				cancelled: {count: summary.counters.cancelled.count, amount: summary.counters.cancelled.sum},
				approve: {count: summary.counters.completed.count, amount: summary.counters.completed.sum},
				disable: {count: summary.counters.cancelled.count, amount: summary.counters.cancelled.sum},
				total: {count: summary.counters.total.count, amount: summary.counters.total.sum}
			},
			pendingExpenses: summary.pendingSpending,
			freeAfterPlannedExpenses: summary.freeAmount,
			remainingBudget: summary.freeAmount,
			remainingAmount: summary.remainingAmount,
			reservedAmount: summary.reservedAmount,
			freeAmount: summary.freeAmount,
			periodBudget: summary.budget,
			isBudgetConfigured: summary.isBudgetConfigured,
			targetDate: state.currentPeriod.dateTo,
			daysLeft: summary.daysLeft,
			recommendedDailyLimit: summary.recommendedDailyLimit,
			todaySpent: summary.todaySpending,
			availableToday: summary.availableToday,
			actualSpent,
			status: state.error ? 'error' : 'ready'
		}
	}

	getCachedBankData() {
		return {
			balance: this.balanceRepository.get()?.data || null,
			transactions: this.transactionRepository.get()?.data || null
		}
	}

	async load({force = false} = {}) {
		if (this.loadPromise && !force) return this.loadPromise
		if (this.state.loaded && !force) return Promise.resolve(this.getState())

		this.setState({loading: true, error: null, saveError: null})
		this.loadPromise = this.fetchData()
			.finally(() => {
				this.loadPromise = null
			})

		return this.loadPromise
	}

	async refresh() {
		return this.load({force: true})
	}

	async fetchData() {
		const bankData = this.getCachedBankData()
		const cachedState = await this.repository.getPlanningState()

		this.applyPlanningState(cachedState, {
			balance: bankData.balance,
			transactions: bankData.transactions,
			loading: true,
			loaded: true,
			source: 'cache',
			stale: false,
			error: null,
			lastUpdated: Date.now()
		})

		try {
			const period = await this.apiService.getCurrentPeriod()
			const [items, statistics] = await Promise.all([
				this.apiService.getPeriodItems(period.id),
				this.apiService.getPeriodStatistics(period.id).catch(() => null)
			])
			const latestLocalState = await this.repository.getPlanningState()
			const planningState = await this.repository.replaceFromServer({
				period,
				items,
				statistics
			}, {
				preserveDirty: latestLocalState.dirty
			})

			this.applyPlanningState(planningState, {
				loading: false,
				source: 'api',
				stale: false,
				error: null,
				lastUpdated: Date.now()
			})
		} catch (error) {
			this.setState({
				loading: false,
				source: 'cache',
				stale: true,
				error,
				lastUpdated: Date.now()
			})
		}

		return this.getState()
	}

	async setPeriod(period) {
		const markDirty = isPlanningPeriodChanged(period, this.state.currentPeriod)
		await this.repository.updateCurrentPeriod(period, {markDirty})
		const planningState = await this.repository.getPlanningState()
		this.applyPlanningState(planningState, {saveError: null})
		return this.getState()
	}

	async updateCurrentPeriod(period) {
		return this.setPeriod(period)
	}

	async createPlanningItem(data) {
		await this.repository.createItem(data)
		const planningState = await this.repository.getPlanningState()
		this.applyPlanningState(planningState, {saveError: null})
		return this.getState()
	}

	async updatePlanningItem(id, data) {
		const currentItem = this.state.planningItems.find(item => String(item.id) === String(id))
		const markDirty = currentItem ? hasServerBackedItemPatch(currentItem, data) : true
		await this.repository.updateItem(id, data, {markDirty})
		const planningState = await this.repository.getPlanningState()
		this.applyPlanningState(planningState, {saveError: null})
		return this.getState()
	}

	async setPlanningItemStatus(id, status) {
		await this.repository.setStatus(id, status)
		const planningState = await this.repository.getPlanningState()
		this.applyPlanningState(planningState, {saveError: null})
		return this.getState()
	}

	async togglePlanningChecklistItem(itemId, checklistId) {
		const item = this.state.planningItems.find(planningItem => String(planningItem.id) === String(itemId))
		if (!item || !Array.isArray(item.checklist)) return this.getState()

		const checklist = item.checklist.map(checklistItem => {
			if (String(checklistItem.id) !== String(checklistId)) return checklistItem
			return {
				...checklistItem,
				checked: !checklistItem.checked
			}
		})

		await this.repository.updateItem(itemId, {checklist}, {markDirty: false})
		const planningState = await this.repository.getPlanningState()
		this.applyPlanningState(planningState, {saveError: null})
		return this.getState()
	}

	async removePlanningItem(id) {
		await this.repository.removeItem(id)
		const planningState = await this.repository.getPlanningState()
		this.applyPlanningState(planningState, {saveError: null})
		return this.getState()
	}

	getSavePlan(source = this.state) {
		const period = source.period || source.currentPeriod
		const items = source.items || source.planningItems || []
		const snapshot = source.serverSnapshot
		const snapshotItems = Array.isArray(snapshot?.items) ? snapshot.items : []
		const snapshotItemsById = new Map(snapshotItems.map(item => [String(item.id), item]))
		const currentPersistedIds = new Set()
		const creates = []
		const updates = []

		items.forEach(item => {
			if (isTemporaryId(item.id)) {
				creates.push(item)
				return
			}

			currentPersistedIds.add(String(item.id))

			const serverItem = snapshotItemsById.get(String(item.id))
			if (!serverItem) {
				creates.push(item)
				return
			}

			if (isPlanningItemChanged(item, serverItem)) {
				updates.push(item)
			}
		})

		const deletedIds = new Set((source.deletedItemIds || []).filter(id => !isTemporaryId(id)).map(String))
		snapshotItems.forEach(item => {
			if (!currentPersistedIds.has(String(item.id))) {
				deletedIds.add(String(item.id))
			}
		})
		const createPeriod = !period?.id || isTemporaryId(period.id)
		const updatePeriod = snapshot?.period
			&& !isTemporaryId(period?.id)
			&& isPlanningPeriodChanged(period, snapshot.period)
		const deletes = Array.from(deletedIds)

		return {
			period,
			createPeriod,
			updatePeriod,
			creates,
			updates,
			deletes,
			hasChanges: createPeriod || updatePeriod || creates.length > 0 || updates.length > 0 || deletes.length > 0
		}
	}

	async save() {
		if (this.state.saving) return this.getState()
		const plan = this.getSavePlan()

		this.setState({saving: true, saveError: null})

		try {
			if (!plan.hasChanges) {
				await this.repository.setDirty(false)
				const planningState = await this.repository.getPlanningState()
				this.applyPlanningState(planningState, {
					saving: false,
					error: null,
					saveError: null,
					lastUpdated: Date.now()
				})
				return this.getState()
			}

			let period = plan.period

			if (plan.createPeriod) {
				period = await this.apiService.createPeriod(period)
				const planningState = await this.repository.markCurrentPeriodPersisted(period)
				this.applyPlanningState(planningState, {
					saving: true,
					source: 'api',
					stale: false,
					error: null,
					saveError: null,
					lastUpdated: Date.now()
				})
			} else if (plan.updatePeriod) {
				period = await this.apiService.updatePeriod(period)
			}

			const periodId = period.id
			const createdItems = []

			for (const item of plan.creates) {
				const createdItem = await this.apiService.createItem({...item, periodId}, periodId)
				createdItems.push(createdItem)
				await this.repository.markItemPersisted(item.id, createdItem, periodId)
			}

			for (const item of plan.updates) {
				await this.apiService.updateItem({...item, periodId})
			}

			for (const itemId of plan.deletes) {
				await this.apiService.deleteItem(itemId)
			}

			const [items, statistics] = await Promise.all([
				this.apiService.getPeriodItems(periodId),
				this.apiService.getPeriodStatistics(periodId).catch(() => null)
			])
			const localChecklistById = new Map(this.state.planningItems.map(item => [String(item.id), item.checklist]))
			createdItems.forEach((createdItem, index) => {
				const localItem = plan.creates[index]
				if (localItem?.checklist) localChecklistById.set(String(createdItem.id), localItem.checklist)
			})
			const itemsWithLocalChecklist = items.map(item => ({
				...item,
				checklist: localChecklistById.get(String(item.id))
			}))
			const planningState = await this.repository.markCleanFromState({
				period,
				items: itemsWithLocalChecklist,
				statistics
			})

			this.applyPlanningState(planningState, {
				saving: false,
				source: 'api',
				stale: false,
				error: null,
				saveError: null,
				lastUpdated: Date.now()
			})
			return this.getState()
		} catch (error) {
			const planningState = await this.repository.getPlanningState()
			this.applyPlanningState(planningState, {
				saving: false,
				dirty: true,
				saveError: error,
				error
			})
			throw error
		}
	}
}

export default new PlanningStore()
