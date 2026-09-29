import AbstractClass from './AbstractClass.js'
import router from '../router/router.js'
import ProductCatalogApiService from '../services/ProductCatalogApiService.js'
import {MEASUREMENT_LABELS} from '../services/ProductUnitService.js'

export default class ProductCatalogPage extends AbstractClass {

	pageName = 'products'
	apiService = new ProductCatalogApiService()
	state = {
		categories: [],
		products: [],
		search: '',
		editingId: null,
		form: null,
		loading: true
	}

	constructor(hbapp) {
		super(hbapp)
		this.init()
	}

	init() {
		this.render()
		this.apiService.loadCatalog({refresh: true}).then(catalog => {
			this.state.categories = catalog.categories || []
			this.state.products = catalog.products || []
			this.state.loading = false
			this.render()
		})
	}

	eventsRegister(event, type) {
		const action = event.target.closest('[data-product-action]')?.dataset.productAction
		if (type === 'click' && action) {
			this.handleAction(action, event.target.closest('[data-product-action]'))
			return
		}

		if (type === 'change' && event.target.closest('[data-product-form-field]')) {
			this.updateForm(event.target)
			return
		}

		if (type === 'change' && event.target.closest('[data-product-search]')) {
			this.state.search = event.target.value
			this.render()
			return
		}

		if (type === 'keypressenter' && event.target.closest('[data-product-search]')) {
			this.state.search = event.target.value
			this.render()
		}
	}

	handleAction(action, target) {
		if (action === 'new') this.startNew()
		if (action === 'cancel') this.clearForm()
		if (action === 'edit') this.startEdit(target.dataset.productId)
		if (action === 'disable') this.disableProduct(target.dataset.productId)
		if (action === 'save') this.saveProduct()
		if (action === 'back-purchases') router.redirectRouter('/purchases')
	}

	startNew() {
		const firstCategory = this.state.categories.find(category => category.status === 'active')
		this.state.editingId = null
		this.state.form = {
			name: '',
			categoryId: firstCategory?.id || '',
			measurementType: 'weight',
			status: 'active'
		}
		this.render()
	}

	startEdit(productId) {
		const product = this.state.products.find(item => String(item.id) === String(productId))
		if (!product) return
		this.state.editingId = product.id
		this.state.form = {
			name: product.name,
			categoryId: product.categoryId,
			measurementType: product.measurementType,
			status: product.status
		}
		this.render()
	}

	clearForm() {
		this.state.editingId = null
		this.state.form = null
		this.render()
	}

	updateForm(input) {
		if (!this.state.form) return
		this.state.form[input.name] = input.value
	}

	async saveProduct() {
		if (!this.state.form?.name?.trim()) return
		const payload = {
			id: this.state.editingId,
			name: this.state.form.name.trim(),
			categoryId: Number(this.state.form.categoryId),
			measurementType: this.state.form.measurementType,
			status: this.state.form.status
		}
		const saved = this.state.editingId
			? await this.apiService.updateProduct(payload)
			: await this.apiService.createProduct(payload)
		await this.reloadCatalog(saved.id)
	}

	async disableProduct(productId) {
		const product = this.state.products.find(item => String(item.id) === String(productId))
		if (!product) return
		await this.apiService.updateProduct({...product, status: 'disabled'})
		await this.reloadCatalog()
	}

	async reloadCatalog() {
		const catalog = await this.apiService.loadCatalog({refresh: true})
		this.state.categories = catalog.categories || []
		this.state.products = catalog.products || []
		this.clearForm()
	}

	render() {
		this.$hbapp.innerHTML = this.getTemplate()
	}

	getVisibleProducts() {
		const query = this.state.search.trim().toLocaleLowerCase('uk-UA')
		return this.state.products
			.filter(product => !query || product.name.toLocaleLowerCase('uk-UA').includes(query))
			.sort((a, b) => {
				const categoryDiff = Number(a.categoryId) - Number(b.categoryId)
				return categoryDiff || a.name.localeCompare(b.name, 'uk')
			})
	}

	groupProducts() {
		const groups = new Map()
		this.state.categories.forEach(category => groups.set(Number(category.id), {category, products: []}))
		this.getVisibleProducts().forEach(product => {
			if (!groups.has(Number(product.categoryId))) {
				groups.set(Number(product.categoryId), {
					category: {id: product.categoryId, name: product.categoryName || 'Інше'},
					products: []
				})
			}
			groups.get(Number(product.categoryId)).products.push(product)
		})
		return Array.from(groups.values()).filter(group => group.products.length)
	}

	getTemplate() {
		const form = this.state.form ? this.getFormTemplate() : ''
		const groups = this.groupProducts().map(group => this.getGroupTemplate(group)).join('')
		return `<section class="product-workspace">
			<div class="product-toolbar">
				<div>
					<span class="product-eyebrow">Product Catalog</span>
					<h2>Products</h2>
				</div>
				<div class="purchase-toolbar-actions">
					<button class="hboo-button" type="button" data-product-action="back-purchases">Purchases</button>
					<button class="hboo-button" type="button" data-product-action="new">+ Product</button>
				</div>
			</div>
			<div class="product-search-row">
				<input type="search" value="${this.escapeHtml(this.state.search)}" placeholder="Search..." data-product-search>
			</div>
			${form}
			<div class="product-catalog-list">
				${this.state.loading ? '<div class="product-empty">Loading...</div>' : groups || '<div class="product-empty">No products yet</div>'}
			</div>
		</section>`
	}

	getFormTemplate() {
		return `<div class="product-form-card">
			<div class="product-form-grid">
				<label>Name<input name="name" value="${this.escapeHtml(this.state.form.name)}" data-product-form-field></label>
				<label>Category<select name="categoryId" data-product-form-field>${this.state.categories.map(category => `
					<option value="${category.id}" ${String(category.id) === String(this.state.form.categoryId) ? 'selected' : ''}>${this.escapeHtml(category.name)}</option>
				`).join('')}</select></label>
				<label>Measurement<select name="measurementType" data-product-form-field>${Object.entries(MEASUREMENT_LABELS).map(([value, label]) => `
					<option value="${value}" ${value === this.state.form.measurementType ? 'selected' : ''}>${label}</option>
				`).join('')}</select></label>
				<label>Status<select name="status" data-product-form-field>
					<option value="active" ${this.state.form.status === 'active' ? 'selected' : ''}>Active</option>
					<option value="disabled" ${this.state.form.status === 'disabled' ? 'selected' : ''}>Disabled</option>
				</select></label>
			</div>
			<div class="product-form-actions">
				<button class="hboo-button product-primary-action" type="button" data-product-action="save">Save</button>
				<button class="hboo-button" type="button" data-product-action="cancel">Cancel</button>
			</div>
		</div>`
	}

	getGroupTemplate(group) {
		return `<section class="product-category-group">
			<h3>${this.escapeHtml(group.category.name)}</h3>
			<div class="product-category-items">
				${group.products.map(product => `<div class="product-row ${product.status === 'disabled' ? 'product-row-disabled' : ''}">
					<div>
						<strong>${this.escapeHtml(product.name)}</strong>
						<span>${MEASUREMENT_LABELS[product.measurementType] || product.measurementType}${product.status === 'disabled' ? ' · disabled' : ''}</span>
					</div>
					<div class="product-row-actions">
						<button type="button" data-product-action="edit" data-product-id="${product.id}">Edit</button>
						<button type="button" data-product-action="disable" data-product-id="${product.id}" ${product.status === 'disabled' ? 'disabled' : ''}>Disable</button>
					</div>
				</div>`).join('')}
			</div>
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
