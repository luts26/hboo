class BankClient {

    constructor() {
        this.token = null;
        this.requestSequence = 0;
    }

    nextRequestId() {
        this.requestSequence += 1;

        return `${Date.now().toString(36)}-${this.requestSequence}`;
    }

    logRequest(requestId, operation, method, url, attempt) {
        const springUrl = new URL(url);

        console.log(
            `[bank-client] requestId=${requestId} operation=${operation} attempt=${attempt} ${method} ${springUrl.pathname}${springUrl.search} timestamp=${new Date().toISOString()}`
        );
    }

    async login() {
        const requestId = this.nextRequestId();
        const url = `${process.env.BANK_SERVICE_URL}/api/hbv1/auth/login`;

        this.logRequest(requestId, 'spring-login', 'POST', url, 1);

        const response = await fetch(
            url,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: process.env.BANK_SERVICE_USER,
                    password: process.env.BANK_SERVICE_PASSWORD
                })
            }
        );

        if (!response.ok) {
            throw new Error(
                `Bank service login failed: ${response.status}`
            );
        }

        const data = await response.json();

        this.token = data.token;

        return this.token;
    }

    async getToken() {
        if (!this.token) {
            await this.login();
        }

        return this.token;
    }

    async isAvailable() {
        try {
            const requestId = this.nextRequestId();
            const url = `${process.env.BANK_SERVICE_URL}/api/health`;

            this.logRequest(requestId, 'spring-health', 'GET', url, 1);

            const response = await fetch(url);

            return response.ok;
        } catch (error) {
            return false;
        }
    }

    async request(url, options = {}, retry = true, context = null) {
        const requestContext = context || {
            requestId: this.nextRequestId(),
            operation: options.operation || 'spring-request',
            attempt: 1
        };
        const token = await this.getToken();
        const method = options.method || 'GET';

        this.logRequest(
            requestContext.requestId,
            requestContext.operation,
            method,
            url,
            requestContext.attempt
        );

        console.log('bankURL: ', url);

        const response = await fetch(url, {
            method,
            headers: {
                ...options.headers,
                Authorization: `Bearer_${token}`
            },
            body: options.body
        });

        if (retry && (response.status === 401 || response.status === 403)) {
            this.token = null;

            await this.login();

            return this.request(url, options, false, {
                ...requestContext,
                attempt: requestContext.attempt + 1
            });
        }

        return response;
    }

    async updateBalances(updateBankName, operation = 'balance-refresh') {

        const url = new URL(`/api/hbv2/balance/refresh/${updateBankName}`, process.env.BANK_SERVICE_URL);

        const response = await this.request(url, {
            method: 'POST',
            operation
        });

        if (!response.ok) {
            throw new Error(
                `Bank service returned ${response.status}`
            );
        }

        return response.json();
    }

    async updateMonoBalance() {

        return this.updateBalances('mono', 'mono-balance-refresh')
    }

    async updatePrivatBalance() {

        return this.updateBalances('privat', 'privat-balance-refresh')
    }

    async updateTransactions(updateBankName, operation = 'transactions-refresh') {

        const url = new URL(
            `/api/hbv2/transaction/refresh/${updateBankName}`,
            process.env.BANK_SERVICE_URL
        );

        const response = await this.request(url, {
            method: 'POST',
            operation
        });

        if (!response.ok) {
            throw new Error(
                `Bank service returned ${response.status}`
            );
        }

        return response.json();
    }

    async updateMonoTransactions() {

        return this.updateTransactions('mono', 'mono-transactions-refresh')
    }

    async updatePrivatTransactions() {

        return this.updateTransactions('privat', 'privat-transactions-refresh')
    }
}

export default new BankClient();
