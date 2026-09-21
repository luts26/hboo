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

const isSameLocalDay = (parts, date) => {
	return Boolean(parts)
		&& parts.year === date.getFullYear()
		&& parts.monthIndex === date.getMonth()
		&& parts.day === date.getDate()
}

const getDefaultTransactionRange = (now = new Date()) => {
	const current = getNowDate(now)
	const from = new Date(current.getFullYear(), current.getMonth(), 1, 0, 0, 0, 0)
	return {
		dateFrom: from.getTime(),
		dateTo: current.getTime()
	}
}

const normalizeTransactionRange = (range = {}, {now = new Date(), normalizeTimestamps = true} = {}) => {
	const fallback = getDefaultTransactionRange(now)
	const current = getNowDate(now)
	const rawDateFrom = toFiniteNumber(range?.dateFrom)
	const rawDateTo = toFiniteNumber(range?.dateTo)
	if (!normalizeTimestamps && rawDateFrom !== null && rawDateTo !== null) {
		return rawDateFrom <= rawDateTo ? {dateFrom: rawDateFrom, dateTo: rawDateTo} : fallback
	}

	const fromParts = getLocalDateParts(range?.dateFrom)
	const toParts = getLocalDateParts(range?.dateTo)
	const from = createLocalDate(fromParts, 0, 0, 0, 0)
	const to = isSameLocalDay(toParts, current)
		? current
		: createLocalDate(toParts, 23, 59, 59, 999)

	const normalized = {
		dateFrom: from ? from.getTime() : fallback.dateFrom,
		dateTo: to ? to.getTime() : fallback.dateTo
	}

	return normalized.dateFrom <= normalized.dateTo ? normalized : fallback
}

const normalizeTransactionDateSelection = ({from, to} = {}, {now = new Date()} = {}) => {
	return normalizeTransactionRange({dateFrom: from, dateTo: to}, {now})
}

const getDateInputValue = value => {
	const number = toFiniteNumber(value)
	if (number === null) return ''
	const date = new Date(number)
	if (Number.isNaN(date.getTime())) return ''
	return [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, '0'),
		String(date.getDate()).padStart(2, '0')
	].join('-')
}

const getDateSelectionFromRange = range => {
	const from = getDateInputValue(range?.dateFrom)
	const to = getDateInputValue(range?.dateTo)
	return from && to ? {from, to} : null
}

export {
	getDateInputValue,
	getDateSelectionFromRange,
	getDefaultTransactionRange,
	normalizeTransactionDateSelection,
	normalizeTransactionRange
}
