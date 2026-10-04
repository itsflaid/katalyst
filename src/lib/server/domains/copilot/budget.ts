export class SubrequestBudget {
  readonly limit: number;
  used = 0;

  constructor(limit = 45) {
    this.limit = limit;
  }

  remaining(): number {
    return this.limit - this.used;
  }

  canAfford(n: number): boolean {
    return this.used + n <= this.limit;
  }

  spend(n = 1): void {
    if (!this.canAfford(n)) throw new Error('BUDGET_EXCEEDED');
    this.used += n;
  }
}
