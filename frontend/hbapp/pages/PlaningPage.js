import AbstractClass from './AbstractClass.js'
import planningStore from '../stores/PlanningStore.js'
import {endOfDay, startOfDay} from '../services/PlanningCalculator.js'
import {calculatePlanVsFact} from '../services/PlanVsFactService.js'
import CategoryApiService from '../services/CategoryApiService.js'
import DataStatus, { createDataStatusViewModel } from '../components/DataStatus.js'
import Toast from '../components/Toast.js'
import overlayHost from '../services/OverlayHost.js'

const statusOrder = {
	pending: 0,
	completed: 1,
	cancelled: 2
}

export default class PlaningPage extends AbstractClass {

	pageName = 'planing'
	state = {
		currentPeriod: null,
		summary: null,
		error: null,
		loading: false,
		loaded: false,
		saving: false,
		dirty: false,
		source: 'cache',
		stale: false,
		saveError: null,
		syncStatus: 'idle',
		syncError: null,
		modal: null,
		modalView: 'details',
		selectedItemId: null,
		transactionLinks: {},
		smartSuggestions: {},
		mode: 'plan'
	}
	categories = []
	categoryApiService = new CategoryApiService()
	categoryLoadPromise = null
	unsubscribe = null
	dataStatusOpen = false
	hasShownOfflineToast = false
	hasShownSyncErrorToast = false
	hasShownConflictToast = false
	wasOfflinePending = false

	constructor(hbapp) {
		super(hbapp)
		this.init()
	}

	init() {
		this.$hbapp.innerHTML = this.getLoadingTemplate()
		this.loadCategories()
		this.unsubscribe = planningStore.subscribe(state => {
			this.handleSyncFeedback(this.state, state)
			this.state = {
				currentPeriod: state.currentPeriod,
				summary: state.summary,
				error: state.error,
				loading: state.loading,
				loaded: state.loaded,
				saving: state.saving,
				dirty: state.dirty,
				source: state.source,
				stale: state.stale,
				saveError: state.saveError,
				syncStatus: state.syncStatus,
				syncError: state.syncError,
				modal: this.state.modal,
				modalView: this.state.modalView,
				selectedItemId: this.state.selectedItemId,
				transactionLinks: state.transactionLinks || {},
				smartSuggestions: state.smartSuggestions || {},
				mode: this.state.mode || 'plan'
			}
			this.render()
		})
		planningStore.load()
	}

	render() {
		if (!this.state.summary) {
			this.$hbapp.innerHTML = this.getLoadingTemplate()
			this.renderModal()
			return
		}
		this.$hbapp.innerHTML = this.getTemplate()
		this.renderModal()
	}

	destroy() {
		if (this.unsubscribe) this.unsubscribe()
		this.unsubscribe = null
		overlayHost.clear('planning-modal')
	}

	loadCategories() {
		if (this.categoryLoadPromise) return this.categoryLoadPromise
		this.categoryLoadPromise = this.categoryApiService.loadCategories('uk', {
			onRefresh: categories => {
				this.categories = categories
				this.render()
			}
		})
			.then(categories => {
				this.categories = Array.isArray(categories) ? categories : []
				this.render()
				return this.categories
			})
			.catch(() => {
				this.categories = []
				return this.categories
			})
			.finally(() => {
				this.categoryLoadPromise = null
			})

		return this.categoryLoadPromise
	}

	formatAmount(value) {
		const num = Number(value) || 0
		const absValue = Math.abs(num).toFixed(2)
		const parts = absValue.split('.')
		const intPart = parts[0].split('').reverse().map((item, index) => {
			return index && index % 3 === 0 ? `${item} ` : item
		}).reverse().join('')
		return `${num < 0 ? '-' : ''}${intPart}.${parts[1]}`
	}

	escapeHtml(value = '') {
		return String(value)
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#039;')
	}

	createChecklistId() {
		return `checklist-${Date.now()}-${Math.random().toString(16).slice(2)}`
	}

	getChecklistItems(item = null) {
		return Array.isArray(item?.checklist) ? item.checklist : []
	}

	getChecklistProgress(checklist = []) {
		const total = checklist.length
		const checked = checklist.filter(item => item.checked).length
		return {checked, total}
	}

	getDateInputTimestamp(value, isEndOfDay = false) {
		const parts = String(value || '').split('-').map(Number)
		if (parts.length !== 3 || parts.some(item => !Number.isFinite(item))) return null
		const date = new Date(parts[0], parts[1] - 1, parts[2])
		return isEndOfDay ? endOfDay(date) : startOfDay(date)
	}

	getSelectedItem() {
		return this.state.summary.items.find(item => String(item.id) === String(this.state.selectedItemId)) || null
	}

	getTransactionLinkState(itemId) {
		return this.state.transactionLinks?.[String(itemId)] || {
			loading: false,
			error: null,
			candidates: [],
			linkedTransactions: [],
			linkedAmount: 0,
			remainingAmount: null
		}
	}

	getSmartSuggestion(item) {
		if (!item || item.status !== 'pending') return null
		const candidates = this.state.smartSuggestions?.[String(item.id)]?.candidates || []
		return candidates[0] || null
	}

	formatStatusDateTime(value) {
		return `${this.timeStampToStringDate(value)} ${this.timeStampToStringTime(value, false)}`
	}

	formatPlanningDate(value) {
		const date = new Date(Number(value))
		const hasMeaningfulTime = date.getHours() || date.getMinutes() || date.getSeconds() || date.getMilliseconds()
		if (!hasMeaningfulTime) return this.timeStampToStringDate(value)
		return `${this.timeStampToStringDate(value)} ${this.timeStampToStringTime(value, false)}`
	}

	getDataStatusTemplate() {
		const viewModel = createDataStatusViewModel({
			loading: this.state.loading,
			source: this.state.source,
			stale: this.state.stale,
			updatedAt: this.state.lastUpdated,
			isOpen: this.dataStatusOpen
		}, value => this.formatStatusDateTime(value))
		return DataStatus.render(viewModel)
	}

	handleSyncFeedback(previousState, nextState) {
		if (nextState.syncStatus === 'offline') {
			this.wasOfflinePending = true
			if (!this.hasShownOfflineToast) {
				this.hasShownOfflineToast = true
				Toast.show('Offline — changes saved locally', {type: 'warning', key: 'planning-sync-offline'})
			}
			return
		}

		if (nextState.syncStatus === 'synced') {
			if (this.wasOfflinePending) {
				Toast.show('Changes synced', {type: 'success', key: 'planning-sync-recovered'})
			}
			this.wasOfflinePending = false
			this.hasShownOfflineToast = false
			this.hasShownSyncErrorToast = false
			this.hasShownConflictToast = false
			return
		}

		if (nextState.syncStatus === 'error') {
			if (!this.hasShownSyncErrorToast && previousState.syncStatus !== 'error') {
				this.hasShownSyncErrorToast = true
				Toast.show('Sync failed — changes are saved locally', {type: 'error', key: 'planning-sync-error'})
			}
			return
		}

		if (nextState.syncStatus === 'conflict' && !this.hasShownConflictToast) {
			this.hasShownConflictToast = true
			Toast.show('Sync conflict — changes are saved locally', {type: 'error', key: 'planning-sync-conflict', duration: 12000})
		}
	}

	getPageHeaderTemplate() {
		return ''
		return `<div class="page-compact-header">
			<h3 class="page-title-chip">Planning</h3>
			${this.getDataStatusTemplate()}
		</div>`
	}

	getLoadingTemplate() {
		return `<div class="${this.pageName}-container mt-3">
			${this.getPageHeaderTemplate()}
		</div>`
	}

	getBudgetLabel() {
		return this.state.summary.isBudgetConfigured ? `${this.formatAmount(this.state.summary.budget)} грн` : 'Не задано'
	}

	getDependentAmountLabel(value) {
		return this.state.summary.isBudgetConfigured ? `${this.formatAmount(value)} грн` : '-'
	}

	getActualSpentLabel() {
		return this.state.summary.actualSpent === null || this.state.summary.actualSpent === undefined
			? '-'
			: `${this.formatAmount(this.state.summary.actualSpent)} грн`
	}

	formatSignedAmount(value) {
		const amount = Number(value) || 0
		if (amount === 0) return `${this.formatAmount(0)} грн`
		return `${amount > 0 ? '+' : ''}${this.formatAmount(amount)} грн`
	}

	getPlanVsFactResultLabel(result) {
		const labels = {
			under: 'Under plan',
			over: 'Over plan',
			exact: 'On plan',
			unavailable: 'Fact unavailable'
		}

		return labels[result] || labels.unavailable
	}

	getPlanningModeSwitchTemplate() {
		const mode = this.state.mode || 'plan'

		return `
			<div class="hboo-segmented-control planing-mode-switch" role="tablist" aria-label="Planning mode">
				<button class="hboo-segment-btn planing-mode-btn${mode === 'plan' ? ' active' : ''}" type="button" role="tab" aria-selected="${mode === 'plan'}" data-action="planning-mode" data-mode="plan">Planning</button>
				<button class="hboo-segment-btn planing-mode-btn${mode === 'plan-vs-fact' ? ' active' : ''}" type="button" role="tab" aria-selected="${mode === 'plan-vs-fact'}" data-action="planning-mode" data-mode="plan-vs-fact">Plan vs Fact</button>
			</div>`
	}

	getPeriodSummaryTemplate() {
		const period = this.state.currentPeriod || {}
		const fromDate = this.timeStampToStringDate(period.dateFrom)
		const toDate = this.timeStampToStringDate(period.dateTo)

		return `
			<button class="planing-period-summary" type="button" title="Edit period">
				<div class="planing-period-main">
					<div class="planing-summary-label">Current period</div>
					<div class="planing-period-range">${fromDate} - ${toDate}</div>
				</div>
				<div class="planing-period-metrics">
					<div>
						<span>Budget</span>
						<strong>${this.getBudgetLabel()}</strong>
					</div>
					<div>
						<span>Free</span>
						<strong>${this.getDependentAmountLabel(this.state.summary.freeAmount)}</strong>
					</div>
					<div>
						<span>Actual Spent</span>
						<strong>${this.getActualSpentLabel()}</strong>
					</div>
				</div>
				<!--span class="planing-period-edit">Edit period</span-->
			</button>`
	}

	getCategoryOptions(activeId = '') {
		const emptySelected = activeId ? '' : ' selected'
		const options = this.categories.map(item => {
			const selected = String(item.id) === String(activeId) ? ' selected' : ''
			return `<option value="${item.id}"${selected}>${this.escapeHtml(item.name)}</option>`
		}).join('')

		return `<option value=""${emptySelected}>Без категорії</option>${options}`
	}

	getCategoryName(item) {
		const category = this.categories.find(categoryItem => String(categoryItem.id) === String(item.categoryId))
		if (category) return category.name
		return item.categoryId ? `Category #${item.categoryId}` : 'Без категорії'
	}

	getCategory(item) {
		return this.categories.find(categoryItem => String(categoryItem.id) === String(item.categoryId)) || null
	}

	getCategoryIconClass(item) {
		return this.getCategory(item)?.icon || 'other-icon'
	}

	getCategoryIconTemplate(item) {
		return `<span class="planing-category-icon ${this.escapeHtml(this.getCategoryIconClass(item))}" aria-hidden="true"></span>`
	}

	getStatusLabel(status = 'pending') {
		const labels = {
			pending: 'Pending',
			completed: 'Completed',
			cancelled: 'Cancelled'
		}
		return labels[status] || labels.pending
	}

	getStatusActionsTemplate(status = 'pending') {
		if (status !== 'pending') return ''

		const actions = []

		if (status !== 'completed') {
			actions.push('<button class="planing-status-btn" type="button" data-action="planning-completed" data-status="completed">Complete</button>')
		}

		if (status !== 'cancelled') {
			actions.push('<button class="planing-status-btn" type="button" data-action="planning-cancelled" data-status="cancelled">Cancel</button>')
		}

		if (status !== 'pending') {
			actions.push('<button class="planing-status-btn" type="button" data-action="planning-pending" data-status="pending">Pending</button>')
		}

		return actions.length ? `<div class="planing-item-actions">${actions.join('')}</div>` : ''
	}

	getTransactionInfoTemplate(item, compact = false) {
		const linkState = this.getTransactionLinkState(item.id)
		const linkedAmount = Number(linkState.linkedAmount) || 0
		if (!linkedAmount && compact) return ''

		return `
			<div class="${compact ? 'planing-linked-compact' : 'planing-linked-summary'}">
				<span>Linked payments: <strong>${this.formatAmount(linkedAmount)} грн</strong></span>
			</div>`
	}

	getSmartSuggestionTemplate(item) {
		const suggestion = this.getSmartSuggestion(item)
		if (!suggestion) return ''

		return `
			<div class="planing-smart-suggestion">
				<div class="planing-smart-suggestion-main">
					<span>Possible payment found</span>
					<strong>${this.escapeHtml(suggestion.description || 'Transaction')} · ${this.formatAmount(suggestion.expenseAmount)} грн · ${this.formatPlanningDate(suggestion.timestamp)}</strong>
				</div>
				<button class="planing-smart-confirm-btn" type="button" data-action="planning-smart-confirm" data-itemid="${item.id}" data-provider="${this.escapeHtml(suggestion.provider)}" data-transaction-id="${this.escapeHtml(suggestion.providerTransactionId)}">Confirm</button>
			</div>`
	}

	getPlanFactTemplate(item) {
		if (item.status !== 'completed' || item.actualAmount === null || item.actualAmount === undefined) return ''

		return `
			<div class="planing-plan-fact">
				<span>Plan: <strong>${this.formatAmount(item.sum)} грн</strong></span>
				<span>Actual: <strong>${this.formatAmount(item.actualAmount)} грн</strong></span>
			</div>`
	}

	getChecklistProgressTemplate(item) {
		const checklist = this.getChecklistItems(item)
		if (!checklist.length) return ''
		const progress = this.getChecklistProgress(checklist)

		return `
			<div class="planing-checklist-progress">
				<span>Shopping list</span>
				<strong>${progress.checked} / ${progress.total}</strong>
			</div>`
	}

	getItemTemplate(item) {
		const status = item.status || 'pending'
		const statusClass = `planing-item-${status}`
		const actionsHtml = this.getStatusActionsTemplate(status)
		const amount = status === 'completed' && item.actualAmount !== null && item.actualAmount !== undefined
			? item.actualAmount
			: item.sum

		return `
			<div class="planing-item ${statusClass}" data-itemid="${item.id}">
				<button class="planing-item-open" type="button" data-action="planning-open" data-itemid="${item.id}">
					${this.getCategoryIconTemplate(item)}
					<div class="planing-item-main">
						<div class="planing-item-price">${this.formatAmount(amount)} грн</div>
						<div class="planing-item-category">${this.escapeHtml(this.getCategoryName(item))}</div>
						${this.getPlanFactTemplate(item)}
						${this.getChecklistProgressTemplate(item)}
						<span>${this.formatPlanningDate(item.date)}</span>
					</div>
				</button>
				<div class="planing-item-meta">
					<!--span>${this.formatPlanningDate(item.date)}</span-->
					<button class="planing-transaction-btn d-none" type="button" data-action="planning-transactions-open" data-itemid="${item.id}">Transactions</button>
					${status === 'pending' ? actionsHtml : `<strong>${this.getStatusLabel(status)}</strong>`}
				</div>
				${this.getSmartSuggestionTemplate(item)}
			</div>`
	}

	getItemsTemplate() {
		const items = this.state.summary.items.slice().sort((a, b) => {
			const statusDiff = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99)
			if (statusDiff !== 0) return statusDiff
			const createdDiff = (Number(b.createdAt) || Number(b.date) || 0) - (Number(a.createdAt) || Number(a.date) || 0)
			if (createdDiff !== 0) return createdDiff
			return String(b.id).localeCompare(String(a.id))
		})
		if (!items.length) {
			return `<div class="planing-empty">Planning items ще не створені.</div>`
		}
		return items.map(item => this.getItemTemplate(item)).join('')
	}

	getPlanVsFactViewModel() {
		return calculatePlanVsFact(this.state.summary?.items || [])
	}

	getPlanVsFactSummaryTemplate(viewModel) {
		const summary = viewModel.summary
		const differenceResult = summary.difference > 0
			? 'under'
			: (summary.difference < 0 ? 'over' : 'exact')

		return `
			<div class="planing-fact-summary">
				<div class="planing-fact-summary-grid">
					<div>
						<span>Planned completed</span>
						<strong>${this.formatAmount(summary.plannedComparable)} грн</strong>
					</div>
					<div>
						<span>Actual</span>
						<strong>${this.formatAmount(summary.actualComparable)} грн</strong>
					</div>
					<div class="planing-fact-summary-difference planing-fact-result-${differenceResult}">
						<span>Difference</span>
						<strong>${this.formatSignedAmount(summary.difference)}</strong>
					</div>
				</div>
				<div class="planing-fact-counts">
					<span>${summary.underPlanCount} under</span>
					<span>${summary.overPlanCount} over</span>
					<span>${summary.exactCount} on plan</span>
				</div>
			</div>`
	}

	getPlanVsFactItemTemplate(item) {
		const difference = item.result === 'exact' ? '—' : this.formatSignedAmount(item.difference)

		return `
			<div class="planing-fact-item planing-fact-result-${item.result}">
				<div class="planing-fact-item-header">
					<div>
						<div class="planing-fact-item-title">${this.escapeHtml(item.description || item.title)}</div>
						<div class="planing-fact-item-category">${this.escapeHtml(this.getCategoryName({categoryId: item.categoryId}))}</div>
					</div>
					<strong>${this.getPlanVsFactResultLabel(item.result)}</strong>
				</div>
				<div class="planing-fact-lines">
					<div><span>Plan</span><strong>${this.formatAmount(item.plannedAmount)} грн</strong></div>
					<div><span>Fact</span><strong>${this.formatAmount(item.actualAmount)} грн</strong></div>
					<div><span>Difference</span><strong>${difference}</strong></div>
				</div>
			</div>`
	}

	getPlanVsFactNotIncludedTemplate(viewModel) {
		const summary = viewModel.summary
		const rows = []
		if (summary.pendingCount) rows.push(`<div><span>Pending items</span><strong>${summary.pendingCount}</strong></div>`)
		if (summary.completedWithoutFactCount) rows.push(`<div><span>Completed without fact</span><strong>${summary.completedWithoutFactCount}</strong></div>`)
		if (summary.cancelledCount) rows.push(`<div><span>Cancelled items excluded</span><strong>${summary.cancelledCount}</strong></div>`)

		if (!rows.length && viewModel.items.length) return ''

		return `
			<div class="planing-fact-secondary">
				<div class="planing-detail-section-title">Not included in comparison</div>
				${rows.length ? rows.join('') : '<p>All completed items with known fact are included.</p>'}
			</div>`
	}

	getPlanVsFactTemplate() {
		const viewModel = this.getPlanVsFactViewModel()
		const itemsHtml = viewModel.items.length
			? viewModel.items.map(item => this.getPlanVsFactItemTemplate(item)).join('')
			: '<div class="planing-empty">No completed planning items with known fact yet.</div>'

		return `
			<div class="planing-fact-view">
				${this.getPlanVsFactSummaryTemplate(viewModel)}
				<div class="planing-fact-list">
					${itemsHtml}
				</div>
				${this.getPlanVsFactNotIncludedTemplate(viewModel)}
			</div>`
	}

	getChecklistFormRowsTemplate(item = null) {
		const checklist = this.getChecklistItems(item)
		const rows = checklist.length ? checklist : [{id: this.createChecklistId(), title: '', checked: false}]

		return rows.map(checklistItem => this.getChecklistFormRowTemplate(checklistItem)).join('')
	}

	getChecklistFormRowTemplate(checklistItem = {}) {
		const id = checklistItem.id || this.createChecklistId()
		const title = this.escapeHtml(checklistItem.title || '')
		const checked = checklistItem.checked ? 'true' : 'false'

		return `
			<div class="planing-checklist-form-row" data-checklist-id="${id}" data-checklist-checked="${checked}">
				<input class="planing-checklist-input" type="text" name="checklistTitle" value="${title}" placeholder="Назва товару">
				<button class="planing-checklist-remove-btn" type="button" data-action="planning-checklist-remove" title="Remove item">×</button>
			</div>`
	}

	getChecklistFormTemplate(item = null) {
		return `
			<div class="planing-checklist-editor">
				<div class="planing-checklist-editor-title">Shopping list</div>
				<div class="planing-checklist-form-rows">
					${this.getChecklistFormRowsTemplate(item)}
				</div>
				<button class="planing-checklist-add-btn" type="button" data-action="planning-checklist-add">+ Add item</button>
			</div>`
	}

	getExpenseFormTemplate(item = null) {
		const isEditing = Boolean(item)
		const sum = item ? item.sum : ''
		const categoryId = item?.categoryId ?? ''
		const noteValue = item ? (item.desc || (item.title === 'Planning expense' ? '' : item.title) || '') : ''
		const note = this.escapeHtml(noteValue)
		const plannedDate = this.timeStampToStringDate(item?.date || Date.now(), '-')

		return `
			<form class="planing-form" data-itemid="${item?.id || ''}">
					<div class="planing-form-row">
						<div class="input-wraper planing-input">
							<input type="number" name="sum" min="0" step="0.01" placeholder="Сума" value="${sum}">
						</div>
						<select name="categoryId" class="planing-select">
							${this.getCategoryOptions(categoryId)}
						</select>
					</div>
					<input class="planing-textarea" type="date" name="plannedDate" value="${plannedDate}">
					<textarea name="note" class="planing-textarea" placeholder="Note">${note}</textarea>
					${this.getChecklistFormTemplate(item)}
					<div class="app-modal-actions planing-modal-actions">
						<button class="planing-cancel-edit-btn" type="button">Cancel</button>
						<button class="planing-save-btn" type="submit">${isEditing ? 'Save' : 'Add'}</button>
					</div>
				</form>`
	}

	getPeriodFormTemplate() {
		const period = this.state.currentPeriod || {}
		const fromDate = this.timeStampToStringDate(period.dateFrom, '-')
		const toDate = this.timeStampToStringDate(period.dateTo, '-')
		const periodBudget = Number(period.periodBudget) || ''

		return `
			<form class="planing-period-form">
				<div class="planing-period-item">
					<label for="planing-period-from">Період з</label>
					<input id="planing-period-from" class="planing-period-input" type="date" name="dateFrom" value="${fromDate}">
				</div>
				<div class="planing-period-item">
					<label for="planing-period-to">Період до</label>
					<input id="planing-period-to" class="planing-period-input" type="date" name="dateTo" value="${toDate}">
				</div>
				<div class="planing-period-item">
					<label for="planing-period-budget">Бюджет періоду</label>
					<input id="planing-period-budget" class="planing-period-input" type="number" min="0" step="0.01" name="periodBudget" value="${periodBudget}" placeholder="Не задано">
				</div>
					<div class="app-modal-actions planing-modal-actions">
						<button class="planing-cancel-edit-btn" type="button">Cancel</button>
						<button class="planing-save-btn" type="submit">Save period</button>
					</div>
			</form>`
	}

	getManualCompletionTemplate(item) {
		const actualAmount = item?.actualAmount !== null && item?.actualAmount !== undefined
			? item.actualAmount
			: item?.sum

		return `
			<form class="planing-complete-form" data-itemid="${item?.id || ''}">
				<div class="planing-detail-grid">
					<div class="planing-detail-field planing-detail-field-main">
						<span>Planned amount</span>
						<strong>${this.formatAmount(item?.sum)} грн</strong>
					</div>
					<div class="planing-detail-field planing-detail-field-main">
						<label for="planing-complete-actual">Actual amount</label>
						<div class="planing-amount-inline">
							<input id="planing-complete-actual" class="planing-complete-actual-input" type="number" name="actualAmount" min="0" step="0.01" value="${actualAmount}" required>
							<span>грн</span>
						</div>
					</div>
				</div>
				<div class="planing-complete-error" data-complete-error hidden></div>
				<div class="app-modal-actions planing-modal-actions">
					<button class="planing-cancel-edit-btn" type="button">Cancel</button>
					<button class="planing-save-btn" type="submit">Complete</button>
				</div>
			</form>`
	}

	getChecklistSummaryTemplate(item) {
		const checklist = this.getChecklistItems(item)
		if (!checklist.length) return ''
		const progress = this.getChecklistProgress(checklist)

		return `
			<button class="planing-shopping-summary" type="button" data-action="planning-shopping-open">
				<span class="planing-shopping-summary-main">
					<span>Shopping list</span>
					<strong>${progress.checked} / ${progress.total} completed</strong>
				</span>
				<span class="planing-shopping-summary-side">
					<span>${progress.total} ${progress.total === 1 ? 'item' : 'items'}</span>
					<span aria-hidden="true">›</span>
				</span>
			</button>`
	}

	getChecklistDetailTemplate(item, showHeader = true) {
		const checklist = this.getChecklistItems(item)
		if (!checklist.length) return ''
		const progress = this.getChecklistProgress(checklist)

		return `
			<div class="planing-detail-checklist">
				${showHeader ? `<div class="planing-detail-section-title">Shopping list</div>
				<div class="planing-shopping-count">${progress.checked} / ${progress.total} completed</div>` : ''}
				${checklist.map(checklistItem => {
					const checkedClass = checklistItem.checked ? ' is-checked' : ''
					const checkedMark = checklistItem.checked ? '✓' : '□'

					return `
						<button class="planing-checklist-row${checkedClass}" type="button" data-action="planning-checklist-toggle" data-planning-id="${item.id}" data-checklist-id="${checklistItem.id}">
							<span class="planing-checklist-mark">${checkedMark}</span>
							<span class="planing-checklist-title">${this.escapeHtml(checklistItem.title)}</span>
						</button>`
				}).join('')}
				</div>`
	}

	getShoppingListTemplate(item) {
		const progress = this.getChecklistProgress(this.getChecklistItems(item))
		return `<div class="planing-shopping-view" data-itemid="${item.id}">
			<div class="planing-shopping-view-header">
				<button class="transaction-modal-back-btn" type="button" data-action="planning-shopping-back" title="Back">‹</button>
				<div>
					<div class="planing-detail-section-title">Shopping list</div>
					<div class="planing-shopping-count">${progress.checked} / ${progress.total} completed</div>
				</div>
			</div>
			${this.getChecklistDetailTemplate(item, false)}
		</div>`
	}

	getTransactionProviderLabel(provider) {
		const labels = {
			mono: 'Monobank',
			privat: 'PrivatBank'
		}

		return labels[provider] || provider
	}

	getMatchingTransactionRowTemplate(transaction, action) {
		const disabled = transaction.linked && action === 'link' ? ' disabled' : ''
		const actionLabel = action === 'unlink' ? 'Unlink' : 'Link'
		const actionName = action === 'unlink' ? 'planning-transaction-unlink' : 'planning-transaction-link'

		return `
			<div class="planing-transaction-row">
				<div class="planing-transaction-main">
					<div class="planing-transaction-title">${this.escapeHtml(transaction.description || 'Transaction')}</div>
					<div class="planing-transaction-meta">
						<span>${this.formatPlanningDate(transaction.timestamp)}</span>
						<span>${this.escapeHtml(this.getTransactionProviderLabel(transaction.provider))}</span>
						${transaction.category ? `<span>${this.escapeHtml(transaction.category)}</span>` : ''}
					</div>
				</div>
				<div class="planing-transaction-side">
					<strong>${this.formatAmount(transaction.expenseAmount ?? Math.abs(Number(transaction.amount) || 0))} грн</strong>
					<button class="planing-transaction-action" type="button" data-action="${actionName}" data-provider="${this.escapeHtml(transaction.provider)}" data-transaction-id="${this.escapeHtml(transaction.providerTransactionId)}"${disabled}>${actionLabel}</button>
				</div>
			</div>`
	}

	getTransactionListTemplate(transactions, action, emptyText) {
		if (!transactions.length) {
			return `<div class="planing-transaction-empty">${emptyText}</div>`
		}

		return transactions.map(transaction => this.getMatchingTransactionRowTemplate(transaction, action)).join('')
	}

	getTransactionMatchingTemplate(item) {
		const linkState = this.getTransactionLinkState(item.id)
		const linked = Array.isArray(linkState.linkedTransactions) ? linkState.linkedTransactions : []
		const candidates = Array.isArray(linkState.candidates) ? linkState.candidates.filter(transaction => !transaction.linked) : []
		const status = linkState.loading
			? '<div class="planing-transaction-empty">Loading transactions...</div>'
			: linkState.error
				? '<div class="planing-sync-error">Transactions are unavailable for this planning item.</div>'
				: ''

		return `<div class="planing-transactions-view" data-itemid="${item.id}">
			<div class="planing-shopping-view-header">
				<button class="transaction-modal-back-btn" type="button" data-action="planning-shopping-back" title="Back">‹</button>
				<div>
					<div class="planing-detail-section-title">Transactions</div>
					<div class="planing-shopping-count">${this.escapeHtml(item.desc || item.title || 'Planning expense')}</div>
				</div>
			</div>
			${this.getTransactionInfoTemplate(item)}
			${status}
			<div class="planing-transaction-section">
				<div class="planing-detail-section-title">Linked transactions</div>
				${this.getTransactionListTemplate(linked, 'unlink', 'No linked transactions.')}
			</div>
			<div class="planing-transaction-section">
				<div class="planing-detail-section-title">Available transactions</div>
				${this.getTransactionListTemplate(candidates, 'link', 'No available expense transactions for this period.')}
			</div>
		</div>`
	}

	getDetailTemplate(item) {
		const noteValue = item.desc || (item.title === 'Planning expense' ? '' : item.title) || ''
		const note = noteValue ? this.escapeHtml(noteValue) : 'Коментар не додано.'
		const actualAmount = item.actualAmount !== null && item.actualAmount !== undefined
			? `<div class="planing-detail-field"><span>Actual amount</span><strong>${this.formatAmount(item.actualAmount)} грн</strong></div>`
			: ''
		const amount = item.status === 'completed' && item.actualAmount !== null && item.actualAmount !== undefined
			? item.actualAmount
			: item.sum
		const statusActions = item.status === 'pending'
			? `${this.getStatusActionsTemplate(item.status).replace('<div class="planing-item-actions 111">', '').replace('</div>', '')}`
			: ''

		return `
			<div class="planing-detail" data-itemid="${item.id}">
					<div class="planing-detail-grid">
						<div class="planing-detail-field planing-detail-field-main"><span>Planned amount</span><strong>${this.formatAmount(amount)} грн</strong></div>
						<div class="planing-detail-field"><span>Category</span><strong class="planing-detail-category">${this.getCategoryIconTemplate(item)}<span>${this.escapeHtml(this.getCategoryName(item))}</span></strong></div>
						<div class="planing-detail-field"><span>Planned date</span><strong>${this.formatPlanningDate(item.date)}</strong></div>
						<div class="planing-detail-field"><span>Status</span><strong>${this.getStatusLabel(item.status)}</strong></div>
						${actualAmount}
					</div>
					<div class="planing-detail-desc"><span>Note</span>${note}</div>
					${this.getPlanFactTemplate(item)}
					${item.status === 'pending' ? this.getSmartSuggestionTemplate(item) : ''}
					${this.getChecklistSummaryTemplate(item)}
					<div class="app-modal-actions planing-modal-actions planing-detail-actions">
						<button class="planing-remove-btn" type="button">Delete</button>
						${statusActions}
						<button class="planing-transaction-btn d-none" type="button" data-action="planning-transactions-open" data-itemid="${item.id}">Transactions</button>
						<button class="planing-edit-btn" type="button">Edit</button>
					</div>
			</div>`
	}

	getModalTemplate() {
		if (!this.state.modal) return ''
		const item = this.getSelectedItem()
		const modalTitle = {
			period: 'Edit period',
			add: 'Add expense',
			complete: 'Complete expense',
			detail: this.state.modalView === 'shoppingList' ? 'Shopping list' : (this.state.modalView === 'transactions' ? 'Transactions' : 'Expense details'),
			edit: 'Edit expense'
		}[this.state.modal]
		const modalContent = {
			period: () => this.getPeriodFormTemplate(),
			add: () => this.getExpenseFormTemplate(),
			complete: () => item ? this.getManualCompletionTemplate(item) : '',
			detail: () => item
				? (this.state.modalView === 'shoppingList'
					? this.getShoppingListTemplate(item)
					: (this.state.modalView === 'transactions' ? this.getTransactionMatchingTemplate(item) : this.getDetailTemplate(item)))
				: '',
			edit: () => item ? this.getExpenseFormTemplate(item) : ''
		}[this.state.modal]

		if (!modalContent) return ''

		return `
			<div class="app-modal-backdrop planing-modal-backdrop">
				<div class="app-modal planing-modal" role="dialog" aria-modal="true">
					<div class="app-modal-header planing-modal-header">
						<h4>${modalTitle}</h4>
						<button class="app-modal-close planing-modal-close" type="button" title="Close">×</button>
					</div>
					<div class="app-modal-body">
						${modalContent()}
					</div>
				</div>
			</div>`
	}

	getTemplate() {
		const mode = this.state.mode || 'plan'
		const isPlanVsFact = mode === 'plan-vs-fact'
		const planActionsHtml = isPlanVsFact
			? ''
			: `<div class="planing-list-header planing-list-header-actions">
					<button class="planing-add-btn" type="button" title="Add planning item" aria-label="Add planning item">+</button>
				</div>`

		return `<div class="${this.pageName}-container mt-2">
			${this.getPageHeaderTemplate()}
			<div class="planing-toolbar">
				${this.getPeriodSummaryTemplate()}
			</div>
			${this.getPlanningModeSwitchTemplate()}
			<div class="planing-list">
				${planActionsHtml}
				${isPlanVsFact ? this.getPlanVsFactTemplate() : this.getItemsTemplate()}
			</div>
		</div>`
	}

	renderModal() {
		const html = this.getModalTemplate()
		if (html) overlayHost.render('planning-modal', html)
		else overlayHost.clear('planning-modal')
	}

	openModal(modal, itemId = null) {
		this.state.modal = modal
		this.state.modalView = 'details'
		this.state.selectedItemId = itemId
		this.render()
	}

	closeModal() {
		this.state.modal = null
		this.state.modalView = 'details'
		this.state.selectedItemId = null
		this.render()
	}

	setModalView(modalView = 'details') {
		this.state.modalView = modalView
		this.render()
	}

	setPlanningMode(mode = 'plan') {
		this.state.mode = mode === 'plan-vs-fact' ? 'plan-vs-fact' : 'plan'
		this.render()
	}

	async openTransactionMatching(itemId) {
		this.state.modal = 'detail'
		this.state.modalView = 'transactions'
		this.state.selectedItemId = itemId
		this.render()
		await planningStore.loadPlanningItemTransactions(itemId)
	}

	getChecklistFormData(form) {
		const checklist = Array.from(form.querySelectorAll('.planing-checklist-form-row'))
			.map(row => ({
				id: row.dataset.checklistId || this.createChecklistId(),
				title: row.querySelector('.planing-checklist-input')?.value.trim() || '',
				checked: row.dataset.checklistChecked === 'true'
			}))
			.filter(item => item.title)

		return checklist.length ? checklist : undefined
	}

	async createPlanningItem(event) {
		event.preventDefault()
		const form = event.target.closest('.planing-form')
		if (!form) return
		const formData = new FormData(form)
		const sum = Number(formData.get('sum'))
		if (!sum || sum <= 0) return
		const plannedDate = this.getDateInputTimestamp(formData.get('plannedDate')) || Date.now()

		await planningStore.createPlanningItem({
			sum,
			categoryId: formData.get('categoryId') || null,
			typeStr: formData.get('categoryId') || 'other',
			title: formData.get('note') || 'Planning expense',
			desc: formData.get('note') || '',
			actualAmount: null,
			checklist: this.getChecklistFormData(form),
			date: plannedDate,
			status: 'pending'
		})
		this.closeModal()
	}

	async updatePlanningItemStatus(event) {
		const button = event.target.closest('.planing-status-btn')
		if (!button) return
		const detail = button.closest('.planing-detail')
		const item = button.closest('.planing-item')
		const itemId = detail?.dataset.itemid || item?.dataset.itemid || this.state.selectedItemId
		if (button.dataset.status === 'completed') return this.openModal('complete', itemId)
		await planningStore.setPlanningItemStatus(itemId, button.dataset.status)
		this.closeModal()
	}

	getActualAmountFromCompletionForm(form) {
		const input = form?.querySelector('[name="actualAmount"]')
		const rawValue = input?.value
		if (rawValue === null || rawValue === undefined || String(rawValue).trim() === '') return null
		const amount = Number(rawValue)
		if (!Number.isFinite(amount) || amount < 0) return null
		return Math.round((amount + Number.EPSILON) * 100) / 100
	}

	async completePlanningItem(event) {
		const form = event.target.closest('.planing-complete-form')
		if (!form) return
		event.preventDefault()
		const actualAmount = this.getActualAmountFromCompletionForm(form)
		const error = form.querySelector('[data-complete-error]')
		if (actualAmount === null) {
			if (error) {
				error.textContent = 'Enter a valid actual amount.'
				error.hidden = false
			}
			return
		}

		await planningStore.updatePlanningItem(form.dataset.itemid, {
			status: 'completed',
			actualAmount
		})
		this.closeModal()
	}

	async removePlanningItem(event) {
		const button = event.target.closest('.planing-remove-btn')
		if (!button) return
		const detail = button.closest('.planing-detail')
		const itemId = detail?.dataset.itemid || this.state.selectedItemId
		await planningStore.removePlanningItem(itemId)
		this.closeModal()
	}

	async savePlanningItem(event) {
		const form = event.target.closest('.planing-form')
		if (!form) return
		event.preventDefault()
		const formData = new FormData(form)
		const sum = Number(formData.get('sum'))
		if (!sum || sum <= 0) return
		const plannedDate = this.getDateInputTimestamp(formData.get('plannedDate')) || Date.now()
		const currentItem = this.getSelectedItem()

		await planningStore.updatePlanningItem(form.dataset.itemid, {
			sum,
			categoryId: formData.get('categoryId') || null,
			typeStr: formData.get('categoryId') || 'other',
			title: currentItem?.title || formData.get('note') || 'Planning expense',
			desc: formData.get('note') || '',
			date: plannedDate,
			checklist: this.getChecklistFormData(form)
		})
		this.closeModal()
	}

	async toggleChecklistItem(actionTarget) {
		await planningStore.togglePlanningChecklistItem(actionTarget.dataset.planningId, actionTarget.dataset.checklistId)
	}

	getTransactionActionPayload(actionTarget) {
		return {
			provider: actionTarget.dataset.provider,
			providerTransactionId: actionTarget.dataset.transactionId
		}
	}

	async linkPlanningTransaction(actionTarget) {
		if (actionTarget.disabled) return
		const itemId = this.state.selectedItemId
		actionTarget.disabled = true
		try {
			await planningStore.linkPlanningTransaction(itemId, this.getTransactionActionPayload(actionTarget))
			await planningStore.loadPlanningItemTransactions(itemId)
		} catch {
			Toast.show('Transaction link failed', {type: 'error', key: 'planning-link-failed'})
		}
	}

	async unlinkPlanningTransaction(actionTarget) {
		if (actionTarget.disabled) return
		const itemId = this.state.selectedItemId
		actionTarget.disabled = true
		try {
			await planningStore.unlinkPlanningTransaction(itemId, this.getTransactionActionPayload(actionTarget))
			await planningStore.loadPlanningItemTransactions(itemId)
		} catch {
			Toast.show('Transaction unlink failed', {type: 'error', key: 'planning-unlink-failed'})
		}
	}

	async confirmSmartSuggestion(actionTarget) {
		if (actionTarget.disabled) return
		actionTarget.disabled = true

		try {
			await planningStore.confirmSmartSuggestion(actionTarget.dataset.itemid, {
				provider: actionTarget.dataset.provider,
				providerTransactionId: actionTarget.dataset.transactionId
			})
			Toast.show('Planning item completed', {type: 'success', key: 'planning-smart-confirmed'})
		} catch {
			actionTarget.disabled = false
			Toast.show('Payment confirmation failed', {type: 'error', key: 'planning-smart-confirm-failed'})
		}
	}

	addChecklistFormRow(event) {
		const form = event.target.closest('.planing-form')
		const rows = form?.querySelector('.planing-checklist-form-rows')
		if (!rows) return
		rows.insertAdjacentHTML('beforeend', this.getChecklistFormRowTemplate({
			id: this.createChecklistId(),
			title: '',
			checked: false
		}))
		const lastInput = rows.querySelector('.planing-checklist-form-row:last-child .planing-checklist-input')
		if (lastInput) lastInput.focus()
	}

	removeChecklistFormRow(event) {
		const row = event.target.closest('.planing-checklist-form-row')
		if (row) row.remove()
	}

	async savePeriod(event) {
		const form = event.target.closest('.planing-period-form')
		if (!form) return
		event.preventDefault()
		const formData = new FormData(form)
		const dateFrom = this.getDateInputTimestamp(formData.get('dateFrom'))
		const dateTo = this.getDateInputTimestamp(formData.get('dateTo'), true)
		if (!dateFrom || !dateTo || dateFrom > dateTo) return

		await planningStore.updateCurrentPeriod({
			dateFrom,
			dateTo,
			periodBudget: Math.max(0, Number(formData.get('periodBudget')) || 0)
		})
		this.closeModal()
	}

	eventsRegister(event, eventKey) {
		if (eventKey === 'click') {
			if (event.target.closest('[data-action="toggle-data-status"]')) {
				this.dataStatusOpen = !this.dataStatusOpen
				this.render()
				return
			}
			const modeTarget = event.target.closest('[data-action="planning-mode"]')
			if (modeTarget) return this.setPlanningMode(modeTarget.dataset.mode)
			if (event.target.closest('.planing-modal-close')) return this.closeModal()
			if (event.target.classList.contains('planing-modal-backdrop')) return this.closeModal()
			if (event.target.closest('.planing-period-summary')) return this.openModal('period')
			if (event.target.closest('.planing-add-btn')) return this.openModal('add')
			if (event.target.closest('.planing-cancel-edit-btn')) return this.closeModal()
			if (event.target.closest('.planing-detail .planing-edit-btn')) return this.openModal('edit', this.state.selectedItemId)
			if (event.target.closest('.planing-period-form .planing-save-btn')) return this.savePeriod(event)
			if (event.target.closest('.planing-complete-form .planing-save-btn')) return this.completePlanningItem(event)
			if (event.target.closest('.planing-form .planing-save-btn')) {
				return this.state.modal === 'edit' ? this.savePlanningItem(event) : this.createPlanningItem(event)
			}
			const actionTarget = event.target.closest('[data-action]')
			if (actionTarget?.dataset.action === 'planning-completed') return this.updatePlanningItemStatus(event)
			if (actionTarget?.dataset.action === 'planning-cancelled') return this.updatePlanningItemStatus(event)
			if (actionTarget?.dataset.action === 'planning-pending') return this.updatePlanningItemStatus(event)
			if (actionTarget?.dataset.action === 'planning-open') return this.openModal('detail', actionTarget.dataset.itemid)
			if (actionTarget?.dataset.action === 'planning-transactions-open') return this.openTransactionMatching(actionTarget.dataset.itemid || this.state.selectedItemId)
			if (actionTarget?.dataset.action === 'planning-shopping-open') return this.setModalView('shoppingList')
			if (actionTarget?.dataset.action === 'planning-shopping-back') return this.setModalView('details')
			if (actionTarget?.dataset.action === 'planning-checklist-toggle') return this.toggleChecklistItem(actionTarget)
			if (actionTarget?.dataset.action === 'planning-smart-confirm') return this.confirmSmartSuggestion(actionTarget)
			// if (actionTarget?.dataset.action === 'planning-transaction-link') return this.linkPlanningTransaction(actionTarget)
			// if (actionTarget?.dataset.action === 'planning-transaction-unlink') return this.unlinkPlanningTransaction(actionTarget)
			if (actionTarget?.dataset.action === 'planning-checklist-add') return this.addChecklistFormRow(event)
			if (actionTarget?.dataset.action === 'planning-checklist-remove') return this.removeChecklistFormRow(event)
			if (event.target.closest('.planing-remove-btn')) return this.removePlanningItem(event)
			if (event.target.closest('.planing-item')) {
				const item = event.target.closest('.planing-item')
				return this.openModal('detail', item.dataset.itemid)
			}
		}
		if (eventKey === 'keypressenter') {
			if (event.target.closest('.planing-period-form')) return this.savePeriod(event)
			if (event.target.closest('.planing-complete-form')) return this.completePlanningItem(event)
			if (event.target.closest('.planing-checklist-input')) return
			if (event.target.closest('.planing-form')) {
				return this.state.modal === 'edit' ? this.savePlanningItem(event) : this.createPlanningItem(event)
			}
		}
		if (eventKey === 'change') {
			if (event.target.closest('.planing-period-input')) return
		}
		if (event.type === 'submit') {
			if (event.target.closest('.planing-period-form')) return this.savePeriod(event)
			if (event.target.closest('.planing-complete-form')) return this.completePlanningItem(event)
			if (event.target.closest('.planing-form')) {
				return this.state.modal === 'edit' ? this.savePlanningItem(event) : this.createPlanningItem(event)
			}
		}
	}
}
