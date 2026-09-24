import {
	COVERAGE_COMPLETE,
	COVERAGE_MISSING
} from './FinancialAnalyticsService.js'

const getIncomeCoverageNote = monthlyItems => {
	const items = Array.isArray(monthlyItems) ? monthlyItems : []
	return items.some(item => item.coverage !== COVERAGE_COMPLETE)
		? 'Some months have incomplete local history.'
		: ''
}

const getMonthDetailViewModel = item => {
	if (!item) return null
	if (item.coverage === COVERAGE_MISSING) {
		return {
			month: item.month,
			title: item.longLabel,
			coverage: item.coverage,
			status: 'Local history unavailable',
			showValues: false,
			rows: []
		}
	}

	return {
		month: item.month,
		title: item.longLabel,
		coverage: item.coverage,
		status: item.coverage === COVERAGE_COMPLETE ? '' : 'Partial history',
		showValues: true,
		rows: [
			{label: 'Income', value: item.income, tone: 'success'},
			{label: 'Expenses', value: item.expenses, tone: 'error'},
			{label: 'Net', value: item.net, tone: item.net >= 0 ? 'success' : 'error', signed: true}
		]
	}
}

export {
	getIncomeCoverageNote,
	getMonthDetailViewModel
}
