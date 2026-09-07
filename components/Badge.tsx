import type { IssueSeverity } from "@/types";

const LABEL: Record<IssueSeverity, string> = {
  critical: "Kritik",
  warning: "Uyarı",
  info: "Bilgi",
  pass: "Geçti",
};

export default function Badge({ severity }: { severity: IssueSeverity }) {
  return <span className={`badge badge-${severity}`}>{LABEL[severity]}</span>;
}
