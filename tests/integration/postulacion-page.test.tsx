// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mocks de las dependencias server-side de app/postulacion/page.tsx. El page.tsx
// (Server Component real) se importa sin mockear: se ejercita su carga real de
// catalogos (R1). La pagina es PUBLICA: no lee cookies ni sesion (R22).
const findManyVehiculosMock = vi.fn();
vi.mock("@/lib/repositories/VehiculoRepository", () => ({
  VehiculoRepository: vi.fn().mockImplementation(function VehiculoRepositoryMock(this: {
    findMany: typeof findManyVehiculosMock;
  }) {
    this.findMany = findManyVehiculosMock;
  }),
}));

// SLT-81 (design §7.3; R19, R27): los tipos salen de `UserRepository.listTiposIdentificacion(paisId)`
// (activos del país, por `orden`) y el país de `PaisRepository.deLaEmpresa`. Sin empresa en el
// contexto no se llama a ninguno.
const tiposDelPaisMock = vi.fn();
vi.mock("@/lib/repositories/UserRepository", () => ({
  UserRepository: vi.fn().mockImplementation(function UserRepositoryMock(this: {
    listTiposIdentificacion: typeof tiposDelPaisMock;
  }) {
    this.listTiposIdentificacion = tiposDelPaisMock;
  }),
}));
const paisDeLaEmpresaMock = vi.fn();
vi.mock("@/lib/repositories/PaisRepository", () => ({
  PaisRepository: vi.fn().mockImplementation(function PaisRepositoryMock(this: {
    deLaEmpresa: typeof paisDeLaEmpresaMock;
  }) {
    this.deLaEmpresa = paisDeLaEmpresaMock;
  }),
}));

// Ningún `findMany` sin filtro de tipos (R24): el cliente no expone `tipoIdentificacion`.
vi.mock("@/lib/db/prisma-client", () => ({ getPrismaClient: vi.fn(() => ({})) }));

// Aisla la pagina del formulario cliente con un stub que refleja las props.
vi.mock("@/app/postulacion/_components/PostulacionForm", () => ({
  PostulacionForm: (props: {
    tiposIdentificacion: { value: string; label: string }[];
    vehiculos: { value: string; label: string }[];
    prefijo: string | null;
  }) => (
    <div
      data-testid="postulacion-form-stub"
      data-tipos={props.tiposIdentificacion.map((t) => t.label).join(",")}
      data-vehiculos={props.vehiculos.map((v) => v.label).join(",")}
      data-prefijo={props.prefijo ?? ""}
    >
      form
    </div>
  ),
}));

import { conEmpresa } from "@/lib/db/contexto-empresa";

const PAIS_XA = { id: "XA", nombre: "País XA", prefijoTelefonico: "999", telefonoDigitosNacionales: 7 };

/** La página dentro del contexto de una empresa de XA (lo que pondrá SL-35). */
async function paginaConEmpresa() {
  const { default: PostulacionPage } = await import("@/app/postulacion/page");
  return conEmpresa("org-xa", () => PostulacionPage());
}

// El enlace de vuelta a la landing usa `next/link`; en jsdom se sustituye por
// un `<a>` equivalente, el mismo doble que usa
// tests/integration/login-form-reset-link.test.tsx.
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

/**
 * Ancestros del elemento (incluido él mismo) que llevan la clase `hidden`.
 *
 * El panel de marca de esta pantalla es `hidden ... md:flex`: un enlace metido
 * ahí no existiría en móvil, que es justo donde es la única salida. jsdom no
 * resuelve media queries, así que la forma honesta de fijar "está presente sin
 * depender del breakpoint" es comprobar que ni el enlace ni ninguno de sus
 * ancestros arrastra ese `hidden`.
 */
function ancestrosOcultos(el: HTMLElement): string[] {
  const ocultos: string[] = [];
  for (let nodo: HTMLElement | null = el; nodo !== null; nodo = nodo.parentElement) {
    if (nodo.classList.contains("hidden")) ocultos.push(nodo.className);
  }
  return ocultos;
}

/**
 * Ancestros del elemento (incluido él mismo) sacados del flujo con
 * `absolute`/`fixed`.
 */
function ancestrosPosicionadosFueraDelFlujo(el: HTMLElement): string[] {
  const fuera: string[] = [];
  for (let nodo: HTMLElement | null = el; nodo !== null; nodo = nodo.parentElement) {
    if (nodo.classList.contains("absolute") || nodo.classList.contains("fixed")) {
      fuera.push(nodo.className);
    }
  }
  return fuera;
}

beforeEach(() => {
  vi.clearAllMocks();
  paisDeLaEmpresaMock.mockResolvedValue(PAIS_XA);
});

describe("app/postulacion/page.tsx — pagina publica (R1, R22)", () => {
  it("renderiza el formulario con los catalogos cargados, sin requerir sesion", async () => {
    findManyVehiculosMock.mockResolvedValue([
      { id: "veh-moto", name: "moto" },
      { id: "veh-carro", name: "carro" },
    ]);
    tiposDelPaisMock.mockResolvedValue([
      { id: "xa-doc", value: "XA_doc", nombre: "Documento XA", clave: "doc" },
      { id: "xa-pas", value: "XA_pasaporte", nombre: "Pasaporte XA", clave: "pasaporte" },
    ]);

    render(await paginaConEmpresa());

    const stub = screen.getByTestId("postulacion-form-stub");
    expect(stub).toBeInTheDocument();
    // SLT-81 (R19): los tipos por su nombre, en el orden del catálogo.
    expect(stub).toHaveAttribute("data-tipos", "Documento XA,Pasaporte XA");
    expect(stub).toHaveAttribute("data-vehiculos", "Moto,Carro");
  });
});

describe("app/postulacion/page.tsx — salida a la landing", () => {
  it("ofrece un enlace accesible de vuelta cuyo href es exactamente / y que no depende del breakpoint", async () => {
    findManyVehiculosMock.mockResolvedValue([{ id: "veh-moto", name: "moto" }]);
    tiposDelPaisMock.mockResolvedValue([{ id: "xa-doc", value: "XA_doc", nombre: "Documento XA", clave: "doc" }]);

    render(await paginaConEmpresa());

    // (a) existe la salida y lleva a la landing, no a "atrás" ni a otra ruta.
    const volver = screen.getByRole("link", { name: "Volver al inicio" });
    expect(volver).toHaveAttribute("href", "/");

    // (b) está en las dos anchuras: no vive bajo el `hidden md:flex` del panel de marca.
    expect(ancestrosOcultos(volver)).toEqual([]);
  });

  /**
   * PROXY, no la comprobación real. jsdom NO calcula layout (todo mide 0x0),
   * así que aquí es imposible detectar el solape que motivó este caso: el
   * `hover:bg-muted` del enlace, cuando iba `absolute top-3`, se metía sobre la
   * esquina superior izquierda de la tarjeta —medido en esta página, franja de
   * 54x8 px— porque el formulario (1420 px) es más alto que el panel y la
   * tarjeta arrancaba en y=48 mientras el enlace acababa en y=56. La
   * comprobación real es VISUAL (medir las dos cajas en el navegador). Lo que
   * sí se puede fijar en jsdom es la propiedad ESTRUCTURAL que hace el solape
   * imposible por construcción: el enlace está en el flujo —no posicionado en
   * absoluto— y ocupa su propia franja como hermano ANTERIOR del bloque que
   * centra el formulario. Mientras eso se cumpla, el enlace y la tarjeta no
   * pueden compartir píxeles.
   */
  it("mantiene el enlace en el flujo y como hermano anterior del bloque centrado (proxy estructural; el solape real solo se ve midiendo en el navegador)", async () => {
    findManyVehiculosMock.mockResolvedValue([{ id: "veh-moto", name: "moto" }]);
    tiposDelPaisMock.mockResolvedValue([{ id: "xa-doc", value: "XA_doc", nombre: "Documento XA", clave: "doc" }]);

    render(await paginaConEmpresa());

    const volver = screen.getByRole("link", { name: "Volver al inicio" });

    // (a) ni el enlace ni ningún ancestro suyo lo sacan del flujo.
    expect(ancestrosPosicionadosFueraDelFlujo(volver)).toEqual([]);

    // (b) el formulario vive en el hermano SIGUIENTE, no en el mismo hueco.
    const bloqueCentrado = volver.nextElementSibling;
    expect(bloqueCentrado).not.toBeNull();
    expect(bloqueCentrado).toContainElement(screen.getByTestId("postulacion-form-stub"));
  });
});

// SL-42 (R17, R18): la postulación pública sigue ofreciendo el catálogo (R17), pero solo los tipos
// activos (R18). El recorte lo hace el repositorio con `WHERE_VEHICULO_ELEGIBLE`; aquí se fija que
// la página lo pide y que no le añade nada.
describe("app/postulacion/page.tsx — solo vehículos activos (SL-42, R17/R18)", () => {
  it("pide al repositorio solo los activos y ofrece exactamente lo que devuelve", async () => {
    findManyVehiculosMock.mockResolvedValue([{ id: "veh-moto", name: "moto", activo: true }]);
    tiposDelPaisMock.mockResolvedValue([{ id: "xa-doc", value: "XA_doc", nombre: "Documento XA", clave: "doc" }]);

    render(await paginaConEmpresa());

    expect(findManyVehiculosMock).toHaveBeenCalledTimes(1);
    expect(findManyVehiculosMock).toHaveBeenCalledWith({ soloActivos: true });
    expect(screen.getByTestId("postulacion-form-stub")).toHaveAttribute("data-vehiculos", "Moto");
  });
});

// SLT-81 (design §7.3; decisión del 2026-11-07, «Preparar + aviso»).
describe("app/postulacion/page.tsx — país de la empresa del contexto (SLT-81)", () => {
  it("R19: dentro de `conEmpresa` de una empresa de XA, el formulario recibe el prefijo de XA y solo sus tipos activos", async () => {
    findManyVehiculosMock.mockResolvedValue([{ id: "veh-moto", name: "moto" }]);
    tiposDelPaisMock.mockResolvedValue([
      { id: "xa-doc", value: "XA_doc", nombre: "Documento XA", clave: "doc" },
      { id: "xa-pas", value: "XA_pasaporte", nombre: "Pasaporte XA", clave: "pasaporte" },
    ]);

    render(await paginaConEmpresa());

    expect(paisDeLaEmpresaMock).toHaveBeenCalledWith("org-xa");
    expect(tiposDelPaisMock).toHaveBeenCalledWith("XA");
    const stub = screen.getByTestId("postulacion-form-stub");
    expect(stub).toHaveAttribute("data-prefijo", "999");
    expect(stub).toHaveAttribute("data-tipos", "Documento XA,Pasaporte XA");
  });

  it("R19/R23: un país sin prefijo cargado baja `null`, no el prefijo de otro país", async () => {
    findManyVehiculosMock.mockResolvedValue([]);
    tiposDelPaisMock.mockResolvedValue([]);
    paisDeLaEmpresaMock.mockResolvedValue({ ...PAIS_XA, prefijoTelefonico: null });

    render(await paginaConEmpresa());

    expect(screen.getByTestId("postulacion-form-stub")).toHaveAttribute("data-prefijo", "");
  });

  it("R27: sin empresa en el contexto dice «La postulación se abre desde la página de una empresa», sin formulario ni tipos", async () => {
    const { default: PostulacionPage } = await import("@/app/postulacion/page");
    render(await PostulacionPage());

    expect(screen.getByText("La postulación se abre desde la página de una empresa")).toBeInTheDocument();
    expect(screen.queryByTestId("postulacion-form-stub")).toBeNull();
    expect(tiposDelPaisMock).not.toHaveBeenCalled();
    expect(paisDeLaEmpresaMock).not.toHaveBeenCalled();
    expect(findManyVehiculosMock).not.toHaveBeenCalled();
    // La salida a la landing sigue ahí.
    expect(screen.getByRole("link", { name: "Volver al inicio" })).toHaveAttribute("href", "/");
  });
});
