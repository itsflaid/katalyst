import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../../db/schema';
import type { Db } from '../facts/queries';
import type { SubrequestBudget } from './budget';

// Db per request: tiap query HTTP dihitung; drizzle memakai `.query`,
// `db.batch` memakai `.transaction`, ketiganya satu HTTP per pemanggilan.
export function countedDb(url: string, budget: SubrequestBudget): Db {
  const query = neon(url);
  const base = query as unknown as (...args: never[]) => Promise<unknown>;
  const baseQuery = query.query as unknown as (...args: never[]) => Promise<unknown>;
  const baseTransaction = (query as unknown as { transaction: (...args: never[]) => Promise<unknown> }).transaction.bind(query);
  const wrapped = (async (...args: never[]) => {
    budget.spend(1);
    return base(...args);
  }) as unknown as typeof query;
  (wrapped as unknown as { query: unknown }).query = async (...args: never[]) => {
    budget.spend(1);
    return baseQuery(...args);
  };
  (wrapped as unknown as { transaction: unknown }).transaction = async (...args: never[]) => {
    budget.spend(1);
    return baseTransaction(...args);
  };
  return drizzle(wrapped, { schema });
}
