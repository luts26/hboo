import AbstractClass from './AbstractClass.js'
import TransactionLocalRepository from '../services/TransactionLocalRepository.js'
import CategoryApiService from '../services/CategoryApiService.js'
import transactionStore from '../stores/TransactionStore.js'
import router from '../router/router.js'
import {
	COVERAGE_COMPLETE,
	UNCATEGORIZED_CATEGORY_ID,
	addCoverageToMonthlyIncomeExpenses,
	getCategorySpending,
	getCoveragePresentation,
	getCurrentMonthRange,
	getMonthlyIncomeExpenses,
	getRecentMonthRange,
	normalizeDateRange
} from '../services/FinancialAnalyticsService.js'
import {buildTransactionDrilldownPath} from '../services/HomeAnalyticsNavigation.js'
import {
	getIncomeCoverageNote,
	getMonthDetailViewModel
} from '../services/HomeAnalyticsViewModel.js'
import {getDateInputValue} from '../services/TransactionDateRange.js'

export default class HomePage extends AbstractClass {

	pageName = 'home'
	transactionRepository = new TransactionLocalRepository()
	categoryApiService = new CategoryApiService()
	incomePeriodMonths = 6
	categoryRange = getCurrentMonthRange()
	categories = []
	activeMonth = null
	state = {
		loading: true,
		error: null,
		monthly: [],
		category: {total: 0, items: []},
		coverage: null,
		categoryCoverage: null,
		hasIncompleteMonths: false
	}

	constructor(hbapp) {
		super(hbapp)
		this.handleMonthHover = event => {
			const monthTarget = event.target.closest('[data-home-month]')
			if (monthTarget) this.selectMonth(monthTarget.dataset.homeMonth, monthTarget)
		}
		this.handleChartMouseOut = event => {
			const chart = event.target.closest('[data-home-income-chart]')
			if (chart && !chart.contains(event.relatedTarget)) this.hideMonthTooltip()
		}
		this.handleOutsidePointer = event => {
			if (!event.target.closest('[data-home-month], [data-home-month-tooltip]')) this.hideMonthTooltip()
		}
		this.init()
	}

	init() {
		this.$hbapp.innerHTML = this.getTemplate()
		this.$hbapp.addEventListener('mouseover', this.handleMonthHover)
		this.$hbapp.addEventListener('focusin', this.handleMonthHover)
		this.$hbapp.addEventListener('mouseout', this.handleChartMouseOut)
		document.addEventListener('pointerdown', this.handleOutsidePointer)
		this.loadAnalytics()
	}

	destroy() {
		this.$hbapp.removeEventListener('mouseover', this.handleMonthHover)
		this.$hbapp.removeEventListener('focusin', this.handleMonthHover)
		this.$hbapp.removeEventListener('mouseout', this.handleChartMouseOut)
		document.removeEventListener('pointerdown', this.handleOutsidePointer)
	}

	getTemplate() {
		const categorySelection = {
			from: getDateInputValue(this.categoryRange.dateFrom),
			to: getDateInputValue(this.categoryRange.dateTo)
		}

		return `<div class="${this.pageName}-container home-dashboard mt-1">
			<section class="home-analytics-section" aria-labelledby="home-income-title">
				<div class="home-section-header">
					<div>
						<h2 id="home-income-title">Income vs Expenses</h2>
						<p class="home-section-note" data-home-income-coverage>Loading local analytics...</p>
					</div>
					<div class="home-segmented-control" role="group" aria-label="Income analytics period">
						<button class="home-segment-btn active" type="button" data-home-income-period="6">6 months</button>
						<button class="home-segment-btn" type="button" data-home-income-period="12">1 year</button>
					</div>
				</div>
				<div class="home-chart-card">
					<div class="home-income-chart" data-home-income-chart></div>
					<div class="home-month-tooltip" data-home-month-tooltip role="status" aria-live="polite"></div>
					<div class="home-chart-legend">
						<span><i class="home-legend-income"></i>Income</span>
						<span><i class="home-legend-expense"></i>Expenses</span>
					</div>
				</div>
			</section>
			<section class="home-analytics-section" aria-labelledby="home-category-title">
				<div class="home-section-header home-category-header">
					<div>
						<h2 id="home-category-title">Spending by Category</h2>
						<p class="home-section-note" data-home-category-coverage>Current month, local cache</p>
					</div>
					<form class="home-period-form" data-home-category-form>
						<label>
							<span>From</span>
							<input type="date" name="from" value="${categorySelection.from}">
						</label>
						<label>
							<span>To</span>
							<input type="date" name="to" value="${categorySelection.to}">
						</label>
					</form>
				</div>
				<div class="home-category-total" data-home-category-total></div>
				<div class="home-category-list" data-home-category-list></div>
			</section>
		</div>`
	}

	async loadAnalytics() {
		this.setLoadingState(true)
		try {
			const incomeRange = getRecentMonthRange(this.incomePeriodMonths)
			const [incomeCache, categoryCache, incomeCoverage, categoriesCache] = await Promise.all([
				this.transactionRepository.getRange(getRecentMonthRange(this.incomePeriodMonths)),
				this.transactionRepository.getRange(this.categoryRange),
				this.transactionRepository.getCoverage(incomeRange),
				this.categoryApiService.loadCategories('uk').catch(() => [])
			])
			this.categories = Array.isArray(categoriesCache) ? categoriesCache : []
			const monthly = addCoverageToMonthlyIncomeExpenses(
				getMonthlyIncomeExpenses(incomeCache?.data, incomeRange),
				incomeCoverage
			)
			this.activeMonth = monthly.some(item => item.month === this.activeMonth) ? this.activeMonth : null
			this.state = {
				loading: false,
				error: null,
				monthly,
				category: getCategorySpending(categoryCache?.data, this.categoryRange),
				coverage: getCoveragePresentation(incomeCache?.coverage),
				categoryCoverage: getCoveragePresentation(categoryCache?.coverage),
				hasIncompleteMonths: monthly.some(item => item.coverage !== COVERAGE_COMPLETE)
			}
			this.renderAnalytics()
		} catch (error) {
			this.state = {
				...this.state,
				loading: false,
				error
			}
			this.renderAnalytics()
		}
	}

	setLoadingState(loading) {
		this.state.loading = loading
		this.renderAnalytics()
	}

	formatAmount(value) {
		const num = Number(value) || 0
		return `${num.toLocaleString('uk-UA', {maximumFractionDigits: 2, minimumFractionDigits: 0})} грн`
	}

	getCategoryDisplay(categoryId) {
		if (String(categoryId) === UNCATEGORIZED_CATEGORY_ID) {
			return {name: 'Без категорії'}
		}
		const category = this.categories.find(item => String(item.id) === String(categoryId))
		return {
			name: category?.name || `Category #${categoryId}`
		}
	}

	escapeHtml(value) {
		return String(value ?? '')
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#039;')
	}

	renderAnalytics() {
		if (!this.$hbapp) return
		this.renderIncomeChart()
		this.renderCategorySpending()
	}

	renderIncomeChart() {
		const chart = this.$hbapp.querySelector('[data-home-income-chart]')
		const note = this.$hbapp.querySelector('[data-home-income-coverage]')
		const tooltip = this.$hbapp.querySelector('[data-home-month-tooltip]')
		if (!chart) return
		if (this.state.loading) {
			chart.innerHTML = '<div class="home-empty-state">Loading local analytics...</div>'
			if (note) {
				note.textContent = 'Reading cached transactions.'
				note.hidden = false
			}
			if (tooltip) tooltip.innerHTML = ''
			return
		}
		if (this.state.error) {
			chart.innerHTML = '<div class="home-empty-state">Local analytics are unavailable.</div>'
			if (note) {
				note.textContent = 'Could not read local transaction cache.'
				note.hidden = false
			}
			if (tooltip) tooltip.innerHTML = ''
			return
		}

		const rows = this.state.monthly
		const maxAmount = rows.reduce((max, item) => Math.max(max, item.income, item.expenses), 0)
		if (note) {
			const noteText = getIncomeCoverageNote(rows)
			note.textContent = noteText
			note.hidden = !noteText
		}
		chart.innerHTML = rows.map(item => {
			const incomeHeight = maxAmount > 0 ? Math.max(2, (item.income / maxAmount) * 100) : 0
			const expenseHeight = maxAmount > 0 ? Math.max(2, (item.expenses / maxAmount) * 100) : 0
			const isActive = item.month === this.activeMonth
			const statusLabel = this.getCoverageLabel(item.coverage)
			return `<button class="home-income-month home-income-month-${this.escapeHtml(item.coverage)} ${isActive ? 'active' : ''}" type="button" data-home-month="${this.escapeHtml(item.month)}" aria-label="${this.escapeHtml(`${item.longLabel}. ${statusLabel}`)}">
				<div class="home-income-bars" title="${this.escapeHtml(item.month)}">
					<div class="home-income-bar home-income-bar-in" style="height:${incomeHeight}%"></div>
					<div class="home-income-bar home-income-bar-out" style="height:${expenseHeight}%"></div>
				</div>
				<div class="home-income-label">
					<span>${this.escapeHtml(item.label)}</span>
				</div>
			</button>`
		}).join('') || '<div class="home-empty-state">No cached transactions for this period.</div>'
		this.hideMonthTooltip()
	}

	getCoverageLabel(coverage) {
		if (coverage === COVERAGE_COMPLETE) return 'Complete'
		if (coverage === 'partial') return 'Partial history'
		if (coverage === 'missing') return 'Local history unavailable'
		return 'Local history incomplete'
	}

	getSignedAmount(value) {
		const num = Number(value) || 0
		return `${num >= 0 ? '+' : '-'}${this.formatAmount(Math.abs(num))}`
	}

	renderMonthTooltip(month = this.activeMonth, target = null) {
		const root = this.$hbapp.querySelector('[data-home-month-tooltip]')
		if (!root) return
		const item = this.state.monthly.find(row => row.month === month)
		if (!item) {
			this.hideMonthTooltip()
			return
		}
		const viewModel = getMonthDetailViewModel(item)

		root.innerHTML = `<div class="home-month-tooltip-card ${viewModel.coverage === COVERAGE_COMPLETE ? '' : 'home-month-tooltip-incomplete'}">
			<div class="home-month-tooltip-title">${this.escapeHtml(viewModel.title)}</div>
			${viewModel.showValues ? `<div class="home-month-tooltip-grid">
				${viewModel.rows.map(row => `<span>${this.escapeHtml(row.label)}</span>
					<strong class="${row.tone === 'success' ? 'success-text' : 'error-text'}">${row.signed ? this.getSignedAmount(row.value) : this.formatAmount(row.value)}</strong>`).join('')}
			</div>` : ''}
			${viewModel.status ? `<div class="home-month-tooltip-status">${this.escapeHtml(viewModel.status)}</div>` : ''}
		</div>`
		root.classList.add('active')
		root.setAttribute('aria-hidden', 'false')
		this.positionMonthTooltip(target)
	}

	positionMonthTooltip(target) {
		const tooltip = this.$hbapp.querySelector('[data-home-month-tooltip]')
		const card = this.$hbapp.querySelector('.home-chart-card')
		if (!tooltip || !card || !target) return
		const cardRect = card.getBoundingClientRect()
		const targetRect = target.getBoundingClientRect()
		const tooltipWidth = Math.min(260, Math.max(210, tooltip.offsetWidth || 240))
		const center = targetRect.left + (targetRect.width / 2) - cardRect.left
		const left = Math.max((tooltipWidth / 2) + 8, Math.min(center, cardRect.width - (tooltipWidth / 2) - 8))
		const above = targetRect.top - cardRect.top
		const top = above > 150
			? above - 8
			: targetRect.bottom - cardRect.top + 10
		tooltip.style.setProperty('--home-tooltip-x', `${left}px`)
		tooltip.style.setProperty('--home-tooltip-y', `${top}px`)
		tooltip.classList.toggle('home-month-tooltip-below', above <= 150)
	}

	hideMonthTooltip() {
		this.activeMonth = null
		const root = this.$hbapp.querySelector('[data-home-month-tooltip]')
		if (root) {
			root.classList.remove('active', 'home-month-tooltip-below')
			root.setAttribute('aria-hidden', 'true')
			root.innerHTML = ''
		}
		this.$hbapp.querySelectorAll('[data-home-month]').forEach(button => {
			button.classList.remove('active')
		})
	}

	renderCategorySpending() {
		const list = this.$hbapp.querySelector('[data-home-category-list]')
		const total = this.$hbapp.querySelector('[data-home-category-total]')
		const note = this.$hbapp.querySelector('[data-home-category-coverage]')
		if (!list) return
		if (this.state.loading) {
			list.innerHTML = '<div class="home-empty-state">Loading local categories...</div>'
			return
		}
		if (this.state.error) {
			list.innerHTML = '<div class="home-empty-state">Category analytics are unavailable.</div>'
			return
		}

		const data = this.state.category
		if (total) total.textContent = `Total expenses: ${this.formatAmount(data.total)}`
		if (note) note.textContent = this.state.categoryCoverage?.label || 'Analytics use locally cached transactions.'
		if (!data.items.length) {
			list.innerHTML = '<div class="home-empty-state">No expense transactions in this period.</div>'
			return
		}

		list.innerHTML = data.items.map(item => {
			const width = Math.max(3, item.percentage)
			const category = this.getCategoryDisplay(item.categoryId)
			const canDrillDown = String(item.categoryId) !== UNCATEGORIZED_CATEGORY_ID
			const tag = canDrillDown ? 'button' : 'div'
			const drillAttrs = canDrillDown
				? `type="button" data-home-category-id="${this.escapeHtml(item.categoryId)}" title="Open transactions"`
				: 'aria-disabled="true"'
			return `<${tag} class="home-category-row ${canDrillDown ? 'home-category-row-action' : 'home-category-row-static'}" ${drillAttrs}>
				<div class="home-category-main">
					<span class="home-category-name">${this.escapeHtml(category.name)}</span>
					<strong>${this.formatAmount(item.amount)}</strong>
					<em>${item.percentage.toFixed(1)}%</em>
				</div>
				<div class="home-category-track" aria-hidden="true">
					<div class="home-category-bar" style="width:${width}%"></div>
				</div>
			</${tag}>`
		}).join('')
	}

	async setIncomePeriod(months) {
		this.incomePeriodMonths = months === 12 ? 12 : 6
		this.activeMonth = null
		this.$hbapp.querySelectorAll('[data-home-income-period]').forEach(button => {
			button.classList.toggle('active', Number(button.dataset.homeIncomePeriod) === this.incomePeriodMonths)
		})
		await this.loadAnalytics()
	}

	selectMonth(month, target = null) {
		if (!month || this.activeMonth === month) return
		this.activeMonth = month
		this.$hbapp.querySelectorAll('[data-home-month]').forEach(button => {
			button.classList.toggle('active', button.dataset.homeMonth === month)
		})
		this.renderMonthTooltip(month, target)
	}

	async setCategoryRangeFromForm(form) {
		const formData = new FormData(form)
		this.categoryRange = normalizeDateRange({
			dateFrom: formData.get('from'),
			dateTo: formData.get('to')
		})
		const fromInput = form.querySelector('[name="from"]')
		const toInput = form.querySelector('[name="to"]')
		if (fromInput) fromInput.value = getDateInputValue(this.categoryRange.dateFrom)
		if (toInput) toInput.value = getDateInputValue(this.categoryRange.dateTo)
		await this.loadAnalytics()
	}

	openTransactionsForCategory(categoryId) {
		const path = buildTransactionDrilldownPath({
			dateFrom: this.categoryRange.dateFrom,
			dateTo: this.categoryRange.dateTo,
			categoryId
		})
		if (path) {
			transactionStore.saveSelectedRange(this.categoryRange)
			router.redirectRouter(path)
		}
	}

	eventsRegister(e, eventType) {
		if (eventType === 'click' && e.target.closest('[data-home-income-period]')) {
			const button = e.target.closest('[data-home-income-period]')
			this.setIncomePeriod(Number(button.dataset.homeIncomePeriod))
			return
		}
		if (eventType === 'click' && e.target.closest('[data-home-month]')) {
			const monthTarget = e.target.closest('[data-home-month]')
			this.selectMonth(monthTarget.dataset.homeMonth, monthTarget)
			return
		}
		if (eventType === 'click' && e.target.closest('[data-home-category-id]')) {
			this.openTransactionsForCategory(e.target.closest('[data-home-category-id]').dataset.homeCategoryId)
			return
		}
		if (eventType === 'change' && e.target.closest('[data-home-category-form]')) {
			this.setCategoryRangeFromForm(e.target.closest('[data-home-category-form]'))
		}
	}
}
