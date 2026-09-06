"use client";

import { useEffect, useState } from "react";

/**
 * Remembers the user's own agency name in their browser (localStorage) so the
 * white-label PDF report (see lib/pdf-report.ts, which already accepts an
 * `agencyName` and only ever fell back to "Epicsem" because no page sent one)
 * can be branded with it — without adding a server-side per-account setting.
 *
 * Deliberately NOT stored on the user record: the live site currently runs in
 * open-access demo mode (DEMO_OPEN_ACCESS=true), where every visitor without a
 * real login shares one database user row. A server-side "agency name" field
 * would leak between unrelated visitors testing the demo at the same time.
 * Per-browser storage means each agency's own device remembers its own name.
 */
const STORAGE_KEY = "epicsem-agency-name";

export function useAgencyName(): [string, (value: string) => void] {
  const [agencyName, setAgencyNameState] = useState("");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setAgencyNameState(stored);
    } catch {
      // localStorage can throw in some private-browsing contexts — safe to ignore,
      // the field just won't be remembered for that visitor.
    }
  }, []);

  function setAgencyName(value: string) {
    setAgencyNameState(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // best-effort — see above
    }
  }

  return [agencyName, setAgencyName];
}
