import AuthForm from '../components/AuthForm.js'
import {clearAuthState, getAuthenticatedUserId, getAuthToken} from '../services/AuthSession.js'

export default class LoginPage {

	pageName = 'auth'
	authForm = null

	constructor(hbapp) {
		this.hbapp = hbapp
		this.init()
	}

	init() {
		if (getAuthToken() && getAuthenticatedUserId()) {
			window.history.pushState({}, null, '/planing')
			return
		}
		if (getAuthToken()) clearAuthState()
		this.hbapp.innerHTML = '<div class="auth-page-root text-center"></div>'
		this.hbapp.insertAdjacentHTML('beforeend', this.getStyle())
		this.authForm = new AuthForm({
			root: this.hbapp.querySelector('.auth-page-root'),
			onSuccess: authState => {
				if (authState?.user?.id) {
					window.history.pushState({}, null, '/balance')
				}
			}
		})
		this.authForm.focus()
	}

	getStyle() {
		return `<style>
			hb-app {
				min-height: 100dvh;
				display: flex;
			    justify-content: center;
			    align-items: center;
			}
		</style>`
	}

	login() {
		return this.authForm?.submit()
	}

	eventsRegister(event, eventKey) {

		let events = [
			'click',
			'keypressenter'
		]

		if (events.indexOf(eventKey) === -1) return

		if (event.target.dataset.eventtype === 'login') {
			this.login()
		}

		if (eventKey === 'keypressenter') {
			this.login()
		}
		
	}

	destroy() {
		this.authForm?.destroy()
		this.authForm = null
	}
}
