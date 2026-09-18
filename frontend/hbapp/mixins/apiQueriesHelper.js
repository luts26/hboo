import {getAuthToken} from '../services/AuthSession.js'

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

	get: async function(path, headers = {}) {
		const requestData = {
			method: 'GET',
			headers: this.getHeaders(headers)
		}
		const responce = await fetch(this.apiurl + path, requestData)
		if ([200, 201].indexOf(responce.status) !== -1) {
			return responce.json()
		}
		throw 1
	},

	post: async function(path, data, headers = {}) {
		const requestData = {
			method: 'POST',
			headers: this.getHeaders(headers)
		}
		if (data) requestData.body = JSON.stringify(data)
		const responce = await fetch(this.apiurl + path, requestData)
		if ([200, 201].indexOf(responce.status) !== -1) {
			return responce.json()
		}
		throw 1
	},

	put: async function(path, data, headers = {}) {
		const requestData = {
			method: 'PUT',
			headers: this.getHeaders(headers)
		}
		if (data) requestData.body = JSON.stringify(data)
		const responce = await fetch(this.apiurl + path, requestData)
		if ([200, 201].indexOf(responce.status) !== -1) {
			return responce.json()
		}
		throw 1
	},

	delete: async function(path, headers = {}) {
		const requestData = {
			method: 'DELETE',
			headers: this.getHeaders(headers)
		}
		const responce = await fetch(this.apiurl + path, requestData)
		if ([200, 201].indexOf(responce.status) !== -1) {
			return responce.json()
		}
		throw 1
	}
}

export default api
