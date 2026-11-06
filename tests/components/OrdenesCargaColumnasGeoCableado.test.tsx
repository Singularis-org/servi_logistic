// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
import type { ReactElement } from "react";

import { RolValue } from "@prisma/client";

import OrdenesPage from "@/app/(app)/ordenes/page";
import { OrdenesModule } from "@/app/(app)/ordenes/_components/OrdenesModule";
import { ToastProvider } from "@/providers/ToastProvider";
import { listarOrdenes } from "@/lib/actions/ordenes";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { defaultLogger } from "@/lib/errors";
import type { CatalogoFiltrosOrdenesDTO } from "@/lib/types/filtros-ordenes";
import { crearCatalogo, type CatalogoGeografico } from "@/lib/services/geografia-dominio";
import type { CatalogoYAsignaciones } from "@/lib/interfaces/repositories/ICatalogoGeograficoRepository";
import { columnasGeoDePlantilla, type ColumnaGeoDePlantilla } from "@/lib/utils/plantilla-geo";
import { normalizeName } from "@/lib/utils/normalize";
import type { OrdenesCargaUploadProps } from "@/app/(app)/ordenes/_components/OrdenesCargaUpload";
import type { OrdenesCargaPreviewProps } from "@/app/(app)/ordenes/_components/OrdenesCargaPreview";

// SLT-45 (T6.3; design §8; R29, R30, R32) — EL CABLEADO de las columnas de geografia de la
// plantilla: `page.tsx` las calcula con el catalogo de la empresa (el MISMO repositorio y la MISMA
// funcion que usa el servidor) y bajan por props `OrdenesListado`/`OrdenesModule` →
// `OrdenesCargaMasivaButton` → `OrdenesCargaUpload` y `OrdenesCargaPreview` (export de errores).
// Lo que hace cada punta con ellas lo prueba `CargaMasivaColumnasGeo.test.tsx`.

const { deLaEmpresaMock, uploadProps, previewProps } = vi.hoisted(() => ({
  deLaEmpresaMock: vi.fn(),
  uploadProps: { actual: null as OrdenesCargaUploadProps | null },
  previewProps: { actual: null as OrdenesCargaPreviewProps | null },
}));

// El repositorio del catalogo, doblado: la pagina no abre ninguna conexion.
vi.mock("@/lib/repositories/CatalogoGeograficoRepository", () => ({
  CatalogoGeograficoRepository: class {
    deLaEmpresa() {
      return deLaEmpresaMock();
    }
  },
}));
vi.mock("@/lib/db/prisma-client", () => ({ getPrismaClient: vi.fn(() => ({})) }));

// Los dos pasos del modal, doblados: este archivo prueba que la prop LLEGA, no que hacen con ella.
vi.mock("@/app/(app)/ordenes/_components/OrdenesCargaUpload", () => ({
  OrdenesCargaUpload: (props: OrdenesCargaUploadProps) => {
    uploadProps.actual = props;
    return <div data-testid="upload-double" />;
  },
}));
vi.mock("@/app/(app)/ordenes/_components/OrdenesCargaPreview", () => ({
  OrdenesCargaPreview: (props: OrdenesCargaPreviewProps) => {
    previewProps.actual = props;
    return <div data-testid="preview-double" />;
  },
}));

vi.mock("@/hooks/use-etiquetas-geograficas", async () => {
  const { ETIQUETAS_CR } = await import("../fabricas/etiquetas-geograficas");
  return { useEtiquetasGeograficas: () => ETIQUETAS_CR };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/actions/ordenes", () => ({ listarOrdenes: vi.fn() }));
vi.mock("@/lib/auth/resolve-actor", () => ({ resolveActorFromSession: vi.fn(async () => null) }));
vi.mock("@/lib/actions/reprogramadas-retenidas", () => ({
  resumenReprogramadasRetenidasCentral: vi.fn(async () => ({ status: "forbidden" as const })),
}));
vi.mock("@/lib/actions/filtros-ordenes", () => ({
  obtenerCatalogoFiltrosOrdenes: vi.fn(async () => ({
    status: "ok" as const,
    catalogo: {
      zonas: [],
      tiendas: [],
      mensajeros: [],
      provincias: [],
      cantones: [],
      distritos: [],
    } satisfies CatalogoFiltrosOrdenesDTO,
  })),
}));
vi.mock("@/app/_components/LogoutButton", () => ({
  LogoutButton: () => <button data-testid="logout-stub">Salir</button>,
}));

const listarOrdenesMock = vi.mocked(listarOrdenes);
const resolveActorMock = vi.mocked(resolveActorFromSession);

/** Un catalogo con un nodo por profundidad, cada profundidad con su tipo. */
function catalogo(singulares: string[]): CatalogoGeografico {
  const tipos = singulares.map((nombreSingular, i) => ({
    id: `t${i + 1}`,
    clave: `nivel_${i + 1}`,
    nombreSingular,
    nombrePlural: `${nombreSingular}s`,
    digitosCodigo: null,
    codigoHeredaPrefijo: false,
  }));
  const nodos = singulares.map((_, i) => ({
    id: `n${i + 1}`,
    padreId: i === 0 ? null : `n${i}`,
    profundidad: i + 1,
    tipoId: `t${i + 1}`,
    nombre: `Lugar ${i + 1}`,
    nombreNormalizado: normalizeName(`Lugar ${i + 1}`),
    codigoOficial: null,
    activo: true,
  }));
  return crearCatalogo("XX", tipos, nodos);
}

const deLaEmpresa = (cat: CatalogoGeografico) =>
  ({ catalogo: cat, asignaciones: {} }) as unknown as CatalogoYAsignaciones;

const DOS_NIVELES = catalogo(["Departamento", "Municipio"]);
const FORMA_CR = catalogo(["Provincia", "Cantón", "Distrito"]);

async function renderPage(): Promise<void> {
  const pagina: ReactElement = await OrdenesPage();
  render(
    <ToastProvider>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{pagina}</SWRConfig>
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  uploadProps.actual = null;
  previewProps.actual = null;
  listarOrdenesMock.mockResolvedValue({ status: "ok", items: [], page: 1, pageSize: 25, total: 0 });
});

afterEach(() => cleanup());

/** Abre el modal de la carga masiva y espera el paso de subida. */
async function abrirCarga(): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /carga masiva/i }));
  await screen.findByTestId("upload-double");
}

/** Simula que la subida termino de validar, para pasar al paso de revision. */
async function validar(): Promise<void> {
  act(() => {
    uploadProps.actual?.onValidated({
      clasificacion: { numRemisionesNuevas: ["R-1"], existentes: [], errores: [], ajustadas: [], normalizadas: [] },
      filasUnicas: [{ row: { num_remision: "R-1" }, linea: 1 }],
    });
  });
  await screen.findByTestId("preview-double");
}

describe("page.tsx → OrdenesListado → OrdenesCargaMasivaButton → subida y export de errores", () => {
  it("R30: adminTienda de un pais que no es de forma CR → las columnas de nivel llegan a la subida y al export", async () => {
    deLaEmpresaMock.mockResolvedValue(deLaEmpresa(DOS_NIVELES));
    resolveActorMock.mockResolvedValueOnce({ usuarioId: "tienda-1", rol: RolValue.adminTienda });
    await renderPage();

    expect(deLaEmpresaMock).toHaveBeenCalledTimes(1);
    const esperadas = columnasGeoDePlantilla(DOS_NIVELES);
    expect(esperadas?.map((c) => c.key)).toEqual(["departamento", "municipio"]);

    await abrirCarga();
    expect(uploadProps.actual?.columnasGeo).toEqual(esperadas);
    await validar();
    expect(previewProps.actual?.columnasGeo).toEqual(esperadas);
  });

  it("R29/R32: adminTienda de un pais de forma CR → `null` (plantilla de hoy) en la subida y el export", async () => {
    deLaEmpresaMock.mockResolvedValue(deLaEmpresa(FORMA_CR));
    resolveActorMock.mockResolvedValueOnce({ usuarioId: "tienda-1", rol: RolValue.adminTienda });
    await renderPage();

    await abrirCarga();
    expect(uploadProps.actual?.columnasGeo).toBeNull();
    await validar();
    expect(previewProps.actual?.columnasGeo).toBeNull();
  });

  it("un rol sin carga masiva (maestro) no lee el catalogo", async () => {
    resolveActorMock.mockResolvedValueOnce({ usuarioId: "m-1", rol: RolValue.maestro });
    await renderPage();
    expect(deLaEmpresaMock).not.toHaveBeenCalled();
  });

  it("si la lectura falla, la pagina sigue con la plantilla de hoy y el fallo se registra", async () => {
    const logSpy = vi.spyOn(defaultLogger, "logError").mockImplementation(() => {});
    deLaEmpresaMock.mockRejectedValue(new Error("db caida"));
    resolveActorMock.mockResolvedValueOnce({ usuarioId: "tienda-1", rol: RolValue.adminTienda });
    await renderPage();

    await abrirCarga();
    expect(uploadProps.actual?.columnasGeo).toBeNull();
    expect(logSpy).toHaveBeenCalledTimes(1);
    logSpy.mockRestore();
  });
});

describe("OrdenesModule (listado plano) → OrdenesCargaMasivaButton", () => {
  const COLUMNAS: ColumnaGeoDePlantilla[] = [{ key: "departamento" }, { key: "municipio" }];

  function montarModulo(columnasGeoCarga?: ColumnaGeoDePlantilla[] | null) {
    render(
      <ToastProvider>
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
          <OrdenesModule puedeCargarMasiva columnasGeoCarga={columnasGeoCarga} />
        </SWRConfig>
      </ToastProvider>,
    );
  }

  it("R30: las columnas llegan a la subida y al export de errores", async () => {
    montarModulo(COLUMNAS);
    await abrirCarga();
    expect(uploadProps.actual?.columnasGeo).toEqual(COLUMNAS);
    await validar();
    expect(previewProps.actual?.columnasGeo).toEqual(COLUMNAS);
  });

  it("R29: sin la prop, la subida y el export reciben `null` (campos de hoy)", async () => {
    montarModulo();
    await abrirCarga();
    expect(uploadProps.actual?.columnasGeo).toBeNull();
    await validar();
    expect(previewProps.actual?.columnasGeo).toBeNull();
  });
});
