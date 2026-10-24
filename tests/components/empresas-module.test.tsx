// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { EmpresaListada } from "@/lib/types/empresas-plataforma";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn() }),
}));

import { EmpresasModule } from "@/app/(app)/plataforma/empresas/_components/EmpresasModule";

const TIPOS = [
  { id: "tipo-1", value: "cedula" },
  { id: "tipo-2", value: "ruc" },
  { id: "tipo-3", value: "pasaporte" },
];

const EMPRESAS: EmpresaListada[] = [
  {
    id: "org-2",
    nombre: "Envíos Norte",
    slug: "envios-norte",
    creadaEn: new Date("2026-10-20T12:00:00Z"),
    maestros: [
      { nombre: "Ana Pérez", email: "ana@norte.test" },
      { nombre: "Luis Gómez", email: "luis@norte.test" },
    ],
    cobroPorOrden: null,
    // SL-45 (R28): el Record del listado exige la deuda; aquí, al día.
    deudaPlataforma: { deuda: "0.00", estado: "al_dia", importe: "0.00" },
    pagadoPlataforma: "0.00",
  },
  {
    id: "org-1",
    nombre: "Reparto Sur",
    slug: "reparto-sur",
    creadaEn: new Date("2026-09-05T12:00:00Z"),
    maestros: [],
    cobroPorOrden: null,
    // SL-45 (R28): el Record del listado exige la deuda; aquí, al día.
    deudaPlataforma: { deuda: "0.00", estado: "al_dia", importe: "0.00" },
    pagadoPlataforma: "0.00",
  },
];

const AVISO =
  "Empresa creada. El maestro entra con «¿Olvidaste tu contraseña?» y su email.";
const GENERICO = "No se pudo crear la empresa. Inténtalo de nuevo.";

function montar(altaEmpresa = vi.fn(), empresas: EmpresaListada[] = EMPRESAS) {
  const utils = render(
    <EmpresasModule
      empresas={empresas}
      tiposDocumento={TIPOS}
      altaEmpresa={altaEmpresa}
      cobroGlobal={{ monto: null }}
      fijarCobroGlobal={vi.fn()}
      fijarCobroEmpresa={vi.fn()}
    />,
  );
  return { ...utils, altaEmpresa };
}

/** Los campos, buscados dentro de su grupo: hay dos «Nombre». */
function campos() {
  const empresa = within(screen.getByRole("group", { name: "Empresa" }));
  const maestro = within(screen.getByRole("group", { name: "Primer maestro" }));
  return {
    nombre: empresa.getByLabelText("Nombre") as HTMLInputElement,
    slug: empresa.getByLabelText("Slug") as HTMLInputElement,
    maestroNombre: maestro.getByLabelText("Nombre") as HTMLInputElement,
    email: maestro.getByLabelText("Email") as HTMLInputElement,
    telefono: maestro.getByLabelText("Teléfono") as HTMLInputElement,
    documento: maestro.getByLabelText("Documento") as HTMLInputElement,
    tipo: maestro.getByRole("combobox", { name: "Tipo de documento" }),
  };
}

async function rellenar(user: ReturnType<typeof userEvent.setup>) {
  const c = campos();
  await user.type(c.nombre, "Envíos Este");
  await user.type(c.slug, "envios-este");
  await user.type(c.maestroNombre, "Marta Ruiz");
  await user.type(c.email, "marta@este.test");
  await user.type(c.telefono, "0991234567");
  await user.click(c.tipo);
  await user.click(within(await screen.findByRole("listbox")).getByRole("option", { name: "ruc" }));
  await user.type(c.documento, "1790012345001");
}

function lo_escrito() {
  const c = campos();
  return {
    nombre: c.nombre.value,
    slug: c.slug.value,
    maestroNombre: c.maestroNombre.value,
    email: c.email.value,
    telefono: c.telefono.value,
    documento: c.documento.value,
    tipo: c.tipo.textContent,
  };
}

const ESCRITO = {
  nombre: "Envíos Este",
  slug: "envios-este",
  maestroNombre: "Marta Ruiz",
  email: "marta@este.test",
  telefono: "0991234567",
  documento: "1790012345001",
  tipo: "ruc",
};

type NombreCampo = "nombre" | "slug" | "maestroNombre" | "email" | "telefono" | "documento" | "tipo";

/** El error está en ESE campo (por `aria-describedby`) y en ningún otro. */
function soloEn(campo: NombreCampo, mensaje: string) {
  const c = campos();
  for (const [nombre, el] of Object.entries(c) as [NombreCampo, HTMLElement][]) {
    if (nombre === campo) {
      expect(el, nombre).toHaveAccessibleDescription(expect.stringContaining(mensaje));
      expect(el, nombre).toHaveAttribute("aria-invalid", "true");
    } else {
      expect(el, nombre).not.toHaveAccessibleDescription(expect.stringContaining(mensaje));
      expect(el, nombre).not.toHaveAttribute("aria-invalid", "true");
    }
  }
}

beforeEach(() => {
  refreshMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("EmpresasModule — listado (R29)", () => {
  it("pinta una fila por empresa con nombre, slug, fecha de alta y maestros", () => {
    montar();
    const filas = screen.getAllByRole("row").slice(1);
    expect(filas).toHaveLength(2);

    const norte = within(filas[0]);
    expect(norte.getByText("Envíos Norte")).toBeInTheDocument();
    expect(norte.getByText("envios-norte")).toBeInTheDocument();
    expect(norte.getByText("20/10/26")).toBeInTheDocument();
    expect(norte.getByText("Ana Pérez · ana@norte.test")).toBeInTheDocument();
    expect(norte.getByText("Luis Gómez · luis@norte.test")).toBeInTheDocument();

    const sur = within(filas[1]);
    expect(sur.getByText("Reparto Sur")).toBeInTheDocument();
    expect(sur.getByText("reparto-sur")).toBeInTheDocument();
    expect(sur.getByText("5/9/26")).toBeInTheDocument();
  });

  it("sin empresas pinta el estado vacío y no la tabla", () => {
    montar(vi.fn(), []);
    expect(
      screen.getByText("Aún no hay empresas. Crea la primera con el formulario."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("EmpresasModule — alta (R30, R37)", () => {
  it("llama a la action una vez con la forma del contrato, vacía el formulario y refresca", async () => {
    const user = userEvent.setup();
    const { altaEmpresa } = montar(
      vi.fn().mockResolvedValue({ estado: "creada", organizacionId: "o", maestroId: "m" }),
    );
    await rellenar(user);
    await user.click(screen.getByRole("button", { name: "Crear empresa" }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    expect(altaEmpresa).toHaveBeenCalledTimes(1);
    expect(altaEmpresa).toHaveBeenCalledWith({
      nombre: "Envíos Este",
      slug: "envios-este",
      maestro: {
        nombre: "Marta Ruiz",
        email: "marta@este.test",
        telefono: "0991234567",
        documento: "1790012345001",
        tipoDocumento: "ruc",
      },
    });
    const c = campos();
    expect(c.nombre).toHaveValue("");
    expect(c.slug).toHaveValue("");
    expect(c.maestroNombre).toHaveValue("");
    expect(c.email).toHaveValue("");
    expect(c.telefono).toHaveValue("");
    expect(c.documento).toHaveValue("");
    expect(c.tipo).not.toHaveTextContent("ruc");
  });

  it("tras el éxito avisa del primer acceso, y nunca hay campo de contraseña", async () => {
    const user = userEvent.setup();
    const { container } = montar(
      vi.fn().mockResolvedValue({ estado: "creada", organizacionId: "o", maestroId: "m" }),
    );
    const sinContrasena = () => {
      expect(container.querySelector('input[type="password"]')).toBeNull();
      for (const label of container.querySelectorAll("label")) {
        expect(label.textContent ?? "").not.toMatch(/contraseña/i);
      }
    };

    sinContrasena();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await rellenar(user);
    await user.click(screen.getByRole("button", { name: "Crear empresa" }));

    expect(await screen.findByRole("status")).toHaveTextContent(AVISO);
    sinContrasena();

    // Se cierra al empezar a escribir otra empresa.
    await user.type(campos().nombre, "x");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("EmpresasModule — errores de la action (R31–R34)", () => {
  async function enviarCon(respuesta: unknown, { lanza = false } = {}) {
    const user = userEvent.setup();
    const altaEmpresa = lanza
      ? vi.fn().mockRejectedValue(respuesta)
      : vi.fn().mockResolvedValue(respuesta);
    montar(altaEmpresa);
    await rellenar(user);
    await user.click(screen.getByRole("button", { name: "Crear empresa" }));
    await waitFor(() => expect(altaEmpresa).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Crear empresa" })).toBeEnabled(),
    );
  }

  function sinCrear() {
    expect(lo_escrito()).toEqual(ESCRITO);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText(AVISO)).not.toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  }

  it("R31: conflicto de slug pinta el error junto a «Slug» y conserva lo escrito", async () => {
    await enviarCon({ estado: "conflicto", campo: "slug" });
    soloEn("slug", "Ya hay una empresa con ese slug.");
    sinCrear();
  });

  it("R31: «ya existe» se trata como slug repetido, no como creada", async () => {
    await enviarCon({ estado: "ya_existe", organizacionId: "org-9" });
    soloEn("slug", "Ya hay una empresa con ese slug.");
    sinCrear();
  });

  it("R32: conflicto de email pinta el error junto a «Email»", async () => {
    await enviarCon({ estado: "conflicto", campo: "email" });
    soloEn("email", "Ese email ya pertenece a otro usuario.");
    sinCrear();
  });

  it("R33: conflicto de documento pinta el error junto a «Documento»", async () => {
    await enviarCon({ estado: "conflicto", campo: "documento" });
    soloEn("documento", "Ese documento ya pertenece a otro usuario.");
    sinCrear();
  });

  it.each([
    ["nombre", "nombre"],
    ["slug", "slug"],
    ["maestro.nombre", "maestroNombre"],
    ["maestro.email", "email"],
    ["maestro.telefono", "telefono"],
    ["telefono", "telefono"],
    ["maestro.documento", "documento"],
    ["maestro.tipoDocumento", "tipo"],
    ["tipoDocumento", "tipo"],
  ] as const)("R34: invalida con campo %s pinta el error bajo ese campo", async (campo, destino) => {
    await enviarCon({ estado: "invalida", campo });
    soloEn(destino, "Revisa este campo.");
    expect(screen.queryByText(GENERICO)).not.toBeInTheDocument();
    sinCrear();
  });

  it.each([
    ["invalida con un campo desconocido", { estado: "invalida", campo: "pais" }],
    ["una respuesta fuera del contrato", { status: "forbidden" }],
    // SL-32 (T15): la forma real del rechazo de rol de `altaEmpresaAction` (R35).
    ["«no autorizado» de la action", { estado: "no_autorizado" }],
    ["sin respuesta", undefined],
  ])("R34: %s muestra el error genérico", async (_nombre, respuesta) => {
    await enviarCon(respuesta);
    expect(screen.getByText(GENERICO)).toBeInTheDocument();
    expect(screen.queryByText("Revisa este campo.")).not.toBeInTheDocument();
    sinCrear();
  });

  it("R34: una excepción muestra el genérico sin su detalle", async () => {
    await enviarCon(new Error("ECONNREFUSED 10.0.0.5 marta@este.test"), { lanza: true });
    expect(screen.getByText(GENERICO)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("ECONNREFUSED");
    sinCrear();
  });
});

describe("EmpresasModule — validación con el schema de la action (R34, T15)", () => {
  it("con un dato que el schema de SL-17 rechaza, marca ese campo y NO llama a la action", async () => {
    const user = userEvent.setup();
    const { altaEmpresa } = montar(vi.fn());
    await rellenar(user);
    const c = campos();
    await user.clear(c.slug);
    await user.type(c.slug, "Con Espacios");
    await user.clear(c.email);
    await user.type(c.email, "no-es-un-email");
    await user.click(screen.getByRole("button", { name: "Crear empresa" }));

    expect(altaEmpresa).not.toHaveBeenCalled();
    for (const el of [campos().slug, campos().email]) {
      expect(el).toHaveAccessibleDescription(expect.stringContaining("Revisa este campo."));
      expect(el).toHaveAttribute("aria-invalid", "true");
    }
    expect(campos().nombre).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText(GENERICO)).not.toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
    expect(campos().slug).toHaveValue("Con Espacios");
  });

  it("sin tipo de documento, lo marca y no llama a la action", async () => {
    const user = userEvent.setup();
    const { altaEmpresa } = montar(vi.fn());
    const c = campos();
    await user.type(c.nombre, "Envíos Este");
    await user.type(c.slug, "envios-este");
    await user.type(c.maestroNombre, "Marta Ruiz");
    await user.type(c.email, "marta@este.test");
    await user.type(c.telefono, "0991234567");
    await user.type(c.documento, "1790012345001");
    await user.click(screen.getByRole("button", { name: "Crear empresa" }));

    expect(altaEmpresa).not.toHaveBeenCalled();
    soloEn("tipo", "Revisa este campo.");
  });
});
