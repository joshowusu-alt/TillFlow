export type DemoOnlineOrderStatus =
  | 'AWAITING_PAYMENT'
  | 'PAYMENT_CONFIRMED'
  | 'PREPARING'
  | 'READY'
  | 'COLLECTED';

export type DemoOnlineOrder = {
  id: string;
  placedAt: string;
  customerName: string;
  phone: string;
  status: DemoOnlineOrderStatus;
  statusLabel: string;
  paymentRef: string | null;
  itemSummary: string;
  totalPence: number;
  note: string;
};

export const DEMO_ONLINE_ORDERS: DemoOnlineOrder[] = [
  {
    id: 'WEB-2401',
    placedAt: '2026-06-02T09:14:00',
    customerName: 'Sample Buyer A',
    phone: '0200-000-101',
    status: 'AWAITING_PAYMENT',
    statusLabel: 'Awaiting MoMo payment',
    paymentRef: null,
    itemSummary: 'Voltic Water 1.5L × 2, Milo 400g × 1',
    totalPence: 5600,
    note: 'Customer sent screenshot pending confirmation.',
  },
  {
    id: 'WEB-2402',
    placedAt: '2026-06-02T11:42:00',
    customerName: 'Sample Buyer B',
    phone: '0200-000-202',
    status: 'PREPARING',
    statusLabel: 'Payment confirmed — preparing',
    paymentRef: 'MOMO-DEMO-88421',
    itemSummary: "Mama's Best Rice 5kg × 1, Gino Tomato Paste × 2",
    totalPence: 5500,
    note: 'Picker assigned — shelf A3.',
  },
  {
    id: 'WEB-2398',
    placedAt: '2026-06-01T16:05:00',
    customerName: 'Sample Buyer C',
    phone: '0200-000-303',
    status: 'COLLECTED',
    statusLabel: 'Collected at counter',
    paymentRef: 'MOMO-DEMO-77210',
    itemSummary: 'Indomie Onion Chicken × 1 pack, Malta Guinness × 6',
    totalPence: 7100,
    note: 'Picked up same day.',
  },
];
