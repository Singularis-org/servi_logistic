// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GeografiaPlataformaModule } from "@/app/(app)/plataforma/geografia/_components/GeografiaPlataformaModule";
import { crearPaisAction } from "@/lib/actions/geografia-plataforma";
import { PAISES_ISO_3166_1, paisDelCatalogo } from "@/lib/constants/paises-iso-3166-1";
import type { PaisDTO } from "@/lib/types/pais";
import { prefijoOficial } from "@/lib/utils/prefijo-oficial";

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

// Lo mismo que calcula la página en el servidor (design §5).
const PREFIJOS_OFICIALES = Object.fromEntries(PAISES_ISO_3166_1.map((p) => [p.id, prefijoOficial(p.id)]));
const ZONAS = ["America/Costa_Rica", "America/El_Salvador", "Europe/Paris"];

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
    // SLT-42: un país dado de alta por la pantalla nace sin teléfono ni zona.
    prefijoTelefonico: null,
    telefonoDigitosNacionales: null,
    zonaHoraria: null,
  };
}

async function abrirAltaYEscribir(paises: PaisDTO[], consulta: string) {
  const user = userEvent.setup();
  render(
    <GeografiaPlataformaModule
      paises={paises}
      paisElegido={null}
      provincias={[]}
      tiposDocumento={[]}
      zonas={ZONAS}
      prefijosOficiales={PREFIJOS_OFICIALES}
    />,
  );
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

// SLT-81 (design §5, §6; R5, R26) — «Nuevo país» pide además el prefijo, los dígitos, la zona y al
// menos un tipo de documento. El prefijo viene cargado con el oficial al elegir el país; los países
// que libphonenumber no conoce no se ofrecen (decisión del 2026-11-07).
describe("GeografiaPlataformaModule > alta de país con sus datos (SLT-81 R5, R26)", () => {
  type Usuario = ReturnType<typeof userEvent.setup>;

  afterEach(() => {
    vi.mocked(crearPaisAction).mockReset();
  });

  async function abrirAlta() {
    const user = userEvent.setup();
    render(
      <GeografiaPlataformaModule
        paises={[]}
        paisElegido={null}
        provincias={[]}
        tiposDocumento={[]}
        zonas={ZONAS}
        prefijosOficiales={PREFIJOS_OFICIALES}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Nuevo país" }));
    const dialogo = await screen.findByRole("dialog", { name: "Nuevo país" });
    return { user, dialogo };
  }

  function buscadorDePais(dialogo: HTMLElement) {
    return within(dialogo).getByRole("combobox", { name: /^País/ });
  }

  async function elegir(user: Usuario, dialogo: HTMLElement, consulta: string, opcion: string) {
    await user.type(buscadorDePais(dialogo), consulta);
    await user.click(await screen.findByRole("option", { name: opcion }));
  }

  async function llenarNiveles(user: Usuario, dialogo: HTMLElement) {
    const campos = [
      "Nivel 1, en singular",
      "Nivel 1, en plural",
      "Nivel 2, en singular",
      "Nivel 2, en plural",
      "Nivel 3, en singular",
      "Nivel 3, en plural",
    ];
    for (const campo of campos) {
      await user.type(within(dialogo).getByLabelText(new RegExp(`^${campo}`)), "Nombre");
    }
  }

  it("muestra los campos nuevos: prefijo, dígitos, zona y un primer tipo de documento", async () => {
    const { dialogo } = await abrirAlta();
    expect(within(dialogo).getByLabelText(/^Prefijo telefónico/)).toHaveValue("");
    expect(within(dialogo).getByLabelText(/^Dígitos nacionales/)).toBeInTheDocument();
    expect(within(dialogo).getByRole("combobox", { name: /^Zona horaria/ })).toBeInTheDocument();
    const tipo = within(dialogo).getByRole("group", { name: "Tipo de documento 1" });
    expect(within(tipo).getByLabelText(/^Documento/)).toBeInTheDocument();
    expect(within(tipo).getByLabelText(/^Largo mínimo/)).toBeInTheDocument();
    expect(within(tipo).getByLabelText(/^Largo máximo/)).toBeInTheDocument();
    // Con una sola fila no se puede quitar: el alta exige al menos un tipo (R5).
    expect(within(dialogo).queryByRole("button", { name: /^Quitar/ })).toBeNull();
  });

  it("R26: al elegir el país, el prefijo aparece cargado con el oficial", async () => {
    const { user, dialogo } = await abrirAlta();
    await elegir(user, dialogo, "Franc", "Francia (FR)");
    expect(within(dialogo).getByLabelText(/^Prefijo telefónico/)).toHaveValue(PREFIJOS_OFICIALES.FR);
    expect(
      within(dialogo).getByText(`Sin «+». El oficial de Francia es +${PREFIJOS_OFICIALES.FR}.`),
    ).toBeInTheDocument();
  });

  it("R26: no ofrece un país sin prefijo oficial conocido (Antártida, Isla Bouvet)", async () => {
    const { user, dialogo } = await abrirAlta();
    // Con la lista abierta, Base UI saca el resto del diálogo del árbol accesible: se guarda el input.
    const buscador = buscadorDePais(dialogo);
    await user.type(buscador, "Antár");
    expect(screen.queryByRole("option", { name: "Antártida (AQ)" })).toBeNull();
    await user.clear(buscador);
    await user.type(buscador, "Bouvet");
    expect(screen.queryByRole("option", { name: "Isla Bouvet (BV)" })).toBeNull();
  });

  it("R5: sin dígitos, sin zona y con el tipo vacío no envía y marca cada campo", async () => {
    const { user, dialogo } = await abrirAlta();
    await elegir(user, dialogo, "Franc", "Francia (FR)");
    await llenarNiveles(user, dialogo);
    await user.click(within(dialogo).getByRole("button", { name: "Dar de alta" }));

    expect(await within(dialogo).findByText("Elige una zona horaria de la lista.")).toBeInTheDocument();
    expect(within(dialogo).getByLabelText(/^Dígitos nacionales/)).toHaveAttribute("aria-invalid", "true");
    const tipo = within(dialogo).getByRole("group", { name: "Tipo de documento 1" });
    expect(within(tipo).getByLabelText(/^Documento/)).toHaveAttribute("aria-invalid", "true");
    expect(within(tipo).getByLabelText(/^Largo mínimo/)).toHaveAttribute("aria-invalid", "true");
    expect(vi.mocked(crearPaisAction)).not.toHaveBeenCalled();
  });

  it("R5, R26: los errores del servidor se muestran en su campo, también los de un tipo (`tiposDocumento.1.largoMax`)", async () => {
    vi.mocked(crearPaisAction).mockResolvedValue({
      status: "validation_error",
      fieldErrors: {
        prefijoTelefonico: ["El prefijo de Francia es +33"],
        "tiposDocumento.1.largoMax": ["El largo máximo no puede ser menor que el mínimo."],
      },
    });
    const { user, dialogo } = await abrirAlta();
    await elegir(user, dialogo, "Franc", "Francia (FR)");
    await llenarNiveles(user, dialogo);
    const prefijo = within(dialogo).getByLabelText(/^Prefijo telefónico/);
    await user.clear(prefijo);
    await user.type(prefijo, "34");
    await user.type(within(dialogo).getByLabelText(/^Dígitos nacionales/), "9");
    await user.type(within(dialogo).getByRole("combobox", { name: /^Zona horaria/ }), "paris");
    await user.click(await screen.findByRole("option", { name: "Europe/Paris" }));

    await user.click(within(dialogo).getByRole("button", { name: "Agregar otro tipo de documento" }));
    const filas: [string, string, string, string][] = [
      ["1", "Carte identite", "12", "12"],
      ["2", "Passeport", "9", "8"],
    ];
    for (const [n, nombre, min, max] of filas) {
      const tipo = within(dialogo).getByRole("group", { name: `Tipo de documento ${n}` });
      await user.type(within(tipo).getByLabelText(/^Documento/), nombre);
      await user.type(within(tipo).getByLabelText(/^Largo mínimo/), min);
      await user.type(within(tipo).getByLabelText(/^Largo máximo/), max);
    }
    await user.click(within(dialogo).getByRole("button", { name: "Dar de alta" }));

    await waitFor(() => expect(vi.mocked(crearPaisAction)).toHaveBeenCalledTimes(1));
    expect(vi.mocked(crearPaisAction).mock.calls[0][0]).toMatchObject({
      id: "FR",
      prefijoTelefonico: "34",
      telefonoDigitosNacionales: 9,
      zonaHoraria: "Europe/Paris",
      tiposDocumento: [
        { nombre: "Carte identite", caracteres: "digitos", largoMin: 12, largoMax: 12 },
        { nombre: "Passeport", caracteres: "digitos", largoMin: 9, largoMax: 8 },
      ],
    });
    expect(await within(dialogo).findByText("El prefijo de Francia es +33")).toBeInTheDocument();
    const segundo = within(dialogo).getByRole("group", { name: "Tipo de documento 2" });
    expect(within(segundo).getByText("El largo máximo no puede ser menor que el mínimo.")).toBeInTheDocument();
    expect(within(segundo).getByLabelText(/^Largo máximo/)).toHaveAttribute("aria-invalid", "true");
  });
});
