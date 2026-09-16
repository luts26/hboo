import LoginPage from '../pages/LoginPage.js'
import HomePage from '../pages/HomePage.js'
import BalancePage from '../pages/BalancePage.js'
import DepositPage from '../pages/DepositPage.js'
import PlaningPage from '../pages/PlaningPage.js'
import SettingsPage from '../pages/SettingsPage.js'
import TransactionPage from '../pages/TransactionPage.js'

const router = {

	routers: {
		'login': LoginPage,
		'home': HomePage,
		'balance': BalancePage,
		'transaction': TransactionPage,
		'deposit': DepositPage,
		'planing': PlaningPage,
		'settings': SettingsPage
	},
	prevUrlPath: undefined,
	defaultUrlPath: 'home',

	redirectRouter: function(path) {
		window.history.pushState({}, null, path)
	},

	getCurrentPath: function() {
		return window.location.pathname.substring(1)
	},

	addZeroRoute(num) {
		return (num < 10) ? `0${num}` : num
	},

	updateClockForHeader() {
		if (!document.querySelector('.transactions-today-date .time-some-time')) return
		let $time = document.querySelector('.time-some-time')
		let ct = new Date()
		let time = `${this.addZeroRoute(ct.getHours())}:${this.addZeroRoute(ct.getMinutes())}:${this.addZeroRoute(ct.getSeconds())}`
		$time.textContent = time
		$time.parentElement.classList.add('active')
	},

	routerListenerHandler: function() {
		this.updateClockForHeader()
		const currUrlPath = this.getCurrentPath()
		if (!currUrlPath) {
			this.prevUrlPath = this.defaultUrlPath
			this.redirectRouter(`/${this.defaultUrlPath}`)
			return this.routers[this.defaultUrlPath]
		}
		if (currUrlPath !== this.prevUrlPath) {
			this.prevUrlPath = currUrlPath
			if (currUrlPath in this.routers) {
				return this.routers[currUrlPath]
			} else {
				console.log('404 Page not found')
			}
		}
	}
}

export default router
