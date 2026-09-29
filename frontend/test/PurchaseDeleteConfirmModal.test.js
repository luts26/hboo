import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import ConfirmModal from '../hbapp/components/ConfirmModal.js'

test('confirm modal renders reusable HBOO modal markup with danger action', () => {
	const html = ConfirmModal.render({
		title: 'Delete purchase?',
		summary: 'Novus · 282.34 грн · 28.09.2026',
		message: 'This purchase and all its items will be deleted.',
		confirmLabel: 'Delete',
		confirmVariant: 'danger'
	})

	assert.match(html, /app-modal-backdrop/)
	assert.match(html, /app-modal/)
	assert.match(html, /Delete purchase\?/)
	assert.match(html, /Novus · 282\.34 грн · 28\.09\.2026/)
	assert.match(html, /app-modal-action-danger/)
})

test('purchase page no longer uses native browser confirmation APIs', () => {
	const source = fs.readFileSync(new URL('../hbapp/pages/PurchasePage.js', import.meta.url), 'utf8')

	assert.doesNotMatch(source, /\bconfirm\s*\(/)
	assert.doesNotMatch(source, /\balert\s*\(/)
})
