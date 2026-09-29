import AbstractClass from './AbstractClass.js'
import ConfirmModal from '../components/ConfirmModal.js'
import router from '../router/router.js'
import overlayHost from '../services/OverlayHost.js'
import ProductCatalogApiService from '../services/ProductCatalogApiService.js'
import {MEASUREMENT_LABELS, UNIT_LABELS, getAllowedUnits, normalizeSearchText} from '../services/ProductUnitService.js'
import {getCurrentPurchaseRange} from '../services/PurchaseDateRange.js'
import {subscribeProductCatalogChanges} from '../services/ProductCatalogEvents.js'

const todayInputValue = () => {
	const date = new Date()
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const toPurchasedAt = dateValue => `${dateValue || todayInputValue()}T12:00:00`

const formatMoney = value => `${(Number(value) || 0).toFixed(2)} грн`

const parseDecimalInput = value => {
	if (value === null || value === undefined) return null
	const text = String(value).trim().replace(',', '.')
	if (!text || text === '.' || text === ',') return null
	const number = Number(text)
	return Number.isFinite(number) ? number : null
}

const normalizeDecimalString = value => {
	const parsed = parseDecimalInput(value)
	return parsed === null ? '' : String(parsed)
}

const createItem = () => ({
	rowId: `row-${Date.now()}-${Math.random().toString(16).slice(2)}`,
	productId: null,
	productName: '',
	productQuery: '',
	categoryId: null,
	categoryName: '',
	measurementType: null,
	quantity: '',
	unit: '',
	total: '',
	suggestions: []
})

export default class PurchasePage extends AbstractClass {

	pageName = 'purchases'
	apiService = new ProductCatalogApiService()
	state = {
		categories: [],
		products: [],
		merchants: [],
		purchases: [],
		range: getCurrentPurchaseRange(),
		rangeUnavailableOffline: false,
		form: {
			id: null,
			date: todayInputValue(),
			merchantId: '',
			paymentType: 'bank',
			note: '',
			items: [createItem()]
		},
		createProductForRowId: null,
		createProductForm: null,
		selectedPurchase: null,
		editorOpen: false,
		deleteConfirmation: null,
		loading: true,
		saving: false,
		saveError: ''
	}

	constructor(hbapp) {
		super(hbapp)
		this.handleKeydown = event => {
			if (event.key === 'Escape' && this.state.deleteConfirmation) this.closeDeleteConfirmation()
			else if (event.key === 'Escape' && this.state.editorOpen) this.closeEditor()
		}
		document.addEventListener('keydown', this.handleKeydown)
		this.unsubscribeProductCatalogChanges = subscribeProductCatalogChanges(event => {
			if (event?.entityType !== 'purchase') return
			if (this.state.saving) return
			this.refreshSelectedRangeFromLocal().catch(() => {})
		})
		this.init()
	}

	destroy() {
		if (this.handleKeydown) document.removeEventListener('keydown', this.handleKeydown)
		if (this.unsubscribeProductCatalogChanges) this.unsubscribeProductCatalogChanges()
		overlayHost.clear('purchase-editor-modal')
	}

	init() {
		this.render()
		const range = getCurrentPurchaseRange()
		this.state.range = range
		Promise.all([
			this.apiService.loadCatalog({refresh: true}),
			this.apiService.hydrateGuaranteedPurchaseWindow({refresh: true}),
			this.apiService.loadPurchasesByRange({refresh: false, range})
		]).then(([catalog, , purchaseResult]) => {
			this.state.categories = catalog.categories || []
			this.state.products = catalog.products || []
			this.state.merchants = catalog.merchants || []
			this.state.purchases = purchaseResult?.purchases || []
			this.state.rangeUnavailableOffline = Boolean(purchaseResult?.unavailableOffline)
			this.state.loading = false
			this.render()
			this.apiService.syncService.processQueue({reason: 'purchase-page-startup'}).catch(() => {})
		})
	}

	async refreshSelectedRangeFromLocal() {
		const purchases = await this.apiService.localRepository.getPurchasesByRange(
			this.apiService.getUserId(),
			this.state.range.dateFrom,
			this.state.range.dateTo
		)
		const coverage = await this.apiService.localRepository.getPurchaseCoverage(
			this.apiService.getUserId(),
			this.state.range.dateFrom,
			this.state.range.dateTo
		)
		this.state.purchases = purchases
		this.state.rangeUnavailableOffline = purchases.length === 0 && !coverage.complete && !coverage.available
		this.state.loading = false
		this.render()
		return purchases
	}

	eventsRegister(event, type) {
		const actionTarget = event.target.closest('[data-purchase-action], [data-action]')
		const action = actionTarget?.dataset.purchaseAction || actionTarget?.dataset.action
		if (type === 'click' && action) {
			this.handleAction(action, actionTarget)
			return
		}

		if (type === 'click' && event.target.classList.contains('purchase-delete-modal-backdrop')) {
			this.closeDeleteConfirmation()
			return
		}

		if (type === 'click' && event.target.classList.contains('purchase-editor-modal-backdrop')) {
			this.closeEditor()
			return
		}

		if ((type === 'change' || type === 'input') && event.target.closest('[data-purchase-field]')) {
			this.updatePurchaseField(event.target)
			return
		}

		if ((type === 'change' || type === 'input') && event.target.closest('[data-item-field]')) {
			this.updateItemField(event.target)
			return
		}

		if ((type === 'change' || type === 'input') && event.target.closest('[data-new-product-field]')) {
			this.updateNewProductField(event.target)
			return
		}
	}

	handleAction(action, target) {
		if (action === 'add-item') this.addItem()
		if (action === 'remove-item') this.removeItem(target.dataset.rowId)
		if (action === 'select-product') this.selectProduct(target.dataset.rowId, target.dataset.productId)
		if (action === 'start-create-product') this.startCreateProduct(target.dataset.rowId)
		if (action === 'cancel-create-product') this.cancelCreateProduct()
		if (action === 'save-new-product') this.saveNewProduct()
		if (action === 'save-purchase') this.savePurchase()
		if (action === 'open-purchase') this.openPurchase(target.dataset.purchaseId)
		if (action === 'new-purchase') this.openNewPurchase()
		if (action === 'close-purchase-editor') this.closeEditor()
		if (action === 'delete-purchase') this.openDeleteConfirmation(target.dataset.purchaseId)
		if (action === 'close-delete-confirm') this.closeDeleteConfirmation()
		if (action === 'confirm-delete-purchase') this.deletePurchase()
		if (action === 'manage-products') router.redirectRouter('/products')
		if (action === 'go-purchase-analytics') router.redirectRouter('/purchases/analytics')
	}

	updatePurchaseField(input) {
		this.state.form[input.name] = input.value
	}

	updateItemField(input) {
		const row = this.getItem(input.dataset.rowId)
		if (!row) return
		row[input.name] = input.value
		if (input.name === 'productQuery') {
			row.productId = null
			row.productName = input.value
			row.suggestions = this.getSuggestions(input.value)
			this.render()
			this.restoreItemFocus(input.dataset.rowId, input.name)
			return
		}

		this.updateTotalDisplay()
	}

	restoreItemFocus(rowId, fieldName) {
		const input = document.querySelector(`[data-item-field][data-row-id="${rowId}"][name="${fieldName}"]`)
		if (!input) return
		input.focus()
		const valueLength = String(input.value || '').length
		if (typeof input.setSelectionRange === 'function') input.setSelectionRange(valueLength, valueLength)
	}

	updateNewProductField(input) {
		if (!this.state.createProductForm) return
		this.state.createProductForm[input.name] = input.value
	}

	getItem(rowId) {
		return this.state.form.items.find(item => item.rowId === rowId)
	}

	getSuggestions(query) {
		const needle = normalizeSearchText(query)
		if (!needle) return []
		return this.state.products
			.filter(product => product.status === 'active')
			.filter(product => normalizeSearchText(product.name).includes(needle))
			.slice(0, 6)
	}

	selectProduct(rowId, productId) {
		const row = this.getItem(rowId)
		const product = this.state.products.find(item => String(item.id) === String(productId))
		if (!row || !product) return
		row.productId = product.id
		row.productName = product.name
		row.productQuery = product.name
		row.categoryId = product.categoryId
		row.categoryName = product.categoryName
		row.measurementType = product.measurementType
		row.unit = getAllowedUnits(product.measurementType)[0] || ''
		row.suggestions = []
		this.render()
	}

	addItem() {
		this.state.form.items.push(createItem())
		this.render()
	}

	removeItem(rowId) {
		this.state.form.items = this.state.form.items.filter(item => item.rowId !== rowId)
		if (!this.state.form.items.length) this.state.form.items.push(createItem())
		this.render()
	}

	startCreateProduct(rowId) {
		const row = this.getItem(rowId)
		const fruits = this.state.categories.find(category => category.name === 'Фрукти')
		this.state.createProductForRowId = rowId
		this.state.createProductForm = {
			name: row?.productQuery || '',
			categoryId: fruits?.id || this.state.categories[0]?.id || '',
			measurementType: 'weight'
		}
		this.render()
	}

	cancelCreateProduct() {
		this.state.createProductForRowId = null
		this.state.createProductForm = null
		this.render()
	}

	async saveNewProduct() {
		const form = this.state.createProductForm
		if (!form?.name?.trim()) return
		const category = this.state.categories.find(item => String(item.id) === String(form.categoryId))
		const product = await this.apiService.createProduct({
			name: form.name.trim(),
			categoryId: Number(form.categoryId),
			categoryName: category?.name || null,
			measurementType: form.measurementType,
			status: 'active'
		})
		this.state.products = await this.apiService.localRepository.getProducts({includeDisabled: true})
		this.selectProduct(this.state.createProductForRowId, product.id)
		this.state.createProductForRowId = null
		this.state.createProductForm = null
		this.render()
	}

	getCalculatedTotal() {
		return this.state.form.items.reduce((sum, item) => sum + (parseDecimalInput(item.total) || 0), 0)
	}

	updateTotalDisplay() {
		const total = document.querySelector('[data-purchase-total]')
		if (total) total.textContent = formatMoney(this.getCalculatedTotal())
	}

	buildPurchasePayload() {
		const currentPurchase = this.state.selectedPurchase && String(this.state.selectedPurchase.id) === String(this.state.form.id)
			? this.state.selectedPurchase
			: this.state.purchases.find(purchase => String(purchase.id) === String(this.state.form.id))
		const selectedMerchant = this.state.merchants.find(item => String(item.id) === String(this.state.form.merchantId))
		const items = this.state.form.items
			.map(item => ({
				item,
				quantity: parseDecimalInput(item.quantity),
				total: parseDecimalInput(item.total)
			}))
			.filter(({item, quantity, total}) => item.productId && quantity > 0 && total !== null && total >= 0)
			.map(({item, quantity, total}) => ({
				...item,
				quantity,
				total
			}))
			.map(item => ({
				productId: item.productId,
				productServerId: item.productServerId,
				productName: item.productName,
				categoryId: item.categoryId,
				categoryName: item.categoryName,
				measurementType: item.measurementType,
				quantity: item.quantity,
				unit: item.unit,
				total: item.total
			}))

		return {
			id: this.state.form.id,
			localId: currentPurchase?.localId,
			serverId: currentPurchase?.serverId,
			clientMutationId: currentPurchase?.clientMutationId,
			merchantId: this.state.form.merchantId || null,
			merchantServerId: selectedMerchant?.serverId || null,
			merchantName: selectedMerchant?.name || null,
			purchasedAt: toPurchasedAt(this.state.form.date),
			paymentType: this.state.form.paymentType,
			note: this.state.form.note || null,
			total: items.reduce((sum, item) => sum + item.total, 0),
			items
		}
	}

	async savePurchase() {
		if (this.state.saving) return
		const payload = this.buildPurchasePayload()
		if (!payload.items.length) return
		this.state.saving = true
		this.state.saveError = ''
		this.render()
		try {
			await this.apiService.savePurchase(payload)
			await this.refreshSelectedRangeFromLocal()
			this.state.saving = false
			this.resetForm({render: false})
			this.closeEditor({render: false})
			this.render()
			this.apiService.syncService.processQueue({reason: 'purchase-save'}).catch(() => {})
		} catch (error) {
			this.state.saving = false
			this.state.saveError = error?.message || 'Purchase was not saved locally'
			this.render()
		}
	}

	async openPurchase(purchaseId) {
		const purchase = await this.apiService.getPurchase(purchaseId)
		this.loadPurchaseIntoForm(purchase)
		this.state.selectedPurchase = purchase
		this.state.editorOpen = true
		this.render()
	}

	openNewPurchase() {
		this.resetForm({render: false})
		this.state.editorOpen = true
		this.render()
	}

	closeEditor({render = true} = {}) {
		if (this.state.saving) return
		this.state.editorOpen = false
		this.state.createProductForRowId = null
		this.state.createProductForm = null
		this.state.saveError = ''
		overlayHost.clear('purchase-editor-modal')
		if (render) this.render()
	}

	async openDeleteConfirmation(purchaseId) {
		const purchase = await this.apiService.localRepository.getPurchase(purchaseId)
		if (!purchase) return
		this.state.deleteConfirmation = {
			purchase,
			deleting: false,
			error: ''
		}
		this.render()
	}

	closeDeleteConfirmation() {
		if (this.state.deleteConfirmation?.deleting) return
		this.state.deleteConfirmation = null
		this.render()
	}

	async deletePurchase() {
		const confirmation = this.state.deleteConfirmation
		if (!confirmation?.purchase || confirmation.deleting) return
		const purchase = confirmation.purchase
		confirmation.deleting = true
		confirmation.error = ''
		this.render()
		try {
			await this.apiService.deletePurchase(purchase)
			await this.refreshSelectedRangeFromLocal()
			this.state.deleteConfirmation = null
			if (String(this.state.form.id || '') === String(purchase.id)) {
				this.resetForm()
				return
			}
			this.render()
		} catch (error) {
			this.state.deleteConfirmation = {
				purchase,
				deleting: false,
				error: error?.message || 'Delete failed'
			}
			this.render()
		}
	}

	loadPurchaseIntoForm(purchase) {
		this.state.form = {
			id: purchase.id,
			date: String(purchase.purchasedAt || '').slice(0, 10) || todayInputValue(),
			merchantId: purchase.merchantId || '',
			paymentType: purchase.paymentType || 'bank',
			note: purchase.note || '',
			items: (purchase.items || []).map(item => ({
				...createItem(),
				productId: item.productId,
				productServerId: item.productServerId,
				productName: item.productName,
				productQuery: item.productName,
				categoryId: item.categoryId,
				categoryName: item.categoryName,
				measurementType: item.measurementType,
				quantity: normalizeDecimalString(item.quantity),
				unit: item.unit,
				total: normalizeDecimalString(item.total),
				suggestions: []
			}))
		}
		if (!this.state.form.items.length) this.state.form.items.push(createItem())
	}

	resetForm({render = true} = {}) {
		this.state.form = {
			id: null,
			date: todayInputValue(),
			merchantId: '',
			paymentType: 'bank',
			note: '',
			items: [createItem()]
		}
		this.state.selectedPurchase = null
		this.state.editorOpen = false
		this.state.createProductForRowId = null
		this.state.createProductForm = null
		this.state.saveError = ''
		if (render) this.render()
	}

	render() {
		this.$hbapp.innerHTML = this.getTemplate()
		this.renderEditorModal()
	}

	getTemplate() {
		return `<section class="purchase-workspace">
			<div class="product-toolbar">
				<div>
					<span class="product-eyebrow">Manual Purchases</span>
					<h2>${this.state.form.id ? 'Purchase details' : 'Add purchase'}</h2>
				</div>
				<div class="purchase-toolbar-actions">
					<div class="hboo-segmented-control purchase-domain-switch" role="tablist" aria-label="Purchases domain">
						<button class="hboo-segment-btn purchase-domain-btn active" type="button" role="tab" aria-selected="true">Purchases</button>
						<button class="hboo-segment-btn purchase-domain-btn" type="button" role="tab" aria-selected="false" data-purchase-action="go-purchase-analytics">Analytics</button>
					</div>
					<button class="hboo-button product-primary-action" type="button" data-purchase-action="new-purchase">+ Add purchase</button>
				</div>
			</div>
			${this.getPurchasesListTemplate()}
			${this.getDeleteConfirmationTemplate()}
		</section>`
	}

	renderEditorModal() {
		const html = this.getEditorModalTemplate()
		if (html) overlayHost.render('purchase-editor-modal', html)
		else overlayHost.clear('purchase-editor-modal')
	}

	getEditorModalTemplate() {
		if (!this.state.editorOpen) return ''
		return `<div class="app-modal-backdrop purchase-editor-modal-backdrop">
			<div class="app-modal purchase-editor-modal" role="dialog" aria-modal="true" aria-labelledby="purchase-editor-title">
				<div class="app-modal-header purchase-editor-modal-header">
					<h4 id="purchase-editor-title">${this.state.form.id ? 'Edit purchase' : 'Add purchase'}</h4>
					<button class="app-modal-close purchase-editor-modal-close" type="button" title="Close" aria-label="Close" data-purchase-action="close-purchase-editor">×</button>
				</div>
				<div class="app-modal-body purchase-editor-modal-body">
					${this.getFormTemplate()}
				</div>
			</div>
		</div>`
	}

	getDeleteConfirmationTemplate() {
		const confirmation = this.state.deleteConfirmation
		if (!confirmation?.purchase) return ''
		const purchase = confirmation.purchase

		return ConfirmModal.render({
			title: 'Delete purchase?',
			summary: this.getPurchaseIdentity(purchase),
			message: 'This purchase and all its items will be deleted.',
			cancelLabel: 'Cancel',
			confirmLabel: confirmation.deleting ? 'Deleting...' : 'Delete',
			closeAction: 'close-delete-confirm',
			confirmAction: 'confirm-delete-purchase',
			backdropClass: 'purchase-delete-modal-backdrop',
			modalClass: 'purchase-delete-modal',
			confirmVariant: 'danger',
			busy: confirmation.deleting,
			error: confirmation.error
		})
	}

	getFormTemplate() {
		return `<div class="purchase-form-card">
			<div class="purchase-meta-grid">
				<label>Date<input type="date" name="date" value="${this.escapeHtml(this.state.form.date)}" data-purchase-field></label>
				<label>Store<select name="merchantId" data-purchase-field>
					<option value="">Other / no merchant</option>
					${this.state.merchants.map(merchant => `<option value="${merchant.id}" ${String(merchant.id) === String(this.state.form.merchantId) ? 'selected' : ''}>${this.escapeHtml(merchant.name)}</option>`).join('')}
				</select></label>
				<label>Payment<select name="paymentType" data-purchase-field>
					<option value="bank" ${this.state.form.paymentType === 'bank' ? 'selected' : ''}>Bank</option>
					<option value="cash" ${this.state.form.paymentType === 'cash' ? 'selected' : ''}>Cash</option>
					<option value="other" ${this.state.form.paymentType === 'other' ? 'selected' : ''}>Other</option>
				</select></label>
			</div>
			<div class="purchase-items-title">Items</div>
			<div class="purchase-items">${this.state.form.items.map(item => this.getItemTemplate(item)).join('')}</div>
			<button class="purchase-add-item" type="button" data-purchase-action="add-item">+ Add item</button>
			${this.getCreateProductTemplate()}
			<div class="purchase-total-row">
				<span>Total</span>
				<strong data-purchase-total>${formatMoney(this.getCalculatedTotal())}</strong>
			</div>
			${this.state.saveError ? `<div class="purchase-save-error">${this.escapeHtml(this.state.saveError)}</div>` : ''}
			<div class="app-modal-actions purchase-editor-actions">
				<button type="button" data-purchase-action="close-purchase-editor" ${this.state.saving ? 'disabled' : ''}>Cancel</button>
				<button class="purchase-save product-primary-action" type="button" data-purchase-action="save-purchase" ${this.state.saving ? 'disabled' : ''}>${this.state.saving ? 'Saving...' : 'Save purchase'}</button>
			</div>
		</div>`
	}

	getItemTemplate(item) {
		const allowedUnits = getAllowedUnits(item.measurementType)
		const noMatch = item.productQuery && !item.productId && !item.suggestions.length
		return `<div class="purchase-item-row">
			<div class="purchase-product-cell">
				<input name="productQuery" value="${this.escapeHtml(item.productQuery)}" placeholder="Product" data-item-field data-row-id="${item.rowId}" autocomplete="off">
				${item.suggestions.length ? `<div class="purchase-suggestions">${item.suggestions.map(product => `
					<button type="button" data-purchase-action="select-product" data-row-id="${item.rowId}" data-product-id="${product.id}">
						${this.escapeHtml(product.name)} <span>${this.escapeHtml(product.categoryName || '')}</span>
					</button>
				`).join('')}</div>` : ''}
				${noMatch ? `<button class="purchase-create-product-link" type="button" data-purchase-action="start-create-product" data-row-id="${item.rowId}">+ Add "${this.escapeHtml(item.productQuery)}"</button>` : ''}
			</div>
			<input class="purchase-quantity" name="quantity" type="text" inputmode="decimal" value="${this.escapeHtml(item.quantity)}" placeholder="0.000" data-item-field data-row-id="${item.rowId}">
			<select class="purchase-unit" name="unit" data-item-field data-row-id="${item.rowId}">
				${allowedUnits.length ? allowedUnits.map(unit => `<option value="${unit}" ${unit === item.unit ? 'selected' : ''}>${UNIT_LABELS[unit]}</option>`).join('') : '<option value="">Unit</option>'}
			</select>
			<input class="purchase-item-total" name="total" type="text" inputmode="decimal" value="${this.escapeHtml(item.total)}" placeholder="UAH" data-item-field data-row-id="${item.rowId}">
			<button class="purchase-remove-item" type="button" data-purchase-action="remove-item" data-row-id="${item.rowId}" aria-label="Remove item">×</button>
		</div>`
	}

	getCreateProductTemplate() {
		if (!this.state.createProductForm) return ''
		return `<div class="purchase-create-product">
			<strong>Add product</strong>
			<div class="purchase-meta-grid">
				<label>Name<input name="name" value="${this.escapeHtml(this.state.createProductForm.name)}" data-new-product-field></label>
				<label>Category<select name="categoryId" data-new-product-field>${this.state.categories.map(category => `
					<option value="${category.id}" ${String(category.id) === String(this.state.createProductForm.categoryId) ? 'selected' : ''}>${this.escapeHtml(category.name)}</option>
				`).join('')}</select></label>
				<label>Measurement<select name="measurementType" data-new-product-field>${Object.entries(MEASUREMENT_LABELS).map(([value, label]) => `
					<option value="${value}" ${value === this.state.createProductForm.measurementType ? 'selected' : ''}>${label}</option>
				`).join('')}</select></label>
			</div>
			<div class="product-form-actions">
				<button class="hboo-button product-primary-action" type="button" data-purchase-action="save-new-product">Save product</button>
				<button class="hboo-button" type="button" data-purchase-action="cancel-create-product">Cancel</button>
			</div>
		</div>`
	}

	getPurchasesListTemplate() {
		const purchases = this.state.purchases.map(purchase => `<div class="purchase-history-row-wrap">
			<button class="purchase-history-row" type="button" data-purchase-action="open-purchase" data-purchase-id="${purchase.id}">
				<span>${this.escapeHtml(purchase.merchantName || 'No merchant')}</span>
				<strong>${formatMoney(purchase.total)}</strong>
				<em>${this.escapeHtml(String(purchase.purchasedAt || '').slice(0, 10))} · ${this.escapeHtml(purchase.paymentType)}${this.getSyncStatusLabel(purchase)}</em>
			</button>
			<button class="purchase-delete" type="button" data-purchase-action="delete-purchase" data-purchase-id="${purchase.id}" aria-label="Delete purchase">Delete</button>
		</div>`).join('')
		const body = this.state.rangeUnavailableOffline
			? '<div class="product-empty">This purchase range is not available offline.</div>'
			: (this.state.loading ? '<div class="product-empty">Loading...</div>' : purchases || '<div class="product-empty">No purchases yet</div>')
		return `<aside class="purchase-history">
			<h3>Saved purchases</h3>
			${body}
		</aside>`
	}

	getSyncStatusLabel(purchase) {
		if (purchase.syncStatus === 'pending_create' || purchase.syncStatus === 'pending_update') return ' · Pending sync'
		if (purchase.syncStatus === 'syncing') return ' · Syncing'
		if (purchase.syncStatus === 'error') return ' · Sync error'
		return ''
	}

	getPurchaseIdentity(purchase) {
		return [
			purchase.merchantName || 'No merchant',
			formatMoney(purchase.total),
			this.formatPurchaseDate(purchase.purchasedAt)
		].filter(Boolean).join(' · ')
	}

	formatPurchaseDate(value) {
		const [year, month, day] = String(value || '').slice(0, 10).split('-')
		return year && month && day ? `${day}.${month}.${year}` : ''
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
