import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

test('Purchase toolbar exposes one primary creation action and a three-method selector', async () => {
	const source = await fs.readFile(new URL('../hbapp/pages/PurchasePage.js', import.meta.url), 'utf8')
	const toolbar = source.match(/<div class="purchase-toolbar-actions">([\s\S]*?)<\/div>\s*<\/div>/)?.[1] || ''
	assert.equal((toolbar.match(/open-purchase-method-menu/g) || []).length, 1)
	assert.equal((toolbar.match(/data-purchase-action="(?:new-purchase|scan-receipt|import-xml-receipt)"/g) || []).length, 0)
	assert.match(source, /choose-manual-purchase/)
	assert.match(source, /choose-scan-receipt/)
	assert.match(source, /choose-import-xml/)
	assert.match(source, /this\.openNewPurchase\(\)/)
	assert.match(source, /this\.openReceiptFirstFlow\(\)/)
	assert.match(source, /this\.chooseXmlReceipt\(\)/)
})

test('Purchase method selector has a mobile bottom-sheet layout', async () => {
	const css = await fs.readFile(new URL('../hbapp/assets/styles/main.css', import.meta.url), 'utf8')
	assert.match(css, /@media \(max-width: 600px\)[\s\S]*?\.purchase-method-modal-backdrop\s*\{[\s\S]*?align-items:\s*flex-end/)
	assert.match(css, /\.purchase-method-option\s*\{[\s\S]*?min-height:\s*68px/)
})
