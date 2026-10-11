const escapeHtml = value => String(value ?? '')
	.replaceAll('&', '&amp;')
	.replaceAll('<', '&lt;')
	.replaceAll('>', '&gt;')
	.replaceAll('"', '&quot;')
	.replaceAll("'", '&#039;')

const getNiceChartMax = maxAmount => {
	const amount = Number(maxAmount) || 0
	if (amount <= 0) return 1
	const exponent = Math.floor(Math.log10(amount))
	const base = 10 ** exponent
	const normalized = amount / base
	const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
	return nice * base
}

const formatAxisAmount = value => {
	const amount = Number(value) || 0
	return amount.toLocaleString('uk-UA', {
		compactDisplay: 'short',
		maximumFractionDigits: amount >= 1000 ? 1 : 0,
		notation: amount >= 10000 ? 'compact' : 'standard'
	})
}

const getSelectedSeries = mode => {
	if (mode === 'income') return ['income']
	if (mode === 'both') return ['income', 'expenses']
	return ['expenses']
}

const getLineSegments = (points, key) => {
	return points.reduce((segments, point) => {
		if (point.coverage === 'missing' || point[key] === null || point[key] === undefined) return segments
		const command = `${segments.current.length ? 'L' : 'M'} ${point.x.toFixed(2)} ${point[key].toFixed(2)}`
		segments.current.push(command)
		if (!points[point.index + 1] || points[point.index + 1].coverage === 'missing' || points[point.index + 1][key] === null || points[point.index + 1][key] === undefined) {
			segments.paths.push(segments.current.join(' '))
			segments.current = []
		}
		return segments
	}, {current: [], paths: []}).paths
}

const getPointValueLabel = ({point, series, formatAmount, getSignedAmount}) => {
	if (point.coverage === 'missing') return 'Local history unavailable'
	const parts = []
	if (series.includes('income')) parts.push(`Income ${formatAmount(point.income)}`)
	if (series.includes('expenses')) parts.push(`Expenses ${formatAmount(point.expenses)}`)
	if (series.length > 1) parts.push(`Net ${getSignedAmount(point.net)}`)
	return parts.join('. ')
}

const render = ({
	rows = [],
	mode = 'both',
	activeKey = null,
	keyField = 'month',
	titleField = 'longLabel',
	targetDataAttr = 'data-home-month',
	targetClass = 'home-income-month',
	ariaLabel = 'Income and expenses',
	formatAmount = value => String(value ?? 0),
	getSignedAmount = value => `${Number(value) >= 0 ? '+' : '-'}${formatAmount(Math.abs(Number(value) || 0))}`
} = {}) => {
	const width = 640
	const height = 250
	const padding = {top: 14, right: 18, bottom: 38, left: 50}
	const plotWidth = width - padding.left - padding.right
	const plotHeight = height - padding.top - padding.bottom
	const series = getSelectedSeries(mode)
	const maxAmount = rows.reduce((max, item) => {
		if (item.coverage === 'missing') return max
		return Math.max(max, ...series.map(key => Number(item[key]) || 0))
	}, 0)
	const scaleMax = getNiceChartMax(maxAmount)
	const pointCount = Math.max(rows.length - 1, 1)
	const yFor = value => padding.top + plotHeight - ((Number(value) || 0) / scaleMax) * plotHeight
	const points = rows.map((item, index) => {
		const x = padding.left + (plotWidth * index / pointCount)
		const missing = item.coverage === 'missing'
		const values = series.map(key => Number(item[key]) || 0)
		return {
			...item,
			index,
			x,
			incomeY: missing || !series.includes('income') ? null : yFor(item.income),
			expenseY: missing || !series.includes('expenses') ? null : yFor(item.expenses),
			targetY: missing ? padding.top + plotHeight : yFor(Math.max(...values, 0))
		}
	})
	const ticks = [scaleMax, scaleMax * .75, scaleMax * .5, scaleMax * .25, 0]
	const incomePaths = series.includes('income') ? getLineSegments(points, 'incomeY') : []
	const expensePaths = series.includes('expenses') ? getLineSegments(points, 'expenseY') : []
	const axisLabels = points.map(point => {
		const axisLabel = rows.length > 16 ? String(point.label).split(' ')[0] : point.label
		return `<text class="home-line-axis-label" x="${point.x.toFixed(2)}" y="${height - 14}" text-anchor="middle">${escapeHtml(axisLabel)}</text>`
	}).join('')
	const yTicks = ticks.map(value => {
		const y = yFor(value)
		return `<g>
			<line class="home-line-grid" x1="${padding.left}" x2="${width - padding.right}" y1="${y.toFixed(2)}" y2="${y.toFixed(2)}"></line>
			<text class="home-line-y-label" x="${padding.left - 8}" y="${(y + 4).toFixed(2)}" text-anchor="end">${escapeHtml(formatAxisAmount(value))}</text>
		</g>`
	}).join('')
	const markers = points.map(point => {
		if (point.coverage === 'missing') {
			return `<circle class="home-line-marker home-line-marker-missing" cx="${point.x.toFixed(2)}" cy="${(padding.top + plotHeight).toFixed(2)}" r="4"></circle>`
		}
		const coverageClass = point.coverage === 'partial' ? ' home-line-marker-partial' : ''
		const income = series.includes('income') ? `<circle class="home-line-marker home-line-marker-income${coverageClass}" cx="${point.x.toFixed(2)}" cy="${point.incomeY.toFixed(2)}" r="4"></circle>` : ''
		const expense = series.includes('expenses') ? `<circle class="home-line-marker home-line-marker-expense${coverageClass}" cx="${point.x.toFixed(2)}" cy="${point.expenseY.toFixed(2)}" r="4"></circle>` : ''
		return `${income}${expense}`
	}).join('')
	const targets = points.map(point => {
		const key = String(point[keyField])
		const isActive = key === activeKey
		const left = (point.x / width) * 100
		const top = (point.targetY / height) * 100
		const valueLabel = getPointValueLabel({point, series, formatAmount, getSignedAmount})
		const title = point[titleField] || point.label || key
		return `<button class="${targetClass} ${targetClass}-${escapeHtml(point.coverage)} ${isActive ? 'active' : ''}" type="button" ${targetDataAttr}="${escapeHtml(key)}" aria-label="${escapeHtml(`${title}. ${valueLabel}`)}" style="left:${left.toFixed(2)}%; top:${top.toFixed(2)}%;">
			<span class="home-income-target-dot" aria-hidden="true"></span>
		</button>`
	}).join('')

	return `<div class="home-income-line-shell">
		<svg class="home-income-line-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(ariaLabel)}">
			${yTicks}
			<line class="home-line-axis" x1="${padding.left}" x2="${width - padding.right}" y1="${padding.top + plotHeight}" y2="${padding.top + plotHeight}"></line>
			${axisLabels}
			${incomePaths.map(path => `<path class="home-line-series home-line-series-income" d="${path}"></path>`).join('')}
			${expensePaths.map(path => `<path class="home-line-series home-line-series-expense" d="${path}"></path>`).join('')}
			${markers}
		</svg>
		<div class="home-income-targets">${targets}</div>
	</div>`
}

export default {render}
