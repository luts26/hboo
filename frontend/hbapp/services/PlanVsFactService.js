const MONEY_SCALE = 100

const toMoney = value => {
	const amount = Number(value)
	if (!Number.isFinite(amount)) return 0
	return Math.round((amount + Number.EPSILON) * MONEY_SCALE) / MONEY_SCALE
}

const hasNumericValue = value => {
	if (value === null || value === undefined || value === '') return false
	return Number.isFinite(Number(value))
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

const getPlannedAmount = item => toMoney(item?.sum ?? item?.plannedAmount ?? item?.planned_amount)
const getActualAmount = item => hasNumericValue(item?.actualAmount ?? item?.actual_amount)
	? toMoney(item?.actualAmount ?? item?.actual_amount)
	: null

const classifyDifference = difference => {
	if (difference > 0) return 'under'
	if (difference < 0) return 'over'
	return 'exact'
}

const buildComparableItem = item => {
	const plannedAmount = getPlannedAmount(item)
	const actualAmount = getActualAmount(item)
	const difference = toMoney(plannedAmount - actualAmount)
	const result = classifyDifference(difference)

	return {
		itemId: String(item?.id ?? ''),
		title: item?.title || item?.desc || item?.description || 'Planning expense',
		description: item?.desc ?? item?.description ?? '',
		categoryId: item?.categoryId ?? item?.category_id ?? null,
		plannedAmount,
		actualAmount,
		difference,
		differencePercent: plannedAmount > 0 ? toMoney((difference / plannedAmount) * 100) : null,
		result,
		factAvailable: true,
		status: 'completed',
		plannedAt: item?.date ?? item?.plannedAt ?? item?.planned_at ?? null,
		completedAt: item?.completedAt ?? item?.completed_at ?? null
	}
}

const getInitialSummary = () => ({
	plannedComparable: 0,
	actualComparable: 0,
	difference: 0,
	comparableCount: 0,
	underPlanCount: 0,
	overPlanCount: 0,
	exactCount: 0,
	pendingCount: 0,
	completedWithoutFactCount: 0,
	cancelledCount: 0,
	totalCount: 0
})

const calculatePlanVsFact = (items = []) => {
	const sourceItems = Array.isArray(items) ? items : []
	const summary = getInitialSummary()
	const comparableItems = []
	const unavailableItems = []

	sourceItems.forEach(item => {
		const status = normalizeStatus(item?.status)
		summary.totalCount += 1

		if (status === 'pending') {
			summary.pendingCount += 1
			return
		}

		if (status === 'cancelled') {
			summary.cancelledCount += 1
			return
		}

		if (status !== 'completed') return

		if (!hasNumericValue(item?.actualAmount ?? item?.actual_amount)) {
			summary.completedWithoutFactCount += 1
			unavailableItems.push({
				itemId: String(item?.id ?? ''),
				title: item?.title || item?.desc || item?.description || 'Planning expense',
				description: item?.desc ?? item?.description ?? '',
				categoryId: item?.categoryId ?? item?.category_id ?? null,
				plannedAmount: getPlannedAmount(item),
				actualAmount: null,
				difference: null,
				differencePercent: null,
				result: 'unavailable',
				factAvailable: false,
				status: 'completed',
				plannedAt: item?.date ?? item?.plannedAt ?? item?.planned_at ?? null,
				completedAt: item?.completedAt ?? item?.completed_at ?? null
			})
			return
		}

		const comparableItem = buildComparableItem(item)
		comparableItems.push(comparableItem)
		summary.plannedComparable = toMoney(summary.plannedComparable + comparableItem.plannedAmount)
		summary.actualComparable = toMoney(summary.actualComparable + comparableItem.actualAmount)
		summary.comparableCount += 1

		if (comparableItem.result === 'under') summary.underPlanCount += 1
		if (comparableItem.result === 'over') summary.overPlanCount += 1
		if (comparableItem.result === 'exact') summary.exactCount += 1
	})

	summary.difference = toMoney(summary.plannedComparable - summary.actualComparable)

	return {
		summary,
		items: comparableItems,
		unavailableItems
	}
}

export {
	calculatePlanVsFact,
	classifyDifference
}
