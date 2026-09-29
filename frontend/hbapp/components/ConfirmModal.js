export default class ConfirmModal {
	static render({
		title,
		summary = '',
		message = '',
		cancelLabel = 'Cancel',
		confirmLabel = 'Confirm',
		closeAction = 'close-confirm-modal',
		confirmAction = 'confirm-modal',
		backdropClass = 'confirm-modal-backdrop',
		modalClass = 'confirm-modal',
		confirmVariant = 'primary',
		busy = false,
		error = ''
	} = {}) {
		const titleHtml = ConfirmModal.escapeHtml(title || '')
		const summaryHtml = summary ? `<p class="confirm-modal-summary">${ConfirmModal.escapeHtml(summary)}</p>` : ''
		const messageHtml = message ? `<p>${ConfirmModal.escapeHtml(message)}</p>` : ''
		const errorHtml = error ? `<p class="confirm-modal-error" role="alert">${ConfirmModal.escapeHtml(error)}</p>` : ''
		const confirmClass = confirmVariant === 'danger' ? 'app-modal-action-danger' : 'app-modal-action-primary'

		return `<div class="app-modal-backdrop ${backdropClass}">
			<div class="app-modal confirm-modal ${modalClass}" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title" data-modal-panel>
				<div class="app-modal-header">
					<h4 id="confirm-modal-title">${titleHtml}</h4>
				</div>
				<div class="app-modal-body">
					${summaryHtml}
					${messageHtml}
					${errorHtml}
					<div class="app-modal-actions confirm-modal-actions">
						<button type="button" data-action="${closeAction}" ${busy ? 'disabled' : ''}>${ConfirmModal.escapeHtml(cancelLabel)}</button>
						<button class="${confirmClass}" type="button" data-action="${confirmAction}" ${busy ? 'disabled' : ''}>${ConfirmModal.escapeHtml(confirmLabel)}</button>
					</div>
				</div>
			</div>
		</div>`
	}

	static escapeHtml(value = '') {
		return String(value)
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#039;')
	}
}
