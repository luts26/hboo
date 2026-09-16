const sidebar = {

	getHtml: (config) => {
		return `<div class="sidebar">
			<div class="financial-summary-root"></div>
			<div class="text-center copy-date">
				${config.appAlias}
				${config.version}  
				${config.author}
				${config.ftdata}
			</div>
		</div>`
	}
}

export default sidebar
