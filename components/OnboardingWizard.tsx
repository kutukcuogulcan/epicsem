"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { PERSONA_DESCRIPTION, PERSONA_EXAMPLE, PERSONA_LABEL, PERSONA_ORDER, type PersonaKey } from "@/lib/sector-packs";
import { TARGET_MARKET_COUNTRIES, countryCodeFromName, countryNameFromCode } from "@/lib/country-map";

// react-simple-maps + world-atlas (bkz. WorldMapPicker'ın kendi doc-comment'i) sadece "market"
// adımına ulaşıldığında gerekiyor — wizard'ın ilk yüklemesini (Adım 1: URL) şişirmemek için
// ssr:false ile client-only ve lazy olarak yükleniyor; haritanın kendisi SSR'a ihtiyaç duyan
// bir şey yapmıyor zaten (düz SVG).
const WorldMapPicker = dynamic(() => import("@/components/WorldMapPicker"), { ssr: false });

/**
 * URL-first onboarding wizard for /geo — mirrors Peec AI's onboarding flow, verified by the
 * user directly against their own site (pnc.com.tr) and documented screen-by-screen.
 *
 * Kart: Otomatik onboarding zinciri. Core principle, now server-side: the moment the URL field
 * loses focus (blur — NOT a button click), POST /api/onboarding/sessions opens a durable
 * onboarding_sessions row and kicks off the whole chain in the background:
 *   Tarama → (Marka profili ‖ Rakipler, paralel) → Topic'ler (10) → Promptlar (10×8)
 * without waiting on the user to do anything else. This component just polls
 * GET /api/onboarding/sessions/:id every ~1s and fills each screen in as its step's status
 * flips to "ready" (lib/onboarding-engine.ts does the actual work). The session id is carried
 * in the URL's query string (?onboardingSession=…), so a page refresh resumes by re-polling
 * the same id instead of losing everything and restarting from "url" — same pattern
 * app/geo/page.tsx already uses for ?clientId=.
 *
 * Kart: Hazır olmayan içerik (skeleton + stream hissi) — "SSE (ya da 1 sn aralıklı polling)"
 * reads as two equally acceptable options in the card itself; this app already had a polling
 * loop from Kart 1, so it's tightened to 1s rather than adding a parallel SSE transport for
 * the same data. Every step that shows real server content (profil, topic'ler, promptlar) now
 * renders gray skeleton placeholders — never a bare spinner or an empty-looking form — while
 * its status isn't yet "ready"/"error", and reveals the real fields with a short staggered
 * fade-in (SkeletonBar/RevealField below) once it is. That reveal is a presentation animation
 * over data that has already fully arrived from the server in one piece — lib/geo-providers.ts's
 * provider.run() calls return one complete response, there is no token-level streaming from the
 * LLM providers today — so "alanlar tek tek belirir" is implemented honestly as a client-side
 * stagger of real values, never as placeholder/fake text standing in for a value that hasn't
 * actually been computed yet.
 *
 * All calls (lib/brand-discovery.ts, lib/topic-generator.ts, lib/prompt-suggestions.ts's
 * fillAllSlots) are real — demo-mode fallbacks are clearly labeled, same convention as the
 * rest of the app.
 *
 * Kart 8 — Adım 2 "Marka profilini doğrula": hedef pazarlar artık serbest metin değil,
 * components/WorldMapPicker.tsx'in çizdiği gerçek bir dünya haritası (world-atlas/Natural
 * Earth verisi) + lib/country-map.ts'teki sabit ~40 ülkelik kod listesinden seçilen bir dizi
 * (çoklu seçim) — "harita ve ülke seçici" kart metnine birebir karşılık geliyor. Kitle
 * dağılımındaki 3 persona artık tek tek açılıp kapatılabiliyor (bkz. personaEnabled state'i,
 * "audience" adımı altında); kapatılan bir personanın payı 0'a sabitlenir ve "Eşit böl" sadece
 * açık olan personalar arasında dağıtır — toplamın %100 olması şartı (ve bu şartın promptları
 * üreten lib/slot-planner.ts'e nasıl aktarıldığı) değişmedi.
 *
 * Deliberately NOT replicated from the reference flow: a timezone selector doing anything
 * beyond storing the detected value (no feature in this app reads it yet), and the final
 * "choose your plan" paywall screen (Epicsem has no billing system yet — see lib/plans.ts).
 *
 * Prompts for all 10 topics (× 8 slots) are generated server-side up front, so the topics
 * step's topic toggle and the "X Hakkında" branded-topic checkbox are now pure client-side
 * filters over data that already exists — no re-fetch, no waiting, on every toggle.
 *
 * Per Kart 11/Kart 14 of the methodology: topic generation is LLM-proposed but code-scored/
 * selected (lib/topic-generator.ts); prompt slots (intent/persona/form/modifiers) are 100%
 * code-planned (lib/slot-planner.ts) — the LLM's only remaining job is writing one sentence
 * per already-fully-specified slot (lib/prompt-suggestions.ts's fillAllSlots).
 *
 * Known limitation surfaced by the user's own test: LLM-suggested competitors can be wrong
 * (Peec AI itself suggested ERP vendors — Logo, Mikro, Nebim, Uyumsoft — as competitors for
 * a digital marketing agency). That's why competitors are always editable/removable with an
 * explicit caution note, never presented as verified fact.
 */

interface BrandRow {
  name: string;
  domain: string;
}

interface TopicCandidate {
  name: string;
  description: string;
  source: "product" | "problem" | "category" | "sector";
  linkedProducts: string[];
  businessImportance: number;
  brandFit: number;
  demand: number;
  score: number;
}

interface SlotFilledPrompt {
  topic: string;
  text: string;
  branded: boolean;
  intent: "informational" | "commercial" | "transactional" | "instructional";
  persona: PersonaKey;
  form: "question" | "need" | "imperative";
}

type Step = "url" | "profile" | "market" | "audience" | "topics" | "prompts" | "running";
type StepStatus = "pending" | "running" | "ready" | "error";

interface Props {
  onComplete: (brand: BrandRow, competitors: BrandRow[], promptsText: string) => void;
  onClose: () => void;
  /** True while the parent is actually running the real GEO test the wizard just handed
   * off to — drives the "running" step's animation and tells the wizard when to close. */
  running: boolean;
}

const inputClass = "rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent w-full";
const ENGINE_BADGES = ["GPT", "Claude", "Gemini", "PPX", "DeepSeek", "Grok"];
const SOURCE_LABEL: Record<TopicCandidate["source"], string> = {
  product: "Ürün",
  problem: "Problem",
  category: "Kategori",
  sector: "Sektör",
};

function TagEditor({ tags, onChange, placeholder }: { tags: string[]; onChange: (next: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  function add() {
    const v = draft.trim();
    if (!v) return;
    if (tags.some((t) => t.toLocaleLowerCase("tr") === v.toLocaleLowerCase("tr"))) {
      setDraft("");
      return;
    }
    onChange([...tags, v]);
    setDraft("");
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {tags.map((t, i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded-full bg-muted border border-border px-3 py-1 text-xs">
            {t}
            <button type="button" onClick={() => onChange(tags.filter((_, idx) => idx !== i))} className="text-ink/40 hover:text-danger">
              ✕
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className={inputClass}
        />
        <button type="button" onClick={add} className="rounded-lg bg-muted border border-border px-3 text-sm hover:border-accent shrink-0">
          + Ekle
        </button>
      </div>
    </div>
  );
}

// Kart: Hazır olmayan içerik (skeleton + stream hissi) — a plain gray placeholder bar, used
// everywhere a real field/row would go while its step's data hasn't arrived yet. Never a bare
// spinner, never styled to look like it already contains (fake) text.
function SkeletonBar({ width = "100%", height = "0.9rem", className = "" }: { width?: string; height?: string; className?: string }) {
  return <div className={`rounded bg-muted animate-pulse ${className}`} style={{ width, height }} />;
}

// Wraps already-arrived, real content in a short staggered fade-in so a screen's fields feel
// like they're appearing one by one, the moment they replace that same screen's skeleton —
// never a substitute for the skeleton itself, and never applied to data that hasn't actually
// been computed yet (see the Kart 3 doc-comment above for why this is presentation, not fake
// streaming).
function RevealField({ index, children }: { index: number; children: ReactNode }) {
  return (
    <div className="owz-field-in" style={{ animationDelay: `${index * 70}ms` }}>
      {children}
    </div>
  );
}

const EVEN_AUDIENCE: Record<PersonaKey, number> = { simple: 34, informed: 33, researcher: 33 };

// Kart: LLM'siz otomatik doldurma — "Saat dilimi" seçeneklerinin tam IANA listesi. Modern
// tarayıcılarda (ve Node 18+'ta) var olan Intl.supportedValuesOf ile dolduruluyor; eski bir
// runtime'da bu yoksa liste boş kalır ve select tek seçenek olarak o an algılanan zamanı
// gösterir (bkz. aşağıdaki "url" adımı) — asla uydurma bir liste üretilmez.
const TIMEZONE_OPTIONS: string[] = (() => {
  try {
    const intlAny = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    if (typeof intlAny.supportedValuesOf === "function") return intlAny.supportedValuesOf("timeZone");
  } catch {
    // fall through
  }
  return [];
})();

export default function OnboardingWizard({ onComplete, onClose, running }: Props) {
  const [step, setStep] = useState<Step>("url");

  const [url, setUrl] = useState("");
  const [language, setLanguage] = useState<"tr" | "en">("tr");
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [anyDemoMode, setAnyDemoMode] = useState(false);

  // Kart: LLM'siz otomatik doldurma — Step 1'in kendi, Kart 1'in ağır AI zincirinden bağımsız,
  // LLM'siz hızlı tahmin akışı. timezone tamamen istemci taraflı (Intl API, hiç ağ yok) olduğu
  // için lazy useState initializer'da hemen hesaplanır — kullanıcı URL'ye dokunmadan önce bile
  // dolu gelir. prefilling/prefillWarning ise og:site_name/<title>/<html lang>/hreflang okuyan
  // /api/onboarding/prefill çağrısının durumunu izler.
  const [timezone, setTimezone] = useState<string>(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return "Europe/Istanbul";
    }
  });
  const [prefilling, setPrefilling] = useState(false);
  const [prefillWarning, setPrefillWarning] = useState<string | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);

  const [brandName, setBrandName] = useState("");
  const [brandDomain, setBrandDomain] = useState("");
  const [description, setDescription] = useState("");
  const [industry, setIndustry] = useState("");
  const [identityAdjectives, setIdentityAdjectives] = useState<string[]>([]);
  const [competitorList, setCompetitorList] = useState<BrandRow[]>([]);

  const [productTags, setProductTags] = useState<string[]>([]);
  // Kart 8 — "Hedef pazarlar: harita ve ülke seçici". Diziydeki ilk kod "birincil pazar" —
  // sunucuya gönderilen tek `country` alanını (lib/onboarding-engine.ts'in topic/prompt
  // lokalizasyonu için kullandığı) o belirler; sonrakiler sadece haritada/etiketlerde görünür,
  // bugün başka hiçbir üretim adımını etkilemez — bu, backend'in zaten tek-ülke tasarlanmış
  // olmasından kaynaklanan bilinçli bir kapsam kararı (sahte "her pazar için ayrı içerik
  // üretiliyor" hissi vermemek için burada açıkça not ediliyor).
  const [targetMarkets, setTargetMarkets] = useState<string[]>(["tr"]);

  const [audience, setAudience] = useState<Record<PersonaKey, number>>(EVEN_AUDIENCE);
  // Kart 8 — her persona tek tek "açılıp kapatılabilir". Kapalı bir personanın payı 0'a
  // sabitlenir (aşağıdaki updateAudience/normalizeAudience/togglePersona bunu korur) ve
  // sunucuya hep olduğu gibi gönderilir — lib/onboarding-engine.ts'teki normalizedAudience
  // zaten 0 payı olan bir personayı orantısal olarak sıfıra yakın tutuyor, backend'de ek bir
  // "enabled" alanı gerekmedi.
  const [personaEnabled, setPersonaEnabled] = useState<Record<PersonaKey, boolean>>({ simple: true, informed: true, researcher: true });
  const [personaOpen, setPersonaOpen] = useState<Record<PersonaKey, boolean>>({ simple: false, informed: false, researcher: false });
  const lastNonZeroAudienceRef = useRef<Record<PersonaKey, number>>({ ...EVEN_AUDIENCE });

  const [topicResult, setTopicResult] = useState<{ candidates: TopicCandidate[]; autoSelected: string[] } | null>(null);
  const [topicsError, setTopicsError] = useState<string | null>(null);
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());

  const [includeBrandedTopic, setIncludeBrandedTopic] = useState(false);
  // Full 80-prompt set + branded-topic set, as generated server-side — the review screen below
  // only ever filters these client-side, it never fetches more.
  const [allPrompts, setAllPrompts] = useState<SlotFilledPrompt[]>([]);
  const [brandedPrompts, setBrandedPrompts] = useState<SlotFilledPrompt[]>([]);
  const [promptsError, setPromptsError] = useState<string | null>(null);
  const [checkedPrompts, setCheckedPrompts] = useState<Set<number>>(new Set());

  // Kart: Otomatik onboarding zinciri — the one onboarding_sessions row this wizard instance is
  // watching, and its latest poll (bekliyor/çalışıyor/hazır/hata per step).
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [crawlStatus, setCrawlStatus] = useState<StepStatus>("pending");
  const [profileStatus, setProfileStatus] = useState<StepStatus>("pending");
  const [competitorsStatus, setCompetitorsStatus] = useState<StepStatus>("pending");
  const [topicsStatus, setTopicsStatus] = useState<StepStatus>("pending");
  const [promptsStatus, setPromptsStatus] = useState<StepStatus>("pending");

  // Kart: Değişiklikte yeniden üretim (hash kontrolü) — whether the regenerate call is
  // currently in flight, and the last error it hit (shown on the topics step, which still
  // renders the previous, pre-edit content underneath — a failed update never blocks the
  // user, it just means what they see may be stale).
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);

  const urlStartedForRef = useRef<string | null>(null);
  // Guards against a later poll re-copying server data over fields the user has since edited
  // by hand — each step's data is copied into editable state exactly once, the first time
  // that step's status is seen as "ready".
  const appliedStepsRef = useRef<Set<string>>(new Set());
  // Kart: Değişiklikte yeniden üretim — the exact (description, industry, productTags) the
  // server's current topicResult/allPrompts were generated from. Set once when the server's
  // own first topics pass lands (applySession, below) and again after every successful
  // regenerate call — comparing against this (not against "did the user touch the form at
  // all") is what makes an edit-then-revert-back-to-the-original-text a no-op, not a forced
  // regen.
  const lastSyncedProfileRef = useRef<{ description: string; industry: string; productTags: string[] } | null>(null);
  const hasStartedRunningRef = useRef(false);
  const runningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resume on page refresh (kabul kriteri: "Sayfa yenilendiğinde kullanıcı kaldığı adımdan
  // devam eder") — the session id survives in the URL's query string, same pattern as
  // app/geo/page.tsx's ?clientId=.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("onboardingSession");
    if (!id || !Number.isInteger(Number(id))) return;
    setSessionId(Number(id));
    setStep("profile");
  }, []);

  function handleUnauthorized(res: Response) {
    if (res.status === 401) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
      return true;
    }
    return false;
  }

  function applySession(s: any) {
    setCrawlStatus(s.crawlStatus);
    setProfileStatus(s.profileStatus);
    setCompetitorsStatus(s.competitorsStatus);
    setTopicsStatus(s.topicsStatus);
    setPromptsStatus(s.promptsStatus);

    if (s.crawlStatus === "error") setDiscoverError(s.crawlError ?? "Tarama başarısız oldu");

    if (s.profileStatus === "ready" && s.profileResult && !appliedStepsRef.current.has("profile")) {
      appliedStepsRef.current.add("profile");
      const p = s.profileResult;
      setBrandName(p.brand.name);
      setBrandDomain(p.brand.domain);
      setDescription(p.description);
      setIndustry(p.industry);
      setIdentityAdjectives(p.identityAdjectives ?? []);
      setProductTags(p.productTags ?? []);
      setAudience(p.personas ?? EVEN_AUDIENCE);
      if (p.demoMode) setAnyDemoMode(true);
      // The server's topics/prompts steps (still pending at this exact moment, or already
      // running) will use THIS snapshot — whatever the user types from here on is compared
      // against it, not against some later, possibly-stale copy.
      lastSyncedProfileRef.current = { description: p.description, industry: p.industry, productTags: p.productTags ?? [] };
    }
    if (s.profileStatus === "error") setDiscoverError(s.profileError ?? "Marka profili çıkarılamadı");

    if (s.competitorsStatus === "ready" && s.competitorsResult && !appliedStepsRef.current.has("competitors")) {
      appliedStepsRef.current.add("competitors");
      const list: BrandRow[] = s.competitorsResult.competitors?.length ? s.competitorsResult.competitors : [{ name: "", domain: "" }];
      setCompetitorList(list);
      if (s.competitorsResult.demoMode) setAnyDemoMode(true);
    }

    if (s.topicsStatus === "ready" && s.topicsResult && !appliedStepsRef.current.has("topics")) {
      appliedStepsRef.current.add("topics");
      setTopicResult({ candidates: s.topicsResult.candidates, autoSelected: s.topicsResult.autoSelected });
      setSelectedTopics(new Set(s.topicsResult.autoSelected));
      if (s.topicsResult.demoMode) setAnyDemoMode(true);
    }
    if (s.topicsStatus === "error") setTopicsError(s.topicsError ?? "Topic üretimi başarısız oldu");

    if (s.promptsStatus === "ready" && s.promptsResult && !appliedStepsRef.current.has("prompts")) {
      appliedStepsRef.current.add("prompts");
      setAllPrompts(s.promptsResult.prompts ?? []);
      setBrandedPrompts(s.promptsResult.brandedPrompts ?? []);
      if (s.promptsResult.demoMode) setAnyDemoMode(true);
    }
    if (s.promptsStatus === "error") setPromptsError(s.promptsError ?? "Prompt üretimi başarısız oldu");
  }

  // Polls the session row until the chain reaches a terminal state (prompts ready/error, or
  // crawl itself failing everything upstream). Runs entirely server-side (lib/onboarding-
  // engine.ts) — this effect only ever reads, never drives the chain.
  useEffect(() => {
    if (sessionId == null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const res = await fetch(`/api/onboarding/sessions/${sessionId}`);
        if (handleUnauthorized(res)) return;
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Oturum okunamadı");
        if (cancelled) return;
        applySession(data.session);
        const terminal =
          data.session.crawlStatus === "error" ||
          data.session.promptsStatus === "ready" ||
          data.session.promptsStatus === "error";
        if (!terminal) timer = setTimeout(poll, 1000);
      } catch {
        if (!cancelled) timer = setTimeout(poll, 2000); // transient hiccup — keep polling
      }
    }
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Once the real GEO test (handed off in finish()) actually starts, watch for it to
  // finish and close the wizard — with a 25s safety timeout in case the parent's loading
  // flag never flips true at all (e.g. a validation error short-circuited before the fetch).
  useEffect(() => {
    if (step !== "running") return;
    if (running) {
      hasStartedRunningRef.current = true;
      if (runningTimeoutRef.current) clearTimeout(runningTimeoutRef.current);
    } else if (hasStartedRunningRef.current) {
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, step]);

  useEffect(() => {
    if (step !== "running") return;
    runningTimeoutRef.current = setTimeout(() => {
      if (!hasStartedRunningRef.current) onClose();
    }, 25000);
    return () => {
      if (runningTimeoutRef.current) clearTimeout(runningTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Kart: Otomatik onboarding zinciri + Kart: LLM'siz otomatik doldurma — fires on URL field
  // BLUR, not on a button click. Guarded by urlStartedForRef so tabbing in and out of the
  // field without changing it doesn't open a second session, and so a resumed session
  // (sessionId already set from the URL query string on mount) never gets clobbered by an
  // accidental re-fire. Two independent requests start at the exact same moment and never
  // wait on each other: the heavy, LLM-driven chain (/api/onboarding/sessions, unchanged from
  // Kart 1) and the light, LLM-free Step-1 field guess (/api/onboarding/prefill, new) — one
  // slow+accurate, one fast+approximate, each filling in whatever it can as it finishes.
  async function handleUrlBlur() {
    const trimmed = url.trim();
    if (!trimmed || urlStartedForRef.current === trimmed || sessionId != null) return;
    urlStartedForRef.current = trimmed;
    setDiscoverError(null);
    setPrefillWarning(null);
    setCreatingSession(true);

    setPrefilling(true);
    fetch("/api/onboarding/prefill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: trimmed }),
    })
      .then((res) => (handleUnauthorized(res) ? null : res.json()))
      .then((data) => {
        if (!data) return;
        if (data.brandNameGuess) setBrandName(data.brandNameGuess);
        if (data.domain) setBrandDomain(data.domain);
        if (data.countryGuess) {
          // data.countryGuess bir Türkçe ülke adı (ör. "Türkiye") — lib/country-map.ts'teki
          // sabit listeyle eşleşmezse (yani prefill'in TLD/hreflang tablosu bu wizard'ın
          // haritada gösterdiği ~40 ülkelik listenin dışında bir isim üretmişse) sessizce
          // yoksayılır, asla tahmini bir kod uydurulmaz.
          const code = countryCodeFromName(data.countryGuess);
          if (code) setTargetMarkets([code]);
        }
        if (data.languageGuess) setLanguage(data.languageGuess);
        if (data.reachable === false) {
          setPrefillWarning(data.warning ?? "Site'ye ulaşılamadı — alanlar domain'den tahmin edildi, gözden geçirin.");
        }
      })
      .catch(() => {
        // Sessizce geç — bu sadece hızlı bir kolaylık tahmini; asıl doğru profil Step 2'de
        // zaten Kart 1'in LLM'li zinciriyle geliyor, burada bir hata hiçbir şeyi bloklamamalı.
      })
      .finally(() => setPrefilling(false));

    try {
      const res = await fetch("/api/onboarding/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed, language, country: countryNameFromCode(targetMarkets[0]) || "Türkiye" }),
      });
      if (handleUnauthorized(res)) return;
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Oturum başlatılamadı");
      setSessionId(data.sessionId);
      // Carry the session id in the URL so a refresh resumes instead of restarting — mirrors
      // app/geo/page.tsx's ?clientId= pattern.
      const next = new URL(window.location.href);
      next.searchParams.set("onboardingSession", String(data.sessionId));
      window.history.replaceState({}, "", next.toString());
      // Kart: LLM'siz otomatik doldurma — artık otomatik ilerlemiyoruz: kullanıcı Step 1'in
      // kendi (hızlı, LLM'siz) tahminlerini gözden geçirip "İleri →"ye kendisi basıyor; Kart
      // 1'in zinciri bu arada zaten arka planda çalışmaya başladı.
    } catch (err) {
      urlStartedForRef.current = null;
      setDiscoverError(err instanceof Error ? err.message : "Bir şeyler ters gitti");
    } finally {
      setCreatingSession(false);
    }
  }

  function updateCompetitor(i: number, field: keyof BrandRow, value: string) {
    setCompetitorList((prev) => prev.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)));
  }

  // Kart 8 — haritadan tıklayarak veya "+ Pazar ekle" seçiciyle toggle. En az bir pazar her
  // zaman seçili kalır (sunucuya gönderilen tek `country` alanı bir şeye dayanmak zorunda) —
  // son kalan pazarı kaldırmak sessizce hiçbir şey yapmaz.
  function toggleTargetMarket(code: string) {
    setTargetMarkets((prev) => {
      if (prev.includes(code)) {
        if (prev.length === 1) return prev;
        return prev.filter((c) => c !== code);
      }
      return [...prev, code];
    });
  }

  function updateAudience(key: PersonaKey, value: string) {
    const next = Math.max(0, Number(value) || 0);
    setAudience((prev) => ({ ...prev, [key]: next }));
    if (next > 0) lastNonZeroAudienceRef.current[key] = next;
  }

  // Kart 8 — persona açma/kapama. Kapatma: mevcut payı hatırlayıp (açıldığında geri gelsin)
  // 0'a sabitler. Açma: hatırlanan son pozitif payı (yoksa eşit bölünmüş bir varsayılanı) geri
  // yükler — ama toplamı otomatik olarak 100'e tamamlamaz, kullanıcı "Eşit böl"e basabilir ya
  // da elle düzeltir, tıpkı herhangi bir elle yapılan düzenleme gibi.
  function togglePersona(key: PersonaKey) {
    setPersonaEnabled((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (!next[key]) {
        if (audience[key] > 0) lastNonZeroAudienceRef.current[key] = audience[key];
        setAudience((a) => ({ ...a, [key]: 0 }));
      } else {
        const restored = lastNonZeroAudienceRef.current[key] || Math.floor(100 / PERSONA_ORDER.length);
        setAudience((a) => ({ ...a, [key]: restored }));
      }
      return next;
    });
  }

  function normalizeAudience() {
    const enabledKeys = PERSONA_ORDER.filter((k) => personaEnabled[k]);
    const pool = enabledKeys.length > 0 ? enabledKeys : PERSONA_ORDER; // hepsi kapalıysa yine de bir dağılım göster
    const even = Math.floor(100 / pool.length);
    const next: Record<PersonaKey, number> = { simple: 0, informed: 0, researcher: 0 };
    pool.forEach((k, i) => {
      next[k] = i === pool.length - 1 ? 100 - even * (pool.length - 1) : even;
    });
    setAudience(next);
    pool.forEach((k) => (lastNonZeroAudienceRef.current[k] = next[k]));
  }

  const audienceTotal = PERSONA_ORDER.reduce((sum, k) => sum + (audience[k] || 0), 0);

  function toggleTopic(topic: string) {
    setSelectedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(topic)) next.delete(topic);
      else next.add(topic);
      return next;
    });
  }

  // All 80 (10×8) prompts, plus the 6 branded-topic ones, already exist server-side by the
  // time this screen is reachable — toggling a topic or the branded checkbox is just a filter
  // over data already in hand, never a new fetch.
  const prompts = useMemo(() => {
    if (allPrompts.length === 0 && brandedPrompts.length === 0) return null;
    const base = allPrompts.filter((p) => selectedTopics.has(p.topic));
    return includeBrandedTopic ? [...base, ...brandedPrompts] : base;
  }, [allPrompts, brandedPrompts, selectedTopics, includeBrandedTopic]);

  // Default to "everything visible is checked" whenever the visible set actually changes
  // (a new topic toggled on/off, or the branded checkbox flipped) — matches the old
  // fetch-replaces-selection behavior without needing a network round trip to get there.
  const promptsKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!prompts) return;
    const key = prompts.map((p) => `${p.topic}::${p.text}`).join("|");
    if (promptsKeyRef.current === key) return;
    promptsKeyRef.current = key;
    setCheckedPrompts(new Set(prompts.map((_, i) => i)));
  }, [prompts]);

  function togglePrompt(i: number) {
    setCheckedPrompts((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  // Kart: Değişiklikte yeniden üretim (hash kontrolü) — the ONLY place this wizard decides
  // whether to re-run topic/prompt generation, triggered right when the user is about to see
  // the topics step (the audience step's "İleri →"). Comparing locally first means "nothing
  // changed" costs zero network round-trips (Adım 3 anında açılır); only an actual edit to
  // description/industry/productTags reaches the server at all — identityAdjectives/brandName/
  // competitors/audience are deliberately left out of this comparison (per the card, an
  // adjective-only edit must never trigger a regen), even though they're still sent along as
  // context for whichever regeneration a REAL trigger ends up running.
  function profileUnchanged() {
    const synced = lastSyncedProfileRef.current;
    return (
      synced != null &&
      description === synced.description &&
      industry === synced.industry &&
      productTags.length === synced.productTags.length &&
      productTags.every((p, i) => p === synced.productTags[i])
    );
  }

  // Kart 2 — the user edited the profile but Next was pressed BEFORE the first server-side
  // topic/prompt generation finished. We never block Next on that (Adım 3 has its own
  // loading state), but the edit must not be silently dropped either: it's remembered here
  // and the regeneration runs automatically the moment topics+prompts flip to "ready".
  const pendingRegenRef = useRef(false);

  async function runRegenerate() {
    if (sessionId == null) return;
    setRegenerateError(null);
    setRegenerating(true);
    try {
      const res = await fetch(`/api/onboarding/sessions/${sessionId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, industry, productTags, brandName, brandDomain, identityAdjectives, competitors: competitorList, audience }),
      });
      if (handleUnauthorized(res)) return;
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Güncellenemedi");

      if (data.changed) {
        const newTopics: TopicCandidate[] = data.topicsResult.candidates;
        setTopicResult({ candidates: newTopics, autoSelected: data.topicsResult.autoSelected });
        setSelectedTopics((prev) => {
          if (data.mode === "full") {
            // The whole topic list was replaced — any previous selection may point at
            // names that no longer exist, so fall back to the server's fresh top-5 pick,
            // same default the very first generation uses.
            return new Set<string>(data.topicsResult.autoSelected);
          }
          // Partial: keep selections for topics that survived, drop ones that were
          // removed (their product was deleted), add newly-generated ones pre-checked.
          const validNames = new Set(newTopics.map((t) => t.name));
          const next = new Set([...prev].filter((n) => validNames.has(n)));
          (data.addedTopics ?? []).forEach((n: string) => next.add(n));
          return next;
        });
        setAllPrompts(data.promptsResult.prompts ?? []);
        setBrandedPrompts(data.promptsResult.brandedPrompts ?? []);
        if (data.topicsResult.demoMode || data.promptsResult.demoMode) setAnyDemoMode(true);
      }
      lastSyncedProfileRef.current = { description, industry, productTags };
    } catch (err) {
      // Never block the user on a failed update — keep showing whatever topics/prompts are
      // already in state (pre-edit, so still correct, just possibly stale) and surface why.
      setRegenerateError(err instanceof Error ? err.message : "Güncellenemedi — önceki içerik gösteriliyor");
    } finally {
      setRegenerating(false);
    }
  }

  // Kart: Değişiklikte yeniden üretim (hash kontrolü) — the ONLY place this wizard decides
  // whether to re-run topic/prompt generation, triggered right when the user is about to see
  // the topics step (the audience step's "İleri →"). Comparing locally first means "nothing
  // changed" costs zero network round-trips (Adım 3 anında açılır — Kart 2 kabul kriteri);
  // only an actual edit to description/industry/productTags reaches the server at all —
  // identityAdjectives/brandName/competitors/audience are deliberately left out of this
  // comparison (an adjective-only edit must never trigger a regen), even though they're still
  // sent along as context for whichever regeneration a REAL trigger ends up running.
  async function handleEnterTopics() {
    if (profileUnchanged()) {
      setStep("topics");
      return;
    }
    // First-time generation still running — open Adım 3 right away (it shows its own
    // loading state) and queue the edit; the effect below fires it once data is ready.
    if (topicsStatus !== "ready" || promptsStatus !== "ready" || sessionId == null) {
      pendingRegenRef.current = true;
      setStep("topics");
      return;
    }
    await runRegenerate();
    setStep("topics");
  }

  useEffect(() => {
    if (!pendingRegenRef.current) return;
    if (topicsStatus !== "ready" || promptsStatus !== "ready" || sessionId == null) return;
    pendingRegenRef.current = false;
    if (!profileUnchanged()) void runRegenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicsStatus, promptsStatus, sessionId]);

  function clearSessionParam() {
    const next = new URL(window.location.href);
    next.searchParams.delete("onboardingSession");
    window.history.replaceState({}, "", next.toString());
  }

  function finish() {
    const brand = { name: brandName.trim(), domain: brandDomain.trim() };
    const competitors = competitorList.filter((c) => c.name.trim() && c.domain.trim());
    const chosen = (prompts ?? []).filter((_, i) => checkedPrompts.has(i));
    const promptsText = chosen.map((p) => `${p.topic}: ${p.text}`).join("\n");
    setStep("running");
    clearSessionParam();
    onComplete(brand, competitors, promptsText);
  }

  const promptsByTopic = (topicResult?.candidates ?? [])
    .filter((t) => selectedTopics.has(t.name))
    .map((t) => ({
      topic: t.name,
      items: (prompts ?? []).map((p, i) => ({ ...p, i })).filter((p) => p.topic === t.name),
    }));
  const brandedTopicLabel = `${brandName} Hakkında`;
  if (includeBrandedTopic && (prompts ?? []).some((p) => p.topic === brandedTopicLabel)) {
    promptsByTopic.push({
      topic: brandedTopicLabel,
      items: (prompts ?? []).map((p, i) => ({ ...p, i })).filter((p) => p.topic === brandedTopicLabel),
    });
  }
  const visiblePromptCount = promptsByTopic.reduce((sum, g) => sum + g.items.length, 0);

  const STEP_ORDER: Step[] = ["url", "profile", "market", "audience", "topics", "prompts"];
  const stepIndex = STEP_ORDER.indexOf(step);

  return (
    <div className="card space-y-4 border-accent/30">
      <style>{`
        .owz-field-in { animation: owz-field-in 260ms ease both; }
        @keyframes owz-field-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink/40">
          {["URL", "Marka profili", "Ürün & pazar", "Kitle", "Topic'ler", "Promptlar"].map((label, i) => (
            <span key={label} className={i <= stepIndex && step !== "running" ? "text-accent font-semibold" : ""}>
              {i > 0 && "→ "}
              {i + 1}. {label}
            </span>
          ))}
        </div>
        {step !== "running" && (
          <button
            type="button"
            onClick={() => {
              clearSessionParam();
              onClose();
            }}
            className="text-xs text-ink/40 hover:text-ink/70"
          >
            ✕ Kapat
          </button>
        )}
      </div>

      {anyDemoMode && step !== "running" && (
        <div className="rounded-lg border border-warn/40 text-warn text-xs px-3 py-2">
          <strong>Demo modda</strong> çalışıyor — bazı adımlar gerçek bir model API anahtarı olmadan simüle edildi, açıkça işaretli.
        </div>
      )}

      {step === "url" && (
        <div className="space-y-3">
          <h2 className="font-bold text-sm">Proje detaylarını ekleyin</h2>
          <p className="text-xs text-ink/50">
            Markanızın görünürlüğünü AI yanıtlarında izleyin. URL&apos;i yazıp başka bir alana geçin (Tab veya
            tıklayın) — aşağıdaki alanlar saniyeler içinde kendiliğinden dolar, siz sadece gözden geçirip
            düzeltirsiniz. Aynı anda arka planda taramayı, marka profilini, rakip önerilerini, konu başlıklarını ve
            promptları da üretmeye başlarız (Kart 1) — hiçbir şeye basmanız gerekmez.
          </p>

          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-ink/50">Marka URL&apos;si</h3>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onBlur={handleUrlBlur}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              placeholder="https://markaniz.com"
              required
              autoFocus
              className={inputClass}
            />
          </div>
          {discoverError && <p className="text-xs text-danger">{discoverError}</p>}
          {prefillWarning && <p className="text-xs text-warn/90">⚠️ {prefillWarning}</p>}

          {/* Kart: LLM'siz otomatik doldurma — og:site_name/<title>/TLD/<html lang>/hreflang
              üzerinden, hiçbir model çağrısı yapmadan; Marka adı dışındakiler (Ülke/Dil/Saat
              dilimi) her zaman makul bir varsayılanla başladığı için (Türkiye/tr/tarayıcı saat
              dilimi) orada boş-görünen bir iskelete gerek yok — sadece gerçekten boş başlayan
              Marka adı alanı, tahmin gelene kadar iskelet gösteriyor. */}
          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-ink/50">Marka adı</h3>
            {prefilling && !brandName ? (
              <SkeletonBar height="2.6rem" />
            ) : (
              <input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="Marka adı" className={inputClass} />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-ink/50">Ülke</h3>
              {/* Step 1'in hızlı/LLM'siz tahmini: tek, birincil pazar. Birden fazla hedef
                  pazar eklemek (harita + çoklu seçim) Adım 3 "Ürünler ve hedef pazar"da. */}
              <select
                value={targetMarkets[0] ?? "tr"}
                onChange={(e) => setTargetMarkets([e.target.value])}
                className={inputClass}
              >
                {TARGET_MARKET_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.nameTr}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-ink/50">Dil</h3>
              <select value={language} onChange={(e) => setLanguage(e.target.value as "tr" | "en")} className={inputClass}>
                <option value="tr">🇹🇷 Türkçe</option>
                <option value="en">🇬🇧 English</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-ink/50">Saat dilimi</h3>
            {/* Intl.supportedValuesOf("timeZone") doesn't always include every value
                resolvedOptions().timeZone can return (e.g. plain "UTC" on some systems) — the
                detected zone is always added to the list if it's missing, so the select never
                silently falls back to showing an unrelated first option instead of what was
                actually detected. */}
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputClass}>
              {(TIMEZONE_OPTIONS.includes(timezone) ? TIMEZONE_OPTIONS : [timezone, ...TIMEZONE_OPTIONS]).map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            disabled={!sessionId}
            onClick={() => setStep("profile")}
            className="rounded-lg bg-accent text-white px-5 py-2.5 text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {creatingSession ? "Taranıyor…" : "İleri →"}
          </button>
        </div>
      )}

      {step === "profile" && (
        <div className="space-y-3">
          <h2 className="font-bold text-sm">Marka profili</h2>
          {(crawlStatus === "pending" || crawlStatus === "running" || profileStatus === "running") && (
            <p className="text-xs text-ink/40">
              {crawlStatus !== "ready" ? "Sayfa taranıyor…" : "Marka profili çıkarılıyor…"} Rakip önerileri de aynı anda
              hazırlanıyor.
            </p>
          )}
          {(crawlStatus === "error" || profileStatus === "error") && (
            <div className="rounded-lg border border-danger/40 text-danger text-xs px-3 py-2 space-y-2">
              <p>{discoverError}</p>
              <button
                type="button"
                onClick={() => {
                  setSessionId(null);
                  urlStartedForRef.current = null;
                  appliedStepsRef.current = new Set();
                  setDiscoverError(null);
                  const next = new URL(window.location.href);
                  next.searchParams.delete("onboardingSession");
                  window.history.replaceState({}, "", next.toString());
                  setStep("url");
                }}
                className="text-accent hover:underline font-medium"
              >
                ← URL&apos;yi düzelt, tekrar dene
              </button>
            </div>
          )}
          {profileStatus !== "ready" && profileStatus !== "error" ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <SkeletonBar height="2.6rem" />
                <SkeletonBar height="2.6rem" />
              </div>
              <SkeletonBar height="3.5rem" />
              <SkeletonBar height="2.6rem" width="55%" />
              <div className="space-y-1">
                <SkeletonBar height="0.7rem" width="35%" />
                <div className="flex gap-2">
                  <SkeletonBar height="1.8rem" width="5rem" className="rounded-full" />
                  <SkeletonBar height="1.8rem" width="6rem" className="rounded-full" />
                  <SkeletonBar height="1.8rem" width="4.5rem" className="rounded-full" />
                </div>
              </div>
              <div className="space-y-2">
                <SkeletonBar height="0.7rem" width="40%" />
                <SkeletonBar height="2.6rem" />
                <SkeletonBar height="2.6rem" />
              </div>
            </div>
          ) : (
            <>
              <RevealField index={0}>
                <div className="grid grid-cols-2 gap-3">
                  <input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="Marka adı" className={inputClass} />
                  <input value={brandDomain} onChange={(e) => setBrandDomain(e.target.value)} placeholder="Domain" className={inputClass} />
                </div>
              </RevealField>
              <RevealField index={1}>
                <div className="space-y-1">
                  <h3 className="text-xs font-semibold text-ink/50">Açıklama</h3>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    placeholder="Markanın ne yaptığını 2-3 cümleyle anlatın"
                    className={`${inputClass} resize-y leading-relaxed`}
                  />
                </div>
              </RevealField>
              <RevealField index={2}>
                <div className="space-y-1">
                  <h3 className="text-xs font-semibold text-ink/50">Sektör</h3>
                  <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="örn. Dijital pazarlama ajansı" className={inputClass} />
                </div>
              </RevealField>

              <RevealField index={3}>
                <div className="space-y-1">
                  <h3 className="text-xs font-semibold text-ink/50">Marka kimliği (sıfatlar)</h3>
                  <TagEditor tags={identityAdjectives} onChange={setIdentityAdjectives} placeholder="örn. güvenilir" />
                </div>
              </RevealField>

              <RevealField index={4}>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-ink/50">Önerilen rakipler</h3>
                    <button
                      type="button"
                      onClick={() => setCompetitorList((c) => [...c, { name: "", domain: "" }])}
                      className="text-xs text-accent hover:underline"
                    >
                      + Rakip ekle
                    </button>
                  </div>
                  {competitorsStatus === "running" && <p className="text-xs text-ink/40">Rakip önerileri hazırlanıyor…</p>}
                  {competitorsStatus === "error" && (
                    <p className="text-xs text-ink/40">Rakip önerisi başarısız oldu — aşağıya elle ekleyebilirsiniz.</p>
                  )}
                  <p className="text-xs text-warn/90">
                    ⚠️ Bu öneriler sayfa içeriğinden değil modelin genel sektör bilgisinden geliyor — yanlış olabilir (ör. bir
                    dijital pazarlama ajansı için ERP yazılımı önerebilir). Mutlaka gözden geçirin, gerekirse silin/düzeltin.
                  </p>
                  {competitorList.map((c, i) => (
                    <div key={i} className="grid grid-cols-2 gap-3">
                      <input value={c.name} onChange={(e) => updateCompetitor(i, "name", e.target.value)} placeholder="Rakip adı" className={inputClass} />
                      <input value={c.domain} onChange={(e) => updateCompetitor(i, "domain", e.target.value)} placeholder="rakip-domaini.com" className={inputClass} />
                    </div>
                  ))}
                </div>
              </RevealField>
            </>
          )}

          <button
            type="button"
            onClick={() => setStep("market")}
            className="rounded-lg bg-accent text-white px-5 py-2.5 text-sm font-bold hover:opacity-90 transition-opacity"
          >
            İleri →
          </button>
        </div>
      )}

      {step === "market" && (
        <div className="space-y-3">
          <h2 className="font-bold text-sm">Ürünler ve hedef pazar</h2>
          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-ink/50">Ürünler ve hizmetler</h3>
            {profileStatus !== "ready" && profileStatus !== "error" ? (
              <div className="flex gap-2">
                <SkeletonBar height="1.8rem" width="6rem" className="rounded-full" />
                <SkeletonBar height="1.8rem" width="7rem" className="rounded-full" />
              </div>
            ) : (
              <RevealField index={0}>
                <TagEditor tags={productTags} onChange={setProductTags} placeholder="örn. SEO danışmanlığı" />
              </RevealField>
            )}
          </div>
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-ink/50">Hedef pazarlar</h3>
            <p className="text-xs text-ink/40">
              Haritadan tıklayarak ya da listeden seçerek birden fazla pazar ekleyebilirsiniz — ilki (⭐) konu ve prompt
              üretiminde kullanılan birincil pazar olur.
            </p>
            <WorldMapPicker selected={targetMarkets} onToggle={toggleTargetMarket} />
            <div className="flex flex-wrap gap-2">
              {targetMarkets.map((code, i) => {
                const name = countryNameFromCode(code) ?? code;
                const isOnly = targetMarkets.length === 1;
                return (
                  <span key={code} className="inline-flex items-center gap-1 rounded-full bg-muted border border-border px-3 py-1 text-xs">
                    {i === 0 && <span title="Birincil pazar">⭐</span>}
                    {name}
                    <button
                      type="button"
                      onClick={() => toggleTargetMarket(code)}
                      disabled={isOnly}
                      title={isOnly ? "En az bir pazar seçili olmalı" : "Kaldır"}
                      className="text-ink/40 hover:text-danger disabled:opacity-30 disabled:hover:text-ink/40"
                    >
                      ✕
                    </button>
                  </span>
                );
              })}
            </div>
            {/* Seçimden sonra placeholder'a dönmesi için: eklenen pazar listesi değiştiğinde
                select "key" değişip yeniden mount olur, native bir reset ihtiyacı kalmaz. */}
            <select
              key={targetMarkets.join(",")}
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) toggleTargetMarket(e.target.value);
              }}
              className={inputClass}
            >
              <option value="" disabled>
                + Pazar ekle…
              </option>
              {TARGET_MARKET_COUNTRIES.filter((c) => !targetMarkets.includes(c.code)).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.nameTr}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setStep("profile")} className="text-sm text-ink/50 hover:underline">
              ← Geri
            </button>
            <button
              type="button"
              onClick={() => setStep("audience")}
              className="rounded-lg bg-accent text-white px-5 py-2.5 text-sm font-bold hover:opacity-90 transition-opacity"
            >
              İleri →
            </button>
          </div>
        </div>
      )}

      {step === "audience" && (
        <div className="space-y-3">
          <h2 className="font-bold text-sm">Kitle dağılımı</h2>
          <p className="text-xs text-ink/50">
            Bu dağılım bir sonraki adımda üretilecek promptların kimin ağzından (basit öneri arayan / bilinçli alıcı /
            detaylı araştırmacı) yazılacağını belirler — yüzdelerin toplamı 100 olmalı. Bunlar sabit 3 arketip; markaya
            özel persona isimleri burada yok, sadece payları.
          </p>
          {PERSONA_ORDER.map((key) => {
            const enabled = personaEnabled[key];
            return (
              <div key={key} className={`rounded-lg border border-border p-3 space-y-1 ${enabled ? "" : "opacity-50"}`}>
                <div className="flex items-center gap-3">
                  {/* Kart 8 — "her biri açılıp kapatılabilir": kapalı bir persona payı 0'a
                      sabitlenir, %100 toplamına ve promptları üreten slot planına hiç girmez. */}
                  <button
                    type="button"
                    onClick={() => togglePersona(key)}
                    title={enabled ? "Bu personayı kapat" : "Bu personayı aç"}
                    className={`relative w-9 h-5 rounded-full shrink-0 transition-colors ${enabled ? "bg-accent" : "bg-border"}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-4" : "translate-x-0"}`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPersonaOpen((prev) => ({ ...prev, [key]: !prev[key] }))}
                    aria-expanded={personaOpen[key]}
                    className="flex-1 flex items-center gap-2 text-left"
                  >
                    <span className="text-sm font-semibold">{PERSONA_LABEL[key]}</span>
                    <span className={`text-ink/40 text-xs transition-transform ${personaOpen[key] ? "rotate-180" : ""}`}>▾</span>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      disabled={!enabled}
                      value={audience[key]}
                      onChange={(e) => updateAudience(key, e.target.value)}
                      className={`${inputClass} w-20 disabled:opacity-50`}
                    />
                    <span className="text-xs text-ink/40">%</span>
                  </div>
                </div>
                {personaOpen[key] && (
                  <div className="pl-12 pt-1 space-y-1 text-xs text-ink/60">
                    <p>{PERSONA_DESCRIPTION[key]}</p>
                    <p className="text-ink/40">Örnek soru: “{PERSONA_EXAMPLE[key]}”</p>
                  </div>
                )}
              </div>
            );
          })}
          <p className={`text-xs ${audienceTotal === 100 ? "text-ink/40" : "text-danger"}`}>
            Toplam: %{audienceTotal}{audienceTotal !== 100 && " — 100 olmalı"}
            {audienceTotal !== 100 && (
              <button type="button" onClick={normalizeAudience} className="ml-2 text-accent hover:underline">
                Eşit böl
              </button>
            )}
          </p>
          <p className="text-xs text-ink/30">
            {topicsStatus === "running" || topicsStatus === "pending"
              ? "Konu başlıkları arka planda hazırlanıyor — devam edince hazır olacak…"
              : topicResult
                ? `${topicResult.candidates.length} konu başlığı hazır.`
                : topicsError ?? ""}
          </p>
          <div className="flex gap-3">
            <button type="button" onClick={() => setStep("market")} className="text-sm text-ink/50 hover:underline">
              ← Geri
            </button>
            <button
              type="button"
              disabled={regenerating || audienceTotal !== 100}
              title={audienceTotal !== 100 ? "Kitle dağılımının toplamı %100 olmalı" : undefined}
              onClick={handleEnterTopics}
              className="rounded-lg bg-accent text-white px-5 py-2.5 text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {regenerating ? "Profil değişikliklerine göre güncelleniyor…" : "İleri →"}
            </button>
          </div>
        </div>
      )}

      {step === "topics" && (
        <div className="space-y-3">
          <h2 className="font-bold text-sm">Hangi konu başlıklarını takip edelim?</h2>
          {regenerateError && (
            <div className="rounded-lg border border-warn/40 text-warn text-xs px-3 py-2">
              Profil değişikliğine göre güncellenemedi: {regenerateError} — önceki konu başlıkları/promptlar
              gösteriliyor.
            </div>
          )}
          <p className="text-xs text-ink/50">
            Markanız ve kategoriniz için üretilen {topicResult?.candidates.length ?? "…"} konu başlığından en iyi 5 tanesi
            otomatik seçildi (iş önemi, markaya uygunluk ve talep skoruna göre) — isterseniz değiştirin.
          </p>
          {(topicsStatus === "running" || topicsStatus === "pending") && !topicResult && (
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <SkeletonBar key={i} height="1.9rem" width={`${5 + (i % 4)}rem`} className="rounded-full" />
              ))}
            </div>
          )}
          {topicsError && !topicResult && <p className="text-xs text-danger">{topicsError}</p>}
          {topicResult && (
            <RevealField index={0}>
              <div className="flex flex-wrap gap-2">
                {topicResult.candidates.map((t) => (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => toggleTopic(t.name)}
                    title={`${t.description} (${SOURCE_LABEL[t.source]}, skor ${t.score.toFixed(1)})`}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      selectedTopics.has(t.name)
                        ? "bg-accent text-white border-accent"
                        : "bg-muted border-border text-ink/60 hover:border-accent/50"
                    }`}
                  >
                    {t.name}
                    <span className="ml-1 opacity-60">· {SOURCE_LABEL[t.source]}</span>
                  </button>
                ))}
              </div>
            </RevealField>
          )}
          <label className="flex items-start gap-2 text-xs text-ink/60 rounded-lg border border-border px-3 py-2">
            <input type="checkbox" checked={includeBrandedTopic} onChange={(e) => setIncludeBrandedTopic(e.target.checked)} className="mt-0.5" />
            <span>
              &quot;{brandName || "Marka"} Hakkında&quot; konusunu da ekle (markayı doğrudan adıyla soran 6 prompt). Varsayılan
              kapalı — marka adını doğrudan içeren promptlar gerçek keşif görünürlüğünü değil, markayı zaten bilenlerin
              sorularını ölçer.
            </span>
          </label>
          <p className="text-xs text-ink/30">
            {promptsStatus === "running" || promptsStatus === "pending"
              ? "Promptlar arka planda hazırlanıyor…"
              : prompts
                ? `${prompts.length} prompt hazır.`
                : promptsError ?? ""}
          </p>
          <div className="flex gap-3">
            <button type="button" onClick={() => setStep("audience")} className="text-sm text-ink/50 hover:underline">
              ← Geri
            </button>
            <button
              type="button"
              disabled={!topicResult || selectedTopics.size === 0 || ((promptsStatus === "running" || promptsStatus === "pending") && !prompts)}
              onClick={() => setStep("prompts")}
              className="rounded-lg bg-accent text-white px-5 py-2.5 text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {(promptsStatus === "running" || promptsStatus === "pending") && !prompts ? "Promptlar hazırlanıyor…" : "İleri →"}
            </button>
          </div>
        </div>
      )}

      {step === "prompts" && (
        <div className="space-y-3">
          <h2 className="font-bold text-sm">Promptları gözden geçirin</h2>
          <p className="text-xs text-ink/50">
            {checkedPrompts.size}/{visiblePromptCount} prompt seçili — istemediklerinizin işaretini kaldırabilirsiniz. Her
            promptun amacı (niyet/kalıp/persona) kod tarafından önceden planlandı; model sadece cümleyi yazdı.
          </p>
          {(promptsStatus === "running" || promptsStatus === "pending") && !prompts && (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                  <SkeletonBar height="0.9rem" width="45%" />
                  <SkeletonBar height="0.8rem" width="90%" />
                  <SkeletonBar height="0.8rem" width="75%" />
                </div>
              ))}
            </div>
          )}
          {promptsError && !prompts && <p className="text-xs text-danger">{promptsError}</p>}
          {prompts && (
            <div className="max-h-96 overflow-y-auto space-y-2 pr-1">
              {promptsByTopic
                .filter((g) => g.items.length > 0)
                .map((g, gi) => (
                  <RevealField key={g.topic} index={gi}>
                    <details open={gi === 0} className="rounded-lg border border-border">
                      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold flex items-center justify-between">
                        <span>{g.topic}</span>
                        <span className="text-xs text-ink/40 font-normal">{g.items.filter((p) => checkedPrompts.has(p.i)).length}/{g.items.length}</span>
                      </summary>
                      <div className="space-y-1 px-2 pb-2">
                        {g.items.map((p) => (
                          <label key={p.i} className="flex items-start gap-2 text-sm rounded-lg hover:bg-muted px-2 py-1.5">
                            <input type="checkbox" checked={checkedPrompts.has(p.i)} onChange={() => togglePrompt(p.i)} className="mt-0.5" />
                            <span className="flex-1">
                              {p.text}
                              <span className="block text-[10px] text-ink/30 mt-0.5">
                                {PERSONA_LABEL[p.persona]} · {p.intent} · {p.form}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </details>
                  </RevealField>
                ))}
            </div>
          )}
          <div className="flex gap-3">
            <button type="button" onClick={() => setStep("topics")} className="text-sm text-ink/50 hover:underline">
              ← Geri
            </button>
            <button
              type="button"
              disabled={checkedPrompts.size === 0 || !brandName || !brandDomain}
              onClick={finish}
              className="rounded-lg bg-accent text-white px-5 py-2.5 text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              Kurulumu tamamla ve testi çalıştır →
            </button>
          </div>
        </div>
      )}

      {step === "running" && (
        <div className="space-y-4 text-center py-4">
          <h2 className="font-bold text-sm">Promptlar çalıştırılıyor…</h2>
          <p className="text-xs text-ink/50">
            {checkedPrompts.size} prompt, seçtiğiniz AI motorlarına gönderiliyor — bu birkaç dakika sürebilir.
          </p>
          <div className="relative w-40 h-40 mx-auto my-4">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="rounded-full bg-ink text-white text-[10px] font-bold w-14 h-14 flex items-center justify-center text-center px-1 leading-tight">
                {brandName.slice(0, 12) || "Marka"}
              </div>
            </div>
            <div className="absolute inset-0 owz-orbit">
              {ENGINE_BADGES.map((label, i) => (
                <div
                  key={label}
                  className="absolute inset-0 flex items-start justify-center"
                  style={{ transform: `rotate(${(360 / ENGINE_BADGES.length) * i}deg)` }}
                >
                  <div className="rounded-full bg-white border border-border shadow-sm text-[9px] font-semibold w-10 h-10 flex items-center justify-center text-center">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <style>{`
            .owz-orbit { animation: owz-spin 7s linear infinite; }
            @keyframes owz-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          `}</style>
        </div>
      )}
    </div>
  );
}
