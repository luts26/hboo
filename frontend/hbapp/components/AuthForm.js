import api from '../mixins/apiQueriesHelper.js'
import {setAuthState} from '../services/AuthSession.js'
import networkStatusService from '../services/NetworkStatusService.js'

let authFormId = 0

export default class AuthForm {

	constructor({
		root,
		onSuccess = () => {},
		onCancel = null,
		networkService = networkStatusService,
		loginApi = credentials => api.postPublic('/auth/login', credentials)
	} = {}) {
		this.root = root
		this.onSuccess = onSuccess
		this.onCancel = onCancel
		this.networkService = networkService
		this.loginApi = loginApi
		this.id = authFormId += 1
		this.loading = false
		this.error = ''
		this.unsubscribeNetwork = null
		this.handleSubmit = event => this.submit(event)
		this.handleCancel = event => {
			event.preventDefault()
			this.onCancel()
		}
		this.render()
		this.mount()
	}

	get isOffline() {
		return this.networkService?.isOffline?.() === true
	}

	getTemplate() {
		const loginId = `auth-login-${this.id}`
		const passwordId = `auth-password-${this.id}`
		const offline = this.isOffline
		const canCancel = typeof this.onCancel === 'function'
		const error = this.error || (offline ? 'Connection is unavailable. You can continue offline.' : '')

		return `<form class="auth-container auth-form" data-auth-form>
			<div>
				<h1 class="mt-0">HB00</h1>
			</div>
			<div class="auth-field input-wraper mb-2 mt-3">
				<label for="${loginId}">Login</label>
				<input id="${loginId}" class="email" name="username" type="text" autocomplete="username" required ${this.loading ? 'disabled' : ''}>
			</div>
			<div class="auth-field input-wraper">
				<label for="${passwordId}">Password</label>
				<input id="${passwordId}" class="password" name="password" type="password" autocomplete="current-password" required ${this.loading ? 'disabled' : ''}>
			</div>
			<div class="auth-error" role="alert" ${error ? '' : 'hidden'}>${this.escapeHtml(error)}</div>
			<div class="auth-actions mt-2">
				<button class="btn auth-submit" type="submit" data-eventtype="login" ${this.loading || offline ? 'disabled' : ''}>${this.loading ? 'Signing in...' : 'Sign in'}</button>
				${canCancel ? '<button class="auth-offline" type="button" data-auth-cancel>Continue offline</button>' : ''}
			</div>
		</form>`
	}

	render() {
		if (!this.root) return
		this.root.innerHTML = this.getTemplate()
		this.bindEvents()
	}

	mount() {
		this.unsubscribeNetwork = this.networkService?.subscribe?.(() => {
			if (!this.loading) this.render()
		})
	}

	bindEvents() {
		this.form = this.root?.querySelector('[data-auth-form]')
		this.form?.addEventListener('submit', this.handleSubmit)
		this.root?.querySelector('[data-auth-cancel]')?.addEventListener('click', this.handleCancel)
	}

	focus() {
		this.root?.querySelector('.email')?.focus()
	}

	destroy() {
		this.form?.removeEventListener('submit', this.handleSubmit)
		this.root?.querySelector('[data-auth-cancel]')?.removeEventListener('click', this.handleCancel)
		if (this.unsubscribeNetwork) this.unsubscribeNetwork()
	}

	async submit(event = null) {
		if (event) event.preventDefault()
		if (this.loading) return null
		if (this.isOffline) {
			this.error = 'Connection is unavailable. You can continue offline.'
			this.render()
			return null
		}

		const username = this.root?.querySelector('.email')?.value?.trim()
		const password = this.root?.querySelector('.password')?.value

		if (!username || !password) {
			this.error = 'Enter login and password.'
			this.render()
			return null
		}

		this.loading = true
		this.error = ''
		this.render()

		try {
			const data = await this.loginApi({username, password})
			if (!data?.token) throw new Error('Authentication response did not include a token')
			const authState = setAuthState(data)
			if (!authState?.user?.id) throw new Error('Authentication response did not include a user')
			this.onSuccess(authState)
			return authState
		} catch (error) {
			this.loading = false
			this.error = this.getErrorMessage(error)
			this.render()
			this.focus()
			return null
		}
	}

	getErrorMessage(error) {
		const status = Number(error?.status || error?.statusCode)
		if (status === 401 || status === 403) return 'Invalid login or password.'
		if (status >= 500) return 'Server is unavailable. Try again later or continue offline.'
		return 'Connection failed. Try again later or continue offline.'
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
