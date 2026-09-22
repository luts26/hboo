const sidebar = {

	getHtml: (config) => {
		return `<div class="sidebar">
			<div class="financial-summary-root"></div>
			<button class="hboo-sync-placeholder" type="button" data-action="sync-placeholder" aria-label="HBOO Sync placeholder">
				<div class="hboo-sync-title">HBOO Sync</div>
				<div class="hboo-sync-state">
					<span class="hboo-sync-marker" aria-hidden="true"></span>
					<span>Sync status reserved</span>
				</div>
				<div class="hboo-sync-copy">Local changes stay on this device for now.</div>
			</button>
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
