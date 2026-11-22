import { redirect } from "next/navigation";

/** Rakip Boşluğu kaldırıldı (GEO ile örtüşüyordu); eski linkler GEO'ya gider. */
export default function GapRemoved() {
  redirect("/geo");
}
