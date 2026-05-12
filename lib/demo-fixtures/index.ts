export { buildDemoLedger } from './build-demo-ledger';
export {
  getDashboardKPIs,
  getSalesByDay,
  getTopProducts,
  getCategoryPerformance,
  getStockMovements,
  getLowStockProducts,
  getDebtorBalances,
  getSupplierPayables,
  getIncomeStatement,
  getCashFlow,
  getPaymentSplit,
} from './reports';
export type {
  DemoSnapshot,
  DemoProduct,
  DemoCategory,
  DemoSupplier,
  DemoCustomer,
  DemoSalesInvoice,
  DemoPurchaseInvoice,
  DemoExpense,
  DemoInventoryBalance,
  DemoTotals,
} from './types';
