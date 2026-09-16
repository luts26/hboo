import balanceRepository from '../repositories/BalanceRepository.js';
import springBankClient from '../clients/BankClient.js';

class BalanceService {

    async getBalance(updateBalance = null) {

	    const todayMonoBalance = await balanceRepository.getTodayMonoBalance();
	    const hasTodayMonoBalance = todayMonoBalance.length > 0;

	    if (!updateBalance && hasTodayMonoBalance) {

	        return this.getLastBalances();
	    }

	    const bankServiceAvailable = await springBankClient.isAvailable();

	    if (!bankServiceAvailable) {
	        return this.getLastBalances();
	    }

	    try {
	        if (updateBalance === '1') {
	            await springBankClient.updateMonoBalance();
	        } else if (updateBalance === '2') {
	            await springBankClient.updatePrivatBalance();
	        } else if (!hasTodayMonoBalance) {
	            await springBankClient.updateMonoBalance();
	        }
	    } catch (error) {
	        console.error('Balance refresh failed:', error.message);
	    }

	    return this.getLastBalances();
	}

    async getLastBalances() {
	    return {
	        mono: await balanceRepository.getLastMonoBalance(),
	        privat: await balanceRepository.getLastPrivatBalance()
	    };
	}
}

export default new BalanceService();
