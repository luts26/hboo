export function registerServiceWorker() {
	if (!('serviceWorker' in navigator)) return

	window.addEventListener('load', () => {
		navigator.serviceWorker.getRegistration('/')
			.then(registration => registration || navigator.serviceWorker.register('/sw.js'))
			.catch(error => {
				console.warn('HBOO service worker registration failed', error)
			})
	})
}
