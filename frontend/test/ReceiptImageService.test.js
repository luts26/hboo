import test from 'node:test'
import assert from 'node:assert/strict'

import {
	MAX_RECEIPT_BYTES,
	NORMAL_MAX_LONG_EDGE,
	NORMAL_MAX_PIXELS,
	SUPPORTED_RECEIPT_TYPES,
	TALL_ASPECT_RATIO,
	TALL_MAX_HEIGHT,
	TALL_MAX_PIXELS,
	TALL_MAX_WIDTH,
	getReceiptImagePreparationPlan,
	sniffMimeType
} from '../hbapp/services/ReceiptImageService.js'

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

test('normal camera photo is bounded by normal policy without upscaling', () => {
	const plan = getReceiptImagePreparationPlan({
		width: 3024,
		height: 4032,
		mimeType: 'image/jpeg',
		sourceBytes: 4_800_000
	})

	assert.equal(plan.classification, 'normal')
	assert.equal(plan.outputWidth, 2400)
	assert.equal(plan.outputHeight, 3200)
	assert.equal(Math.max(plan.outputWidth, plan.outputHeight) <= NORMAL_MAX_LONG_EDGE, true)
	assert.equal(plan.outputWidth * plan.outputHeight <= NORMAL_MAX_PIXELS, true)
	assert.equal(plan.scale <= 1, true)
	assert.equal(plan.resized, true)
	assert.equal(plan.outputType, 'image/jpeg')
})

test('already reasonable receipt image is not upscaled or resized', () => {
	const plan = getReceiptImagePreparationPlan({
		width: 1350,
		height: 2400,
		mimeType: 'image/jpeg',
		sourceBytes: 2_100_000
	})

	assert.equal(plan.classification, 'normal')
	assert.equal(plan.outputWidth, 1350)
	assert.equal(plan.outputHeight, 2400)
	assert.equal(plan.scale, 1)
	assert.equal(plan.resized, false)
})

test('landscape digital screenshot preserves useful source resolution', () => {
	const plan = getReceiptImagePreparationPlan({
		width: 2400,
		height: 891,
		mimeType: 'image/png',
		sourceBytes: 1_700_000
	})

	assert.equal(plan.classification, 'normal')
	assert.equal(plan.outputWidth, 2400)
	assert.equal(plan.outputHeight, 891)
	assert.equal(plan.resized, false)
	assert.equal(plan.outputType, 'image/png')
})

test('tall screenshot preserves readable width instead of max-long-edge shrinking', () => {
	const plan = getReceiptImagePreparationPlan({
		width: 1080,
		height: 8000,
		mimeType: 'image/png',
		sourceBytes: 4_000_000
	})

	assert.equal(TALL_ASPECT_RATIO, 3)
	assert.equal(plan.classification, 'tall')
	assert.equal(plan.outputWidth, 1080)
	assert.equal(plan.outputHeight, 8000)
	assert.equal(plan.resized, false)
	assert.notEqual(plan.outputWidth, 324)
	assert.notEqual(plan.outputHeight, 2400)
})

test('very tall screenshot respects tall safety constraints deterministically', () => {
	const plan = getReceiptImagePreparationPlan({
		width: 1440,
		height: 12000,
		mimeType: 'image/png',
		sourceBytes: 8_500_000
	})

	assert.equal(plan.classification, 'tall')
	assert.equal(plan.outputWidth, 1200)
	assert.equal(plan.outputHeight, 10000)
	assert.equal(plan.outputWidth <= TALL_MAX_WIDTH, true)
	assert.equal(plan.outputHeight <= TALL_MAX_HEIGHT, true)
	assert.equal(plan.outputWidth * plan.outputHeight <= TALL_MAX_PIXELS, true)
})

test('small image is never upscaled', () => {
	const plan = getReceiptImagePreparationPlan({
		width: 720,
		height: 1280,
		mimeType: 'image/jpeg',
		sourceBytes: 900_000
	})

	assert.equal(plan.classification, 'normal')
	assert.equal(plan.outputWidth, 720)
	assert.equal(plan.outputHeight, 1280)
	assert.equal(plan.scale, 1)
	assert.equal(plan.resized, false)
})

test('extremely large camera image is safely bounded by normal limits', () => {
	const plan = getReceiptImagePreparationPlan({
		width: 8000,
		height: 6000,
		mimeType: 'image/jpeg',
		sourceBytes: 12_000_000
	})

	assert.equal(plan.classification, 'normal')
	assert.equal(plan.outputWidth, 3200)
	assert.equal(plan.outputHeight, 2400)
	assert.equal(plan.outputWidth * plan.outputHeight <= NORMAL_MAX_PIXELS, true)
	assert.equal(Math.max(plan.outputWidth, plan.outputHeight) <= NORMAL_MAX_LONG_EDGE, true)
})

test('passthrough MIME behavior preserves JPEG PNG and WebP when no transform is needed', () => {
	assert.equal(getReceiptImagePreparationPlan({
		width: 1200,
		height: 1800,
		mimeType: 'image/jpeg',
		sourceBytes: 1_000_000
	}).outputType, 'image/jpeg')
	assert.equal(getReceiptImagePreparationPlan({
		width: 1080,
		height: 8000,
		mimeType: 'image/png',
		sourceBytes: 4_000_000
	}).outputType, 'image/png')
	assert.equal(getReceiptImagePreparationPlan({
		width: 1200,
		height: 1600,
		mimeType: 'image/webp',
		sourceBytes: 1_000_000
	}).outputType, 'image/webp')
})

test('oversized source bytes trigger re-encoding without changing dimensions unnecessarily', () => {
	const plan = getReceiptImagePreparationPlan({
		width: 1200,
		height: 1600,
		mimeType: 'image/jpeg',
		sourceBytes: MAX_RECEIPT_BYTES + 1
	})

	assert.equal(plan.outputWidth, 1200)
	assert.equal(plan.outputHeight, 1600)
	assert.equal(plan.resized, false)
	assert.equal(plan.requiresSizeReduction, true)
	assert.equal(plan.outputType, 'image/jpeg')
})
