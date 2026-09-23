import BalanceLocalRepository from '../services/BalanceLocalRepository.js'
import PlanningApiService from '../services/PlanningApiService.js'
import PlanningLocalRepository from '../services/PlanningLocalRepository.js'
import {
	markPlanningServerCheckSucceeded,
	markPlanningSyncSucceeded,
	readPlanningSyncMetadata
} from '../services/PlanningSyncMetadata.js'
import PlanningSyncQueue from '../services/PlanningSyncQueue.js'
import TransactionLocalRepository from '../services/TransactionLocalRepository.js'
import networkStatusService from '../services/NetworkStatusService.js'
import {API_AUTH_STATUS, getAuthState, subscribeAuthState} from '../services/AuthSession.js'
import {calculateSummary, endOfDay, startOfDay} from '../services/PlanningCalculator.js'

const SERVER_REVALIDATION_MIN_INTERVAL_MS = 15 * 1000

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

const toPlanningDateKey = value => {
	if (!value) return toDateKey(Date.now())
	if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
	return toDateKey(value)
}

const normalizeComparableItem = item => ({
	categoryId: (item.categoryId ?? item.category_id) ? String(item.categoryId ?? item.category_id) : null,
	title: item.title || item.desc || item.description || 'Planning expense',
	description: item.desc ?? item.description ?? '',
	plannedAmount: toAmount(item.sum ?? item.plannedAmount ?? item.planned_amount) || 0,
	actualAmount: toAmount(item.actualAmount ?? item.actual_amount),
	status: item.status || 'pending',
	plannedAt: toPlanningDateKey(item.date ?? item.plannedAt ?? item.planned_at ?? Date.now()),
	transactionId: item.transactionId ?? item.transaction_id ?? null
})

const normalizeComparablePeriod = period => ({
	startDate: toPlanningDateKey(period?.dateFrom ?? period?.startDate ?? period?.start_date ?? Date.now()),
	endDate: toPlanningDateKey(period?.dateTo ?? period?.endDate ?? period?.end_date ?? Date.now()),
	budgetAmount: toAmount(period?.periodBudget ?? period?.budgetAmount ?? period?.budget_amount) || 0
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

const getComparablePlanningState = ({period, currentPeriod, items = [], planningItems = []} = {}) => {
	const planningPeriod = period || currentPeriod || null
	const planningItemsSource = items.length ? items : planningItems
	const comparablePeriod = planningPeriod ? normalizeComparablePeriod(planningPeriod) : null
	const comparableItems = planningItemsSource
		.map(item => ({
			id: String(item.id || ''),
			...normalizeComparableItem(item)
		}))
		.sort((left, right) => left.id.localeCompare(right.id))

	return JSON.stringify({
		period: comparablePeriod,
		items: comparableItems
	})
}

const isSamePlanningState = (left, right) => {
	if (!left || !right) return false
	return getComparablePlanningState(left) === getComparablePlanningState(right)
}

const isSamePlanningPeriod = (left, right) => {
	if (!left || !right) return false
	return JSON.stringify(normalizeComparablePeriod(left)) === JSON.stringify(normalizeComparablePeriod(right))
}

const toPersistedItemMap = (items = []) => {
	const map = new Map()
	items.forEach(item => {
		if (isTemporaryId(item.id)) return
		map.set(String(item.id), item)
	})
	return map
}

const getPlanningChangeSet = (base = {}, target = {}) => {
	const baseItemsById = toPersistedItemMap(base.items)
	const targetItemsById = toPersistedItemMap(target.items || target.planningItems)
	const createdIds = new Set()
	const createdTempIds = new Set()
	const updatedIds = new Set()
	const deletedIds = new Set()

	;(target.items || target.planningItems || []).forEach(item => {
		if (isTemporaryId(item.id)) {
			createdTempIds.add(String(item.id))
			return
		}

		const id = String(item.id)
		const baseItem = baseItemsById.get(id)
		if (!baseItem) {
			createdIds.add(id)
			return
		}

		if (isPlanningItemChanged(item, baseItem)) {
			updatedIds.add(id)
		}
	})

	baseItemsById.forEach((item, id) => {
		if (!targetItemsById.has(id)) deletedIds.add(id)
	})

	return {
		createdIds,
		createdTempIds,
		updatedIds,
		deletedIds,
		periodChanged: Boolean(base.period && target.period && isPlanningPeriodChanged(target.period, base.period))
	}
}

const intersectSets = (left, right) => {
	const ids = []
	left.forEach(id => {
		if (right.has(id)) ids.push(id)
	})
	return ids
}

const analyzePlanningChanges = (base = {}, local = {}, remote = {}) => {
	const localChanges = getPlanningChangeSet(base, local)
	const remoteChanges = getPlanningChangeSet(base, remote)
	const conflicts = []

	intersectSets(localChanges.updatedIds, remoteChanges.updatedIds).forEach(id => {
		conflicts.push({type: 'item-update-update', itemId: id})
	})
	intersectSets(localChanges.updatedIds, remoteChanges.deletedIds).forEach(id => {
		conflicts.push({type: 'item-update-delete', itemId: id})
	})
	intersectSets(localChanges.deletedIds, remoteChanges.updatedIds).forEach(id => {
		conflicts.push({type: 'item-delete-update', itemId: id})
	})

	if (
		localChanges.periodChanged
		&& remoteChanges.periodChanged
		&& !isSamePlanningPeriod(local.period || local.currentPeriod, remote.period || remote.currentPeriod)
	) {
		conflicts.push({type: 'period-update-update'})
	}

	return {
		local: localChanges,
		remote: remoteChanges,
		conflicts
	}
}

const hasUsableApiAuth = () => {
	const authState = getAuthState()
	if (!authState?.token || !authState?.user?.id) return false
	return authState.apiAuthStatus !== API_AUTH_STATUS.REJECTED
}

class PlanningStore {

	constructor({
		repository = new PlanningLocalRepository(),
		apiService = new PlanningApiService(),
		syncQueue = new PlanningSyncQueue(),
		balanceRepository = new BalanceLocalRepository(),
		transactionRepository = new TransactionLocalRepository(),
		autoRegisterSyncTriggers = true
	} = {}) {
		this.repository = repository
		this.apiService = apiService
		this.syncQueue = syncQueue
		this.balanceRepository = balanceRepository
		this.transactionRepository = transactionRepository
		this.listeners = new Set()
		this.unsubscribeNetworkStatus = null
		this.unsubscribeAuthStatus = null
		this.loadPromise = null
		this.syncPromise = null
		this.syncDebounce = null
		this.serverRevalidationPromise = null
		this.pendingServerRevalidation = null
		const syncMetadata = readPlanningSyncMetadata()
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
			syncStatus: 'idle',
			syncError: null,
			lastSuccessfulSyncAt: syncMetadata.lastSuccessfulSyncAt,
			lastSuccessfulServerCheckAt: syncMetadata.lastSuccessfulServerCheckAt,
			lastUpdated: null,
			transactionLinks: {},
			smartSuggestions: {}
		}
		if (autoRegisterSyncTriggers) this.registerSyncTriggers()
	}

	registerSyncTriggers() {
		if (typeof window === 'undefined') return
		let previousNetwork = networkStatusService.getState().network
		this.unsubscribeNetworkStatus = networkStatusService.subscribe(state => {
			if (previousNetwork === 'offline' && state.network === 'online') {
				this.handleRecoverySignal('online')
			}
			previousNetwork = state.network
		})
		window.addEventListener('focus', () => this.handleRecoverySignal('focus'))
		if (typeof document !== 'undefined') {
			document.addEventListener('visibilitychange', () => {
				if (document.visibilityState === 'visible') this.handleRecoverySignal('visible')
			})
		}
		let previousApiAuthStatus = getAuthState()?.apiAuthStatus || API_AUTH_STATUS.UNKNOWN
		this.unsubscribeAuthStatus = subscribeAuthState(authState => {
			const nextApiAuthStatus = authState?.apiAuthStatus || API_AUTH_STATUS.UNKNOWN
			if (
				previousApiAuthStatus === API_AUTH_STATUS.REJECTED
				&& nextApiAuthStatus === API_AUTH_STATUS.AUTHENTICATED
			) {
				this.handleRecoverySignal('auth-restored')
			}
			previousApiAuthStatus = nextApiAuthStatus
		})
	}

	handleRecoverySignal(reason = 'recovery') {
		if (this.syncDebounce) {
			clearTimeout(this.syncDebounce)
			this.syncDebounce = null
		}

		this.syncDebounce = setTimeout(() => {
			this.syncDebounce = null
			this.processSyncQueue({force: true, reason}).catch(() => {})
			this.revalidateFromServer({reason}).catch(() => {})
		}, 100)
	}

	getState() {
		return {
			...this.state,
			currentPeriod: {...this.state.currentPeriod},
			period: {...this.state.currentPeriod},
			periods: [...this.state.periods],
			planningItems: [...this.state.planningItems],
			deletedItemIds: [...this.state.deletedItemIds],
			transactionLinks: {...this.state.transactionLinks},
			smartSuggestions: {...this.state.smartSuggestions}
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
		if (this.state.loaded && !force) {
			this.revalidateFromServer({reason: 'load'}).catch(() => {})
			return Promise.resolve(this.getState())
		}

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
			loading: false,
			loaded: true,
			source: 'cache',
			stale: false,
			error: null,
			lastUpdated: Date.now()
		})
		this.refreshSmartSuggestions()
		if (cachedState.dirty) await this.enqueueAutosync({reason: 'startup'})

		this.scheduleAutosync({reason: 'startup', delay: 500})
		this.revalidateFromServer({reason: 'load'}).catch(() => {})
		return this.getState()
	}

	isOffline() {
		return networkStatusService.isOffline()
	}

	async enqueueAutosync({reason = 'local-change'} = {}) {
		const operation = await this.syncQueue.enqueue({reason})
		if (!operation) {
			this.setState({syncStatus: 'error', syncError: new Error('Planning sync queue is unavailable')})
			return null
		}

		if (operation.status === 'conflict') {
			this.setState({syncStatus: 'conflict', syncError: operation.lastError || new Error('Planning sync conflict')})
			return operation
		}

		this.setState({
			syncStatus: this.isOffline() ? 'offline' : 'pending',
			syncError: null
		})
		this.scheduleAutosync({reason})
		return operation
	}

	scheduleAutosync({reason = 'local-change', delay = 600} = {}) {
		if (this.syncDebounce) clearTimeout(this.syncDebounce)
		if (this.isOffline()) {
			if (this.state.dirty) this.setState({syncStatus: 'offline'})
			return
		}

		this.syncDebounce = setTimeout(() => {
			this.syncDebounce = null
			this.processSyncQueue({reason}).catch(() => {})
		}, delay)
	}

	async setPeriod(period) {
		const markDirty = isPlanningPeriodChanged(period, this.state.currentPeriod)
		await this.repository.updateCurrentPeriod(period, {markDirty})
		const planningState = await this.repository.getPlanningState()
		this.applyPlanningState(planningState, {saveError: null})
		if (markDirty) await this.enqueueAutosync({reason: 'period-update'})
		return this.getState()
	}

	async updateCurrentPeriod(period) {
		return this.setPeriod(period)
	}

	async createPlanningItem(data) {
		await this.repository.createItem(data)
		const planningState = await this.repository.getPlanningState()
		this.applyPlanningState(planningState, {saveError: null})
		await this.enqueueAutosync({reason: 'item-create'})
		return this.getState()
	}

	async updatePlanningItem(id, data) {
		const currentItem = this.state.planningItems.find(item => String(item.id) === String(id))
		const markDirty = currentItem ? hasServerBackedItemPatch(currentItem, data) : true
		await this.repository.updateItem(id, data, {markDirty})
		const planningState = await this.repository.getPlanningState()
		this.applyPlanningState(planningState, {saveError: null})
		if (markDirty) await this.enqueueAutosync({reason: 'item-update'})
		return this.getState()
	}

	async setPlanningItemStatus(id, status) {
		await this.repository.setStatus(id, status)
		const planningState = await this.repository.getPlanningState()
		this.applyPlanningState(planningState, {saveError: null})
		await this.enqueueAutosync({reason: 'item-status'})
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
		await this.enqueueAutosync({reason: 'item-delete'})
		return this.getState()
	}

	getSmartSuggestionState(itemId) {
		return this.state.smartSuggestions[String(itemId)] || {
			loading: false,
			error: null,
			candidates: []
		}
	}

	setSmartSuggestionState(itemId, patch = {}) {
		const key = String(itemId)
		this.setState({
			smartSuggestions: {
				...this.state.smartSuggestions,
				[key]: {
					...this.getSmartSuggestionState(key),
					...patch
				}
			}
		})
	}

	async refreshSmartSuggestions() {
		if (this.state.dirty) return this.getState()
		const items = this.state.planningItems.filter(item => {
			return item.status === 'pending' && !isTemporaryId(item.id)
		})

		if (!items.length) return this.getState()

		await Promise.all(items.map(async item => {
			this.setSmartSuggestionState(item.id, {loading: true, error: null})

			try {
				const candidates = await this.apiService.getTransactionSuggestions(item.id)
				this.setSmartSuggestionState(item.id, {
					loading: false,
					error: null,
					candidates: Array.isArray(candidates) ? candidates : []
				})
			} catch (error) {
				this.setSmartSuggestionState(item.id, {
					loading: false,
					error,
					candidates: []
				})
			}
		}))

		return this.getState()
	}

	async confirmSmartSuggestion(itemId, transaction) {
		const result = await this.apiService.confirmSuggestedTransaction(itemId, transaction)
		const item = result.item
		const periodId = item?.periodId || this.state.currentPeriodId
		const statistics = periodId
			? await this.apiService.getPeriodStatistics(periodId).catch(() => undefined)
			: undefined
		const planningState = await this.repository.applyPersistedItem(item, {statistics})

		this.applyPlanningState(planningState, {
			source: 'api',
			stale: false,
			error: null,
			saveError: null,
			lastUpdated: Date.now(),
			smartSuggestions: {
				...this.state.smartSuggestions,
				[String(itemId)]: {
					loading: false,
					error: null,
					candidates: []
				}
			}
		})

		if (result.linked) {
			this.applyLinkedTransactionResult(itemId, result.linked)
		}

		return this.getState()
	}

	getTransactionLinkState(itemId) {
		return this.state.transactionLinks[String(itemId)] || {
			loading: false,
			error: null,
			candidates: [],
			linkedTransactions: [],
			linkedAmount: 0,
			remainingAmount: null
		}
	}

	setTransactionLinkState(itemId, patch = {}) {
		const key = String(itemId)
		this.setState({
			transactionLinks: {
				...this.state.transactionLinks,
				[key]: {
					...this.getTransactionLinkState(key),
					...patch
				}
			}
		})
	}

	applyLinkedTransactionResult(itemId, result = {}) {
		const linkedTransactions = Array.isArray(result.transactions) ? result.transactions : []
		const linkedKeys = new Set(linkedTransactions.map(transaction => this.getTransactionKey(transaction)))
		const currentState = this.getTransactionLinkState(itemId)

		this.setTransactionLinkState(itemId, {
			linkedTransactions,
			linkedAmount: Number(result.linkedAmount) || 0,
			remainingAmount: result.remainingAmount,
			candidates: currentState.candidates.map(transaction => ({
				...transaction,
				linked: linkedKeys.has(this.getTransactionKey(transaction))
			})),
			loading: false,
			error: null
		})
	}

	getTransactionKey(transaction = {}) {
		return `${transaction.provider}:${transaction.providerTransactionId}`
	}

	async loadPlanningItemTransactions(itemId) {
		if (isTemporaryId(itemId)) {
			this.setTransactionLinkState(itemId, {
				loading: false,
				error: new Error('Save the planning item before linking transactions')
			})
			return this.getState()
		}

		this.setTransactionLinkState(itemId, {loading: true, error: null})

		try {
			const [candidates, linkedResult] = await Promise.all([
				this.apiService.getTransactionCandidates(itemId),
				this.apiService.getLinkedTransactions(itemId)
			])
			const linkedTransactions = Array.isArray(linkedResult.transactions) ? linkedResult.transactions : []
			const linkedKeys = new Set(linkedTransactions.map(transaction => this.getTransactionKey(transaction)))

			this.setTransactionLinkState(itemId, {
				loading: false,
				error: null,
				candidates: (Array.isArray(candidates) ? candidates : []).map(transaction => ({
					...transaction,
					linked: Boolean(transaction.linked) || linkedKeys.has(this.getTransactionKey(transaction))
				})),
				linkedTransactions,
				linkedAmount: Number(linkedResult.linkedAmount) || 0,
				remainingAmount: linkedResult.remainingAmount
			})
		} catch (error) {
			this.setTransactionLinkState(itemId, {loading: false, error})
		}

		return this.getState()
	}

	async linkPlanningTransaction(itemId, transaction) {
		const result = await this.apiService.linkTransaction(itemId, transaction)
		this.applyLinkedTransactionResult(itemId, result)
		return this.getState()
	}

	async unlinkPlanningTransaction(itemId, transaction) {
		const result = await this.apiService.unlinkTransaction(itemId, transaction)
		this.applyLinkedTransactionResult(itemId, result)
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

	getSavePlanSource(planningState) {
		return {
			...this.state,
			period: planningState.currentPeriod,
			currentPeriod: planningState.currentPeriod,
			planningItems: planningState.items,
			items: planningState.items,
			serverSnapshot: planningState.serverSnapshot,
			deletedItemIds: planningState.deletedItemIds || []
		}
	}

	async processSyncQueue({force = false, ignoreOffline = false, reason = 'autosync'} = {}) {
		if (this.syncPromise) return this.syncPromise
		if (!ignoreOffline && this.isOffline()) {
			if (this.state.dirty) this.setState({syncStatus: 'offline'})
			return this.getState()
		}

		this.syncPromise = this.processSyncQueueInternal({force, reason})
			.finally(() => {
				this.syncPromise = null
				if (this.pendingServerRevalidation) {
					const pending = this.pendingServerRevalidation
					this.pendingServerRevalidation = null
					this.revalidateFromServer(pending).catch(() => {})
				}
			})

		return this.syncPromise
	}

	async processSyncQueueInternal({force = false, reason = 'autosync'} = {}) {
		if (!this.state.loaded && this.loadPromise) {
			await this.loadPromise
		}

		let operation = await this.syncQueue.getOperation()
		if (!operation) {
			if (!this.state.dirty && this.state.syncStatus !== 'idle') {
				this.setState({syncStatus: 'synced', syncError: null})
			}
			return this.getState()
		}

		if (operation.status === 'conflict') {
			this.setState({syncStatus: 'conflict', syncError: operation.lastError || new Error('Planning sync conflict')})
			return this.getState()
		}

		if (operation.status === 'paused') {
			if (force && hasUsableApiAuth()) {
				operation = await this.syncQueue.resumePaused(operation, {reason}) || operation
			} else {
				this.setState({syncStatus: 'paused', syncError: operation.lastError || new Error('Planning sync paused')})
				return this.getState()
			}
		}

		if (operation.status === 'paused') {
			this.setState({syncStatus: 'paused', syncError: operation.lastError || new Error('Planning sync paused')})
			return this.getState()
		}

		if (!force && operation.nextAttemptAt && Number(operation.nextAttemptAt) > Date.now()) {
			this.setState({syncStatus: 'error', syncError: operation.lastError || new Error('Planning sync retry delayed')})
			return this.getState()
		}

		const syncingOperation = await this.syncQueue.markSyncing(operation)
		this.setState({syncStatus: 'syncing', syncError: null})

		try {
			await this.syncCurrentPlanningState()
			await this.syncQueue.complete(syncingOperation)
			const syncMetadata = markPlanningSyncSucceeded()
			this.setState({
				syncStatus: 'synced',
				syncError: null,
				lastSuccessfulSyncAt: syncMetadata.lastSuccessfulSyncAt
			})
			this.revalidateFromServer({reason: 'after-push', force: true}).catch(() => {})
			return this.getState()
		} catch (error) {
			const failedOperation = await this.syncQueue.markError(syncingOperation, error)
			this.setState({
				syncStatus: failedOperation.status,
				syncError: error,
				saveError: error
			})
			return this.getState()
		}
	}

	async save() {
		await this.enqueueAutosync({reason: 'manual-save'})
		return this.processSyncQueue({force: true})
	}

	async syncCurrentPlanningState() {
		if (this.state.saving) return this.getState()
		const localPlanningState = await this.repository.getPlanningState()
		const planSource = this.getSavePlanSource(localPlanningState)
		const plan = this.getSavePlan(planSource)

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

			await this.assertPlanningPushPreflight({plan, localPlanningState})

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
			const localChecklistById = new Map(planSource.planningItems.map(item => [String(item.id), item.checklist]))
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
			this.refreshSmartSuggestions()
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

	isLocalOnlyInitialPlan(plan) {
		const hasPersistedCreates = plan.creates.some(item => !isTemporaryId(item.id))
		return plan.createPeriod
			&& !plan.updatePeriod
			&& !plan.updates.length
			&& !plan.deletes.length
			&& !hasPersistedCreates
	}

	createPlanningConflictError(message = 'Planning sync conflict') {
		const error = new Error(message)
		error.status = 409
		error.statusCode = 409
		return error
	}

	async fetchRemotePlanningStateForPreflight() {
		try {
			return await this.fetchRemotePlanningState()
		} catch (error) {
			const status = Number(error?.status || error?.statusCode)
			if (status === 404) return null
			throw error
		}
	}

	async assertPlanningPushPreflight({plan, localPlanningState}) {
		const base = localPlanningState.serverSnapshot
		const remote = await this.fetchRemotePlanningStateForPreflight()

		if (!base?.period) {
			if (!remote?.period && this.isLocalOnlyInitialPlan(plan)) {
				return true
			}

			if (remote?.period) await this.markServerRevalidationSucceeded()
			throw this.createPlanningConflictError('Planning sync conflict: missing server snapshot')
		}

		if (!remote?.period) {
			const remoteState = {period: base.period, items: []}
			const localState = {
				period: localPlanningState.currentPeriod,
				items: localPlanningState.items
			}
			const analysis = analyzePlanningChanges(base, localState, remoteState)
			if (analysis.conflicts.length) {
				throw this.createPlanningConflictError('Planning sync conflict: remote Planning changed before push')
			}
			return true
		}

		const localState = {
			period: localPlanningState.currentPeriod,
			items: localPlanningState.items
		}
		const remoteState = {
			period: remote.period,
			items: remote.items
		}
		const analysis = analyzePlanningChanges(base, localState, remoteState)

		await this.markServerRevalidationSucceeded()
		if (analysis.conflicts.length) {
			throw this.createPlanningConflictError('Planning sync conflict: remote Planning changed before push')
		}

		return true
	}

	shouldSkipServerRevalidation({force = false} = {}) {
		if (force) return false
		const lastCheck = Number(this.state.lastSuccessfulServerCheckAt) || 0
		return lastCheck > 0 && Date.now() - lastCheck < SERVER_REVALIDATION_MIN_INTERVAL_MS
	}

	async fetchRemotePlanningState() {
		const period = await this.apiService.getCurrentPeriod()
		const [items, statistics] = await Promise.all([
			this.apiService.getPeriodItems(period.id),
			this.apiService.getPeriodStatistics(period.id).catch(() => null)
		])

		return {period, items, statistics}
	}

	async markServerRevalidationSucceeded() {
		const syncMetadata = markPlanningServerCheckSucceeded()
		this.setState({
			lastSuccessfulServerCheckAt: syncMetadata.lastSuccessfulServerCheckAt,
			lastUpdated: Date.now()
		})
		return syncMetadata
	}

	async markServerRevalidationConflict(error = new Error('Planning server revalidation conflict')) {
		const operation = await this.syncQueue.enqueue({reason: 'server-revalidation-conflict'})
		const conflictError = error
		conflictError.status = 409
		conflictError.statusCode = 409
		const failedOperation = operation
			? await this.syncQueue.markError(operation, conflictError)
			: {status: 'conflict', lastError: conflictError}

		this.setState({
			syncStatus: failedOperation.status || 'conflict',
			syncError: conflictError
		})
		return failedOperation
	}

	async revalidateFromServer({reason = 'revalidation', force = false} = {}) {
		if (this.serverRevalidationPromise) return this.serverRevalidationPromise
		if (this.isOffline() || !hasUsableApiAuth()) return this.getState()
		if (this.syncPromise || this.state.saving || this.state.syncStatus === 'syncing') {
			this.pendingServerRevalidation = {reason, force: true}
			return this.getState()
		}
		if (this.shouldSkipServerRevalidation({force})) return this.getState()

		this.serverRevalidationPromise = this.revalidateFromServerInternal({reason})
			.finally(() => {
				this.serverRevalidationPromise = null
			})

		return this.serverRevalidationPromise
	}

	async revalidateFromServerInternal() {
		const remote = await this.fetchRemotePlanningState()
		const latestLocalState = await this.repository.getPlanningState()
		const base = latestLocalState.serverSnapshot
		const localState = {
			period: latestLocalState.currentPeriod,
			items: latestLocalState.items
		}
		const remoteState = {
			period: remote.period,
			items: remote.items
		}

		if (!base?.period) {
			if (latestLocalState.dirty && !isSamePlanningState(localState, remoteState)) {
				await this.markServerRevalidationConflict()
				return this.getState()
			}

			const planningState = await this.repository.markCleanFromState(remote)
			this.applyPlanningState(planningState, {
				source: 'api',
				stale: false,
				error: null,
				saveError: null,
				lastUpdated: Date.now()
			})
			await this.markServerRevalidationSucceeded()
			this.refreshSmartSuggestions()
			return this.getState()
		}

		const localMatchesBase = isSamePlanningState(localState, base)
		const remoteMatchesBase = isSamePlanningState(remoteState, base)

		if (localMatchesBase && remoteMatchesBase) {
			await this.markServerRevalidationSucceeded()
			return this.getState()
		}

		if (localMatchesBase && !remoteMatchesBase) {
			const currentLocalState = await this.repository.getPlanningState()
			const currentLocalMatchesBase = isSamePlanningState({
				period: currentLocalState.currentPeriod,
				items: currentLocalState.items
			}, base)

			if (!currentLocalMatchesBase || currentLocalState.dirty) {
				await this.markServerRevalidationConflict()
				return this.getState()
			}

			const planningState = await this.repository.replaceFromServer(remote)
			this.applyPlanningState(planningState, {
				source: 'api',
				stale: false,
				error: null,
				saveError: null,
				lastUpdated: Date.now()
			})
			await this.markServerRevalidationSucceeded()
			this.refreshSmartSuggestions()
			return this.getState()
		}

		if (!localMatchesBase && remoteMatchesBase) {
			await this.markServerRevalidationSucceeded()
			return this.getState()
		}

		await this.markServerRevalidationConflict()
		return this.getState()
	}
}

export {
	analyzePlanningChanges,
	PlanningStore,
	getComparablePlanningState,
	getPlanningChangeSet,
	isSamePlanningState
}

export default new PlanningStore()
