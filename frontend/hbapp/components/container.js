import sidebar from './sidebar.js'
import content from './content.js'

const container = {

	setContent: (hbapp, config) => {
		let containerHtml = `<section class="app-layout">
			<div class="app-main-column">
				<div class="app-header-slot"></div>
				${content.getHtml()}
			</div>
			${sidebar.getHtml(config)}
		</section>`
		hbapp.insertAdjacentHTML('beforeend', containerHtml)
	}
}

export default container
