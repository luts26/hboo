const MONTH_LABELS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
]

const parsePurchaseTime = value => {
	const time = new Date(value).getTime()
	return Number.isFinite(time) ? time : null
}

const getCurrentMonthPeriod = (now = new Date()) => ({
	from: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime(),
	to: now.getTime(),
	label: MONTH_LABELS[now.getMonth()]
})

const getProductKey = value => String(value ?? '')

const getCategoryIdentity = (item, productsById, categoriesById) => {
	const product = productsById.get(getProductKey(item.productId))
	if (!product && !item.categoryId) return null
	const categoryId = product?.categoryId ?? item.categoryId ?? null
	const category = categoriesById.get(getProductKey(categoryId))
	const categoryName = category?.name || product?.categoryName || item.categoryName
	if (!categoryId || !categoryName) return null
	return {
		id: categoryId,
		name: categoryName
	}
}

const calculateCurrentMonthPurchaseSummary = ({
	purchases = [],
	products = [],
	categories = [],
	now = new Date()
} = {}) => {
	const period = getCurrentMonthPeriod(now)
	const productsById = new Map()
	products.forEach(product => {
		productsById.set(getProductKey(product.id), product)
		if (product.serverId) productsById.set(getProductKey(product.serverId), product)
	})
	const categoriesById = new Map(categories.map(category => [getProductKey(category.id), category]))
	const activePurchases = purchases.filter(purchase => {
		if (purchase.syncStatus === 'pending_delete') return false
		const time = parsePurchaseTime(purchase.purchasedAt)
		return time !== null && time >= period.from && time <= period.to
	})
	const categoryTotals = new Map()
	let total = 0

	activePurchases.forEach(purchase => {
		;(purchase.items || []).forEach(item => {
			const itemTotal = Number(item.total) || 0
			total += itemTotal
			const category = getCategoryIdentity(item, productsById, categoriesById)
			if (!category) return
			const key = getProductKey(category.id)
			const current = categoryTotals.get(key) || {id: category.id, name: category.name, total: 0}
			current.total += itemTotal
			categoryTotals.set(key, current)
		})
	})

	return {
		period,
		total,
		purchaseCount: activePurchases.length,
		topCategories: Array.from(categoryTotals.values())
			.filter(category => category.total > 0)
			.sort((a, b) => b.total - a.total || String(a.name).localeCompare(String(b.name), 'uk'))
			.slice(0, 3)
	}
}

export {
	calculateCurrentMonthPurchaseSummary,
	getCurrentMonthPeriod
}
