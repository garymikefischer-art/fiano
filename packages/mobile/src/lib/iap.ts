/**
 * iap.ts — RevenueCat-Wrapper für Mobile In-App-Purchases (M5 / D3, 2026-06-05).
 *
 * Kapselt react-native-purchases v10. Wird von App.tsx (configure beim Start),
 * authStore (logIn/logOut bei Auth-Wechsel) und PricingScreen (Offerings +
 * purchasePackage) genutzt.
 *
 * Architektur (siehe PROJECT_SUMMARY §7a):
 *   - RevenueCat ist die Mobile-Source-of-Truth für Käufe.
 *   - Der RevenueCat-Webhook (supabase/functions/revenuecat-webhook) schreibt
 *     Käufe server-side in die `subscriptions`-Tabelle — dieselbe die Desktop
 *     via Stripe nutzt. Die App liest unverändert via authStore.fetchSubscription.
 *   - Für INSTANT-UX nach dem Kauf lesen wir zusätzlich die CustomerInfo lokal
 *     aus (planFromCustomerInfo) und pollen fetchSubscription bis der Webhook
 *     die Row geschrieben hat (gleiches Pattern wie der alte Stripe-Web-Flow).
 *
 * App-User-ID = Supabase-User-ID: Nach Login rufen wir Purchases.logIn(userId),
 * damit der Webhook `app_user_id` == Supabase-user_id bekommt und direkt auf
 * user_id upserten kann.
 *
 * Entitlement→Plan-Mapping: RevenueCat-Entitlement-IDs `creator` / `pro`
 * (angelegt im RC-Dashboard) mappen 1:1 auf unsere Plan-Namen. `pro` hat
 * Vorrang falls (theoretisch) beide aktiv wären.
 */

import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';
import { ENV } from './env';

export type IapPlan = 'creator' | 'pro' | null;

/** Package-Identifier wie im RC-Dashboard-Offering `default` angelegt. */
export const IAP_PACKAGE_IDS = { creator: 'creator', pro: 'pro' } as const;

/** Entitlement-Identifier wie im RC-Dashboard angelegt. */
const ENTITLEMENT_CREATOR = 'creator';
const ENTITLEMENT_PRO = 'pro';

let configured = false;

/** Key sieht nach echtem RC-Key aus (nicht der `_xxx`-Placeholder aus .env). */
function validKey(key: string): boolean {
  return /^(goog|appl)_[A-Za-z0-9]+$/.test(key);
}

function activeApiKey(): string | null {
  const key =
    Platform.OS === 'android' ? ENV.REVENUECAT_ANDROID_KEY : ENV.REVENUECAT_IOS_KEY;
  return validKey(key) ? key : null;
}

/**
 * true wenn RevenueCat in diesem Build nutzbar ist (gültiger Key vorhanden +
 * configure lief). In Expo Go ist das Native-Modul nicht vorhanden — configure
 * fängt das ab und isAvailable bleibt false. PricingScreen fällt dann auf einen
 * Hinweis zurück statt zu crashen.
 */
export function iapAvailable(): boolean {
  return configured;
}

/**
 * Einmal beim App-Start aufrufen (App.tsx). Idempotent. Wenn kein gültiger Key
 * (z.B. iOS-Key noch Placeholder) oder Native-Modul fehlt → no-op, App läuft
 * normal weiter, IAP ist einfach deaktiviert.
 */
export function configurePurchases(appUserId?: string): void {
  if (configured) return;
  const apiKey = activeApiKey();
  if (!apiKey) {
    console.warn('[iap] kein gültiger RevenueCat-Key — IAP deaktiviert');
    return;
  }
  try {
    if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    Purchases.configure({ apiKey, appUserID: appUserId ?? null });
    configured = true;
  } catch (e) {
    // Native-Modul nicht vorhanden (Expo Go) o.ä. — sauber degradieren.
    console.warn('[iap] configure fehlgeschlagen — IAP deaktiviert:', e);
  }
}

/**
 * Nach Supabase-Login aufrufen: aliast die (ggf. anonyme) RevenueCat-ID auf die
 * Supabase-user_id, sodass der Webhook app_user_id == user_id bekommt.
 */
export async function loginPurchases(userId: string): Promise<void> {
  if (!configured) return;
  try {
    await Purchases.logIn(userId);
  } catch (e) {
    console.warn('[iap] logIn fehlgeschlagen:', e);
  }
}

/** Nach Supabase-Logout: RevenueCat zurück auf anonyme ID. */
export async function logoutPurchases(): Promise<void> {
  if (!configured) return;
  try {
    await Purchases.logOut();
  } catch (e) {
    // logOut wirft wenn bereits anonym — harmlos.
    console.warn('[iap] logOut:', e);
  }
}

/** Aktuelles Offering `default` laden (oder null wenn IAP aus/leer). */
export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  if (!configured) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current ?? null;
  } catch (e) {
    console.warn('[iap] getOfferings fehlgeschlagen:', e);
    return null;
  }
}

/** Package für einen Plan aus dem Offering ziehen (per Identifier creator/pro). */
export function packageForPlan(
  offering: PurchasesOffering,
  plan: 'creator' | 'pro',
): PurchasesPackage | null {
  const id = IAP_PACKAGE_IDS[plan];
  return offering.availablePackages.find((p) => p.identifier === id) ?? null;
}

export interface PurchaseResult {
  ok: boolean;
  userCancelled?: boolean;
  customerInfo?: CustomerInfo;
  error?: string;
}

/**
 * Kauf eines Packages. Wrappt RevenueCats Error-Konvention: ein vom User
 * abgebrochener Kauf wirft mit `userCancelled === true` — das ist KEIN Fehler,
 * der UI angezeigt werden soll.
 *
 * Plan-Wechsel (Creator↔Pro): `oldProductIdentifier` = die Store-Produkt-ID des
 * AKTUELL aktiven Abos. Damit ersetzt Google Play das bestehende Abo (Upgrade
 * mit Proration) statt ein zweites parallel abzuschließen. Ohne diesen Parameter
 * schloss ein Creator→Pro-Wechsel ZWEI aktive Abos ab (Bug-Fix 2026-06-08).
 * Hinweis: WITH_TIME_PRORATION passt fürs Upgrade; ein echtes Downgrade
 * (Pro→Creator) könnte später auf DEFERRED umgestellt werden, damit der User
 * das höhere Abo bis Periodenende behält.
 */
export async function purchase(
  pkg: PurchasesPackage,
  oldProductIdentifier?: string | null,
): Promise<PurchaseResult> {
  if (!configured) return { ok: false, error: 'IAP nicht verfügbar' };
  try {
    // Nur einen Produktwechsel anstoßen, wenn wirklich ein ANDERES Produkt aktiv
    // ist — sonst normaler Neukauf. WITH_TIME_PRORATION = sofortiger Wechsel,
    // Restguthaben des alten Abos wird als Zeit gutgeschrieben.
    const productChangeInfo =
      oldProductIdentifier && oldProductIdentifier !== pkg.product.identifier
        ? {
            oldProductIdentifier,
            replacementMode: Purchases.STORE_REPLACEMENT_MODE.WITH_TIME_PRORATION,
          }
        : null;
    const { customerInfo } = await Purchases.purchasePackage(pkg, null, productChangeInfo);
    return { ok: true, customerInfo };
  } catch (e: any) {
    if (e?.userCancelled) return { ok: false, userCancelled: true };
    return { ok: false, error: e?.message ?? String(e) };
  }
}

/** Frühere Käufe wiederherstellen (z.B. nach Neuinstallation / Gerätewechsel). */
export async function restore(): Promise<PurchaseResult> {
  if (!configured) return { ok: false, error: 'IAP nicht verfügbar' };
  try {
    const customerInfo = await Purchases.restorePurchases();
    return { ok: true, customerInfo };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

/** Aktuelle CustomerInfo abrufen (für Sync beim App-Start). */
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!configured) return null;
  try {
    return await Purchases.getCustomerInfo();
  } catch (e) {
    console.warn('[iap] getCustomerInfo fehlgeschlagen:', e);
    return null;
  }
}

/**
 * Management-URL für „Abo verwalten / kündigen". Bei Google-Play-Käufen liefert
 * RevenueCat die Play-Subscriptions-Seite, bei Stripe das Kundenportal. Google-
 * Play-Abos kann man NUR im Play Store kündigen (Google-Policy) — daher dieser
 * Deep-Link. null wenn IAP aus / keine URL.
 */
export async function getManagementUrl(): Promise<string | null> {
  if (!configured) return null;
  try {
    const info = await Purchases.getCustomerInfo();
    return info.managementURL ?? null;
  } catch (e) {
    console.warn('[iap] getManagementUrl fehlgeschlagen:', e);
    return null;
  }
}

/**
 * Mappt die aktiven Entitlements einer CustomerInfo auf unseren Plan-Namen.
 * `pro` hat Vorrang. Gibt null wenn kein aktives Entitlement.
 */
export function planFromCustomerInfo(info: CustomerInfo | null | undefined): IapPlan {
  if (!info) return null;
  const active = info.entitlements.active;
  if (active[ENTITLEMENT_PRO]) return 'pro';
  if (active[ENTITLEMENT_CREATOR]) return 'creator';
  return null;
}

/**
 * Period-End (ISO) des aktiven Entitlements aus der CustomerInfo, oder null.
 * Für die lokale Subscription-Anzeige bis der Webhook die Row geschrieben hat.
 */
export function periodEndFromCustomerInfo(info: CustomerInfo | null | undefined): string | null {
  if (!info) return null;
  const active = info.entitlements.active;
  const ent = active[ENTITLEMENT_PRO] ?? active[ENTITLEMENT_CREATOR];
  return ent?.expirationDate ?? null;
}
