import test from 'node:test'
import assert from 'node:assert/strict'
import {deriveConnectionSyncState} from '../hbapp/services/ConnectionSyncStatus.js'
import {
	deriveSectionFreshness,
	formatFreshnessTime
} from '../hbapp/services/SectionFreshness.js'

const NOW = new Date('2026-09-22T12:00:00Z').getTime()
const minutesAgo = minutes => NOW - (minutes * 60 * 1000)
const hoursAgo = hours => NOW - (hours * 60 * 60 * 1000)

test('/balance uses BalanceStore.updatedAt for freshness', () => {
	const freshness = deriveSectionFreshness({
		route: '/balance',
		balanceState: {updatedAt: minutesAgo(4)},
		now: NOW
	})

	assert.equal(freshness.text, 'Balance updated 4 min ago')
})

test('/transaction uses TransactionStore.updatedAt for freshness', () => {
	const freshness = deriveSectionFreshness({
		route: '/transaction',
		transactionState: {updatedAt: minutesAgo(12)},
		now: NOW
	})

	assert.equal(freshness.text, 'Transactions updated 12 min ago')
})

test('/planing uses Planning server-check freshness semantics', () => {
	const freshness = deriveSectionFreshness({
		route: '/planing',
		planningState: {lastSuccessfulServerCheckAt: minutesAgo(2)},
		now: NOW
	})

	assert.equal(freshness.text, 'Planning checked 2 min ago')
})

test('Balance snapshotAt is ignored in favor of updatedAt', () => {
	const freshness = deriveSectionFreshness({
		route: '/balance',
		balanceState: {
			updatedAt: minutesAgo(25),
			data: {
				mono: [{date: Math.floor(minutesAgo(1) / 1000)}],
				privat: []
			}
		},
		now: NOW
	})

	assert.equal(freshness.text, 'Balance updated 25 min ago')
})

test('Transactions freshness uses range fetchedAt equivalent, not newest transaction date', () => {
	const freshness = deriveSectionFreshness({
		route: '/transaction',
		transactionState: {
			updatedAt: minutesAgo(3),
			data: {
				mono: [{timestamp: new Date('2026-09-20T10:00:00Z').getTime()}],
				privat: []
			}
		},
		now: NOW
	})

	assert.equal(freshness.text, 'Transactions updated 3 min ago')
})

test('global offline state and Balance freshness remain independently visible', () => {
	const globalState = deriveConnectionSyncState({
		networkState: {network: 'offline'},
		authState: {token: 'token', userId: 1, apiAuthStatus: 'authenticated'},
		planningState: {syncStatus: 'synced', dirty: false}
	})
	const freshness = deriveSectionFreshness({
		route: '/balance',
		balanceState: {updatedAt: minutesAgo(25)},
		now: NOW
	})

	assert.equal(globalState.title, 'Offline')
	assert.equal(freshness.text, 'Balance updated 25 min ago')
})

test('auth-required state and Transactions freshness remain independently visible', () => {
	const globalState = deriveConnectionSyncState({
		networkState: {network: 'online'},
		authState: {token: 'stale-token', userId: 1, apiAuthStatus: 'rejected'},
		planningState: {syncStatus: 'synced', dirty: false}
	})
	const freshness = deriveSectionFreshness({
		route: '/transaction',
		transactionState: {updatedAt: hoursAgo(3)},
		now: NOW
	})

	assert.equal(globalState.title, 'Sign in to sync')
	assert.equal(freshness.text, 'Transactions updated 3 hours ago')
})

test('route change switches section freshness without changing metadata', () => {
	const states = {
		balanceState: {updatedAt: minutesAgo(4)},
		transactionState: {updatedAt: minutesAgo(12)}
	}

	const balanceFreshness = deriveSectionFreshness({route: '/balance', ...states, now: NOW})
	const transactionFreshness = deriveSectionFreshness({route: '/transaction', ...states, now: NOW})

	assert.equal(balanceFreshness.text, 'Balance updated 4 min ago')
	assert.equal(transactionFreshness.text, 'Transactions updated 12 min ago')
})

test('public categories activity does not change section freshness', () => {
	const states = {
		route: '/balance',
		balanceState: {updatedAt: minutesAgo(4)},
		now: NOW
	}
	const before = deriveSectionFreshness(states)
	const after = deriveSectionFreshness(states)

	assert.equal(before.text, 'Balance updated 4 min ago')
	assert.equal(after.text, before.text)
})

test('missing timestamp omits route freshness instead of showing never-synced copy', () => {
	assert.equal(deriveSectionFreshness({route: '/balance', balanceState: {}, now: NOW}), null)
	assert.equal(deriveSectionFreshness({route: '/transaction', transactionState: {}, now: NOW}), null)
	assert.equal(deriveSectionFreshness({route: '/planing', planningState: {}, now: NOW}), null)
})

test('unsupported routes omit section freshness', () => {
	assert.equal(deriveSectionFreshness({route: '/home', now: NOW}), null)
	assert.equal(deriveSectionFreshness({route: '/settings', now: NOW}), null)
	assert.equal(deriveSectionFreshness({route: '/deposit', now: NOW}), null)
})

test('freshness formatter supports compact labels', () => {
	assert.equal(formatFreshnessTime(NOW, NOW), 'just now')
	assert.equal(formatFreshnessTime(minutesAgo(1), NOW), '1 min ago')
	assert.equal(formatFreshnessTime(hoursAgo(1), NOW), '1 hour ago')
	assert.match(formatFreshnessTime(hoursAgo(26), NOW), /^yesterday, /)
})
