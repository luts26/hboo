const MEASUREMENT_TYPES = ['weight', 'volume', 'count'];

const UNITS_BY_MEASUREMENT = {
    weight: ['g', 'kg'],
    volume: ['ml', 'l'],
    count: ['pcs']
};

const NORMALIZED_UNIT_BY_MEASUREMENT = {
    weight: 'g',
    volume: 'ml',
    count: 'pcs'
};

function getAllowedUnits(measurementType) {
    return UNITS_BY_MEASUREMENT[measurementType] || [];
}

function isValidMeasurementType(measurementType) {
    return MEASUREMENT_TYPES.includes(measurementType);
}

function isUnitAllowed(measurementType, unit) {
    return getAllowedUnits(measurementType).includes(unit);
}

function normalizeQuantity(quantity, unit) {
    const amount = Number(quantity);
    if (!Number.isFinite(amount)) return null;

    if (unit === 'kg') return {quantity: amount * 1000, unit: 'g'};
    if (unit === 'l') return {quantity: amount * 1000, unit: 'ml'};
    if (['g', 'ml', 'pcs'].includes(unit)) return {quantity: amount, unit};

    return null;
}

function getNormalizedUnit(measurementType) {
    return NORMALIZED_UNIT_BY_MEASUREMENT[measurementType] || null;
}

export {
    MEASUREMENT_TYPES,
    UNITS_BY_MEASUREMENT,
    getAllowedUnits,
    getNormalizedUnit,
    isUnitAllowed,
    isValidMeasurementType,
    normalizeQuantity
};
