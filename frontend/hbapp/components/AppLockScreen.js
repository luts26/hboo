import appLockService from '../services/AppLockService.js'
import appLockSession from '../services/AppLockSession.js'

class AppLockScreen {

	constructor({
		service = appLockService,
		session = appLockSession,
		documentRef = typeof document !== 'undefined' ? document : null
	} = {}) {
		this.service = service
		this.session = session
		this.documentRef = documentRef
		this.root = null
		this.error = ''
		this.loading = false
		this.failedAttempts = 0
		this.unlockAvailableAt = 0
		this.unsubscribeSession = null
		this.handleSubmit = event => this.submit(event)
	}

	mount() {
		if (!this.documentRef || this.unsubscribeSession) return
		this.unsubscribeSession = this.session.subscribe(state => this.renderFromState(state))
	}

	destroy() {
		if (this.unsubscribeSession) this.unsubscribeSession()
		this.unsubscribeSession = null
		this.remove()
	}

	renderFromState(state) {
		if (state.privacyCovered) this.render(state)
		else this.remove()
	}

	render(state = this.session.getState()) {
		if (!this.documentRef) return
		const locked = state.locked === true
		if (!this.root) {
			this.root = this.documentRef.createElement('div')
			this.documentRef.body.append(this.root)
			this.documentRef.body.classList.add('hboo-app-lock-open')
		}

		this.root.className = locked ? 'app-lock-screen' : 'app-lock-screen app-lock-screen-shielded'
		this.root.setAttribute('role', locked ? 'dialog' : 'status')
		this.root.setAttribute('aria-modal', locked ? 'true' : 'false')
		this.root.setAttribute('aria-labelledby', 'app-lock-title')
		this.root.innerHTML = this.getTemplate({locked})
		this.root.querySelector('[data-app-lock-form]')?.addEventListener('submit', this.handleSubmit)
		if (locked) setTimeout(() => this.focus(), 0)
	}

	remove() {
		if (!this.root || !this.documentRef) return
		this.root.querySelector('[data-app-lock-form]')?.removeEventListener('submit', this.handleSubmit)
		this.root.remove()
		this.root = null
		this.error = ''
		this.loading = false
		this.documentRef.body.classList.remove('hboo-app-lock-open')
	}

	getTemplate({locked = true} = {}) {
		if (!locked) {
			return `<div class="app-lock-panel app-lock-privacy-panel">
				<div class="app-lock-brand" aria-hidden="true">HBOO</div>
				<h1 id="app-lock-title">Private</h1>
			</div>`
		}
		return `<div class="app-lock-panel">
			<div class="app-lock-brand" aria-hidden="true">HBOO</div>
			<h1 id="app-lock-title">Locked</h1>
			<form class="app-lock-form" data-app-lock-form>
				<label class="app-lock-label" for="app-lock-pin">PIN</label>
				<input id="app-lock-pin" class="app-lock-pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="8" autocomplete="off" enterkeyhint="done" ${this.loading ? 'disabled' : ''}>
				<div class="app-lock-error" role="alert" ${this.error ? '' : 'hidden'}>${this.escapeHtml(this.error)}</div>
				<button class="btn app-lock-submit" type="submit" ${this.loading ? 'disabled' : ''}>${this.loading ? 'Unlocking...' : 'Unlock'}</button>
			</form>
		</div>`
	}

	focus() {
		this.root?.querySelector('.app-lock-pin')?.focus()
	}

	async submit(event = null) {
		if (event) event.preventDefault()
		if (this.loading) return false

		const now = Date.now()
		if (now < this.unlockAvailableAt) {
			this.error = 'Try again in a moment.'
			this.render({locked: true})
			return false
		}

		const input = this.root?.querySelector('.app-lock-pin')
		const pin = input?.value || ''
		input.value = ''

		this.loading = true
		this.error = ''
		this.render({locked: true})

		const verified = await this.service.verifyPin(pin)
		this.loading = false

		if (verified) {
			this.failedAttempts = 0
			this.unlockAvailableAt = 0
			this.session.unlock()
			return true
		}

		this.failedAttempts += 1
		if (this.failedAttempts >= 5) this.unlockAvailableAt = Date.now() + 1000
		this.error = 'Incorrect PIN'
		this.render({locked: true})
		return false
	}

	escapeHtml(value = '') {
		return String(value)
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#039;')
	}
}

export {AppLockScreen}
export default new AppLockScreen()
