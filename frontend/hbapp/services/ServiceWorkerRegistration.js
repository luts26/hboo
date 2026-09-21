export function registerServiceWorker() {
	if (!('serviceWorker' in navigator)) return

	window.addEventListener('load', () => {
		navigator.serviceWorker.register('/sw.js', {updateViaCache: 'none'})
			.then(registration => registration.update().then(() => registration))
			.catch(error => {
				console.warn('HBOO service worker registration failed', error)
			})
	})
}
