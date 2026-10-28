// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GeografiaPlataformaModule } from "@/app/(app)/plataforma/geografia/_components/GeografiaPlataformaModule";
import { PAISES_ISO_3166_1, paisDelCatalogo } from "@/lib/constants/paises-iso-3166-1";
import type { PaisDTO } from "@/lib/types/pais";

// SL-20 (design §8; R42; decisión 11 tras la review 1) — el autocompletado del alta de país NO
// ofrece los países que ya están dados de alta (los que la pantalla recibe en `paises`): elegirlos
// solo llevaría a un `conflict` al guardar. Con todos dados de alta, la lista lo dice.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    show: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

// Evita que jsdom arrastre Prisma por las Server Actions; este test no guarda nada.
vi.mock("@/lib/actions/geografia-plataforma", () => ({
  cambiarDisponibilidadPaisAction: vi.fn(),
  cargarDivisionAction: vi.fn(),
  crearPaisAction: vi.fn(),
}));

function paisDadoDeAlta(id: string): PaisDTO {
  const delCatalogo = paisDelCatalogo(id);
  if (delCatalogo === null) throw new Error(`El catálogo no tiene ${id}`);
  return {
    id,
    nombre: delCatalogo.nombre,
    nivel1Singular: "Región",
    nivel1Plural: "Regiones",
    nivel2Singular: "Comuna",
    nivel2Plural: "Comunas",
    nivel3Singular: "Barrio",
    nivel3Plural: "Barrios",
    digitosCodigoNivel1: null,
    digitosCodigoNivel2: null,
    digitosCodigoNivel3: null,
    disponible: true,
  };
}

async function abrirAltaYEscribir(paises: PaisDTO[], consulta: string) {
  const user = userEvent.setup();
  render(<GeografiaPlataformaModule paises={paises} paisElegido={null} provincias={[]} />);
  await user.click(screen.getByRole("button", { name: "Nuevo país" }));
  const input = await screen.findByRole("combobox", { name: /País/ });
  await user.type(input, consulta);
  return { user, input };
}

afterEach(() => {
  cleanup();
});

describe("GeografiaPlataformaModule > alta de país: oculta los ya dados de alta (R42, decisión 11)", () => {
  const dadosDeAlta = [paisDadoDeAlta("NI"), paisDadoDeAlta("ES")];

  it("no ofrece un país ya dado de alta, buscado por nombre", async () => {
    await abrirAltaYEscribir(dadosDeAlta, "Nicar");

    expect(screen.queryByRole("option", { name: "Nicaragua (NI)" })).toBeNull();
    expect(await screen.findByText("Ningún país casa con lo escrito.")).toBeTruthy();
  });

  it("no ofrece un país ya dado de alta, buscado por código", async () => {
    await abrirAltaYEscribir(dadosDeAlta, "es");

    expect(screen.queryByRole("option", { name: "España (ES)" })).toBeNull();
  });

  it("sí ofrece un país que aún no está dado de alta", async () => {
    await abrirAltaYEscribir(dadosDeAlta, "Franc");

    expect(await screen.findByRole("option", { name: "Francia (FR)" })).toBeTruthy();
  });

  it("con todo el catálogo dado de alta, la lista lo dice en vez de quedar en blanco", async () => {
    const todos = PAISES_ISO_3166_1.map((p) => paisDadoDeAlta(p.id));
    await abrirAltaYEscribir(todos, "a");

    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(
      await screen.findByText("Todos los países del catálogo ya están dados de alta."),
    ).toBeTruthy();
  });
});
