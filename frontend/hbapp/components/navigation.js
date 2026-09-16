import router from '../router/router.js'

const primaryItems = [
	{path: 'balance', label: 'Balance'},
	{path: 'transaction', label: 'Transactions'}
]

const secondaryItems = [
	{path: 'deposit', label: 'Deposit'},
	{path: 'settings', label: 'Settings'}
]

const getRoutePath = path => path === '/' ? 'home' : path.replace(/^\//, '')

const getNavItemHtml = (item, activePath, extraClass = '') => {
	const activeClass = item.path === activePath ? ' active-link' : ''
	return `<li class="items-list-item ${item.path}-nav-link${activeClass}${extraClass}">
		<a class="item-link" href="/${item.path}" data-navpath="${item.path}">${item.label}</a>
	</li>`
}

const navigation = {

	hbapp: undefined,
	navigationItems: [
		...primaryItems.map(item => item.path),
		...secondaryItems.map(item => item.path)
	],

	getHtml: function() {
		const activePath = getRoutePath(router.getCurrentPath() || router.defaultUrlPath)
		const primaryHtml = primaryItems.map(item => getNavItemHtml(item, activePath)).join('')
		const secondaryHtml = secondaryItems.map(item => getNavItemHtml(item, activePath)).join('')
		const moreActiveClass = secondaryItems.some(item => item.path === activePath) ? ' active-link' : ''

		return `<nav class="navigation navigation-desktop d-none">
			<ul class="items-list">
				${primaryHtml}
				<li class="items-list-item more-nav-link${moreActiveClass}">
					<button class="item-link navigation-more-toggle" type="button">More</button>
					<ul class="navigation-more-menu">
						${secondaryHtml}
					</ul>
				</li>
			</ul>
		</nav>
		<nav class="navigation navigation-mobile d-none">
			<ul class="items-list">
				${primaryHtml}
				<li class="items-list-item more-nav-link${moreActiveClass}">
					<button class="item-link navigation-more-toggle" type="button">More</button>
					<ul class="navigation-more-menu">
						${secondaryHtml}
					</ul>
				</li>
			</ul>
		</nav>`
	},

	eventNavigationHandler: function(event) {
		const moreToggle = event.target.closest('.navigation-more-toggle')
		if (moreToggle) {
			const moreItem = moreToggle.closest('.more-nav-link')
			this.hbapp.querySelectorAll('.more-nav-link').forEach(item => {
				if (item !== moreItem) item.classList.remove('open')
			})
			moreItem.classList.toggle('open')
			return
		}

		const link = event.target.closest('a[data-navpath]')
		if (!link) return
		const navPath = link.dataset.navpath
		if (this.navigationItems.indexOf(navPath) === -1) return
		this.hbapp.querySelectorAll('.more-nav-link').forEach(item => item.classList.remove('open'))
		this.hbapp.classList.remove('mobile-summary-open')
		router.redirectRouter(`/${navPath}`)
		this.updateActiveRoute(navPath)
	},

	updateActiveRoute: function(path = router.getCurrentPath()) {
		if (!this.hbapp) return
		const activePath = getRoutePath(path || router.defaultUrlPath)
		this.hbapp.querySelectorAll('.navigation .active-link').forEach(item => item.classList.remove('active-link'))
		this.hbapp.querySelectorAll(`.navigation .${activePath}-nav-link`).forEach(item => item.classList.add('active-link'))
		const isSecondary = secondaryItems.some(item => item.path === activePath)
		this.hbapp.querySelectorAll('.navigation .more-nav-link').forEach(item => {
			item.classList.toggle('active-link', isSecondary)
		})
	},

	setNavigation: function(hbapp) {
		this.hbapp = hbapp
		const slot = hbapp.querySelector('.app-navigation-slot')
		if (slot && !slot.querySelector('.navigation-desktop')) {
			slot.innerHTML = this.getHtml()
			this.updateActiveRoute()
			return
		}
		const header = hbapp.querySelector('.header')
		if (!header || hbapp.querySelector('.navigation-desktop')) return
		header.insertAdjacentHTML('afterend', this.getHtml())
		this.updateActiveRoute()
	}
}

export default navigation
