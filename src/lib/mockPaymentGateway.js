export async function charge(amountCents, { shouldDecline = false } = {}) {
  // Simulate asynchronous network latency.
  await new Promise((resolve) => setTimeout(resolve, 0));
  if (shouldDecline) {
    return { ok: false, declineCode: "PAYMENT_DECLINED" };
  }
  return { ok: true };
}