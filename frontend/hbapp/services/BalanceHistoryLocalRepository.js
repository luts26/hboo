import IndexedDbClient from './IndexedDbClient.js'
import {getAuthenticatedUserId} from './AuthSession.js'
import {
	normalizeApiBalanceSnapshot,
	toNumber
} from './BalanceSnapshotNormalizer.js'

const getCurrentUserKey = () => {
	const userId = getAuthenticatedUserId()
	return userId ? String(userId) : 'anonymous'
}

const cloneData = data => JSON.parse(JSON.stringify(data))

const isValidProvider = provider => ['mono', 'privat'].includes(provider)

const normalizeRange = range => ({
	dateFrom: toNumber(range?.dateFrom),
	dateTo: toNumber(range?.dateTo)
})

export default class BalanceHistoryLocalRepository {
	constructor({indexedDbClient = new IndexedDbClient()} = {}) {
		this.indexedDbClient = indexedDbClient
	}

	async saveHistory({provider, snapshots = [], fetchedAt = Date.now()} = {}) {
		if (!isValidProvider(provider)) return []
		const userKey = getCurrentUserKey()
		const records = snapshots
			.map(snapshot => normalizeApiBalanceSnapshot(snapshot, {userKey, fetchedAt}))
			.filter(snapshot => snapshot && snapshot.provider === provider)

		await this.indexedDbClient.transaction(['balanceHistory'], 'readwrite', async ({put}) => {
			await Promise.all(records.map(record => put('balanceHistory', record)))
		})

		return records.map(cloneData)
	}

	async getHistory({provider, dateFrom, dateTo} = {}) {
		if (!isValidProvider(provider)) return []
		const userKey = getCurrentUserKey()
		const range = normalizeRange({dateFrom, dateTo})
		const records = await this.indexedDbClient.getAllFromIndex(
			'balanceHistory',
			'userProvider',
			IDBKeyRange.only([userKey, provider])
		)

		const previousByAccount = new Map()
		const inRange = []

		records.forEach(record => {
			const timestamp = toNumber(record.timestamp)
			if (!timestamp) return
			if (timestamp < range.dateFrom) {
				const key = record.accountId
				const current = previousByAccount.get(key)
				if (!current || toNumber(current.timestamp) < timestamp) previousByAccount.set(key, record)
				return
			}
			if (timestamp <= range.dateTo) inRange.push(record)
		})

		return [...previousByAccount.values(), ...inRange]
			.sort((left, right) => toNumber(left.timestamp) - toNumber(right.timestamp) || String(left.id).localeCompare(String(right.id)))
			.map(record => ({
				...cloneData(record),
				inRange: toNumber(record.timestamp) >= range.dateFrom && toNumber(record.timestamp) <= range.dateTo
			}))
	}
}
