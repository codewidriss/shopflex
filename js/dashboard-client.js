/**
 * js/dashboard-client.js
 * ─────────────────────────────────────────────────────────────────
 * Shopflex — Factory Method Pattern (CSE 6234 Software Design)
 *
 * STRUCTURE (matches standard GoF Factory Method pattern):
 *
 *  PRODUCT side:
 *    IPaymentGateway            → Product interface
 *    FPXBankTransferPayment     → ConcreteProduct A
 *    CreditCardPayment          → ConcreteProduct B
 *    TNGWalletPayment           → ConcreteProduct C
 *    CODPayment                 → ConcreteProduct D
 *
 *  CREATOR side:
 *    PaymentGatewayCreator      → Creator (abstract)
 *                                 declares createGateway() factory method
 *                                 contains someOperation() = processOrder()
 *    FPXCreator                 → ConcreteCreator A
 *    CreditCardCreator          → ConcreteCreator B
 *    TNGCreator                 → ConcreteCreator C
 *    CODCreator                 → ConcreteCreator D
 *
 *  REGISTRY:
 *    PaymentGatewayFactory      → maps method keys to ConcreteCreators
 *                                 CheckoutService only ever sees the
 *                                 abstract PaymentGatewayCreator type
 */


// ═══════════════════════════════════════════════════════════════════
// PRODUCT INTERFACE
// ═══════════════════════════════════════════════════════════════════
class IPaymentGateway {
  async processPayment(amount, currency, details) {
    throw new Error(`${this.constructor.name} must implement processPayment()`);
  }
  async refund(transactionId) {
    throw new Error(`${this.constructor.name} must implement refund()`);
  }
}


// ═══════════════════════════════════════════════════════════════════
// CONCRETE PRODUCTS
// ═══════════════════════════════════════════════════════════════════

class FPXBankTransferPayment extends IPaymentGateway {
  constructor() { super(); this.gatewayName = 'FPX (Online Banking)'; }
  async processPayment(amount, currency, details) {
    console.log(`[FPX] Processing RM${amount} for order ${details.orderRef}`);
    await _simulateNetworkDelay(600);
    return { success: true, transactionId: 'FPX-' + Date.now(), errorMessage: null };
  }
  async refund(transactionId) {
    return { success: true, errorMessage: null };
  }
}

class CreditCardPayment extends IPaymentGateway {
  constructor() { super(); this.gatewayName = 'Credit / Debit Card'; }
  async processPayment(amount, currency, details) {
    console.log(`[CARD] Charging RM${amount} for order ${details.orderRef}`);
    await _simulateNetworkDelay(800);
    return { success: true, transactionId: 'CARD-' + Date.now(), errorMessage: null };
  }
  async refund(transactionId) {
    return { success: true, errorMessage: null };
  }
}

class TNGWalletPayment extends IPaymentGateway {
  constructor() { super(); this.gatewayName = "Touch 'n Go eWallet"; }
  async processPayment(amount, currency, details) {
    console.log(`[TNG] Wallet charge RM${amount} for order ${details.orderRef}`);
    await _simulateNetworkDelay(500);
    return { success: true, transactionId: 'TNG-' + Date.now(), errorMessage: null };
  }
  async refund(transactionId) {
    return { success: true, errorMessage: null };
  }
}

class CODPayment extends IPaymentGateway {
  constructor() { super(); this.gatewayName = 'Cash on Delivery'; }
  async processPayment(amount, currency, details) {
    console.log(`[COD] Order ${details.orderRef} — collect RM${amount} on delivery`);
    await _simulateNetworkDelay(200);
    return { success: true, transactionId: 'COD-' + Date.now(), errorMessage: null };
  }
  async refund(transactionId) {
    return { success: false, errorMessage: 'COD refunds must be processed manually.' };
  }
}


// ═══════════════════════════════════════════════════════════════════
// CREATOR  (abstract)
//
// Declares createGateway() — the factory method subclasses override.
// Contains processOrder() — the "someOperation()" from GoF — which
// is the business logic that uses the product through the interface.
// It calls createGateway() and never sees a concrete class name.
// ═══════════════════════════════════════════════════════════════════
class PaymentGatewayCreator {
  /**
   * Factory method. Subclasses override this to return their
   * specific ConcreteProduct.
   * @returns {IPaymentGateway}
   */
  createGateway() {
    throw new Error(`${this.constructor.name} must implement createGateway()`);
  }

  /**
   * someOperation() from GoF.
   * Uses the product through IPaymentGateway — never a concrete type.
   */
  async processOrder(amount, currency, details) {
    const gateway = this.createGateway();          // ← calls factory method
    console.log(`[Creator] Using gateway: ${gateway.gatewayName}`);
    const result = await gateway.processPayment(amount, currency, details);
    return {
      success:       result.success,
      transactionId: result.transactionId,
      gatewayName:   gateway.gatewayName,
      errorMessage:  result.errorMessage,
    };
  }
}


// ═══════════════════════════════════════════════════════════════════
// CONCRETE CREATORS
// Each overrides createGateway() to instantiate its ConcreteProduct.
// These are the ONLY places a concrete product class is named.
// ═══════════════════════════════════════════════════════════════════

class FPXCreator extends PaymentGatewayCreator {
  createGateway() { return new FPXBankTransferPayment(); }
}

class CreditCardCreator extends PaymentGatewayCreator {
  createGateway() { return new CreditCardPayment(); }
}

class TNGCreator extends PaymentGatewayCreator {
  createGateway() { return new TNGWalletPayment(); }
}

class CODCreator extends PaymentGatewayCreator {
  createGateway() { return new CODPayment(); }
}


// ═══════════════════════════════════════════════════════════════════
// FACTORY REGISTRY
// Maps method key strings → ConcreteCreator instances.
// CheckoutService calls getCreator() and receives a
// PaymentGatewayCreator — the abstract type — never a concrete one.
// ═══════════════════════════════════════════════════════════════════
class PaymentGatewayFactory {
  static #registry = new Map([
    ['FPX',         () => new FPXCreator()],
    ['CREDIT_CARD', () => new CreditCardCreator()],
    ['TNG',         () => new TNGCreator()],
    ['COD',         () => new CODCreator()],
  ]);

  static #labels = new Map([
    ['FPX',         'Online Banking (FPX)'],
    ['CREDIT_CARD', 'Credit / Debit Card'],
    ['TNG',         "Touch 'n Go eWallet"],
    ['COD',         'Cash on Delivery'],
  ]);

  /**
   * Returns the ConcreteCreator for the given method key.
   * The caller only types it as PaymentGatewayCreator.
   */
  static getCreator(method) {
    const factory = PaymentGatewayFactory.#registry.get(method.toUpperCase());
    if (!factory) {
      throw new Error(
        `Unsupported payment method: "${method}". ` +
        `Registered: [${[...PaymentGatewayFactory.#registry.keys()].join(', ')}]`
      );
    }
    return factory();
  }

  static labelFor(method) {
    return PaymentGatewayFactory.#labels.get(method.toUpperCase()) || method;
  }

  /**
   * Extension point — Open/Closed Principle.
   * To add GrabPay: PaymentGatewayFactory.register('GRABPAY', () => new GrabPayCreator())
   * Zero changes to CheckoutService or any existing class.
   */
  static register(method, creatorFactoryFn) {
    PaymentGatewayFactory.#registry.set(method.toUpperCase(), creatorFactoryFn);
    console.log(`[Factory] Registered: ${method.toUpperCase()}`);
  }
}


// ═══════════════════════════════════════════════════════════════════
// CHECKOUT SERVICE  (client code)
// Only references PaymentGatewayFactory and PaymentGatewayCreator.
// Never references FPXCreator, CreditCardPayment, etc.
// ═══════════════════════════════════════════════════════════════════
class CheckoutService {
  constructor(supabaseClient, profile) {
    this._sb      = supabaseClient;
    this._profile = profile;
  }

  async checkout(request) {
    const { cartItems, paymentMethodKey } = request;
    const items = Object.values(cartItems);

    this.#validateStock(items);

    // Get creator — typed as PaymentGatewayCreator, not a concrete class
    const creator    = PaymentGatewayFactory.getCreator(paymentMethodKey);
    const grandTotal = items.reduce((s, i) => s + i.product.price * i.qty, 0) * 0.80;
    const orderRef   = `SF-${Date.now()}`;

    // Creator's processOrder() handles payment internally via IPaymentGateway
    const paymentResult = await creator.processOrder(grandTotal, 'MYR', { orderRef });

    if (!paymentResult.success) {
      throw new Error(paymentResult.errorMessage || 'Payment was declined.');
    }

    // Group cart items by seller and insert orders
    const bySeller = {};
    items.forEach(i => {
      const sid = i.product.profiles?.id || i.product.seller_id;
      if (!bySeller[sid]) bySeller[sid] = [];
      bySeller[sid].push(i);
    });

    const createdOrders = [];

    for (const [sellerId, sellerItems] of Object.entries(bySeller)) {
      const sellerTotal = sellerItems.reduce((s, i) => s + i.product.price * i.qty, 0) * 0.80;

      const { data: order, error: oErr } = await this._sb
        .from('orders')
        .insert({
          buyer_id:       this._profile.id,
          seller_id:      sellerId,
          product_id:     sellerItems[0].product.id,
          total_price:    sellerTotal,
          status:         paymentMethodKey === 'COD' ? 'pending' : 'paid',
          payment_method: paymentMethodKey,
          transaction_id: paymentResult.transactionId,
        })
        .select()
        .single();
      if (oErr) throw oErr;

      const { error: iErr } = await this._sb.from('order_items').insert(
        sellerItems.map(i => ({
          order_id:   order.id,
          product_id: i.product.id,
          seller_id:  sellerId,
          quantity:   i.qty,
          unit_price: i.product.price,
        }))
      );
      if (iErr) throw iErr;

      for (const i of sellerItems) {
        await this._sb
          .from('products')
          .update({ stock_quantity: i.product.stock_quantity - i.qty })
          .eq('id', i.product.id);
      }

      createdOrders.push(order);
    }

    return { success: true, gatewayName: paymentResult.gatewayName, orders: createdOrders };
  }

  #validateStock(items) {
    for (const i of items) {
      if (i.qty > i.product.stock_quantity) {
        throw new Error(
          `Not enough stock for "${i.product.name}". ` +
          `Available: ${i.product.stock_quantity}, requested: ${i.qty}.`
        );
      }
    }
  }
}


// ═══════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════

const PAYMENT_METHOD_KEYS = ['FPX', 'CREDIT_CARD', 'TNG', 'COD'];

function _simulateNetworkDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function selectPaymentMethod(key) {
  document.querySelectorAll('input[name="pay"]').forEach(radio => {
    const label = document.getElementById('pm-label-' + radio.value);
    if (!label) return;
    if (radio.value === key) {
      radio.checked = true;
      label.style.borderColor = 'var(--blue)';
      label.style.background  = 'var(--blue-light)';
    } else {
      label.style.borderColor = 'var(--border)';
      label.style.background  = 'var(--gray-50)';
    }
  });
}
