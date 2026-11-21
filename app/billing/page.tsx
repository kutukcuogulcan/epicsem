import { redirect } from "next/navigation";

// Ödeme yok: eski bağlantılar panoya gider.
export default function BillingPage() {
  redirect("/dashboard");
}
