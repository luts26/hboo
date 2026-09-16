import AbstractClass from './AbstractClass.js'

export default class SettingsPage extends AbstractClass {

	pageName = 'settings'
	titles = {
		abank: 'Add new bank',
		acard: 'Add new card',
		auser: 'Add new user',
		set: 'User settings'
	}
	sectionAliases = {
		general: 'set',
		'add-user': 'auser',
		'add-bank': 'abank',
		'add-card': 'acard'
	}
	sectionIds = ['set', 'auser', 'abank', 'acard', 'appearance']
	activeElement = this.getHashParam() || 'set'
	hashChangeHandler = () => this.showSectionFromHash()

	constructor(hbapp) {
		super(hbapp)
		this.init()
	}

	init() {
		this.$hbapp.innerHTML = this.getTemplate()
		window.addEventListener('hashchange', this.hashChangeHandler)
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

	eventsRegister(event, key) {
		console.log(key)
	}

	destroy() {
		window.removeEventListener('hashchange', this.hashChangeHandler)
	}
}
