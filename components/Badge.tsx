import type { IssueSeverity } from "@/types";

const LABEL: Record<IssueSeverity, string> = {
  critical: "Critical",
  warning: "Warning",
  info: "Info",
  pass: "Pass",
};

export default function Badge({ severity }: { severity: IssueSeverity }) {
  return <span className={`badge badge-${severity}`}>{LABEL[severity]}</span>;
}
