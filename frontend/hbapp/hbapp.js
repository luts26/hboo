import router from './router/router.js'
import config from './config/config.js'
import header from './components/header.js'
import container from './components/container.js'
import footer from './components/footer.js'
// import {yCalc} from './mixins/calculatorHelper.js'
import planningStore from './stores/PlanningStore.js'
import balanceStore from './stores/BalanceStore.js'
import transactionStore from './stores/TransactionStore.js'
import FinancialSummary from './components/FinancialSummary.js'
import {clearAuthState, getAuthenticatedUserId, getAuthToken} from './services/AuthSession.js'
import connectionSyncStatus from './services/ConnectionSyncStatus.js'
import {deriveSectionFreshness} from './services/SectionFreshness.js'
import {resolveWorkspaceSwipe} from './services/WorkspaceNavigationGesture.js'
import authModal from './components/AuthModal.js'
import appLockSession from './services/AppLockSession.js'
import appLockScreen from './components/AppLockScreen.js'

const hbapp = {

	hbapp: document.querySelector('hb-app'),
	authToken: getAuthToken(),
	colorTheme: localStorage.getItem('ctfhb'),
	hbrouter: null,
	pageObject: undefined,
	financialSummaryViewModel: null,
	planningState: planningStore.getState(),
	balanceSummaryState: balanceStore.getState(),
	transactionSummaryState: transactionStore.getState(),
	unsubscribeFinancialSummary: null,
	unsubscribeBalanceSummary: null,
	unsubscribeTransactionSummary: null,
	unsubscribeConnectionSyncStatus: null,
	defaultTemplate: false,
	mobileView: 'content',
	viewSwipe: null,
	appLockMounted: false,

	setColorTheme: function() {
		document.querySelector('body').classList.toggle('dark-theme')
		let currentTheme = (document.querySelector('body').classList.contains('dark-theme')) ? 'dark' : 'light'
		localStorage.setItem('ctfhb', currentTheme)
	},

	setDefaultTemplate: function() {
		this.hbapp.innerHTML = ''
		container.setContent(this.hbapp, config)
		header.setContent(this.hbapp, config)
		this.mountFinancialSummary()
		this.mountConnectionSyncStatus()
		// yCalc()
		// footer.setContent(this.hbapp, config)
		this.hbrouter = this.hbapp.querySelector('#hbrouter')
		this.defaultTemplate = true
	},

	mountConnectionSyncStatus: function() {
		if (this.unsubscribeConnectionSyncStatus) this.unsubscribeConnectionSyncStatus()
		this.unsubscribeConnectionSyncStatus = connectionSyncStatus.subscribe(state => {
			this.renderConnectionSyncStatus(state)
		})
	},

	renderConnectionSyncStatus: function(state = connectionSyncStatus.getState()) {
		const freshness = deriveSectionFreshness({
			route: router.getCurrentPath() || router.defaultUrlPath,
			balanceState: this.balanceSummaryState,
			transactionState: this.transactionSummaryState,
			planningState: this.planningState
		})
		this.hbapp.querySelectorAll('.hboo-sync-card').forEach(card => {
			card.dataset.syncPresentation = state.presentation
			card.dataset.syncTone = state.tone
			card.dataset.syncApi = state.api
			card.classList.toggle('hboo-sync-card-no-freshness', !freshness)
			card.classList.toggle('hboo-sync-card-actionable', state.api === 'auth_required')
			card.setAttribute('aria-disabled', state.api === 'auth_required' ? 'false' : 'true')
			card.setAttribute('aria-label', `HBOO Sync: ${state.title}. ${state.detail}${freshness ? `. ${freshness.text}` : ''}`)
			const title = card.querySelector('[data-hboo-sync-title]')
			const detail = card.querySelector('[data-hboo-sync-detail]')
			const secondary = card.querySelector('[data-hboo-sync-secondary]')
			if (title) title.textContent = state.title
			if (detail) detail.textContent = state.detail
			if (secondary) secondary.textContent = freshness?.text || ''
		})
		this.hbapp.querySelectorAll('.workspace-attention-marker').forEach(marker => {
			marker.dataset.syncPresentation = state.presentation
			marker.dataset.syncTone = state.tone
			marker.setAttribute('title', `HBOO Sync: ${state.title}`)
		})
	},

	mountFinancialSummary: function() {
		if (this.unsubscribeFinancialSummary) this.unsubscribeFinancialSummary()
		if (this.unsubscribeBalanceSummary) this.unsubscribeBalanceSummary()
		if (this.unsubscribeTransactionSummary) this.unsubscribeTransactionSummary()

		this.unsubscribeFinancialSummary = planningStore.subscribe(state => {
			this.planningState = state
			this.renderFinancialSummary(planningStore.getSummaryViewModel(state))
		})
		this.unsubscribeBalanceSummary = balanceStore.subscribe(state => {
			this.balanceSummaryState = state
			this.renderFinancialSummary()
		})
		this.unsubscribeTransactionSummary = transactionStore.subscribe(state => {
			this.transactionSummaryState = state
			this.renderFinancialSummary()
		})
		balanceStore.hydrateFromCache()
		transactionStore.hydrateFromCache()
		planningStore.load()
	},

	renderFinancialSummary: function(viewModel = this.financialSummaryViewModel) {
		this.financialSummaryViewModel = {
			...(viewModel || {}),
			balanceState: this.balanceSummaryState,
			transactionState: this.transactionSummaryState
		}
		this.hbapp.querySelectorAll('.financial-summary-root').forEach(root => {
			const summary = new FinancialSummary(root)
			summary.render(this.financialSummaryViewModel)
		})
		this.updateSidebarActiveRoute()
	},

	updateSidebarActiveRoute(path = router.getCurrentPath()) {
		const activePath = (path || router.defaultUrlPath).replace(/^\//, '')
		this.hbapp.querySelectorAll('[data-summary-nav]').forEach(item => {
			const isActive = item.dataset.summaryNav === activePath
			item.classList.toggle('financial-summary-link-active', isActive)
			if (isActive) item.setAttribute('aria-current', 'page')
			else item.removeAttribute('aria-current')
		})
		this.renderConnectionSyncStatus()
	},

	logoutApp() {
		clearAuthState()
		router.redirectRouter('/login')
		window.location.reload()
	},

	mountAppLock() {
		if (this.appLockMounted) return
		this.appLockMounted = true
		appLockScreen.mount()
		appLockSession.start()
	},

	closeHeaderMenu() {
		const headerUtility = this.hbapp.querySelector('.header-utility')
		if (!headerUtility) return
		headerUtility.classList.remove('open')
		headerUtility.querySelector('.header-menu-toggle')?.setAttribute('aria-expanded', 'false')
		headerUtility.querySelectorAll('.header-menu-submenu.open').forEach(item => {
			item.classList.remove('open')
			item.querySelector('.header-submenu-toggle')?.setAttribute('aria-expanded', 'false')
		})
	},

	toggleHeaderMenu() {
		const headerUtility = this.hbapp.querySelector('.header-utility')
		if (!headerUtility) return
		const isOpen = headerUtility.classList.toggle('open')
		headerUtility.querySelector('.header-menu-toggle')?.setAttribute('aria-expanded', isOpen ? 'true' : 'false')
		if (!isOpen) {
			headerUtility.querySelectorAll('.header-menu-submenu.open').forEach(item => {
				item.classList.remove('open')
				item.querySelector('.header-submenu-toggle')?.setAttribute('aria-expanded', 'false')
			})
		}
	},

	toggleHeaderSubmenu(button) {
		const submenu = button?.closest('.header-menu-submenu')
		if (!submenu) return
		const isOpen = submenu.classList.toggle('open')
		button.setAttribute('aria-expanded', isOpen ? 'true' : 'false')
	},

	setMobileView(view = 'content') {
		this.mobileView = view === 'sidebar' ? 'sidebar' : 'content'
		this.hbapp.classList.toggle('mobile-summary-open', this.mobileView === 'sidebar')
		this.hbapp.querySelector('.app-name')?.setAttribute('aria-expanded', this.mobileView === 'sidebar' ? 'true' : 'false')
	},

	navigateAppRoute(route, hash = '') {
		if (!route) return
		const nextPath = hash ? `/${route}#${hash}` : `/${route}`
		this.closeHeaderMenu()
		router.redirectRouter(nextPath)
		this.setMobileView('content')
		this.updateSidebarActiveRoute(route)
		if (route === 'settings' && this.pageObject?.pageName === 'settings' && this.pageObject.showSectionFromHash) {
			this.pageObject.showSectionFromHash()
		}
	},

	isMobileSwipeEnabled() {
		return window.matchMedia && window.matchMedia('(max-width: 600px)').matches
	},

	shouldIgnoreViewSwipe(target) {
		if (this.mobileView === 'sidebar') {
			return Boolean(target.closest('[data-no-view-swipe], input, textarea, select, button, a, label, [contenteditable="true"], .header-utility-menu'))
		}
		return Boolean(target.closest('[data-no-view-swipe], input, textarea, select, button, a, label, [contenteditable="true"], .header, .navigation, .header-utility-menu'))
	},

	handleViewSwipeStart(event) {
		if (!this.isMobileSwipeEnabled() || this.shouldIgnoreViewSwipe(event.target)) {
			this.viewSwipe = null
			return
		}
		const point = event.touches ? event.touches[0] : event
		this.viewSwipe = {
			x: point.clientX,
			y: point.clientY
		}
	},

	handleViewSwipeEnd(event) {
		if (!this.viewSwipe || !this.isMobileSwipeEnabled()) return
		const changedTouch = event.changedTouches ? event.changedTouches[0] : event
		const action = resolveWorkspaceSwipe(this.viewSwipe, {
			x: changedTouch.clientX,
			y: changedTouch.clientY
		}, {
			mobileView: this.mobileView,
			viewportWidth: window.innerWidth
		})
		this.viewSwipe = null

		if (!action) return
		if (action === 'open') this.setMobileView('sidebar')
		else if (action === 'close') this.setMobileView('content')
	},

	setEventListeners() {
		this.hbapp.addEventListener('keypress', e => {
			if (e.keyCode === 13) {
				this.pageObject.eventsRegister(e, 'keypressenter')
			}
		})

		this.hbapp.addEventListener('click', e => {
			if (e.target.closest('[data-summary-nav]')) {
				const navPath = e.target.closest('[data-summary-nav]').dataset.summaryNav
				this.navigateAppRoute(navPath)
				return
			}
			if (e.target.closest('[data-action="hboo-sync-status"]')) {
				this.closeHeaderMenu()
				if (connectionSyncStatus.getState().api === 'auth_required') {
					authModal.open()
				}
				return
			}
			if (e.target.closest('[data-action="header-menu-toggle"]')) {
				this.toggleHeaderMenu()
				return
			}
			if (e.target.closest('[data-action="header-menu-settings-toggle"]')) {
				this.toggleHeaderSubmenu(e.target.closest('[data-action="header-menu-settings-toggle"]'))
				return
			}
			if (e.target.closest('[data-action="header-menu-route"]')) {
				const item = e.target.closest('[data-action="header-menu-route"]')
				this.navigateAppRoute(item.dataset.route, item.dataset.hash)
				return
			}
			if (e.target.closest('[data-action="header-menu-logout"]')) {
				this.closeHeaderMenu()
				return this.logoutApp()
			}
			if (e.target.closest('.label-header')) {
				let sparam = e.target.dataset.sparam
				if (!sparam) {
					this.closeHeaderMenu()
					this.setMobileView(this.mobileView === 'sidebar' ? 'content' : 'sidebar')
					return
				}
				if (sparam === 'out') {
					this.logoutApp()
					return
				}
				if (sparam !== 'set') {
					document.querySelectorAll('.set-item').forEach(i => {
						i.classList.add('d-none')
					})
					if (document.querySelector(`#${sparam}`)) {
						document.querySelector(`#${sparam}`).classList.remove('d-none')
					}
				} else {
					document.querySelectorAll('.set-item').forEach(i => {
						i.classList.remove('d-none')
					})
				}
			}
			if (e.target.closest('.app-name')) {
				this.closeHeaderMenu()
				this.setMobileView(this.mobileView === 'sidebar' ? 'content' : 'sidebar')
				return
			}
			if (this.mobileView === 'sidebar' && this.isMobileSwipeEnabled() && e.target.closest('.app-main-column')) {
				this.closeHeaderMenu()
				this.setMobileView('content')
				return
			}
			if (e.target.closest('.theme-toggler')) {
				return this.setColorTheme()
			}
			// if (event.target.closest('.mmenu')) {
			// 	console.log('asdfasdfasdf')
			// 	document.querySelector('.sub-menu').classList.toggle('active')
			// 	return
			// }
			if (e.target.closest('.sub-menu')) {
				let {sparam} = e.target.dataset
				if (sparam !== 'out') return this.navigateAppRoute('settings', sparam)
				else return this.logoutApp()
			}
			this.closeHeaderMenu()
			this.pageObject.eventsRegister(e, 'click')
		})

		this.hbapp.addEventListener('change', e => {
			this.pageObject.eventsRegister(e, 'change')
		})

		this.hbapp.addEventListener('touchstart', e => this.handleViewSwipeStart(e), {passive: true})
		this.hbapp.addEventListener('touchend', e => this.handleViewSwipeEnd(e), {passive: true})
	},

	setPageTitle() {
		// let currentTitle = document.title.split('|')
        let title = this.pageObject.pageName
        // if (currentTitle.length > 1) {
        //     currentTitle = currentTitle[currentTitle.length - 1]
        // } else {
        //     currentTitle = document.title
        // }
        // window.document.title = `${title.charAt(0).toUpperCase()}${title.slice(1)} | ${currentTitle.trim()}`
        window.document.title = `${title.charAt(0).toUpperCase()}${title.slice(1)} | ${config.appAlias}`
	},

	createPageObject: function(pageObject) {
		if (!pageObject) return
		if (this.pageObject?.destroy) this.pageObject.destroy()
		if (this.pageObject) delete this.pageObject
		if (pageObject.name === 'LoginPage') {
			this.pageObject = new pageObject(this.hbapp)
		} else {
			if (!this.defaultTemplate) this.setDefaultTemplate()
			this.setMobileView('content')
			this.pageObject = new pageObject(this.hbrouter)
			this.renderFinancialSummary()
		}
		this.updateSidebarActiveRoute(router.getCurrentPath())
		this.setPageTitle()
	},

	createProject: function() {

		if (this.colorTheme) document.querySelector('body').classList.add(`${this.colorTheme}-theme`)
		this.mountAppLock()

		this.authToken = getAuthToken()
		if (this.authToken && getAuthenticatedUserId()) this.setDefaultTemplate()
		else {
			if (this.authToken) clearAuthState()
			router.redirectRouter('/login')
		}

		this.setEventListeners()

		setInterval(() => {
			this.createPageObject(router.routerListenerHandler())
		}, 1000)
	}
}

export default hbapp
