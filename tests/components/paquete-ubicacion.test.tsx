// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

// SLT-125 (design §5; R9, R10) — LA «UBICACIÓN» DE `/paquete/<numGuia>` Y DE LA VISTA PREVIA DE LA ETIQUETA.
//
// Las dos pintan la zona y TODOS los nombres de la ruta (`lugarRuta`, del nivel 1 al lugar) con « / »,
// sin tramos vacíos; `/paquete` pinta «—» si no queda ninguno, como hoy. Sin `lugarRuta`, los tres
// nombres de hoy: en Costa Rica, lo mismo que antes. Se ejercita el `page.tsx` REAL, con sus dos bordes
// (sesión y Server Action) doblados como en `EtiquetaFechaEnPantalla.test.tsx`.
//
// Los nombres de lugar de las rutas de 2, 4 y 10 niveles son inventados: ninguno es un tipo (R42).

vi.mock("qrcode.react", () => ({ QRCodeCanvas: () => <canvas data-testid="qr-stub" /> }));
vi.mock("react-barcode", () => ({ default: () => <div data-testid="barcode-stub" /> }));

class NotFoundError extends Error {}
class RedirectError extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFoundError("notFound");
  },
  redirect: (destino: string) => {
    throw new RedirectError(destino);
  },
}));

const resolveActorMock = vi.fn();
vi.mock("@/lib/auth/resolve-actor", () => ({ resolveActorFromSession: () => resolveActorMock() }));

const obtenerEtiquetaPorGuiaMock = vi.fn();
vi.mock("@/lib/actions/etiquetas-guia", () => ({
  obtenerEtiquetaPorGuia: (...a: unknown[]) => obtenerEtiquetaPorGuiaMock(...a),
}));

import { EtiquetaGuia } from "@/app/(app)/ordenes/_components/EtiquetaGuia";
import type { EtiquetaGuiaDTO } from "@/lib/types/etiqueta-guia";

function makeEtiqueta(over: Partial<EtiquetaGuiaDTO> = {}): EtiquetaGuiaDTO {
  return {
    ordenId: "orden-125",
    numGuia: 4021,
    numRemision: "REM-777",
    destinatario: "María Solís",
    telefonoDest: "0999888777",
    direccion: "100m sur de la iglesia",
    producto: "Caja de zapatos",
    montoCobrar: 12345.5,
    tiendaNombre: "Tienda Central",
    zonaNombre: "Zona A",
    provinciaNombre: "San José",
    cantonNombre: "Escazú",
    distritoNombre: "San Rafael",
    fechaCreacion: "2026-08-27",
    qrValue: "4021",
    barcodeValue: "4021",
    ...over,
  };
}

const paso = (nombre: string, i: number) => ({ id: `n-${i}`, nombre });

async function ubicacionDePaquete(etiqueta: EtiquetaGuiaDTO): Promise<string> {
  resolveActorMock.mockResolvedValue({ usuarioId: "u1", rol: "mensajero" });
  obtenerEtiquetaPorGuiaMock.mockResolvedValue({ status: "ok", etiqueta });
  const { default: PaquetePage } = await import("@/app/paquete/[numGuia]/page");
  render(await PaquetePage({ params: Promise.resolve({ numGuia: String(etiqueta.numGuia) }) }));
  const rotulo = screen.getByText("Ubicación");
  const campo = rotulo.parentElement!;
  return within(campo).getByRole("definition").textContent ?? "";
}

const RUTAS = [
  ["2 niveles", ["Alfa", "Beta"]],
  ["3 niveles", ["Alfa", "Beta", "Gama"]],
  ["4 niveles", ["Alfa", "Beta", "Gama", "Delta"]],
  ["10 niveles", ["N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8", "N9", "N10"]],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("R9 — /paquete: la zona y toda la ruta, con « / »", () => {
  it.each(RUTAS)("%s", async (_, nombres) => {
    const texto = await ubicacionDePaquete(makeEtiqueta({ lugarRuta: nombres.map(paso) }));
    expect(texto).toBe(["Zona A", ...nombres].join(" / "));
  });

  it("omite los tramos vacíos", async () => {
    const texto = await ubicacionDePaquete(
      makeEtiqueta({ zonaNombre: "", lugarRuta: [paso("Alfa", 0), paso("", 1), paso("Gama", 2)] }),
    );
    expect(texto).toBe("Alfa / Gama");
  });

  it("sin ningún tramo, «—» como hoy", async () => {
    expect(await ubicacionDePaquete(makeEtiqueta({ zonaNombre: "", lugarRuta: [] }))).toBe("—");
  });
});

describe("R10 — /paquete en Costa Rica sale igual que antes", () => {
  it("sin `lugarRuta`, los tres nombres de hoy", async () => {
    expect(await ubicacionDePaquete(makeEtiqueta())).toBe("Zona A / San José / Escazú / San Rafael");
  });

  it("con la ruta del catálogo, la misma línea", async () => {
    const ruta = [paso("San José", 0), paso("Escazú", 1), paso("San Rafael", 2)];
    expect(await ubicacionDePaquete(makeEtiqueta({ lugarRuta: ruta }))).toBe("Zona A / San José / Escazú / San Rafael");
  });

  it("sin nada de geografía de hoy, «—»", async () => {
    expect(
      await ubicacionDePaquete(
        makeEtiqueta({ zonaNombre: "", provinciaNombre: "", cantonNombre: "", distritoNombre: null }),
      ),
    ).toBe("—");
  });
});

describe("R9/R10 — la vista previa de la etiqueta pinta la misma línea que el PDF", () => {
  it.each(RUTAS)("%s", (_, nombres) => {
    render(<EtiquetaGuia etiqueta={makeEtiqueta({ lugarRuta: nombres.map(paso) })} />);
    expect(
      within(screen.getByTestId("etiqueta-destino")).getByText(["Zona A", ...nombres].join(" / ")),
    ).toBeInTheDocument();
  });

  it("Costa Rica sin `lugarRuta`: la línea de hoy", () => {
    render(<EtiquetaGuia etiqueta={makeEtiqueta()} />);
    expect(
      within(screen.getByTestId("etiqueta-destino")).getByText("Zona A / San José / Escazú / San Rafael"),
    ).toBeInTheDocument();
  });
});
