const OVERLAY_ROOT_ID = 'hboo-overlay-root'
const OPEN_CLASS = 'hboo-overlay-open'

class OverlayHost {

	constructor({documentRef = typeof document !== 'undefined' ? document : null} = {}) {
		this.documentRef = documentRef
	}

	getRoot() {
		if (!this.documentRef) return null
		let root = this.documentRef.getElementById(OVERLAY_ROOT_ID)
		if (root) return root

		root = this.documentRef.createElement('div')
		root.id = OVERLAY_ROOT_ID
		const appRoot = this.documentRef.querySelector('hb-app')
		;(appRoot || this.documentRef.body).append(root)
		return root
	}

	render(key, html = '') {
		if (!key) return null
		const root = this.getRoot()
		if (!root) return null
		let container = root.querySelector(`[data-overlay-key="${key}"]`)
		if (!container) {
			container = this.documentRef.createElement('div')
			container.dataset.overlayKey = key
			root.append(container)
		}
		container.innerHTML = html
		this.updateOpenState()
		return container
	}

	clear(key) {
		if (!key || !this.documentRef) return
		const root = this.documentRef.getElementById(OVERLAY_ROOT_ID)
		root?.querySelector(`[data-overlay-key="${key}"]`)?.remove()
		this.updateOpenState()
	}

	updateOpenState() {
		if (!this.documentRef) return
		const root = this.documentRef.getElementById(OVERLAY_ROOT_ID)
		const hasOverlay = Boolean(root?.querySelector('[data-overlay-key]'))
		this.documentRef.body?.classList.toggle(OPEN_CLASS, hasOverlay)
	}
}

export {OVERLAY_ROOT_ID, OverlayHost}
export default new OverlayHost()
