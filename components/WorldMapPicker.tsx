"use client";

import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import worldTopology from "world-atlas/countries-110m.json";
import { TARGET_MARKET_COUNTRIES } from "@/lib/country-map";

/**
 * Kart 8 — Adım 2 "Marka profilini doğrula": "Hedef pazarlar: harita ve ülke seçici".
 *
 * Gerçek bir dünya haritası — world-atlas (npm, Natural Earth kaynaklı topojson verisi),
 * react-simple-maps ile SVG'ye çizilir; çizilmiş/sahte bir harita değil, dünyanın tamamı
 * coğrafi olarak doğru şekilde görünür. Ama bu projedeki ülke tahmin/eşleştirme mantığı
 * (lib/country-map.ts) kasıtlı olarak dar bir ~40 ülkelik listeyle sınırlı (Epicsem'in gerçek
 * müşteri tabanının hedefleyebileceği pazarlar) — o listenin DIŞINDAKİ bir ülkeye tıklamak
 * kasıtlı olarak hiçbir şey yapmaz (seçilemez, imleç de "pointer" göstermez) çünkü o ülke için
 * ne bir isim ne de bir ISO kod elimizde var; sahte bir "seçildi" hissi vermek yerine o ülkeyi
 * tıklanamaz bırakmak, no-fabrication prensibiyle tutarlı.
 *
 * world-atlas'ın her geometry'sindeki "id" alanı ISO 3166-1 numeric koddur (isim değil) — bu
 * yüzden TARGET_MARKET_COUNTRIES'teki isoNumericId alanı var; python3 ile world-atlas'ın kendi
 * JSON'ından tek tek doğrulandı (bkz. lib/country-map.ts'teki yorum).
 */
export default function WorldMapPicker({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (code: string) => void;
}) {
  const codeByNumericId = new Map(TARGET_MARKET_COUNTRIES.map((c) => [c.isoNumericId, c.code]));
  const selectedSet = new Set(selected);

  return (
    <div className="rounded-lg border border-border bg-muted/40 overflow-hidden select-none">
      <ComposableMap projection="geoEqualEarth" projectionConfig={{ scale: 118 }} style={{ width: "100%", height: "170px" }}>
        <Geographies
          // world-atlas'ın ham JSON'ı bir TopoJSON Topology'dir; react-simple-maps bunu
          // içeride topojson-client ile GeoJSON'a çeviriyor (bkz. kütüphanenin kendi
          // kaynağı) — ama @types/geojson'ın GeoJsonObject arayüzü "Topology" tipini
          // tanımadığı için TS burada yapısal bir uyumsuzluk görüyor; çalışma zamanı
          // davranışı doğru, sadece tip beyanı eksik olduğu için `as any` kullanılıyor.
          geography={worldTopology as any}
        >
          {({ geographies }) =>
            geographies.map((geo) => {
              const code = codeByNumericId.get(String(geo.id));
              const isSelected = !!code && selectedSet.has(code);
              // react-simple-maps v5's <Geography> only forwards plain SVG props (the old
              // v1-3 {default,hover,pressed} style shorthand is gone) — hover/pressed states
              // aren't worth a second render pass here, so selection is the only visual state:
              // a flat fill for selected vs. unselected/unselectable, set directly.
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  onClick={() => code && onToggle(code)}
                  fill={isSelected ? "#5d16ff" : "#e2e8f0"}
                  stroke="#f8fafc"
                  strokeWidth={0.4}
                  style={{ outline: "none", cursor: code ? "pointer" : "default" }}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>
    </div>
  );
}
