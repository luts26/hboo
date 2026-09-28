import test from 'node:test';
import assert from 'node:assert/strict';
import { BalanceService } from '../src/services/BalanceService.js';
import {
    normalizeMonoBalanceSnapshot,
    normalizePrivatBalanceSnapshot
} from '../src/services/BalanceSnapshotNormalizer.js';
import { parseTimestamp } from '../src/handlers/balanceHandler.js';
import { findRoute } from '../src/http/router.js';

const monoRows = [
    {id: 1, balance: 850000, credit_limit: 0, currency_code: 980, date: '1788000000', c_id: 'mono-main'},
    {id: 2, balance: 320000, credit_limit: 0, currency_code: 980, date: '1789106400', c_id: 'mono-main'},
    {id: 3, balance: 410000, credit_limit: 500000, currency_code: 980, date: '1789192800', c_id: 'mono-main'},
    {id: 4, balance: 500000, credit_limit: 500000, currency_code: 980, date: '1789279200', c_id: 'mono-main'},
    {id: 5, balance: 990000, credit_limit: 0, currency_code: 840, date: '1789365600', c_id: 'mono-usd'}
];

const privatRows = [
    {id: 10, balance: 4800, credit_limit: 0, currency: 'UAH', date: '1788000000000', account: 'privat-main'},
    {id: 11, balance: 4750, credit_limit: 0, currency: 'UAH', date: '1789106400000', account: 'privat-main'},
    {id: 12, balance: 4700, credit_limit: 0, currency: 'USD', date: '1789192800000', account: 'privat-usd'}
];

const makeRepository = () => ({
    getTodayMonoBalance: async () => [],
    getLastMonoBalance: async () => [],
    getLastPrivatBalance: async () => [],
    getMonoBalanceHistory: async () => ({
        previous: [monoRows[0]],
        rows: monoRows.slice(1)
    }),
    getPrivatBalanceHistory: async () => ({
        previous: [privatRows[0]],
        rows: privatRows.slice(1)
    })
});

const makeBankClient = calls => ({
    isAvailable: async () => {
        calls.push('isAvailable');
        return true;
    },
    updateMonoBalance: async () => calls.push('updateMonoBalance'),
    updatePrivatBalance: async () => calls.push('updatePrivatBalance')
});

test('router exposes balance history endpoint', () => {
    const matched = findRoute('GET', '/api/hbv2/balance/history');

    assert.ok(matched?.route);
});

test('Mono historical range read normalizes amounts, timestamp and states', async () => {
    const calls = [];
    const service = new BalanceService({
        repository: makeRepository(),
        bankClient: makeBankClient(calls)
    });

    const result = await service.getBalanceHistory({
        provider: 'mono',
        dateFrom: 1789000000000,
        dateTo: 1789300000000
    });

    assert.equal(result.provider, 'mono');
    assert.deepEqual(calls, []);
    assert.equal(result.snapshots.length, 4);
    assert.equal(result.snapshots[0].inRange, false);
    assert.equal(result.snapshots[1].current, 3200);
    assert.equal(result.snapshots[1].creditLimit, 0);
    assert.equal(result.snapshots[1].position, 3200);
    assert.equal(result.snapshots[1].state, 'own');
    assert.equal(result.snapshots[1].timestamp, 1789106400000);
    assert.equal(result.snapshots[2].position, -900);
    assert.equal(result.snapshots[2].state, 'credit');
    assert.equal(result.snapshots[3].position, 0);
    assert.equal(result.snapshots[3].state, 'zero');
});

test('Privat historical range read preserves sparse observations', async () => {
    const service = new BalanceService({
        repository: makeRepository(),
        bankClient: makeBankClient([])
    });

    const result = await service.getBalanceHistory({
        provider: 'privat',
        dateFrom: 1789000000000,
        dateTo: 1789300000000
    });

    assert.equal(result.provider, 'privat');
    assert.equal(result.snapshots.length, 2);
    assert.equal(result.snapshots[0].inRange, false);
    assert.equal(result.snapshots[1].current, 4750);
    assert.equal(result.snapshots[1].creditLimit, 0);
    assert.equal(result.snapshots[1].position, 4750);
    assert.equal(result.snapshots[1].timestamp, 1789106400000);
});

test('normalizers exclude non-UAH history rows', () => {
    assert.equal(normalizeMonoBalanceSnapshot(monoRows[4]), null);
    assert.equal(normalizePrivatBalanceSnapshot(privatRows[2]), null);
});

test('history uses credit_limit from the same historical row', () => {
    const snapshot = normalizeMonoBalanceSnapshot({
        id: 30,
        balance: 410000,
        credit_limit: 500000,
        currency_code: 980,
        date: '1789192800',
        c_id: 'mono-main'
    });

    assert.equal(snapshot.position, -900);
});

test('unsupported provider is rejected before repository access', async () => {
    const service = new BalanceService({
        repository: makeRepository(),
        bankClient: makeBankClient([])
    });

    await assert.rejects(
        () => service.getBalanceHistory({provider: 'overall', dateFrom: 1, dateTo: 2}),
        /Unsupported balance provider/
    );
});

test('date range validation accepts positive numeric timestamps only', () => {
    assert.equal(parseTimestamp('1789106400000'), 1789106400000);
    assert.equal(parseTimestamp('0'), null);
    assert.equal(parseTimestamp('-1'), null);
    assert.equal(parseTimestamp('not-a-date'), null);
});

test('missing dates are not generated as zero snapshots', async () => {
    const service = new BalanceService({
        repository: makeRepository(),
        bankClient: makeBankClient([])
    });

    const result = await service.getBalanceHistory({
        provider: 'privat',
        dateFrom: 1789000000000,
        dateTo: 1789300000000
    });

    assert.deepEqual(result.snapshots.map(snapshot => snapshot.timestamp), [
        1788000000000,
        1789106400000
    ]);
    assert.equal(result.snapshots.some(snapshot => snapshot.position === 0), false);
});
