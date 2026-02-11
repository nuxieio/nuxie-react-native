# Purchase Controller Guide

Use this when your app already owns in-app purchase flows and you want Nuxie runtime actions to delegate to your JS purchase layer.

## Interface

```ts
type NuxiePurchaseController = {
  onPurchase(request: PurchaseRequest): Promise<PurchaseResult>;
  onRestore(request: RestoreRequest): Promise<RestoreResult>;
};
```

## Wiring

```tsx
<NuxieProvider
  config={{ apiKey: "NX_PROD_...", usePurchaseController: true }}
  purchaseController={controller}
/>
```

Or imperative:

```ts
Nuxie.setPurchaseController(controller);
await Nuxie.configure({ apiKey: "NX_PROD_...", usePurchaseController: true });
```

## Purchase Result Shapes

### Purchase

- `success`
- `cancelled`
- `pending`
- `failed`

### Restore

- `success`
- `no_purchases`
- `failed`

## Example

```ts
const controller: NuxiePurchaseController = {
  async onPurchase(request) {
    const result = await myBilling.purchase(request.productId);

    if (result.status === "ok") {
      return {
        type: "success",
        productId: request.productId,
        purchaseToken: result.purchaseToken,
      };
    }

    if (result.status === "cancelled") {
      return { type: "cancelled" };
    }

    return { type: "failed", message: result.message ?? "purchase_failed" };
  },

  async onRestore() {
    const restored = await myBilling.restore();
    return restored.count > 0
      ? { type: "success", restoredCount: restored.count }
      : { type: "no_purchases" };
  },
};
```

## Timeout

Native purchase/restore requests time out after 60 seconds if completion is never returned.

## Best Practices

- Always return an explicit terminal result from your billing integration.
- Convert unknown SDK errors into `failed` with meaningful `message`.
- Ensure only one active billing attempt per request ID in your app layer.
