import Image from "next/image";

/**
 * A "browser chrome" wrapper around a real product screenshot — traffic-light dots +
 * a URL bar, then the image below. Every image passed in here is an ACTUAL screenshot
 * of Epicsem's own live app (see public/screenshots/README or the screenshot's own
 * page for where each one was taken), never a mockup or stock dashboard image — this
 * matters because the rest of the product is built around not fabricating data, and a
 * fake "dashboard" graphic would quietly break that promise on the one page (the
 * homepage) most visitors actually see.
 */
export default function BrowserFrame({
  src,
  alt,
  path,
  width,
  height,
  priority,
}: {
  src: string;
  alt: string;
  path: string;
  width: number;
  height: number;
  priority?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-panel shadow-xl shadow-ink/[0.06] overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border bg-muted/60 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-danger/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-warn/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-seo/60" />
        <span className="ml-2 truncate rounded-md bg-panel border border-border px-2.5 py-0.5 text-[11px] text-ink/40">
          {path}
        </span>
      </div>
      <Image src={src} alt={alt} width={width} height={height} className="w-full h-auto" priority={priority} />
    </div>
  );
}
