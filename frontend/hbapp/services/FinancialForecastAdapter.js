import {buildFinancialForecast} from './FinancialForecastService.js'

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value))

const getPlanningItems = planningState => {
	if (Array.isArray(planningState?.planningItems)) return planningState.planningItems
	if (Array.isArray(planningState?.items)) return planningState.items
	return []
}

const getPlanningPeriod = planningState => planningState?.currentPeriod || planningState?.period || null

const getBalanceData = balanceState => balanceState?.data || null

const getBalanceUpdatedAt = balanceState => balanceState?.updatedAt || null

const isPersistentPlanningItem = item => {
	const id = String(item?.id || '')
	return Boolean(id) && !id.includes('-')
}

const shouldRequireTransactionLinkState = item => item?.status === 'pending' && isPersistentPlanningItem(item)

const getForecastTransactionLinks = planningState => {
	const links = clone(planningState?.transactionLinks || {}) || {}
	getPlanningItems(planningState).forEach(item => {
		if (!shouldRequireTransactionLinkState(item)) return
		const key = String(item.id)
		if (links[key]) return
		links[key] = {
			linkStateKnown: false,
			loading: false,
			error: null,
			linkedTransactions: [],
			linkedAmount: 0,
			remainingAmount: null
		}
	})
	return links
}

const mapForecastInput = ({
	planningState = {},
	balanceState = {},
	rangePreset = 'current-period',
	now = new Date()
} = {}) => ({
	balance: clone(getBalanceData(balanceState)),
	balanceUpdatedAt: getBalanceUpdatedAt(balanceState),
	planningItems: clone(getPlanningItems(planningState)),
	period: clone(getPlanningPeriod(planningState)),
	transactionLinks: getForecastTransactionLinks(planningState),
	rangePreset,
	now
})

const buildForecastFromStates = options => buildFinancialForecast(mapForecastInput(options))

const getMissingLinkedStateItemIds = (planningState = {}) => {
	const links = planningState.transactionLinks || {}
	return getPlanningItems(planningState)
		.filter(shouldRequireTransactionLinkState)
		.filter(item => {
			const linkState = links[String(item.id)]
			return !linkState || Boolean(linkState.error)
		})
		.map(item => String(item.id))
}

export {
	buildForecastFromStates,
	getMissingLinkedStateItemIds,
	mapForecastInput
}
