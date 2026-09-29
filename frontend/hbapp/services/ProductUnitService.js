const MEASUREMENT_LABELS = {
	weight: 'Вага',
	volume: 'Обʼєм',
	count: 'Кількість'
}

const UNITS_BY_MEASUREMENT = {
	weight: ['g', 'kg'],
	volume: ['ml', 'l'],
	count: ['pcs']
}

const UNIT_LABELS = {
	g: 'g',
	kg: 'kg',
	ml: 'ml',
	l: 'l',
	pcs: 'pcs'
}

const normalizeSearchText = value => String(value || '')
	.trim()
	.toLocaleLowerCase('uk-UA')

const getAllowedUnits = measurementType => UNITS_BY_MEASUREMENT[measurementType] || []

const isValidMeasurementType = measurementType => Object.hasOwn(UNITS_BY_MEASUREMENT, measurementType)

const isUnitAllowed = (measurementType, unit) => getAllowedUnits(measurementType).includes(unit)

const normalizeQuantity = (quantity, unit) => {
	const amount = Number(quantity)
	if (!Number.isFinite(amount)) return null
	if (unit === 'kg') return {quantity: amount * 1000, unit: 'g'}
	if (unit === 'l') return {quantity: amount * 1000, unit: 'ml'}
	if (['g', 'ml', 'pcs'].includes(unit)) return {quantity: amount, unit}
	return null
}

const trimNumber = (value, maximumFractionDigits = 1) => {
	const number = Number(value)
	if (!Number.isFinite(number)) return ''
	return number.toLocaleString('uk-UA', {
		maximumFractionDigits,
		minimumFractionDigits: 0
	})
}

const formatNormalizedQuantity = (quantity, unit) => {
	const amount = Number(quantity)
	if (!Number.isFinite(amount)) return ''
	if (unit === 'g') {
		return amount < 1000
			? `${trimNumber(amount, 0)} g`
			: `${trimNumber(amount / 1000, 1)} kg`
	}
	if (unit === 'ml') {
		return amount < 1000
			? `${trimNumber(amount, 0)} ml`
			: `${trimNumber(amount / 1000, 1)} l`
	}
	if (unit === 'pcs') return `${trimNumber(amount, 1)} pcs`
	return ''
}

const getDisplayPriceUnit = unit => {
	if (unit === 'g') return 'kg'
	if (unit === 'ml') return 'l'
	if (unit === 'pcs') return 'pcs'
	return unit || ''
}

const getDisplayPriceMultiplier = unit => {
	if (unit === 'g' || unit === 'ml') return 1000
	if (unit === 'pcs') return 1
	return null
}

export {
	MEASUREMENT_LABELS,
	UNIT_LABELS,
	UNITS_BY_MEASUREMENT,
	formatNormalizedQuantity,
	getAllowedUnits,
	getDisplayPriceMultiplier,
	getDisplayPriceUnit,
	isUnitAllowed,
	isValidMeasurementType,
	normalizeQuantity,
	normalizeSearchText
}
