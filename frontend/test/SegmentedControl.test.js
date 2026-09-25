import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(__dirname, '..')
const read = filePath => fs.readFileSync(path.join(frontendRoot, filePath), 'utf8')

test('Planning and Home reuse shared neumorphic segmented control classes', () => {
	const planningSource = read('hbapp/pages/PlaningPage.js')
	const homeSource = read('hbapp/pages/HomePage.js')

	assert.match(planningSource, /hboo-segmented-control planing-mode-switch/)
	assert.match(planningSource, /hboo-segment-btn planing-mode-btn/)
	assert.match(homeSource, /hboo-segmented-control home-segmented-control/)
	assert.match(homeSource, /hboo-segment-btn home-segment-btn/)
})

test('segmented control has active hover focus and pressed styles without flat blue fill', () => {
	const cssSource = read('hbapp/assets/styles/main.css')

	assert.match(cssSource, /\.hboo-segmented-control\s*\{[\s\S]*box-shadow: var\(--hboo-shadow-segment-inset\)/)
	assert.match(cssSource, /\.hboo-segment-btn\.active\s*\{[\s\S]*box-shadow: var\(--hboo-shadow-control\)/)
	assert.match(cssSource, /\.hboo-segment-btn:focus-visible/)
	assert.match(cssSource, /\.hboo-segment-btn:active/)
	assert.doesNotMatch(cssSource, /\.home-segment-btn\.active\s*\{[\s\S]*background: #3498db/)
	assert.doesNotMatch(cssSource, /\.planing-mode-btn\.active\s*\{[\s\S]*background: #3498db/)
})

test('Home range switch keeps existing business hook and active state', () => {
	const homeSource = read('hbapp/pages/HomePage.js')

	assert.match(homeSource, /data-home-income-period="6"/)
	assert.match(homeSource, /data-home-income-period="12"/)
	assert.match(homeSource, /button\.classList\.toggle\('active', Number\(button\.dataset\.homeIncomePeriod\) === this\.incomePeriodMonths\)/)
})

test('segmented controls keep compact mobile behavior without separate business logic', () => {
	const cssSource = read('hbapp/assets/styles/main.css')
	const planningSource = read('hbapp/pages/PlaningPage.js')
	const homeSource = read('hbapp/pages/HomePage.js')

	assert.match(cssSource, /@media screen and \(max-width: 600px\)[\s\S]*\.planing-mode-switch\s*\{[\s\S]*width: 100%;/)
	assert.doesNotMatch(planningSource, /matchMedia|innerWidth|mobile.*plan-vs-fact/i)
	assert.doesNotMatch(homeSource, /matchMedia|innerWidth|mobile.*home-income-period/i)
})
