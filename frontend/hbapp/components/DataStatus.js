const SOURCE_LABELS = {
	api: 'API',
	cache: 'Local'
}

const STATUS_CONFIG = {
	live: {
		label: 'Online',
		title: 'Data status',
		tone: 'live'
	},
	cached: {
		label: 'Offline',
		title: 'Saved local data',
		tone: 'cached'
	},
	offline: {
		label: 'Offline',
		title: 'Saved local data',
		tone: 'offline'
	},
	updating: {
		label: 'Updating...',
		title: 'Data status',
		tone: 'updating'
	},
	unknown: {
		label: '-',
		title: 'Data status',
		tone: 'cached'
	}
}

const escapeHtml = value => String(value ?? '')
	.replace(/&/g, '&amp;')
	.replace(/</g, '&lt;')
	.replace(/>/g, '&gt;')
	.replace(/"/g, '&quot;')
	.replace(/'/g, '&#039;')

export function createDataStatusViewModel(state = {}, formatDateTime = value => value || '-') {
	const status = state.loading
		? 'updating'
		: state.stale
			? 'offline'
			: state.source === 'api'
				? 'live'
				: state.source === 'cache'
					? 'cached'
					: 'unknown'

	return {
		status,
		source: state.source ? (SOURCE_LABELS[state.source] || state.source) : '-',
		updatedAt: state.updatedAt ? formatDateTime(state.updatedAt) : '-',
		isOffline: Boolean(state.stale),
		isOpen: Boolean(state.isOpen)
	}
}

export default class DataStatus {
	static render(viewModel = {}) {
		const config = STATUS_CONFIG[viewModel.status] || STATUS_CONFIG.unknown
		const detail = viewModel.isOffline
		? `<p>Server is unavailable.</p>
				<p>Showing data saved at ${escapeHtml(viewModel.updatedAt)}.</p>`
			: `<p>Source: ${escapeHtml(viewModel.source)}</p>
				<p>Last updated: ${escapeHtml(viewModel.updatedAt)}</p>`

		return `<div class="data-status ${viewModel.isOpen ? 'active' : ''}">
			<button class="data-status-trigger data-status-${config.tone}" type="button" data-action="toggle-data-status" title="${escapeHtml(config.title)}">
				<span class="data-status-dot"></span>
				<span>${escapeHtml(config.label)}</span>
			</button>
			${viewModel.isOpen ? `<div class="data-status-popover" role="status">
				<strong>${escapeHtml(config.title)}</strong>
				${detail}
			</div>` : ''}
		</div>`
	}
}
