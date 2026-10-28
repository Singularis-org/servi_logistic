// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { EmpresaListada } from "@/lib/types/empresas-plataforma";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn() }),
}));

import {
  EmpresasModule,
  type EmpresasModuleProps,
} from "@/app/(app)/plataforma/empresas/_components/EmpresasModule";

const TIPOS = [
  { id: "tipo-1", value: "cedula" },
  { id: "tipo-2", value: "ruc" },
  { id: "tipo-3", value: "pasaporte" },
];

// SL-20 (R9, R45): lo que pasa `page.tsx`, solo los países disponibles y por nombre.
const PAISES = [
  { id: "CR", nombre: "Costa Rica" },
  { id: "EC", nombre: "Ecuador" },
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
    pais: { id: "CR", nombre: "Costa Rica" },
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
    // SL-20 (R45, R46): un país ya apagado, que el `Select` del alta no ofrece.
    pais: { id: "XA", nombre: "País Apagado" },
  },
];

// SL-41 (R25): sustituye al aviso de SL-32 R37, que mandaba al maestro a «¿Olvidaste tu contraseña?».
const AVISO_ENVIADA = "Empresa creada. Enviamos a marta@este.test un correo para crear su contraseña.";
const AVISO_NO_ENVIADA =
  "Empresa creada, pero el correo de bienvenida no salió. Reenvíalo con «Reenviar bienvenida» en la fila de la empresa.";
const AVISO_SIN_CORREO = "El correo no está configurado en este entorno.";
const AVISO_VIEJO = "¿Olvidaste tu contraseña?";
const GENERICO = "No se pudo crear la empresa. Inténtalo de nuevo.";
const CREADA = { estado: "creada", organizacionId: "o", maestroId: "m", bienvenida: "enviada" };

// El doble se pasa sin el tipo de la action a propósito, como `altaEmpresa`: los tests le dan
// también respuestas fuera del contrato.
type Reenviar = EmpresasModuleProps["reenviarBienvenida"];

function montar(
  altaEmpresa = vi.fn(),
  empresas: EmpresaListada[] = EMPRESAS,
  {
    reenviarBienvenida = vi.fn(),
    bienvenidaPendiente = null,
  }: { reenviarBienvenida?: ReturnType<typeof vi.fn>; bienvenidaPendiente?: string[] | null } = {},
) {
  const utils = render(
    <EmpresasModule
      empresas={empresas}
      tiposDocumento={TIPOS}
      paises={PAISES}
      altaEmpresa={altaEmpresa}
      reenviarBienvenida={reenviarBienvenida as unknown as Reenviar}
      bienvenidaPendiente={bienvenidaPendiente}
      cobroGlobal={{ monto: null }}
      fijarCobroGlobal={vi.fn()}
      fijarCobroEmpresa={vi.fn()}
    />,
  );
  return { ...utils, altaEmpresa, reenviarBienvenida };
}

/** Cualquier aviso del alta, el de éxito o el de advertencia. */
function avisoDeAlta() {
  return screen.queryByText(/^Empresa creada/);
}

/** Los campos, buscados dentro de su grupo: hay dos «Nombre». */
function campos() {
  const empresa = within(screen.getByRole("group", { name: "Empresa" }));
  const maestro = within(screen.getByRole("group", { name: "Primer maestro" }));
  return {
    nombre: empresa.getByLabelText("Nombre") as HTMLInputElement,
    slug: empresa.getByLabelText("Slug") as HTMLInputElement,
    pais: empresa.getByRole("combobox", { name: "País" }),
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
  await user.click(c.pais);
  await user.click(
    within(await screen.findByRole("listbox")).getByRole("option", { name: "Costa Rica" }),
  );
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
    pais: c.pais.textContent,
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
  pais: "Costa Rica",
};

type NombreCampo =
  | "nombre"
  | "slug"
  | "pais"
  | "maestroNombre"
  | "email"
  | "telefono"
  | "documento"
  | "tipo";

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
      vi.fn().mockResolvedValue(CREADA),
    );
    await rellenar(user);
    await user.click(screen.getByRole("button", { name: "Crear empresa" }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    expect(altaEmpresa).toHaveBeenCalledTimes(1);
    expect(altaEmpresa).toHaveBeenCalledWith({
      nombre: "Envíos Este",
      slug: "envios-este",
      paisId: "CR",
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
    // SL-20 (R9): tras el alta, el país vuelve a quedar sin elegir.
    expect(c.pais).not.toHaveTextContent("Costa Rica");
  });

  it("tras el éxito avisa de la bienvenida enviada, y nunca hay campo de contraseña", async () => {
    const user = userEvent.setup();
    const { container } = montar(
      vi.fn().mockResolvedValue(CREADA),
    );
    const sinContrasena = () => {
      expect(container.querySelector('input[type="password"]')).toBeNull();
      for (const label of container.querySelectorAll("label")) {
        expect(label.textContent ?? "").not.toMatch(/contraseña/i);
      }
    };

    sinContrasena();
    expect(avisoDeAlta()).not.toBeInTheDocument();
    await rellenar(user);
    await user.click(screen.getByRole("button", { name: "Crear empresa" }));

    expect(await screen.findByText(AVISO_ENVIADA)).toBeInTheDocument();
    sinContrasena();

    // Se cierra al empezar a escribir otra empresa.
    await user.type(campos().nombre, "x");
    expect(avisoDeAlta()).not.toBeInTheDocument();
  });
});

describe("SL-41 — el aviso del alta según la bienvenida (R25, R26)", () => {
  async function crearCon(respuesta: unknown) {
    const user = userEvent.setup();
    montar(vi.fn().mockResolvedValue(respuesta));
    await rellenar(user);
    await user.click(screen.getByRole("button", { name: "Crear empresa" }));
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
  }

  it("R25: con «enviada», un aviso de estado que nombra el email del maestro", async () => {
    await crearCon(CREADA);
    const aviso = screen.getByText(AVISO_ENVIADA).closest('[data-slot="alert"]');
    expect(aviso).toHaveAttribute("role", "status");
    expect(screen.queryByText(AVISO_NO_ENVIADA)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(AVISO_VIEJO);
  });

  it("R26: con «no_enviada», una advertencia que manda a «Reenviar bienvenida»", async () => {
    await crearCon({ ...CREADA, bienvenida: "no_enviada" });
    const aviso = screen.getByRole("alert");
    expect(aviso).toHaveTextContent(AVISO_NO_ENVIADA);
    expect(aviso).not.toHaveTextContent(AVISO_SIN_CORREO);
    expect(screen.queryByText(AVISO_ENVIADA)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(AVISO_VIEJO);
  });

  it("R26: con «sin_correo», la misma advertencia y que el correo no está configurado", async () => {
    await crearCon({ ...CREADA, bienvenida: "sin_correo" });
    const aviso = screen.getByRole("alert");
    expect(aviso).toHaveTextContent(AVISO_NO_ENVIADA);
    expect(aviso).toHaveTextContent(AVISO_SIN_CORREO);
    expect(screen.queryByText(AVISO_ENVIADA)).not.toBeInTheDocument();
  });

  it.each([
    ["sin «bienvenida»", { estado: "creada", organizacionId: "o", maestroId: "m" }],
    ["con un valor fuera del contrato", { ...CREADA, bienvenida: "quizas" }],
  ])("R26: %s se toma como «no_enviada»: ante la duda, se avisa", async (_n, respuesta) => {
    await crearCon(respuesta);
    expect(screen.getByRole("alert")).toHaveTextContent(AVISO_NO_ENVIADA);
    expect(screen.queryByText(AVISO_ENVIADA)).not.toBeInTheDocument();
  });
});

describe("SL-41 — «Reenviar bienvenida» en la fila (R29, R38)", () => {
  const BOTON = { name: "Reenviar bienvenida" } as const;

  function filas() {
    return screen.getAllByRole("row").slice(1);
  }

  it("la tabla gana una columna final «Bienvenida»", () => {
    montar();
    const cabeceras = screen.getAllByRole("columnheader").map((c) => c.textContent);
    expect(cabeceras.at(-1)).toBe("Bienvenida");
  });

  it("R29: sin el dato de pendientes (null), la fila con maestros lleva el botón y la sin maestros no", () => {
    montar(vi.fn(), EMPRESAS, { bienvenidaPendiente: null });
    expect(within(filas()[0]).getByRole("button", BOTON)).toBeInTheDocument();
    expect(within(filas()[1]).queryByRole("button", BOTON)).not.toBeInTheDocument();
  });

  it("R38: la empresa pendiente lleva el botón", () => {
    montar(vi.fn(), EMPRESAS, { bienvenidaPendiente: ["org-2"] });
    expect(within(filas()[0]).getByRole("button", BOTON)).toBeInTheDocument();
  });

  it("R38: la empresa cuyo maestro ya creó su contraseña no lo lleva", () => {
    montar(vi.fn(), EMPRESAS, { bienvenidaPendiente: [] });
    expect(screen.queryByRole("button", BOTON)).not.toBeInTheDocument();
  });

  it("R29: una empresa sin maestros no lo lleva aunque figure como pendiente", () => {
    montar(vi.fn(), EMPRESAS, { bienvenidaPendiente: ["org-1"] });
    expect(screen.queryByRole("button", BOTON)).not.toBeInTheDocument();
  });

  it("el botón de la fila reenvía la bienvenida de ESA empresa", async () => {
    const user = userEvent.setup();
    const reenviarBienvenida = vi
      .fn()
      .mockResolvedValue({ estado: "enviada", email: "ana@norte.test" });
    montar(vi.fn(), EMPRESAS, { reenviarBienvenida });

    await user.click(within(filas()[0]).getByRole("button", BOTON));

    await waitFor(() =>
      expect(reenviarBienvenida).toHaveBeenCalledWith({ organizacionId: "org-2" }),
    );
    expect(await within(filas()[0]).findByText("Enviada a ana@norte.test.")).toBeInTheDocument();
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
    expect(avisoDeAlta()).not.toBeInTheDocument();
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

  it("SL-20 R8: conflicto de país pinta el error junto a «País»", async () => {
    await enviarCon({ estado: "conflicto", campo: "paisId" });
    soloEn("pais", "Esa empresa ya existe en otro país.");
    sinCrear();
  });

  it.each([
    ["nombre", "nombre"],
    ["slug", "slug"],
    // SL-20 (R6, R45): un país que falta, no existe o se apagó entre la carga y el envío.
    ["paisId", "pais"],
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
    await user.click(c.pais);
    await user.click(
      within(await screen.findByRole("listbox")).getByRole("option", { name: "Costa Rica" }),
    );
    await user.click(screen.getByRole("button", { name: "Crear empresa" }));

    expect(altaEmpresa).not.toHaveBeenCalled();
    soloEn("tipo", "Revisa este campo.");
  });
});

describe("SL-20 — país de la empresa (R9, R45)", () => {
  function filas() {
    return screen.getAllByRole("row").slice(1);
  }

  it("R9: la tabla tiene la columna «País» con el país de cada empresa", () => {
    montar();
    const cabeceras = screen.getAllByRole("columnheader").map((c) => c.textContent);
    expect(cabeceras).toContain("País");
    expect(within(filas()[0]).getByText("Costa Rica")).toBeInTheDocument();
  });

  it("R9/R45: la columna muestra el país de una empresa aunque ya no esté disponible", () => {
    montar();
    expect(within(filas()[1]).getByText("País Apagado")).toBeInTheDocument();
  });

  it("R9: el alta no trae ningún país preseleccionado", () => {
    montar();
    const pais = campos().pais;
    expect(pais).toHaveTextContent("Elige el país");
    for (const p of PAISES) expect(pais).not.toHaveTextContent(p.nombre);
  });

  it("R9/R45: el `Select` ofrece solo los países disponibles que le pasa la página", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(campos().pais);
    const opciones = within(await screen.findByRole("listbox"))
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(opciones).toEqual(["Costa Rica", "Ecuador"]);
    expect(opciones).not.toContain("País Apagado");
  });

  it("R9: sin país, el alta queda bloqueada: marca «País» y NO llama a la action", async () => {
    const user = userEvent.setup();
    const { altaEmpresa } = montar(vi.fn());
    const c = campos();
    await user.type(c.nombre, "Envíos Este");
    await user.type(c.slug, "envios-este");
    await user.type(c.maestroNombre, "Marta Ruiz");
    await user.type(c.email, "marta@este.test");
    await user.type(c.telefono, "0991234567");
    await user.click(c.tipo);
    await user.click(within(await screen.findByRole("listbox")).getByRole("option", { name: "ruc" }));
    await user.type(c.documento, "1790012345001");
    await user.click(screen.getByRole("button", { name: "Crear empresa" }));

    expect(altaEmpresa).not.toHaveBeenCalled();
    soloEn("pais", "Revisa este campo.");
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
