export class NoPaymentProvider {
  async createCheckout({ amountCents }) {
    return {
      status: Number(amountCents) === 0 ? "not_required" : "pending",
      reference: null,
    };
  }
}

export const paymentProvider = new NoPaymentProvider();
