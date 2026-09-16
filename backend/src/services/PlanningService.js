import planningRepository from '../repositories/PlanningRepository.js';
import transactionRepository from '../repositories/TransactionRepository.js';

const STATUSES = ['pending', 'completed', 'cancelled'];

class PlanningService {

    async createPeriod(userId, data) {
        const period = {
            startDate: this.requireDate(data.start_date, 'start_date'),
            endDate: this.requireDate(data.end_date, 'end_date'),
            budgetAmount: this.requireAmount(data.budget_amount, 'budget_amount')
        };

        if (period.startDate > period.endDate) {
            throw this.validationError('start_date must be before or equal to end_date');
        }

        return this.formatPeriod(
            await planningRepository.createPeriod(userId, period)
        );
    }

    async getPeriod(userId, periodId) {
        const period = await planningRepository.findPeriodById(
            userId,
            this.requireId(periodId, 'period id')
        );

        return period ? this.formatPeriod(period) : null;
    }

    async getCurrentPeriod(userId) {
        const period = await planningRepository.findCurrentPeriod(
            userId,
            this.today()
        );

        return period ? this.formatPeriod(period) : null;
    }

    async updatePeriod(userId, periodId, data) {
        const id = this.requireId(periodId, 'period id');
        const currentPeriod = await planningRepository.findPeriodById(userId, id);

        if (!currentPeriod) {
            return null;
        }
        const startDate = data.start_date ?? data.startDate;
        const endDate = data.end_date ?? data.endDate;
        const budgetAmount = data.budget_amount ?? data.budgetAmount;

        const period = {
            startDate: startDate !== undefined
                ? this.requireDate(startDate, 'start_date')
                : this.formatDate(currentPeriod.startDate),
            endDate: endDate !== undefined
                ? this.requireDate(endDate, 'end_date')
                : this.formatDate(currentPeriod.endDate),
            budgetAmount: budgetAmount !== undefined
                ? this.requireAmount(budgetAmount, 'budget_amount')
                : this.toMoney(currentPeriod.budgetAmount)
        };

        if (period.startDate > period.endDate) {
            throw this.validationError('start_date must be before or equal to end_date');
        }

        const updatedPeriod = await planningRepository.updatePeriod(userId, id, period);

        return updatedPeriod ? this.formatPeriod(updatedPeriod) : null;
    }

    async getItems(userId, periodId) {
        const period = await this.getPeriod(userId, periodId);

        if (!period) {
            return null;
        }

        const items = await planningRepository.findItemsByPeriodId(
            userId,
            period.id
        );

        return items.map(item => this.formatItem(item));
    }

    async createItem(userId, data) {
        const periodId = this.requireId(data.period_id, 'period_id');
        const period = await planningRepository.findPeriodById(userId, periodId);

        if (!period) {
            throw this.notFoundError('Planning period not found');
        }

        const item = await this.buildItem(userId, data, null);

        return this.formatItem(
            await planningRepository.createItem(item)
        );
    }

    async updateItem(userId, itemId, data) {
        const id = this.requireId(itemId, 'item id');
        const currentItem = await planningRepository.findItemById(userId, id);

        if (!currentItem) {
            return null;
        }

        if (data.period_id !== undefined && Number(data.period_id) !== Number(currentItem.periodId)) {
            const nextPeriodId = this.requireId(data.period_id, 'period_id');
            const period = await planningRepository.findPeriodById(userId, nextPeriodId);

            if (!period) {
                throw this.notFoundError('Planning period not found');
            }
        }

        const item = await this.buildItem(userId, data, currentItem);
        const updatedItem = await planningRepository.updateItem(userId, id, item);

        return updatedItem ? this.formatItem(updatedItem) : null;
    }

    async deleteItem(userId, itemId) {
        return planningRepository.deleteItem(
            userId,
            this.requireId(itemId, 'item id')
        );
    }

    async getStatistics(userId, periodId) {
        const period = await planningRepository.findPeriodById(
            userId,
            this.requireId(periodId, 'period id')
        );

        if (!period) {
            return null;
        }

        const items = await planningRepository.findItemsByPeriodId(
            userId,
            period.id
        );

        const statistics = {
            budgetAmount: this.toMoney(period.budgetAmount),
            pending: {
                count: 0,
                amount: 0
            },
            completed: {
                count: 0,
                amount: 0
            },
            cancelled: {
                count: 0,
                amount: 0
            }
        };

        for (const item of items) {
            if (item.status === 'pending') {
                statistics.pending.count += 1;
                statistics.pending.amount += this.toMoney(item.plannedAmount);
            }

            if (item.status === 'completed') {
                statistics.completed.count += 1;
                statistics.completed.amount += this.toMoney(item.actualAmount ?? item.plannedAmount);
            }

            if (item.status === 'cancelled') {
                statistics.cancelled.count += 1;
                statistics.cancelled.amount += this.toMoney(item.plannedAmount);
            }
        }

        statistics.pending.amount = this.roundMoney(statistics.pending.amount);
        statistics.completed.amount = this.roundMoney(statistics.completed.amount);
        statistics.cancelled.amount = this.roundMoney(statistics.cancelled.amount);

        statistics.remainingAmount = this.roundMoney(
            statistics.budgetAmount - statistics.completed.amount
        );
        statistics.reservedAmount = statistics.pending.amount;
        statistics.freeAmount = this.roundMoney(
            statistics.remainingAmount - statistics.reservedAmount
        );
        statistics.remainingDays = this.getRemainingDays(period.endDate);
        statistics.dailyAvailable = statistics.remainingDays > 0
            ? this.roundMoney(statistics.freeAmount / statistics.remainingDays)
            : 0;
        statistics.actualSpent = this.roundMoney(
            await transactionRepository.getActualSpent(
                this.dateRangeTimestamp(period.startDate),
                this.dateRangeTimestamp(period.endDate, true)
            )
        );

        return statistics;
    }

    async buildItem(userId, data, currentItem) {
        const status = data.status ?? currentItem?.status ?? 'pending';

        if (!STATUSES.includes(status)) {
            throw this.validationError('Invalid status');
        }

        const categoryId = data.category_id !== undefined
            ? this.optionalId(data.category_id, 'category_id')
            : currentItem?.categoryId ?? null;

        if (categoryId !== null) {
            const categoryExists = await planningRepository.categoryExists(categoryId);

            if (!categoryExists) {
                throw this.validationError('category_id is invalid');
            }
        }

        const item = {
            userId,
            periodId: data.period_id !== undefined
                ? this.requireId(data.period_id, 'period_id')
                : Number(currentItem?.periodId),
            categoryId,
            title: data.title !== undefined
                ? this.requireString(data.title, 'title')
                : this.requireString(currentItem?.title, 'title'),
            description: data.description !== undefined
                ? this.optionalString(data.description)
                : currentItem?.description ?? null,
            plannedAmount: data.planned_amount !== undefined
                ? this.requireAmount(data.planned_amount, 'planned_amount')
                : this.requireAmount(currentItem?.plannedAmount, 'planned_amount'),
            actualAmount: data.actual_amount !== undefined
                ? this.optionalAmount(data.actual_amount, 'actual_amount')
                : currentItem?.actualAmount ?? null,
            status,
            plannedAt: data.planned_at !== undefined
                ? this.requireDate(data.planned_at, 'planned_at')
                : currentItem?.plannedAt ?? this.today(),
            completedAt: currentItem?.completedAt ?? null,
            cancelledAt: currentItem?.cancelledAt ?? null,
            transactionId: data.transaction_id !== undefined
                ? this.optionalString(data.transaction_id)
                : currentItem?.transactionId ?? null
        };

        if (status === 'pending') {
            item.completedAt = null;
            item.cancelledAt = null;
        }

        if (status === 'completed') {
            item.completedAt = item.completedAt ?? new Date();
            item.cancelledAt = null;
        }

        if (status === 'cancelled') {
            item.cancelledAt = item.cancelledAt ?? new Date();
            item.completedAt = null;
        }

        return item;
    }

    requireId(value, field) {
        const id = Number(value);

        if (!Number.isInteger(id) || id <= 0) {
            throw this.validationError(`${field} is invalid`);
        }

        return id;
    }

    optionalId(value, field) {
        if (value === null || value === '') {
            return null;
        }

        return this.requireId(value, field);
    }

    requireAmount(value, field) {
        const amount = Number(value);

        if (!Number.isFinite(amount) || amount < 0) {
            throw this.validationError(`${field} must be greater than or equal to 0`);
        }

        return this.roundMoney(amount);
    }

    optionalAmount(value, field) {
        if (value === null || value === '') {
            return null;
        }

        return this.requireAmount(value, field);
    }

    requireDate(value, field) {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            throw this.validationError(`${field} must use YYYY-MM-DD format`);
        }

        const date = new Date(`${value}T00:00:00Z`);

        if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
            throw this.validationError(`${field} is invalid`);
        }

        return value;
    }

    requireString(value, field) {
        if (typeof value !== 'string' || value.trim() === '') {
            throw this.validationError(`${field} is required`);
        }

        return value.trim();
    }

    optionalString(value) {
        if (value === null || value === undefined) {
            return null;
        }

        const text = String(value).trim();

        return text === '' ? null : text;
    }

    getRemainingDays(endDate) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const periodEnd = new Date(`${this.formatDate(endDate)}T00:00:00`);
        const diff = periodEnd.getTime() - today.getTime();

        if (diff < 0) {
            return 0;
        }

        return Math.floor(diff / 86400000) + 1;
    }

    today() {
        const now = new Date();

        return [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0')
        ].join('-');
    }

    formatDate(value) {
        if (value instanceof Date) {
            return [
                value.getFullYear(),
                String(value.getMonth() + 1).padStart(2, '0'),
                String(value.getDate()).padStart(2, '0')
            ].join('-');
        }

        return String(value).slice(0, 10);
    }

    formatDateTime(value) {
        return value instanceof Date ? value.toISOString() : value;
    }

    dateRangeTimestamp(value, isEndOfDay = false) {
        const [year, month, day] = this.formatDate(value).split('-').map(Number);
        const date = new Date(year, month - 1, day);
        date.setHours(isEndOfDay ? 23 : 0, isEndOfDay ? 59 : 0, isEndOfDay ? 59 : 0, isEndOfDay ? 999 : 0);

        return date.getTime();
    }

    toMoney(value) {
        return value === null || value === undefined ? 0 : Number(value);
    }

    roundMoney(value) {
        return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
    }

    formatPeriod(period) {
        return {
            id: Number(period.id),
            userId: Number(period.userId),
            startDate: this.formatDate(period.startDate),
            endDate: this.formatDate(period.endDate),
            budgetAmount: this.toMoney(period.budgetAmount),
            createdAt: this.formatDateTime(period.createdAt),
            updatedAt: this.formatDateTime(period.updatedAt)
        };
    }

    formatItem(item) {
        return {
            id: Number(item.id),
            periodId: Number(item.periodId),
            categoryId: item.categoryId === null ? null : Number(item.categoryId),
            title: item.title,
            description: item.description,
            plannedAmount: this.toMoney(item.plannedAmount),
            actualAmount: item.actualAmount === null ? null : this.toMoney(item.actualAmount),
            status: item.status,
            plannedAt: this.formatDate(item.plannedAt),
            completedAt: item.completedAt ? this.formatDateTime(item.completedAt) : null,
            cancelledAt: item.cancelledAt ? this.formatDateTime(item.cancelledAt) : null,
            transactionId: item.transactionId,
            createdAt: this.formatDateTime(item.createdAt),
            updatedAt: this.formatDateTime(item.updatedAt)
        };
    }

    validationError(message) {
        const error = new Error(message);
        error.statusCode = 400;

        return error;
    }

    notFoundError(message) {
        const error = new Error(message);
        error.statusCode = 404;

        return error;
    }
}

export default new PlanningService();
