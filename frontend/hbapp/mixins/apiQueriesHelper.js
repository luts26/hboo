import {getAuthToken, observeAuthenticatedResponse} from '../services/AuthSession.js'

const api = {

	apiurl: '/api',
	authToken: getAuthToken(),

	getHeaders: function(headers = {}) {
		this.authToken = getAuthToken()
		const requestHeaders = {
			'Content-Type': 'application/json',
			...headers
		}

		if (this.authToken) {
			requestHeaders.Authorization = 'Bearer ' + this.authToken
		}

		return requestHeaders
	},

	getPublicHeaders: function(headers = {}) {
		return {
			'Content-Type': 'application/json',
			...headers
		}
	},

	hasAuthHeader: function(headers = {}) {
		return Boolean(headers.Authorization)
	},

	getAuthHeaderToken: function(headers = {}) {
		const match = String(headers.Authorization || '').match(/^Bearer\s+(.+)$/i)
		return match ? match[1] : null
	},

	observeResponseAuth: function(response, headers = {}) {
		return observeAuthenticatedResponse(response, {
			hadAuth: this.hasAuthHeader(headers),
			authorization: headers.Authorization,
			credentialToken: this.getAuthHeaderToken(headers)
		})
	},

	createHttpError: function(response, message = 'API request failed') {
		const error = new Error(message)
		error.status = response?.status || null
		error.statusCode = response?.status || null
		return error
	},

	request: async function(path, {method = 'GET', data = undefined, headers = {}} = {}) {
		const requestHeaders = this.getHeaders(headers)
		const requestData = {
			method,
			headers: requestHeaders
		}
		if (data) requestData.body = JSON.stringify(data)
		const response = await fetch(this.apiurl + path, requestData)
		this.observeResponseAuth(response, requestHeaders)
		if ([200, 201].indexOf(response.status) !== -1) {
			return response.json()
		}
		throw this.createHttpError(response)
	},

	publicRequest: async function(path, {method = 'GET', data = undefined, headers = {}} = {}) {
		const requestHeaders = this.getPublicHeaders(headers)
		const requestData = {
			method,
			headers: requestHeaders
		}
		if (data) requestData.body = JSON.stringify(data)
		const response = await fetch(this.apiurl + path, requestData)
		if ([200, 201].indexOf(response.status) !== -1) {
			return response.json()
		}
		throw this.createHttpError(response)
	},

	get: async function(path, headers = {}) {
		return this.request(path, {method: 'GET', headers})
	},

	post: async function(path, data, headers = {}) {
		return this.request(path, {method: 'POST', data, headers})
	},

	postPublic: async function(path, data, headers = {}) {
		return this.publicRequest(path, {method: 'POST', data, headers})
	},

	put: async function(path, data, headers = {}) {
		return this.request(path, {method: 'PUT', data, headers})
	},

	delete: async function(path, headers = {}) {
		return this.request(path, {method: 'DELETE', headers})
	}
}

export default api
