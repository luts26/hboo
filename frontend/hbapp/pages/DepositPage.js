import AbstractClass from './AbstractClass.js'

export default class DepositPage extends AbstractClass {

	pageName = 'deposit'
	dataItems = null

	constructor(hbapp) {
		super(hbapp)
		this.init()
	}

	init() {
		this.$hbapp.innerHTML = this.getTemplate()
		// this.apiServer.get('/hbv2/transaction').then(data => {
		// 	if (data) this.dataItems = data
		// })
	}

	getTemplate() {
		return `<div class="${this.pageName}-container mt-3">deposit page</div>`
	}

	eventsRegister(event, eventKey) {}
}
