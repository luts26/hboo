import AbstractClass from './AbstractClass.js'
import transactionStore from '../stores/TransactionStore.js'
import CategoryApiService from '../services/CategoryApiService.js'
import DataStatus, { createDataStatusViewModel } from '../components/DataStatus.js'
import Toast from '../components/Toast.js'
import { datePickerDefault } from '../mixins/calendarHelper.js'
import { hbRangeCreate } from '../mixins/hbRangeHelper.js'

export default class TransactionPage extends AbstractClass {

	pageName = 'transaction'
	state = transactionStore.getState()
	dataForTotalSum = {
		in: 0,
		out: 0,
		cashback: 0,
		commission: 0,
	}
	sumTransactionsByDate = {
		mono: { ...this.dataForTotalSum },
		privat: { ...this.dataForTotalSum }
	}
	filterBank = ['mono', 'privat']
	selectedCategoryId = 'ALL'
	categories = []
	categoryApiService = new CategoryApiService()
	categoryLoadPromise = null
	unsubscribe = null
	refreshCandidate = null
	refreshingBank = null
	dataStatusOpen = false
	previousStatusState = null
	pendingManualRefresh = false
	selectedDay = null
	selectedTransaction = null
	filtersModalOpen = false
	filterDraft = null
	appliedDateRange = null

	constructor(hbapp) {
		super(hbapp)
		this.init()
	}

	init(query = '') {
		this.loadCategories()
		transactionStore.load(query)
		if (!this.unsubscribe) {
			this.unsubscribe = transactionStore.subscribe(state => {
				this.handleStatusTransition(this.state, state)
				this.state = state
				if (!state.loading) this.refreshingBank = null
					this.dataItems = state.data
					this.$hbapp.innerHTML = this.getTemplate()
					this.afterCreate()
				})
			}
	}

	destroy() {
		if (this.unsubscribe) this.unsubscribe()
		this.unsubscribe = null
	}

	renderFromStore() {
		this.dataItems = this.state.data
		this.$hbapp.innerHTML = this.getTemplate()
		this.afterCreate()
	}

	refresh(query = '') {
		return transactionStore.refresh(query)
	}

	loadCategories() {
		if (this.categoryLoadPromise) return this.categoryLoadPromise
		this.categoryLoadPromise = this.categoryApiService.loadCategories('uk', {
			onRefresh: categories => {
				this.categories = categories
				this.$hbapp.innerHTML = this.getTemplate()
				this.afterUpdate()
			}
		})
			.then(categories => {
				this.categories = Array.isArray(categories) ? categories : []
				this.$hbapp.innerHTML = this.getTemplate()
				this.afterUpdate()
				return this.categories
			})
			.catch(() => {
				this.categories = this.getCategoriesFromTransactions()
				return this.categories
			})
			.finally(() => {
				this.categoryLoadPromise = null
			})

		return this.categoryLoadPromise
	}

	getCategoriesFromTransactions() {
		const items = [
			...(Array.isArray(this.dataItems?.mono) ? this.dataItems.mono : []),
			...(Array.isArray(this.dataItems?.privat) ? this.dataItems.privat : [])
		]
		const categoriesById = new Map()

		items.forEach(item => {
			if (!item.category?.id) return
			categoriesById.set(String(item.category.id), item.category)
		})

		return Array.from(categoriesById.values()).sort((a, b) => Number(a.id) - Number(b.id))
	}

	getBankMeta(bank) {
		const meta = {
			mono: {
				name: 'monobank',
				logo: '/hbapp/assets/images/mblogo1.png',
				logoAlt: 'mblogo',
				refreshCode: '1'
			},
			privat: {
				name: 'PrivatBank',
				logo: '/hbapp/assets/images/pblogo1.png',
				logoAlt: 'pblogo',
				refreshCode: '2'
			}
		}
		return meta[bank] || null
	}

	getDataStateLabel() {
		if (this.state.stale) return 'Offline'
		if (this.state.source === 'api') return 'Live'
		if (this.state.source === 'cache') return 'Cached'
		return '-'
	}

	formatStatusDateTime(value) {
		return `${this.timeStampToStringDate(value)} ${this.timeStampToStringTime(value, false)}`
	}

	getDataStatusTemplate() {
		const viewModel = createDataStatusViewModel({
			loading: this.state.loading,
			source: this.state.source,
			stale: this.state.stale,
			updatedAt: this.state.updatedAt,
			isOpen: this.dataStatusOpen
		}, value => this.formatStatusDateTime(value))
		return DataStatus.render(viewModel)
	}

	getPageHeaderTemplate() {
		return `<div class="page-compact-header">
			<h3 class="page-title-chip">Transactions</h3>
			${this.getDataStatusTemplate()}
		</div>`
	}

	getStatusKey(state = {}) {
		return [
			state.loading ? 'loading' : 'idle',
			state.source || 'none',
			state.stale ? 'stale' : 'fresh',
			state.error ? 'error' : 'ok',
			state.updatedAt || 'none'
		].join(':')
	}

	handleStatusTransition(previousState, nextState) {
		const previousKey = this.previousStatusState ? this.getStatusKey(this.previousStatusState) : null
		const nextKey = this.getStatusKey(nextState)
		if (previousKey === nextKey) return

		if (previousState?.loading && !nextState.loading && this.pendingManualRefresh) {
			if (nextState.error) {
				Toast.show('Update failed · Showing previous data', {type: 'warning', key: 'transaction-manual-failed'})
			} else if (nextState.source === 'api') {
				Toast.show('Transactions updated', {type: 'success', key: 'transaction-manual-success'})
			}
			this.pendingManualRefresh = false
		} else if (previousState && !previousState.stale && nextState.stale && nextState.data) {
			Toast.show('Offline · Showing cached data', {type: 'warning', key: 'transaction-offline'})
		} else if (previousState?.stale && !nextState.stale && nextState.source === 'api') {
			Toast.show('Online · Data updated', {type: 'success', key: 'transaction-online'})
		}

		this.previousStatusState = nextState
	}

	renderTemplateAfterLocalChange() {
		this.$hbapp.innerHTML = this.renderTemplate(true)
		this.afterUpdate()
	}

	getLoadingTemplate() {
		return `<div class="${this.pageName}-container mt-3">
			${this.getPageHeaderTemplate()}
		</div>`
	}

	afterCreate() {
		if (this.$hbapp.querySelector('date-picker')) datePickerDefault()
		this.syncAppliedDateRangeFromPage()
	}

	afterUpdate() {
		if (this.$hbapp.querySelector('date-picker')) datePickerDefault()
		this.syncAppliedDateRangeFromPage()
	}

	getTransactionCategory(transaction = {}) {
		return transaction.category || {name: '', icon: ''}
	}

	escapeHtml(value = '') {
		return String(value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;')
	}

	formatMoney(amount = 0) {
		return `${Number(amount || 0).toFixed(2)} грн`
	}

	formatDayLabel(dateString = '') {
		const parts = String(dateString).split('.')
		if (parts.length !== 3) return dateString
		const date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T12:00:00`)
		if (Number.isNaN(date.getTime())) return dateString
		return new Intl.DateTimeFormat('uk-UA', {
			day: 'numeric',
			month: 'long'
		}).format(date)
	}

	getDaySortValue(dateString = '') {
		const parts = String(dateString).split('.')
		if (parts.length !== 3) return 0
		return new Date(`${parts[2]}-${parts[1]}-${parts[0]}T12:00:00`).getTime()
	}

	getTransactionTitle(transaction = {}, bank = '') {
		if (bank === 'mono') return transaction.description || 'Transaction'
		return [transaction.details, transaction.categoryDetails].filter(Boolean).join(': ') || 'Transaction'
	}

	getTransactionTimestamp(transaction = {}, bank = '') {
		if (bank === 'mono') return Number(transaction.time) * 1000
		return Number(transaction.date)
	}

	getTransactionBankLabel(bank = '') {
		const meta = this.getBankMeta(bank)
		return meta ? meta.name : ''
	}

	getCategoryIconClass(category = {}) {
		return category?.icon || 'other-icon'
	}

	getBankDetailValue(transaction = {}) {
		const bankName = transaction.source || '-'
		const meta = this.getBankMeta(transaction.bank)
		if (!meta?.logo) return this.escapeHtml(bankName)
		return `<span class="transaction-detail-bank">
			<img src="${this.escapeHtml(meta.logo)}" alt="${this.escapeHtml(meta.logoAlt || bankName)}">
			<span>${this.escapeHtml(bankName)}</span>
		</span>`
	}

	normalizeTransaction(transaction = {}, bank = '', index = 0) {
		const amount = Number(transaction.amount || 0)
		const timestamp = this.getTransactionTimestamp(transaction, bank)
		const category = this.getTransactionCategory(transaction)
		return {
			key: `${bank}-${timestamp}-${index}`,
			bank,
			source: this.getTransactionBankLabel(bank),
			title: this.getTransactionTitle(transaction, bank),
			amount,
			timestamp,
			time: timestamp ? this.timeStampToStringTime(timestamp, false) : '',
			category,
			raw: transaction
		}
	}

	isSelectedCategory(transaction = {}) {
		if (this.selectedCategoryId === 'ALL') return true
		return String(transaction.category?.id || '') === String(this.selectedCategoryId)
	}

	parceMonoData(m) {
		let amount = Number(m.amount)
		const category = this.getTransactionCategory(m)
		let cashbackAmountHtml = ''
		let commissionRateHtml = ''
		if (m.cashbackAmount > 0) {
			cashbackAmountHtml = `<div>
				<div class="font-weight-bold">Cashback</div>
				<div class="success-text">+${m.cashbackAmount}</div>
			</div>`
		}
		if (m.commissionRate > 0) {
			commissionRateHtml = `<div>
				<div class="font-weight-bold">Commission</div>
				<div class="error-text">-${m.commissionRate}</div>
			</div>`
		}
		return `
			<div class="transaction-row mb-row">
				<div class="d-flex align-items-center w-100">
					<div class="transaction-description">
						<div>${m.description}</div>
					</div>	
					<div class="transaction-amount text-center">
						<div class="${(amount < 0) ? 'error-text' : 'success-text'}">${amount.toFixed(2)}</div>
					</div>
				</div>
				<div class="transaction-more mt-1 ${category.icon || ''}">
					<div class="d-flex transaction-tab justify-content-around text-center">
						<div>
							<div class="font-weight-bold">Category</div>
							<div>${category.name || ''}</div>
						</div>
						${commissionRateHtml}
						${cashbackAmountHtml}
						<div>
							<div class="font-weight-bold">Date</div>
							<div class="transaction-date">
								<div>${this.timeStampToStringDate(m.time * 1000)}</div>
								<div>${this.timeStampToStringTime(m.time * 1000)}</div>
							</div>
						</div>
					</div>
				</div>
			</div>`
	}

	parcePrivatData(p) {
		let amount = Number(p.amount)
		const category = this.getTransactionCategory(p)
		let cashbackAmountHtml = ''
		let commissionRateHtml = ''
		if (p.cashback > 0) {
			cashbackAmountHtml = `<div>
				<div class="font-weight-bold">Cashback</div>
				<div class="success-text">+${p.cashback}</div>
			</div>`
		}
		if (p.fee > 0) {
			commissionRateHtml = `<div>
				<div class="font-weight-bold">Commission</div>
				<div class="error-text">-${p.fee}</div>
			</div>`
		}
		return `
			<div class="transaction-row pb-row">
				<div class="d-flex align-items-center w-100">
					<div class="transaction-description">
						<div>${p.details}: ${p.categoryDetails}</div>
					</div>	
					<div class="transaction-amount text-center">
						<div class="${(amount < 0) ? 'error-text' : 'success-text'}">${amount.toFixed(2)}</div>
					</div>
				</div>
				<div class="transaction-more mt-1 ${category.icon || ''}">
					<div class="d-flex transaction-tab justify-content-around text-center">
						<div>
							<div class="font-weight-bold">Category</div>
							<div>${category.name || ''}</div>
						</div>
						${commissionRateHtml}
						${cashbackAmountHtml}
						<div>
							<div class="font-weight-bold">Date</div>
							<div class="transaction-date">
								<div>${this.timeStampToStringDate(p.date)}</div>
								<div>${this.timeStampToStringTime(p.date)}</div>
							</div>
						</div>
					</div>
				</div>
			</div>`
	}

	getFilterByCategory(className = '', selectedCategoryId = this.selectedCategoryId) {
		let categoryHtml = `<select name="" id=""${className ? ` class="${className}"` : ''}><option value="ALL">ALL</option>`
		this.categories.forEach(category => {
			categoryHtml += `<option value="${category.id}"${String(selectedCategoryId) === String(category.id) ? ' selected' : ''}>${category.name}</option>`
		})
		return categoryHtml += '</select>'
	}

	getFilteredDayTransactions(day) {
		if (!day) return []
		let dateDiapasone = this.getTimeStampFromDiapasone(day, day).split(':')
		const transactions = []

		if (this.filterBank.indexOf('mono') !== -1) {
			;(Array.isArray(this.dataItems?.mono) ? this.dataItems.mono : []).forEach((item, index) => {
				if (!this.isSelectedCategory(item)) return
				const timestamp = this.getTransactionTimestamp(item, 'mono')
				if ((timestamp > Number(dateDiapasone[0])) && (timestamp < Number(dateDiapasone[1]))) {
					transactions.push(this.normalizeTransaction(item, 'mono', index))
				}
			})
		}

		if (this.filterBank.indexOf('privat') !== -1) {
			;(Array.isArray(this.dataItems?.privat) ? this.dataItems.privat : []).forEach((item, index) => {
				if (!this.isSelectedCategory(item)) return
				const timestamp = this.getTransactionTimestamp(item, 'privat')
				if ((timestamp > Number(dateDiapasone[0])) && (timestamp < Number(dateDiapasone[1]))) {
					transactions.push(this.normalizeTransaction(item, 'privat', index))
				}
			})
		}

		return transactions.sort((a, b) => Number(b.timestamp) - Number(a.timestamp))
	}

	getDaySummary(day) {
		const {mono = {in:0,out:0,count:0}, privat = {in:0,out:0,count:0}} = this.sumTransactionsByDate[day] || {}
		const summary = {
			in: 0,
			out: 0,
			count: 0
		}
		if (this.filterBank.indexOf('mono') !== -1) {
			summary.in += mono.in
			summary.out += mono.out
			summary.count += mono.count || 0
		}
		if (this.filterBank.indexOf('privat') !== -1) {
			summary.in += privat.in
			summary.out += privat.out
			summary.count += privat.count || 0
		}
		return summary
	}

	getTransactionCountLabel(count = 0) {
		return `${count} ${count === 1 ? 'transaction' : 'transactions'}`
	}

	getCurrentDateRange() {
		const from = this.$hbapp.querySelector('.transaction-filters .input-date-picker-from')?.value || ''
		const to = this.$hbapp.querySelector('.transaction-filters .input-date-picker-to')?.value || ''
		if (from && to) return {from, to}
		return this.appliedDateRange || this.getDefaultDateRange()
	}

	syncAppliedDateRangeFromPage() {
		if (this.appliedDateRange) return
		const from = this.$hbapp.querySelector('.transaction-filters .input-date-picker-from')?.value || ''
		const to = this.$hbapp.querySelector('.transaction-filters .input-date-picker-to')?.value || ''
		if (from && to) this.appliedDateRange = {from, to}
	}

	getDefaultDateRange() {
		const today = new Date()
		const year = today.getFullYear()
		const month = String(today.getMonth() + 1).padStart(2, '0')
		const day = String(today.getDate()).padStart(2, '0')
		return {
			from: `${year}-${month}-01`,
			to: `${year}-${month}-${day}`
		}
	}

	formatCompactDate(value = '') {
		const parts = String(value).split('-')
		if (parts.length !== 3) return value
		return `${parts[2]}.${parts[1]}`
	}

	getSelectedCategoryLabel(categoryId = this.selectedCategoryId) {
		if (categoryId === 'ALL') return 'All categories'
		const category = this.categories.find(item => String(item.id) === String(categoryId))
		return category?.name || 'All categories'
	}

	getSelectedBanksLabel(banks = this.filterBank) {
		const activeBanks = Array.isArray(banks) ? banks : []
		if (activeBanks.length !== 1) return activeBanks.length ? 'All banks' : 'No banks'
		const meta = this.getBankMeta(activeBanks[0])
		return meta?.name || activeBanks[0]
	}

	getMobileFilterSummaryTemplate() {
		const range = this.appliedDateRange || this.getCurrentDateRange()
		return `<div class="transaction-filter-summary-card">
			<div class="transaction-filter-summary-top">
				<div class="transaction-filter-period">${this.escapeHtml(this.formatCompactDate(range.from))} — ${this.escapeHtml(this.formatCompactDate(range.to))}</div>
				<button class="transaction-filter-open" type="button" data-action="open-filter-modal">Filters</button>
			</div>
			<div class="transaction-filter-summary-state">
					${this.escapeHtml(this.getSelectedCategoryLabel())} · ${this.escapeHtml(this.getSelectedBanksLabel())}
			</div>
		</div>`
	}

	getFilterDraft() {
		if (this.filterDraft) return this.filterDraft
		const range = this.getCurrentDateRange()
		this.filterDraft = {
			from: range.from,
			to: range.to,
			categoryId: this.selectedCategoryId,
			banks: [...this.filterBank]
		}
		return this.filterDraft
	}

	getFilterModalTemplate() {
		if (!this.filtersModalOpen) return ''
		const draft = this.getFilterDraft()
		return `<div class="app-modal-backdrop transaction-filter-modal-backdrop">
			<div class="app-modal transaction-filter-modal" role="dialog" aria-modal="true">
				<div class="app-modal-header">
					<h4>Filters</h4>
					<button class="app-modal-close" type="button" data-action="close-filter-modal" title="Close">×</button>
				</div>
				<div class="app-modal-body transaction-filter-modal-body">
					<div class="transaction-filter-modal-section">
						<div class="transaction-filter-modal-label">PERIOD</div>
						<label>From
							<input class="transaction-filter-modal-date" type="date" data-filter-field="from" value="${this.escapeHtml(draft.from)}">
						</label>
						<label>To
							<input class="transaction-filter-modal-date" type="date" data-filter-field="to" value="${this.escapeHtml(draft.to)}">
						</label>
					</div>
					<div class="transaction-filter-modal-section">
						<div class="transaction-filter-modal-label">CATEGORY</div>
						${this.getFilterByCategory('transaction-filter-modal-category', draft.categoryId)}
					</div>
					<div class="transaction-filter-modal-section">
						<div class="transaction-filter-modal-label">BANK</div>
						${this.getBankFilterControlsTemplate({
							banks: draft.banks,
							toggleAction: 'toggle-modal-bank',
							extraClass: 'transaction-bank-controls-modal'
						})}
					</div>
					<div class="transaction-filter-modal-section transaction-filter-sync-section">
						<div class="transaction-filter-modal-label">SYNC</div>
						${this.getBankRefreshControlsTemplate()}
					</div>
					<div class="app-modal-actions transaction-modal-actions">
						<button type="button" data-action="reset-filter-modal">Reset</button>
						<button type="button" data-action="apply-filter-modal">Apply</button>
					</div>
				</div>
			</div>
		</div>`
	}

	getDayModalTemplate() {
		if (!this.selectedDay) return ''
		return `<div class="app-modal-backdrop transaction-day-modal-backdrop">
			<div class="app-modal transaction-day-modal" role="dialog" aria-modal="true">
				${this.selectedTransaction ? this.getTransactionDetailModalContent() : this.getDayListModalContent()}
			</div>
		</div>`
	}

	getDayListModalContent() {
		const summary = this.getDaySummary(this.selectedDay)
		const transactions = this.getFilteredDayTransactions(this.selectedDay)
		return `<div class="app-modal-header transaction-day-modal-header">
				<h4>${this.escapeHtml(this.formatDayLabel(this.selectedDay))}</h4>
				<button class="app-modal-close" type="button" data-action="close-day-modal" title="Close">×</button>
			</div>
			<div class="app-modal-body transaction-day-modal-body">
				<div class="transaction-day-modal-summary">
					<div>
						<span>Expenses</span>
						<strong class="error-text">${this.formatMoney(Math.abs(summary.out))}</strong>
					</div>
					<div>
						<span>Income</span>
						<strong class="success-text">${this.formatMoney(summary.in)}</strong>
					</div>
					<p>${this.getTransactionCountLabel(summary.count)}</p>
				</div>
				<div class="transaction-day-modal-list">
					${transactions.map(transaction => this.getDayModalTransactionRow(transaction)).join('')}
				</div>
			</div>`
	}

	getDayModalTransactionRow(transaction = {}) {
		const categoryName = transaction.category?.name || 'Без категорії'
		const meta = [categoryName, transaction.source].filter(Boolean).join(' · ')
		const amountClass = transaction.amount < 0 ? 'error-text' : 'success-text'
		const categoryIconClass = this.getCategoryIconClass(transaction.category)
		return `<button class="transaction-day-row" type="button" data-action="open-transaction-detail" data-transaction-key="${this.escapeHtml(transaction.key)}">
			<span class="transaction-category-icon ${this.escapeHtml(categoryIconClass)}" aria-hidden="true"></span>
			<span class="transaction-day-row-main">
				<span class="transaction-day-row-title">${this.escapeHtml(transaction.title)}</span>
				<span class="transaction-day-row-meta">${this.escapeHtml(meta)}</span>
			</span>
			<span class="transaction-day-row-side">
				<strong class="${amountClass}">${this.formatMoney(transaction.amount)}</strong>
				${transaction.time ? `<span>${this.escapeHtml(transaction.time)}</span>` : ''}
			</span>
		</button>`
	}

	getTransactionDetailModalContent() {
		const transaction = this.selectedTransaction
		if (!transaction) return ''
		const categoryName = transaction.category?.name || 'Без категорії'
		const amountClass = transaction.amount < 0 ? 'error-text' : 'success-text'
		const categoryIconClass = this.getCategoryIconClass(transaction.category)
		return `<div class="app-modal-header transaction-day-modal-header">
				<button class="transaction-modal-back-btn" type="button" data-action="back-to-day-modal" title="Back">‹</button>
				<h4>Transaction</h4>
				<button class="app-modal-close" type="button" data-action="close-day-modal" title="Close">×</button>
			</div>
			<div class="app-modal-body transaction-day-modal-body">
				<div class="transaction-detail-title">${this.escapeHtml(transaction.title)}</div>
				<div class="transaction-detail-amount ${amountClass}">${this.formatMoney(transaction.amount)}</div>
				<div class="transaction-detail-grid">
					<div>
						<span>Category</span>
						<strong class="transaction-detail-category">
							<span class="transaction-category-icon ${this.escapeHtml(categoryIconClass)}" aria-hidden="true"></span>
							<span>${this.escapeHtml(categoryName)}</span>
						</strong>
					</div>
					<div>
						<span>Bank</span>
						<strong>${this.getBankDetailValue(transaction)}</strong>
					</div>
					<div>
						<span>Date</span>
						<strong>${this.escapeHtml(this.formatDayLabel(this.selectedDay))}</strong>
					</div>
					<div>
						<span>Time</span>
						<strong>${transaction.time ? this.escapeHtml(transaction.time) : '-'}</strong>
					</div>
				</div>
			</div>`
	}

	renderTemplate(updateFilters = false) {

		let htmlTemplate = '<div class="transaction-list-container">'
		if (!updateFilters) {
			this.sumTransactionsByDate = {
				mono: { ...this.dataForTotalSum },
				privat: { ...this.dataForTotalSum }
			}

			const calculateAmount = (bank, amount = 0) => {
				if (amount > 0)  this.sumTransactionsByDate[bank].in += amount
				if (amount < 0) this.sumTransactionsByDate[bank].out += amount
			}

			const calculateAmountByDate = (bank, date, amount = 0) => {
				if (!this.sumTransactionsByDate[date]) this.sumTransactionsByDate[date] = {}
				if (!this.sumTransactionsByDate[date][bank]) this.sumTransactionsByDate[date][bank] = {in:0,out:0,count:0}
				if (amount > 0) this.sumTransactionsByDate[date][bank].in += amount
				if (amount < 0) this.sumTransactionsByDate[date][bank].out += amount
			}

			const calculateCountByDate = (bank, date) => {
				if (!this.sumTransactionsByDate[date]) this.sumTransactionsByDate[date] = {}
				if (!this.sumTransactionsByDate[date][bank]) this.sumTransactionsByDate[date][bank] = {in:0,out:0,count:0}
				this.sumTransactionsByDate[date][bank].count += 1
			}

			
			let monoName = 'mono'
			const monoItems = Array.isArray(this.dataItems?.mono) ? this.dataItems.mono : []
			const privatItems = Array.isArray(this.dataItems?.privat) ? this.dataItems.privat : []
			const firstMono = monoItems[0]
			const firstPrivat = privatItems[0]
			let prevTransactionRowDate = firstMono ? this.timeStampToStringDate(firstMono.time * 1000) : this.timeStampToStringDate()
			monoItems.forEach(m => {
				if (!this.isSelectedCategory(m)) return
				let amount = Number(m.amount)
				let cashback = Number(m.cashbackAmount)
				let commission = Number(m.commissionRate)
				let transactionRowDate = this.timeStampToStringDate(m.time * 1000)
				calculateCountByDate(monoName, transactionRowDate)
				if (m.description.toLowerCase().indexOf('луць') === -1) {
					calculateAmount(monoName, amount)
					calculateAmountByDate(monoName, transactionRowDate, amount)
				}
				if (cashback) this.sumTransactionsByDate[monoName].cashback += cashback
				if (commission) this.sumTransactionsByDate[monoName].commission += commission
				if ((transactionRowDate === prevTransactionRowDate)) {
				} else {
					prevTransactionRowDate = transactionRowDate
				}
			})
			prevTransactionRowDate = firstPrivat ? this.timeStampToStringDate(firstPrivat.date) : this.timeStampToStringDate()
			let privatName = 'privat'
			privatItems.forEach(p => {
				if (!this.isSelectedCategory(p)) return
				let amount = Number(p.amount)
				let cashback = Number(p.cashback)
				let commission = Number(p.fee)
				let transactionRowDate = this.timeStampToStringDate(p.date)
				calculateCountByDate(privatName, transactionRowDate)
				calculateAmount(privatName, amount)
				calculateAmountByDate(privatName, transactionRowDate, amount)
				if (cashback) this.sumTransactionsByDate[privatName].cashback += cashback
				if (commission) this.sumTransactionsByDate[privatName].commission += commission
				if (transactionRowDate === prevTransactionRowDate) {
				} else {
					prevTransactionRowDate = transactionRowDate
				}
			})

			let rin = (this.sumTransactionsByDate.mono.in).toFixed(2)
			let rout = Math.abs(this.sumTransactionsByDate.mono.out + this.sumTransactionsByDate.privat.out).toFixed(2)
			// hbRangeCreate(0,0, {
			// 	'product': 13420.54,
			// 	'tranfer card': 41560.11,
			// 	'restoran': 10534.45,
			// 	'atm': 9000.00,
			// 	'12': 2012.44,
			// })

			document.querySelector('body').scrollToTop = 0
		}
		Object.keys(this.sumTransactionsByDate)
			.filter(i => i !== 'mono' && i !== 'privat')
			.sort((a, b) => this.getDaySortValue(b) - this.getDaySortValue(a))
			.forEach(i => {
			if (i === 'mono' || i === 'privat') return
			const transactionFiltersData = this.getDaySummary(i)
			if (this.filterBank.length) {
				if (transactionFiltersData.in === 0 && transactionFiltersData.out === 0) return
				htmlTemplate += `<button class="transaction-date-container transaction-day-card" type="button" data-action="open-day-modal" data-daterow="${this.escapeHtml(i)}">
						<div class="transaction-day-card-header">
							<strong>${this.escapeHtml(this.formatDayLabel(i))}</strong>
							<span>›</span>
						</div>
						<div class="transaction-day-card-totals">
							<div class="error-text">↓ ${this.formatMoney(Math.abs(transactionFiltersData.out))}</div>
							<div class="success-text">↑ ${this.formatMoney(transactionFiltersData.in)}</div>
						</div>
						<div class="transaction-day-card-count">${this.getTransactionCountLabel(transactionFiltersData.count)}</div>
					</button>`
			}
		})
		let tin = 0
		let tout = 0
		let tcashback = 0
		let tcommission = 0
		if (this.filterBank.indexOf('mono') !== -1) {
			tin += this.sumTransactionsByDate.mono.in
			tout += this.sumTransactionsByDate.mono.out
			tcashback += this.sumTransactionsByDate.mono.cashback
			tcommission += this.sumTransactionsByDate.mono.commission
		}
		if (this.filterBank.indexOf('privat') !== -1) {
			tout += this.sumTransactionsByDate.privat.out
			tcashback += this.sumTransactionsByDate.privat.cashback
			tcommission += this.sumTransactionsByDate.privat.commission
		}
		htmlTemplate = `<div class="${this.pageName}-container mt-3 mb-3">
			${this.getPageHeaderTemplate()}
			${this.getMobileFilterSummaryTemplate()}
			
			<div class="transaction-filters" id="transaction-filters">
				<div class="filter-by-date mt-2">
					<date-picker></date-picker>
					<button class="btn btn-icon filter-by-date-btn" type="button" data-action="apply-date-filter" title="Apply filter by date">&crarr;</button>
				</div>
				<div class="filter-by-category mt-3">
					${this.getFilterByCategory()}
				</div>
			</div>
			${this.getBankControlsTemplate()}
			<div class="transaction-results-anchor"></div>
			<div class="transactions-summary mt-3 mb-3">
				<div class="transactions-summary-grid">
					<div class="transactions-summary-item">
						<div class="transactions-summary-label">Income</div>
						<div class="transactions-summary-value success-text">↑ ${this.formatMoney(tin)}</div>
					</div>
					<div class="transactions-summary-item">
						<div class="transactions-summary-label">Expenses</div>
						<div class="transactions-summary-value error-text">↓ ${this.formatMoney(Math.abs(tout))}</div>
					</div>
					<div class="transactions-summary-item">
						<div class="transactions-summary-label">Cashback</div>
						<div class="transactions-summary-value success-text">+${this.formatMoney(tcashback)}</div>
					</div>
					<div class="transactions-summary-item">
						<div class="transactions-summary-label">Commission</div>
						<div class="transactions-summary-value error-text">${this.formatMoney(tcommission)}</div>
					</div>
				</div>
			</div>
			${htmlTemplate}
			${this.getFilterModalTemplate()}
			${this.getRefreshConfirmTemplate()}
			${this.getDayModalTemplate()}
			</div>
			</div>`
		return htmlTemplate
	}

	getBankControlsTemplate({banks = this.filterBank, toggleAction = 'toggle-bank', extraClass = ''} = {}) {
		return `<div class="transaction-bank-controls ${extraClass}">
			${['mono', 'privat'].map(bank => {
				const meta = this.getBankMeta(bank)
				const isActive = banks.indexOf(bank) !== -1
				return `<div class="transaction-bank-control">
					<button class="btn filter-btn ${isActive ? 'active-btn' : ''}" type="button" data-action="${toggleAction}" data-bank="${bank}">
						<img src="${meta.logo}" alt="${meta.logoAlt}">
						<span>${meta.name}</span>
					</button>
					<button class="transaction-bank-refresh" type="button" data-action="confirm-refresh-bank" data-bank="${bank}" title="Refresh ${meta.name} transactions">
						${this.state.loading && this.refreshingBank === bank ? '...' : '&#8635;'}
					</button>
				</div>`
			}).join('')}
		</div>`
	}

	getBankFilterControlsTemplate({banks = this.filterBank, toggleAction = 'toggle-bank', extraClass = ''} = {}) {
		return `<div class="transaction-bank-controls transaction-bank-filter-controls ${extraClass}">
			${['mono', 'privat'].map(bank => {
				const meta = this.getBankMeta(bank)
				const isActive = banks.indexOf(bank) !== -1
				return `<button class="btn filter-btn ${isActive ? 'active-btn' : ''}" type="button" data-action="${toggleAction}" data-bank="${bank}">
					<img src="${meta.logo}" alt="${meta.logoAlt}">
					<span>${meta.name}</span>
				</button>`
			}).join('')}
		</div>`
	}

	getBankRefreshControlsTemplate() {
		return `<div class="transaction-bank-refresh-controls">
			${['mono', 'privat'].map(bank => {
				const meta = this.getBankMeta(bank)
				const isRefreshing = this.state.loading && this.refreshingBank === bank
				return `<button class="transaction-bank-refresh-action" type="button" data-action="confirm-refresh-bank" data-bank="${bank}">
					<span>${meta.name}</span>
					<span>${isRefreshing ? '...' : '&#8635;'}</span>
				</button>`
			}).join('')}
		</div>`
	}

	getRefreshConfirmTemplate() {
		if (!this.refreshCandidate) return ''
		return `<div class="app-modal-backdrop transaction-modal-backdrop">
			<div class="app-modal transaction-modal" role="dialog" aria-modal="true">
				<div class="app-modal-header">
					<h4>Refresh ${this.refreshCandidate.name} transactions?</h4>
				</div>
				<div class="app-modal-body">
					<p>This will request fresh data from the bank API.</p>
					<div class="app-modal-actions transaction-modal-actions">
						<button type="button" data-action="close-refresh-modal">Cancel</button>
						<button type="button" data-action="refresh-bank">Refresh</button>
					</div>
				</div>
			</div>
		</div>`
	}

	getTemplate() {
		if (!this.state.loaded && this.state.loading && !this.state.data) return this.getLoadingTemplate()
		let queryParamsRaw = new URLSearchParams(location.search)
		let filterParam = queryParamsRaw.get('ft11')
		let setFilter = ''
		if (filterParam === 'm1') setFilter = 'privat'
		if (filterParam === 'p1') setFilter = 'mono'
		this.filterBank = this.filterBank.filter(i => i !== setFilter)
		return this.renderTemplate()
	}

	async filterByDate() {
		let df = this.$hbapp.querySelector('.transaction-filters .input-date-picker-from').value
		let dt = this.$hbapp.querySelector('.transaction-filters .input-date-picker-to').value

		const state = await this.refresh(`?date_from=${new Date(df).getTime()}&date_to=${new Date(dt).getTime()}`)
		if (!state?.error) this.appliedDateRange = {from: df, to: dt}
	}

	toggleBankFilter(bank) {
		if (this.filterBank.indexOf(bank) === -1) {
			this.filterBank.push(bank)
		} else {
			this.filterBank = this.filterBank.filter(i => i !== bank)
		}
		this.$hbapp.innerHTML = this.renderTemplate()
		this.afterUpdate()
	}

	openFilterModal() {
		const range = this.getCurrentDateRange()
		this.filterDraft = {
			from: range.from,
			to: range.to,
			categoryId: this.selectedCategoryId,
			banks: [...this.filterBank]
		}
		this.filtersModalOpen = true
		this.$hbapp.innerHTML = this.getTemplate()
		this.afterUpdate()
	}

	closeFilterModal() {
		this.filtersModalOpen = false
		this.filterDraft = null
		this.$hbapp.innerHTML = this.getTemplate()
		this.afterUpdate()
	}

	updateFilterDraftFromModal() {
		if (!this.filterDraft) return
		const from = this.$hbapp.querySelector('[data-filter-field="from"]')?.value
		const to = this.$hbapp.querySelector('[data-filter-field="to"]')?.value
		const categoryId = this.$hbapp.querySelector('.transaction-filter-modal-category')?.value
		if (from) this.filterDraft.from = from
		if (to) this.filterDraft.to = to
		if (categoryId) this.filterDraft.categoryId = categoryId
	}

	toggleModalBankFilter(bank) {
		this.updateFilterDraftFromModal()
		const draft = this.getFilterDraft()
		if (draft.banks.indexOf(bank) === -1) {
			draft.banks.push(bank)
		} else {
			draft.banks = draft.banks.filter(item => item !== bank)
		}
		this.$hbapp.innerHTML = this.getTemplate()
		this.afterUpdate()
	}

	resetFilterModal() {
		const range = this.getDefaultDateRange()
		this.filterDraft = {
			from: range.from,
			to: range.to,
			categoryId: 'ALL',
			banks: ['mono', 'privat']
		}
		this.$hbapp.innerHTML = this.getTemplate()
		this.afterUpdate()
	}

	async applyFilterModal() {
		this.updateFilterDraftFromModal()
		const draft = this.getFilterDraft()
		const appliedRange = this.appliedDateRange || this.getCurrentDateRange()
		const datesChanged = draft.from !== appliedRange.from || draft.to !== appliedRange.to
		const categoryChanged = String(draft.categoryId) !== String(this.selectedCategoryId)
		const banksChanged = [...draft.banks].sort().join(':') !== [...this.filterBank].sort().join(':')

		if (!datesChanged && !categoryChanged && !banksChanged) return this.closeFilterModal()

		if (datesChanged) {
			const state = await this.refresh(`?date_from=${new Date(draft.from).getTime()}&date_to=${new Date(draft.to).getTime()}`)
			if (state?.error) return
			this.appliedDateRange = {from: draft.from, to: draft.to}
		}

		this.selectedCategoryId = draft.categoryId
		this.filterBank = [...draft.banks]
		this.filtersModalOpen = false
		this.filterDraft = null
		this.$hbapp.innerHTML = this.renderTemplate()
		this.afterUpdate()
	}

	openRefreshConfirm(bank) {
		const meta = this.getBankMeta(bank)
		if (!meta) return
		this.refreshCandidate = {bank, ...meta}
		this.$hbapp.innerHTML = this.getTemplate()
		this.afterUpdate()
	}

	closeRefreshConfirm() {
		this.refreshCandidate = null
		this.$hbapp.innerHTML = this.getTemplate()
		this.afterUpdate()
	}

	confirmRefresh() {
		if (!this.refreshCandidate) return
		const query = `?updateTransaction=${this.refreshCandidate.refreshCode}`
		this.refreshingBank = this.refreshCandidate.bank
		this.pendingManualRefresh = true
		this.refreshCandidate = null
		this.refresh(query)
	}

	openDayModal(day) {
		this.selectedDay = day
		this.selectedTransaction = null
		this.$hbapp.innerHTML = this.getTemplate()
		this.afterUpdate()
	}

	closeDayModal() {
		this.selectedDay = null
		this.selectedTransaction = null
		this.$hbapp.innerHTML = this.getTemplate()
		this.afterUpdate()
	}

	openTransactionDetail(transactionKey) {
		if (!this.selectedDay || !transactionKey) return
		this.selectedTransaction = this.getFilteredDayTransactions(this.selectedDay)
			.find(transaction => transaction.key === transactionKey) || null
		this.$hbapp.innerHTML = this.getTemplate()
		this.afterUpdate()
	}

	backToDayModal() {
		this.selectedTransaction = null
		this.$hbapp.innerHTML = this.getTemplate()
		this.afterUpdate()
	}

	processingClickEvent(event) {
		const actionTarget = event.target.closest('[data-action]')
		if (actionTarget) {
			const {action, bank, daterow, transactionKey} = actionTarget.dataset
			if (action === 'toggle-bank') return this.toggleBankFilter(bank)
			if (action === 'open-filter-modal') return this.openFilterModal()
			if (action === 'close-filter-modal') return this.closeFilterModal()
			if (action === 'toggle-modal-bank') return this.toggleModalBankFilter(bank)
			if (action === 'reset-filter-modal') return this.resetFilterModal()
			if (action === 'apply-filter-modal') return this.applyFilterModal()
			if (action === 'confirm-refresh-bank') return this.openRefreshConfirm(bank)
			if (action === 'close-refresh-modal') return this.closeRefreshConfirm()
			if (action === 'refresh-bank') return this.confirmRefresh()
			if (action === 'apply-date-filter') return this.filterByDate()
			if (action === 'open-day-modal') return this.openDayModal(daterow)
			if (action === 'close-day-modal') return this.closeDayModal()
			if (action === 'open-transaction-detail') return this.openTransactionDetail(transactionKey)
			if (action === 'back-to-day-modal') return this.backToDayModal()
			if (action === 'toggle-data-status') {
				this.dataStatusOpen = !this.dataStatusOpen
				this.$hbapp.innerHTML = this.getTemplate()
				this.afterUpdate()
				return
			}
		}

		if (!event.target.closest('.data-status') && this.dataStatusOpen) {
			this.dataStatusOpen = false
			this.$hbapp.innerHTML = this.getTemplate()
			this.afterUpdate()
			return
		}

		if (event.target.classList.contains('transaction-modal-backdrop')) return this.closeRefreshConfirm()
		if (event.target.classList.contains('transaction-day-modal-backdrop')) return this.closeDayModal()
		if (event.target.classList.contains('transaction-filter-modal-backdrop')) return this.closeFilterModal()

		const transactionRow = event.target.closest('.transaction-row')
		if (transactionRow) {
			transactionRow.querySelector('.transaction-more')?.classList.toggle('active')
			return
		}

		if (event.target.closest('.filter-by-date')) event.preventDefault()
	}

	processingChangeEvent(event) {
		if (event.target.closest('.filter-by-category')) {
			this.selectedCategoryId = event.target.value
			this.$hbapp.innerHTML = this.renderTemplate()
			this.afterUpdate()
			return
		}

		if (event.target.closest('.transaction-filter-modal')) {
			this.updateFilterDraftFromModal()
			return
		}
	}

	eventsRegister(event, eventKey) {
		if (eventKey === 'click') {
			this.processingClickEvent(event)
		}

		if (eventKey === 'change') {
			this.processingChangeEvent(event)
		}
	}
}
