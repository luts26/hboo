const sidebar = {

	getHtml: (config) => {
		return `<div class="sidebar">
			<div class="financial-summary-root"></div>
			<button class="hboo-sync-placeholder hboo-sync-card" type="button" data-action="hboo-sync-status" aria-label="HBOO Sync status">
				<div class="hboo-sync-title">HBOO Sync</div>
				<div class="hboo-sync-state">
					<span class="hboo-sync-marker" aria-hidden="true"></span>
					<span data-hboo-sync-title>Synced</span>
				</div>
				<div class="hboo-sync-copy" data-hboo-sync-detail>All changes synced</div>
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
