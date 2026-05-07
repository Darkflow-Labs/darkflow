import type { AutumnConfig } from "atmn";
import { feature, item, plan } from "atmn";

/**
 * Autumn product model for Darkflow (push with `npx atmn push` from repo root).
 * Feature IDs here must match AUTUMN_FEATURE_* env vars in apps/client, apps/onyx, and ops.
 */
const launchStreamMessage = feature({
  id: "launch_stream_message",
  name: "Public launch stream message",
  type: "metered",
  consumable: true
});

const platformTradeFeeUsd = feature({
  id: "platform_trade_fee_usd",
  name: "Platform trade fee (USD notional)",
  type: "metered",
  consumable: true
});

const onyxLiveTrading = feature({
  id: "onyx_live_trading",
  name: "Onyx live trading (operator)",
  type: "boolean"
});

const dfFree = plan({
  id: "df_free",
  name: "Darkflow Free",
  group: "df_launch",
  autoEnable: true,
  description: "Post-trial / fallback; limited stream credits.",
  items: [
    item({
      featureId: launchStreamMessage.id,
      included: 500,
      reset: { interval: "month" }
    })
  ]
});

const dfPro = plan({
  id: "df_pro",
  name: "Darkflow Pro",
  group: "df_launch",
  description: "Public launch stream + operator trading; 7-day trial without card.",
  price: { amount: 29, interval: "month" },
  freeTrial: {
    durationLength: 7,
    durationType: "day",
    cardRequired: false
  },
  items: [
    item({
      featureId: launchStreamMessage.id,
      included: 100_000,
      reset: { interval: "month" }
    }),
    item({
      featureId: launchStreamMessage.id,
      included: 0,
      price: {
        amount: 5,
        interval: "month",
        billingMethod: "prepaid",
        billingUnits: 5_000,
        maxPurchase: 50
      }
    }),
    item({
      featureId: onyxLiveTrading.id,
      unlimited: true
    })
  ]
});

const config: AutumnConfig = {
  features: [launchStreamMessage, platformTradeFeeUsd, onyxLiveTrading],
  plans: [dfFree, dfPro]
};

export default config;
