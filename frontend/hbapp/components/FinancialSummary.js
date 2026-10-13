import {normalizeBalance, startOfDay, endOfDay} from '../services/PlanningCalculator.js'
import {getCurrentMonthRange, getFinancialTotals} from '../services/FinancialAnalyticsService.js'

const formatAmount = value => {
	if (value === null || value === undefined) return '-'
	const num = Number(value) || 0
	const absValue = Math.abs(num).toFixed(2)
	const parts = absValue.split('.')
	const intPart = parts[0].split('').reverse().map((item, index) => {
		return index && index % 3 === 0 ? `${item} ` : item
	}).reverse().join('')
	return `${num < 0 ? '-' : ''}${intPart}${parts[1] ? `.${parts[1]}` : ''}`
}

const addZero = num => num < 10 ? `0${num}` : num

const formatDate = value => {
	if (!value) return '-'
	const date = new Date(Number(value))
	return `${addZero(date.getDate())}.${addZero(date.getMonth() + 1)}.${date.getFullYear()}`
}

const getMonthPeriod = () => {
	const now = new Date()
	const from = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1))
	const to = now.getTime()
	return {
		from,
		to,
		label: `${formatDate(from)} - ${formatDate(to)}`
	}
}

const getTransactionMonthSummary = transactions => {
	const period = getMonthPeriod()
	const summary = getFinancialTotals(transactions, {
		dateFrom: period.from,
		dateTo: period.to
	})

	return {
		income: summary.income,
		expenses: summary.expenses,
		net: summary.net,
		periodLabel: period.label
	}
}

const getStatisticsCurrentMonthPath = () => {
	const range = getCurrentMonthRange()
	return `/statistics?preset=current-month&date_from=${Number(range.dateFrom)}&date_to=${Number(range.dateTo)}`
}

export default class FinancialSummary {

	constructor(root) {
		this.root = root
	}

	render(viewModel) {
		if (!this.root) return
		const data = viewModel || {}
		const amountClass = value => {
			if (value === null || value === undefined) return ''
			return Number(value) >= 0 ? 'success-text' : 'error-text'
		}
		const remainingClass = amountClass(data.remainingBudget)
		const availableTodayClass = amountClass(data.availableToday)
		const loadingHtml = data.status === 'loading' ? '<div class="financial-summary-status">Loading...</div>' : ''
		const money = value => value === null || value === undefined ? '-' : `${formatAmount(value)} грн`
		const moneyHtml = value => value === null || value === undefined
			? '-'
			: `${formatAmount(value)} <span class="amount-currency">грн</span>`
		const periodBudget = data.isBudgetConfigured ? money(data.periodBudget) : 'Не задано'
		const dependentMoney = value => data.isBudgetConfigured ? money(value) : '-'
		const dependentMoneyHtml = value => data.isBudgetConfigured ? moneyHtml(value) : '-'
		const statisticsPath = getStatisticsCurrentMonthPath()
		const balance = normalizeBalance(data.balanceState?.data)
		const transactions = getTransactionMonthSummary(data.transactionState?.data)
		const statusStats = data.planningStatusStats || {}
		const getPlanningStat = status => statusStats[status] || {count: 0, amount: 0}
		const planningStatRow = (label, status, extraClass = '') => {
			const stat = getPlanningStat(status)
			return `<div class="financial-summary-row financial-summary-stat-row ${extraClass}">
				<span>${label}</span>
				<em>(${Number(stat.count) || 0})</em>
				<strong>${money(stat.amount)}</strong>
			</div>`
		}

		this.root.innerHTML = `
			<div class="financial-summary">
				${loadingHtml}
				<div class="financial-summary-card financial-summary-kpi">
					<div class="financial-summary-title">Available today</div>
					<div class="summary-card-content">
						<div class="financial-summary-kpi-value ${availableTodayClass}">${dependentMoneyHtml(data.availableToday)}</div>
						<div class="financial-summary-secondary">
							<div class="financial-summary-row">
								<span>Recommended limit</span>
								<strong>${dependentMoney(data.recommendedDailyLimit)}</strong>
							</div>
							<div class="financial-summary-row">
								<span>Spent today</span>
								<strong>${money(data.todaySpent)}</strong>
							</div>
						</div>
						<div class="financial-summary-secondary financial-summary-date-group">
							<div class="financial-summary-row">
								<span>Days left</span>
								<strong>${Number(data.daysLeft) || 0}</strong>
							</div>
							<div class="financial-summary-row">
								<span>Until</span>
								<strong>${formatDate(data.targetDate)}</strong>
							</div>
						</div>
						<button class="financial-summary-row financial-summary-forecast-link financial-summary-row-link" type="button" data-summary-nav="forecast" title="View financial forecast">
							<span>View financial forecast</span>
							<strong aria-hidden="true">&#8250;</strong>
						</button>
					</div>
				</div>
				<div class="financial-summary-card financial-summary-planning">
					<button class="financial-summary-title financial-summary-title-link financial-summary-title-button" type="button" data-summary-nav="planing" title="Open planning">
						<span>Planning</span>
						<span aria-hidden="true">&#8250;</span>
					</button>
					<div class="summary-card-content">
						${planningStatRow('pending', 'pending', 'financial-summary-stat-pending')}
						${planningStatRow('completed', 'completed', 'financial-summary-stat-approve')}
						${planningStatRow('cancelled', 'cancelled', 'financial-summary-stat-disable')}
						<button class="financial-summary-row financial-summary-actual-spent financial-summary-row-link" type="button" data-summary-path="${statisticsPath}" title="Open statistics for this period">
							<span>Actual Spent</span>
							<strong>${money(data.actualSpent)}</strong>
						</button>
						<div class="financial-summary-secondary financial-summary-budget-group">
							<div class="financial-summary-row">
								<span>Budget</span>
								<strong>${periodBudget}</strong>
							</div>
							<div class="financial-summary-row">
								<span>Free</span>
								<strong class="${remainingClass}">${dependentMoney(data.remainingBudget)}</strong>
							</div>
						</div>
					</div>
				</div>
				<button class="financial-summary-card financial-summary-link financial-summary-compact" type="button" data-summary-nav="balance" title="Open balance">
					<div class="financial-summary-title financial-summary-title-link">
						<span>Balance</span>
						<span aria-hidden="true">&#8250;</span>
					</div>
					<div class="summary-card-content">
						<div class="financial-summary-compact-value">${money(balance.current)}</div>
						<div class="financial-summary-secondary">
							<div class="financial-summary-row">
								<span>Monobank</span>
								<strong>${money(balance.accounts.mono.current)}</strong>
							</div>
							<div class="financial-summary-row">
								<span>PrivatBank</span>
								<strong>${money(balance.accounts.privat.current)}</strong>
							</div>
						</div>
					</div>
				</button>
				<button class="financial-summary-card financial-summary-link financial-summary-compact" type="button" data-summary-nav="transaction" title="Open transactions">
					<div class="financial-summary-title financial-summary-title-link">
						<span>Transactions</span>
						<span aria-hidden="true">&#8250;</span>
					</div>
					<div class="summary-card-content">
						<div class="financial-summary-period-label">${transactions.periodLabel}</div>
						<div class="financial-summary-secondary">
							<div class="financial-summary-row">
								<span>Income</span>
								<strong class="success-text">+${formatAmount(transactions.income)} грн</strong>
							</div>
							<div class="financial-summary-row">
								<span>Expenses</span>
								<strong class="error-text">-${formatAmount(transactions.expenses)} грн</strong>
							</div>
							<div class="financial-summary-row financial-summary-stat-total">
								<span>Net</span>
								<strong class="${amountClass(transactions.net)}">${transactions.net >= 0 ? '+' : ''}${formatAmount(transactions.net)} грн</strong>
							</div>
						</div>
					</div>
				</button>
			</div>`
	}
}
