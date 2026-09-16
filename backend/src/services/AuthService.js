import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

import userRepository from '../repositories/UserRepository.js';
import authSessionRepository from '../repositories/AuthSessionRepository.js';

class AuthService {

    async login(username, password) {

        const user = await userRepository.findByUsername(username);

        if (!user) {
            return null;
        }

        const passwordValid = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordValid) {
            return null;
        }

        const token = crypto.randomBytes(32).toString('hex');

        const tokenHash = crypto
            .createHash('sha256')
            .update(token)
            .digest('hex');

        const expiresAt = new Date(
            Date.now() + 60 * 60 * 1000
        );

        await authSessionRepository.create(
            user.id,
            tokenHash,
            expiresAt
        );

        return {
            token,
            username: user.username,
            user: {
                id: Number(user.id),
                username: user.username
            }
        };
    }
}

export default new AuthService();
