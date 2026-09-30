import {getAuthToken, observeAuthenticatedResponse} from './AuthSession.js'

const apiUrl = '/api'

const createHttpError = (response, message = 'Receipt API request failed') => {
	const error = new Error(message)
	error.status = response?.status || null
	error.statusCode = response?.status || null
	return error
}

const authHeaders = () => {
	const token = getAuthToken()
	return token ? {Authorization: `Bearer ${token}`} : {}
}

const observe = (response, headers) => observeAuthenticatedResponse(response, {
	hadAuth: Boolean(headers.Authorization),
	authorization: headers.Authorization,
	credentialToken: String(headers.Authorization || '').replace(/^Bearer\s+/i, '') || null
})

export default class ReceiptApiService {
	async uploadStandaloneReceipt(receipt) {
		const headers = authHeaders()
		const form = new FormData()
		form.append('client_mutation_id', receipt.clientMutationId)
		form.append('receipt', receipt.blob, receipt.originalFilename || 'receipt.jpg')
		const response = await fetch(`${apiUrl}/receipts`, {
			method: 'POST',
			headers,
			body: form
		})
		observe(response, headers)
		if (response.status === 200 || response.status === 201) return response.json()
		throw createHttpError(response)
	}

	async getStandaloneReceiptImageBlob(receiptServerId) {
		const headers = authHeaders()
		const response = await fetch(`${apiUrl}/receipts/${encodeURIComponent(receiptServerId)}/image`, {
			headers,
			cache: 'no-store'
		})
		observe(response, headers)
		if (response.status === 200) return response.blob()
		if (response.status === 404) return null
		throw createHttpError(response)
	}

	async deleteStandaloneReceipt(receiptServerId) {
		const headers = authHeaders()
		const response = await fetch(`${apiUrl}/receipts/${encodeURIComponent(receiptServerId)}`, {
			method: 'DELETE',
			headers
		})
		observe(response, headers)
		if (response.status === 200 || response.status === 404) return true
		throw createHttpError(response)
	}

	async getReceiptOcr(receiptServerId) {
		const headers = authHeaders()
		const response = await fetch(`${apiUrl}/receipts/${encodeURIComponent(receiptServerId)}/ocr`, {
			headers,
			cache: 'no-store'
		})
		observe(response, headers)
		if (response.status === 200) return response.json()
		if (response.status === 404) return null
		throw createHttpError(response)
	}

	async runReceiptOcr(receiptServerId) {
		const headers = authHeaders()
		const response = await fetch(`${apiUrl}/receipts/${encodeURIComponent(receiptServerId)}/ocr`, {
			method: 'POST',
			headers
		})
		observe(response, headers)
		if (response.status === 200) return response.json()
		if (response.status === 404) return null
		throw createHttpError(response)
	}

	async uploadReceipt(purchaseServerId, receipt) {
		const headers = authHeaders()
		const form = new FormData()
		form.append('client_mutation_id', receipt.clientMutationId)
		form.append('receipt', receipt.blob, receipt.originalFilename || 'receipt.jpg')
		const response = await fetch(`${apiUrl}/purchases/${encodeURIComponent(purchaseServerId)}/receipt`, {
			method: 'POST',
			headers,
			body: form
		})
		observe(response, headers)
		if (response.status === 200 || response.status === 201) return response.json()
		throw createHttpError(response)
	}

	async getReceipt(purchaseServerId) {
		const headers = authHeaders()
		const response = await fetch(`${apiUrl}/purchases/${encodeURIComponent(purchaseServerId)}/receipt`, {headers})
		observe(response, headers)
		if (response.status === 200) return response.json()
		if (response.status === 404) return null
		throw createHttpError(response)
	}

	async getReceiptImageBlob(purchaseServerId) {
		const headers = authHeaders()
		const response = await fetch(`${apiUrl}/purchases/${encodeURIComponent(purchaseServerId)}/receipt/image`, {
			headers,
			cache: 'no-store'
		})
		observe(response, headers)
		if (response.status === 200) return response.blob()
		if (response.status === 404) return null
		throw createHttpError(response)
	}

	async deleteReceipt(purchaseServerId) {
		const headers = authHeaders()
		const response = await fetch(`${apiUrl}/purchases/${encodeURIComponent(purchaseServerId)}/receipt`, {
			method: 'DELETE',
			headers
		})
		observe(response, headers)
		if (response.status === 200 || response.status === 404) return true
		throw createHttpError(response)
	}
}
