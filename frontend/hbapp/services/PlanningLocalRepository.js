import {getAuthenticatedUserId} from './AuthSession.js'

const LEGACY_STORAGE_KEY = 'hboo-planing-items-v1'
const STORAGE_KEY_PREFIX = 'hboo-planning-v2'
const UNSCOPED_STORAGE_KEY = STORAGE_KEY_PREFIX
const STORAGE_VERSION = 2

const getPlanningStorageKey = userId => `${STORAGE_KEY_PREFIX}:user:${Number(userId)}`

const toNumber = value => {
	const num = Number(value)
	return Number.isFinite(num) ? num : 0
}

const startOfDay = date => {
	const d = new Date(date)
	d.setHours(0, 0, 0, 0)
	return d.getTime()
}

const endOfDay = date => {
	const d = new Date(date)
	d.setHours(23, 59, 59, 999)
	return d.getTime()
}

const dateStringToTimestamp = (value, isEndOfDay = false) => {
	if (!value) return null
	const [year, month, day] = String(value).slice(0, 10).split('-').map(Number)
	if (!year || !month || !day) return null
	return (isEndOfDay ? endOfDay : startOfDay)(new Date(year, month - 1, day))
}

const getDefaultPeriodRange = () => {
	const now = new Date()
	return {
		dateFrom: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)),
		dateTo: endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0))
	}
}

const createId = prefix => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`

const isTemporaryId = id => String(id || '').includes('-')

const readJson = (storageKey, fallback = null) => {
	try {
		const rawData = localStorage.getItem(storageKey)
		return rawData ? JSON.parse(rawData) : fallback
	} catch (error) {
		console.warn('Planning local data is not readable', error)
		return fallback
	}
}

const writeJson = (storageKey, data) => {
	localStorage.setItem(storageKey, JSON.stringify(data))
}

const normalizeStatus = status => {
	const map = {
		approve: 'completed',
		approved: 'completed',
		completed: 'completed',
		disable: 'cancelled',
		disabled: 'cancelled',
		cancelled: 'cancelled',
		pending: 'pending'
	}

	return map[status] || 'pending'
}

const normalizeChecklist = checklist => {
	if (!Array.isArray(checklist)) return undefined

	const items = checklist
		.map(item => ({
			id: String(item?.id || createId('checklist')),
			title: String(item?.title || '').trim(),
			checked: Boolean(item?.checked)
		}))
		.filter(item => item.title)

	return items.length ? items : undefined
}

const normalizePeriod = period => {
	const range = getDefaultPeriodRange()
	const now = Date.now()
	const dateFrom = toNumber(period?.dateFrom)
		|| dateStringToTimestamp(period?.startDate)
		|| dateStringToTimestamp(period?.start_date)
		|| toNumber(period?.from)
		|| range.dateFrom
	const dateTo = toNumber(period?.dateTo)
		|| dateStringToTimestamp(period?.endDate, true)
		|| dateStringToTimestamp(period?.end_date, true)
		|| toNumber(period?.to)
		|| range.dateTo

	return {
		id: String(period?.id || createId('period')),
		dateFrom: startOfDay(dateFrom),
		dateTo: endOfDay(dateTo),
		periodBudget: Math.max(0, toNumber(period?.periodBudget ?? period?.budgetAmount ?? period?.budget_amount)),
		status: period?.status || 'active',
		createdAt: toNumber(period?.createdAt) || now,
		updatedAt: toNumber(period?.updatedAt) || now
	}
}

const normalizeItem = (item, periodId) => {
	const now = Date.now()
	const plannedDate = dateStringToTimestamp(item?.plannedAt || item?.planned_at)
	const date = toNumber(item?.date || item?.createdAt) || plannedDate || now
	const createdAt = toNumber(item?.createdAt) || date
	const description = item?.desc ?? item?.description ?? ''
	const normalizedItem = {
		...item,
		id: String(item?.id || createId('item')),
		periodId: String(item?.periodId || item?.period_id || periodId),
		categoryId: item?.categoryId ?? item?.category_id ?? null,
		title: item?.title || description || 'Planning expense',
		sum: Math.max(0, toNumber(item?.sum ?? item?.plannedAmount ?? item?.planned_amount)),
		actualAmount: item?.actualAmount ?? item?.actual_amount ?? null,
		status: normalizeStatus(item?.status),
		date,
		typeStr: item?.typeStr || String(item?.categoryId ?? item?.category_id ?? 'other'),
		desc: description,
		transactionId: item?.transactionId ?? item?.transaction_id ?? null,
		completedAt: item?.completedAt ?? item?.completed_at ?? null,
		cancelledAt: item?.cancelledAt ?? item?.cancelled_at ?? null,
		createdAt,
		updatedAt: toNumber(item?.updatedAt) || createdAt
	}
	const checklist = normalizeChecklist(item?.checklist)

	if (checklist) normalizedItem.checklist = checklist
	else delete normalizedItem.checklist

	return normalizedItem
}

const normalizeServerSnapshot = snapshot => {
	if (!snapshot?.period) return null
	const period = normalizePeriod(snapshot.period)
	const items = Array.isArray(snapshot.items)
		? snapshot.items.map(item => normalizeItem(item, period.id))
		: []

	return {
		period,
		items,
		statistics: snapshot.statistics || null,
		updatedAt: toNumber(snapshot.updatedAt) || Date.now()
	}
}

const getLegacyItems = legacyData => {
	if (Array.isArray(legacyData)) return legacyData
	if (Array.isArray(legacyData?.items)) return legacyData.items
	if (Array.isArray(legacyData?.planningItems)) return legacyData.planningItems
	return []
}

const getLegacyPeriod = legacyData => {
	const period = legacyData?.period || legacyData?.currentPeriod || legacyData?.planningPeriod || null
	if (!period) return null

	const dateFrom = period.dateFrom ?? period.from
	const dateTo = period.dateTo ?? period.to
	if (!dateFrom || !dateTo) return null

	return {
		dateFrom,
		dateTo,
		periodBudget: period.periodBudget ?? 0
	}
}

const createEmptyStorage = () => {
	const period = normalizePeriod(getDefaultPeriodRange())
	return {
		version: STORAGE_VERSION,
		currentPeriodId: period.id,
		periods: [period],
		items: [],
		serverSnapshot: null,
		deletedItemIds: [],
		dirty: false
	}
}

const migrateLegacyData = legacyData => {
	const now = Date.now()
	const legacyPeriod = getLegacyPeriod(legacyData)
	const period = normalizePeriod({
		...(legacyPeriod || getDefaultPeriodRange()),
		id: createId('period'),
		status: 'active',
		createdAt: now,
		updatedAt: now
	})
	const items = getLegacyItems(legacyData).map(item => normalizeItem(item, period.id))

	return {
		version: STORAGE_VERSION,
		currentPeriodId: period.id,
		periods: [period],
		items,
		serverSnapshot: null,
		deletedItemIds: [],
		dirty: items.length > 0 || Boolean(legacyPeriod)
	}
}

export default class PlanningLocalRepository {

	constructor(options = {}, legacyStorageKey = LEGACY_STORAGE_KEY) {
		const config = typeof options === 'object' && options !== null ? options : {storageKey: options}
		this.userId = config.userId || null
		this.storageKey = config.storageKey || null
		this.legacyStorageKey = config.legacyStorageKey || legacyStorageKey
		this.unscopedStorageKey = config.unscopedStorageKey || UNSCOPED_STORAGE_KEY
	}

	getUserId() {
		return this.userId || getAuthenticatedUserId()
	}

	getStorageKey() {
		if (this.storageKey) return this.storageKey

		const userId = this.getUserId()
		return userId ? getPlanningStorageKey(userId) : null
	}

	migrateUnscopedStorage(storageKey) {
		if (!storageKey || this.storageKey) return
		const scopedData = readJson(storageKey, null)
		const unscopedData = readJson(this.unscopedStorageKey, null)

		if (scopedData || !unscopedData) return

		writeJson(storageKey, unscopedData)
		localStorage.removeItem(this.unscopedStorageKey)
	}

	readStorage() {
		const storageKey = this.getStorageKey()
		if (!storageKey) return createEmptyStorage()
		this.migrateUnscopedStorage(storageKey)

		const storedData = readJson(storageKey, null)
		if (storedData?.version === STORAGE_VERSION && Array.isArray(storedData.periods) && Array.isArray(storedData.items)) {
			const periods = storedData.periods.map(period => normalizePeriod(period))
			const currentPeriodId = String(storedData.currentPeriodId || periods[0]?.id || '')
			return {
				...storedData,
				currentPeriodId,
				periods,
				items: storedData.items.map(item => normalizeItem(item, item.periodId || currentPeriodId)),
				serverSnapshot: normalizeServerSnapshot(storedData.serverSnapshot),
				deletedItemIds: Array.isArray(storedData.deletedItemIds) ? storedData.deletedItemIds.map(String) : [],
				dirty: Boolean(storedData.dirty)
			}
		}

		const legacyData = readJson(this.legacyStorageKey, null)
		const data = legacyData ? migrateLegacyData(legacyData) : createEmptyStorage()
		writeJson(storageKey, data)
		if (legacyData) localStorage.removeItem(this.legacyStorageKey)
		return data
	}

	writeStorage(data) {
		const storageKey = this.getStorageKey()
		if (!storageKey) return

		writeJson(storageKey, {
			version: STORAGE_VERSION,
			currentPeriodId: data.currentPeriodId,
			periods: Array.isArray(data.periods) ? data.periods : [],
			items: Array.isArray(data.items) ? data.items : [],
			serverSnapshot: data.serverSnapshot || null,
			deletedItemIds: Array.isArray(data.deletedItemIds) ? data.deletedItemIds : [],
			dirty: Boolean(data.dirty)
		})
	}

	async getPlanningState() {
		const data = this.readStorage()
		const currentPeriod = data.periods.find(period => String(period.id) === String(data.currentPeriodId)) || data.periods[0] || null

		return {
			...data,
			currentPeriodId: currentPeriod?.id || data.currentPeriodId,
			currentPeriod,
			items: currentPeriod ? data.items.filter(item => String(item.periodId) === String(currentPeriod.id)) : []
		}
	}

	async replaceFromServer({period, items = [], statistics = null}, {preserveDirty = false} = {}) {
		const storage = this.readStorage()
		const normalizedPeriod = normalizePeriod(period)
		const normalizedItems = items.map(item => {
			const localItem = normalizeItem(item, normalizedPeriod.id)
			const currentItem = storage.items.find(storedItem => String(storedItem.id) === String(localItem.id))
			if (currentItem?.checklist) localItem.checklist = currentItem.checklist
			return localItem
		})
		const serverSnapshot = {
			period: normalizedPeriod,
			items: normalizedItems,
			statistics,
			updatedAt: Date.now()
		}

		if (preserveDirty && storage.dirty) {
			this.writeStorage({
				...storage,
				serverSnapshot
			})
			return this.getPlanningState()
		}

		this.writeStorage({
			...storage,
			currentPeriodId: normalizedPeriod.id,
			periods: [normalizedPeriod],
			items: normalizedItems,
			serverSnapshot,
			deletedItemIds: [],
			dirty: false
		})

		return this.getPlanningState()
	}

	async updateCurrentPeriod(data, {markDirty = true} = {}) {
		const storage = this.readStorage()
		const currentPeriodId = storage.currentPeriodId
		const now = Date.now()
		let updatedPeriod = null
		const periods = storage.periods.map(period => {
			if (String(period.id) !== String(currentPeriodId)) return period
			updatedPeriod = normalizePeriod({
				...period,
				...data,
				id: period.id,
				createdAt: period.createdAt,
				updatedAt: now
			})
			return updatedPeriod
		})

		if (!updatedPeriod) {
			updatedPeriod = normalizePeriod({
				...getDefaultPeriodRange(),
				...data,
				updatedAt: now
			})
			periods.push(updatedPeriod)
			storage.currentPeriodId = updatedPeriod.id
		}

		this.writeStorage({...storage, periods, dirty: markDirty ? true : storage.dirty})
		return updatedPeriod
	}

	async createItem(data, {markDirty = true} = {}) {
		const storage = this.readStorage()
		const periodId = storage.currentPeriodId
		const now = Date.now()
		const item = normalizeItem({
			status: 'pending',
			date: now,
			createdAt: now,
			updatedAt: now,
			...data,
			id: createId('item'),
			periodId
		}, periodId)

		storage.items.push(item)
		this.writeStorage({...storage, dirty: markDirty ? true : storage.dirty})
		return item
	}

	async updateItem(id, data, {markDirty = true} = {}) {
		const storage = this.readStorage()
		let updatedItem = null
		const updatedItems = storage.items.map(item => {
			if (String(item.id) !== String(id)) return item
			updatedItem = normalizeItem({
				...item,
				...data,
				id: item.id,
				periodId: item.periodId,
				createdAt: item.createdAt,
				updatedAt: Date.now()
			}, item.periodId)
			return updatedItem
		})

		this.writeStorage({...storage, items: updatedItems, dirty: markDirty ? true : storage.dirty})
		return updatedItem
	}

	async setStatus(id, status, options = {}) {
		return this.updateItem(id, {status: normalizeStatus(status)}, options)
	}

	async removeItem(id) {
		const storage = this.readStorage()
		const item = storage.items.find(storedItem => String(storedItem.id) === String(id))
		const updatedItems = storage.items.filter(storedItem => String(storedItem.id) !== String(id))
		const deletedItemIds = !item || isTemporaryId(item.id)
			? storage.deletedItemIds
			: [...new Set([...storage.deletedItemIds, String(item.id)])]

		this.writeStorage({...storage, items: updatedItems, deletedItemIds, dirty: true})
		return true
	}

	async setDirty(dirty) {
		const storage = this.readStorage()
		this.writeStorage({...storage, dirty})
		return true
	}

	async markCurrentPeriodPersisted(period) {
		const storage = this.readStorage()
		const previousPeriodId = String(storage.currentPeriodId || '')
		const normalizedPeriod = normalizePeriod(period)
		let periodReplaced = false
		const periods = storage.periods
			.map(storedPeriod => {
				if (String(storedPeriod.id) !== previousPeriodId && String(storedPeriod.id) !== String(normalizedPeriod.id)) {
					return storedPeriod
				}

				if (periodReplaced) return null
				periodReplaced = true
				return {
					...normalizedPeriod,
					createdAt: normalizedPeriod.createdAt || storedPeriod.createdAt,
					updatedAt: normalizedPeriod.updatedAt || storedPeriod.updatedAt
				}
			})
			.filter(Boolean)

		if (!periodReplaced) periods.push(normalizedPeriod)

		const items = storage.items.map(item => {
			if (String(item.periodId) !== previousPeriodId) return item
			return normalizeItem({
				...item,
				periodId: normalizedPeriod.id
			}, normalizedPeriod.id)
		})
		const snapshot = storage.serverSnapshot
		const serverSnapshot = snapshot
			? {
				...snapshot,
				period: normalizedPeriod
			}
			: {
				period: normalizedPeriod,
				items: [],
				statistics: null,
				updatedAt: Date.now()
			}

		this.writeStorage({
			...storage,
			currentPeriodId: normalizedPeriod.id,
			periods,
			items,
			serverSnapshot,
			dirty: true
		})

		return this.getPlanningState()
	}

	async markItemPersisted(localItemId, item, periodId) {
		const storage = this.readStorage()
		const normalizedItem = normalizeItem(item, periodId)
		const currentItem = storage.items.find(storedItem => String(storedItem.id) === String(localItemId))
		if (currentItem?.checklist) normalizedItem.checklist = currentItem.checklist

		let itemReplaced = false
		const items = storage.items
			.map(storedItem => {
				if (String(storedItem.id) !== String(localItemId) && String(storedItem.id) !== String(normalizedItem.id)) {
					return storedItem
				}

				if (itemReplaced) return null
				itemReplaced = true
				return normalizedItem
			})
			.filter(Boolean)

		if (!itemReplaced) items.push(normalizedItem)

		const snapshot = storage.serverSnapshot
		const snapshotItems = Array.isArray(snapshot?.items) ? snapshot.items : []
		const serverSnapshot = snapshot
			? {
				...snapshot,
				items: [
					...snapshotItems.filter(snapshotItem => String(snapshotItem.id) !== String(normalizedItem.id)),
					normalizedItem
				],
				updatedAt: Date.now()
			}
			: storage.serverSnapshot

		this.writeStorage({
			...storage,
			items,
			serverSnapshot,
			dirty: true
		})

		return this.getPlanningState()
	}

	async markCleanFromState({period, items, statistics = null}) {
		const normalizedPeriod = normalizePeriod(period)
		const normalizedItems = items.map(item => normalizeItem(item, normalizedPeriod.id))
		const serverSnapshot = {
			period: normalizedPeriod,
			items: normalizedItems,
			statistics,
			updatedAt: Date.now()
		}

		this.writeStorage({
			version: STORAGE_VERSION,
			currentPeriodId: normalizedPeriod.id,
			periods: [normalizedPeriod],
			items: normalizedItems,
			serverSnapshot,
			deletedItemIds: [],
			dirty: false
		})

		return this.getPlanningState()
	}

	isTemporaryId(id) {
		return isTemporaryId(id)
	}
}

export {getPlanningStorageKey}
