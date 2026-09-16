import crypto from 'node:crypto';
import authSessionRepository from '../repositories/AuthSessionRepository.js';

export default async function authenticate(req) {

    const authorization = req.headers.authorization;

    if (!authorization) {
        return null;
    }

    const [type, token] = authorization.split(' ');

    if (type !== 'Bearer' || !token) {
        return null;
    }

    const tokenHash = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

    const session =
        await authSessionRepository.findByTokenHash(tokenHash);

    return session;
}
