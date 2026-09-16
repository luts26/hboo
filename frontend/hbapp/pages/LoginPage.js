import api from '../mixins/apiQueriesHelper.js'
import {clearAuthState, getAuthenticatedUserId, getAuthToken, setAuthState} from '../services/AuthSession.js'

export default class LoginPage {

	pageName = 'auth'

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
		this.hbapp.innerHTML = this.getTemplate()
		this.hbapp.insertAdjacentHTML('beforeend', this.getStyle())
	}

	getTemplate() {
		let loginPageHtml = `<div class="${this.pageName}-container text-center">
			<div>
				<h1 class="mt-0">HB00</h1>
			</div>
			<div class="input-wraper mb-2 mt-4">
				<input class="email" type="text" placeholder="username" required>
			</div>
			<div class="input-wraper">
				<input class="password" type="password" placeholder="********" required>
			</div>
			<div class="mt-2" data-eventtype="login">
				<button class="btn" data-eventtype="login">GO</button>
			</div>
		</div>`
		return loginPageHtml
	}

	getStyle() {
		return `<style>
			hb-app {
				min-height: 100dvh;
				display: flex;
			    justify-content: center;
			    align-items: center;
			}
			.auth-container {
				border-radius: 10px;
				box-shadow: -3px -3px 7px #ffffff73,
							2px 2px 5px rgba(94,104,121,.288);
				margin: 1em auto;
				padding: 20px 30px;
				max-width: 420px;
				width: 86%;
			}
			.auth-container h1 {
				margin-bottom: 0;
			}
		</style>`
	}

	login() {
		let username = this.hbapp.querySelector('.email').value
		let password = this.hbapp.querySelector('.password').value

		if (!username || !password) {
			return
		}

		api.post('/auth/login', {username,password})
		.then(data => {
			if (data.token) {
				const authState = setAuthState(data)
				if (authState?.user?.id) {
					window.history.pushState({}, null, '/balance')
				}
			}
		})
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
}
