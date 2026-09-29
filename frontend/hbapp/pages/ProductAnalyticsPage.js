import AbstractClass from './AbstractClass.js'
import router from '../router/router.js'
import overlayHost from '../services/OverlayHost.js'
import ProductCatalogApiService from '../services/ProductCatalogApiService.js'
import {buildProductDetail, calculateProductAnalytics} from '../services/ProductAnalyticsService.js'
import {
	getCurrentPurchaseRange,
	getPreviousPurchaseMonthRange,
	getRecentThreePurchaseRange
} from '../services/PurchaseDateRange.js'
import {subscribeProductCatalogChanges} from '../services/ProductCatalogEvents.js'

const PERIODS = {
	current: {
		label: 'This month',
		getRange: getCurrentPurchaseRange
	},
	previous: {
		label: 'Previous month',
		getRange: getPreviousPurchaseMonthRange
	},
	three: {
		label: '3 months',
		getRange: getRecentThreePurchaseRange
	}
}

const MONTH_LABELS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
]

const formatMoneyAmount = value => Number(value || 0).toLocaleString('uk-UA', {
	maximumFractionDigits: 2,
	minimumFractionDigits: 2
})

const formatMoney = value => `${formatMoneyAmount(value)} грн`

const formatUnitPrice = (value, unit) => value === null || value === undefined || !unit
	? '-'
	: `${formatMoneyAmount(value)} грн/${unit}`

const formatDateShort = value => {
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return '-'
	return date.toLocaleDateString('en-GB', {day: '2-digit', month: 'short'})
}

const toPeriodLabel = (period, key) => {
	const from = new Date(period.dateFrom)
	const to = new Date(period.dateTo)
	if (key === 'three') {
		const sameYear = from.getFullYear() === to.getFullYear()
		return `${MONTH_LABELS[from.getMonth()]}${sameYear ? '' : ` ${from.getFullYear()}`} - ${MONTH_LABELS[to.getMonth()]} ${to.getFullYear()}`
	}
	return `${MONTH_LABELS[from.getMonth()]} ${from.getFullYear()}`
}

export default class ProductAnalyticsPage extends AbstractClass {

	pageName = 'product analytics'
	apiService = new ProductCatalogApiService()
	state = {
		periodKey: 'current',
		period: PERIODS.current.getRange(),
		analytics: calculateProductAnalytics(),
		purchases: [],
		products: [],
		categories: [],
		merchants: [],
		coverage: null,
		unavailableOffline: false,
		loading: true,
		error: '',
		selectedCategoryId: null,
		selectedProductId: null
	}

	constructor(hbapp) {
		super(hbapp)
		this.unsubscribeProductCatalogChanges = subscribeProductCatalogChanges(event => {
			if (!['purchase', 'product', 'category', 'catalog'].includes(event?.entityType)) return
			this.refreshFromLocal().catch(() => {})
		})
		this.handleKeydown = event => {
			if (event.key === 'Escape' && this.state.selectedProductId) this.closeProductDetail()
		}
		document.addEventListener('keydown', this.handleKeydown)
		this.init()
	}

	destroy() {
		if (this.unsubscribeProductCatalogChanges) this.unsubscribeProductCatalogChanges()
		if (this.handleKeydown) document.removeEventListener('keydown', this.handleKeydown)
		overlayHost.clear('product-analytics-detail')
	}

	init() {
		this.render()
		this.loadPeriod(this.state.periodKey)
	}

	eventsRegister(event, type) {
		if (type === 'click' && event.target.classList.contains('product-analytics-detail-backdrop')) {
			this.closeProductDetail()
			return
		}
		const target = event.target.closest('[data-analytics-action]')
		if (type !== 'click' || !target) return
		const action = target.dataset.analyticsAction
		if (action === 'go-purchases') router.redirectRouter('/purchases')
		if (action === 'set-period') this.loadPeriod(target.dataset.periodKey)
		if (action === 'open-category') this.openCategory(target.dataset.categoryId)
		if (action === 'close-category') this.closeCategory()
		if (action === 'open-product') this.openProduct(target.dataset.productId)
		if (action === 'close-product') this.closeProductDetail()
	}

	async loadPeriod(periodKey = 'current') {
		const config = PERIODS[periodKey] || PERIODS.current
		const period = config.getRange()
		this.state.periodKey = PERIODS[periodKey] ? periodKey : 'current'
		this.state.period = period
		this.state.loading = true
		this.state.error = ''
		this.state.unavailableOffline = false
		this.state.selectedCategoryId = null
		this.state.selectedProductId = null
		this.render()

		try {
			const [catalog, purchaseResult] = await Promise.all([
				this.apiService.loadCatalog({refresh: true}),
				this.apiService.loadPurchasesByRange({refresh: true, range: period})
			])
			this.state.purchases = purchaseResult?.purchases || []
			this.state.products = catalog.products || []
			this.state.categories = catalog.categories || []
			this.state.merchants = catalog.merchants || []
			this.state.analytics = calculateProductAnalytics({
				purchases: this.state.purchases,
				products: this.state.products,
				categories: this.state.categories,
				period
			})
			this.state.coverage = purchaseResult?.coverage || null
			this.state.unavailableOffline = Boolean(purchaseResult?.unavailableOffline)
			this.state.loading = false
			this.render()
			this.apiService.syncService.processQueue({reason: 'product-analytics-startup'}).catch(() => {})
		} catch (error) {
			this.state.error = error?.message || 'Analytics is unavailable'
			this.state.loading = false
			this.render()
		}
	}

	async refreshFromLocal() {
		const [purchases, products, categories, merchants, coverage] = await Promise.all([
			this.apiService.localRepository.getPurchasesByRange(
				this.apiService.getUserId(),
				this.state.period.dateFrom,
				this.state.period.dateTo
			),
			this.apiService.localRepository.getProducts({includeDisabled: true}),
			this.apiService.localRepository.getCategories({includeDisabled: true}),
			this.apiService.localRepository.getMerchants({includeDisabled: true}),
			this.apiService.localRepository.getPurchaseCoverage(
				this.apiService.getUserId(),
				this.state.period.dateFrom,
				this.state.period.dateTo
			)
		])
		this.state.purchases = purchases
		this.state.products = products
		this.state.categories = categories
		this.state.merchants = merchants
		this.state.analytics = calculateProductAnalytics({
			purchases: this.state.purchases,
			products: this.state.products,
			categories: this.state.categories,
			period: this.state.period
		})
		this.state.coverage = coverage
		this.state.unavailableOffline = purchases.length === 0 && !coverage.complete && !coverage.available
		this.state.loading = false
		this.render()
	}

	openCategory(categoryId) {
		this.state.selectedCategoryId = categoryId
		this.render()
	}

	closeCategory() {
		this.state.selectedCategoryId = null
		this.render()
	}

	openProduct(productId) {
		this.state.selectedProductId = productId || null
		this.render()
	}

	closeProductDetail() {
		this.state.selectedProductId = null
		this.render()
	}

	render() {
		this.$hbapp.innerHTML = this.getTemplate()
		this.renderProductDetail()
	}

	renderProductDetail() {
		const html = this.getProductDetailTemplate()
		if (html) overlayHost.render('product-analytics-detail', html)
		else overlayHost.clear('product-analytics-detail')
	}

	getTemplate() {
		return `<section class="purchase-workspace product-analytics-workspace">
			<div class="product-toolbar">
				<div>
					<span class="product-eyebrow">Product Analytics</span>
					<h2>Product Analytics</h2>
				</div>
				<div class="purchase-toolbar-actions">
					${this.getDomainSwitchTemplate()}
				</div>
			</div>
			<div class="hboo-segmented-control product-analytics-periods" role="tablist" aria-label="Analytics period">
				${Object.entries(PERIODS).map(([key, period]) => `
					<button class="hboo-segment-btn${this.state.periodKey === key ? ' active' : ''}" type="button" role="tab" aria-selected="${this.state.periodKey === key}" data-analytics-action="set-period" data-period-key="${key}">${period.label}</button>
				`).join('')}
			</div>
			${this.getBodyTemplate()}
		</section>`
	}

	getDomainSwitchTemplate() {
		return `<div class="hboo-segmented-control purchase-domain-switch" role="tablist" aria-label="Purchases domain">
			<button class="hboo-segment-btn purchase-domain-btn" type="button" role="tab" aria-selected="false" data-analytics-action="go-purchases">Purchases</button>
			<button class="hboo-segment-btn purchase-domain-btn active" type="button" role="tab" aria-selected="true">Analytics</button>
		</div>`
	}

	getBodyTemplate() {
		if (this.state.loading) return '<div class="product-empty">Loading...</div>'
		if (this.state.error) return `<div class="product-empty">${this.escapeHtml(this.state.error)}</div>`
		if (this.state.unavailableOffline) return '<div class="product-empty">This analytics period is not available offline.</div>'

		const analytics = this.state.analytics
		if (!analytics.totals.purchasesCount && !analytics.totals.itemsCount) {
			return `<div class="product-analytics-overview">
				${this.getHeroTemplate()}
				<div class="product-empty">No purchases for this period yet.</div>
			</div>`
		}

		return `<div class="product-analytics-overview">
			${this.getHeroTemplate()}
			${this.getCoverageNoteTemplate()}
			${this.state.selectedCategoryId ? this.getCategoryDetailTemplate() : `
				${this.getCategoryBreakdownTemplate()}
				${this.getTopProductsTemplate()}
			`}
		</div>`
	}

	getHeroTemplate() {
		const totals = this.state.analytics.totals
		return `<div class="product-analytics-hero">
			<div>
				<span>${this.escapeHtml(toPeriodLabel(this.state.period, this.state.periodKey))}</span>
				<strong>${formatMoney(totals.spent)}</strong>
			</div>
			<div class="product-analytics-stats">
				<div><span>Purchases</span><strong>${totals.purchasesCount}</strong></div>
				<div><span>Items</span><strong>${totals.itemsCount}</strong></div>
				<div><span>Products</span><strong>${totals.distinctProducts}</strong></div>
			</div>
		</div>`
	}

	getCoverageNoteTemplate() {
		if (!this.state.coverage?.stale) return ''
		return '<div class="product-analytics-note">Showing cached current-month analytics.</div>'
	}

	getCategoryBreakdownTemplate() {
		const rows = this.state.analytics.categories.map(category => `
			<button class="product-analytics-row" type="button" data-analytics-action="open-category" data-category-id="${this.escapeHtml(category.categoryId)}">
				<span>${this.escapeHtml(category.name)}</span>
				<strong>${formatMoney(category.spent)}</strong>
				<em>${category.percentage.toLocaleString('uk-UA', {maximumFractionDigits: 1})}%</em>
			</button>
		`).join('')
		return `<section class="product-analytics-section">
			<h3>By category</h3>
			<div class="product-analytics-list">${rows || '<div class="product-empty">No category spending yet.</div>'}</div>
		</section>`
	}

	getTopProductsTemplate() {
		const rows = this.state.analytics.products.slice(0, 5).map(product => this.getProductRowTemplate(product)).join('')
		return `<section class="product-analytics-section">
			<h3>Top products</h3>
			<div class="product-analytics-list">${rows || '<div class="product-empty">No product spending yet.</div>'}</div>
		</section>`
	}

	getCategoryDetailTemplate() {
		const category = this.state.analytics.categories.find(item => String(item.categoryId) === String(this.state.selectedCategoryId))
		const products = this.state.analytics.products
			.filter(product => String(product.categoryId) === String(this.state.selectedCategoryId))
		return `<section class="product-analytics-section">
			<div class="product-analytics-section-header">
				<h3>${this.escapeHtml(category?.name || 'Category')}</h3>
				<button class="hboo-button" type="button" data-analytics-action="close-category">Back</button>
			</div>
			<div class="product-analytics-list">${products.map(product => this.getProductRowTemplate(product)).join('')}</div>
		</section>`
	}

	getProductRowTemplate(product) {
		return `<button class="product-analytics-row product-analytics-product-row" type="button" data-analytics-action="open-product" data-product-id="${this.escapeHtml(product.productId)}">
			<span>${this.escapeHtml(product.name)}<small>${this.escapeHtml(product.categoryName || '')}</small></span>
			<strong>${formatMoney(product.spent)}</strong>
			<em>${this.escapeHtml(product.quantityLabel || '-')} ›</em>
		</button>`
	}

	getProductDetailTemplate() {
		const detail = this.getSelectedProductDetail()
		if (!detail) return ''
		return `<div class="app-modal-backdrop product-analytics-detail-backdrop">
			<div class="app-modal product-analytics-detail-modal" role="dialog" aria-modal="true" aria-labelledby="product-analytics-detail-title">
				<div class="app-modal-header">
					<div>
						<h4 id="product-analytics-detail-title">${this.escapeHtml(detail.product.name)}</h4>
						<p>${this.escapeHtml(detail.category.name)} · ${this.escapeHtml(toPeriodLabel(this.state.period, this.state.periodKey))}</p>
					</div>
					<button class="app-modal-close" type="button" title="Close" aria-label="Close" data-analytics-action="close-product">×</button>
				</div>
				<div class="app-modal-body product-analytics-detail-body">
					<div class="product-analytics-detail-grid">
						${this.getProductDetailField('Spent', formatMoney(detail.spent))}
						${this.getProductDetailField('Purchased', detail.displayQuantity || '-')}
						${this.getProductDetailField('Average price', detail.averageUnitPriceLabel || formatUnitPrice(detail.averageUnitPrice, detail.priceUnit))}
						${this.getProductDetailField('Last price', detail.lastUnitPriceLabel || formatUnitPrice(detail.lastUnitPrice, detail.priceUnit))}
						${this.getProductDetailField('Purchases', detail.purchaseCount)}
					</div>
					${this.getRecentPurchasesTemplate(detail)}
					${this.getPriceHistoryTemplate(detail)}
				</div>
			</div>
		</div>`
	}

	getSelectedProductDetail() {
		if (!this.state.selectedProductId) return null
		return buildProductDetail({
			productId: this.state.selectedProductId,
			purchases: this.state.purchases,
			products: this.state.products,
			categories: this.state.categories,
			merchants: this.state.merchants,
			period: this.state.period
		})
	}

	getProductDetailField(label, value) {
		return `<div class="product-analytics-detail-field"><span>${this.escapeHtml(label)}</span><strong>${this.escapeHtml(value)}</strong></div>`
	}

	getRecentPurchasesTemplate(detail) {
		const rows = detail.recentPurchases.map(point => `
			<div class="product-analytics-purchase-row">
				<div class="product-analytics-purchase-title">
					<strong>${this.escapeHtml(formatDateShort(point.purchasedAt))} · ${this.escapeHtml(point.merchantName)}</strong>
				</div>
				<div class="product-analytics-purchase-values">
					<span>${this.escapeHtml(point.quantityLabel || '-')}</span>
					<span>${this.escapeHtml(point.unitPriceLabel || '-')}</span>
					<strong>${formatMoney(point.total)}</strong>
				</div>
			</div>
		`).join('')
		return `<section class="product-analytics-detail-section">
			<h5>Recent purchases</h5>
			${rows || '<div class="product-analytics-detail-empty">No comparable purchases for this period.</div>'}
		</section>`
	}

	getPriceHistoryTemplate(detail) {
		const rows = detail.history.map(point => `
			<div class="product-analytics-price-row">
				<span>${this.escapeHtml(formatDateShort(point.purchasedAt))}</span>
				<strong>${this.escapeHtml(point.unitPriceLabel || '-')}</strong>
			</div>
		`).join('')
		return `<section class="product-analytics-detail-section">
			<h5>Price history</h5>
			${rows || '<div class="product-analytics-detail-empty">No valid price points for this period.</div>'}
		</section>`
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
