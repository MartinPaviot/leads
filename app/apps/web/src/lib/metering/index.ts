// Credit metering + budget (spec 02, _specs/02-metering-and-budget). The single
// entry point: meter() wraps every external credit-consuming call with a budget
// pre-check + idempotent charge; checkBudget/BudgetExhausted gate it; metrics
// expose cost-per-qualified-account + cache-hit-rate.
export { meter, type MeterOp } from "./meter";
export { BudgetExhausted, scopeKeys, type BudgetScope } from "./budget";
export { dbMeterStore, DbMeterStore } from "./db-store";
export { InMemoryMeterStore, type MeterStore, type MeterCharge } from "./store";
export { metrics, costPerQualifiedAccount, cacheHitRate, type MetricScope } from "./metrics";
