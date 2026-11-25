/** AI ajan hazırlığı — istemcide de kullanılan türler ve seviye tanımları (sunucu bağımlılığı yok). */

export type CheckOutcome = "pass" | "fail" | "warn" | "skip";
export type CheckTier = "gate" | "reported";

export interface ReadinessCheck {
  id: string;
  level: 1 | 2 | 3 | 4 | 5;
  tier: CheckTier;
  title: string;
  outcome: CheckOutcome;
  detail: string;
  why: string;
  fix: string;
  /** Yalnızca kendi site için: yapıştırılacak hazır kod (sitedeki gerçek bilgilerden; bilinmeyen alanlar [NEEDS: …]). */
  code?: { file: string; text: string };
}

export interface DomainReadiness {
  domain: string;
  brand: string;
  own: boolean;
  level: number;
  next: { level: number; blocking: string[] } | null;
  checks: ReadinessCheck[];
  checkedAt: string;
  error?: string;
}

export const LEVELS: { level: number; name: string; question: string }[] = [
  { level: 0, name: "Kapıda kalıyor", question: "AI ajanları siteye girebiliyor mu?" },
  { level: 1, name: "Erişilebilir", question: "AI ajanları siteye girebiliyor mu?" },
  { level: 2, name: "Bulunabilir", question: "Sitede ne olduğunu bulabiliyorlar mı?" },
  { level: 3, name: "Okunabilir", question: "İçeriği okuyup bilgi çıkarabiliyorlar mı?" },
  { level: 4, name: "İşlem yapabilir", question: "Sitede bir işlem yapabiliyorlar mı?" },
  { level: 5, name: "Satın alabilir", question: "Ajan senin adına satın alabiliyor mu?" },
];
export const levelName = (n: number) => LEVELS[Math.max(0, Math.min(5, n))].name;
