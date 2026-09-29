const DATE_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

const toFiniteNumber = value => {
	const number = Number(value)
	return Number.isFinite(number) ? number : null
}

const getNowDate = now => {
	const date = now instanceof Date ? new Date(now.getTime()) : new Date(Number(now))
	return Number.isNaN(date.getTime()) ? new Date() : date
}

const getLocalDateParts = value => {
	if (typeof value === 'string') {
		const match = value.match(DATE_INPUT_PATTERN)
		if (match) {
			return {
				year: Number(match[1]),
				monthIndex: Number(match[2]) - 1,
				day: Number(match[3])
			}
		}
	}

	const number = toFiniteNumber(value)
	if (number === null) return null
	const date = new Date(number)
	if (Number.isNaN(date.getTime())) return null
	return {
		year: date.getFullYear(),
		monthIndex: date.getMonth(),
		day: date.getDate()
	}
}

const createLocalDate = (parts, hours = 0, minutes = 0, seconds = 0, milliseconds = 0) => {
	if (!parts) return null
	const date = new Date(parts.year, parts.monthIndex, parts.day, hours, minutes, seconds, milliseconds)
	return Number.isNaN(date.getTime()) ? null : date
}

const getLocalMonthKey = date => [
	date.getFullYear(),
	String(date.getMonth() + 1).padStart(2, '0')
].join('-')

const getMonthRange = (year, monthIndex, {now = new Date()} = {}) => {
	const current = getNowDate(now)
	const from = new Date(year, monthIndex, 1, 0, 0, 0, 0)
	const monthEnd = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999)
	const isCurrentMonth = year === current.getFullYear() && monthIndex === current.getMonth()
	return {
		dateFrom: from.getTime(),
		dateTo: isCurrentMonth ? current.getTime() : monthEnd.getTime(),
		monthKey: getLocalMonthKey(from)
	}
}

const getCurrentPurchaseRange = (now = new Date()) => {
	const current = getNowDate(now)
	return getMonthRange(current.getFullYear(), current.getMonth(), {now: current})
}

const getPreviousPurchaseMonthRange = (now = new Date()) => {
	const current = getNowDate(now)
	const previous = new Date(current.getFullYear(), current.getMonth() - 1, 1, 12, 0, 0, 0)
	return getMonthRange(previous.getFullYear(), previous.getMonth(), {now: current})
}

const getRecentThreePurchaseRange = (now = new Date()) => {
	const current = getNowDate(now)
	const from = new Date(current.getFullYear(), current.getMonth() - 2, 1, 0, 0, 0, 0)
	return {
		dateFrom: from.getTime(),
		dateTo: current.getTime(),
		monthKey: getLocalMonthKey(from)
	}
}

const getGuaranteedPurchaseMonthRanges = (now = new Date()) => {
	const current = getNowDate(now)
	return [2, 1, 0].map(offset => {
		const month = new Date(current.getFullYear(), current.getMonth() - offset, 1, 12, 0, 0, 0)
		return getMonthRange(month.getFullYear(), month.getMonth(), {now: current})
	})
}

const normalizePurchaseRange = (range = {}, {now = new Date(), normalizeTimestamps = true} = {}) => {
	const fallback = getCurrentPurchaseRange(now)
	const rawDateFrom = toFiniteNumber(range?.dateFrom)
	const rawDateTo = toFiniteNumber(range?.dateTo)
	if (!normalizeTimestamps && rawDateFrom !== null && rawDateTo !== null) {
		return rawDateFrom <= rawDateTo ? {dateFrom: rawDateFrom, dateTo: rawDateTo} : fallback
	}

	const current = getNowDate(now)
	const fromParts = getLocalDateParts(range?.dateFrom)
	const toParts = getLocalDateParts(range?.dateTo)
	const from = createLocalDate(fromParts, 0, 0, 0, 0)
	const toDate = createLocalDate(toParts, 0, 0, 0, 0)
	const to = toDate
		&& toDate.getFullYear() === current.getFullYear()
		&& toDate.getMonth() === current.getMonth()
		&& toDate.getDate() === current.getDate()
		? current
		: createLocalDate(toParts, 23, 59, 59, 999)

	const normalized = {
		dateFrom: from ? from.getTime() : fallback.dateFrom,
		dateTo: to ? to.getTime() : fallback.dateTo
	}
	return normalized.dateFrom <= normalized.dateTo ? normalized : fallback
}

const getPurchaseMonthKeyFromTimestamp = value => {
	const number = toFiniteNumber(value)
	if (number === null) return null
	const date = new Date(number)
	if (Number.isNaN(date.getTime())) return null
	return getLocalMonthKey(date)
}

const parsePurchaseTime = value => {
	if (typeof value === 'string' && DATE_INPUT_PATTERN.test(value)) {
		const parts = getLocalDateParts(value)
		return createLocalDate(parts, 0, 0, 0, 0)?.getTime() ?? null
	}
	const time = new Date(value).getTime()
	return Number.isFinite(time) ? time : null
}

export {
	getCurrentPurchaseRange,
	getGuaranteedPurchaseMonthRanges,
	getLocalMonthKey,
	getMonthRange,
	getPreviousPurchaseMonthRange,
	getPurchaseMonthKeyFromTimestamp,
	getRecentThreePurchaseRange,
	normalizePurchaseRange,
	parsePurchaseTime
}
