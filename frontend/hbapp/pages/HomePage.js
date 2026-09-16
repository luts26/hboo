import AbstractClass from './AbstractClass.js'

export default class HomePage extends AbstractClass {

	pageName = 'home'

	constructor(hbapp) {
		super(hbapp)
		this.init()
	}

	init() {
		this.$hbapp.innerHTML = this.getTemplate()
	}

	getTemplate() {
		return `<div class="${this.pageName}-container mt-3 mb-3">
			<div class="home-summary-root financial-summary-root"></div>
		</div>`
	}

	eventsRegister() {}
}
