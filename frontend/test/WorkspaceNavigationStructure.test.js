import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(__dirname, '..')

const read = filePath => fs.readFileSync(path.join(frontendRoot, filePath), 'utf8')

test('sidebar does not render a separate conventional navigation block', () => {
	const sidebarSource = read('hbapp/components/sidebar.js')
	const appSource = read('hbapp/hbapp.js')

	assert.doesNotMatch(sidebarSource, /app-navigation-slot/)
	assert.doesNotMatch(appSource, /navigation\.setNavigation/)
})

test('financial summary cards remain the primary workspace navigation targets', () => {
	const summarySource = read('hbapp/components/FinancialSummary.js')
	const targets = Array.from(summarySource.matchAll(/data-summary-nav="([^"]+)"/g), match => match[1])

	assert.deepEqual(targets.sort(), ['balance', 'planing', 'transaction'])
})

test('active workspace state does not use an experimental shared silhouette', () => {
	const cssSource = read('hbapp/assets/styles/main.css')
	const appSource = read('hbapp/hbapp.js')

	assert.match(cssSource, /\.financial-summary-link-active/)
	assert.doesNotMatch(cssSource, /\.app-layout::before/)
	assert.doesNotMatch(cssSource, /workspace-connected-surface/)
	assert.doesNotMatch(cssSource, /\.financial-summary-link-active::before\s*\{/)
	assert.doesNotMatch(appSource, /getBoundingClientRect/)
	assert.doesNotMatch(appSource, /updateWorkspaceSilhouette/)
})
