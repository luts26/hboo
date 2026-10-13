import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(__dirname, '..')
const read = filePath => fs.readFileSync(path.join(frontendRoot, filePath), 'utf8')

class TestElement {
	constructor() {
		this.innerHTML = ''
		this.listeners = new Map()
		this.textContent = ''
		this.parentElement = {classList: {add: () => {}}}
	}

	addEventListener(type, handler) {
		this.listeners.set(type, handler)
	}

	removeEventListener(type) {
		this.listeners.delete(type)
	}

	querySelector() {
		return null
	}
}

const installDom = (search = '') => {
	const headerDate = new TestElement()
	const app = new TestElement()
	const listeners = new Map()
	globalThis.window = {
		location: {search, pathname: '/statistics'},
		history: {
			pushState: (state, title, path) => {
				const url = new URL(path, 'https://hboo.test')
				globalThis.window.location.pathname = url.pathname
				globalThis.window.location.search = url.search
				globalThis.location = globalThis.window.location
			},
			replaceState: (state, title, path) => {
				const url = new URL(path, 'https://hboo.test')
				globalThis.window.location.pathname = url.pathname
				globalThis.window.location.search = url.search
				globalThis.location = globalThis.window.location
			}
		},
		addEventListener: (type, handler) => listeners.set(type, handler),
		removeEventListener: type => listeners.delete(type),
		dispatchEvent: event => listeners.get(event.type)?.(event)
	}
	globalThis.location = globalThis.window.location
	globalThis.document = {
		querySelector: selector => {
			if (selector === '.transactions-today-date') return headerDate
			if (selector === '.transactions-today-date .time-some-time') return null
			if (selector === '.time-some-time') return new TestElement()
			return null
		},
		addEventListener: () => {},
		removeEventListener: () => {}
	}
	globalThis.localStorage = {
		getItem: () => null,
		setItem: () => {},
		removeItem: () => {}
	}
	return {app, headerDate, listeners}
}

const loadPageModules = async () => {
	await import('../hbapp/router/router.js')
	const [
		{default: TransactionLocalRepository},
		{default: PlanningLocalRepository},
		{default: StatisticsPage}
	] = await Promise.all([
		import('../hbapp/services/TransactionLocalRepository.js'),
		import('../hbapp/services/PlanningLocalRepository.js'),
		import('../hbapp/pages/StatisticsPage.js')
	])

	return {
		TransactionLocalRepository,
		PlanningLocalRepository,
		StatisticsPage
	}
}

const withStatisticsMocks = async ({
	search = '',
	transactionsCache = {data: {mono: [], privat: []}, coverage: {status: 'complete', complete: true, windows: []}},
	categories = [],
	planningState = {currentPeriod: null, items: []},
	transactionError = null,
	testBody
}) => {
	const {app, listeners} = installDom(search)
	const modules = await loadPageModules()
	const originals = {
		getRange: modules.TransactionLocalRepository.prototype.getRange,
		getPlanningState: modules.PlanningLocalRepository.prototype.getPlanningState,
		loadCategories: modules.StatisticsPage.prototype.loadCategories
	}
	const calls = {ranges: []}

	modules.TransactionLocalRepository.prototype.getRange = async range => {
		calls.ranges.push(range)
		if (transactionError) throw transactionError
		return transactionsCache
	}
	modules.PlanningLocalRepository.prototype.getPlanningState = async () => planningState
	modules.StatisticsPage.prototype.loadCategories = async () => categories

	try {
		return await testBody({app, calls, listeners, StatisticsPage: modules.StatisticsPage})
	} finally {
		modules.TransactionLocalRepository.prototype.getRange = originals.getRange
		modules.PlanningLocalRepository.prototype.getPlanningState = originals.getPlanningState
		modules.StatisticsPage.prototype.loadCategories = originals.loadCategories
	}
}

test('Statistics page is registered as a dedicated route without primary navigation item', () => {
	const router = read('hbapp/router/router.js')
	const navigation = read('hbapp/components/navigation.js')
	const header = read('hbapp/components/header.js')

	assert.match(router, /import StatisticsPage/)
	assert.match(router, /'statistics': StatisticsPage/)
	assert.doesNotMatch(navigation, /path: 'statistics', label: 'Statistics'/)
	assert.doesNotMatch(header, /route: 'statistics', label: 'Statistics'/)
})

test('Statistics page uses local repositories without transaction API refresh', () => {
	const source = read('hbapp/pages/StatisticsPage.js')

	assert.match(source, /new TransactionLocalRepository/)
	assert.match(source, /this\.transactionRepository\.getRange\(unionRange\)/)
	assert.match(source, /new PlanningLocalRepository/)
	assert.match(source, /this\.planningRepository\.getPlanningState\(\)/)
	assert.doesNotMatch(source, /TransactionApiService|transactionStore\.refresh|updateTransaction/)
})

test('Statistics page keeps purchase and planning amounts separate from bank totals', () => {
	const source = read('hbapp/pages/StatisticsPage.js')

	assert.match(source, /Planning vs Actual/)
	assert.match(source, /Planned expenses/)
	assert.match(source, /Confirmed\/linked actual/)
	assert.match(source, /Unconfirmed remaining/)
	assert.doesNotMatch(source, /PurchaseSummaryService|calculateCurrentMonthPurchaseSummary/)
})

test('Statistics page renders empty and partial local-history states', () => {
	const source = read('hbapp/pages/StatisticsPage.js')

	assert.match(source, /No local statistics yet/)
	assert.match(source, /No cached transactions for this period/)
	assert.match(source, /Analytics use local cached history/)
	assert.match(source, /getCoverageForRange/)
})

test('Statistics UI has responsive cards charts and no framework dependency', () => {
	const source = read('hbapp/pages/StatisticsPage.js')
	const css = read('hbapp/assets/styles/main.css')

	assert.match(source, /statistics-card-grid/)
	assert.match(source, /IncomeExpenseLineChart\.render/)
	assert.match(source, /AnalyticsCategoryCards\.render/)
	assert.match(source, /data-statistics-trend-chart/)
	assert.match(source, /statistics-category-row/)
	assert.match(source, /statistics-comparison-table/)
	assert.match(source, /statistics-trend-control/)
	assert.match(css, /\.statistics-trend-control\s*\{[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/)
	assert.match(css, /@media screen and \(max-width: 600px\)[\s\S]*\.statistics-card-grid\s*\{[\s\S]*grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 140px\), 1fr\)\)/)
	assert.doesNotMatch(source, /from ['"](?!\.)[^'"\n]*(?:React|Vue|Angular|Chart\.js|chart\.js)[^'"\n]*['"]/)
})

test('Statistics trend uses active marker behavior and keeps zero-value points in chart rows', () => {
	const source = read('hbapp/pages/StatisticsPage.js')
	const chart = read('hbapp/components/IncomeExpenseLineChart.js')

	assert.match(source, /markerDensity: 'none'/)
	assert.match(source, /showActivePointMarker: true/)
	assert.match(source, /trend\.items\.map/)
	assert.match(chart, /Number\(item\[key\]\) \|\| 0/)
	assert.match(chart, /getLineSegments\(points, 'incomeY'\)/)
	assert.match(chart, /getLineSegments\(points, 'expenseY'\)/)
})

test('Statistics comparison renders compact change values and mobile card labels from the same markup', async () => {
	const dateFrom = new Date(2026, 9, 1, 0, 0, 0, 0).getTime()
	const dateTo = new Date(2026, 9, 3, 23, 59, 59, 999).getTime()
	const comparisonFrom = new Date(2026, 8, 1, 0, 0, 0, 0).getTime()
	const tx = (id, timestamp, amount, categoryId) => ({providerTransactionId: id, timestamp, amount, categoryId})

	await withStatisticsMocks({
		search: `?date_from=${dateFrom}&date_to=${dateTo}`,
		categories: [
			{id: 30, name: 'Продукти та супермаркети', icon: 'food-icon'},
			{id: 40, name: 'Транспорт', icon: 'car-icon'},
			{id: 50, name: 'Медицина', icon: 'medicine-icon'}
		],
		transactionsCache: {
			data: {
				mono: [
					tx('food-prev', comparisonFrom, -410.20, 30),
					tx('food-current', dateFrom + 3600000, -2651.05, 30),
					tx('transport-prev', comparisonFrom + 3600000, -800, 40),
					tx('transport-current', dateFrom + 7200000, -690, 40),
					tx('medicine-current', dateFrom + 10800000, -780, 50)
				],
				privat: []
			},
			coverage: {status: 'complete', complete: true, windows: []}
		},
		testBody: async ({app, StatisticsPage}) => {
			const page = new StatisticsPage(app)
			await page.loadPromise

			assert.match(app.innerHTML, /statistics-comparison-category">Продукти та супермаркети/)
			assert.match(app.innerHTML, /data-label="Previous">410,20 грн/)
			assert.match(app.innerHTML, /data-label="Current">2\s651,05 грн/)
			assert.match(app.innerHTML, /\+2\s240,85 грн \(\+546,3%\)/)
			assert.match(app.innerHTML, /-110,00 грн \(-13,8%\)/)
			assert.match(app.innerHTML, /\+780,00 грн \(n\/a\)/)
			assert.equal(page.getChangeTemplate({absolute: 0, percentage: 0, direction: 'flat'}), '<small class="statistics-change-value">0,00 грн (0%)</small>')
			page.destroy()
		}
	})
})

test('Home current-period Actual Spent row is the Statistics entry point', () => {
	const summary = read('hbapp/components/FinancialSummary.js')
	const app = read('hbapp/hbapp.js')

	assert.match(summary, /financial-summary-actual-spent financial-summary-row-link/)
	assert.match(summary, /data-summary-path="\$\{statisticsPath\}"/)
	assert.match(summary, /\/statistics\?preset=current-month&date_from=\$\{Number\(range\.dateFrom\)\}&date_to=\$\{Number\(range\.dateTo\)\}/)
	assert.match(app, /data-summary-path/)
	assert.match(app, /router\.redirectRouter\(path\)/)
})

test('Statistics page keeps explicit custom date_from/date_to query params custom while loading data', async () => {
	const dateFrom = new Date(2026, 8, 1, 0, 0, 0, 0).getTime()
	const dateTo = new Date(2026, 8, 20, 23, 59, 59, 999).getTime()
	const transactionAt = new Date(2026, 8, 10, 12, 0, 0, 0).getTime()

	await withStatisticsMocks({
		search: `?date_from=${dateFrom}&date_to=${dateTo}`,
		categories: [{id: 30, name: 'Food', icon: 'food-icon'}],
		transactionsCache: {
			data: {
				mono: [{id: 'income-1', timestamp: transactionAt, amount: 12000, categoryId: 2}],
				privat: [{id: 'expense-1', timestamp: transactionAt, amount: -450, categoryId: 30}]
			},
			coverage: {
				status: 'complete',
				complete: true,
				windows: [
					{provider: 'mono', dateFrom, dateTo, complete: true},
					{provider: 'privat', dateFrom, dateTo, complete: true}
				]
			}
		},
		planningState: {
			currentPeriod: {dateFrom, dateTo, periodBudget: 20000},
			items: []
		},
		testBody: async ({app, calls, StatisticsPage}) => {
			const page = new StatisticsPage(app)
			assert.equal(typeof page.render, 'function')
			assert.equal(page.state.preset, 'custom')
			assert.deepEqual(page.state.range, {dateFrom, dateTo})
			assert.match(app.innerHTML, /Loading local statistics/)

			await page.loadPromise

			assert.equal(calls.ranges.length, 1)
			assert.equal(calls.ranges[0].dateTo, dateTo)
			assert.equal(page.state.loading, false)
			assert.equal(page.state.error, null)
			assert.match(app.innerHTML, /Financial overview/)
			assert.match(app.innerHTML, /12\s000,00 грн/)
			assert.match(app.innerHTML, /450,00 грн/)
			page.destroy()
		}
	})
})

test('Statistics page treats Home current-month navigation as active month-to-date preset', async () => {
	const now = new Date()
	const fullMonthTo = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime()
	const monthFrom = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime()

	await withStatisticsMocks({
		search: `?preset=current-month&date_from=${monthFrom}&date_to=${fullMonthTo}`,
		testBody: async ({app, StatisticsPage}) => {
			const page = new StatisticsPage(app)
			assert.equal(page.state.preset, 'current-month')
			assert.equal(page.state.range.dateFrom, monthFrom)
			assert.ok(page.state.range.dateTo <= Date.now())
			assert.match(window.location.search, /preset=current-month/)
			assert.match(window.location.search, new RegExp(`date_to=${Number(page.state.range.dateTo)}`))
			assert.doesNotMatch(window.location.search, new RegExp(`date_to=${fullMonthTo}`))
			assert.match(app.innerHTML, /data-statistics-preset="current-month">Current month/)
			assert.match(app.innerHTML, /statistics-segment-btn active" type="button" data-statistics-preset="current-month"/)

			await page.loadPromise

			assert.equal(page.state.statistics.trend.items.length, new Date().getDate())
			page.destroy()
		}
	})
})

test('Statistics page preserves explicit future custom ranges without activating current month preset', async () => {
	const now = new Date()
	const monthFrom = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime()
	const fullMonthTo = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime()

	await withStatisticsMocks({
		search: `?date_from=${monthFrom}&date_to=${fullMonthTo}`,
		testBody: async ({app, StatisticsPage}) => {
			const page = new StatisticsPage(app)
			assert.equal(page.state.preset, 'custom')
			assert.deepEqual(page.state.range, {dateFrom: monthFrom, dateTo: fullMonthTo})
			assert.doesNotMatch(app.innerHTML, /statistics-segment-btn active" type="button" data-statistics-preset="current-month"/)

			await page.loadPromise

			assert.ok(page.state.statistics.trend.items.length >= new Date().getDate())
			page.destroy()
		}
	})
})

test('Statistics page synchronizes preset selection with URL and restores state on browser history', async () => {
	const customFrom = new Date(2026, 8, 5, 0, 0, 0, 0).getTime()
	const customTo = new Date(2026, 8, 7, 23, 59, 59, 999).getTime()

	await withStatisticsMocks({
		testBody: async ({app, listeners, StatisticsPage}) => {
			const page = new StatisticsPage(app)
			await page.loadPromise

			page.setPreset('previous-month')
			await page.loadPromise
			assert.equal(page.state.preset, 'previous-month')
			assert.match(window.location.search, /preset=previous-month/)
			assert.match(app.innerHTML, /statistics-segment-btn active" type="button" data-statistics-preset="previous-month"/)

			window.location.search = `?date_from=${customFrom}&date_to=${customTo}`
			listeners.get('popstate')?.({type: 'popstate'})
			await page.loadPromise

			assert.equal(page.state.preset, 'custom')
			assert.deepEqual(page.state.range, {dateFrom: customFrom, dateTo: customTo})
			assert.doesNotMatch(app.innerHTML, /statistics-segment-btn active" type="button" data-statistics-preset="previous-month"/)
			page.destroy()
		}
	})
})

test('Statistics trend chart defaults to expenses and switches rendered series without changing period data', async () => {
	const dateFrom = new Date(2026, 9, 1, 0, 0, 0, 0).getTime()
	const dateTo = new Date(2026, 9, 3, 23, 59, 59, 999).getTime()

	await withStatisticsMocks({
		search: `?date_from=${dateFrom}&date_to=${dateTo}`,
		transactionsCache: {
			data: {
				mono: [
					{providerTransactionId: 'income-1', timestamp: new Date(2026, 9, 1, 12).getTime(), amount: 10000, categoryId: 2},
					{providerTransactionId: 'expense-1', timestamp: new Date(2026, 9, 2, 12).getTime(), amount: -50, categoryId: 30}
				],
				privat: []
			},
			coverage: {status: 'complete', complete: true, windows: []}
		},
		testBody: async ({app, StatisticsPage}) => {
			const page = new StatisticsPage(app)
			await page.loadPromise

			assert.equal(page.state.trendMode, 'expenses')
			assert.equal(page.state.statistics.trend.items.length, 3)
			assert.match(app.innerHTML, /data-statistics-trend-mode="expenses">Expenses/)
			assert.match(app.innerHTML, /home-line-series-expense/)
			assert.doesNotMatch(app.innerHTML, /home-line-series-income/)

			page.setTrendMode('income')
			assert.match(app.innerHTML, /home-line-series-income/)
			assert.doesNotMatch(app.innerHTML, /home-line-series-expense/)
			assert.equal(page.state.statistics.trend.items.length, 3)

			page.setTrendMode('both')
			assert.match(app.innerHTML, /home-line-series-income/)
			assert.match(app.innerHTML, /home-line-series-expense/)
			page.destroy()
		}
	})
})

test('Statistics page renders empty local data without crashing', async () => {
	await withStatisticsMocks({
		testBody: async ({app, StatisticsPage}) => {
			const page = new StatisticsPage(app)
			assert.ok(page.state.range.dateFrom > 0)
			assert.ok(page.state.range.dateTo >= page.state.range.dateFrom)
			await page.loadPromise

			assert.equal(page.state.loading, false)
			assert.equal(page.state.error, null)
			assert.match(app.innerHTML, /Financial overview/)
			assert.match(app.innerHTML, /No expenses in this period/)
			page.destroy()
		}
	})
})

test('Statistics page renders API/local-cache errors without unhandled rejections', async () => {
	const unhandled = []
	const onUnhandled = error => unhandled.push(error)
	process.on('unhandledRejection', onUnhandled)

	try {
		await withStatisticsMocks({
			transactionError: new Error('local read failed'),
			testBody: async ({app, StatisticsPage}) => {
				const page = new StatisticsPage(app)
				await page.loadPromise
				await new Promise(resolve => setImmediate(resolve))

				assert.equal(page.state.loading, false)
				assert.match(page.state.error.message, /local read failed/)
				assert.match(app.innerHTML, /Statistics are unavailable from local cache/)
				assert.deepEqual(unhandled, [])
				page.destroy()
			}
		})
	} finally {
		process.off('unhandledRejection', onUnhandled)
	}
})
