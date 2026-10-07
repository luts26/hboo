function normalizeProductText(value) {
    return String(value || '')
        .normalize('NFKC')
        .trim()
        .toLocaleLowerCase('uk-UA')
        .replace(/[‐‑‒–—−]/gu, '-')
        .replace(/[\s._,;:()[\]{}<>!?\\/|+=*#%$@~^"'`ʼ’“”«»]+/gu, ' ')
        .replace(/-+/gu, ' ')
        .replace(/\s+/gu, ' ')
        .trim();
}

function tokenizeProductText(value) {
    const normalized = normalizeProductText(value);
    if (!normalized) return [];
    return normalized.split(/\s+/u).filter(Boolean);
}

export {
    normalizeProductText,
    tokenizeProductText
};
