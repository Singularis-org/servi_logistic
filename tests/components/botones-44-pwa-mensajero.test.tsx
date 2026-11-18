// @vitest-environment jsdom
// SLT-193 «Botones de 44 px pendientes en la PWA del mensajero» — bloque A (R910, R916-R919, R921).
//
// - R910: «Ver detalle completo» del Mosaico mide 44 px de alto a todo el ancho y despliega como hoy.
//   SLT-202 «Escritorio igual a prod: tamaños de controles y un solo botón de recibir» (decisión de
//   Carlos del 2026-11-18): los 44 px, solo en el móvil (`max-md:min-h-11`); la tarjeta también se
//   monta en `/novedades` de escritorio, que vuelve al alto de prod.
// - R916: el (i) de los usos del mensajero lleva `CLASE_INFO_TACTIL` en su envoltorio (el
//   pseudo-elemento crece de 24 a 44; la caja sigue en 16 × 16, `size-4`).
// - R918: el (i) que flota sobre el chip en la tarjeta Detalle NO lo lleva (excepción de Carlos).
// - R919: en `FilaGestion`, la misma clase con `max-md:` (solo móvil).
//
// jsdom no aplica Tailwind: se afirman las clases; la medida real es del E2E
// (`e2e/pwa-mensajero-botones-44.spec.ts`). Las tarjetas se renderizan; las pantallas pesadas
// (chat, panel de gestión, hoja del mapa y fila del cierre) se leen del disco: cada `<EstadoConInfo`,
// `<NotaAyudaConInfo` o `<InfoEstado` debe llevar la clase en su envoltorio.
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PosOrderCard } from "@/app/(app)/mis-asignaciones/_components/pos-card/PosOrderCard";
import { PosOrderCardMosaico } from "@/app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardMosaico";
import { PosOrderCardDetalle } from "@/app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardDetalle";
import { CLASE_INFO_TACTIL, CLASE_INFO_TACTIL_MOVIL } from "@/components/shared/texto-entero";
import type { MiAsignacionDTO } from "@/lib/interfaces/services/IMisAsignacionesService";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
// El modal de ubicación arrastra Leaflet vía `next/dynamic`; irrelevante aquí.
vi.mock("@/app/(app)/mis-asignaciones/_components/UbicacionMapa", () => ({ UbicacionMapa: () => null }));

afterEach(() => cleanup());

function makeOrden(over: Partial<MiAsignacionDTO> = {}): MiAsignacionDTO {
  return {
    id: "o1",
    numGuia: 1001,
    numRemision: "REM-1",
    estatusValue: "en_reparto",
    destinatario: "Ana",
    telefonoDest: "70001111",
    direccion: "200m sur de la iglesia",
    producto: "Caja",
    peso: 1.2,
    montoCobrar: 25000,
    latitud: 9.93,
    longitud: -84.08,
    notas: null,
    tiendaNombre: "Tienda Norte",
    zonaNombre: "GAM",
    provinciaNombre: "San José",
    cantonNombre: "Escazú",
    distritoNombre: "San Rafael",
    sinpeNumero: "80000000",
    sinpeNombre: "Titular de Prueba",
    secuenciaRuta: 1,
    marcarLuego: false,
    intentosEntrega: 0,
    ...over,
  };
}

const INFO_ESTADO = "Qué significa «En reparto»";
const INFO_NOTA = "Qué significa «Ayuda solicitada a la tienda»";

/** ¿Algún antecesor del botón (dentro del artículo) lleva la clase? */
function envoltorioLleva(boton: HTMLElement, clase: string): boolean {
  for (let el = boton.parentElement; el && el.tagName !== "ARTICLE"; el = el.parentElement) {
    if (el.classList.contains(clase)) return true;
  }
  return false;
}

function clases(el: HTMLElement): string[] {
  return el.className.split(/\s+/);
}

describe("SLT-193 · las constantes (contrato literal: 16 + 2 × 14 = 44)", () => {
  it("R916/R919: `CLASE_INFO_TACTIL` y su variante de móvil", () => {
    expect(CLASE_INFO_TACTIL).toBe("[&_button]:after:-inset-3.5");
    expect(CLASE_INFO_TACTIL_MOVIL).toBe("max-md:[&_button]:after:-inset-3.5");
  });
});

describe("SLT-193 · R910 — «Ver detalle completo» del Mosaico", () => {
  it("R910/R921: el disparador mide 44 px de alto en el móvil (SLT-202), a todo el ancho, y despliega como hoy", async () => {
    const user = userEvent.setup();
    render(<PosOrderCardMosaico orden={makeOrden()} total={3} onGestionar={() => {}} />);
    const disparador = screen.getByRole("button", { name: "Ver detalle completo" });
    expect(clases(disparador)).toEqual(expect.arrayContaining(["max-md:min-h-11", "w-full"]));
    expect(clases(disparador)).not.toContain("min-h-11");
    // Texto y chevron de hoy.
    expect(disparador).toHaveTextContent("Ver detalle completo");
    expect(disparador.querySelector("svg")).not.toBeNull();
    expect(disparador).toHaveAttribute("aria-expanded", "false");
    await user.click(disparador);
    expect(disparador).toHaveAttribute("aria-expanded", "true");
  });
});

// Las tres vistas pintan el (i) del estado y el de la nota de ayuda. PosOrderCard (la completa)
// lo hace con `PosCardHeader`.
describe.each([
  ["mosaico", PosOrderCardMosaico],
  ["completa (PosCardHeader)", PosOrderCard],
] as const)("SLT-193 · R916 — tarjeta %s", (_vista, Card) => {
  it("R916/R921: el (i) del estado y el de la nota llevan el área de 44; su caja sigue en 16 × 16", () => {
    render(<Card orden={makeOrden()} total={3} onGestionar={() => {}} notaAyuda />);
    const articulo = screen.getByRole("article");
    for (const nombre of [INFO_ESTADO, INFO_NOTA]) {
      const boton = within(articulo).getByRole("button", { name: nombre });
      expect(envoltorioLleva(boton, CLASE_INFO_TACTIL), nombre).toBe(true);
      expect(clases(boton)).toContain("size-4");
      expect(clases(boton)).toContain("after:-inset-1");
    }
  });
});

describe("SLT-193 · tarjeta Detalle (R916, R918)", () => {
  it("R916: el (i) de la nota de ayuda lleva el área de 44", () => {
    render(<PosOrderCardDetalle orden={makeOrden()} total={3} onGestionar={() => {}} notaAyuda />);
    const boton = within(screen.getByRole("article")).getByRole("button", { name: INFO_NOTA });
    expect(envoltorioLleva(boton, CLASE_INFO_TACTIL)).toBe(true);
    expect(clases(boton)).toContain("size-4");
  });

  it("R918: el (i) que flota sobre el chip de estado NO se amplía: sigue en 24 × 24", () => {
    render(<PosOrderCardDetalle orden={makeOrden()} total={3} onGestionar={() => {}} notaAyuda />);
    const boton = within(screen.getByRole("article")).getByRole("button", { name: INFO_ESTADO });
    expect(envoltorioLleva(boton, CLASE_INFO_TACTIL)).toBe(false);
    expect(envoltorioLleva(boton, CLASE_INFO_TACTIL_MOVIL)).toBe(false);
    expect(clases(boton)).toContain("after:-inset-1");
    expect(clases(boton)).not.toContain("after:-inset-3.5");
  });
});

// ─── Pantallas pesadas, leídas del disco ────────────────────────────────────────────────────────
const RAIZ = process.cwd();
const MA = "app/(app)/mis-asignaciones/_components";

/**
 * Cada uso del (i) en el archivo: el bloque JSX desde `<Etiqueta` hasta su `/>` y la línea anterior
 * no vacía (el envoltorio, cuando la pieza no recibe `className`, como `InfoEstado`).
 */
function usosDelInfo(archivo: string): { bloque: string; anterior: string }[] {
  const fuente = readFileSync(path.join(RAIZ, archivo), "utf8");
  const usos: { bloque: string; anterior: string }[] = [];
  const re = /<(EstadoConInfo|NotaAyudaConInfo|InfoEstado)\b/g;
  for (let m = re.exec(fuente); m; m = re.exec(fuente)) {
    const fin = fuente.indexOf("/>", m.index);
    const lineas = fuente.slice(0, m.index).split("\n").map((l) => l.trim()).filter(Boolean);
    usos.push({ bloque: fuente.slice(m.index, fin), anterior: lineas[lineas.length - 1] ?? "" });
  }
  return usos;
}

describe("SLT-193 · R916 — (i) a 44 en todos los anchos (pantallas del mensajero)", () => {
  it.each([
    [`${MA}/chat/ChatConversacion.tsx`, 1],
    [`${MA}/chat/ChatOrdenesLista.tsx`, 1],
    [`${MA}/GestionarOrdenPanel.tsx`, 1],
    [`${MA}/HojaParadaMapa.tsx`, 1],
  ] as const)("%s: cada (i) lleva `CLASE_INFO_TACTIL` en su envoltorio", (archivo, cuantos) => {
    const usos = usosDelInfo(archivo);
    expect(usos).toHaveLength(cuantos);
    for (const { bloque, anterior } of usos) {
      expect(`${bloque}\n${anterior}`).toMatch(/\bCLASE_INFO_TACTIL\b/);
      expect(`${bloque}\n${anterior}`).not.toContain("CLASE_INFO_TACTIL_MOVIL");
    }
  });
});

describe("SLT-193 · R919 — (i) de FilaGestion a 44 solo en móvil", () => {
  it("cada (i) lleva la variante con `max-md:`, nunca la de todos los anchos", () => {
    const usos = usosDelInfo("components/private/cierres/fila/FilaGestion.tsx");
    expect(usos).toHaveLength(2);
    for (const { bloque } of usos) {
      expect(bloque).toContain("className={CLASE_INFO_TACTIL_MOVIL}");
      expect(bloque).not.toMatch(/\bCLASE_INFO_TACTIL\b(?!_MOVIL)/);
    }
    expect(CLASE_INFO_TACTIL_MOVIL.startsWith("max-md:")).toBe(true);
  });
});
