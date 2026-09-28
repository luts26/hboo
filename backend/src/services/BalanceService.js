import balanceRepository from '../repositories/BalanceRepository.js';
import springBankClient from '../clients/BankClient.js';
import { normalizeBalanceSnapshot } from './BalanceSnapshotNormalizer.js';

class BalanceService {
    constructor({repository = balanceRepository, bankClient = springBankClient} = {}) {
        this.balanceRepository = repository;
        this.bankClient = bankClient;
    }

    async getBalance(updateBalance = null) {

	    const todayMonoBalance = await this.balanceRepository.getTodayMonoBalance();
	    const hasTodayMonoBalance = todayMonoBalance.length > 0;

	    if (!updateBalance && hasTodayMonoBalance) {

	        return this.getLastBalances();
	    }

	    const bankServiceAvailable = await this.bankClient.isAvailable();

	    if (!bankServiceAvailable) {
	        return this.getLastBalances();
	    }

	    try {
	        if (updateBalance === '1') {
	            await this.bankClient.updateMonoBalance();
	        } else if (updateBalance === '2') {
	            await this.bankClient.updatePrivatBalance();
	        } else if (!hasTodayMonoBalance) {
	            await this.bankClient.updateMonoBalance();
	        }
	    } catch (error) {
	        console.error('Balance refresh failed:', error.message);
	    }

	    return this.getLastBalances();
	}

    async getLastBalances() {
	    return {
	        mono: await this.balanceRepository.getLastMonoBalance(),
	        privat: await this.balanceRepository.getLastPrivatBalance()
	    };
	}

    async getBalanceHistory({provider, dateFrom, dateTo}) {
        const repositoryMethod = provider === 'mono'
            ? 'getMonoBalanceHistory'
            : provider === 'privat'
                ? 'getPrivatBalanceHistory'
                : null;

        if (!repositoryMethod) {
            const error = new Error('Unsupported balance provider');
            error.statusCode = 400;
            throw error;
        }

        const result = await this.balanceRepository[repositoryMethod]({dateFrom, dateTo});
        const previous = (result.previous || [])
            .map(row => normalizeBalanceSnapshot(provider, row, {inRange: false}))
            .filter(Boolean);
        const rows = (result.rows || [])
            .map(row => normalizeBalanceSnapshot(provider, row, {inRange: true}))
            .filter(Boolean);

        return {
            provider,
            dateFrom,
            dateTo,
            snapshots: [...previous, ...rows]
        };
    }
}

export { BalanceService };
export default new BalanceService();
