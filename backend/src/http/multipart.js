const CRLF = Buffer.from('\r\n');
const MAX_MULTIPART_BYTES = 10 * 1024 * 1024 + 1024 * 128;

function getBoundary(contentType = '') {
    const match = String(contentType).match(/multipart\/form-data;\s*boundary=(?:"([^"]+)"|([^;]+))/i);
    return match ? (match[1] || match[2]) : null;
}

async function readMultipartForm(req, {maxBytes = MAX_MULTIPART_BYTES} = {}) {
    const boundary = getBoundary(req.headers['content-type']);
    if (!boundary) throw httpError(400, 'Expected multipart/form-data');

    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
        total += chunk.length;
        if (total > maxBytes) throw httpError(413, 'Receipt image is too large');
        chunks.push(chunk);
    }

    return parseMultipartBuffer(Buffer.concat(chunks), boundary);
}

function parseMultipartBuffer(body, boundary) {
    const delimiter = Buffer.from(`--${boundary}`);
    const parts = [];
    let offset = body.indexOf(delimiter);
    if (offset === -1) throw httpError(400, 'Invalid multipart payload');
    offset += delimiter.length;

    while (offset < body.length) {
        if (body.slice(offset, offset + 2).toString() === '--') break;
        if (body.slice(offset, offset + 2).compare(CRLF) === 0) offset += 2;

        const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'), offset);
        if (headerEnd === -1) throw httpError(400, 'Invalid multipart headers');
        const rawHeaders = body.slice(offset, headerEnd).toString('utf8');
        const nextDelimiter = body.indexOf(Buffer.from(`\r\n--${boundary}`), headerEnd + 4);
        if (nextDelimiter === -1) throw httpError(400, 'Invalid multipart boundary');

        const data = body.slice(headerEnd + 4, nextDelimiter);
        parts.push(parsePart(rawHeaders, data));
        offset = nextDelimiter + 2 + delimiter.length;
    }

    const fields = {};
    const files = {};
    for (const part of parts) {
        if (!part.name) continue;
        if (part.filename !== null) files[part.name] = part;
        else fields[part.name] = part.data.toString('utf8');
    }
    return {fields, files};
}

function parsePart(rawHeaders, data) {
    const headers = {};
    rawHeaders.split('\r\n').forEach(line => {
        const index = line.indexOf(':');
        if (index === -1) return;
        headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
    });
    const disposition = headers['content-disposition'] || '';
    const name = getDispositionValue(disposition, 'name');
    const filename = getDispositionValue(disposition, 'filename');
    return {
        name,
        filename,
        mimeType: headers['content-type'] || '',
        data,
        headers
    };
}

function getDispositionValue(disposition, key) {
    const match = disposition.match(new RegExp(`${key}="([^"]*)"`));
    return match ? match[1] : null;
}

function httpError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

export {readMultipartForm, parseMultipartBuffer};
