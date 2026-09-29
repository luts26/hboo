import {calculateCurrentMonthPurchaseSummary} from '../services/PurchaseSummaryService.js'

const formatAmount = value => {
	const num = Number(value) || 0
	const absValue = Math.abs(num).toFixed(2)
	const parts = absValue.split('.')
	const intPart = parts[0].split('').reverse().map((item, index) => {
		return index && index % 3 === 0 ? `${item} ` : item
	}).reverse().join('')
	return `${num < 0 ? '-' : ''}${intPart}${parts[1] ? `.${parts[1]}` : ''}`
}

export default class PurchaseSummary {
	constructor(root) {
		this.root = root
	}

	render(viewModel = {}) {
		if (!this.root) return
		const summary = viewModel.summary || calculateCurrentMonthPurchaseSummary(viewModel)
		const hasPurchases = summary.purchaseCount > 0
		const categoriesHtml = summary.topCategories.map(category => `
			<div class="financial-summary-row purchase-summary-category-row">
				<span>${this.escapeHtml(category.name)}</span>
				<strong>${formatAmount(category.total)} грн</strong>
			</div>
		`).join('')

		this.root.innerHTML = `<button class="financial-summary-card financial-summary-link financial-summary-compact purchase-summary-card" type="button" data-summary-nav="purchases" title="Open purchases">
			<div class="financial-summary-title financial-summary-title-link">
				<span>Purchases</span>
				<span aria-hidden="true">&#8250;</span>
			</div>
			<div class="summary-card-content">
				${hasPurchases ? `
					<div class="purchase-summary-overview">
						<div class="purchase-summary-overview-main">
							<div class="financial-summary-period-label">${this.escapeHtml(summary.period.label)}</div>
							<div class="purchase-summary-count">${summary.purchaseCount} ${summary.purchaseCount === 1 ? 'purchase' : 'purchases'}</div>
						</div>
						<div class="purchase-summary-total">${formatAmount(summary.total)} <span class="amount-currency">грн</span></div>
					</div>
					${categoriesHtml ? `
						<div class="financial-summary-secondary purchase-summary-categories">
							<div class="purchase-summary-section-title">Top categories</div>
							${categoriesHtml}
						</div>
					` : ''}
				` : `
					<div class="purchase-summary-empty-title">No purchases yet</div>
					<div class="purchase-summary-empty-copy">Add purchases to see product spending insights.</div>
				`}
			</div>
		</button>`
	}

	escapeHtml(value = '') {
		return String(value)
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#039;')
	}
}
