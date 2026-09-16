class Toast {
	constructor() {
		this.container = null
		this.activeToasts = new Map()
	}

	ensureContainer() {
		if (this.container) return this.container
		this.container = document.createElement('div')
		this.container.className = 'toast-container'
		this.container.setAttribute('aria-live', 'polite')
		document.body.appendChild(this.container)
		return this.container
	}

	show(message, {type = 'info', key = message, duration = 4000} = {}) {
		if (!message) return
		const container = this.ensureContainer()
		const existing = this.activeToasts.get(key)
		if (existing) existing.remove()

		const item = document.createElement('div')
		item.className = `toast toast-${type}`
		item.textContent = message
		container.appendChild(item)

		const timeout = setTimeout(() => {
			item.classList.add('toast-hide')
			setTimeout(() => item.remove(), 180)
			this.activeToasts.delete(key)
		}, duration)

		this.activeToasts.set(key, {
			remove: () => {
				clearTimeout(timeout)
				item.remove()
			}
		})
	}
}

export default new Toast()
