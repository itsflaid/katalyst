import type { Db } from '../facts/queries';
import type { BizTz } from '../../../shared/time';
import type { SubrequestBudget } from './budget';

export interface ToolContext {
  businessId: string;
  tz: BizTz;
  now: Date;
  db: Db;
  budget: SubrequestBudget;
}
