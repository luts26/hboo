import test from 'node:test'
import assert from 'node:assert/strict'

const {
	normalizeApiBalanceSnapshot,
	normalizeBalanceSnapshot
} = await import('../hbapp/services/BalanceSnapshotNormalizer.js')

test('Mono history normalization uses cents and seconds', () => {
	const snapshot = normalizeBalanceSnapshot('mono', {
		id: 1,
		c_id: 'mono-main',
		balance: 410000,
		credit_limit: 500000,
		currency_code: 980,
		date: '1789192800'
	}, {userKey: '1'})

	assert.equal(snapshot.current, 4100)
	assert.equal(snapshot.creditLimit, 5000)
	assert.equal(snapshot.position, -900)
	assert.equal(snapshot.state, 'credit')
	assert.equal(snapshot.timestamp, 1789192800000)
	assert.equal(snapshot.accountId, '1:mono-main')
})

test('Privat history normalization keeps raw amount and milliseconds', () => {
	const snapshot = normalizeBalanceSnapshot('privat', {
		id: 2,
		account: 'privat-main',
		balance: 12450,
		credit_limit: 0,
		currency: 'UAH',
		date: '1789192800000'
	}, {userKey: '1'})

	assert.equal(snapshot.current, 12450)
	assert.equal(snapshot.creditLimit, 0)
	assert.equal(snapshot.position, 12450)
	assert.equal(snapshot.state, 'own')
	assert.equal(snapshot.timestamp, 1789192800000)
})

test('zero position is neutral boundary and non-UAH rows are excluded', () => {
	const zero = normalizeBalanceSnapshot('mono', {
		id: 3,
		c_id: 'mono-main',
		balance: 500000,
		credit_limit: 500000,
		currency_code: 980,
		date: '1789192800'
	})

	assert.equal(zero.position, 0)
	assert.equal(zero.state, 'zero')
	assert.equal(normalizeBalanceSnapshot('mono', {...zero.raw, currency_code: 840}), null)
	assert.equal(normalizeBalanceSnapshot('privat', {
		id: 4,
		account: 'privat-usd',
		balance: 10,
		credit_limit: 0,
		currency: 'USD',
		date: '1789192800000'
	}), null)
})

test('API snapshots are normalized into user-scoped history records', () => {
	const snapshot = normalizeApiBalanceSnapshot({
		id: 'mono:mono-main:1789192800000:1',
		provider: 'mono',
		accountId: 'mono-main',
		timestamp: 1789192800000,
		current: 5000,
		creditLimit: 5000,
		position: 0,
		state: 'zero',
		inRange: false
	}, {userKey: '7', fetchedAt: 111})

	assert.equal(snapshot.accountId, '7:mono-main')
	assert.equal(snapshot.providerAccountId, 'mono-main')
	assert.equal(snapshot.id, '7:mono:mono-main:1789192800000:1')
	assert.equal(snapshot.sourceSnapshotId, 'mono:mono-main:1789192800000:1')
	assert.equal(snapshot.state, 'zero')
	assert.equal(snapshot.inRange, false)
	assert.equal(snapshot.fetchedAt, 111)
})
