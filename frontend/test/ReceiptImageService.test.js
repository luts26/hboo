import test from 'node:test'
import assert from 'node:assert/strict'

import {MAX_RECEIPT_BYTES, SUPPORTED_RECEIPT_TYPES, sniffMimeType} from '../hbapp/services/ReceiptImageService.js'

test('receipt image service supports jpeg png and webp signatures', async () => {
	const jpeg = new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])])
	const png = new Blob([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])])
	const webp = new Blob([Buffer.from('RIFFxxxxWEBP', 'ascii')])
	const text = new Blob(['not an image'])

	assert.equal(await sniffMimeType(jpeg), 'image/jpeg')
	assert.equal(await sniffMimeType(png), 'image/png')
	assert.equal(await sniffMimeType(webp), 'image/webp')
	assert.equal(await sniffMimeType(text), null)
	assert.equal(SUPPORTED_RECEIPT_TYPES.has('image/jpeg'), true)
	assert.equal(SUPPORTED_RECEIPT_TYPES.has('image/png'), true)
	assert.equal(SUPPORTED_RECEIPT_TYPES.has('application/pdf'), false)
	assert.equal(MAX_RECEIPT_BYTES, 10 * 1024 * 1024)
})
