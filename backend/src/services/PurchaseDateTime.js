const PURCHASE_TIME_ZONE = 'Europe/Kyiv';
const PURCHASE_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z)?$/;

const kyivFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: PURCHASE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
});

const pad = value => String(value).padStart(2, '0');

function getKyivParts(value) {
    const date = value instanceof Date ? value : new Date(Number(value));
    if (Number.isNaN(date.getTime())) return null;
    const parts = Object.fromEntries(kyivFormatter.formatToParts(date)
        .filter(part => part.type !== 'literal')
        .map(part => [part.type, Number(part.value)]));
    return {
        year: parts.year,
        month: parts.month,
        day: parts.day,
        hour: parts.hour,
        minute: parts.minute,
        second: parts.second
    };
}

function formatPurchaseDateTimeParts(parts) {
    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

function parsePurchaseDateTime(value) {
    const match = String(value || '').trim().match(PURCHASE_DATE_TIME_PATTERN);
    if (!match) return null;
    const parts = {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
        hour: Number(match[4]),
        minute: Number(match[5]),
        second: Number(match[6])
    };
    const check = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
    if (parts.year < 1000
        || check.getUTCFullYear() !== parts.year
        || check.getUTCMonth() !== parts.month - 1
        || check.getUTCDate() !== parts.day
        || check.getUTCHours() !== parts.hour
        || check.getUTCMinutes() !== parts.minute
        || check.getUTCSeconds() !== parts.second) return null;

    // Older API responses incorrectly labelled MySQL wall time with Z. Preserve
    // their clock components so cached offline Purchases remain updateable.
    return formatPurchaseDateTimeParts(parts);
}

function formatPurchaseRangeBoundary(timestamp) {
    const parts = getKyivParts(timestamp);
    return parts ? formatPurchaseDateTimeParts(parts) : null;
}

function kyivWallTimeToTimestamp(parts) {
    let timestamp = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.millisecond || 0);
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const actual = getKyivParts(timestamp);
        const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second, parts.millisecond || 0);
        const targetAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.millisecond || 0);
        const difference = targetAsUtc - actualAsUtc;
        if (!difference) break;
        timestamp += difference;
    }
    return timestamp;
}

function getDefaultPurchaseRange(now = new Date()) {
    const current = getKyivParts(now);
    return {
        dateFrom: kyivWallTimeToTimestamp({...current, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0}),
        dateTo: kyivWallTimeToTimestamp({...current, hour: 23, minute: 59, second: 59, millisecond: 999})
    };
}

export {
    PURCHASE_TIME_ZONE,
    formatPurchaseRangeBoundary,
    getDefaultPurchaseRange,
    parsePurchaseDateTime
};
