import BalanceApiService from '../services/BalanceApiService.js'
import BalanceLocalRepository from '../services/BalanceLocalRepository.js'

const cloneData = data => data ? JSON.parse(JSON.stringify(data)) : null

class BalanceStore {

	constructor() {
		this.apiService = new BalanceApiService()
		this.repository = new BalanceLocalRepository()
		this.listeners = new Set()
		this.loadPromise = null
		this.state = {
			data: null,
			updatedAt: null,
			loading: false,
			loaded: false,
			source: null,
			stale: false,
			error: null
		}
	}

	getState() {
		return {
			...this.state,
			data: cloneData(this.state.data)
		}
	}

	subscribe(listener) {
		if (typeof listener !== 'function') return () => {}
		this.listeners.add(listener)
		listener(this.getState())
		return () => this.listeners.delete(listener)
	}

	notify() {
		const state = this.getState()
		this.listeners.forEach(listener => listener(state))
	}

	setState(patch) {
		this.state = {
			...this.state,
			...patch
		}
		this.notify()
	}

	hydrateFromCache() {
		if (this.state.loaded || this.state.data) return this.getState()
		const cache = this.repository.get()
		if (!cache) return this.getState()

		this.setState({
			data: cache.data,
			updatedAt: cache.updatedAt,
			loaded: true,
			source: 'cache',
			stale: false,
			error: null
		})
		return this.getState()
	}

	load(queryParam = '') {
		if (this.loadPromise) return this.loadPromise

		const cache = this.repository.get()
		if (cache) {
			this.setState({
				data: cache.data,
				updatedAt: cache.updatedAt,
				loaded: true,
				source: 'cache',
				stale: false,
				error: null
			})
		}

		this.loadPromise = this.refresh(queryParam)
			.finally(() => {
				this.loadPromise = null
			})

		return this.loadPromise
	}

	async refresh(queryParam = '') {
		this.setState({loading: true})

		try {
			const data = await this.apiService.getBalance(queryParam)
			const cache = this.repository.save(data)
			this.setState({
				data,
				updatedAt: cache?.updatedAt || Date.now(),
				loading: false,
				loaded: true,
				source: 'api',
				stale: false,
				error: null
			})
			return this.getState()
		} catch (error) {
			const cache = this.repository.get()
			if (cache) {
				this.setState({
					data: cache.data,
					updatedAt: cache.updatedAt,
					loading: false,
					loaded: true,
					source: 'cache',
					stale: true,
					error
				})
				return this.getState()
			}

			this.setState({
				data: null,
				updatedAt: null,
				loading: false,
				loaded: false,
				source: null,
				stale: false,
				error
			})
			return this.getState()
		}
	}
}

export default new BalanceStore()
