import sidebar from './sidebar.js'
import content from './content.js'

const container = {

	setContent: (hbapp, config) => {
		let containerHtml = `<section class="app-layout">
			<div class="app-header-slot"></div>
			<div class="app-main-column">
				${content.getHtml()}
			</div>
			${sidebar.getHtml(config)}
		</section>
		<div id="hboo-overlay-root"></div>`
		hbapp.insertAdjacentHTML('beforeend', containerHtml)
	}
}

export default container
