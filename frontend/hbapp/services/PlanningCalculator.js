const DAY_MS = 24 * 60 * 60 * 1000

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

const normalizeMonoAmount = value => toNumber(value) / 100

const normalizeBalance = balance => {
	const mono = Array.isArray(balance?.mono) ? balance.mono : []
	const privat = Array.isArray(balance?.privat) ? balance.privat : []
	const monoBalance = mono.reduce((sum, item) => sum + normalizeMonoAmount(item.balance), 0)
	const monoCredit = mono.reduce((sum, item) => sum + normalizeMonoAmount(item.credit_limit), 0)
	const privatBalance = privat.reduce((sum, item) => sum + toNumber(item.balance), 0)
	const privatCredit = privat.reduce((sum, item) => sum + toNumber(item.credit_limit), 0)

	return {
		current: monoBalance + privatBalance,
		credit: monoCredit + privatCredit,
		total: (monoBalance + privatBalance) - (monoCredit + privatCredit),
		accounts: {
			mono: {
				current: monoBalance,
				credit: monoCredit,
				total: monoBalance - monoCredit
			},
			privat: {
				current: privatBalance,
				credit: privatCredit,
				total: privatBalance - privatCredit
			}
		}
	}
}

const normalizeTransactions = transactions => {
	const mono = Array.isArray(transactions?.mono) ? transactions.mono : []
	const privat = Array.isArray(transactions?.privat) ? transactions.privat : []

	return [
		...mono.map(item => ({
			id: item.id ?? item.t_id,
			bank: 'mono',
			amount: toNumber(item.amount),
			date: toNumber(item.time) * 1000,
			sourceCategoryCode: item.mcc,
			description: item.description ?? ''
		})),
		...privat.map(item => ({
			id: item.id ?? item.t_id,
			bank: 'privat',
			amount: toNumber(item.amount),
			date: toNumber(item.date),
			sourceCategoryCode: item.rawCategory ?? item.bankCategory ?? item.category,
			description: item.details ?? ''
		}))
	].filter(item => item.date > 0)
}

const normalizePlanningItems = items => {
	if (!Array.isArray(items)) return []

	return items.map(item => ({
		...item,
		id: item.id ?? String(item.date ?? Date.now()),
		periodId: item.periodId ? String(item.periodId) : null,
		sum: toNumber(item.sum),
		actualAmount: item.actualAmount === null || item.actualAmount === undefined ? null : toNumber(item.actualAmount),
		status: normalizePlanningStatus(item.status),
		date: toNumber(item.date || item.createdAt || Date.now()),
		typeStr: item.typeStr || 'other',
		desc: item.desc || '',
		checklist: Array.isArray(item.checklist)
			? item.checklist.map(checklistItem => ({
				id: String(checklistItem?.id || ''),
				title: String(checklistItem?.title || '').trim(),
				checked: Boolean(checklistItem?.checked)
			})).filter(checklistItem => checklistItem.id && checklistItem.title)
			: undefined,
		createdAt: toNumber(item.createdAt || item.date || Date.now()),
		updatedAt: toNumber(item.updatedAt || item.createdAt || item.date || Date.now())
	}))
}

const normalizePlanningStatus = status => {
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

const filterByPeriod = (items, period) => {
	const periodId = period?.id ? String(period.id) : null
	const from = toNumber(period?.dateFrom ?? period?.from)
	const to = toNumber(period?.dateTo ?? period?.to)

	return items.filter(item => {
		if (periodId && item.periodId && String(item.periodId) !== periodId) return false
		if (from && item.date < from) return false
		if (to && item.date > to) return false
		return true
	})
}

const getCounters = items => {
	return items.reduce((result, item) => {
		const status = normalizePlanningStatus(item.status)
		const amount = status === 'completed' && item.actualAmount !== null && item.actualAmount !== undefined
			? toNumber(item.actualAmount)
			: item.sum
		if (!result[status]) result[status] = {count: 0, sum: 0}
		result[status].count++
		result[status].sum += amount
		result.total.count++
		result.total.sum += amount
		return result
	}, {
		pending: {count: 0, sum: 0},
		completed: {count: 0, sum: 0},
		cancelled: {count: 0, sum: 0},
		total: {count: 0, sum: 0}
	})
}

const getActualSpending = (transactions, period) => {
	return filterByPeriod(transactions, period).reduce((sum, item) => {
		return item.amount < 0 ? sum + Math.abs(item.amount) : sum
	}, 0)
}

const getTodaySpending = transactions => {
	return getActualSpending(transactions, {
		dateFrom: startOfDay(Date.now()),
		dateTo: endOfDay(Date.now())
	})
}

const getTodayApprovedPlanningSpending = items => {
	const todayFrom = startOfDay(Date.now())
	const todayTo = endOfDay(Date.now())

	return items.reduce((sum, item) => {
		if (normalizePlanningStatus(item.status) !== 'completed') return sum
		if (item.date < todayFrom || item.date > todayTo) return sum
		return sum + (item.actualAmount === null || item.actualAmount === undefined ? item.sum : toNumber(item.actualAmount))
	}, 0)
}

const getDaysLeft = period => {
	const to = toNumber(period?.dateTo ?? period?.to)
	if (!to) return 0
	const today = startOfDay(Date.now())
	const lastDay = startOfDay(to)
	return Math.max(0, Math.ceil((lastDay - today) / DAY_MS) + 1)
}

const calculateSummary = ({balance, transactions, planningItems, period}) => {
	const normalizedBalance = normalizeBalance(balance)
	const normalizedTransactions = normalizeTransactions(transactions)
	const items = filterByPeriod(normalizePlanningItems(planningItems), period)
	const counters = getCounters(items)
	const actualSpending = getActualSpending(normalizedTransactions, period)
	const daysLeft = getDaysLeft(period)
	const budget = Math.max(0, toNumber(period?.periodBudget))
	const isBudgetConfigured = budget > 0
	const completedSpending = counters.completed.sum
	const pendingSpending = counters.pending.sum
	const cancelledSpending = counters.cancelled.sum
	const plannedAmount = pendingSpending + completedSpending
	const remainingAmount = isBudgetConfigured ? budget - completedSpending : null
	const reservedAmount = pendingSpending
	const freeAmount = isBudgetConfigured ? remainingAmount - reservedAmount : null
	const recommendedDailyLimit = isBudgetConfigured ? (daysLeft > 0 ? freeAmount / daysLeft : 0) : null
	const todaySpending = getTodayApprovedPlanningSpending(items)
	const availableToday = isBudgetConfigured ? recommendedDailyLimit - todaySpending : null
	const aliasedCounters = {
		...counters,
		approve: counters.completed,
		disable: counters.cancelled
	}

	return {
		balance: normalizedBalance,
		transactions: normalizedTransactions,
		items,
		counters: aliasedCounters,
		budget,
		isBudgetConfigured,
		actualSpending,
		completedSpending,
		approvedSpending: completedSpending,
		pendingSpending,
		cancelledSpending,
		disabledSpending: cancelledSpending,
		plannedAmount,
		remainingAmount,
		remainingBudget: freeAmount,
		reservedAmount,
		freeAmount,
		amountLeft: freeAmount,
		availableAfterPending: freeAmount,
		daysLeft,
		recommendedDailyLimit,
		todaySpending,
		availableToday
	}
}

export {
	calculateSummary,
	endOfDay,
	filterByPeriod,
	getTodaySpending,
	normalizeBalance,
	normalizePlanningItems,
	normalizeTransactions,
	startOfDay
}
