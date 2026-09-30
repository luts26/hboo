import AbstractClass from './AbstractClass.js'
import ConfirmModal from '../components/ConfirmModal.js'
import router from '../router/router.js'
import overlayHost from '../services/OverlayHost.js'
import ProductCatalogApiService from '../services/ProductCatalogApiService.js'
import ReceiptLocalRepository from '../services/ReceiptLocalRepository.js'
import ReceiptApiService from '../services/ReceiptApiService.js'
import {prepareReceiptImage} from '../services/ReceiptImageService.js'
import {MEASUREMENT_LABELS, UNIT_LABELS, getAllowedUnits, normalizeSearchText} from '../services/ProductUnitService.js'
import {getCurrentPurchaseRange} from '../services/PurchaseDateRange.js'
import {subscribeProductCatalogChanges} from '../services/ProductCatalogEvents.js'

const todayInputValue = () => {
	const date = new Date()
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const toPurchasedAt = dateValue => `${dateValue || todayInputValue()}T12:00:00`

const formatMoney = value => `${(Number(value) || 0).toFixed(2)} грн`
const formatOptionalMoney = value => {
	const parsed = parseDecimalInput(value)
	return parsed === null ? '—' : formatMoney(parsed)
}

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

const extractPackageAmount = rawName => {
	const text = String(rawName || '').replace(',', '.')
	const match = text.match(/(^|[^\d])(\d+(?:\.\d+)?)\s*(кг|kg|г|g|мл|ml|л|l|шт|pcs|pc)(?![\p{L}\d])/iu)
	if (!match) return null
	const quantity = Number(match[2])
	if (!Number.isFinite(quantity) || quantity <= 0) return null
	const unit = normalizeReviewUnit(match[3])
	return unit ? {quantity, unit} : null
}

const normalizeReviewUnit = unit => {
	const text = String(unit || '').toLowerCase()
	if (['кг', 'kg'].includes(text)) return 'kg'
	if (['г', 'g'].includes(text)) return 'g'
	if (['мл', 'ml'].includes(text)) return 'ml'
	if (['л', 'l'].includes(text)) return 'l'
	if (['шт', 'pcs', 'pc'].includes(text)) return 'pcs'
	return ''
}

const deriveReviewAmount = item => {
	const receiptQuantity = parseDecimalInput(item.quantity)
	const receiptUnit = normalizeReviewUnit(item.unit)
	const packageAmount = extractPackageAmount(item.rawName)
	if (receiptUnit && receiptUnit !== 'pcs' && receiptQuantity !== null) {
		return {quantity: receiptQuantity, unit: receiptUnit}
	}
	if (packageAmount) {
		const multiplier = receiptQuantity !== null && receiptQuantity > 0 && Number.isInteger(receiptQuantity)
			? receiptQuantity
			: 1
		return {
			quantity: packageAmount.quantity * multiplier,
			unit: packageAmount.unit
		}
	}
	if (receiptUnit && receiptQuantity !== null) return {quantity: receiptQuantity, unit: receiptUnit}
	return {
		quantity: receiptQuantity,
		unit: ''
	}
}

const createReceiptReviewItem = (item = {}) => ({
	rowId: item.rowId || `review-row-${Date.now()}-${Math.random().toString(16).slice(2)}`,
	productId: item.productId || null,
	productServerId: item.productServerId || null,
	productName: item.productName || '',
	productQuery: item.productQuery || '',
	categoryId: item.categoryId || null,
	categoryName: item.categoryName || '',
	measurementType: item.measurementType || null,
	rawName: item.rawName || '',
	rawText: item.rawText || '',
	quantity: deriveReviewAmount(item).quantity === null || deriveReviewAmount(item).quantity === undefined ? '' : normalizeDecimalString(deriveReviewAmount(item).quantity),
	unit: deriveReviewAmount(item).unit || '',
	receiptQuantity: item.quantity === null || item.quantity === undefined ? null : Number(item.quantity),
	receiptUnit: item.unit || null,
	receiptUnitPrice: item.unitPrice === null || item.unitPrice === undefined ? null : Number(item.unitPrice),
	receiptLineTotal: item.total === null || item.total === undefined ? null : Number(item.total),
	total: item.total === null || item.total === undefined ? '' : normalizeDecimalString(item.total),
	confidence: Number(item.confidence || 0),
	parserWarnings: Array.isArray(item.warnings) ? item.warnings : [],
	validation: item.validation || null,
	suggestions: []
})

const createReviewMutationId = receipt => `receipt-review-${receipt?.serverReceiptId || receipt?.localId || Date.now()}`

const toDateTimeLocalValue = value => {
	const text = String(value || '').trim()
	if (!text) return `${todayInputValue()}T12:00`
	return text.slice(0, 16)
}

const toApiDateTimeValue = value => {
	const text = String(value || '').trim()
	return text ? (text.length === 16 ? `${text}:00` : text) : toPurchasedAt(todayInputValue())
}

const normalizeComparableText = value => normalizeSearchText(value).replace(/\s+/g, ' ').trim()
const matchesProductQuery = (productName, query) => {
	const needle = normalizeSearchText(query)
	if (!needle) return false
	const haystack = normalizeSearchText(productName)
	if (haystack.includes(needle)) return true
	const tokens = needle.split(/\s+/).filter(Boolean)
	return tokens.length > 1 && tokens.every(token => haystack.includes(token))
}

export default class PurchasePage extends AbstractClass {

	pageName = 'purchases'
	apiService = new ProductCatalogApiService()
	receiptLocalRepository = new ReceiptLocalRepository()
	receiptApiService = new ReceiptApiService()
	activeReceiptUrls = new Set()
	state = {
		categories: [],
		products: [],
		merchants: [],
		purchases: [],
		standaloneReceipts: [],
		range: getCurrentPurchaseRange(),
		rangeUnavailableOffline: false,
		form: {
			id: null,
			date: todayInputValue(),
			merchantId: '',
			paymentType: 'bank',
			note: '',
			items: [createItem()],
			receipt: null,
			receiptAction: null,
			receiptError: ''
		},
		createProductForRowId: null,
		createProductForm: null,
		selectedPurchase: null,
		editorOpen: false,
		receiptFlow: {
			open: false,
			origin: null,
			originalReceipt: null,
			originalReceiptAction: null,
			error: ''
		},
		receiptReview: {
			open: false,
			receiptLocalId: null,
			receiptServerId: null,
			loading: false,
			saving: false,
			error: '',
			rawOcrOpen: false,
			evidenceRowId: null,
			rawText: '',
			draft: null,
			form: null
		},
		deleteConfirmation: null,
		loading: true,
		saving: false,
		saveError: ''
	}

	constructor(hbapp) {
		super(hbapp)
		this.handleKeydown = event => {
			if (event.key === 'Escape' && this.state.deleteConfirmation) this.closeDeleteConfirmation()
			else if (event.key === 'Escape' && this.state.receiptReview.open) this.closeReceiptReview()
			else if (event.key === 'Escape' && this.state.receiptFlow.open) this.closeReceiptFlow()
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
		this.revokeReceiptUrls()
		overlayHost.clear('purchase-editor-modal')
		overlayHost.clear('receipt-flow-modal')
		overlayHost.clear('receipt-review-modal')
	}

	init() {
		this.render()
		const range = getCurrentPurchaseRange()
		this.state.range = range
		Promise.all([
			this.apiService.loadCatalog({refresh: true}),
			this.apiService.hydrateGuaranteedPurchaseWindow({refresh: true}),
			this.apiService.loadPurchasesByRange({refresh: false, range})
		]).then(async ([catalog, , purchaseResult]) => {
			this.state.categories = catalog.categories || []
			this.state.products = catalog.products || []
			this.state.merchants = catalog.merchants || []
			this.state.purchases = await this.enrichPurchasesWithReceiptState(purchaseResult?.purchases || [])
			this.state.standaloneReceipts = await this.receiptLocalRepository.listStandaloneByUser(this.apiService.getUserId())
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
		this.state.purchases = await this.enrichPurchasesWithReceiptState(purchases)
		this.state.standaloneReceipts = await this.receiptLocalRepository.listStandaloneByUser(this.apiService.getUserId())
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

		if (type === 'click' && event.target.classList.contains('receipt-flow-modal-backdrop')) {
			this.closeReceiptFlow()
			return
		}

		if (type === 'click' && event.target.classList.contains('receipt-review-modal-backdrop')) {
			this.closeReceiptReview()
			return
		}

		if ((type === 'change' || type === 'input') && event.target.closest('[data-purchase-field]')) {
			this.updatePurchaseField(event.target)
			return
		}

		if ((type === 'change' || type === 'input') && event.target.closest('[data-review-field]')) {
			this.updateReceiptReviewField(event.target)
			return
		}

		if (type === 'change' && event.target.closest('[data-receipt-input]')) {
			this.handleReceiptFile(event.target.files?.[0]).catch(() => {})
			event.target.value = ''
			return
		}

		if ((type === 'change' || type === 'input') && event.target.closest('[data-item-field]')) {
			this.updateItemField(event.target)
			return
		}

		if ((type === 'change' || type === 'input') && event.target.closest('[data-review-item-field]')) {
			this.updateReceiptReviewItemField(event.target)
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
		if (action === 'select-review-product') this.selectReceiptReviewProduct(target.dataset.rowId, target.dataset.productId)
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
		if (action === 'scan-receipt') this.openReceiptFirstFlow()
		if (action === 'open-receipt-flow') this.openReceiptFlowFromPurchase()
		if (action === 'choose-receipt') this.chooseReceipt()
		if (action === 'remove-receipt') this.removeReceipt()
		if (action === 'close-receipt-flow') this.closeReceiptFlow()
		if (action === 'continue-manually') this.continueReceiptFlowManually()
		if (action === 'save-standalone-receipt') this.saveStandaloneReceipt()
		if (action === 'use-receipt') this.useReceiptInPurchaseDraft()
		if (action === 'open-standalone-receipt') this.openStandaloneReceipt(target.dataset.receiptId)
		if (action === 'delete-standalone-receipt') this.deleteStandaloneReceipt()
		if (action === 'recognize-standalone-receipt') this.recognizeStandaloneReceipt()
		if (action === 'review-standalone-receipt') this.openReceiptReview()
		if (action === 'close-receipt-review') this.closeReceiptReview()
		if (action === 'confirm-receipt-review') this.confirmReceiptReview()
		if (action === 'add-review-item') this.addReceiptReviewItem()
		if (action === 'remove-review-item') this.removeReceiptReviewItem(target.dataset.rowId)
		if (action === 'toggle-review-evidence') this.toggleReceiptReviewEvidence(target.dataset.rowId)
		if (action === 'toggle-review-raw') this.toggleReceiptReviewRawText()
		if (action === 'use-review-items-total') this.useReviewItemsTotal()
		if (action === 'manage-products') router.redirectRouter('/products')
		if (action === 'go-purchase-analytics') router.redirectRouter('/purchases/analytics')
	}

	async enrichPurchasesWithReceiptState(purchases = []) {
		const localReceipts = await this.receiptLocalRepository.listByUser(this.apiService.getUserId()).catch(() => [])
		const byPurchase = new Map(localReceipts.map(receipt => [String(receipt.purchaseLocalId), receipt]))
		return purchases.map(purchase => {
			const receipt = byPurchase.get(String(purchase.id))
			if (!receipt) return purchase
			return {
				...purchase,
				hasReceipt: receipt.syncStatus !== 'pending_delete' || false,
				receiptSyncStatus: receipt.syncStatus
			}
		})
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

	isReceiptReviewRow(rowId) {
		return Boolean(this.state.receiptReview.open
			&& this.state.receiptReview.form?.items?.some(item => String(item.rowId) === String(rowId)))
	}

	renderAfterProductFormChange(rowId = null) {
		if (this.isReceiptReviewRow(rowId)) {
			this.renderReceiptReviewModalPreservingScroll({scrollToRowId: rowId})
			return
		}
		this.render()
	}

	getItem(rowId) {
		return this.state.form.items.find(item => item.rowId === rowId)
			|| this.state.receiptReview.form?.items?.find(item => item.rowId === rowId)
	}

	getSuggestions(query) {
		if (!normalizeSearchText(query)) return []
		return this.state.products
			.filter(product => product.status === 'active')
			.filter(product => matchesProductQuery(product.name, query))
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
		if (!row.unit || !getAllowedUnits(product.measurementType).includes(row.unit)) {
			row.unit = getAllowedUnits(product.measurementType)[0] || ''
		}
		row.suggestions = []
		this.render()
	}

	selectReceiptReviewProduct(rowId, productId) {
		const item = this.state.receiptReview.form?.items?.find(row => row.rowId === rowId)
		const product = this.state.products.find(row => String(row.id) === String(productId))
		if (!item || !product) return
		item.productId = product.id
		item.productServerId = product.serverId || item.productServerId || null
		item.productName = product.name
		item.productQuery = product.name
		item.categoryId = product.categoryId
		item.categoryName = product.categoryName
		item.measurementType = product.measurementType
		if (!item.unit || !getAllowedUnits(product.measurementType).includes(item.unit)) {
			item.unit = getAllowedUnits(product.measurementType)[0] || item.unit || ''
			this.updateReceiptReviewUnitOptionsDom(item)
		}
		item.suggestions = []
		const input = document.querySelector(`[data-review-item-field][data-row-id="${rowId}"][name="productQuery"]`)
		if (input) input.value = item.productQuery
		this.updateReceiptReviewProductDom(item)
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
			name: row?.rawName || row?.productQuery || '',
			categoryId: fruits?.id || this.state.categories[0]?.id || '',
			measurementType: 'weight'
		}
		this.renderAfterProductFormChange(rowId)
	}

	cancelCreateProduct() {
		const rowId = this.state.createProductForRowId
		this.state.createProductForRowId = null
		this.state.createProductForm = null
		this.renderAfterProductFormChange(rowId)
	}

	async saveNewProduct() {
		const form = this.state.createProductForm
		if (!form?.name?.trim()) return
		const rowId = this.state.createProductForRowId
		const exactExisting = this.state.products.find(product => product.status === 'active'
			&& normalizeComparableText(product.name) === normalizeComparableText(form.name))
		if (exactExisting) {
			if (this.isReceiptReviewRow(rowId)) this.selectReceiptReviewProduct(rowId, exactExisting.id)
			else this.selectProduct(rowId, exactExisting.id)
			this.state.createProductForRowId = null
			this.state.createProductForm = null
			this.renderAfterProductFormChange(rowId)
			return
		}
		const category = this.state.categories.find(item => String(item.id) === String(form.categoryId))
		const product = await this.apiService.createProduct({
			name: form.name.trim(),
			categoryId: Number(form.categoryId),
			categoryName: category?.name || null,
			measurementType: form.measurementType,
			status: 'active'
		})
		this.state.products = await this.apiService.localRepository.getProducts({includeDisabled: true})
		if (this.isReceiptReviewRow(rowId)) this.selectReceiptReviewProduct(rowId, product.id)
		else this.selectProduct(rowId, product.id)
		this.state.createProductForRowId = null
		this.state.createProductForm = null
		this.renderAfterProductFormChange(rowId)
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
			hasReceipt: Boolean(currentPurchase?.hasReceipt),
			receipt: currentPurchase?.receipt || null,
			note: this.state.form.note || null,
			total: items.reduce((sum, item) => sum + item.total, 0),
			items
		}
	}

	async savePurchase() {
		if (this.state.saving) return
		const payload = this.buildPurchasePayload()
		if (!payload.items.length) {
			this.state.saveError = 'Add at least one item before saving the purchase.'
			this.render()
			return
		}
		this.state.saving = true
		this.state.saveError = ''
		this.render()
		try {
			const savedPurchase = await this.apiService.savePurchase(payload)
			await this.persistReceiptState(savedPurchase)
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
		this.revokeReceiptUrls()
		this.state.editorOpen = false
		this.state.createProductForRowId = null
		this.state.createProductForm = null
		this.state.saveError = ''
		overlayHost.clear('purchase-editor-modal')
		overlayHost.clear('receipt-flow-modal')
		if (render) this.render()
	}

	openReceiptFirstFlow() {
		this.resetForm({render: false})
		this.state.editorOpen = false
		this.state.receiptFlow = {open: true, origin: 'standalone', originalReceipt: null, originalReceiptAction: null, error: ''}
		this.render()
	}

	async openReceiptFlowFromPurchase() {
		this.state.editorOpen = false
		this.state.receiptFlow = {
			open: true,
			origin: 'purchase',
			originalReceipt: this.state.form.receipt ? {...this.state.form.receipt, previewUrl: null} : null,
			originalReceiptAction: this.state.form.receiptAction,
			error: ''
		}
		await this.ensureReceiptPreviewLoaded()
		this.render()
	}

	async handleReceiptFile(file) {
		this.setReceiptError('')
		try {
			const image = await prepareReceiptImage(file)
			this.setFormReceipt({
				...image,
				previewUrl: this.createReceiptUrl(image.blob),
				source: 'local'
			}, 'upsert')
		} catch (error) {
			this.setReceiptError(error?.message || 'Could not prepare receipt photo.')
		}
	}

	chooseReceipt() {
		const input = document.querySelector('[data-receipt-input]')
		if (input) input.click()
	}

	removeReceipt() {
		if (this.state.receiptFlow.origin === 'standalone-view') {
			this.deleteStandaloneReceipt()
			return
		}
		this.clearFormReceiptPreview()
		this.state.form.receipt = null
		this.state.form.receiptAction = 'delete'
		this.setReceiptError('', {render: false})
		if (this.state.receiptFlow.origin === 'purchase') {
			this.useReceiptInPurchaseDraft()
			return
		}
		this.render()
	}

	async ensureReceiptPreviewLoaded() {
		if (this.state.form.receipt?.blob && this.state.form.receipt?.previewUrl) return
		const purchase = this.state.selectedPurchase && String(this.state.selectedPurchase.id) === String(this.state.form.id)
			? this.state.selectedPurchase
			: this.state.purchases.find(item => String(item.id) === String(this.state.form.id))
		if (!purchase && !this.state.form.receipt?.blob) return
		const localReceipt = await this.receiptLocalRepository.getByPurchaseLocalId(purchase.id).catch(() => null)
		if (localReceipt?.blob) {
			this.setFormReceipt({
				blob: localReceipt.blob,
				mimeType: localReceipt.mimeType,
				originalFilename: localReceipt.originalFilename,
				size: localReceipt.size,
				localId: localReceipt.localId,
				serverReceiptId: localReceipt.serverReceiptId,
				syncStatus: localReceipt.syncStatus,
				previewUrl: this.createReceiptUrl(localReceipt.blob),
				source: 'indexeddb'
			}, null, {render: false})
			return
		}
		if (!purchase.serverId || !purchase.hasReceipt) return
		try {
			const blob = await this.receiptApiService.getReceiptImageBlob(purchase.serverId)
			if (!blob) return
			this.setFormReceipt({
				blob,
				mimeType: blob.type || 'image/jpeg',
				originalFilename: null,
				size: blob.size,
				serverReceiptId: purchase.receipt?.id || null,
				syncStatus: 'synced',
				previewUrl: this.createReceiptUrl(blob),
				source: 'api'
			}, null, {render: false})
		} catch {
			this.setReceiptError('Could not load receipt image.', {render: false})
		}
	}

	closeReceiptFlow({returnToPurchase = this.state.receiptFlow.origin === 'purchase'} = {}) {
		if (this.state.receiptFlow.origin === 'standalone' && !returnToPurchase) {
			this.clearFormReceiptPreview()
			this.state.form.receipt = null
			this.state.form.receiptAction = null
		}
		if (this.state.receiptFlow.origin === 'purchase' && returnToPurchase) {
			this.clearFormReceiptPreview()
			const originalReceipt = this.state.receiptFlow.originalReceipt
			this.state.form.receipt = originalReceipt?.blob
				? {...originalReceipt, previewUrl: this.createReceiptUrl(originalReceipt.blob)}
				: originalReceipt
			this.state.form.receiptAction = this.state.receiptFlow.originalReceiptAction
		}
		this.state.receiptFlow = {open: false, origin: null, originalReceipt: null, originalReceiptAction: null, error: ''}
		overlayHost.clear('receipt-flow-modal')
		if (returnToPurchase) this.state.editorOpen = true
		this.render()
	}

	continueReceiptFlowManually() {
		if (!this.state.form.receipt?.blob) {
			this.state.receiptFlow.error = 'Add receipt photo before continuing.'
			this.render()
			return
		}
		this.state.receiptFlow = {open: false, origin: null, originalReceipt: null, originalReceiptAction: null, error: ''}
		this.state.editorOpen = true
		overlayHost.clear('receipt-flow-modal')
		this.render()
	}

	async saveStandaloneReceipt() {
		if (!this.state.form.receipt?.blob) {
			this.state.receiptFlow.error = 'Add receipt photo before saving.'
			this.render()
			return
		}
		const receipt = await this.receiptLocalRepository.saveStandalone({image: this.state.form.receipt})
		await this.apiService.syncService.enqueueMutation({
			entityType: 'receipt',
			entityLocalId: receipt.localId,
			action: 'upsert',
			reason: 'standalone-receipt-save'
		})
		this.clearFormReceiptPreview()
		this.state.form.receipt = null
		this.state.form.receiptAction = null
		this.state.receiptFlow = {open: false, origin: null, originalReceipt: null, originalReceiptAction: null, error: ''}
		this.state.standaloneReceipts = await this.receiptLocalRepository.listStandaloneByUser(this.apiService.getUserId())
		overlayHost.clear('receipt-flow-modal')
		this.render()
		this.apiService.syncService.processQueue({reason: 'standalone-receipt-save'}).catch(() => {})
	}

	async openStandaloneReceipt(receiptId) {
		const receipt = await this.receiptLocalRepository.getByLocalId(receiptId)
		if (!receipt) return
		this.resetForm({render: false})
		this.state.form.receipt = {
			...receipt,
			previewUrl: receipt.blob ? this.createReceiptUrl(receipt.blob) : null,
			source: 'standalone'
		}
		this.state.receiptFlow = {open: true, origin: 'standalone-view', originalReceipt: null, originalReceiptAction: null, error: ''}
		if (!this.state.form.receipt.previewUrl && receipt.serverReceiptId) {
			try {
				const blob = await this.receiptApiService.getStandaloneReceiptImageBlob(receipt.serverReceiptId)
				if (blob) {
					this.state.form.receipt.blob = blob
					this.state.form.receipt.previewUrl = this.createReceiptUrl(blob)
				}
			} catch {
				this.state.receiptFlow.error = 'Could not load receipt image.'
			}
		}
		if (receipt.serverReceiptId && navigator.onLine !== false) {
			try {
				const ocr = await this.receiptApiService.getReceiptOcr(receipt.serverReceiptId)
				if (ocr?.status) {
					const updated = await this.receiptLocalRepository.cacheOcrResult(receipt.localId, ocr)
					this.state.form.receipt.ocr = updated?.ocr || ocr
					this.state.standaloneReceipts = await this.receiptLocalRepository.listStandaloneByUser(this.apiService.getUserId())
				}
			} catch {
				// Existing cached OCR remains available offline or after transient API failures.
			}
		}
		this.render()
	}

	async recognizeStandaloneReceipt() {
		const receipt = this.state.form.receipt
		if (!receipt?.localId || !receipt.serverReceiptId || receipt.ocr?.status === 'processing') return
		this.state.form.receipt.ocr = {
			...(receipt.ocr || {}),
			receiptId: receipt.serverReceiptId,
			status: 'processing',
			rawText: null,
			engine: receipt.ocr?.engine || 'tesseract',
			language: receipt.ocr?.language || 'ukr+eng',
			error: null
		}
		this.state.receiptFlow.error = ''
		this.render()
		try {
			const ocr = await this.receiptApiService.runReceiptOcr(receipt.serverReceiptId)
			if (!ocr) {
				this.state.receiptFlow.error = 'Receipt not found.'
				this.render()
				return
			}
			const updated = await this.receiptLocalRepository.cacheOcrResult(receipt.localId, ocr)
			this.state.form.receipt.ocr = updated?.ocr || ocr
			this.state.standaloneReceipts = await this.receiptLocalRepository.listStandaloneByUser(this.apiService.getUserId())
		} catch {
			this.state.form.receipt.ocr = {
				...(this.state.form.receipt.ocr || {}),
				status: 'failed',
				rawText: null,
				error: 'OCR processing failed'
			}
			this.state.receiptFlow.error = 'Could not recognize receipt.'
		}
		this.render()
	}

	async openReceiptReview() {
		const receipt = this.state.form.receipt
		if (!receipt?.localId || !receipt.serverReceiptId) {
			this.state.receiptFlow.error = 'Receipt must be synced before review.'
			this.render()
			return
		}
		if (receipt.ocr?.status !== 'completed') {
			this.state.receiptFlow.error = 'Recognize receipt text before review.'
			this.render()
			return
		}
		this.state.receiptReview = {
			open: true,
			receiptLocalId: receipt.localId,
			receiptServerId: receipt.serverReceiptId,
			loading: true,
			saving: false,
			error: '',
			rawOcrOpen: false,
			evidenceRowId: null,
			rawText: receipt.ocr?.rawText || '',
			draft: null,
			form: null
		}
		this.state.receiptFlow = {open: false, origin: null, originalReceipt: null, originalReceiptAction: null, error: ''}
		overlayHost.clear('receipt-flow-modal')
		this.render()
		try {
			const parsed = await this.receiptApiService.parseReceipt(receipt.serverReceiptId)
			if (!parsed?.draft) {
				this.state.receiptReview.error = 'Receipt not found.'
				this.state.receiptReview.loading = false
				this.render()
				return
			}
			this.state.receiptReview.draft = parsed.draft
			this.state.receiptReview.form = this.createReceiptReviewForm(receipt, parsed.draft)
			this.state.receiptReview.loading = false
		} catch (error) {
			this.state.receiptReview.loading = false
			this.state.receiptReview.error = error?.message || 'Could not parse receipt.'
		}
		this.render()
	}

	createReceiptReviewForm(receipt, draft) {
		const merchantId = this.findExactMerchantId(draft?.merchant)
		const items = Array.isArray(draft?.items) && draft.items.length
			? draft.items.map(item => createReceiptReviewItem(item))
			: [createReceiptReviewItem()]
		return {
			clientMutationId: createReviewMutationId(receipt),
			merchantId: merchantId || '',
			purchasedAt: toDateTimeLocalValue(draft?.purchasedAt?.value),
			paymentType: 'bank',
			receiptTotal: draft?.total?.value === null || draft?.total?.value === undefined ? '' : normalizeDecimalString(draft.total.value),
			receiptTotalSource: draft?.total?.value === null || draft?.total?.value === undefined ? 'unknown' : 'parser',
			items,
			warnings: Array.isArray(draft?.warnings) ? draft.warnings : []
		}
	}

	findExactMerchantId(merchantHint) {
		const hints = [
			merchantHint?.normalizedHint,
			merchantHint?.rawName
		].map(normalizeComparableText).filter(Boolean)
		if (!hints.length) return ''
		const match = this.state.merchants.find(merchant => hints.includes(normalizeComparableText(merchant.name)))
		return match?.id || ''
	}

	closeReceiptReview({render = true} = {}) {
		if (this.state.receiptReview.saving) return
		this.state.receiptReview = {
			open: false,
			receiptLocalId: null,
			receiptServerId: null,
			loading: false,
			saving: false,
			error: '',
			rawOcrOpen: false,
			evidenceRowId: null,
			rawText: '',
			draft: null,
			form: null
		}
		overlayHost.clear('receipt-review-modal')
		if (render) this.render()
	}

	updateReceiptReviewField(input) {
		if (!this.state.receiptReview.form) return
		this.state.receiptReview.form[input.name] = input.value
		if (input.name === 'receiptTotal') {
			this.state.receiptReview.form.receiptTotalSource = input.value.trim() ? 'user' : 'unknown'
			this.updateReceiptReviewTotalsDom()
		}
	}

	updateReceiptReviewItemField(input) {
		const item = this.state.receiptReview.form?.items?.find(row => row.rowId === input.dataset.rowId)
		if (!item) return
		item[input.name] = input.value
		if (input.name === 'productQuery') {
			item.productId = null
			item.productName = ''
			item.suggestions = this.getSuggestions(input.value)
			this.updateReceiptReviewProductDom(item)
			return
		}
		if (input.name === 'total') this.updateReceiptReviewTotalsDom()
		if (input.name === 'unit') this.updateReceiptReviewProductDom(item)
	}

	updateReceiptReviewTotalsDom() {
		if (!this.state.receiptReview.form) return
		const itemsTotal = this.getReceiptReviewItemsTotal()
		const receiptTotal = this.state.receiptReview.form.receiptTotal
		const hasReceiptTotal = this.hasKnownReceiptReviewTotal()
		const totalWarning = this.getReceiptReviewTotalWarning()
		const itemsTotalNode = document.querySelector('[data-review-items-total]')
		const receiptTotalNode = document.querySelector('[data-review-receipt-total]')
		const suggestionNode = document.querySelector('[data-review-suggestion]')
		const warningNode = document.querySelector('[data-review-total-warning]')
		if (itemsTotalNode) itemsTotalNode.textContent = formatMoney(itemsTotal)
		if (receiptTotalNode) receiptTotalNode.textContent = formatOptionalMoney(receiptTotal)
		if (suggestionNode) {
			suggestionNode.hidden = hasReceiptTotal
			const suggestedTotalNode = suggestionNode.querySelector('[data-review-suggested-total]')
			const suggestedButtonNode = suggestionNode.querySelector('[data-review-use-suggested-total]')
			if (suggestedTotalNode) suggestedTotalNode.textContent = formatMoney(itemsTotal)
			if (suggestedButtonNode) suggestedButtonNode.textContent = `Use ${itemsTotal.toFixed(2)}`
		}
		if (warningNode) {
			warningNode.textContent = totalWarning || ''
			warningNode.className = totalWarning === 'Totals match' ? 'receipt-review-ok' : 'receipt-review-warning'
			warningNode.hidden = !totalWarning
		}
	}

	updateReceiptReviewProductDom(item) {
		this.updateReceiptReviewSuggestionsDom(item)
		this.updateReceiptReviewSelectedProductDom(item)
		this.updateReceiptReviewItemStatusDom(item)
	}

	updateReceiptReviewSuggestionsDom(item) {
		const container = document.querySelector(`[data-review-suggestions][data-row-id="${item.rowId}"]`)
		if (!container) return
		container.innerHTML = item.suggestions.length ? item.suggestions.map(product => `
			<button type="button" data-purchase-action="select-review-product" data-row-id="${item.rowId}" data-product-id="${product.id}">
				${this.escapeHtml(product.name)} <span>${this.escapeHtml(product.categoryName || '')}</span>
			</button>
		`).join('') : ''
	}

	updateReceiptReviewSelectedProductDom(item) {
		const container = document.querySelector(`[data-review-selected-product][data-row-id="${item.rowId}"]`)
		if (!container) return
		container.className = item.productId ? 'receipt-review-selected-product' : 'receipt-review-product-help'
		container.textContent = item.productId ? `Selected: ${item.productName}` : 'OCR text is not a selected Product.'
	}

	updateReceiptReviewItemStatusDom(item) {
		const card = document.querySelector(`[data-review-item][data-row-id="${item.rowId}"]`)
		const statusNode = document.querySelector(`[data-review-item-status][data-row-id="${item.rowId}"]`)
		const status = this.getReceiptReviewItemStatus(item)
		if (card) card.classList.toggle('needs-check', Boolean(status))
		if (!statusNode) return
		statusNode.textContent = status
		statusNode.hidden = !status
	}

	updateReceiptReviewUnitOptionsDom(item) {
		const select = document.querySelector(`[data-review-item-field][data-row-id="${item.rowId}"][name="unit"]`)
		if (!select) return
		const allowedUnits = getAllowedUnits(item.measurementType)
		const unitOptions = allowedUnits.length ? allowedUnits : ['pcs', 'g', 'kg', 'ml', 'l']
		select.innerHTML = unitOptions.map(unit => `<option value="${unit}" ${unit === item.unit ? 'selected' : ''}>${UNIT_LABELS[unit] || unit}</option>`).join('')
		select.value = item.unit
	}

	renderReceiptReviewModalPreservingScroll({scrollToRowId = null} = {}) {
		const body = document.querySelector('.receipt-review-body')
		const scrollTop = body?.scrollTop || 0
		this.renderReceiptReviewModal()
		const nextBody = document.querySelector('.receipt-review-body')
		if (!nextBody) return
		nextBody.scrollTop = scrollTop
		if (!scrollToRowId) return
		const item = nextBody.querySelector(`[data-review-item][data-row-id="${scrollToRowId}"]`)
		if (item) item.scrollIntoView({block: 'nearest'})
	}

	addReceiptReviewItem() {
		if (!this.state.receiptReview.form) return
		this.state.receiptReview.form.items.push(createReceiptReviewItem())
		const items = this.state.receiptReview.form.items
		this.renderReceiptReviewModalPreservingScroll({scrollToRowId: items[items.length - 1]?.rowId})
	}

	useReviewItemsTotal() {
		if (!this.state.receiptReview.form) return
		this.state.receiptReview.form.receiptTotal = normalizeDecimalString(this.getReceiptReviewItemsTotal())
		this.state.receiptReview.form.receiptTotalSource = 'suggested'
		const input = document.querySelector('[data-review-field][name="receiptTotal"]')
		if (input) input.value = this.state.receiptReview.form.receiptTotal
		this.updateReceiptReviewTotalsDom()
	}

	removeReceiptReviewItem(rowId) {
		if (!this.state.receiptReview.form) return
		const items = this.state.receiptReview.form.items
		const index = items.findIndex(item => item.rowId === rowId)
		const scrollToRowId = items[index + 1]?.rowId || items[index - 1]?.rowId || null
		this.state.receiptReview.form.items = this.state.receiptReview.form.items.filter(item => item.rowId !== rowId)
		if (!this.state.receiptReview.form.items.length) this.state.receiptReview.form.items.push(createReceiptReviewItem())
		this.renderReceiptReviewModalPreservingScroll({scrollToRowId: scrollToRowId || this.state.receiptReview.form.items[0]?.rowId})
	}

	toggleReceiptReviewEvidence(rowId) {
		this.state.receiptReview.evidenceRowId = this.state.receiptReview.evidenceRowId === rowId ? null : rowId
		this.renderReceiptReviewModal()
	}

	toggleReceiptReviewRawText() {
		this.state.receiptReview.rawOcrOpen = !this.state.receiptReview.rawOcrOpen
		this.renderReceiptReviewModal()
	}

	getReceiptReviewItemsTotal() {
		return (this.state.receiptReview.form?.items || [])
			.reduce((sum, item) => sum + (parseDecimalInput(item.total) || 0), 0)
	}

	getReceiptReviewTotalWarning() {
		const receiptTotal = parseDecimalInput(this.state.receiptReview.form?.receiptTotal)
		if (receiptTotal === null) return 'Check receipt total'
		const itemsTotal = this.getReceiptReviewItemsTotal()
		const difference = Math.round((Math.abs(itemsTotal - receiptTotal) + Number.EPSILON) * 100) / 100
		if (difference <= 0.05) return 'Totals match'
		return `Totals differ by ${difference.toFixed(2)} грн`
	}

	hasKnownReceiptReviewTotal() {
		return parseDecimalInput(this.state.receiptReview.form?.receiptTotal) !== null
	}

	getReceiptReviewItemStatus(item) {
		if ((item.parserWarnings || []).length || item.confidence < 0.6) return 'Check this item'
		if (!item.productId) return 'Select product'
		return ''
	}

	buildReceiptReviewPayload() {
		const form = this.state.receiptReview.form
		const selectedMerchant = this.state.merchants.find(item => String(item.id) === String(form.merchantId))
		const items = form.items.map(item => ({
			item,
			quantity: parseDecimalInput(item.quantity),
			total: parseDecimalInput(item.total)
		})).filter(({item, quantity, total}) => item.productId && quantity > 0 && total !== null && total >= 0)
			.map(({item, quantity, total}) => ({
				product_id: item.productServerId || item.productId,
				quantity,
				unit: item.unit,
				total
			}))
		return {
			client_mutation_id: form.clientMutationId,
			merchant_id: selectedMerchant?.serverId || form.merchantId || null,
			purchased_at: toApiDateTimeValue(form.purchasedAt),
			payment_type: form.paymentType,
			note: 'Created from receipt review',
			items
		}
	}

	validateReceiptReview() {
		const form = this.state.receiptReview.form
		if (!form) return 'Review is not loaded.'
		if (!form.items.some(item => item.productId)) return 'Select at least one product before creating purchase.'
		const invalidProduct = form.items.find(item => !item.productId)
		if (invalidProduct) return 'Every review item must have an explicitly selected product, or be removed.'
		const invalidAmount = form.items.find(item => {
			const quantity = parseDecimalInput(item.quantity)
			const total = parseDecimalInput(item.total)
			return !(quantity > 0) || total === null || total < 0 || !item.unit
		})
		if (invalidAmount) return 'Check quantity, unit and total for every item.'
		return ''
	}

	async confirmReceiptReview() {
		if (this.state.receiptReview.saving) return
		const validationError = this.validateReceiptReview()
		if (validationError) {
			this.state.receiptReview.error = validationError
			this.renderReceiptReviewModal()
			return
		}
		this.state.receiptReview.saving = true
		this.state.receiptReview.error = ''
		this.renderReceiptReviewModal()
		try {
			const result = await this.receiptApiService.confirmReceiptPurchase(
				this.state.receiptReview.receiptServerId,
				this.buildReceiptReviewPayload()
			)
			if (!result?.purchase) {
				this.state.receiptReview.error = 'Receipt confirmation failed.'
				this.state.receiptReview.saving = false
				this.renderReceiptReviewModal()
				return
			}
			await this.apiService.localRepository.mergeServerPurchases([result.purchase], {
				userId: this.apiService.getUserId()
			})
			const localPurchase = await this.apiService.localRepository.getPurchase(result.purchase.id)
			await this.receiptLocalRepository.linkStandaloneToPurchase(
				this.state.receiptReview.receiptLocalId,
				localPurchase || result.purchase
			)
			await this.refreshSelectedRangeFromLocal()
			this.closeReceiptReview({render: false})
			this.render()
		} catch (error) {
			this.state.receiptReview.saving = false
			this.state.receiptReview.error = error?.message || 'Could not create purchase from receipt.'
			this.renderReceiptReviewModal()
		}
	}

	async deleteStandaloneReceipt() {
		const receipt = this.state.form.receipt
		if (!receipt?.localId) return
		const pendingDelete = await this.receiptLocalRepository.markStandalonePendingDelete(receipt.localId)
		if (pendingDelete) {
			await this.apiService.syncService.enqueueMutation({
				entityType: 'receipt',
				entityLocalId: pendingDelete.localId,
				action: 'delete',
				reason: 'standalone-receipt-delete'
			})
		}
		this.clearFormReceiptPreview()
		this.state.form.receipt = null
		this.state.form.receiptAction = null
		this.state.receiptFlow = {open: false, origin: null, originalReceipt: null, originalReceiptAction: null, error: ''}
		this.state.standaloneReceipts = await this.receiptLocalRepository.listStandaloneByUser(this.apiService.getUserId())
		overlayHost.clear('receipt-flow-modal')
		this.render()
		this.apiService.syncService.processQueue({reason: 'standalone-receipt-delete'}).catch(() => {})
	}

	useReceiptInPurchaseDraft() {
		this.state.receiptFlow = {open: false, origin: null, originalReceipt: null, originalReceiptAction: null, error: ''}
		this.state.editorOpen = true
		overlayHost.clear('receipt-flow-modal')
		this.render()
	}

	async persistReceiptState(savedPurchase) {
		if (this.state.form.receiptAction === 'delete') {
			const deleted = await this.receiptLocalRepository.markPendingDelete(savedPurchase)
			if (deleted) {
				await this.apiService.syncService.enqueueMutation({
					entityType: 'receipt',
					entityLocalId: savedPurchase.id,
					action: 'delete',
					reason: 'receipt-delete'
				})
			}
			return
		}
		if (this.state.form.receiptAction !== 'upsert' || !this.state.form.receipt?.blob) return
		const receipt = await this.receiptLocalRepository.saveForPurchase({
			purchase: savedPurchase,
			image: this.state.form.receipt
		})
		await this.apiService.syncService.enqueueMutation({
			entityType: 'receipt',
			entityLocalId: receipt.purchaseLocalId,
			action: 'upsert',
			reason: 'receipt-save'
		})
	}

	setFormReceipt(receipt, action = 'upsert', {render = true} = {}) {
		this.clearFormReceiptPreview()
		this.state.form.receipt = receipt
		this.state.form.receiptAction = action
		this.state.form.receiptError = ''
		this.state.receiptFlow.error = ''
		if (render) this.render()
	}

	setReceiptError(message, {render = true} = {}) {
		this.state.form.receiptError = message
		if (render) this.render()
	}

	createReceiptUrl(blob) {
		const url = URL.createObjectURL(blob)
		this.activeReceiptUrls.add(url)
		return url
	}

	clearFormReceiptPreview() {
		const url = this.state.form.receipt?.previewUrl
		if (url) {
			URL.revokeObjectURL(url)
			this.activeReceiptUrls.delete(url)
		}
	}

	revokeReceiptUrls() {
		this.activeReceiptUrls.forEach(url => URL.revokeObjectURL(url))
		this.activeReceiptUrls.clear()
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
			})),
			receipt: null,
			receiptAction: null,
			receiptError: ''
		}
		if (purchase.hasReceipt || purchase.receipt?.id) {
			this.state.form.receipt = {
				serverReceiptId: purchase.receipt?.id || null,
				originalFilename: null,
				syncStatus: 'synced',
				source: 'metadata'
			}
			this.state.form.receiptAction = null
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
			items: [createItem()],
			receipt: null,
			receiptAction: null,
			receiptError: ''
		}
		this.state.selectedPurchase = null
		this.state.editorOpen = false
		this.state.receiptFlow = {open: false, origin: null, originalReceipt: null, originalReceiptAction: null, error: ''}
		this.state.createProductForRowId = null
		this.state.createProductForm = null
		this.state.saveError = ''
		this.revokeReceiptUrls()
		if (render) this.render()
	}

	render() {
		this.$hbapp.innerHTML = this.getTemplate()
		this.renderEditorModal()
		this.renderReceiptFlowModal()
		this.renderReceiptReviewModal()
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
					<button class="hboo-button purchase-scan-action" type="button" data-purchase-action="scan-receipt"><span aria-hidden="true">▧</span> Scan receipt</button>
				</div>
			</div>
			${this.getPurchasesListTemplate()}
			${this.getStandaloneReceiptsTemplate()}
			${this.getDeleteConfirmationTemplate()}
		</section>`
	}

	renderEditorModal() {
		const html = this.getEditorModalTemplate()
		if (html) overlayHost.render('purchase-editor-modal', html)
		else overlayHost.clear('purchase-editor-modal')
	}

	renderReceiptFlowModal() {
		const html = this.getReceiptFlowModalTemplate()
		if (html) overlayHost.render('receipt-flow-modal', html)
		else overlayHost.clear('receipt-flow-modal')
	}

	renderReceiptReviewModal() {
		const html = this.getReceiptReviewTemplate()
		if (html) overlayHost.render('receipt-review-modal', html)
		else overlayHost.clear('receipt-review-modal')
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
			${this.getCompactReceiptTemplate()}
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

	getCompactReceiptTemplate() {
		const receipt = this.state.form.receipt
		const hasReceipt = Boolean(receipt)
		return `<div class="purchase-receipt-section">
			<div class="purchase-items-title">Receipt</div>
			${hasReceipt ? `<button class="purchase-receipt-compact-card" type="button" data-purchase-action="open-receipt-flow">
				<span><strong>Receipt attached</strong><em>${this.escapeHtml(receipt.originalFilename || 'Receipt image')}</em></span>
				<b aria-hidden="true">✓</b>
				<small>View ›</small>
			</button>` : `<button class="purchase-add-receipt" type="button" data-purchase-action="open-receipt-flow">Attach receipt</button>`}
			${this.state.form.receiptError ? `<div class="purchase-save-error">${this.escapeHtml(this.state.form.receiptError)}</div>` : ''}
		</div>`
	}

	getReceiptFlowModalTemplate() {
		if (!this.state.receiptFlow.open) return ''
		const receipt = this.state.form.receipt
		const hasPreview = Boolean(receipt?.previewUrl)
		const isAttachment = this.state.receiptFlow.origin === 'purchase'
		const isStandaloneView = this.state.receiptFlow.origin === 'standalone-view'
		const primaryAction = isAttachment ? 'use-receipt' : 'save-standalone-receipt'
		const primaryLabel = isAttachment ? 'Use receipt' : 'Save receipt'
		return `<div class="app-modal-backdrop receipt-flow-modal-backdrop">
			<div class="app-modal receipt-flow-modal" role="dialog" aria-modal="true" aria-labelledby="receipt-flow-title">
				<div class="app-modal-header">
					<h4 id="receipt-flow-title">Scan receipt</h4>
					<button class="app-modal-close" type="button" aria-label="Close" data-purchase-action="close-receipt-flow">×</button>
				</div>
				<div class="app-modal-body receipt-flow-body">
					<input class="purchase-receipt-input" type="file" accept="image/jpeg,image/png,image/webp,image/*" capture="environment" data-receipt-input>
					${hasPreview ? this.getReceiptFlowPreviewTemplate(receipt) : this.getReceiptFlowCaptureTemplate()}
					${isStandaloneView ? this.getReceiptOcrTemplate(receipt) : ''}
					${this.state.form.receiptError ? `<div class="purchase-save-error">${this.escapeHtml(this.state.form.receiptError)}</div>` : ''}
					${this.state.receiptFlow.error ? `<div class="purchase-save-error">${this.escapeHtml(this.state.receiptFlow.error)}</div>` : ''}
				</div>
				<div class="app-modal-actions receipt-flow-actions">
					<button type="button" data-purchase-action="close-receipt-flow">Cancel</button>
					${hasPreview && !isStandaloneView ? `<button class="product-primary-action" type="button" data-purchase-action="${primaryAction}">${primaryLabel}</button>` : ''}
				</div>
			</div>
		</div>`
	}

	getReceiptFlowCaptureTemplate() {
		return `<div class="receipt-flow-capture-card">
			<div class="receipt-flow-icon" aria-hidden="true">▧</div>
			<button class="purchase-add-receipt" type="button" data-purchase-action="choose-receipt">Add receipt photo</button>
			<p>Take a photo or choose an image from your device</p>
		</div>`
	}

	getReceiptFlowPreviewTemplate(receipt) {
		return `<div class="receipt-flow-preview">
			<img src="${this.escapeHtml(receipt.previewUrl)}" alt="Receipt preview">
		</div>
		<div class="purchase-receipt-actions">
			<button type="button" data-purchase-action="choose-receipt">Replace</button>
			<button type="button" data-purchase-action="remove-receipt">Remove</button>
		</div>`
	}

	getReceiptOcrTemplate(receipt) {
		const ocr = receipt?.ocr || null
		const isSynced = receipt?.syncStatus === 'synced' && Boolean(receipt?.serverReceiptId)
		const isProcessing = ocr?.status === 'processing' || ocr?.status === 'pending'
		const hasText = ocr?.status === 'completed'
		const failed = ocr?.status === 'failed'
		if (!isSynced) {
			return `<section class="receipt-ocr-section">
				<div class="purchase-items-title">Text recognition</div>
				<p class="receipt-ocr-note">Text recognition will be available after sync.</p>
			</section>`
		}
		return `<section class="receipt-ocr-section">
			<div class="receipt-ocr-header">
				<div>
					<div class="purchase-items-title">Text recognition</div>
					${this.getReceiptOcrStatusTemplate(ocr)}
				</div>
				<button class="hboo-button product-primary-action" type="button" data-purchase-action="recognize-standalone-receipt" ${isProcessing ? 'disabled' : ''}>
					${hasText || failed ? 'Recognize again' : (isProcessing ? 'Recognizing receipt...' : 'Recognize receipt')}
				</button>
			</div>
			${hasText ? `<button class="hboo-button product-primary-action receipt-review-open" type="button" data-purchase-action="review-standalone-receipt">Review receipt</button>` : ''}
			${hasText ? `<pre class="receipt-ocr-raw">${this.escapeHtml(ocr.rawText || '')}</pre>` : ''}
			${failed ? '<p class="receipt-ocr-note">Could not recognize receipt. Try again.</p>' : ''}
		</section>`
	}

	getReceiptOcrStatusTemplate(ocr) {
		if (ocr?.status === 'completed') return '<p class="receipt-ocr-note">Text recognized</p>'
		if (ocr?.status === 'failed') return '<p class="receipt-ocr-note">Could not recognize receipt</p>'
		if (ocr?.status === 'processing' || ocr?.status === 'pending') return '<p class="receipt-ocr-note">Recognizing receipt...</p>'
		return '<p class="receipt-ocr-note">Ready</p>'
	}

	getReceiptReviewTemplate() {
		const review = this.state.receiptReview
		if (!review.open) return ''
		const form = review.form
		const itemsTotal = this.getReceiptReviewItemsTotal()
		const totalWarning = this.getReceiptReviewTotalWarning()
		const hasReceiptTotal = this.hasKnownReceiptReviewTotal()
		return `<div class="app-modal-backdrop receipt-review-modal-backdrop">
			<div class="app-modal receipt-review-modal" role="dialog" aria-modal="true" aria-labelledby="receipt-review-title">
				<div class="app-modal-header">
					<h4 id="receipt-review-title">Review receipt</h4>
					<button class="app-modal-close" type="button" aria-label="Close" data-purchase-action="close-receipt-review">×</button>
				</div>
				<div class="app-modal-body receipt-review-body">
					${review.loading ? '<div class="product-empty">Parsing receipt...</div>' : ''}
					${!review.loading && form ? `<div class="receipt-review-form">
						<div class="purchase-meta-grid receipt-review-meta">
							<label>Store<select name="merchantId" data-review-field>
								<option value="">Other / no merchant</option>
								${this.state.merchants.map(merchant => `<option value="${merchant.id}" ${String(merchant.id) === String(form.merchantId) ? 'selected' : ''}>${this.escapeHtml(merchant.name)}</option>`).join('')}
							</select></label>
							<label>Date and time<input type="datetime-local" name="purchasedAt" value="${this.escapeHtml(form.purchasedAt)}" data-review-field></label>
							<label>Payment<select name="paymentType" data-review-field>
								<option value="bank" ${form.paymentType === 'bank' ? 'selected' : ''}>Bank</option>
								<option value="cash" ${form.paymentType === 'cash' ? 'selected' : ''}>Cash</option>
								<option value="other" ${form.paymentType === 'other' ? 'selected' : ''}>Other</option>
							</select></label>
							<label>Receipt total<input type="text" inputmode="decimal" name="receiptTotal" value="${this.escapeHtml(form.receiptTotal)}" data-review-field></label>
						</div>
						<div class="receipt-review-summary">
							<span>Items total: <strong data-review-items-total>${formatMoney(itemsTotal)}</strong></span>
							<span>Receipt total: <strong data-review-receipt-total>${formatOptionalMoney(form.receiptTotal)}</strong></span>
						</div>
						<div class="receipt-review-suggestion" data-review-suggestion ${hasReceiptTotal ? 'hidden' : ''}>
							<span>Suggested total: <strong data-review-suggested-total>${formatMoney(itemsTotal)}</strong></span>
							<small>Based on reviewed items, not receipt OCR.</small>
							<button class="hboo-button" type="button" data-purchase-action="use-review-items-total" data-review-use-suggested-total>Use ${itemsTotal.toFixed(2)}</button>
						</div>
						<div class="${totalWarning === 'Totals match' ? 'receipt-review-ok' : 'receipt-review-warning'}" data-review-total-warning ${totalWarning ? '' : 'hidden'}>${this.escapeHtml(totalWarning)}</div>
						${form.warnings.length ? `<div class="receipt-review-warning">Check receipt totals and parser warnings.</div>` : ''}
						<div class="purchase-items-title">Items</div>
						<div class="receipt-review-items">${form.items.map(item => this.getReceiptReviewItemTemplate(item)).join('')}</div>
						<button class="purchase-add-item" type="button" data-purchase-action="add-review-item">+ Add item</button>
						${this.getCreateProductTemplate()}
						<button class="hboo-button receipt-review-raw-toggle" type="button" data-purchase-action="toggle-review-raw">${review.rawOcrOpen ? 'Hide OCR text' : 'Show full OCR text'}</button>
						${review.rawOcrOpen ? `<pre class="receipt-ocr-raw">${this.escapeHtml(review.rawText || '')}</pre>` : ''}
					</div>` : ''}
					${review.error ? `<div class="purchase-save-error">${this.escapeHtml(review.error)}</div>` : ''}
				</div>
				<div class="app-modal-actions receipt-review-actions">
					<button type="button" data-purchase-action="close-receipt-review" ${review.saving ? 'disabled' : ''}>Cancel</button>
					<button class="purchase-save product-primary-action" type="button" data-purchase-action="confirm-receipt-review" ${review.loading || review.saving ? 'disabled' : ''}>${review.saving ? 'Creating purchase...' : 'Create purchase'}</button>
				</div>
			</div>
		</div>`
	}

	getReceiptReviewItemTemplate(item) {
		const allowedUnits = getAllowedUnits(item.measurementType)
		const unitOptions = allowedUnits.length ? allowedUnits : ['pcs', 'g', 'kg', 'ml', 'l']
		const status = this.getReceiptReviewItemStatus(item)
		const evidenceOpen = this.state.receiptReview.evidenceRowId === item.rowId
		return `<div class="receipt-review-item ${status ? 'needs-check' : ''}" data-review-item data-row-id="${item.rowId}">
			<div class="receipt-review-item-head">
				<strong>${this.escapeHtml(item.rawName || item.productName || 'Item')}</strong>
				<span data-review-item-status data-row-id="${item.rowId}" ${status ? '' : 'hidden'}>${this.escapeHtml(status)}</span>
			</div>
			<div class="purchase-product-cell receipt-review-product">
				<label>Product<input name="productQuery" value="${this.escapeHtml(item.productQuery)}" placeholder="Search existing product..." data-review-item-field data-row-id="${item.rowId}" autocomplete="off"></label>
				<div class="purchase-suggestions" data-review-suggestions data-row-id="${item.rowId}">${item.suggestions.map(product => `
					<button type="button" data-purchase-action="select-review-product" data-row-id="${item.rowId}" data-product-id="${product.id}">
						${this.escapeHtml(product.name)} <span>${this.escapeHtml(product.categoryName || '')}</span>
					</button>
				`).join('')}</div>
				<p class="${item.productId ? 'receipt-review-selected-product' : 'receipt-review-product-help'}" data-review-selected-product data-row-id="${item.rowId}">${item.productId ? `Selected: ${this.escapeHtml(item.productName)}` : 'OCR text is not a selected Product.'}</p>
				<button class="purchase-create-product-link receipt-review-create-product" type="button" data-purchase-action="start-create-product" data-row-id="${item.rowId}">+ Create new product</button>
			</div>
			<div class="receipt-review-item-grid">
				<label>Amount<input name="quantity" type="text" inputmode="decimal" value="${this.escapeHtml(item.quantity)}" data-review-item-field data-row-id="${item.rowId}"></label>
				<label>Unit<select name="unit" data-review-item-field data-row-id="${item.rowId}">
					${unitOptions.map(unit => `<option value="${unit}" ${unit === item.unit ? 'selected' : ''}>${UNIT_LABELS[unit] || unit}</option>`).join('')}
				</select></label>
				<label>Price<input name="total" type="text" inputmode="decimal" value="${this.escapeHtml(item.total)}" data-review-item-field data-row-id="${item.rowId}"></label>
			</div>
			<div class="receipt-review-item-actions">
				${status ? `<button class="hboo-button" type="button" data-purchase-action="toggle-review-evidence" data-row-id="${item.rowId}">${evidenceOpen ? 'Hide OCR text' : 'Show OCR text'}</button>` : ''}
				<button class="purchase-remove-item" type="button" data-purchase-action="remove-review-item" data-row-id="${item.rowId}">Remove</button>
			</div>
			${evidenceOpen ? `<pre class="receipt-ocr-raw">${this.escapeHtml(item.rawText || item.rawName || '')}</pre>` : ''}
		</div>`
	}

	getStandaloneReceiptsTemplate() {
		const receipts = this.state.standaloneReceipts || []
		if (!receipts.length) return ''
		return `<aside class="purchase-history receipt-inbox">
			<h3>Receipts to review (${receipts.length})</h3>
			${receipts.map(receipt => `<button class="purchase-history-row receipt-inbox-row" type="button" data-purchase-action="open-standalone-receipt" data-receipt-id="${this.escapeHtml(receipt.localId)}">
				<span>${this.escapeHtml(receipt.originalFilename || 'Saved receipt')}</span>
				<strong>${this.escapeHtml(this.getReceiptStatusLabel(receipt))}</strong>
				<em>${this.escapeHtml(String(receipt.createdAt || '').slice(0, 16).replace('T', ' '))}</em>
			</button>`).join('')}
		</aside>`
	}

	getReceiptStatusLabel(receipt) {
		if (receipt.ocr?.status === 'completed') return 'Text recognized'
		if (receipt.ocr?.status === 'failed') return 'OCR failed'
		if (receipt.ocr?.status === 'processing' || receipt.ocr?.status === 'pending') return 'Recognizing'
		if (receipt.syncStatus === 'synced') return 'Awaiting review'
		if (receipt.syncStatus === 'error') return 'Sync error'
		if (receipt.syncStatus === 'syncing') return 'Syncing'
		return 'Saved locally'
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
				<strong>${formatMoney(purchase.total)} ${this.getReceiptIndicator(purchase)}</strong>
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

	getReceiptIndicator(purchase) {
		if (!purchase.hasReceipt) return ''
		const pending = purchase.receiptSyncStatus && purchase.receiptSyncStatus !== 'synced'
		return `<span class="purchase-receipt-indicator ${pending ? 'pending' : ''}" title="Receipt attached" aria-label="Receipt attached">▧</span>`
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
