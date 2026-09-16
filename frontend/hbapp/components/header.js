const header = {

	mainMenuItems: [
		{route: 'home', label: 'Home'},
		{route: 'planing', label: 'Planning'},
		{route: 'balance', label: 'Balance'},
		{route: 'transaction', label: 'Transactions'},
		{route: 'deposit', label: 'Deposits'}
	],

	settingsMenuItems: [
		{hash: 'set', label: 'General'},
		{hash: 'auser', label: 'Add user'},
		{hash: 'abank', label: 'Add bank'},
		{hash: 'acard', label: 'Add card'},
		{hash: 'appearance', label: 'Appearance'}
	],
	
	setContent: (hbapp, config) => {
		let appNameArr = config.appName.split(' ')
		let appName = appNameArr.map((i, index) => (index > 1) 
				? '' 
				: `<span class="first-sym">${i.charAt(0)}</span>${i.slice(1)}`).join('')
		const mainMenuHtml = header.mainMenuItems.map(item => {
			return `<button class="header-menu-item" type="button" data-action="header-menu-route" data-route="${item.route}">${item.label}</button>`
		}).join('')
		const settingsMenuHtml = header.settingsMenuItems.map(item => {
			return `<button class="header-menu-item header-submenu-item" type="button" data-action="header-menu-route" data-route="settings" data-hash="${item.hash}">${item.label}</button>`
		}).join('')
		let headerHtml = `<header class="header px-1 font-weight-bold">
			<div class="header-container d-flex align-items-center">
				<div class="transactions-today-date text-center"></div>
				<div class="label-header">
					<div class="app-name" title="Open settings">${appName}</div>
					<nav class="sub-menu">
						<ul>
							<li data-sparam="abank">add bank</li>
							<li data-sparam="acard">ADD card</li>
							<li data-sparam="auser">add user</li>
							<li data-sparam="appearance">appearance</li>
							<li data-sparam="set">settings</li>
							<li data-sparam="out">logout</li>
						</ul>
					</nav>
				</div>
				<div class="header-utility">
					<button class="header-menu-toggle" type="button" aria-label="Open menu" aria-haspopup="true" aria-expanded="false" data-action="header-menu-toggle">&#8942;</button>
					<nav class="header-utility-menu" aria-label="Header menu">
						${mainMenuHtml}
						<div class="header-menu-submenu" data-header-submenu="settings">
							<button class="header-menu-item header-submenu-toggle" type="button" aria-expanded="false" data-action="header-menu-settings-toggle">
								<span>Settings</span>
								<span aria-hidden="true">&#8250;</span>
							</button>
							<div class="header-submenu-panel">
								${settingsMenuHtml}
							</div>
						</div>
						<button class="header-menu-item" type="button" data-action="header-menu-logout">Logout</button>
					</nav>
				</div>
			</div>
		</header>`
		const slot = hbapp.querySelector('.app-header-slot')
		if (slot) slot.innerHTML = headerHtml
		else hbapp.innerHTML = headerHtml
	}
}

export default header
