"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useProject } from "@/components/ProjectProvider";
import KnowledgeBase from "@/components/KnowledgeBase";
import { blocksToHtml, blocksToMd, mdToBlocks, scoreDoc, uid, type Block, type BlockType, type Check } from "@/lib/editor-score";
import PassageList from "@/components/tool/PassageList";
import PublishDrawer from "@/components/tool/PublishDrawer";
import EditorHome from "@/components/tool/EditorHome";

interface DraftItem {
  id: number;
  sourceUrl: string;
  article: { title: string; metaDescription: string; bodyMarkdown: string; incomplete?: boolean };
  status?: string;
  publishedPostUrl?: string | null;
  createdAt: string;
}
interface Pending {
  blockId: string;
  text: string;
  action: string;
}

const AI_ACTIONS: { key: string; label: string; title: string }[] = [
  { key: "simplify", label: "Sadeleştir", title: "Daha kısa cümleler, daha kolay okunur" },
  { key: "rewrite", label: "Yeniden yaz", title: "Aynı bilgiyle daha akıcı" },
  { key: "expand", label: "Uzat", title: "Açıklama ve örnekle genişlet" },
  { key: "shorten", label: "Kısalt", title: "Anlamı koruyarak kısalt" },
  { key: "keyword", label: "Anahtar kelime", title: "Hedef kelimeyi doğal şekilde yerleştir" },
  { key: "answer", label: "Cevap-önce", title: "İlk cümleyi doğrudan cevap yap (AI alıntısı için)" },
  { key: "list", label: "Listeye çevir", title: "Paragrafı taranabilir maddelere çevir" },
  { key: "table", label: "Tablo yap", title: "Bilgileri karşılaştırma tablosuna çevir" },
];

/** Kesilen yazının devamını ekler; model son kısmı tekrar ettiyse üst üste binen kısmı atar. */
function joinContinuation(body: string, cont: string): string {
  let c = cont;
  const tail = body.slice(-400);
  for (let n = Math.min(tail.length, c.length); n >= 40; n--) {
    if (tail.endsWith(c.slice(0, n))) {
      c = c.slice(n);
      break;
    }
  }
  const b = body.replace(/\s+$/, "");
  if (/^\s/.test(c)) return b + c;
  const midWord = /[\p{L}\p{N}]$/u.test(b) && /^[\p{Ll}\p{N}]/u.test(c);
  return b + (midWord ? "" : /^(#|[-*] |\d+\. |\|)/.test(c) ? "\n\n" : " ") + c;
}

const TYPE_LABEL: Record<BlockType, string> = { h1: "H1", h2: "H2", h3: "H3", p: "Paragraf", ul: "Liste", ol: "Numaralı", quote: "Alıntı", img: "Görsel", table: "Tablo" };

function hostOf(u: string) {
  try {
    return new URL(/^https?:\/\//.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/* ------------------------------------------------------------------ */
function Ring({ value, label, color }: { value: number; label: string; color: string }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center">
      <svg width="78" height="78" viewBox="0 0 78 78">
        <circle cx="39" cy="39" r={r} fill="none" stroke="#eef2f7" strokeWidth="7" />
        <circle
          cx="39"
          cy="39"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * value) / 100}
          transform="rotate(-90 39 39)"
          style={{ transition: "stroke-dashoffset .6s ease" }}
        />
        <text x="39" y="44" textAnchor="middle" fontSize="18" fontWeight="800" fill="#0f172a">{value}</text>
      </svg>
      <span className="mt-1 text-xs font-medium text-ink/60">{label}</span>
    </div>
  );
}

const ringColor = (n: number) => (n >= 80 ? "#16a34a" : n >= 50 ? "#f59e0b" : "#ef4444");

type FixKind = { label: string; ai: boolean; run: () => void } | null;

function Checklist({ checks, fixFor, busy }: { checks: Check[]; fixFor?: (c: Check) => FixKind; busy?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ul className="space-y-1">
      {[...checks].sort((a, b) => Number(a.ok) - Number(b.ok)).map((c) => (
        <li key={c.key}>
          <button type="button" onClick={() => setOpen(open === c.key ? null : c.key)} className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-muted">
            <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-medium ${c.ok ? "bg-seo/15 text-seo" : (c.part ?? 0) > 0.4 ? "bg-warn/15 text-warn" : "bg-danger/10 text-danger"}`}>
              {c.ok ? "✓" : "!"}
            </span>
            <span className={`flex-1 ${c.ok ? "text-ink/55" : "font-medium text-ink/85"}`}>{c.label}</span>
            {!c.ok && fixFor?.(c) && <span className={`shrink-0 rounded px-1.5 py-px text-[10px] font-medium ${fixFor(c)!.ai ? "bg-accent/10 text-accent" : "bg-seo/10 text-seo"}`}>{fixFor(c)!.ai ? "✦ düzelt" : "düzelt"}</span>}
          </button>
          {open === c.key && !c.ok && (
            <div className="ml-8 mb-1 rounded-lg bg-accent/5 px-3 py-2 text-[11px] leading-relaxed text-ink/70">
              {c.hint}
              {(() => {
                const f = fixFor?.(c);
                return f ? (
                  <button type="button" disabled={busy} onClick={f.run} className="mt-1.5 block rounded-md bg-accent px-2 py-1 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-40">
                    {f.ai ? "✦ " : ""}
                    {f.label}
                  </button>
                ) : null;
              })()}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
function AutoText({ value, onChange, onFocus, className, placeholder }: { value: string; onChange: (v: string) => void; onFocus: () => void; className: string; placeholder?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return <textarea ref={ref} value={value} rows={1} placeholder={placeholder} onFocus={onFocus} onChange={(e) => onChange(e.target.value)} className={`block w-full resize-none overflow-hidden bg-transparent outline-none ${className}`} />;
}

const TYPE_CLASS: Record<BlockType, string> = {
  h1: "text-3xl font-medium tracking-tight leading-tight",
  h2: "text-xl font-medium mt-2",
  h3: "text-lg font-medium",
  p: "text-[15px] leading-7 text-ink/85",
  ul: "text-[15px] leading-7 text-ink/85",
  ol: "text-[15px] leading-7 text-ink/85",
  quote: "border-l-4 border-accent/40 pl-4 italic text-ink/70",
  img: "",
  table: "font-mono text-xs leading-6 text-ink/75",
};

/* ------------------------------------------------------------------ */
export default function EditorPage() {
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [history, setHistory] = useState<Block[][]>([]);
  const [title, setTitle] = useState("");
  const [meta, setMeta] = useState("");
  const [keyword, setKeyword] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [draftId, setDraftId] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  /** Yazı üretimde token sınırına takılıp yarım kaldı mı (taslaktan gelir, "Sonunu tamamla" ile kapanır). */
  const [incomplete, setIncomplete] = useState(false);
  const [pubOpen, setPubOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null);
  const [tab, setTab] = useState<"score" | "meta" | "links" | "assistant" | "kb">("score");
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState("");

  // başlangıç ekranı
  const [drafts, setDrafts] = useState<DraftItem[] | null>(null);
  const [importUrl, setImportUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const flash = (t: string, bad = false) => {
    setMsg({ t, bad });
    setTimeout(() => setMsg(null), 3500);
  };

  const commit = useCallback(
    (next: Block[]) => {
      setHistory((h) => (blocks ? [...h.slice(-29), blocks] : h));
      setBlocks(next);
      setDirty(true);
    },
    [blocks]
  );

  function openDoc(d: { title: string; metaDescription: string; markdown: string; keyword?: string; sourceUrl?: string; id?: number | null; incomplete?: boolean }) {
    const bs = mdToBlocks(d.markdown);
    // Eski taslaklarda gövdede H1 yok: başlığı H1 olarak ekle (yayında zaten atılır, editör puanı doğru hesaplansın).
    if (d.title && !bs.some((b) => b.type === "h1")) bs.unshift({ id: uid(), type: "h1", text: d.title });
    setBlocks(bs);
    setTitle(d.title ?? "");
    setMeta(d.metaDescription ?? "");
    if (d.keyword !== undefined) setKeyword(d.keyword);
    setSourceUrl(d.sourceUrl ?? "");
    setDraftId(d.id ?? null);
    setIncomplete(Boolean(d.incomplete));
    setHistory([]);
    setDirty(false);
    setPending(null);
  }

  async function loadDraft(id: number) {
    setLoading(true);
    try {
      const r = await fetch(`/api/content?id=${id}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Taslak açılamadı");
      openDoc({ title: d.draft.article.title, metaDescription: d.draft.article.metaDescription, markdown: d.draft.article.bodyMarkdown, sourceUrl: d.draft.sourceUrl, id: d.draft.id, incomplete: Boolean(d.draft.article.incomplete), keyword: String(d.draft.sourceUrl ?? "").startsWith("keyword:") ? String(d.draft.sourceUrl).slice(8) : "" });
      window.history.replaceState(null, "", `/editor?draftId=${id}`);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Taslak açılamadı", true);
    } finally {
      setLoading(false);
    }
  }

  async function importFromUrl(u: string) {
    if (!u.trim()) return;
    setLoading(true);
    try {
      const r = await fetch("/api/editor/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: u }) });
      if (r.status === 401) return void (window.location.href = `/login?next=${encodeURIComponent("/editor")}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "İçerik alınamadı");
      openDoc({ ...d, sourceUrl: /^https?:\/\//.test(u) ? u : `https://${u}`, id: null });
    } catch (e) {
      flash(e instanceof Error ? e.message : "İçerik alınamadı", true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const id = qs.get("draftId");
    const u = qs.get("url");
    const nw = qs.get("new");
    if (nw) {
      // GEO Fırsatlar / Rakip kartlarından: soruyu cevaplayan GEO uyumlu bir iskeletle başla.
      const q = nw.trim();
      const hs = (qs.get("h") ?? "").split("|").map((x) => x.trim()).filter(Boolean).slice(0, 8);
      const faqs = (qs.get("faq") ?? "").split("|").map((x) => x.trim()).filter(Boolean).slice(0, 6);
      const words = qs.get("words");
      const cap = (t: string) => t.charAt(0).toLocaleUpperCase("tr") + t.slice(1);
      const sections = hs.length
        ? hs.map((h) => `## ${cap(h)}\n\nBu bölümün sorusunu ilk cümlede doğrudan cevaplayın, sonra ayrıntı ve somut sayılar verin.`).join("\n\n")
        : `## Nelere dikkat edilmeli?\n\nBu bölümün sorusunu ilk cümlede cevaplayın, sonra ayrıntı ve somut sayılar verin.\n\n## Karşılaştırma\n\n| Seçenek | Artısı | Eksisi |\n|---|---|---|\n| A | | |`;
      const faq = faqs.length ? faqs.map((f) => `### ${f}\n\nKısa, net cevap (20–60 kelime).`).join("\n\n") : `### İlk soru?\n\nKısa, net cevap.`;
      openDoc({
        title: q.length > 60 ? q.slice(0, 57) + "…" : cap(q),
        metaDescription: "",
        markdown: `# ${cap(q)}\n\nKısa cevap: Soruyu 2–3 cümlede doğrudan cevaplayın (AI motorları bu paragrafı alıntılar).${words ? ` Google'daki ilk sonuçlar ortalama ${words} kelime; konuyu en az bu kapsamda anlatın.` : ""}\n\n## Öne çıkanlar\n\n- Birinci önemli nokta\n- İkinci önemli nokta\n- Üçüncü önemli nokta\n\n${sections}\n\n## Sık sorulan sorular\n\n${faq}`,
        keyword: q,
        id: null,
      });
    } else if (id) loadDraft(Number(id));
    else if (u) {
      setImportUrl(u);
      importFromUrl(u);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Yazı listesi aktif projeye göre gelir; proje değişince yeniden çekilir.
  const { project } = useProject();
  useEffect(() => {
    setDrafts(null);
    fetch("/api/content")
      .then((r) => (r.ok ? r.json() : { drafts: [] }))
      .then((d) => setDrafts(d.drafts ?? []))
      .catch(() => setDrafts([]));
  }, [project?.id]);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const sc = useMemo(() => (blocks ? scoreDoc(blocks, { title, metaDescription: meta, keyword }) : null), [blocks, title, meta, keyword]);

  /* ---------------- puan panelindeki "düzelt" eylemleri ---------------- */
  function fixH1() {
    if (!blocks) return;
    const h1s = blocks.filter((b) => b.type === "h1");
    if (!h1s.length) commit([{ id: uid(), type: "h1", text: title || keyword || "Başlık" }, ...blocks]);
    else commit(blocks.map((b) => (b.type === "h1" && b.id !== h1s[0].id ? { ...b, type: "h2" as BlockType } : b)));
    flash(h1s.length ? "Fazla H1'ler H2 yapıldı." : "Başlık H1 olarak eklendi.");
  }
  async function addImage() {
    if (!blocks) return;
    setBusy("img");
    try {
      const qs = [keyword, title].filter(Boolean).map((q) => `q=${encodeURIComponent(q)}`).join("&");
      const r = await fetch(`/api/editor/images?${qs}`);
      const d = await r.json();
      const img = d.images?.[0];
      if (!img) throw new Error("Uygun lisanslı görsel bulunamadı; görsel bloğunu elle ekleyebilirsin.");
      const firstH2 = blocks.findIndex((b) => b.type === "h2");
      const at = firstH2 >= 0 ? Math.min(blocks.length, firstH2 + 2) : Math.min(blocks.length, 2);
      const alt = `${keyword || title}`.slice(0, 120);
      const next = [...blocks];
      next.splice(at, 0, { id: uid(), type: "img", text: `${alt}|${img.url}` }, { id: uid(), type: "p", text: `*Görsel: ${img.creator || "Openverse"}, ${img.license} · [Openverse](${img.landing})*` });
      commit(next);
      flash("Lisanslı görsel ve atıf satırı eklendi.");
    } catch (e) {
      flash(e instanceof Error ? e.message : "Görsel bulunamadı", true);
    } finally {
      setBusy(null);
    }
  }
  const year = new Date().getFullYear();
  const AI_FIX: Record<string, (c: Check) => string> = {
    density: (c) =>
      sc && sc.stats.density > 2.5
        ? `"${keyword}" ifadesi çok sık tekrar ediyor (${c.label}). Tam ifadeyi yalnızca H1'de, ilk paragrafta, bir H2'de ve metin içinde en fazla 3 kez daha kullan; diğer yerlerde eş anlamlı, kısaltılmış ya da zamirli ifadeler kullan.`
        : `"${keyword}" ifadesini metne 2-3 kez daha doğal biçimde yerleştir.`,
    stuffing: (c) => `${c.label}: bu kelimeyi daha az tekrarla; eş anlamlılar, zamirler ve daha kısa ifadeler kullan. Cümlelerin anlamını ve bilgileri koru.`,
    len: () => "Yazıyı en az 1200 kelimeye genişlet: mevcut bölümleri somut adımlar, örnekler, kriterler ve bir karşılaştırma tablosuyla derinleştir. Bilgi tekrarı ve uydurma rakam ekleme.",
    depth: () => "Yazıyı en az 1200 kelimeye genişlet: mevcut bölümleri somut adımlar, örnekler, kriterler ve bir karşılaştırma tablosuyla derinleştir. Bilgi tekrarı ve uydurma rakam ekleme.",
    answer: () => "Her ## bölümü, başlığındaki soruya 1-2 cümlelik doğrudan cevapla başlasın; ayrıntılar sonra gelsin.",
    lead: () => "Yazının ilk paragrafını 2-3 cümlede konuyu tanımlayan ve soruyu doğrudan cevaplayan bir 'cevap kapsülü' yap.",
    kwh1: () => `H1 başlığına "${keyword}" ifadesini doğal biçimde ekle.`,
    kwfirst: () => `İlk paragrafta "${keyword}" ifadesini doğal biçimde kullan.`,
    kwh2: () => `Ara başlıklardan birinde "${keyword}" ifadesini ya da yakın bir varyasyonunu kullan.`,
    fresh: () => `Metinde ${year} yılını bir kez, doğru olduğu bir yerde doğal biçimde belirt (ör. "${year} itibarıyla").`,
    placeholders: () => "Metindeki [NEEDS: ...] yer tutucularını en fazla 2 taneye indir: yalnızca markaya özgü ve gerçekten gerekli olanları bırak, diğer cümleleri eksik bilgiye ihtiyaç duymayan genel ama faydalı tavsiyelere çevir. Asla bilgi uydurma.",
    h2: () => "Metni en az 3 tane soru biçimli ## ara başlıkla bölümlere ayır.",
    paras: () => "120 kelimeden uzun paragrafları böl, cümleleri ortalama 20 kelimenin altında tut.",
  };
  const NO_FIX = new Set(["kw", "quotes", "stats", "cite", "stat-source"]);
  const fixFor = (c: Check): FixKind => {
    if (c.ok || NO_FIX.has(c.key)) return null;
    if (c.key === "h1") return { label: "Düzelt (ücretsiz)", ai: false, run: fixH1 };
    if (c.key === "img") return { label: "Lisanslı görsel ekle (ücretsiz)", ai: false, run: addImage };
    if (c.key === "links") return { label: "İç link önerilerini aç (ücretsiz)", ai: false, run: () => setTab("links") };
    if (c.key === "faq") return { label: "SSS bölümü ekle", ai: true, run: () => ai("faq") };
    if (c.key === "title" || c.key === "meta" || c.key === "kwtitle") return { label: "Title ve meta yaz", ai: true, run: () => ai("meta") };
    const ins = AI_FIX[c.key]?.(c) ?? (c.hint ? `${c.label}: ${c.hint}` : null);
    return ins ? { label: "AI ile düzelt", ai: true, run: () => ai("assistant", { instruction: ins }) } : null;
  };
  const failing = sc ? [...sc.seoChecks, ...sc.geoChecks].filter((c) => !c.ok && (c.part ?? 0) < 0.85) : [];
  const freeFixes = failing.filter((c) => c.key === "h1" || c.key === "img" || c.key === "links");
  const aiFixes = failing.filter((c) => {
    const f = fixFor(c);
    return f?.ai && !["faq", "title", "meta", "kwtitle"].includes(c.key);
  });
  function fixAll() {
    const ins = aiFixes.map((c) => `- ${AI_FIX[c.key]?.(c) ?? `${c.label}: ${c.hint}`}`).join("\n");
    ai("assistant", { instruction: `Aşağıdaki sorunların HEPSİNİ tek seferde düzelt; bilgileri, linkleri, görselleri ve kaynakları koru, rakam uydurma:\n${ins}` });
  }

  /* ---------------- blok işlemleri ---------------- */
  const setText = (id: string, text: string) => {
    if (!blocks) return;
    setBlocks(blocks.map((b) => (b.id === id ? { ...b, text } : b)));
    setDirty(true);
  };
  const setType = (id: string, type: BlockType) => blocks && commit(blocks.map((b) => (b.id === id ? { ...b, type } : b)));
  const remove = (id: string) => blocks && commit(blocks.filter((b) => b.id !== id));
  const insertAfter = (id: string | null, type: BlockType = "p", text = "") => {
    if (!blocks) return;
    const nb: Block = { id: uid(), type, text };
    const i = id ? blocks.findIndex((b) => b.id === id) : blocks.length - 1;
    const next = [...blocks];
    next.splice(i + 1, 0, nb);
    commit(next);
    setActive(nb.id);
  };
  const move = (id: string, dir: -1 | 1) => {
    if (!blocks) return;
    const i = blocks.findIndex((b) => b.id === id);
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };
  const undo = () => {
    if (!history.length) return;
    setBlocks(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
    setDirty(true);
  };

  /* ---------------- AI ---------------- */
  async function ai(action: string, opts: { blockId?: string; instruction?: string } = {}) {
    if (!blocks) return;
    const block = opts.blockId ? blocks.find((b) => b.id === opts.blockId) : null;
    setBusy(action);
    try {
      const r = await fetch("/api/editor/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          text: block ? blocksToMd([block]) : "",
          doc: blocksToMd(blocks),
          keyword,
          title: blocks.find((b) => b.type === "h1")?.text ?? title,
          instruction: opts.instruction,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "AI işlemi başarısız");
      if (action === "meta") {
        if (d.title) setTitle(d.title);
        if (d.metaDescription) setMeta(d.metaDescription);
        setDirty(true);
        flash("Title ve meta açıklama yazıldı.");
      } else if (action === "faq") {
        commit([...blocks, ...mdToBlocks(d.text)]);
        flash("SSS bölümü sona eklendi.");
      } else if (action === "continue") {
        commit(mdToBlocks(joinContinuation(blocksToMd(blocks), String(d.text ?? ""))));
        setIncomplete(!d.finished);
        flash(d.finished ? "Yazının sonu tamamlandı. Kontrol edip kaydet." : "Bir bölüm daha eklendi; yazı hâlâ bitmedi, bir kez daha tamamla.");
      } else if (action === "assistant") {
        setPending({ blockId: "__doc__", text: d.text, action });
      } else if (block) {
        setPending({ blockId: block.id, text: d.text, action });
      }
    } catch (e) {
      flash(e instanceof Error ? e.message : "AI işlemi başarısız", true);
    } finally {
      setBusy(null);
    }
  }

  function acceptPending() {
    if (!pending || !blocks) return;
    if (pending.blockId === "__doc__") commit(mdToBlocks(pending.text));
    else {
      const i = blocks.findIndex((b) => b.id === pending.blockId);
      if (i >= 0) {
        const repl = mdToBlocks(pending.text);
        const next = [...blocks];
        // tek bloğa dönüşüyorsa orijinal türü koru (ör. başlık)
        if (repl.length === 1 && blocks[i].type !== "p" && repl[0].type === "p") repl[0].type = blocks[i].type;
        next.splice(i, 1, ...repl);
        commit(next);
      }
    }
    setPending(null);
  }

  /* ---------------- kaydet / dışa aktar ---------------- */
  async function save(): Promise<number | null> {
    if (!blocks) return null;
    setBusy("save");
    try {
      const r = await fetch("/api/editor/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: draftId, sourceUrl: sourceUrl || "editor", title: title || blocks.find((b) => b.type === "h1")?.text || "", metaDescription: meta, markdown: blocksToMd(blocks), incomplete }),
      });
      if (r.status === 401) { window.location.href = `/login?next=${encodeURIComponent("/editor")}`; return null; }
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Kaydedilemedi");
      setDraftId(d.draft.id);
      setDirty(false);
      window.history.replaceState(null, "", `/editor?draftId=${d.draft.id}`);
      flash("Kaydedildi.");
      return d.draft.id as number;
    } catch (e) {
      flash(e instanceof Error ? e.message : "Kaydedilemedi", true);
      return null;
    } finally {
      setBusy(null);
    }
  }
  const copy = (kind: "md" | "html") => {
    if (!blocks) return;
    navigator.clipboard?.writeText(kind === "md" ? blocksToMd(blocks) : blocksToHtml(blocks)).then(() => flash(kind === "md" ? "Markdown kopyalandı." : "HTML kopyalandı."));
  };

  /* ================================================================== */
  if (!blocks) {
    return (
      <EditorHome
        msg={msg}
        drafts={drafts}
        importUrl={importUrl}
        setImportUrl={setImportUrl}
        loading={loading}
        onImport={() => importFromUrl(importUrl)}
        onBlank={() => openDoc({ title: "", metaDescription: "", markdown: "# Yazının başlığı\n\nGiriş paragrafı: konuyu tek cümlede tanımlayın.\n\n## İlk bölüm başlığı?\n\nBu bölümün sorusunu ilk cümlede doğrudan cevaplayın.", keyword: "" })}
        onOpen={loadDraft}
      />
    );
  }

  /* ================================================================== */
  return (
    <div className="space-y-4">
      {/* üst çubuk */}
      <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center gap-2 border-b border-border bg-paper/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
        <button type="button" onClick={() => (!dirty || confirm("Kaydedilmemiş değişiklikler kaybolacak. Çıkılsın mı?")) && setBlocks(null)} className="rounded-lg px-2 py-1.5 text-sm text-ink/50 hover:bg-muted">← Yazılar</button>
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-border bg-panel px-3 py-1.5">
          <span className="text-xs font-medium text-ink/40">Hedef kelime</span>
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="ör. abiye elbise modelleri" className="flex-1 bg-transparent text-sm outline-none" />
        </div>
        <button type="button" onClick={undo} disabled={!history.length} className="rounded-lg border border-border bg-panel px-3 py-1.5 text-xs font-medium text-ink/60 hover:border-ink/30 disabled:opacity-40">↶ Geri al</button>
        <button type="button" onClick={() => copy("md")} className="rounded-lg border border-border bg-panel px-3 py-1.5 text-xs font-medium text-ink/60 hover:border-ink/30">Markdown</button>
        <button type="button" onClick={() => copy("html")} className="rounded-lg border border-border bg-panel px-3 py-1.5 text-xs font-medium text-ink/60 hover:border-ink/30">HTML</button>
        <button
          type="button"
          onClick={async () => {
            // Yayından önce son hali kaydet.
            const id = dirty || !draftId ? await save() : draftId;
            if (id) setPubOpen(true);
          }}
          disabled={busy === "save"}
          className="rounded-lg border border-border bg-panel px-3 py-1.5 text-xs font-medium text-ink/70 hover:border-accent hover:text-accent disabled:opacity-50"
        >
          Yayınla
        </button>
        <button type="button" onClick={save} disabled={busy === "save"} className="rounded-lg bg-accent px-4 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50">
          {busy === "save" ? "Kaydediliyor…" : dirty || !draftId ? "Kaydet" : "Kaydedildi ✓"}
        </button>
      </div>
      <PublishDrawer
        open={pubOpen}
        onClose={() => setPubOpen(false)}
        draftId={draftId}
        title={title || blocks.find((b) => b.type === "h1")?.text || ""}
        markdown={blocksToMd(blocks)}
        metaDescription={meta}
      />
      {msg && <div className={`fixed bottom-6 right-6 z-50 rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ${msg.bad ? "bg-danger text-white" : "bg-ink text-white"}`}>{msg.t}</div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* ---------------- yazı alanı ---------------- */}
        <div className="min-w-0 rounded-2xl border border-border bg-panel shadow-[0_1px_2px_rgba(13,18,28,0.05)] px-6 py-8 md:px-12">
          {incomplete && (
            <div className="mb-6 rounded-xl border border-warn/40 bg-warn/10 p-4">
              <div className="text-sm font-semibold text-ink">Bu yazı yarıda kesildi</div>
              <p className="mt-1 text-xs text-ink/60">Yapay zekâ yazıyı bitiremeden çıktı sınırına ulaştı; son bölümler ya da SSS eksik olabilir. Yayınlamadan önce sonunu tamamla.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => ai("continue")} disabled={!!busy} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                  {busy === "continue" ? "Tamamlanıyor…" : "Sonunu tamamla"}
                </button>
                <button type="button" onClick={() => { setIncomplete(false); setDirty(true); }} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink/60">Yazı tamam, uyarıyı kapat</button>
              </div>
            </div>
          )}
          {pending?.blockId === "__doc__" && (
            <div className="mb-6 rounded-xl border border-accent/30 bg-accent/5 p-4">
              <div className="text-sm font-medium">Asistan tüm yazıyı güncelledi</div>
              <p className="mt-1 text-xs text-ink/55">Yeni sürüm {pending.text.split(/\s+/).length} kelime. Uygularsan "Geri al" ile dönebilirsin.</p>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={acceptPending} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white">Uygula</button>
                <button type="button" onClick={() => setPending(null)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink/60">Vazgeç</button>
              </div>
            </div>
          )}
          <div className="space-y-1">
            {blocks.map((b) => {
              const isActive = active === b.id;
              const pend = pending?.blockId === b.id ? pending : null;
              return (
                <div key={b.id} className={`group relative rounded-lg px-3 py-1 transition-colors ${isActive ? "bg-accent/[0.04] ring-1 ring-accent/20" : "hover:bg-muted/40"}`}>
                  {isActive && (
                    <div className="-mx-1 mb-1.5 flex items-center gap-0.5 overflow-x-auto whitespace-nowrap rounded-xl border border-border bg-panel p-1 shadow-sm">
                      <select value={b.type} onChange={(e) => setType(b.id, e.target.value as BlockType)} className="rounded-lg bg-muted px-1.5 py-1 text-[11px] font-medium outline-none">
                        {(["p", "h1", "h2", "h3", "ul", "ol", "quote"] as BlockType[]).map((t) => (
                          <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                        ))}
                      </select>
                      {b.type !== "img" &&
                        AI_ACTIONS.map((a) => (
                          <button key={a.key} type="button" title={a.title} disabled={!!busy} onMouseDown={(e) => e.preventDefault()} onClick={() => ai(a.key, { blockId: b.id })} className="rounded-lg px-2 py-1 text-[11px] font-medium text-ink/70 hover:bg-accent/10 hover:text-accent disabled:opacity-40">
                            {busy === a.key ? "…" : a.label}
                          </button>
                        ))}
                      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setCustomOpen((v) => !v)} className="rounded-lg px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent/10">✦ Özel</button>
                      <span className="mx-0.5 h-4 w-px bg-border" />
                      <button type="button" title="Yukarı" onMouseDown={(e) => e.preventDefault()} onClick={() => move(b.id, -1)} className="rounded px-1.5 text-xs text-ink/50 hover:bg-muted">↑</button>
                      <button type="button" title="Aşağı" onMouseDown={(e) => e.preventDefault()} onClick={() => move(b.id, 1)} className="rounded px-1.5 text-xs text-ink/50 hover:bg-muted">↓</button>
                      <button type="button" title="Sil" onMouseDown={(e) => e.preventDefault()} onClick={() => remove(b.id)} className="rounded px-1.5 text-xs text-danger hover:bg-danger/10">✕</button>
                    </div>
                  )}
                  {isActive && customOpen && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (customText.trim()) ai("custom", { blockId: b.id, instruction: customText });
                        setCustomOpen(false);
                      }}
                      className="mb-2 flex gap-2"
                    >
                      <input autoFocus value={customText} onChange={(e) => setCustomText(e.target.value)} placeholder="Bu bölüme ne yapılsın? ör. 'madde madde yaz', 'daha samimi ol'" className="flex-1 rounded-lg border border-accent/40 bg-panel px-3 py-1.5 text-xs outline-none" />
                      <button className="rounded-lg bg-accent px-3 text-xs font-medium text-white">Uygula</button>
                    </form>
                  )}

                  {b.type === "img" ? (
                    <ImageBlock block={b} onFocus={() => setActive(b.id)} onChange={(t) => setText(b.id, t)} />
                  ) : (
                    <AutoText
                      value={b.type === "ul" || b.type === "ol" ? b.text.split("\n").map((x) => `• ${x}`).join("\n") : b.text}
                      onChange={(v) => setText(b.id, b.type === "ul" || b.type === "ol" ? v.split("\n").map((x) => x.replace(/^•\s?/, "")).join("\n") : v)}
                      onFocus={() => {
                        setActive(b.id);
                        if (active !== b.id) setCustomOpen(false);
                      }}
                      placeholder={b.type === "p" ? "Yazmaya başla…" : TYPE_LABEL[b.type]}
                      className={TYPE_CLASS[b.type]}
                    />
                  )}

                  {pend && (
                    <div className="my-2 rounded-xl border border-accent/30 bg-accent/5 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-accent">AI önerisi · {AI_ACTIONS.find((a) => a.key === pend.action)?.label ?? "Özel"}</span>
                        <span className="text-[10px] text-ink/40">{pend.text.split(/\s+/).length} kelime</span>
                      </div>
                      <div className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-ink/85">{pend.text}</div>
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={acceptPending} className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-white">Kabul et</button>
                        <button type="button" onClick={() => ai(pend.action, { blockId: b.id, instruction: customText })} disabled={!!busy} className="rounded-lg border border-border bg-panel px-3 py-1 text-xs font-medium text-ink/60">Tekrar dene</button>
                        <button type="button" onClick={() => setPending(null)} className="rounded-lg px-3 py-1 text-xs font-medium text-ink/50 hover:text-ink">Reddet</button>
                      </div>
                    </div>
                  )}

                  <div className="pointer-events-none absolute -bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                    {(["p", "h2", "ul"] as BlockType[]).map((t) => (
                      <button key={t} type="button" onClick={() => insertAfter(b.id, t)} className="rounded-full border border-border bg-panel px-2 py-0.5 text-[10px] font-medium text-ink/50 shadow-sm hover:border-accent hover:text-accent">+ {TYPE_LABEL[t]}</button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <button type="button" onClick={() => insertAfter(null)} className="mt-4 w-full rounded-lg border border-dashed border-border py-2 text-xs font-medium text-ink/40 hover:border-accent hover:text-accent">+ Paragraf ekle</button>
        </div>

        {/* ---------------- sağ panel ---------------- */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="overflow-hidden rounded-2xl border border-border bg-panel shadow-[0_1px_2px_rgba(13,18,28,0.05)]">
            <div className="flex border-b border-border text-xs font-medium">
              {([
                ["score", "Puan"],
                ["meta", "Meta"],
                ["links", "Linkler"],
                ["assistant", "Asistan"],
                ["kb", "Bilgi"],
              ] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setTab(k)} className={`flex-1 py-2.5 ${tab === k ? "border-b-2 border-accent text-accent" : "text-ink/50 hover:text-ink"}`}>{l}</button>
              ))}
            </div>
            <div className="max-h-[calc(100vh-11rem)] overflow-y-auto p-4">
              {tab === "score" && sc && (
                <div className="space-y-4">
                  <div className="flex justify-around">
                    <Ring value={sc.seo} label="SEO" color={ringColor(sc.seo)} />
                    <Ring value={sc.geo} label="GEO / AI" color={ringColor(sc.geo)} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      ["Kelime", sc.stats.words],
                      ["Okuma", `${sc.stats.readingMin} dk`],
                      ["H2", sc.stats.h2],
                      ["Yoğunluk", `%${sc.stats.density}`],
                      ["Ort. cümle", sc.stats.avgSentence],
                      ["Link", sc.stats.links],
                    ].map(([l, v]) => (
                      <div key={l as string} className="rounded-lg bg-muted/60 py-1.5">
                        <div className="text-[10px] text-ink/45">{l}</div>
                        <div className="text-sm font-medium tabular-nums">{v}</div>
                      </div>
                    ))}
                  </div>
                  {failing.length > 0 && (
                    <div className="rounded-xl border border-[#BDB4FF] bg-accent/[0.04] p-3">
                      <div className="text-xs font-semibold">{failing.length} madde iyileştirilebilir</div>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-ink/55">
                        {freeFixes.length ? `${freeFixes.length} tanesi tek tıkla ücretsiz, ` : ""}
                        {aiFixes.length ? `${aiFixes.length} tanesi AI ile tek seferde düzeltilir (1 AI isteği; önce önizleme gösterilir).` : "kalanlar için maddeye tıkla."}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {freeFixes.map((c) => (
                          <button key={c.key} type="button" disabled={!!busy} onClick={fixFor(c)!.run} className="rounded-lg border border-seo/40 bg-panel px-2 py-1 text-[11px] font-medium text-seo hover:bg-seo/5 disabled:opacity-40">
                            {c.key === "h1" ? "H1'i düzelt" : c.key === "links" ? "İç link ekle" : busy === "img" ? "Görsel aranıyor…" : "Görsel ekle"}
                          </button>
                        ))}
                        {aiFixes.length > 0 && (
                          <button type="button" disabled={!!busy} onClick={fixAll} className="rounded-lg bg-accent px-2 py-1 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-40">
                            {busy === "assistant" ? "Düzeltiliyor…" : `✦ ${aiFixes.length} maddeyi AI ile düzelt`}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="mb-1 text-xs font-medium text-ink/50">SEO kontrolleri</div>
                    <Checklist checks={sc.seoChecks} fixFor={fixFor} busy={!!busy} />
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs font-medium text-ink/50">
                      <span>GEO / AI alıntılanabilirlik</span>
                    </div>
                    <Checklist checks={sc.geoChecks} fixFor={fixFor} busy={!!busy} />
                    <div className="mt-3 rounded-xl border border-border p-2.5">
                      <div className="mb-1.5 text-xs font-medium text-ink/50">Bölüm bazlı alıntılanabilirlik</div>
                      <PassageList report={sc.passages} compact />
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button type="button" disabled={!!busy} onClick={() => ai("faq")} className="rounded-lg border border-accent/40 py-1.5 text-[11px] font-medium text-accent hover:bg-accent/5 disabled:opacity-40">{busy === "faq" ? "Yazılıyor…" : "✦ SSS ekle"}</button>
                      <button type="button" disabled={!!busy} onClick={() => setTab("meta")} className="rounded-lg border border-border py-1.5 text-[11px] font-medium text-ink/60 hover:border-ink/30">Meta'yı düzenle</button>
                    </div>
                  </div>
                  <p className="text-[10px] leading-relaxed text-ink/35">Puanlar yazdıkça kurallarla hesaplanır, AI kullanmaz. ✦ işaretli düğmeler AI çağrısı yapar.</p>
                </div>
              )}

              {tab === "meta" && (
                <MetaPanel title={title} meta={meta} sourceUrl={sourceUrl} onTitle={(v) => { setTitle(v); setDirty(true); }} onMeta={(v) => { setMeta(v); setDirty(true); }} onAi={() => ai("meta")} busy={busy === "meta"} />
              )}

              {tab === "links" && <LinksPanel blocks={blocks} sourceUrl={sourceUrl} activeId={active} onApply={commit} site={project?.domain ?? ""} brand={project?.name ?? ""} keyword={keyword} title={title} />}

              {tab === "kb" && <KnowledgeBase compact />}

              {tab === "assistant" && <AssistantPanel busy={busy === "assistant"} onRun={(ins) => ai("assistant", { instruction: ins })} />}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function ImageBlock({ block, onFocus, onChange }: { block: Block; onFocus: () => void; onChange: (t: string) => void }) {
  const [alt, src] = block.text.split("|");
  return (
    <div className="flex items-start gap-3 py-2" onClick={onFocus}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="h-24 w-36 shrink-0 rounded-lg border border-border object-cover" />
      <div className="flex-1">
        <div className="text-[11px] font-medium text-ink/45">Alt metni {alt ? "" : <span className="text-warn">(eksik)</span>}</div>
        <input value={alt ?? ""} onFocus={onFocus} onChange={(e) => onChange(`${e.target.value.replace(/\|/g, " ")}|${src ?? ""}`)} placeholder="Görselin ne gösterdiğini yazın" className="mt-1 w-full rounded-lg border border-border bg-panel px-3 py-1.5 text-sm outline-none focus:border-accent" />
        <div className="mt-1 truncate text-[10px] text-ink/35">{src}</div>
      </div>
    </div>
  );
}

function MetaPanel({ title, meta, sourceUrl, onTitle, onMeta, onAi, busy }: { title: string; meta: string; sourceUrl: string; onTitle: (v: string) => void; onMeta: (v: string) => void; onAi: () => void; busy: boolean }) {
  const tl = title.length;
  const ml = meta.length;
  return (
    <div className="space-y-4">
      <div>
        <div className="flex justify-between text-xs font-medium text-ink/50">
          <span>SEO title</span>
          <span className={tl > 60 || (tl > 0 && tl < 30) ? "text-danger" : "text-ink/40"}>{tl}/60</span>
        </div>
        <input value={title} onChange={(e) => onTitle(e.target.value)} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent" />
      </div>
      <div>
        <div className="flex justify-between text-xs font-medium text-ink/50">
          <span>Meta açıklama</span>
          <span className={ml > 160 || (ml > 0 && ml < 120) ? "text-warn" : "text-ink/40"}>{ml}/160</span>
        </div>
        <textarea value={meta} onChange={(e) => onMeta(e.target.value)} rows={4} className="mt-1 w-full resize-none rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent" />
      </div>
      <button type="button" onClick={onAi} disabled={busy} className="w-full rounded-lg bg-accent py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50">{busy ? "Yazılıyor…" : "✦ AI ile title + meta yaz"}</button>
      <div>
        <div className="mb-1 text-xs font-medium text-ink/50">Google önizleme</div>
        <div className="rounded-xl border border-border p-3">
          <div className="truncate text-[11px] text-ink/50">{hostOf(sourceUrl) || "siteniz.com"} › …</div>
          <div className="mt-0.5 line-clamp-1 text-[15px] text-[#1a0dab]">{title || "Sayfa başlığı"}</div>
          <div className="mt-0.5 line-clamp-2 text-xs text-ink/60">{meta || "Meta açıklama burada görünür."}</div>
        </div>
      </div>
    </div>
  );
}

const fold = (s: string) => s.toLocaleLowerCase("tr").replace(/[^\p{L}\p{N}\s]/gu, " ");
const toks = (s: string) => fold(s).split(/\s+/).filter((w) => w.length > 2 && !["ve", "ile", "için", "bir", "nedir", "nasıl", "the", "and", "for"].includes(w));

function LinksPanel({ blocks, sourceUrl, activeId, onApply, site, brand, keyword, title }: { blocks: Block[]; sourceUrl: string; activeId: string | null; onApply: (b: Block[]) => void; site: string; brand: string; keyword: string; title: string }) {
  const [domain, setDomain] = useState(hostOf(sourceUrl) || site);
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => {
    setCopied(t);
    setTimeout(() => setCopied(null), 1200);
  });
  const kw = (keyword || title).trim();
  // Dış linkler için anchor planı (basit SEO dağılımı) — AI'sız
  const anchorPlan = useMemo(() => {
    if (!kw) return null;
    const h2 = blocks.filter((b) => b.type === "h2").map((b) => b.text.replace(/\?$/, "").trim());
    const kt = toks(kw);
    const partial = [...new Set([...h2.filter((h) => kt.some((t) => fold(h).includes(t)) && fold(h) !== fold(kw)).slice(0, 2), `${kw} rehberi`, `${kw} hakkında bilmeniz gerekenler`])].slice(0, 3);
    const b = brand || (site ? site.split(".")[0] : "");
    return { exact: kw, partial, branded: [b, b && `${b} ${kw}`].filter(Boolean) as string[], generic: ["bu rehber", "detaylı bilgi için", "buradan okuyabilirsiniz"] };
  }, [kw, blocks, brand, site]);
  const [pages, setPages] = useState<{ url: string; title: string | null; h1: string | null }[] | null>(null);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    if (!domain.trim()) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/editor/links?domain=${encodeURIComponent(domain)}`);
      const d = await r.json();
      setPages(d.pages ?? []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (domain) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const suggestions = useMemo(() => {
    if (!pages) return [];
    const docText = blocks.filter((b) => b.type === "p" || b.type === "ul" || b.type === "ol").map((b) => b.text).join(" ");
    const lower = docText.toLocaleLowerCase("tr");
    const existing = new Set([...docText.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]));
    const out: { url: string; label: string; phrase: string | null }[] = [];
    for (const p of pages) {
      if (existing.has(p.url) || p.url === sourceUrl) continue;
      const label = (p.h1 || p.title || p.url).split(/[|\-–]/)[0].trim();
      const w = label.split(/\s+/).filter((x) => x.length > 2);
      let phrase: string | null = null;
      for (let len = Math.min(4, w.length); len >= 2 && !phrase; len--) {
        for (let i = 0; i + len <= w.length; i++) {
          const ph = w.slice(i, i + len).join(" ");
          if (lower.includes(ph.toLocaleLowerCase("tr"))) {
            phrase = ph;
            break;
          }
        }
      }
      out.push({ url: p.url, label, phrase });
    }
    return out.sort((a, b) => Number(!!b.phrase) - Number(!!a.phrase)).slice(0, 25);
  }, [pages, blocks, sourceUrl]);

  // Gelen iç linkler: sitende bu yazının konusuna en yakın sayfalar → buralardan bu yazıya link ver
  const incoming = useMemo(() => {
    if (!pages || !kw) return [];
    const need = toks(`${kw} ${title}`);
    return pages
      .map((p) => {
        const have = toks(`${p.title ?? ""} ${p.h1 ?? ""} ${decodeURIComponent(p.url).replace(/[-_/]/g, " ")}`);
        const hit = need.filter((w) => have.some((h) => h === w || (w.length > 4 && h.length > 4 && h.slice(0, 5) === w.slice(0, 5)))).length;
        return { url: p.url, label: (p.h1 || p.title || p.url).split(/[|\-–]/)[0].trim(), score: need.length ? hit / need.length : 0 };
      })
      // Yazının kendisi (aynı başlıklı yayındaki sayfa) öneri olmasın
      .filter((p) => p.score >= 0.34 && p.url !== sourceUrl && fold(p.label).trim() !== fold(title.split(/[|\-–]/)[0]).trim())
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [pages, kw, title, sourceUrl]);

  function add(s: { url: string; label: string; phrase: string | null }) {
    if (s.phrase) {
      const re = new RegExp(`(?<!\\[)(${s.phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?![^\\[]*\\])`, "i");
      let done = false;
      const next = blocks.map((b) => {
        if (done || !(b.type === "p" || b.type === "ul" || b.type === "ol") || !re.test(b.text)) return b;
        done = true;
        return { ...b, text: b.text.replace(re, `[$1](${s.url})`) };
      });
      if (done) return onApply(next);
    }
    const target = blocks.find((b) => b.id === activeId && (b.type === "p" || b.type === "ul")) ?? [...blocks].reverse().find((b) => b.type === "p");
    if (!target) return;
    onApply(blocks.map((b) => (b.id === target.id ? { ...b, text: `${b.text} Ayrıca bakınız: [${s.label}](${s.url}).` } : b)));
  }

  const Anchor = ({ a }: { a: string }) => (
    <button type="button" onClick={() => copy(a)} title="Kopyala" className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-ink/75 hover:bg-accent/10 hover:text-accent">
      {copied === a ? "✓ kopyalandı" : `“${a}”`}
    </button>
  );

  return (
    <div className="space-y-4">
      {anchorPlan && (
        <div className="rounded-xl border border-[#BDB4FF] bg-accent/[0.04] p-3">
          <div className="text-xs font-semibold">Anchor text planı</div>
          <p className="mt-0.5 text-[10px] leading-relaxed text-ink/50">Başka sitelerden bu yazıya link isterken hangi metinle linklenmesini isteyeceğin. Tıkla → kopyala. Hepsi aynı metinle olmasın; dağılım doğal görünmeli.</p>
          <div className="mt-2 space-y-1.5 text-[10px]">
            {([
              ["Tam eşleşme · ~%10", [anchorPlan.exact]],
              ["Kısmi eşleşme · ~%40", anchorPlan.partial],
              ["Markalı · ~%35", anchorPlan.branded],
              ["Genel · ~%15", anchorPlan.generic],
            ] as const).map(([l, list]) => (
              <div key={l}>
                <div className="mb-0.5 text-ink/45">{l}</div>
                <div className="flex flex-wrap gap-1">{list.map((a) => <Anchor key={a} a={a} />)}</div>
              </div>
            ))}
          </div>
          <Link href="/backlinks?mode=plan" className="mt-2 inline-block text-[10px] font-medium text-accent hover:underline">Link isteyeceğin siteler → Link planı</Link>
        </div>
      )}
      {incoming.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-semibold">Bu yazıya sitenden link ver</div>
          <p className="mb-1.5 text-[10px] leading-relaxed text-ink/50">Konusu en yakın sayfaların. Yazıyı yayınlayınca bu sayfalara, önerilen metinle bu yazının linkini ekle.</p>
          <div className="space-y-1.5">
            {incoming.map((p, i) => {
              const a = anchorPlan ? [anchorPlan.partial[i % anchorPlan.partial.length], anchorPlan.exact][i === 0 ? 1 : 0] : kw;
              return (
                <div key={p.url} className="rounded-lg border border-border p-2.5">
                  <a href={p.url} target="_blank" rel="noreferrer" className="block truncate text-xs font-medium hover:text-accent">{p.label}</a>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="truncate text-[10px] text-ink/45">{p.url.replace(/^https?:\/\/(www\.)?/, "")}</span>
                    <Anchor a={a} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className="text-xs font-semibold">Bu yazıdan sitene link ver</div>
      <p className="text-[11px] leading-relaxed text-ink/50">Öneriler, bu sitenin son <b>Site Taraması</b> ya da sitemap sayfalarından gelir (AI kullanmaz). Metinde geçen ifade bulunursa link o kelimelere eklenir.</p>
      <div className="flex gap-2">
        <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="siteniz.com" className="flex-1 rounded-lg border border-border px-3 py-1.5 text-xs outline-none focus:border-accent" />
        <button type="button" onClick={load} className="rounded-lg border border-border px-3 text-xs font-medium text-ink/60">{loading ? "…" : "Getir"}</button>
      </div>
      {pages !== null && pages.length === 0 && (
        <div className="rounded-lg bg-muted/60 p-3 text-xs text-ink/55">
          Bu site için tarama yok. <Link href="/import" className="font-medium text-accent">Site Taraması</Link> yapınca sayfaları burada önerilir.
        </div>
      )}
      <div className="space-y-1.5">
        {suggestions.map((s) => (
          <div key={s.url} className="rounded-lg border border-border p-2.5">
            <div className="truncate text-xs font-medium">{s.label}</div>
            <div className="truncate text-[10px] text-ink/40">{s.url.replace(/^https?:\/\/(www\.)?/, "")}</div>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <span className="truncate text-[10px] text-ink/55">{s.phrase ? <>Metinde: “<b>{s.phrase}</b>”</> : "Metinde eşleşme yok"}</span>
              <button type="button" onClick={() => add(s)} className="shrink-0 rounded-md bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent hover:bg-accent/20">+ Ekle</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AssistantPanel({ busy, onRun }: { busy: boolean; onRun: (instruction: string) => void }) {
  const [t, setT] = useState("");
  const QUICK = ["Girişi daha çarpıcı yap", "Her H2'nin altına cevap-önce cümle ekle", "Karşılaştırma tablosu ekle", "Daha samimi ve sade bir ton kullan", "Gereksiz tekrarları temizle"];
  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-ink/50">Tüm yazıya uygulanacak bir talimat ver. Sonucu önce önizlersin, sonra uygularsın.</p>
      <textarea value={t} onChange={(e) => setT(e.target.value)} rows={4} placeholder="ör. 'Yazıyı 1500 kelimeye çıkar ve beden rehberi bölümü ekle'" className="w-full resize-none rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent" />
      <div className="flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <button key={q} type="button" onClick={() => setT(q)} className="rounded-full border border-border px-2.5 py-1 text-[10px] font-medium text-ink/60 hover:border-accent hover:text-accent">{q}</button>
        ))}
      </div>
      <button type="button" disabled={busy || !t.trim()} onClick={() => onRun(t)} className="w-full rounded-lg bg-accent py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50">{busy ? "Yazıyor… (20-40 sn)" : "✦ Uygula"}</button>
    </div>
  );
}
