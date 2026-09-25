import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.join(__dirname, '..')
const source = fs.readFileSync(path.join(frontendRoot, 'hbapp/pages/PlaningPage.js'), 'utf8')

test('Plan is the default Planning mode', () => {
	assert.match(source, /mode:\s*'plan'/)
	assert.match(source, /const mode = this\.state\.mode \|\| 'plan'/)
})

test('Planning segmented control labels the editing and analysis modes without duplicate headings', () => {
	assert.match(source, />Planning<\/button>/)
	assert.match(source, />Plan vs Fact<\/button>/)
	assert.doesNotMatch(source, /planing-list-title/)
	assert.doesNotMatch(source, /planing-fact-eyebrow/)
	assert.doesNotMatch(source, /Planning items<\/div>|<div class="planing-fact-eyebrow">Plan vs Fact<\/div>/)
})

test('Plan vs Fact mode is local read-only UI, not global navigation or store mutation', () => {
	assert.match(source, /calculatePlanVsFact\(this\.state\.summary\?\.items \|\| \[\]\)/)
	assert.match(source, /setPlanningMode\(mode = 'plan'\)/)
	assert.doesNotMatch(source, /planningStore\.setPlanningMode|planningStore\.loadPlanningItemTransactions\(.*plan-vs-fact|planningStore\.confirmSmartSuggestion\(.*plan-vs-fact/s)
	assert.doesNotMatch(source, /data-summary-nav="plan-vs-fact"|route:\s*'plan-vs-fact'|path:\s*'plan-vs-fact'/)
})

test('Plan vs Fact segmented control is keyboard accessible', () => {
	assert.match(source, /class="hboo-segmented-control planing-mode-switch" role="tablist" aria-label="Planning mode"/)
	assert.match(source, /class="hboo-segment-btn planing-mode-btn/)
	assert.match(source, /type="button" role="tab" aria-selected="\$\{mode === 'plan'\}"/)
	assert.match(source, /data-action="planning-mode" data-mode="plan-vs-fact"/)
})

test('manual completion opens actual amount dialog instead of direct completion', () => {
	assert.match(source, /if \(button\.dataset\.status === 'completed'\) return this\.openModal\('complete', itemId\)/)
	assert.match(source, /complete: 'Complete expense'/)
	assert.match(source, /getManualCompletionTemplate\(item\)/)
})

test('manual completion dialog defaults actual amount to planned amount and persists through existing update path', () => {
	assert.match(source, /: item\?\.sum/)
	assert.match(source, /name="actualAmount"/)
	assert.match(source, /await planningStore\.updatePlanningItem\(form\.dataset\.itemid, \{\s*status: 'completed',\s*actualAmount/s)
	assert.doesNotMatch(source, /confirmSmartSuggestion[\s\S]{0,500}openModal\('complete'/)
})

test('manual completion validates actual amount without converting missing value to zero', () => {
	assert.match(source, /String\(rawValue\)\.trim\(\) === ''\) return null/)
	assert.match(source, /!Number\.isFinite\(amount\) \|\| amount < 0/)
	assert.match(source, /actualAmount === null/)
})

test('Plan vs Fact item metrics use Difference terminology', () => {
	assert.match(source, /<div><span>Difference<\/span><strong>\$\{difference\}<\/strong><\/div>/)
	assert.doesNotMatch(source, /<div><span>\$\{this\.getPlanVsFactResultLabel\(item\.result\)\}<\/span><strong>\$\{difference\}<\/strong><\/div>/)
})
