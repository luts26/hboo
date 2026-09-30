import test from 'node:test'
import assert from 'node:assert/strict'

import {setAuthState} from '../hbapp/services/AuthSession.js'
import ReceiptApiService from '../hbapp/services/ReceiptApiService.js'

class MemoryStorage {
	constructor() {
		this.values = new Map()
	}
	getItem(key) {
		return this.values.get(key) || null
	}
	setItem(key, value) {
		this.values.set(key, String(value))
	}
	removeItem(key) {
		this.values.delete(key)
	}
}

test('ReceiptApiService reads and starts standalone receipt OCR endpoints', async () => {
	globalThis.localStorage = new MemoryStorage()
	setAuthState({token: 'receipt-token', user: {id: 7, username: 'u7'}})
	const previousFetch = globalThis.fetch
	const calls = []
	globalThis.fetch = async (url, options = {}) => {
		calls.push({url: String(url), options})
		return {
			status: 200,
			json: async () => ({
				receiptId: 55,
				status: 'completed',
				rawText: 'TEST MARKET\nTOTAL 77.00',
				engine: 'tesseract',
				language: 'ukr+eng'
			})
		}
	}

	try {
		const service = new ReceiptApiService()
		const read = await service.getReceiptOcr(55)
		const started = await service.runReceiptOcr(55)

		assert.equal(read.rawText, 'TEST MARKET\nTOTAL 77.00')
		assert.equal(started.status, 'completed')
		assert.deepEqual(calls.map(call => call.url), ['/api/receipts/55/ocr', '/api/receipts/55/ocr'])
		assert.equal(calls[0].options.cache, 'no-store')
		assert.equal(calls[1].options.method, 'POST')
		assert.equal(calls[0].options.headers.Authorization, 'Bearer receipt-token')
	} finally {
		globalThis.fetch = previousFetch
	}
})
