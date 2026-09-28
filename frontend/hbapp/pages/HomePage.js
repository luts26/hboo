import AbstractClass from './AbstractClass.js'
import TransactionLocalRepository from '../services/TransactionLocalRepository.js'
import CategoryApiService from '../services/CategoryApiService.js'
import BalanceApiService from '../services/BalanceApiService.js'
import BalanceHistoryLocalRepository from '../services/BalanceHistoryLocalRepository.js'
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
	normalizeDateRange,
	startOfLocalMonth
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
	balanceHistoryRepository = new BalanceHistoryLocalRepository()
	categoryApiService = new CategoryApiService()
	balanceApiService = new BalanceApiService()
	incomePeriodMonths = 6
	financialProvider = 'mono'
	financialPeriodMonths = 6
	categoryRange = getCurrentMonthRange()
	categories = []
	activeMonth = null
	activeFinancialSnapshot = null
	state = {
		loading: true,
		error: null,
		monthly: [],
		financialPosition: {
			loading: true,
			error: null,
			source: null,
			snapshots: [],
			range: getRecentMonthRange(6)
		},
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
		this.handleFinancialHover = event => {
			const pointTarget = event.target.closest('[data-financial-snapshot]')
			if (pointTarget) this.selectFinancialSnapshot(pointTarget.dataset.financialSnapshot, pointTarget)
		}
		this.handleChartMouseOut = event => {
			const chart = event.target.closest('[data-home-income-chart]')
			if (chart && !chart.contains(event.relatedTarget)) this.hideMonthTooltip()
			const financialChart = event.target.closest('[data-home-financial-chart]')
			if (financialChart && !financialChart.contains(event.relatedTarget)) this.hideFinancialTooltip()
		}
		this.handleOutsidePointer = event => {
			if (!event.target.closest('[data-home-month], [data-home-month-tooltip]')) this.hideMonthTooltip()
			if (!event.target.closest('[data-financial-snapshot], [data-financial-tooltip]')) this.hideFinancialTooltip()
		}
		this.init()
	}

	init() {
		this.$hbapp.innerHTML = this.getTemplate()
		this.$hbapp.addEventListener('mouseover', this.handleMonthHover)
		this.$hbapp.addEventListener('focusin', this.handleMonthHover)
		this.$hbapp.addEventListener('mouseover', this.handleFinancialHover)
		this.$hbapp.addEventListener('focusin', this.handleFinancialHover)
		this.$hbapp.addEventListener('mouseout', this.handleChartMouseOut)
		document.addEventListener('pointerdown', this.handleOutsidePointer)
		this.loadAnalytics()
	}

	destroy() {
		this.$hbapp.removeEventListener('mouseover', this.handleMonthHover)
		this.$hbapp.removeEventListener('focusin', this.handleMonthHover)
		this.$hbapp.removeEventListener('mouseover', this.handleFinancialHover)
		this.$hbapp.removeEventListener('focusin', this.handleFinancialHover)
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
					<div class="hboo-segmented-control home-segmented-control" role="group" aria-label="Income analytics period">
						<button class="hboo-segment-btn home-segment-btn active" type="button" data-home-income-period="6">6 months</button>
						<button class="hboo-segment-btn home-segment-btn" type="button" data-home-income-period="12">1 year</button>
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
			<section class="home-analytics-section" aria-labelledby="home-financial-title">
				<div class="home-section-header home-financial-header">
					<div>
						<h2 id="home-financial-title">Financial Position</h2>
						<p class="home-section-note" data-home-financial-note>Loading cached balance history...</p>
					</div>
					<div class="home-financial-controls">
						<div class="hboo-segmented-control home-segmented-control" role="group" aria-label="Financial position provider">
							<button class="hboo-segment-btn home-segment-btn active" type="button" data-financial-provider="mono">Mono</button>
							<button class="hboo-segment-btn home-segment-btn" type="button" data-financial-provider="privat">Privat</button>
						</div>
						<div class="hboo-segmented-control home-segmented-control" role="group" aria-label="Financial position period">
							<button class="hboo-segment-btn home-segment-btn active" type="button" data-financial-period="6">6 months</button>
							<button class="hboo-segment-btn home-segment-btn" type="button" data-financial-period="12">1 year</button>
						</div>
					</div>
				</div>
				<div class="home-chart-card">
					<div class="home-financial-chart" data-home-financial-chart></div>
					<div class="home-month-tooltip home-financial-tooltip" data-financial-tooltip role="status" aria-live="polite"></div>
					<div class="home-chart-legend">
						<span><i class="home-legend-own"></i>Own funds</span>
						<span><i class="home-legend-credit"></i>Credit funds used</span>
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
				...this.state,
				loading: false,
				error: null,
				monthly,
				category: getCategorySpending(categoryCache?.data, this.categoryRange),
				coverage: getCoveragePresentation(incomeCache?.coverage),
				categoryCoverage: getCoveragePresentation(categoryCache?.coverage),
				hasIncompleteMonths: monthly.some(item => item.coverage !== COVERAGE_COMPLETE)
			}
			this.renderAnalytics()
			await this.loadFinancialPosition()
		} catch (error) {
			this.state = {
				...this.state,
				loading: false,
				error
			}
			this.renderAnalytics()
			await this.loadFinancialPosition()
		}
	}

	getFinancialRange() {
		return getRecentMonthRange(this.financialPeriodMonths)
	}

	async loadFinancialPosition() {
		const provider = this.financialProvider
		const range = this.getFinancialRange()
		this.state.financialPosition = {
			...this.state.financialPosition,
			loading: true,
			error: null,
			range
		}
		this.renderFinancialPositionSafely()

		try {
			const cached = await this.balanceHistoryRepository.getHistory({provider, ...range})
			this.state.financialPosition = {
				loading: true,
				error: null,
				source: cached.length ? 'cache' : null,
				snapshots: cached,
				range
			}
			this.renderFinancialPositionSafely()
		} catch (error) {
			this.state.financialPosition = {
				loading: true,
				error,
				source: null,
				snapshots: [],
				range
			}
			this.renderFinancialPositionSafely()
		}

		try {
			const response = await this.balanceApiService.getBalanceHistory({provider, ...range})
			await this.balanceHistoryRepository.saveHistory({
				provider,
				snapshots: Array.isArray(response?.snapshots) ? response.snapshots : []
			})
			const cached = await this.balanceHistoryRepository.getHistory({provider, ...range})
			this.state.financialPosition = {
				loading: false,
				error: null,
				source: 'api',
				snapshots: cached,
				range
			}
			this.renderFinancialPositionSafely()
		} catch (error) {
			this.state.financialPosition = {
				...this.state.financialPosition,
				loading: false,
				error,
				source: this.state.financialPosition.snapshots.length ? 'cache' : null
			}
			this.renderFinancialPositionSafely()
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
		this.renderFinancialPositionSafely()
		this.renderCategorySpending()
	}

	renderFinancialPositionSafely() {
		try {
			this.renderFinancialPosition()
		} catch (error) {
			this.state.financialPosition = {
				...(this.state.financialPosition || {}),
				loading: false,
				error
			}
			const chart = this.$hbapp.querySelector('[data-home-financial-chart]')
			const note = this.$hbapp.querySelector('[data-home-financial-note]')
			if (chart) chart.innerHTML = '<div class="home-empty-state">Financial Position is unavailable.</div>'
			if (note) note.textContent = 'Could not render cached balance history.'
		}
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
		const maxAmount = rows.reduce((max, item) => {
			if (item.coverage === 'missing') return max
			return Math.max(max, item.income, item.expenses)
		}, 0)
		if (note) {
			const noteText = getIncomeCoverageNote(rows)
			note.textContent = noteText
			note.hidden = !noteText
		}
		chart.innerHTML = rows.length
			? this.getIncomeLineChartTemplate(rows, maxAmount)
			: '<div class="home-empty-state">No cached transactions for this period.</div>'
		this.hideMonthTooltip()
	}

	getNiceChartMax(maxAmount) {
		const amount = Number(maxAmount) || 0
		if (amount <= 0) return 1
		const exponent = Math.floor(Math.log10(amount))
		const base = 10 ** exponent
		const normalized = amount / base
		const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
		return nice * base
	}

	formatAxisAmount(value) {
		const amount = Number(value) || 0
		return amount.toLocaleString('uk-UA', {
			compactDisplay: 'short',
			maximumFractionDigits: amount >= 1000 ? 1 : 0,
			notation: amount >= 10000 ? 'compact' : 'standard'
		})
	}

	getLineSegments(points, key) {
		return points.reduce((segments, point) => {
			if (point.coverage === 'missing') return segments
			const command = `${segments.current.length ? 'L' : 'M'} ${point.x.toFixed(2)} ${point[key].toFixed(2)}`
			segments.current.push(command)
			if (!points[point.index + 1] || points[point.index + 1].coverage === 'missing') {
				segments.paths.push(segments.current.join(' '))
				segments.current = []
			}
			return segments
		}, {current: [], paths: []}).paths
	}

	getIncomeLineChartTemplate(rows, maxAmount) {
		const width = 640
		const height = 250
		const padding = {top: 14, right: 18, bottom: 38, left: 50}
		const plotWidth = width - padding.left - padding.right
		const plotHeight = height - padding.top - padding.bottom
		const scaleMax = this.getNiceChartMax(maxAmount)
		const pointCount = Math.max(rows.length - 1, 1)
		const yFor = value => padding.top + plotHeight - ((Number(value) || 0) / scaleMax) * plotHeight
		const points = rows.map((item, index) => {
			const x = padding.left + (plotWidth * index / pointCount)
			const missing = item.coverage === 'missing'
			return {
				...item,
				index,
				x,
				incomeY: missing ? null : yFor(item.income),
				expenseY: missing ? null : yFor(item.expenses),
				targetY: missing ? padding.top + plotHeight : yFor(Math.max(item.income, item.expenses))
			}
		})
		const ticks = [scaleMax, scaleMax * .75, scaleMax * .5, scaleMax * .25, 0]
		const incomePaths = this.getLineSegments(points, 'incomeY')
		const expensePaths = this.getLineSegments(points, 'expenseY')
		const axisLabels = points.map(point => {
			const axisLabel = rows.length > 6 ? String(point.label).split(' ')[0] : point.label
			return `<text class="home-line-axis-label" x="${point.x.toFixed(2)}" y="${height - 14}" text-anchor="middle">${this.escapeHtml(axisLabel)}</text>`
		}).join('')
		const yTicks = ticks.map(value => {
			const y = yFor(value)
			return `<g>
				<line class="home-line-grid" x1="${padding.left}" x2="${width - padding.right}" y1="${y.toFixed(2)}" y2="${y.toFixed(2)}"></line>
				<text class="home-line-y-label" x="${padding.left - 8}" y="${(y + 4).toFixed(2)}" text-anchor="end">${this.escapeHtml(this.formatAxisAmount(value))}</text>
			</g>`
		}).join('')
		const markers = points.map(point => {
			if (point.coverage === 'missing') {
				return `<circle class="home-line-marker home-line-marker-missing" cx="${point.x.toFixed(2)}" cy="${(padding.top + plotHeight).toFixed(2)}" r="4"></circle>`
			}
			const coverageClass = point.coverage === 'partial' ? ' home-line-marker-partial' : ''
			return `<circle class="home-line-marker home-line-marker-income${coverageClass}" cx="${point.x.toFixed(2)}" cy="${point.incomeY.toFixed(2)}" r="4"></circle>
				<circle class="home-line-marker home-line-marker-expense${coverageClass}" cx="${point.x.toFixed(2)}" cy="${point.expenseY.toFixed(2)}" r="4"></circle>`
		}).join('')
		const targets = points.map(point => {
			const isActive = point.month === this.activeMonth
			const statusLabel = this.getCoverageLabel(point.coverage)
			const left = (point.x / width) * 100
			const top = (point.targetY / height) * 100
			const valueLabel = point.coverage === 'missing'
				? statusLabel
				: `Income ${this.formatAmount(point.income)}. Expenses ${this.formatAmount(point.expenses)}. Net ${this.getSignedAmount(point.net)}. ${statusLabel}`
			return `<button class="home-income-month home-income-month-${this.escapeHtml(point.coverage)} ${isActive ? 'active' : ''}" type="button" data-home-month="${this.escapeHtml(point.month)}" aria-label="${this.escapeHtml(`${point.longLabel}. ${valueLabel}`)}" style="left:${left.toFixed(2)}%; top:${top.toFixed(2)}%;">
				<span class="home-income-target-dot" aria-hidden="true"></span>
			</button>`
		}).join('')

		return `<div class="home-income-line-shell">
			<svg class="home-income-line-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Income and expenses by month">
				${yTicks}
				<line class="home-line-axis" x1="${padding.left}" x2="${width - padding.right}" y1="${padding.top + plotHeight}" y2="${padding.top + plotHeight}"></line>
				${axisLabels}
				${incomePaths.map(path => `<path class="home-line-series home-line-series-income" d="${path}"></path>`).join('')}
				${expensePaths.map(path => `<path class="home-line-series home-line-series-expense" d="${path}"></path>`).join('')}
				${markers}
			</svg>
			<div class="home-income-targets">${targets}</div>
		</div>`
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

	renderFinancialPosition() {
		const chart = this.$hbapp.querySelector('[data-home-financial-chart]')
		const note = this.$hbapp.querySelector('[data-home-financial-note]')
		const tooltip = this.$hbapp.querySelector('[data-financial-tooltip]')
		if (!chart) return

		const financial = this.state.financialPosition || {}
		const snapshots = Array.isArray(financial.snapshots) ? financial.snapshots : []
		const observations = snapshots.filter(item => item.inRange !== false)

		if (note) {
			if (financial.loading && !snapshots.length) {
				note.textContent = 'Reading cached balance history.'
			} else if (financial.source === 'api') {
				note.textContent = 'Persisted history loaded and cached locally.'
			} else if (financial.source === 'cache') {
				note.textContent = financial.error ? 'Offline · showing cached balance history.' : 'Cached balance history.'
			} else {
				note.textContent = 'No cached balance history for this selection.'
			}
		}

		if (financial.loading && !snapshots.length) {
			chart.innerHTML = '<div class="home-empty-state">Loading cached balance history...</div>'
			if (tooltip) tooltip.innerHTML = ''
			return
		}

		if (!observations.length) {
			chart.innerHTML = '<div class="home-empty-state">No balance observations for this period.</div>'
			if (tooltip) tooltip.innerHTML = ''
			return
		}

		chart.innerHTML = this.getFinancialPositionChartTemplate(snapshots, financial.range)
		this.hideFinancialTooltip()
	}

	getFinancialScale(points) {
		const values = points.map(point => Number(point.position) || 0)
		const maxAbs = Math.max(1, ...values.map(value => Math.abs(value)))
		const exponent = Math.floor(Math.log10(maxAbs))
		const base = 10 ** exponent
		const normalized = maxAbs / base
		const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
		const bound = nice * base
		return {
			min: -bound,
			max: bound
		}
	}

	getFinancialAxisMonths(range) {
		const labels = []
		let cursor = startOfLocalMonth(range.dateFrom)
		const last = startOfLocalMonth(range.dateTo)
		while (cursor <= last) {
			labels.push({
				timestamp: cursor,
				label: new Date(cursor).toLocaleDateString('en-US', {month: 'short'})
			})
			const next = new Date(cursor)
			cursor = new Date(next.getFullYear(), next.getMonth() + 1, 1).getTime()
		}
		return labels
	}

	getFinancialPositionChartTemplate(snapshots, range) {
		const width = 640
		const height = 250
		const padding = {top: 16, right: 18, bottom: 38, left: 54}
		const plotWidth = width - padding.left - padding.right
		const plotHeight = height - padding.top - padding.bottom
		const visibleSnapshots = snapshots.filter(item => Number(item.timestamp) > 0)
		const scale = this.getFinancialScale(visibleSnapshots)
		const firstTimestamp = Math.min(...visibleSnapshots.map(item => item.timestamp))
		const lastTimestamp = Math.max(...visibleSnapshots.map(item => item.timestamp))
		const dateFrom = Math.min(Number(range?.dateFrom) || firstTimestamp, firstTimestamp)
		const dateTo = Math.max(Number(range?.dateTo) || lastTimestamp, lastTimestamp)
		const rangeMs = Math.max(1, dateTo - dateFrom)
		const xFor = timestamp => padding.left + ((timestamp - dateFrom) / rangeMs) * plotWidth
		const yFor = value => padding.top + ((scale.max - value) / (scale.max - scale.min)) * plotHeight
		const points = visibleSnapshots.map(item => ({
			...item,
			x: xFor(Number(item.timestamp)),
			y: yFor(Number(item.position) || 0)
		}))
		const pointsByAccount = points.reduce((result, point) => {
			const key = point.accountId || point.providerAccountId || 'default'
			if (!result.has(key)) result.set(key, [])
			result.get(key).push(point)
			return result
		}, new Map())
		const paths = Array.from(pointsByAccount.values()).map(accountPoints => {
			return accountPoints
				.sort((left, right) => left.timestamp - right.timestamp)
				.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
				.join(' ')
		}).filter(Boolean)
		const ticks = [scale.max, scale.max / 2, 0, scale.min / 2, scale.min]
		const yTicks = ticks.map(value => {
			const y = yFor(value)
			const className = value === 0 ? 'home-financial-zero-line' : 'home-line-grid'
			return `<g>
				<line class="${className}" x1="${padding.left}" x2="${width - padding.right}" y1="${y.toFixed(2)}" y2="${y.toFixed(2)}"></line>
				<text class="home-line-y-label" x="${padding.left - 8}" y="${(y + 4).toFixed(2)}" text-anchor="end">${this.escapeHtml(this.formatAxisAmount(value))}</text>
			</g>`
		}).join('')
		const monthLabels = this.getFinancialAxisMonths({dateFrom, dateTo}).map(item => {
			const x = xFor(item.timestamp)
			if (x < padding.left - 2 || x > width - padding.right + 2) return ''
			return `<text class="home-line-axis-label" x="${x.toFixed(2)}" y="${height - 14}" text-anchor="middle">${this.escapeHtml(item.label)}</text>`
		}).join('')
		const markers = points.map(point => {
			const stateClass = point.state === 'credit' ? 'home-financial-marker-credit' : point.state === 'zero' ? 'home-financial-marker-zero' : 'home-financial-marker-own'
			const mutedClass = point.inRange === false ? ' home-financial-marker-context' : ''
			return `<circle class="home-line-marker home-financial-marker ${stateClass}${mutedClass}" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="${point.inRange === false ? 3 : 4}"></circle>`
		}).join('')
		const targets = points.map(point => {
			const isActive = point.id === this.activeFinancialSnapshot
			const left = (point.x / width) * 100
			const top = (point.y / height) * 100
			const stateLabel = this.getFinancialStateLabel(point.state)
			const dateLabel = this.formatFinancialDate(point.timestamp)
			const context = point.inRange === false ? ' Previous snapshot before selected period.' : ''
			return `<button class="home-financial-point ${isActive ? 'active' : ''}" type="button" data-financial-snapshot="${this.escapeHtml(point.id)}" aria-label="${this.escapeHtml(`${dateLabel}. ${this.getSignedAmount(point.position)}. ${stateLabel}.${context}`)}" style="left:${left.toFixed(2)}%; top:${top.toFixed(2)}%;">
				<span class="home-income-target-dot home-financial-target-dot" aria-hidden="true"></span>
			</button>`
		}).join('')

		return `<div class="home-income-line-shell">
			<svg class="home-income-line-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Financial position history">
				${yTicks}
				<line class="home-line-axis" x1="${padding.left}" x2="${width - padding.right}" y1="${padding.top + plotHeight}" y2="${padding.top + plotHeight}"></line>
				${monthLabels}
				${paths.map(path => `<path class="home-line-series home-financial-series" d="${path}"></path>`).join('')}
				${markers}
			</svg>
			<div class="home-income-targets">${targets}</div>
		</div>`
	}

	getFinancialStateLabel(state) {
		if (state === 'credit') return 'Credit funds used'
		if (state === 'zero') return 'Own / credit boundary'
		return 'Own funds'
	}

	formatFinancialDate(timestamp) {
		return new Date(Number(timestamp)).toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		})
	}

	selectFinancialSnapshot(snapshotId, target = null) {
		if (!snapshotId) return
		this.activeFinancialSnapshot = snapshotId
		this.$hbapp.querySelectorAll('[data-financial-snapshot]').forEach(button => {
			button.classList.toggle('active', button.dataset.financialSnapshot === snapshotId)
		})
		this.renderFinancialTooltip(snapshotId, target)
	}

	renderFinancialTooltip(snapshotId = this.activeFinancialSnapshot, target = null) {
		const root = this.$hbapp.querySelector('[data-financial-tooltip]')
		if (!root) return
		const item = (this.state.financialPosition.snapshots || []).find(snapshot => snapshot.id === snapshotId)
		if (!item) {
			this.hideFinancialTooltip()
			return
		}
		const tone = item.state === 'credit' ? 'error-text' : item.state === 'own' ? 'success-text' : ''
		root.innerHTML = `<div class="home-month-tooltip-card">
			<div class="home-month-tooltip-title">${this.escapeHtml(this.formatFinancialDate(item.timestamp))}</div>
			<div class="home-month-tooltip-grid">
				<span>Position</span>
				<strong class="${tone}">${this.escapeHtml(this.getSignedAmount(item.position))}</strong>
				<span>Status</span>
				<strong>${this.escapeHtml(this.getFinancialStateLabel(item.state))}</strong>
			</div>
			${item.inRange === false ? '<div class="home-month-tooltip-status">Last snapshot before selected period</div>' : ''}
		</div>`
		root.classList.add('active')
		root.setAttribute('aria-hidden', 'false')
		this.positionFinancialTooltip(target)
	}

	positionFinancialTooltip(target) {
		const tooltip = this.$hbapp.querySelector('[data-financial-tooltip]')
		const card = this.$hbapp.querySelector('[data-home-financial-chart]')?.closest('.home-chart-card')
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

	hideFinancialTooltip() {
		this.activeFinancialSnapshot = null
		const root = this.$hbapp.querySelector('[data-financial-tooltip]')
		if (root) {
			root.classList.remove('active', 'home-month-tooltip-below')
			root.setAttribute('aria-hidden', 'true')
			root.innerHTML = ''
		}
		this.$hbapp.querySelectorAll('[data-financial-snapshot]').forEach(button => {
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

	async setFinancialProvider(provider) {
		this.financialProvider = provider === 'privat' ? 'privat' : 'mono'
		this.activeFinancialSnapshot = null
		this.$hbapp.querySelectorAll('[data-financial-provider]').forEach(button => {
			button.classList.toggle('active', button.dataset.financialProvider === this.financialProvider)
		})
		await this.loadFinancialPosition()
	}

	async setFinancialPeriod(months) {
		this.financialPeriodMonths = months === 12 ? 12 : 6
		this.activeFinancialSnapshot = null
		this.$hbapp.querySelectorAll('[data-financial-period]').forEach(button => {
			button.classList.toggle('active', Number(button.dataset.financialPeriod) === this.financialPeriodMonths)
		})
		await this.loadFinancialPosition()
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
		if (eventType === 'click' && e.target.closest('[data-financial-provider]')) {
			this.setFinancialProvider(e.target.closest('[data-financial-provider]').dataset.financialProvider)
			return
		}
		if (eventType === 'click' && e.target.closest('[data-financial-period]')) {
			this.setFinancialPeriod(Number(e.target.closest('[data-financial-period]').dataset.financialPeriod))
			return
		}
		if (eventType === 'click' && e.target.closest('[data-financial-snapshot]')) {
			const pointTarget = e.target.closest('[data-financial-snapshot]')
			this.selectFinancialSnapshot(pointTarget.dataset.financialSnapshot, pointTarget)
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
