const HBOO_APP_SHELL_CACHE = 'hboo-app-shell-v1'
const HBOO_APP_SHELL_PREFIX = 'hboo-app-shell-'

const REQUIRED_SHELL_ASSETS = [
	'/',
	'/index.html',
	'/planing',
	'/manifest.webmanifest',
	'/hbapp/assets/styles/main.css?v=1',
	'/hbapp/index.js?v=5',
	'/hbapp/hbapp.js',
	'/hbapp/router/router.js',
	'/hbapp/config/config.js',
	'/hbapp/components/container.js',
	'/hbapp/components/content.js',
	'/hbapp/components/DataStatus.js',
	'/hbapp/components/FinancialSummary.js',
	'/hbapp/components/footer.js',
	'/hbapp/components/header.js',
	'/hbapp/components/navigation.js',
	'/hbapp/components/sidebar.js',
	'/hbapp/components/Toast.js',
	'/hbapp/data/categoriesData.js',
	'/hbapp/data/planningCategoriesData.js',
	'/hbapp/pages/AbstractClass.js',
	'/hbapp/pages/BalancePage.js',
	'/hbapp/pages/DepositPage.js',
	'/hbapp/pages/HomePage.js',
	'/hbapp/pages/LoginPage.js',
	'/hbapp/pages/PlaningPage.js',
	'/hbapp/pages/SettingsPage.js',
	'/hbapp/pages/TransactionPage.js',
	'/hbapp/stores/BalanceStore.js',
	'/hbapp/stores/PlanningStore.js',
	'/hbapp/stores/TransactionStore.js',
	'/hbapp/services/AuthSession.js',
	'/hbapp/services/BalanceApiService.js',
	'/hbapp/services/BalanceLocalRepository.js',
	'/hbapp/services/CategoryApiService.js',
	'/hbapp/services/CategoryLocalRepository.js',
	'/hbapp/services/IndexedDbClient.js',
	'/hbapp/services/PlanningApiService.js',
	'/hbapp/services/PlanningCalculator.js',
	'/hbapp/services/PlanningLocalRepository.js',
	'/hbapp/services/PlanningSyncQueue.js',
	'/hbapp/services/ServiceWorkerRegistration.js',
	'/hbapp/services/TransactionApiService.js',
	'/hbapp/services/TransactionLocalRepository.js',
	'/hbapp/mixins/apiQueriesHelper.js',
	'/hbapp/mixins/calculatorHelper.js',
	'/hbapp/mixins/calendarHelper.js',
	'/hbapp/mixins/hbRangeHelper.js'
]

const OPTIONAL_SHELL_ASSETS = [
	'/hbapp/assets/images/app-icon-192.png',
	'/hbapp/assets/images/app-icon-512.png',
	'/hbapp/assets/images/app-icon-round-transparent.png',
	'/hbapp/assets/images/mblogo1.png',
	'/hbapp/assets/images/pblogo1.png',
	'/hbapp/assets/images/moon-icon.webp',
	'/hbapp/assets/images/sun-icon.png',
	'/hbapp/assets/images/category-icons/atm-icon.png',
	'/hbapp/assets/images/category-icons/beauty-icon.png',
	'/hbapp/assets/images/category-icons/car-icon.png',
	'/hbapp/assets/images/category-icons/cleaning-clothing-icon.png',
	'/hbapp/assets/images/category-icons/delivery-icon.png',
	'/hbapp/assets/images/category-icons/flover-icon.png',
	'/hbapp/assets/images/category-icons/food-icon.png',
	'/hbapp/assets/images/category-icons/fun-icon.png',
	'/hbapp/assets/images/category-icons/hotel-icon.png',
	'/hbapp/assets/images/category-icons/medicine-icon.png',
	'/hbapp/assets/images/category-icons/mobile-icon.png',
	'/hbapp/assets/images/category-icons/other-icon.png',
	'/hbapp/assets/images/category-icons/restoran-icon.png',
	'/hbapp/assets/images/category-icons/savemoney-icon.png',
	'/hbapp/assets/images/category-icons/toy-icon.png',
	'/hbapp/assets/images/category-icons/transfer-money-icon.png',
	'/hbapp/assets/images/category-icons/travel-icon.png'
]

const CACHEABLE_PATHS = new Set(
	[...REQUIRED_SHELL_ASSETS, ...OPTIONAL_SHELL_ASSETS].map(asset => new URL(asset, self.location.origin).pathname)
)

async function cacheOptionalAssets(cache) {
	await Promise.allSettled(
		OPTIONAL_SHELL_ASSETS.map(asset => cache.add(asset))
	)
}

self.addEventListener('install', event => {
	event.waitUntil((async () => {
		const cache = await caches.open(HBOO_APP_SHELL_CACHE)
		await cache.addAll(REQUIRED_SHELL_ASSETS)
		await cacheOptionalAssets(cache)
		await self.skipWaiting()
	})())
})

self.addEventListener('activate', event => {
	event.waitUntil((async () => {
		const cacheNames = await caches.keys()
		await Promise.all(
			cacheNames
				.filter(name => name.startsWith(HBOO_APP_SHELL_PREFIX) && name !== HBOO_APP_SHELL_CACHE)
				.map(name => caches.delete(name))
		)
		await self.clients.claim()
	})())
})

self.addEventListener('fetch', event => {
	const {request} = event
	const url = new URL(request.url)

	if (url.origin !== self.location.origin) return
	if (url.pathname.startsWith('/api/')) return
	if (request.method !== 'GET') return

	if (request.mode === 'navigate') {
		event.respondWith(
			fetch(request).catch(async () => {
				const cache = await caches.open(HBOO_APP_SHELL_CACHE)
				return await cache.match('/index.html') || cache.match('/')
			})
		)
		return
	}

	if (!CACHEABLE_PATHS.has(url.pathname)) return

	event.respondWith(
		caches.match(request, {ignoreSearch: true})
			.then(cachedResponse => cachedResponse || fetch(request))
	)
})
