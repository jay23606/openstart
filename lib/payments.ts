export type CheckoutRequest = {
  eventId: string;
  registrationId: string;
  amountInCents: number;
  currency: "usd";
};

export type CheckoutResult = {
  status: "free" | "pending" | "paid";
  reference: string | null;
};

export interface PaymentProvider {
  createCheckout(request: CheckoutRequest): Promise<CheckoutResult>;
}

/**
 * Initial provider used before a real processor is connected.
 * It intentionally rejects non-zero checkouts so paid registrations can
 * never be mistaken for completed payments.
 */
export class NoPaymentProvider implements PaymentProvider {
  async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    if (request.amountInCents > 0) {
      return { status: "pending", reference: null };
    }
    return { status: "free", reference: null };
  }
}
