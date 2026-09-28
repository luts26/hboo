const UAH_NUMERIC_CODE = 980;

const toNumber = value => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
};

const getPositionState = position => {
    if (position > 0) return 'own';
    if (position < 0) return 'credit';
    return 'zero';
};

const getMonoAccountId = row => String(row.c_id || row.iban || row.send_id || row.id || 'default');

const getPrivatAccountId = row => String(row.account || row.card_number || row.id || 'default');

const getSnapshotId = (provider, row, accountId, timestamp) => {
    const sourceId = row.id === undefined || row.id === null ? 'unknown' : String(row.id);
    return `${provider}:${accountId}:${timestamp}:${sourceId}`;
};

const isUahMonoRow = row => toNumber(row.currency_code) === UAH_NUMERIC_CODE;

const isUahPrivatRow = row => {
    const currency = String(row.currency || '').trim().toUpperCase();
    return currency === 'UAH' || currency === String(UAH_NUMERIC_CODE);
};

const normalizeMonoBalanceSnapshot = (row = {}, {inRange = true} = {}) => {
    if (!isUahMonoRow(row)) return null;

    const timestamp = toNumber(row.date) * 1000;
    if (timestamp <= 0) return null;

    const current = toNumber(row.balance) / 100;
    const creditLimit = toNumber(row.credit_limit) / 100;
    const position = current - creditLimit;
    const accountId = getMonoAccountId(row);

    return {
        id: getSnapshotId('mono', row, accountId, timestamp),
        provider: 'mono',
        accountId,
        currency: 'UAH',
        timestamp,
        current,
        creditLimit,
        position,
        state: getPositionState(position),
        observed: true,
        inRange,
        sourceId: row.id === undefined || row.id === null ? null : String(row.id)
    };
};

const normalizePrivatBalanceSnapshot = (row = {}, {inRange = true} = {}) => {
    if (!isUahPrivatRow(row)) return null;

    const timestamp = toNumber(row.date);
    if (timestamp <= 0) return null;

    const current = toNumber(row.balance);
    const creditLimit = toNumber(row.credit_limit);
    const position = current - creditLimit;
    const accountId = getPrivatAccountId(row);

    return {
        id: getSnapshotId('privat', row, accountId, timestamp),
        provider: 'privat',
        accountId,
        currency: 'UAH',
        timestamp,
        current,
        creditLimit,
        position,
        state: getPositionState(position),
        observed: true,
        inRange,
        sourceId: row.id === undefined || row.id === null ? null : String(row.id)
    };
};

const normalizeBalanceSnapshot = (provider, row, options = {}) => {
    if (provider === 'mono') return normalizeMonoBalanceSnapshot(row, options);
    if (provider === 'privat') return normalizePrivatBalanceSnapshot(row, options);
    return null;
};

export {
    getPositionState,
    normalizeBalanceSnapshot,
    normalizeMonoBalanceSnapshot,
    normalizePrivatBalanceSnapshot,
    toNumber
};
