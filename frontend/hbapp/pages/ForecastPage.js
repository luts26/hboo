import AbstractClass from './AbstractClass.js'
import balanceStore from '../stores/BalanceStore.js'
import planningStore from '../stores/PlanningStore.js'
import CategoryApiService from '../services/CategoryApiService.js'
import networkStatusService from '../services/NetworkStatusService.js'
import {
	buildForecastFromStates,
	getMissingLinkedStateItemIds
} from '../services/FinancialForecastAdapter.js'

const PERIOD_OPTIONS = [
	{value: 'current-period', label: 'Current period'},
	{value: 'next-7', label: 'Next 7 days'},
	{value: 'next-14', label: 'Next 14 days'},
	{value: 'next-30', label: 'Next 30 days'}
]

const STALE_BALANCE_MS = 24 * 60 * 60 * 1000

export default class ForecastPage extends AbstractClass {

	pageName = 'forecast'
	categoryApiService = new CategoryApiService()
	unsubscribePlanning = null
	unsubscribeBalance = null
	unsubscribeNetwork = null
	linkHydrationIds = new Set()
	activeChartKey = null
	state = {
		rangePreset: 'current-period',
		planningState: planningStore.getState(),
		balanceState: balanceStore.getState(),
		networkState: networkStatusService.getState(),
		categories: [],
		forecast: null,
		error: null,
		linkHydrating: false,
		ambiguousExpanded: false
	}

	constructor(hbapp) {
		super(hbapp)
		this.handleChartHover = event => {
			const target = event.target.closest('[data-forecast-day]')
			if (target) this.showChartTooltip(target.dataset.forecastDay, target)
		}
		this.handleChartMouseOut = event => {
			const chart = event.target.closest('[data-forecast-chart]')
			if (chart && !chart.contains(event.relatedTarget)) this.hideChartTooltip()
		}
		this.handleOutsidePointer = event => {
			if (!event.target.closest('[data-forecast-day], [data-forecast-tooltip]')) this.hideChartTooltip()
		}
		this.init()
	}

	init() {
		this.unsubscribePlanning = planningStore.subscribe(state => {
			this.state.planningState = state
			this.recalculate()
			this.hydrateLinkedTransactions()
		})
		this.unsubscribeBalance = balanceStore.subscribe(state => {
			this.state.balanceState = state
			this.recalculate()
		})
		this.unsubscribeNetwork = networkStatusService.subscribe(state => {
			this.state.networkState = state
			this.render()
			if (state.network === 'online') this.hydrateLinkedTransactions()
		})
		this.$hbapp.addEventListener('mouseover', this.handleChartHover)
		this.$hbapp.addEventListener('focusin', this.handleChartHover)
		this.$hbapp.addEventListener('mouseout', this.handleChartMouseOut)
		document.addEventListener('pointerdown', this.handleOutsidePointer)
		this.loadCategories()
		balanceStore.hydrateFromCache().then(() => this.recalculate()).catch(() => {})
		planningStore.load().then(() => this.hydrateLinkedTransactions()).catch(() => {})
		this.recalculate()
	}

	destroy() {
		if (this.unsubscribePlanning) this.unsubscribePlanning()
		if (this.unsubscribeBalance) this.unsubscribeBalance()
		if (this.unsubscribeNetwork) this.unsubscribeNetwork()
		this.unsubscribePlanning = null
		this.unsubscribeBalance = null
		this.unsubscribeNetwork = null
		this.$hbapp.removeEventListener('mouseover', this.handleChartHover)
		this.$hbapp.removeEventListener('focusin', this.handleChartHover)
		this.$hbapp.removeEventListener('mouseout', this.handleChartMouseOut)
		document.removeEventListener('pointerdown', this.handleOutsidePointer)
	}

	async loadCategories() {
		const cached = await this.categoryApiService.localRepository.getCached('uk').catch(() => null)
		if (cached?.items?.length) {
			this.state.categories = cached.items
			this.render()
			return cached.items
		}
		const categories = await this.categoryApiService.loadCategories('uk').catch(() => [])
		this.state.categories = Array.isArray(categories) ? categories : []
		this.render()
		return this.state.categories
	}

	recalculate() {
		try {
			this.state.forecast = buildForecastFromStates({
				planningState: this.state.planningState,
				balanceState: this.state.balanceState,
				rangePreset: this.state.rangePreset
			})
			this.state.error = null
		} catch (error) {
			this.state.forecast = null
			this.state.error = error
		}
		this.render()
	}

	hydrateLinkedTransactions() {
		if (networkStatusService.isOffline()) return
		const missingIds = getMissingLinkedStateItemIds(this.state.planningState)
			.filter(id => !this.linkHydrationIds.has(id))
		if (!missingIds.length) return
		missingIds.forEach(id => this.linkHydrationIds.add(id))
		this.state.linkHydrating = true
		this.render()
		Promise.all(missingIds.map(id => planningStore.loadPlanningItemTransactions(id).catch(() => null)))
			.finally(() => {
				missingIds.forEach(id => this.linkHydrationIds.delete(id))
				this.state.linkHydrating = false
				this.render()
			})
	}

	eventsRegister(event, eventKey) {
		if (eventKey !== 'click') return
		const periodButton = event.target.closest('[data-forecast-period]')
		if (periodButton) {
			this.setRangePreset(periodButton.dataset.forecastPeriod)
			return
		}
		const planningLink = event.target.closest('[data-forecast-planning-id]')
		if (planningLink) {
			this.router.redirectRouter(`/planing#item=${encodeURIComponent(planningLink.dataset.forecastPlanningId)}`)
			return
		}
		const issueToggle = event.target.closest('[data-forecast-toggle-issues]')
		if (issueToggle) {
			this.state.ambiguousExpanded = !this.state.ambiguousExpanded
			this.render()
			return
		}
		const chartTarget = event.target.closest('[data-forecast-day]')
		if (chartTarget) {
			this.showChartTooltip(chartTarget.dataset.forecastDay, chartTarget)
		}
	}

	setRangePreset(rangePreset) {
		if (!PERIOD_OPTIONS.some(option => option.value === rangePreset)) return
		this.state.rangePreset = rangePreset
		this.activeChartKey = null
		this.recalculate()
	}

	render() {
		this.$hbapp.innerHTML = this.getTemplate()
		if (this.activeChartKey) this.renderChartTooltip(this.activeChartKey)
	}

	getTemplate() {
		return `<div class="${this.pageName}-container forecast-dashboard">
			${this.getPeriodSelectorTemplate()}
			${this.getContentTemplate()}
		</div>`
	}

	getContentTemplate() {
		if (this.state.error) {
			return `<section class="forecast-section"><div class="forecast-empty-state">${this.escapeHtml(this.state.error.message || 'Forecast is unavailable.')}</div></section>`
		}
		const forecast = this.state.forecast
		if (!forecast) {
			return '<section class="forecast-section"><div class="forecast-empty-state">Loading local forecast...</div></section>'
		}
		return `
			${this.getWarningsTemplate()}
			${this.getOverviewTemplate()}
			${this.getChartTemplate()}
			${this.getUpcomingTemplate()}
			${this.getAmbiguousTemplate()}
		`
	}

	getPeriodSelectorTemplate() {
		const rangeLabel = this.getRangeLabel(this.state.forecast?.range)
		return `<section class="forecast-period-section" aria-labelledby="forecast-period-title">
			<div class="forecast-section-header">
				<div>
					<h2 id="forecast-period-title">Forecast</h2>
					<p>${this.escapeHtml(rangeLabel || 'Scheduled Planning expenses only')}</p>
				</div>
				<div class="hboo-segmented-control forecast-segmented-control" role="group" aria-label="Forecast period">
					${PERIOD_OPTIONS.map(option => `<button class="hboo-segment-btn forecast-segment-btn ${this.state.rangePreset === option.value ? 'active' : ''}" type="button" data-forecast-period="${this.escapeHtml(option.value)}">${this.escapeHtml(option.label)}</button>`).join('')}
				</div>
			</div>
		</section>`
	}

	getOverviewTemplate() {
		const forecast = this.state.forecast
		const cards = [
			{label: 'Current bank balance', value: forecast.startingBalance, tone: forecast.startingBalance >= 0 ? 'success' : 'error'},
			{label: 'Scheduled expenses', value: forecast.scheduledExpenses, tone: forecast.scheduledExpenses > 0 ? 'error' : 'neutral', prefix: forecast.scheduledExpenses > 0 ? '-' : ''},
			{label: 'Projected ending', value: forecast.projectedEndingBalance, tone: forecast.projectedEndingBalance >= 0 ? 'success' : 'error'},
			{label: 'Minimum projected', value: forecast.minimumProjectedBalance, tone: forecast.minimumProjectedBalance >= 0 ? 'success' : 'error', secondary: this.formatDate(forecast.minimumProjectedBalanceDate)}
		]
		return `<section class="forecast-section" aria-labelledby="forecast-overview-title">
			<div class="forecast-section-header">
				<div>
					<h2 id="forecast-overview-title">Financial forecast overview</h2>
					<p>Based on scheduled Planning expenses only. Future income and unplanned everyday spending are not included.</p>
				</div>
			</div>
			<div class="forecast-card-grid">
				${cards.map(card => this.getOverviewCardTemplate(card)).join('')}
			</div>
		</section>`
	}

	getOverviewCardTemplate(card) {
		return `<article class="forecast-overview-card">
			<span>${this.escapeHtml(card.label)}</span>
			<strong class="${card.tone === 'success' ? 'success-text' : card.tone === 'error' ? 'error-text' : ''}">${this.escapeHtml(`${card.prefix || ''}${this.formatMoney(card.value)}`)}</strong>
			${card.secondary ? `<small>${this.escapeHtml(card.secondary)}</small>` : ''}
		</article>`
	}

	getWarningsTemplate() {
		const warnings = this.getWarnings()
		if (!warnings.length) return ''
		return `<section class="forecast-warning-section" aria-labelledby="forecast-warnings-title">
			<h2 id="forecast-warnings-title">Forecast warnings</h2>
			<div class="forecast-warning-list">
				${warnings.map(warning => `<div class="forecast-warning forecast-warning-${this.escapeHtml(warning.tone)}">${this.escapeHtml(warning.message)}</div>`).join('')}
			</div>
		</section>`
	}

	getWarnings() {
		const forecast = this.state.forecast
		const warnings = []
		forecast.warnings.forEach(warning => {
			if (warning.type === 'negative_balance') {
				warnings.push({
					tone: 'error',
					message: `Projected balance becomes negative on ${this.formatDate(warning.date)}: ${this.formatMoney(warning.balance)}.`
				})
			}
		})
		if (forecast.ambiguous.length) {
			warnings.push({
				tone: 'warning',
				message: `${forecast.ambiguous.length} Planning expense${forecast.ambiguous.length === 1 ? '' : 's'} could not be safely included.`
			})
		}
		if (!this.state.balanceState?.data) {
			warnings.push({tone: 'warning', message: 'Current bank balance is not available from local cache.'})
		}
		const updatedAt = forecast.balance?.freshness?.updatedAt
		if (updatedAt && Date.now() - Number(updatedAt) > STALE_BALANCE_MS) {
			warnings.push({tone: 'warning', message: `Balance snapshot may be stale. Last update: ${this.formatDateTime(updatedAt)}.`})
		}
		if (this.state.networkState?.network === 'offline' && this.getMissingLinkedStateCount() > 0) {
			warnings.push({tone: 'warning', message: 'Offline mode: linked transaction details may be incomplete until this page can refresh cached link data.'})
		}
		if (this.state.linkHydrating) {
			warnings.push({tone: 'info', message: 'Checking linked transaction details for partially paid Planning items...'})
		}
		return warnings
	}

	getMissingLinkedStateCount() {
		return getMissingLinkedStateItemIds(this.state.planningState).length
	}

	getChartTemplate() {
		const forecast = this.state.forecast
		const isConstant = this.isConstantBalanceForecast(forecast.daily)
		return `<section class="forecast-section" aria-labelledby="forecast-chart-title">
			<div class="forecast-section-header">
				<div>
					<h2 id="forecast-chart-title">Projected balance chart</h2>
					<p>${forecast.events.length ? `${forecast.events.length} scheduled expense${forecast.events.length === 1 ? '' : 's'}` : 'No scheduled future expenses in this period.'}</p>
				</div>
			</div>
			<div class="forecast-chart-card ${!forecast.events.length || isConstant ? 'forecast-chart-card-compact' : ''}" data-forecast-chart>
				${forecast.events.length || !isConstant ? this.renderBalanceChart(forecast.daily) : this.renderConstantBalanceChart(forecast.daily)}
				<div class="forecast-tooltip" data-forecast-tooltip role="status" aria-live="polite"></div>
			</div>
		</section>`
	}

	isConstantBalanceForecast(rows = []) {
		if (!rows.length) return true
		const values = rows.map(row => Number(row.closingBalance) || 0)
		return values.every(value => Math.abs(value - values[0]) < 0.005)
	}

	getChartDomain(values = []) {
		if (!values.length) return {minValue: -1, maxValue: 1}
		const actualMin = Math.min(...values)
		const actualMax = Math.max(...values)
		const midpoint = (actualMin + actualMax) / 2
		const actualSpan = actualMax - actualMin
		const magnitude = Math.max(Math.abs(actualMin), Math.abs(actualMax), 1)
		const minimumSpan = Math.max(100, magnitude * 0.03)
		const paddedSpan = Math.max(actualSpan * 1.35, minimumSpan)
		let minValue = midpoint - paddedSpan / 2
		let maxValue = midpoint + paddedSpan / 2

		if (actualMin < 0 && actualMax > 0) {
			const zeroPadding = paddedSpan * 0.08
			minValue = Math.min(minValue, -zeroPadding)
			maxValue = Math.max(maxValue, zeroPadding)
		}

		if (actualSpan === 0 && actualMin === 0) {
			minValue = -1
			maxValue = 1
		}

		return {minValue, maxValue}
	}

	renderBalanceChart(rows = []) {
		if (!rows.length) return '<div class="forecast-empty-state">No forecast days available.</div>'
		const width = 640
		const height = 190
		const padding = {top: 14, right: 16, bottom: 32, left: 54}
		const plotWidth = width - padding.left - padding.right
		const plotHeight = height - padding.top - padding.bottom
		const values = rows.map(row => Number(row.closingBalance) || 0)
		const {minValue, maxValue} = this.getChartDomain(values)
		const span = maxValue - minValue
		const yFor = value => padding.top + plotHeight - ((Number(value) - minValue) / span) * plotHeight
		const pointCount = Math.max(rows.length - 1, 1)
		const points = rows.map((row, index) => ({
			...row,
			index,
			x: rows.length === 1 ? padding.left + plotWidth / 2 : padding.left + (plotWidth * index / pointCount),
			y: yFor(row.closingBalance)
		}))
		const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')
		const zeroY = yFor(0)
		const showZeroLine = minValue < 0 && maxValue > 0
		const activePoint = points.find(point => point.dateKey === this.activeChartKey)
		const axisLabels = points
			.filter((point, index) => rows.length <= 10 || index === 0 || index === rows.length - 1 || index % Math.ceil(rows.length / 6) === 0)
			.map(point => `<text class="forecast-chart-axis-label" x="${point.x.toFixed(2)}" y="${height - 14}" text-anchor="middle">${this.escapeHtml(this.formatDayMonth(point.date))}</text>`)
			.join('')
		const targets = points.map(point => {
			const left = point.x / width * 100
			const top = point.y / height * 100
			return `<button class="forecast-chart-target ${point.closingBalance < 0 ? 'negative' : ''} ${this.activeChartKey === point.dateKey ? 'active' : ''}" type="button" data-forecast-day="${this.escapeHtml(point.dateKey)}" aria-label="${this.escapeHtml(`${this.formatDate(point.date)}. Projected balance ${this.formatMoney(point.closingBalance)}.`)}" style="left:${left.toFixed(2)}%;top:${top.toFixed(2)}%;"></button>`
		}).join('')
		return `<div class="forecast-chart-shell">
			<svg class="forecast-chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Daily projected balance">
				<line class="forecast-chart-grid" x1="${padding.left}" x2="${width - padding.right}" y1="${padding.top}" y2="${padding.top}"></line>
				<line class="forecast-chart-grid" x1="${padding.left}" x2="${width - padding.right}" y1="${(padding.top + plotHeight).toFixed(2)}" y2="${(padding.top + plotHeight).toFixed(2)}"></line>
				${showZeroLine ? `<line class="forecast-chart-grid forecast-chart-zero" x1="${padding.left}" x2="${width - padding.right}" y1="${zeroY.toFixed(2)}" y2="${zeroY.toFixed(2)}"></line>` : ''}
				<path class="forecast-chart-line" d="${path}"></path>
				${activePoint ? `<circle class="forecast-chart-marker ${activePoint.closingBalance < 0 ? 'negative' : ''}" cx="${activePoint.x.toFixed(2)}" cy="${activePoint.y.toFixed(2)}" r="4"></circle>` : ''}
				<text class="forecast-chart-value-label" x="${padding.left - 8}" y="${padding.top + 4}" text-anchor="end">${this.escapeHtml(this.formatCompactMoney(maxValue))}</text>
				<text class="forecast-chart-value-label" x="${padding.left - 8}" y="${padding.top + plotHeight}" text-anchor="end">${this.escapeHtml(this.formatCompactMoney(minValue))}</text>
				${axisLabels}
			</svg>
			<div class="forecast-chart-targets">${targets}</div>
		</div>`
	}

	renderConstantBalanceChart(rows = []) {
		if (!rows.length) return '<div class="forecast-empty-state forecast-empty-state-compact">No forecast days available.</div>'
		const first = rows[0]
		const last = rows[rows.length - 1]
		return `<div class="forecast-constant-chart" role="img" aria-label="Projected balance remains constant">
			<div class="forecast-constant-line"></div>
			<div class="forecast-constant-meta">
				<strong>${this.escapeHtml(this.formatMoney(first.closingBalance))}</strong>
				<span>${this.escapeHtml(this.formatDate(first.date))} - ${this.escapeHtml(this.formatDate(last.date))}</span>
			</div>
			<p>No scheduled future expenses are available, so the projected balance stays unchanged.</p>
		</div>`
	}

	showChartTooltip(dateKey, target) {
		this.activeChartKey = dateKey
		this.renderChartTooltip(dateKey, target)
		this.$hbapp.querySelectorAll('[data-forecast-day]').forEach(button => {
			button.classList.toggle('active', button.dataset.forecastDay === dateKey)
		})
	}

	renderChartTooltip(dateKey = this.activeChartKey, target = null) {
		const tooltip = this.$hbapp.querySelector('[data-forecast-tooltip]')
		const chart = this.$hbapp.querySelector('[data-forecast-chart]')
		const day = this.state.forecast?.daily?.find(item => item.dateKey === dateKey)
		if (!tooltip || !day) return
		tooltip.innerHTML = `<div class="forecast-tooltip-card">
			<strong>${this.escapeHtml(this.formatDate(day.date))}</strong>
			<span>Opening: ${this.escapeHtml(this.formatMoney(day.openingBalance))}</span>
			<span>Expenses: ${this.escapeHtml(this.formatMoney(day.expenses))}</span>
			<span>Closing: ${this.escapeHtml(this.formatMoney(day.closingBalance))}</span>
		</div>`
		tooltip.classList.add('active')
		if (!target || !chart) return
		const chartRect = chart.getBoundingClientRect()
		const targetRect = target.getBoundingClientRect()
		const left = Math.max(120, Math.min(targetRect.left + targetRect.width / 2 - chartRect.left, chartRect.width - 120))
		const top = Math.max(18, targetRect.top - chartRect.top - 12)
		tooltip.style.setProperty('--forecast-tooltip-x', `${left}px`)
		tooltip.style.setProperty('--forecast-tooltip-y', `${top}px`)
	}

	hideChartTooltip() {
		this.activeChartKey = null
		const tooltip = this.$hbapp.querySelector('[data-forecast-tooltip]')
		if (tooltip) {
			tooltip.classList.remove('active')
			tooltip.innerHTML = ''
		}
		this.$hbapp.querySelectorAll('[data-forecast-day]').forEach(button => button.classList.remove('active'))
	}

	getUpcomingTemplate() {
		const events = this.getEventsWithProjectedBalances()
		return `<section class="forecast-section" aria-labelledby="forecast-upcoming-title">
			<div class="forecast-section-header">
				<div>
					<h2 id="forecast-upcoming-title">Upcoming expenses</h2>
					<p>Scheduled pending Planning expenses sorted by date.</p>
				</div>
			</div>
			<div class="forecast-expense-list">
				${events.length ? events.map(event => this.getExpenseRowTemplate(event)).join('') : '<div class="forecast-empty-state">No scheduled future expenses for this period.</div>'}
			</div>
		</section>`
	}

	getEventsWithProjectedBalances() {
		const balancesByDate = new Map((this.state.forecast?.daily || []).map(day => [day.dateKey, day.closingBalance]))
		return (this.state.forecast?.events || []).map(event => ({
			...event,
			projectedBalanceAfter: balancesByDate.get(event.dateKey)
		}))
	}

	getExpenseRowTemplate(event) {
		const category = this.getCategoryName(this.getPlanningItem(event.planningItemId))
		return `<article class="forecast-expense-row">
			<div class="forecast-expense-main">
				<strong>${this.escapeHtml(event.title)}</strong>
				<span>${this.escapeHtml(this.formatDate(event.date))}${category ? ` · ${this.escapeHtml(category)}` : ''}</span>
			</div>
			<div class="forecast-expense-values">
				<strong class="error-text">-${this.escapeHtml(this.formatMoney(event.amount))}</strong>
				<small>After: ${this.escapeHtml(this.formatMoney(event.projectedBalanceAfter))}</small>
			</div>
			<button class="forecast-planning-link" type="button" data-forecast-planning-id="${this.escapeHtml(event.planningItemId)}">Planning</button>
		</article>`
	}

	getAmbiguousTemplate() {
		const forecast = this.state.forecast
		const ambiguous = forecast.ambiguous || []
		const excluded = (forecast.excluded || []).filter(item => !['completed', 'cancelled', 'outside_forecast_range'].includes(item.reason))
		const completedExcluded = (forecast.excluded || []).filter(item => ['completed', 'cancelled'].includes(item.reason))
		const visibleAmbiguous = this.state.ambiguousExpanded ? ambiguous : ambiguous.slice(0, 5)
		const hiddenAmbiguousCount = Math.max(0, ambiguous.length - visibleAmbiguous.length)
		const ambiguousSummary = this.getAmbiguousSummary(ambiguous)
		return `<section class="forecast-section" aria-labelledby="forecast-ambiguous-title">
			<div class="forecast-section-header">
				<div>
					<h2 id="forecast-ambiguous-title">Ambiguous and excluded items</h2>
					<p>Items here are separated from the projected balance to avoid unsafe financial assumptions.</p>
				</div>
			</div>
			<div class="forecast-issue-summary">
				<strong>${this.escapeHtml(ambiguousSummary)}</strong>
				<span>These expenses are not included in the projected balance.</span>
			</div>
			<div class="forecast-issue-list">
				${visibleAmbiguous.length ? visibleAmbiguous.map(item => this.getIssueRowTemplate(item, 'ambiguous')).join('') : '<div class="forecast-empty-state forecast-empty-state-small">No ambiguous Planning expenses.</div>'}
				${hiddenAmbiguousCount ? `<button class="forecast-show-more" type="button" data-forecast-toggle-issues aria-expanded="false" aria-label="Show all ambiguous Planning expenses">Show all ${ambiguous.length} ambiguous expenses</button>` : ''}
				${this.state.ambiguousExpanded && ambiguous.length > 5 ? '<button class="forecast-show-more" type="button" data-forecast-toggle-issues aria-expanded="true" aria-label="Collapse ambiguous Planning expenses">Show fewer ambiguous expenses</button>' : ''}
				${excluded.length ? excluded.map(item => this.getIssueRowTemplate(item, 'excluded')).join('') : ''}
				${completedExcluded.length ? `<details class="forecast-excluded-details"><summary>Completed or cancelled excluded items (${completedExcluded.length})</summary>${completedExcluded.map(item => this.getIssueRowTemplate(item, 'excluded')).join('')}</details>` : ''}
			</div>
		</section>`
	}

	getAmbiguousSummary(ambiguous = []) {
		const total = ambiguous.reduce((sum, item) => {
			const amount = Number(item.amount)
			return Number.isFinite(amount) ? sum + amount : sum
		}, 0)
		return `${ambiguous.length} expense${ambiguous.length === 1 ? '' : 's'} · ${this.formatMoney(total)} not included in forecast`
	}

	getIssueRowTemplate(item, type) {
		return `<article class="forecast-issue-row forecast-issue-${this.escapeHtml(type)}">
			<div>
				<strong>${this.escapeHtml(item.title || 'Planning expense')}</strong>
				<span>${this.escapeHtml(this.getReasonLabel(item.reason))}${item.date ? ` · ${this.escapeHtml(this.formatDate(item.date))}` : ''}</span>
			</div>
			<b>${this.escapeHtml(this.formatMoney(item.amount))}</b>
			${item.planningItemId ? `<button class="forecast-planning-link" type="button" data-forecast-planning-id="${this.escapeHtml(item.planningItemId)}">Planning</button>` : ''}
		</article>`
	}

	getPlanningItem(itemId) {
		return (this.state.planningState?.planningItems || []).find(item => String(item.id) === String(itemId)) || null
	}

	getCategoryName(item) {
		if (!item?.categoryId) return ''
		const category = this.state.categories.find(categoryItem => String(categoryItem.id) === String(item.categoryId))
		return category?.name || `Category #${item.categoryId}`
	}

	getReasonLabel(reason) {
		const labels = {
			missing_or_unreliable_date: 'Missing or unreliable date',
			generated_fallback_date: 'Generated fallback date',
			overdue_pending: 'Overdue pending expense',
			linked_transaction_without_reliable_remaining_amount: 'Linked expense without reliable remaining amount',
			transaction_link_state_unavailable: 'Linked transaction state is not loaded yet',
			missing_or_zero_amount: 'Missing amount',
			internal_transfer_or_savings: 'Internal transfer or savings operation',
			linked_transaction_accounted: 'Already accounted by linked transaction',
			completed: 'Completed',
			cancelled: 'Cancelled',
			outside_forecast_range: 'Outside forecast range'
		}
		return labels[reason] || reason || 'Not included'
	}

	formatMoney(value) {
		const num = Number(value) || 0
		return `${num.toLocaleString('uk-UA', {minimumFractionDigits: 2, maximumFractionDigits: 2})} грн`
	}

	formatCompactMoney(value) {
		const num = Number(value) || 0
		return `${num.toLocaleString('uk-UA', {maximumFractionDigits: 0})} грн`
	}

	formatDate(value) {
		if (!value) return '-'
		return this.timeStampToStringDate(value)
	}

	formatDateTime(value) {
		return `${this.timeStampToStringDate(value)} ${this.timeStampToStringTime(value, false)}`
	}

	formatDayMonth(value) {
		return this.timeStampToStringDayMonth(value)
	}

	getRangeLabel(range) {
		if (!range) return ''
		return `${this.formatDate(range.dateFrom)} - ${this.formatDate(range.dateTo)}`
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
