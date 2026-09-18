import AbstractClass from './AbstractClass.js'
import balanceStore from '../stores/BalanceStore.js'
import DataStatus, { createDataStatusViewModel } from '../components/DataStatus.js'
import Toast from '../components/Toast.js'

const BANK_PROVIDERS = [
	{
		key: 'mono',
		name: 'monobank',
		logo: '/hbapp/assets/images/mblogo1.png',
		logoAlt: 'mblogo',
		refreshCode: '1',
		transactionFilter: 'm1',
		amountScale: 100,
		dateScale: 1000
	},
	{
		key: 'privat',
		name: 'PrivatBank',
		logo: '/hbapp/assets/images/pblogo1.png',
		logoAlt: 'pblogo',
		refreshCode: '2',
		transactionFilter: 'p1',
		amountScale: 1,
		dateScale: 1
	}
]

export default class BalancePage extends AbstractClass {

	pageName = 'balance'
	state = balanceStore.getState()
	unsubscribe = null
	refreshCandidate = null
	refreshingBankKey = null
	dataStatusOpen = false
	previousStatusState = null
	pendingManualRefresh = false

	constructor(hbapp) {
		super(hbapp)
		this.init()
	}

	init(queryParam = '') {
		balanceStore.load(queryParam)
		this.unsubscribe = balanceStore.subscribe(state => {
			this.handleStatusTransition(this.state, state)
			this.state = state
			if (!state.loading) this.refreshingBankKey = null
			this.$hbapp.innerHTML = this.getTemplate()
		})
	}

	destroy() {
		if (this.unsubscribe) this.unsubscribe()
		this.unsubscribe = null
	}

	getLoadingTemplate() {
		return `<div class="${this.pageName}-container mt-3">
			${this.getPageHeaderTemplate()}
		</div>`
	}

	getProviders() {
		const dataItems = this.state.data || {}
		return BANK_PROVIDERS.map(provider => ({
			...provider,
			accounts: Array.isArray(dataItems[provider.key]) ? dataItems[provider.key] : []
		}))
	}

	normalizeAccount(provider, account = {}) {
		return {
			...account,
			current: Number(account.balance || 0) / provider.amountScale,
			credit: Number(account.credit_limit || 0) / provider.amountScale,
			date: account.date
		}
	}

	formatAmount(value) {
		return (Number(value) || 0).toFixed(2)
	}

	getProviderStatusLabel() {
		if (this.state.stale) return 'Offline'
		if (this.state.source === 'api') return 'Live'
		if (this.state.source === 'cache') return 'Cached'
		return '-'
	}

	formatStatusDateTime(value) {
		return `${this.timeStampToStringDate(value)} ${this.timeStampToStringTime(value, false)}`
	}

	formatCacheUpdateTime(value) {
		return value ? this.timeStampToStringTime(value, false) : '-'
	}

	getBankSnapshotTimestamp(provider) {
		const timestamps = provider.accounts
			.map(account => Number(account.date) * provider.dateScale)
			.filter(timestamp => Number.isFinite(timestamp) && timestamp > 0)

		return timestamps.length ? Math.max(...timestamps) : null
	}

	formatBankSnapshotDateTime(provider) {
		const timestamp = this.getBankSnapshotTimestamp(provider)
		if (!timestamp) return '-'

		return `${this.timeStampToStringDate(timestamp)} ${this.timeStampToStringTime(timestamp)}`
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
		return ''
		return `<div class="page-compact-header">
			<h3 class="page-title-chip">Balance</h3>
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
				Toast.show('Update failed · Showing previous data', {type: 'warning', key: 'balance-manual-failed'})
			} else if (nextState.source === 'api') {
				Toast.show('Balance updated', {type: 'success', key: 'balance-manual-success'})
			}
			this.pendingManualRefresh = false
		} else if (previousState && !previousState.stale && nextState.stale && nextState.data) {
			Toast.show('Offline · Showing cached data', {type: 'warning', key: 'balance-offline'})
		} else if (previousState?.stale && !nextState.stale && nextState.source === 'api') {
			Toast.show('Online · Data updated', {type: 'success', key: 'balance-online'})
		}

		this.previousStatusState = nextState
	}

	getTotalTemplate(providers) {
		const totals = providers.reduce((result, provider) => {
			provider.accounts.forEach(account => {
				const normalized = this.normalizeAccount(provider, account)
				result.current += normalized.current
				result.credit += normalized.credit
			})
			return result
		}, {current: 0, credit: 0})
		const totalBalance = totals.current - totals.credit

		return `<div class="card total-card">
			<div class="card-title total-title" data-otransaction="3" title="Open all transactions">Total</div>
			<div class="d-flex justify-content-between card-row">
				<span class="font-weight-bold">Total:</span>
				<span class="${totalBalance > 0 ? 'success' : 'error'}-text">${this.formatAmount(totalBalance)}</span>
			</div>
			<div class="d-flex justify-content-between card-row">
				<span class="font-weight-bold">Current:</span>
				<span>${this.formatAmount(totals.current)}</span>
			</div>
			<div class="total-cache-time card-time" title="Local aggregate/cache calculation time">
				Updated: ${this.formatCacheUpdateTime(this.state.updatedAt)}
			</div>
		</div>`
	}

	renderBankLogoName(provider, accountTitle) {
		return `
			<button class="bank-refresh-trigger" type="button" data-bank-refresh="${provider.key}" title="Refresh ${provider.name} (${accountTitle})">
				<img src="${provider.logo}" alt="${provider.logoAlt}">
				<span>${provider.name}</span>
			</button>	
		`
	}

	getBankAccountsTemplate(provider) {
		const accounts = provider.accounts.length ? provider.accounts : [{balance: 0, credit_limit: 0}]

		return accounts.map((account, index) => {
			const normalized = this.normalizeAccount(provider, account)
			const total = normalized.current - normalized.credit
			const accountTitle = account.type || account.card_number || account.account || `Account ${index + 1}`
			return `<div class="bank-account-card">
				<div class="card-title total-title" data-otransaction="3" title="Open all transactions">
					${this.renderBankLogoName(provider, accountTitle)}
				</div>
				<div class="bank-account-title d-none">${accountTitle}</div>
				<div class="d-flex justify-content-between card-row">
					<span class="font-weight-bold">Total:</span>
					<span class="${total > 0 ? 'success' : 'error'}-text">${this.formatAmount(total)}</span>
				</div>
				<div class="d-flex justify-content-between card-row">
					<span class="font-weight-bold">Current:</span>
					<span>${this.formatAmount(normalized.current)}</span>
				</div>
				<div class="d-flex justify-content-between card-row">
					<span class="font-weight-bold">Credit:</span>
					<span>${this.formatAmount(normalized.credit)}</span>
				</div>
			</div>`
		}).join('')
	}

	renderBankCard(provider) {
		const isRefreshing = this.state.loading && this.refreshingBankKey === provider.key
		const updateLabel = this.formatBankSnapshotDateTime(provider)

		return `<div class="card bank-card ${provider.key}-card" data-bank="${provider.key}">
			${this.getBankAccountsTemplate(provider)}
			<div class="d-flex justify-content-between card-time">
				<span>Last update:</span>
				<span>${updateLabel}</span>
			</div>
		</div>`
	}

	getRefreshConfirmTemplate() {
		if (!this.refreshCandidate) return ''
		return `<div class="app-modal-backdrop balance-modal-backdrop">
			<div class="app-modal balance-modal" role="dialog" aria-modal="true">
				<div class="app-modal-header">
					<h4>Refresh ${this.refreshCandidate.name} data?</h4>
				</div>
				<div class="app-modal-body">
					<p>This will request fresh data from the bank API.</p>
					<div class="app-modal-actions balance-modal-actions">
						<button class="balance-refresh-cancel" type="button">Cancel</button>
						<button class="balance-refresh-confirm" type="button">Refresh</button>
					</div>
				</div>
			</div>
		</div>`
	}

	getTemplate() {
		if (!this.state.loaded && this.state.loading && !this.state.data) return this.getLoadingTemplate()
		const providers = this.getProviders()

		return `<div class="${this.pageName}-container mt-2">
			${this.getPageHeaderTemplate()}
			${this.getTotalTemplate(providers)}
			${providers.map(provider => this.renderBankCard(provider)).join('')}
			${this.getRefreshConfirmTemplate()}
		</div>`
	}

	openRefreshConfirm(bankKey) {
		this.refreshCandidate = BANK_PROVIDERS.find(provider => provider.key === bankKey) || null
		this.$hbapp.innerHTML = this.getTemplate()
	}

	closeRefreshConfirm() {
		this.refreshCandidate = null
		this.$hbapp.innerHTML = this.getTemplate()
	}

	confirmRefresh() {
		if (!this.refreshCandidate) return
		const refreshCode = this.refreshCandidate.refreshCode
		this.refreshingBankKey = this.refreshCandidate.key
		this.pendingManualRefresh = true
		this.refreshCandidate = null
		balanceStore.refresh(`?updateBalance=${refreshCode}`)
	}

	processingClickEvent(event) {
		if (event.target.closest('.balance-refresh-cancel') || event.target.classList.contains('balance-modal-backdrop')) {
			this.closeRefreshConfirm()
			return
		}

		if (event.target.closest('[data-action="toggle-data-status"]')) {
			this.dataStatusOpen = !this.dataStatusOpen
			this.$hbapp.innerHTML = this.getTemplate()
			return
		}

		if (!event.target.closest('.data-status') && this.dataStatusOpen) {
			this.dataStatusOpen = false
			this.$hbapp.innerHTML = this.getTemplate()
			return
		}

		if (event.target.closest('.balance-refresh-confirm')) {
			this.confirmRefresh()
			return
		}

		const refreshTrigger = event.target.closest('.bank-refresh-trigger')
		if (refreshTrigger) {
			this.openRefreshConfirm(refreshTrigger.dataset.bankRefresh)
			return
		}

		if (event.target.closest('.total-title')) {
			this.router.redirectRouter('/transaction?ft11=3')
		}
	}

	eventsRegister(event, eventKey) {
		if (eventKey === 'click') {
			this.processingClickEvent(event)
		}
	}
}
