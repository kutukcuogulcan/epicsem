"use client";

/**
 * Aktif proje bağlamı — sol menüdeki seçiciyle seçilen site/marka/rakipler tüm araç
 * sayfalarına buradan gelir. Sayfalar siteyi kendileri tahmin etmez:
 *
 *   const { project } = useProject();
 *   useEffect(() => { if (project) load(project.domain) }, [project?.domain]);
 */
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface Project {
  id: number;
  name: string;
  domain: string;
  competitors: { name: string; domain: string }[];
}

interface Ctx {
  project: Project | null;
  projects: Project[];
  suggestions: string[];
  /** İlk yükleme bitti mi (false iken sayfalar beklesin). */
  ready: boolean;
  error: string | null;
  select: (id: number) => Promise<void>;
  create: (p: { name: string; domain: string; competitors?: { name: string; domain: string }[] }) => Promise<Project>;
  update: (p: { id: number; name?: string; domain?: string; competitors?: { name: string; domain: string }[] }) => Promise<Project>;
  refresh: () => Promise<void>;
}

const ProjectContext = createContext<Ctx | null>(null);

async function call<T>(method: string, body?: unknown): Promise<T> {
  const r = await fetch("/api/project", { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? "Proje isteği başarısız");
  return d as T;
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/project");
      if (r.status === 401) return; // giriş yapılmamış: sayfalar kendi 401 akışını yönetir
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Projeler alınamadı");
      setProjects(d.projects ?? []);
      setSuggestions(d.suggestions ?? []);
      setProject(d.active ?? null);
      setError(null);
    } catch (e) {
      console.error("[ProjectProvider] refresh failed:", e);
      setError(e instanceof Error ? e.message : "Projeler alınamadı");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const select = useCallback(
    async (id: number) => {
      const d = await call<{ active: Project }>("PUT", { id });
      setProject(d.active);
      router.refresh(); // sunucu bileşenleri (ör. Genel Bakış) yeni projeyle yeniden çizilsin
    },
    [router]
  );
  const create = useCallback(
    async (p: { name: string; domain: string; competitors?: { name: string; domain: string }[] }) => {
      const d = await call<{ active: Project }>("POST", p);
      setProject(d.active);
      await refresh();
      router.refresh();
      return d.active;
    },
    [refresh, router]
  );
  const update = useCallback(
    async (p: { id: number; name?: string; domain?: string; competitors?: { name: string; domain: string }[] }) => {
      const d = await call<{ active: Project }>("PATCH", p);
      await refresh();
      router.refresh();
      return d.active;
    },
    [refresh, router]
  );

  const value = useMemo(() => ({ project, projects, suggestions, ready, error, select, create, update, refresh }), [project, projects, suggestions, ready, error, select, create, update, refresh]);
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

/** Aktif proje. Sağlayıcı dışında (pazarlama sayfaları) boş değer döner. */
export function useProject(): Ctx {
  const c = useContext(ProjectContext);
  if (c) return c;
  return {
    project: null,
    projects: [],
    suggestions: [],
    ready: true,
    error: null,
    select: async () => {},
    create: async () => {
      throw new Error("Proje bağlamı yok");
    },
    update: async () => {
      throw new Error("Proje bağlamı yok");
    },
    refresh: async () => {},
  };
}
