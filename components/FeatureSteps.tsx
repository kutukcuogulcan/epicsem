/**
 * Bigger, illustrated "how it works" block for the /features/* landing pages —
 * mirrors arvow.com's "STEP 1 / STEP 2 / STEP 3" section: a centered heading,
 * then up to 3 wide cards each with a large numbered circle, a bold title and
 * a description. This sits ON TOP of the page's own <ExampleScenario> (the
 * compact numbered list used across the whole app, tool pages included) —
 * it doesn't replace it, since ExampleScenario already carries the "this is a
 * fictional walkthrough" disclaimer other pages rely on; this component reuses
 * the same step copy just to give the landing page more visual weight, and
 * repeats a short version of that same disclaimer itself.
 */
export default function FeatureSteps({
  heading,
  subheading,
  steps,
}: {
  heading: string;
  subheading: string;
  steps: { title: string; body: string }[];
}) {
  const shown = steps.slice(0, 3);
  return (
    <div className="space-y-8">
      <div className="text-center max-w-2xl mx-auto space-y-2">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{heading}</h2>
        <p className="text-ink/60">{subheading}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {shown.map((s, i) => (
          <div key={s.title} className="card p-6 space-y-3">
            <div className="text-xs font-bold uppercase tracking-wide text-accent">Adım {i + 1}</div>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white text-lg font-extrabold shadow-lg shadow-accent/20">
              {i + 1}
            </div>
            <div className="font-bold">{s.title}</div>
            <p className="text-sm text-ink/60">{s.body}</p>
          </div>
        ))}
      </div>
      <p className="text-center text-xs text-ink/30">
        Kurgusal bir örnek üzerinden anlatılmıştır — aracın gerçek koşularda nasıl çalıştığını somut şekilde göstermek içindir.
      </p>
    </div>
  );
}
