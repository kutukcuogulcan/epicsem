import { redirect } from "next/navigation";

// Ödeme yok: eski bağlantılar ana sayfaya gider.
export default function PricingPage() {
  redirect("/");
}
