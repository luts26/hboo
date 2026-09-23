import AbstractClass from './AbstractClass.js'
import appLockService, {APP_LOCK_TIMEOUT_OPTIONS} from '../services/AppLockService.js'
import appLockSession from '../services/AppLockSession.js'

export default class SettingsPage extends AbstractClass {

	pageName = 'settings'
	titles = {
		abank: 'Add new bank',
		acard: 'Add new card',
		auser: 'Add new user',
		set: 'User settings',
		appLock: 'App Lock'
	}
	sectionAliases = {
		general: 'set',
		'add-user': 'auser',
		'add-bank': 'abank',
		'add-card': 'acard'
	}
	sectionIds = ['set', 'auser', 'abank', 'acard', 'appearance', 'app-lock']
	activeElement = this.getHashParam() || 'set'
	appLockMode = null
	appLockError = ''
	appLockMessage = ''
	hashChangeHandler = () => this.showSectionFromHash()
	submitHandler = event => this.eventsRegister(event, 'submit')

	constructor(hbapp) {
		super(hbapp)
		this.init()
	}

	init() {
		this.$hbapp.innerHTML = this.getTemplate()
		window.addEventListener('hashchange', this.hashChangeHandler)
		this.$hbapp.addEventListener('submit', this.submitHandler)
		this.showSectionFromHash()
	}

	getHashParam() {
		const hash = location.hash.substring(1)
		return this.sectionAliases[hash] || hash
	}

	showSectionFromHash() {
		const hash = this.getHashParam()
		this.activeElement = this.sectionIds.indexOf(hash) === -1 ? 'set' : hash
		this.$hbapp.querySelectorAll('.set-item').forEach(item => {
			item.classList.toggle('d-none', this.activeElement !== 'set' && item.id !== this.activeElement)
		})
	}

	getTemplate() {
		return `<div class="${this.pageName}-container mt-3 mb-3">
			${this.getAppLockTemplate()}
			<div id="appearance" class="set-item mt-2 ${(this.activeElement !== 'appearance' && this.activeElement !== 'set') ? 'd-none' : ''}">
				<div class="d-flex justify-content-around">
					<h3>Appearance</h3>
				</div>
				<div class="settings-appearance-row">
					<div>
						<div class="font-weight-bold">Theme</div>
						<div class="sub-text">Local preference</div>
					</div>
					<div class="theme-toggler">
						<div id="toggler" data-themetoggler="1"></div>
					</div>
				</div>
			</div>
			<div id="auser" class="set-item mt-2 ${(this.activeElement !== 'auser' && this.activeElement !== 'set') ? 'd-none' : ''}">
				<div class="d-flex justify-content-around">
					<h3>${this.titles.auser}</h3>
				</div>
				<div class="">
					<input type="checkbox"> Active
				</div>
				<div class="input-wraper mt-2">
					<input type="text" placeholder="username">
				</div>
				<div class="input-wraper mt-2">
					<input class="mr-1" type="text" placeholder="first name">
					<input type="text" placeholder="last name">
				</div>
				<div class="input-wraper mt-2">
					<input type="email" placeholder="email">
				</div>
				<div class="input-wraper mt-2">
					<input class="mr-1" type="password" placeholder="password">
					<input type="password" placeholder="re enter password">
				</div>
			</div>
			<div id="abank" class="set-item mt-3 ${(this.activeElement !== 'abank' && this.activeElement !== 'set') ? 'd-none' : ''}">
				<div class="d-flex justify-content-around">
					<h3>${this.titles.abank}</h3>
				</div>
				<div class="mt-1">
					<div class="input-wraper">
						<input type="text" placeholder="name">
					</div>
					</div>
					<div class="mt-1">
					<div class="input-wraper">
						<div>
							<label>Logo</label>
							</div>
						<input type="file" placeholder="logo">
					</div>
					</div>
					<div class="mt-1">
					<div class="input-wraper">
						<input type="text" placeholder="url">
					</div>
					<div class="input-wraper mt-1">
						<input type="text" placeholder="token">
					</div>
				</div>
			</div>
			<div id="acard" class="set-item mt-3 ${(this.activeElement !== 'acard' && this.activeElement !== 'set') ? 'd-none' : ''}">
			<div class="${this.pageName}-container mt-3 mb-3">
			<div class="d-flex justify-content-around">
					<h3>${this.titles.acard}</h3>
				</div>
			<div class="update-buttons d-flex justify-content-around">
				<div class="btn-wraper">
					<button class="btn filter-btn btn-mono active-btn" data-uptrans="1" data-btntype="mono">
						<img src="/hbapp/assets/images/mblogo1.png" alt="mblogo">
						monobank
					</button>
				</div>
				<div class="btn-wraper">
					<button class="btn filter-btn btn-privat" data-uptrans="2" data-btntype="privat">
						<img src="/hbapp/assets/images/pblogo1.png" alt="pblogo">
						PrivatBank
					</button>
				</div>
			</div>
			</div>
				<div class="mt-1">
					<div class="input-wraper">
						<input type="text" placeholder="card number">
					</div>
				</div>
			</div>
		</div>`
	}

	getAppLockTemplate() {
		const enabled = appLockService.isEnabled()
		const config = appLockService.loadConfig()
		const mode = this.appLockMode
		const timeout = config?.lockTimeoutMs ?? appLockService.getLockTimeoutMs()
		const status = enabled ? 'Enabled on this device' : 'Disabled'

		return `<div id="app-lock" class="set-item settings-card mt-2 ${(this.activeElement !== 'app-lock' && this.activeElement !== 'set') ? 'd-none' : ''}">
			<div class="d-flex justify-content-around">
				<h3>${this.titles.appLock}</h3>
			</div>
			<div class="settings-app-lock-row">
				<div>
					<div class="font-weight-bold">App Lock</div>
					<div class="sub-text">Protect HBOO on this device with a PIN.</div>
					<div class="settings-app-lock-status">${status}</div>
				</div>
				<div class="settings-app-lock-actions">
					${enabled
						? `<button class="btn" type="button" data-app-lock-action="lock-now">Lock now</button>
							<button class="btn" type="button" data-app-lock-action="change">Change PIN</button>
							<button class="btn" type="button" data-app-lock-action="disable">Disable App Lock</button>`
						: '<button class="btn" type="button" data-app-lock-action="setup">Enable App Lock</button>'}
				</div>
			</div>
			${enabled ? `<div class="settings-app-lock-timeout">
				<label for="app-lock-timeout">Lock after background</label>
				<select id="app-lock-timeout" data-app-lock-timeout>
					${APP_LOCK_TIMEOUT_OPTIONS.map(option => `<option value="${option.value}" ${option.value === timeout ? 'selected' : ''}>${option.label}</option>`).join('')}
				</select>
			</div>` : ''}
			${this.appLockMessage ? `<div class="settings-app-lock-message" role="status">${this.escapeHtml(this.appLockMessage)}</div>` : ''}
			${this.appLockError ? `<div class="settings-app-lock-error" role="alert">${this.escapeHtml(this.appLockError)}</div>` : ''}
			${mode === 'setup' ? this.getAppLockSetupTemplate(timeout) : ''}
			${mode === 'change' ? this.getAppLockChangeTemplate(timeout) : ''}
			${mode === 'disable' ? this.getAppLockDisableTemplate() : ''}
		</div>`
	}

	getAppLockSetupTemplate(timeout) {
		return `<form class="settings-app-lock-form" data-app-lock-form="setup">
			<div class="input-wraper mt-2">
				<input name="pin" type="password" inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="8" autocomplete="new-password" placeholder="Create PIN">
			</div>
			<div class="input-wraper mt-2">
				<input name="confirmPin" type="password" inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="8" autocomplete="new-password" placeholder="Confirm PIN">
			</div>
			<input type="hidden" name="lockTimeoutMs" value="${timeout}">
			<div class="settings-app-lock-form-actions">
				<button class="btn active-btn" type="submit">Enable App Lock</button>
				<button class="btn" type="button" data-app-lock-action="cancel">Cancel</button>
			</div>
		</form>`
	}

	getAppLockChangeTemplate(timeout) {
		return `<form class="settings-app-lock-form" data-app-lock-form="change">
			<div class="input-wraper mt-2">
				<input name="currentPin" type="password" inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="8" autocomplete="current-password" placeholder="Current PIN">
			</div>
			<div class="input-wraper mt-2">
				<input name="pin" type="password" inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="8" autocomplete="new-password" placeholder="New PIN">
			</div>
			<div class="input-wraper mt-2">
				<input name="confirmPin" type="password" inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="8" autocomplete="new-password" placeholder="Confirm new PIN">
			</div>
			<input type="hidden" name="lockTimeoutMs" value="${timeout}">
			<div class="settings-app-lock-form-actions">
				<button class="btn active-btn" type="submit">Change PIN</button>
				<button class="btn" type="button" data-app-lock-action="cancel">Cancel</button>
			</div>
		</form>`
	}

	getAppLockDisableTemplate() {
		return `<form class="settings-app-lock-form" data-app-lock-form="disable">
			<div class="input-wraper mt-2">
				<input name="currentPin" type="password" inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="8" autocomplete="current-password" placeholder="Current PIN">
			</div>
			<div class="settings-app-lock-form-actions">
				<button class="btn active-btn" type="submit">Disable App Lock</button>
				<button class="btn" type="button" data-app-lock-action="cancel">Cancel</button>
			</div>
		</form>`
	}

	async eventsRegister(event, key) {
		if (key === 'change' && event.target.closest('[data-app-lock-timeout]')) {
			appLockService.setLockTimeoutMs(event.target.value)
			this.appLockMessage = 'Lock timeout updated.'
			this.appLockError = ''
			this.renderSettings()
			return
		}

		if (key === 'click' && event.target.closest('[data-app-lock-action]')) {
			await this.handleAppLockAction(event)
			return
		}

		if ((key === 'click' || key === 'keypressenter' || key === 'submit') && event.target.closest('[data-app-lock-form]')) {
			if (key === 'click' && !event.target.closest('button[type="submit"]')) return
			await this.handleAppLockSubmit(event)
		}
	}

	renderSettings() {
		this.$hbapp.innerHTML = this.getTemplate()
		this.showSectionFromHash()
	}

	async handleAppLockAction(event) {
		const button = event.target.closest('[data-app-lock-action]')
		const action = button?.dataset.appLockAction
		if (!action) return
		event.preventDefault()

		this.appLockError = ''
		this.appLockMessage = ''

		if (action === 'setup' || action === 'change' || action === 'disable') {
			this.appLockMode = action
			this.renderSettings()
			this.$hbapp.querySelector('[data-app-lock-form] input')?.focus()
			return
		}
		if (action === 'cancel') {
			this.appLockMode = null
			this.renderSettings()
			return
		}
		if (action === 'lock-now') {
			appLockSession.lock()
		}
	}

	async handleAppLockSubmit(event) {
		const form = event.target.closest('[data-app-lock-form]')
		if (!form) return
		event.preventDefault()

		const mode = form.dataset.appLockForm
		const pin = form.elements.pin?.value || ''
		const confirmPin = form.elements.confirmPin?.value || ''
		const currentPin = form.elements.currentPin?.value || ''
		const lockTimeoutMs = form.elements.lockTimeoutMs?.value || appLockService.getLockTimeoutMs()

		this.appLockError = ''
		this.appLockMessage = ''

		try {
			if (mode === 'setup') {
				this.validateConfirmedPin(pin, confirmPin)
				await appLockService.setupPin(pin, {lockTimeoutMs})
				appLockSession.refreshFromConfig()
				this.appLockMessage = 'App Lock enabled.'
			} else if (mode === 'change') {
				this.validateConfirmedPin(pin, confirmPin)
				await appLockService.changePin(currentPin, pin, {lockTimeoutMs})
				appLockSession.refreshFromConfig()
				this.appLockMessage = 'PIN changed.'
			} else if (mode === 'disable') {
				await appLockService.disablePin(currentPin)
				appLockSession.refreshFromConfig()
				this.appLockMessage = 'App Lock disabled.'
			}
			form.reset()
			this.appLockMode = null
		} catch (error) {
			form.reset()
			this.appLockError = this.getAppLockErrorMessage(error)
		}

		this.renderSettings()
	}

	validateConfirmedPin(pin, confirmPin) {
		appLockService.assertPin(pin)
		if (pin !== confirmPin) throw new Error('PIN values do not match.')
	}

	getAppLockErrorMessage(error) {
		const message = String(error?.message || '')
		if (message === 'Incorrect PIN.') return 'Incorrect PIN'
		if (message.includes('4-8 digits')) return 'PIN must contain 4-8 digits.'
		if (message.includes('match')) return 'PIN values do not match.'
		return 'App Lock update failed.'
	}

	escapeHtml(value = '') {
		return String(value)
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#039;')
	}

	destroy() {
		window.removeEventListener('hashchange', this.hashChangeHandler)
		this.$hbapp.removeEventListener('submit', this.submitHandler)
	}
}
