import AbstractClass from './AbstractClass.js'
import TransactionLocalRepository from '../services/TransactionLocalRepository.js'
import PlanningLocalRepository from '../services/PlanningLocalRepository.js'
import CategoryApiService from '../services/CategoryApiService.js'
import IncomeExpenseLineChart from '../components/IncomeExpenseLineChart.js'
import {
	COVERAGE_COMPLETE,
	buildStatistics,
	getCoverageForRange,
	getCurrentMonthRange,
	getPeriodPresetRange,
	getPreviousEquivalentRange,
	normalizeAnalyticsRange,
	normalizeDateRange,
	roundMoney
} from '../services/FinancialAnalyticsService.js'
import {getDateInputValue} from '../services/TransactionDateRange.js'

const PERIOD_PRESETS = ['current-month', 'previous-month']

const sameRange = (left, right) => Number(left?.dateFrom) === Number(right?.dateFrom)
	&& Number(left?.dateTo) === Number(right?.dateTo)

const isCurrentMonthToDateRange = range => {
	const current = getCurrentMonthRange()
	const rangeTo = new Date(Number(range?.dateTo))
	const currentTo = new Date(current.dateTo)
	return Number(range?.dateFrom) === current.dateFrom
		&& Number(range?.dateTo) <= current.dateTo
		&& rangeTo.getFullYear() === currentTo.getFullYear()
		&& rangeTo.getMonth() === currentTo.getMonth()
		&& rangeTo.getDate() === currentTo.getDate()
}

const getSearchFromState = ({preset, range}) => {
	const params = new URLSearchParams()
	if (PERIOD_PRESETS.includes(preset)) params.set('preset', preset)
	params.set('date_from', String(Number(range.dateFrom)))
	params.set('date_to', String(Number(range.dateTo)))
	return `?${params.toString()}`
}

const getRangeStateFromSearch = search => {
	const params = new URLSearchParams(String(search || '').replace(/^\?/, ''))
	const preset = params.get('preset')
	if (PERIOD_PRESETS.includes(preset)) {
		return {
			preset,
			range: getPeriodPresetRange(preset)
		}
	}
	if (!params.has('date_from') || !params.has('date_to')) {
		return {
			preset: 'current-month',
			range: getCurrentMonthRange()
		}
	}
	try {
		const range = normalizeAnalyticsRange({
			dateFrom: params.get('date_from'),
			dateTo: params.get('date_to')
		})
		const previousMonth = getPeriodPresetRange('previous-month')
		if (isCurrentMonthToDateRange(range)) return {preset: 'current-month', range}
		if (sameRange(range, previousMonth)) return {preset: 'previous-month', range}
		return {preset: 'custom', range}
	} catch (error) {
		return {
			preset: 'current-month',
			range: getCurrentMonthRange()
		}
	}
}

export default class StatisticsPage extends AbstractClass {

	pageName = 'statistics'
	transactionRepository = new TransactionLocalRepository()
	planningRepository = new PlanningLocalRepository()
	categoryApiService = new CategoryApiService()
	state = (() => {
		const rangeState = getRangeStateFromSearch(window.location.search)
		return {
			loading: true,
			error: null,
			preset: rangeState.preset,
		range: rangeState.range,
		trendMode: 'expenses',
		activeTrendKey: null,
		statistics: null,
		categories: [],
		coverage: null
		}
	})()

	constructor(hbapp) {
		super(hbapp)
		this.handleClick = this.handleClick.bind(this)
		this.handleSubmit = this.handleSubmit.bind(this)
		this.handlePopState = this.handlePopState.bind(this)
		this.handleTrendHover = this.handleTrendHover.bind(this)
		this.handleTrendMouseOut = this.handleTrendMouseOut.bind(this)
		this.handleOutsidePointer = this.handleOutsidePointer.bind(this)
		this.init()
	}

	init() {
		this.updateUrlFromState({replace: true})
		this.render()
		this.$hbapp.addEventListener('click', this.handleClick)
		this.$hbapp.addEventListener('submit', this.handleSubmit)
		this.$hbapp.addEventListener('mouseover', this.handleTrendHover)
		this.$hbapp.addEventListener('focusin', this.handleTrendHover)
		this.$hbapp.addEventListener('mouseout', this.handleTrendMouseOut)
		window.addEventListener('popstate', this.handlePopState)
		document.addEventListener('pointerdown', this.handleOutsidePointer)
		this.loadPromise = this.loadStatistics()
	}

	destroy() {
		this.$hbapp.removeEventListener('click', this.handleClick)
		this.$hbapp.removeEventListener('submit', this.handleSubmit)
		this.$hbapp.removeEventListener('mouseover', this.handleTrendHover)
		this.$hbapp.removeEventListener('focusin', this.handleTrendHover)
		this.$hbapp.removeEventListener('mouseout', this.handleTrendMouseOut)
		window.removeEventListener('popstate', this.handlePopState)
		document.removeEventListener('pointerdown', this.handleOutsidePointer)
	}

	handleClick(event) {
		const presetButton = event.target.closest('[data-statistics-preset]')
		if (presetButton) {
			this.setPreset(presetButton.dataset.statisticsPreset)
			return
		}

		const planningLink = event.target.closest('[data-statistics-nav="planning"]')
		if (planningLink) {
			this.router.redirectRouter('/planing')
			return
		}

		const trendModeButton = event.target.closest('[data-statistics-trend-mode]')
		if (trendModeButton) {
			this.setTrendMode(trendModeButton.dataset.statisticsTrendMode)
		}
	}

	handleTrendHover(event) {
		const target = event.target.closest('[data-statistics-trend-point]')
		if (target) this.selectTrendPoint(target.dataset.statisticsTrendPoint, target)
	}

	handleTrendMouseOut(event) {
		const chart = event.target.closest('[data-statistics-trend-chart]')
		if (chart && !chart.contains(event.relatedTarget)) this.hideTrendTooltip()
	}

	handleOutsidePointer(event) {
		if (!event.target.closest('[data-statistics-trend-point], [data-statistics-trend-tooltip]')) this.hideTrendTooltip()
	}

	handlePopState() {
		const nextState = getRangeStateFromSearch(window.location.search)
		this.state = {
			...this.state,
			preset: nextState.preset,
			range: nextState.range
		}
		this.render()
		this.loadPromise = this.loadStatistics()
	}

	updateUrlFromState({replace = false} = {}) {
		const nextPath = `/statistics${getSearchFromState(this.state)}`
		const currentPath = `${window.location.pathname}${window.location.search}`
		if (nextPath === currentPath) return
		if (replace && typeof window.history.replaceState === 'function') {
			window.history.replaceState({}, null, nextPath)
			return
		}
		window.history.pushState({}, null, nextPath)
	}

	handleSubmit(event) {
		const form = event.target.closest('[data-statistics-custom-form]')
		if (!form) return
		event.preventDefault()
		const formData = new FormData(form)
		const range = normalizeDateRange({
			dateFrom: formData.get('from'),
			dateTo: formData.get('to')
		})
		this.state = {
			...this.state,
			preset: 'custom',
			range
		}
		this.updateUrlFromState()
		this.render()
		this.loadPromise = this.loadStatistics()
	}

	setPreset(preset) {
		if (!['current-month', 'previous-month'].includes(preset)) return
		this.state = {
			...this.state,
			preset,
			range: getPeriodPresetRange(preset)
		}
		this.updateUrlFromState()
		this.render()
		this.loadPromise = this.loadStatistics()
	}

	setTrendMode(mode) {
		if (!['expenses', 'income', 'both'].includes(mode)) return
		this.state = {
			...this.state,
			trendMode: mode,
			activeTrendKey: null
		}
		this.render()
	}

	async loadCategories() {
		const cached = await this.categoryApiService.localRepository.getCached('uk').catch(() => null)
		if (cached?.items?.length) return cached.items
		return this.categoryApiService.loadCategories('uk').catch(() => [])
	}

	async loadStatistics() {
		const range = this.state.range
		const comparisonRange = getPreviousEquivalentRange(range)
		const unionRange = {
			dateFrom: Math.min(range.dateFrom, comparisonRange.dateFrom),
			dateTo: Math.max(range.dateTo, comparisonRange.dateTo)
		}
		this.state = {...this.state, loading: true, error: null}
		this.render()

		try {
			const [transactionsCache, categories, planningState] = await Promise.all([
				this.transactionRepository.getRange(unionRange),
				this.loadCategories(),
				this.planningRepository.getPlanningState()
			])
			const coverage = transactionsCache?.coverage || null
			const statistics = buildStatistics({
				transactions: transactionsCache?.data,
				categories,
				planningState,
				range,
				comparisonRange,
				coverage
			})
			this.state = {
				...this.state,
				loading: false,
				error: null,
				categories,
				coverage,
				activeTrendKey: statistics.trend.items.some(item => item.key === this.state.activeTrendKey) ? this.state.activeTrendKey : null,
				statistics
			}
			this.render()
		} catch (error) {
			this.state = {
				...this.state,
				loading: false,
				error
			}
			this.render()
		}
	}

	render() {
		this.$hbapp.innerHTML = this.getTemplate()
	}

	getTemplate() {
		return `<div class="${this.pageName}-container statistics-dashboard">
			${this.getPeriodSelectorTemplate()}
			<div data-statistics-content>
				${this.getContentTemplate()}
			</div>
		</div>`
	}

	getContentTemplate() {
		if (this.state.loading && !this.state.statistics) {
			return '<div class="statistics-empty-state">Loading local statistics...</div>'
		}
		if (this.state.error) {
			return '<div class="statistics-empty-state">Statistics are unavailable from local cache.</div>'
		}
		if (!this.state.statistics) {
			return '<div class="statistics-empty-state">No local statistics yet.</div>'
		}

		return `
			${this.getOverviewTemplate()}
			${this.getTrendTemplate()}
			${this.getCategoriesTemplate()}
			${this.getComparisonTemplate()}
			${this.getPlanningTemplate()}
		`
	}

	getPeriodSelectorTemplate() {
		const selection = {
			from: getDateInputValue(this.state.range.dateFrom),
			to: getDateInputValue(this.state.range.dateTo)
		}
		return `<section class="statistics-period-section" aria-labelledby="statistics-period-title">
			<div class="statistics-section-header">
				<div>
					<h2 id="statistics-period-title">Statistics</h2>
					<p>${this.escapeHtml(this.getRangeLabel(this.state.range))}</p>
				</div>
				<div class="hboo-segmented-control statistics-segmented-control" role="group" aria-label="Statistics period">
					<button class="hboo-segment-btn statistics-segment-btn ${this.state.preset === 'current-month' ? 'active' : ''}" type="button" data-statistics-preset="current-month">Current month</button>
					<button class="hboo-segment-btn statistics-segment-btn ${this.state.preset === 'previous-month' ? 'active' : ''}" type="button" data-statistics-preset="previous-month">Previous month</button>
				</div>
			</div>
			<form class="statistics-period-form" data-statistics-custom-form>
				<label>
					<span>From</span>
					<input type="date" name="from" value="${selection.from}">
				</label>
				<label>
					<span>To</span>
					<input type="date" name="to" value="${selection.to}">
				</label>
				<button class="hboo-button" type="submit">Apply</button>
			</form>
		</section>`
	}

	getOverviewTemplate() {
		const stats = this.state.statistics
		const totals = stats.totals
		const cards = [
			{label: 'Total income', value: totals.income, tone: 'success', change: totals.changes.income},
			{label: 'Total expenses', value: totals.expenses, tone: 'error', change: totals.changes.expenses},
			{label: 'Net cash flow', value: totals.net, tone: totals.net >= 0 ? 'success' : 'error', signed: true, change: totals.changes.net},
			{
				label: 'Budget',
				value: totals.budgetAmount,
				tone: 'neutral',
				secondary: totals.budgetUtilization === null ? 'Not configured for this period' : `${this.formatPercent(totals.budgetUtilization)} used`
			}
		]

		return `<section class="statistics-section" aria-labelledby="statistics-overview-title">
			<div class="statistics-section-header">
				<div>
					<h2 id="statistics-overview-title">Financial overview</h2>
					<p>${this.escapeHtml(this.getComparisonLabel())}</p>
				</div>
			</div>
			<div class="statistics-card-grid">
				${cards.map(card => this.getOverviewCardTemplate(card)).join('')}
			</div>
			${this.getCoverageNoteTemplate()}
		</section>`
	}

	getOverviewCardTemplate(card) {
		const value = card.value === null || card.value === undefined
			? 'Not available'
			: `${card.signed && Number(card.value) > 0 ? '+' : ''}${this.formatMoney(card.value)}`
		const change = card.change ? this.getChangeTemplate(card.change) : ''
		return `<article class="statistics-overview-card">
			<span>${this.escapeHtml(card.label)}</span>
			<strong class="${card.tone === 'success' ? 'success-text' : card.tone === 'error' ? 'error-text' : ''}">${this.escapeHtml(value)}</strong>
			${card.secondary ? `<small>${this.escapeHtml(card.secondary)}</small>` : change}
		</article>`
	}

	getTrendTemplate() {
		const trend = this.state.statistics.trend
		const mode = this.state.trendMode
		const chartRows = trend.items.map(item => ({
			...item,
			longLabel: this.getRangeLabel(item),
			net: roundMoney((Number(item.income) || 0) - (Number(item.expenses) || 0)),
			coverage: this.state.statistics.coverage?.status || 'partial'
		}))
		return `<section class="statistics-section" aria-labelledby="statistics-trend-title">
			<div class="statistics-section-header">
				<div>
					<h2 id="statistics-trend-title">Income / expense trend</h2>
					<p>${this.escapeHtml(this.getTrendLabel(trend.granularity))}</p>
				</div>
				<div class="hboo-segmented-control statistics-segmented-control statistics-trend-control" role="group" aria-label="Trend series">
					<button class="hboo-segment-btn statistics-segment-btn ${mode === 'expenses' ? 'active' : ''}" type="button" data-statistics-trend-mode="expenses">Expenses</button>
					<button class="hboo-segment-btn statistics-segment-btn ${mode === 'income' ? 'active' : ''}" type="button" data-statistics-trend-mode="income">Income</button>
					<button class="hboo-segment-btn statistics-segment-btn ${mode === 'both' ? 'active' : ''}" type="button" data-statistics-trend-mode="both">Both</button>
				</div>
			</div>
			<div class="statistics-chart-card home-chart-card" data-statistics-trend-chart>
				${chartRows.length ? IncomeExpenseLineChart.render({
					rows: chartRows,
					mode,
					activeKey: this.state.activeTrendKey,
					keyField: 'key',
					titleField: 'longLabel',
					targetDataAttr: 'data-statistics-trend-point',
					targetClass: 'home-income-month',
					ariaLabel: 'Income and expenses for selected statistics period',
					formatAmount: value => this.formatMoney(value),
					getSignedAmount: value => `${Number(value) >= 0 ? '+' : '-'}${this.formatMoney(Math.abs(Number(value) || 0))}`
				}) : '<div class="statistics-empty-state">No cached transactions for this period.</div>'}
				<div class="home-month-tooltip" data-statistics-trend-tooltip role="status" aria-live="polite"></div>
				<div class="home-chart-legend">
					${mode === 'income' || mode === 'both' ? '<span><i class="home-legend-income"></i>Income</span>' : ''}
					${mode === 'expenses' || mode === 'both' ? '<span><i class="home-legend-expense"></i>Expenses</span>' : ''}
				</div>
			</div>
		</section>`
	}

	selectTrendPoint(key, target = null) {
		this.state = {
			...this.state,
			activeTrendKey: key
		}
		this.renderTrendTooltip(key, target)
	}

	renderTrendTooltip(key = this.state.activeTrendKey, target = null) {
		const root = this.$hbapp.querySelector('[data-statistics-trend-tooltip]')
		if (!root) return
		const item = this.state.statistics?.trend?.items?.find(row => row.key === key)
		if (!item) {
			this.hideTrendTooltip()
			return
		}
		const net = roundMoney((Number(item.income) || 0) - (Number(item.expenses) || 0))
		const mode = this.state.trendMode
		const rows = [
			...(mode === 'income' || mode === 'both' ? [{label: 'Income', value: item.income, tone: 'success'}] : []),
			...(mode === 'expenses' || mode === 'both' ? [{label: 'Expenses', value: item.expenses, tone: 'error'}] : []),
			...(mode === 'both' ? [{label: 'Net', value: net, tone: net >= 0 ? 'success' : 'error', signed: true}] : [])
		]
		root.innerHTML = `<div class="home-month-tooltip-card">
			<div class="home-month-tooltip-title">${this.escapeHtml(this.getRangeLabel(item))}</div>
			<div class="home-month-tooltip-grid">
				${rows.map(row => `<span>${this.escapeHtml(row.label)}</span>
					<strong class="${row.tone === 'success' ? 'success-text' : 'error-text'}">${row.signed && row.value > 0 ? '+' : ''}${this.formatMoney(row.value)}</strong>`).join('')}
			</div>
			<div class="home-month-tooltip-status">${this.escapeHtml(this.getTrendLabel(this.state.statistics.trend.granularity))}</div>
		</div>`
		root.classList.add('active')
		root.setAttribute('aria-hidden', 'false')
		this.positionTrendTooltip(target)
	}

	positionTrendTooltip(target) {
		const tooltip = this.$hbapp.querySelector('[data-statistics-trend-tooltip]')
		const card = this.$hbapp.querySelector('[data-statistics-trend-chart]')
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

	hideTrendTooltip() {
		this.state = {
			...this.state,
			activeTrendKey: null
		}
		const root = this.$hbapp.querySelector('[data-statistics-trend-tooltip]')
		if (root) {
			root.classList.remove('active', 'home-month-tooltip-below')
			root.setAttribute('aria-hidden', 'true')
			root.innerHTML = ''
		}
		this.$hbapp.querySelectorAll?.('[data-statistics-trend-point]')?.forEach(button => {
			button.classList.remove('active')
		})
	}

	getCategoriesTemplate() {
		const stats = this.state.statistics
		const items = stats.categories.items
		return `<section class="statistics-section" aria-labelledby="statistics-categories-title">
			<div class="statistics-section-header">
				<div>
					<h2 id="statistics-categories-title">Expense categories</h2>
					<p>Total category expenses: ${this.escapeHtml(this.formatMoney(stats.categories.total))}</p>
				</div>
			</div>
			<div class="statistics-category-list">
				${items.length ? items.map(item => this.getCategoryRowTemplate(item, stats.categories.total)).join('') : '<div class="statistics-empty-state">No expenses in this period.</div>'}
			</div>
		</section>`
	}

	getCategoryRowTemplate(item, total) {
		const category = this.getCategoryDisplay(item.categoryId)
		const width = total > 0 ? Math.min(100, Math.max(2, item.current / total * 100)) : 0
		return `<article class="statistics-category-row">
			<div class="statistics-category-main">
				<span class="statistics-category-icon ${this.escapeHtml(category.icon || 'other-icon')}" aria-hidden="true"></span>
				<div>
					<strong>${this.escapeHtml(category.name)}</strong>
					<small>${this.formatPercent(item.percentage)} of expenses</small>
				</div>
			</div>
			<div class="statistics-category-values">
				<strong>${this.formatMoney(item.current)}</strong>
				${this.getChangeTemplate(item.change)}
			</div>
			<div class="statistics-category-bar" aria-hidden="true"><span style="width:${width.toFixed(1)}%"></span></div>
		</article>`
	}

	getComparisonTemplate() {
		const rows = this.state.statistics.categories.items.slice(0, 8)
		return `<section class="statistics-section" aria-labelledby="statistics-comparison-title">
			<div class="statistics-section-header">
				<div>
					<h2 id="statistics-comparison-title">Period comparison</h2>
					<p>${this.escapeHtml(this.getComparisonLabel())}</p>
				</div>
			</div>
			<div class="statistics-table-wrap">
				<table class="statistics-comparison-table">
					<thead>
						<tr>
							<th>Category</th>
							<th>Previous</th>
							<th>Current</th>
							<th>Change</th>
						</tr>
					</thead>
					<tbody>
						${rows.length ? rows.map(item => this.getComparisonRowTemplate(item)).join('') : '<tr><td colspan="4">No comparable category expenses.</td></tr>'}
					</tbody>
				</table>
			</div>
		</section>`
	}

	getComparisonRowTemplate(item) {
		const category = this.getCategoryDisplay(item.categoryId)
		return `<tr>
			<td class="statistics-comparison-category">${this.escapeHtml(category.name)}</td>
			<td data-label="Previous">${this.formatMoney(item.previous)}</td>
			<td data-label="Current">${this.formatMoney(item.current)}</td>
			<td data-label="Change">${this.getChangeTemplate(item.change)}</td>
		</tr>`
	}

	getPlanningTemplate() {
		const planning = this.state.statistics.planning
		return `<section class="statistics-section statistics-planning-section" aria-labelledby="statistics-planning-title">
			<div class="statistics-section-header">
				<div>
					<h2 id="statistics-planning-title">Planning vs Actual</h2>
					<p>${planning.inScope ? 'Uses current local Planning period items.' : 'No local Planning period overlaps this selection.'}</p>
				</div>
				<button class="hboo-button" type="button" data-statistics-nav="planning">Open Planning</button>
			</div>
			<div class="statistics-card-grid statistics-planning-grid">
				${this.getOverviewCardTemplate({label: 'Planned expenses', value: planning.planned, tone: 'neutral'})}
				${this.getOverviewCardTemplate({label: 'Confirmed/linked actual', value: planning.actual, tone: 'error'})}
				${this.getOverviewCardTemplate({label: 'Unconfirmed remaining', value: planning.difference, tone: planning.difference < 0 ? 'error' : 'neutral', signed: true})}
				<article class="statistics-overview-card">
					<span>Items</span>
					<strong>${planning.completedCount} completed / ${planning.pendingCount} pending</strong>
					<small>${planning.cancelledCount} cancelled</small>
				</article>
			</div>
		</section>`
	}

	getCoverageNoteTemplate() {
		const coverage = this.state.statistics?.coverage
		const comparisonCoverage = getCoverageForRange({
			coverage: this.state.coverage,
			dateFrom: this.state.statistics.comparisonRange.dateFrom,
			dateTo: this.state.statistics.comparisonRange.dateTo
		})
		const currentCoverage = getCoverageForRange({
			coverage: this.state.coverage,
			dateFrom: this.state.statistics.range.dateFrom,
			dateTo: this.state.statistics.range.dateTo
		})
		if (coverage?.complete && comparisonCoverage === COVERAGE_COMPLETE && currentCoverage === COVERAGE_COMPLETE) return ''
		return `<p class="statistics-coverage-note">Analytics use local cached history. Current period: ${this.escapeHtml(currentCoverage)}. Comparison period: ${this.escapeHtml(comparisonCoverage)}.</p>`
	}

	getCategoryDisplay(categoryId) {
		const category = this.state.categories.find(item => String(item.id) === String(categoryId))
		return {
			name: category?.name || (String(categoryId) === 'uncategorized' ? 'Без категорії' : `Category #${categoryId}`),
			icon: category?.icon || 'other-icon'
		}
	}

	getChangeTemplate(change) {
		if (!change) return ''
		const tone = change.direction === 'up' ? 'error-text' : change.direction === 'down' ? 'success-text' : ''
		const className = ['statistics-change-value', tone].filter(Boolean).join(' ')
		const sign = change.absolute > 0 ? '+' : change.absolute < 0 ? '-' : ''
		const percent = change.percentage === null
			? 'n/a'
			: `${change.percentage > 0 ? '+' : ''}${this.formatPercent(change.percentage)}`
		return `<small class="${className}">${sign}${this.formatMoney(Math.abs(change.absolute))} (${percent})</small>`
	}

	getComparisonLabel() {
		const stats = this.state.statistics
		if (!stats) return ''
		const current = this.getRangeLabel(stats.range)
		const previous = this.getRangeLabel(stats.comparisonRange)
		const mode = stats.comparisonMode === 'same_elapsed'
			? 'same elapsed time'
			: stats.comparisonMode === 'full_period'
				? 'previous full period'
				: 'previous equivalent period'
		return `${current} compared with ${previous} (${mode}).`
	}

	getTrendLabel(granularity) {
		if (granularity === 'day') return 'Daily income and expenses.'
		if (granularity === 'week') return 'Weekly income and expenses.'
		return 'Monthly income and expenses.'
	}

	getRangeLabel(range) {
		return `${this.timeStampToStringDate(range.dateFrom)} - ${this.timeStampToStringDate(range.dateTo)}`
	}

	formatMoney(value) {
		return `${roundMoney(value).toLocaleString('uk-UA', {
			maximumFractionDigits: 2,
			minimumFractionDigits: 2
		})} грн`
	}

	formatPercent(value) {
		return `${roundMoney(value).toLocaleString('uk-UA', {
			maximumFractionDigits: 1,
			minimumFractionDigits: 0
		})}%`
	}

	escapeHtml(value = '') {
		return String(value)
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#039;')
	}
}
