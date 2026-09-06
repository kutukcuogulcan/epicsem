export interface ScenarioStep {
  title: string;
  body: string;
}

/**
 * A clearly-labeled fictional walkthrough of how a tool behaves end-to-end, used on
 * marketing/landing content where a real customer case study would normally go. The
 * app is still in open-access/demo mode with no real customer results to publish yet
 * (see /clients, /monitor empty-state copy), so this is deliberately fictional and
 * says so twice — in the badge and in the disclaimer line — rather than reading like
 * a real result.
 */
export default function ExampleScenario({
  heading,
  steps,
}: {
  heading: string;
  steps: ScenarioStep[];
}) {
  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium uppercase tracking-wide rounded-full bg-accent/10 text-accent px-2.5 py-1">
          Örnek senaryo
        </span>
        <h2 className="font-medium text-sm">{heading}</h2>
      </div>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-sm">
            <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-muted text-ink/50 text-xs flex items-center justify-center">
              {i + 1}
            </span>
            <div>
              <div className="font-medium text-ink/80">{s.title}</div>
              <p className="text-ink/60">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="text-xs text-ink/30 pt-2 border-t border-border">
        Bu kurgusal bir örnektir — gerçek bir müşteriye veya siteye ait değildir. Aracın nasıl çalıştığını somut
        şekilde göstermek için hazırlanmıştır.
      </p>
    </div>
  );
}
