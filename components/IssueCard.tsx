import type { SeoIssueResult } from "@/types";
import Badge from "./Badge";

export default function IssueCard({ issue }: { issue: SeoIssueResult }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium text-sm">{issue.title}</div>
        <Badge severity={issue.severity} />
      </div>
      {issue.detail && <p className="mt-2 text-sm text-ink/60">{issue.detail}</p>}
      {issue.recommendation && (
        <p className="mt-2 text-sm text-accent/90">→ {issue.recommendation}</p>
      )}
    </div>
  );
}
