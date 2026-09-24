import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {
	COVERAGE_COMPLETE,
	COVERAGE_MISSING,
	COVERAGE_PARTIAL
} from '../hbapp/services/FinancialAnalyticsService.js'
import {
	getIncomeCoverageNote,
	getMonthDetailViewModel
} from '../hbapp/services/HomeAnalyticsViewModel.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(__dirname, '..')
const homeSource = () => fs.readFileSync(path.join(frontendRoot, 'hbapp/pages/HomePage.js'), 'utf8')

test('persistent month details panel is no longer rendered', () => {
	const source = homeSource()

	assert.doesNotMatch(source, /data-home-month-details/)
	assert.match(source, /data-home-month-tooltip/)
})

test('month remains an interactive focusable target', () => {
	const source = homeSource()

	assert.match(source, /<button class="home-income-month/)
	assert.match(source, /data-home-month=/)
	assert.match(source, /aria-label=/)
})

test('partial month exposes partial coverage in details', () => {
	const viewModel = getMonthDetailViewModel({
		month: '2026-09',
		longLabel: 'September 2026',
		income: 1200,
		expenses: 300,
		net: 900,
		coverage: COVERAGE_PARTIAL
	})

	assert.equal(viewModel.status, 'Partial history')
	assert.equal(viewModel.showValues, true)
})

test('missing month exposes unavailable coverage without confirmed zero values', () => {
	const viewModel = getMonthDetailViewModel({
		month: '2026-08',
		longLabel: 'August 2026',
		income: 0,
		expenses: 0,
		net: 0,
		coverage: COVERAGE_MISSING
	})

	assert.equal(viewModel.status, 'Local history unavailable')
	assert.equal(viewModel.showValues, false)
	assert.deepEqual(viewModel.rows, [])
})

test('complete month details show income expenses and net', () => {
	const viewModel = getMonthDetailViewModel({
		month: '2026-09',
		longLabel: 'September 2026',
		income: 25200,
		expenses: 11399.2,
		net: 13800.8,
		coverage: COVERAGE_COMPLETE
	})

	assert.equal(viewModel.status, '')
	assert.deepEqual(viewModel.rows.map(row => row.label), ['Income', 'Expenses', 'Net'])
})

test('global incomplete-history note appears only when required', () => {
	assert.equal(getIncomeCoverageNote([
		{coverage: COVERAGE_COMPLETE},
		{coverage: COVERAGE_PARTIAL}
	]), 'Some months have incomplete local history.')

	assert.equal(getIncomeCoverageNote([
		{coverage: COVERAGE_COMPLETE},
		{coverage: COVERAGE_COMPLETE}
	]), '')
})

test('repeated per-month coverage text is not rendered below chart labels', () => {
	const source = homeSource()

	assert.doesNotMatch(source, /<em>\$\{this\.escapeHtml\(statusLabel\)\}<\/em>/)
	assert.doesNotMatch(source, /Local history unavailable<\/em>|Partial local history<\/em>|Partial history<\/em>/)
})
