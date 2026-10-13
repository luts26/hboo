const defaultEscapeHtml = value => String(value ?? '')
	.replaceAll('&', '&amp;')
	.replaceAll('<', '&lt;')
	.replaceAll('>', '&gt;')
	.replaceAll('"', '&quot;')
	.replaceAll("'", '&#039;')

const getAmount = item => Number(item.current ?? item.amount ?? 0) || 0

const render = ({
	items = [],
	total = 0,
	getCategoryDisplay,
	formatMoney,
	formatPercent,
	getChangeTemplate = () => '',
	escapeHtml = defaultEscapeHtml,
	actionDataAttr = null,
	actionTitle = 'Open transactions',
	emptyTemplate = '<div class="statistics-empty-state">No expenses in this period.</div>',
	rowClass = ''
} = {}) => {
	if (!items.length) return emptyTemplate
	const safeTotal = Number(total) || 0

	return items.map(item => {
		const category = getCategoryDisplay(item.categoryId)
		const amount = getAmount(item)
		const percentage = Number(item.percentage) || (safeTotal > 0 ? amount / safeTotal * 100 : 0)
		const width = safeTotal > 0 ? Math.min(100, Math.max(2, amount / safeTotal * 100)) : 0
		const canNavigate = actionDataAttr && String(item.categoryId) !== 'uncategorized'
		const tag = canNavigate ? 'button' : 'article'
		const actionAttrs = canNavigate
			? `type="button" ${actionDataAttr}="${escapeHtml(item.categoryId)}" title="${escapeHtml(actionTitle)}"`
			: ''

		return `<${tag} class="statistics-category-row ${rowClass} ${canNavigate ? 'statistics-category-row-action' : ''}" ${actionAttrs}>
			<div class="statistics-category-main">
				<span class="statistics-category-icon ${escapeHtml(category.icon || 'other-icon')}" aria-hidden="true"></span>
				<div>
					<strong>${escapeHtml(category.name)}</strong>
					<small>${formatPercent(percentage)} of expenses</small>
				</div>
			</div>
			<div class="statistics-category-values">
				<strong>${formatMoney(amount)}</strong>
				${getChangeTemplate(item.change)}
			</div>
			<div class="statistics-category-bar" aria-hidden="true"><span style="width:${width.toFixed(1)}%"></span></div>
		</${tag}>`
	}).join('')
}

export default {render}
