export function onlineOrderExpiryHours() {
  const hours = Number(process.env.ONLINE_ORDER_EXPIRY_HOURS ?? 2);
  return Number.isFinite(hours) && hours > 0 ? hours : 2;
}

export function onlineOrderPaymentDeadline(createdAt: Date | string) {
  return new Date(new Date(createdAt).getTime() + onlineOrderExpiryHours() * 60 * 60 * 1000);
}
