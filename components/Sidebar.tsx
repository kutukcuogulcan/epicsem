import { DEMO_EMAIL, getCurrentUser, isOpenAccessEnabled } from "@/lib/auth";
import SidebarClient from "./SidebarClient";

/**
 * Server wrapper — fetches the signed-in user (needs cookies(), can't run in a client
 * component) and hands plain props down to SidebarClient, which owns the mobile
 * open/close state and active-link highlighting. Used only by the app-shell (tool
 * pages); marketing pages keep the top Nav. See app/layout.tsx for the branch.
 */
export default async function Sidebar() {
  const user = await getCurrentUser();
  const isDemoFallback = isOpenAccessEnabled() && user?.email === DEMO_EMAIL;
  return <SidebarClient email={user?.email ?? null} isDemoFallback={isDemoFallback} />;
}
