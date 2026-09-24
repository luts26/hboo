const HBOO_APP_VERSION = '2026-09-24-header-home-logo-v1'
const HBOO_APP_SHELL_CACHE = `hboo-app-shell-${HBOO_APP_VERSION}`
const HBOO_APP_SHELL_PREFIX = 'hboo-app-shell-'

const REQUIRED_SHELL_ASSETS = [
	'/',
	'/index.html',
	'/planing',
	'/manifest.webmanifest',
	'/hbapp/assets/styles/main.css?v=4',
	'/hbapp/index.js?v=6'
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

const JS_STATIC_IMPORT_PATTERN = /(?:import\s+(?:[^'"]*?\s+from\s*)?|export\s+[^'"]*?\s+from\s*|import\s*\()\s*['"]([^'"]+)['"]/g
const CSS_URL_PATTERN = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g

function isCacheableStaticUrl(url) {
	return url.origin === self.location.origin
		&& !url.pathname.startsWith('/api/')
}

function isFrontendStaticRequest(url) {
	return isCacheableStaticUrl(url)
		&& (
			url.pathname.startsWith('/hbapp/')
			|| url.pathname === '/manifest.webmanifest'
		)
}

function shouldParseJavaScript(url) {
	return url.pathname.endsWith('.js')
}

function shouldParseCss(url) {
	return url.pathname.endsWith('.css')
}

function getStaticDependencies(text, baseUrl, pattern) {
	const dependencies = []
	let match

	pattern.lastIndex = 0
	while ((match = pattern.exec(text)) !== null) {
		const specifier = match[1]
		if (!specifier || specifier.startsWith('data:') || specifier.startsWith('#')) continue

		try {
			const dependencyUrl = new URL(specifier, baseUrl)
			if (isCacheableStaticUrl(dependencyUrl)) dependencies.push(dependencyUrl)
		} catch {
			// Ignore malformed non-browser specifiers.
		}
	}

	return dependencies
}

async function fetchFresh(url) {
	const request = new Request(url.href, {
		cache: 'reload',
		credentials: 'same-origin'
	})
	const response = await fetch(request)
	if (!response.ok) {
		throw new Error(`Failed to cache ${url.pathname}: ${response.status}`)
	}
	return response
}

async function cacheStaticAsset(cache, url, visited) {
	const cacheKey = `${url.pathname}${url.search}`
	if (visited.has(cacheKey)) return
	visited.add(cacheKey)
	CACHEABLE_PATHS.add(url.pathname)

	const response = await fetchFresh(url)
	await cache.put(url.href, response.clone())

	if (!shouldParseJavaScript(url) && !shouldParseCss(url)) return

	const text = await response.text()
	const dependencies = shouldParseJavaScript(url)
		? getStaticDependencies(text, url, JS_STATIC_IMPORT_PATTERN)
		: getStaticDependencies(text, url, CSS_URL_PATTERN)

	await Promise.all(dependencies.map(dependency => cacheStaticAsset(cache, dependency, visited)))
}

async function cacheRequiredAssets(cache) {
	const visited = new Set()
	for (const asset of REQUIRED_SHELL_ASSETS) {
		await cacheStaticAsset(cache, new URL(asset, self.location.origin), visited)
	}
}

async function cacheOptionalAssets(cache) {
	await Promise.allSettled(
		OPTIONAL_SHELL_ASSETS.map(asset => cacheStaticAsset(cache, new URL(asset, self.location.origin), new Set()))
	)
}

self.addEventListener('install', event => {
	event.waitUntil((async () => {
		const cache = await caches.open(HBOO_APP_SHELL_CACHE)
		await cacheRequiredAssets(cache)
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

	if (!isFrontendStaticRequest(url) && !CACHEABLE_PATHS.has(url.pathname)) return

	event.respondWith(
		caches.match(request, {ignoreSearch: true})
			.then(cachedResponse => cachedResponse || fetch(request))
	)
})
