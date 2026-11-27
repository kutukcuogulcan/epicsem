import { DEMO_EMAIL, getCurrentUser, isGuestAccount, isOpenAccessEnabled } from "@/lib/auth";
import SidebarClient from "./SidebarClient";

/**
 * Server wrapper — fetches the signed-in user (needs cookies(), can't run in a client
 * component) and hands plain props down to SidebarClient, which owns the mobile
 * open/close state and active-link highlighting. Used only by the app-shell (tool
 * pages); marketing pages keep the top Nav. See app/layout.tsx for the branch.
 */
export default async function Sidebar() {
  const user = await getCurrentUser();
  const open = isOpenAccessEnabled();
  // Açık erişimde: misafir = tarayıcıya özel deneme alanı; sahip = eski ortak (demo) hesabı, çıkış düğmesi gösterilmez (çıkarsa misafire düşer).
  const mode = !user ? null : open && isGuestAccount(user.email) ? "guest" : open && user.email === DEMO_EMAIL ? "owner" : "user";
  return <SidebarClient email={user?.email ?? null} mode={mode} />;
}
