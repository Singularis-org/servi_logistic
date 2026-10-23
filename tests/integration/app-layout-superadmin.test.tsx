// @vitest-environment jsdom
// SL-32 (R6) — EL MARCO DEL PORTAL PARA EL SUPERADMIN.
//
// El superadmin no tiene empresa, y `usuario` y `usuario_preferencia` son tablas de negocio: sin
// contexto, las dos lecturas del layout lanzarían `EmpresaNoResuelta` y tumbarían todas sus
// páginas. Este archivo afirma el arreglo mínimo del design (`> El marco del portal para el
// superadmin`): el nombre del pie se lee DENTRO de `comoPlataforma("SL-32", …)`, y la preferencia
// de avisos no se consulta. Los repositorios van doblados para poder ver EN QUÉ CONTEXTO se les
// llama; `contexto-empresa` es el real, así que el contexto que se mide es el que vería Prisma.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";

import { contextoActual, type ContextoDatos } from "@/lib/db/contexto-empresa";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/plataforma/empresas",
}));

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...rest
  }: { children: ReactNode; href: string } & ComponentProps<"a">) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

const resolveActorMock = vi.fn();
vi.mock("@/lib/auth/resolve-actor", () => ({
  resolveActorFromSession: () => resolveActorMock(),
}));

vi.mock("@/lib/db/prisma-client", () => ({ getPrismaClient: () => ({}) }));

// `findById` anota el contexto de datos activo EN EL MOMENTO de la llamada: es lo que decide si la
// extensión de SL-17 dejaría pasar la lectura de `usuario` sin empresa.
const { llamadasFindById } = vi.hoisted(() => ({
  llamadasFindById: [] as { id: string; contexto: ContextoDatos | undefined }[],
}));
vi.mock("@/lib/repositories/UserRepository", () => ({
  UserRepository: class {
    findById = async (id: string) => {
      llamadasFindById.push({ id, contexto: contextoActual() });
      return { id, nombre: "Sofía", primerApellido: "Castro", segundoApellido: null };
    };
  },
}));

// Se cuenta la CONSTRUCCIÓN además de la llamada: R6 pide que el repositorio no reciba llamadas,
// y no construirlo es la forma estructural de que no pueda recibirlas.
const { preferencia } = vi.hoisted(() => ({
  preferencia: { construido: 0, avisosPushDe: vi.fn() },
}));
vi.mock("@/lib/repositories/UsuarioPreferenciaRepository", () => ({
  UsuarioPreferenciaRepository: class {
    constructor() {
      preferencia.construido += 1;
    }
    avisosPushDe = preferencia.avisosPushDe;
  },
}));

const { propsDeLaReactivacion } = vi.hoisted(() => ({
  propsDeLaReactivacion: [] as { avisosRecordados: boolean }[],
}));
vi.mock("@/components/shared/PushReactivacion", () => ({
  PushReactivacion: (props: { avisosRecordados: boolean }) => {
    propsDeLaReactivacion.push(props);
    return null;
  },
}));

const { resolverRevisionMock } = vi.hoisted(() => ({ resolverRevisionMock: vi.fn() }));
vi.mock("@/lib/auth/revision-sinpe-pendiente", () => ({
  resolverRevisionSinpePendiente: (...a: unknown[]) => resolverRevisionMock(...a),
}));

import AppLayout from "@/app/(app)/layout";

async function renderLayout() {
  return render(await AppLayout({ children: <div data-testid="pagina" /> }));
}

beforeEach(() => {
  llamadasFindById.length = 0;
  propsDeLaReactivacion.length = 0;
  preferencia.construido = 0;
  preferencia.avisosPushDe.mockReset().mockResolvedValue(true);
  resolverRevisionMock.mockReset().mockResolvedValue(null);
});

afterEach(() => cleanup());

describe("SL-32 (R6) — el layout del portal con un superadmin", () => {
  it("el pie lleva su nombre y su rol, leído en contexto de plataforma declarado por SL-32", async () => {
    resolveActorMock.mockResolvedValue({ usuarioId: "sa-1", rol: "superadmin" });

    await renderLayout();

    expect(screen.getByTestId("pagina")).toBeInTheDocument();
    expect(screen.getByText("Sofía Castro")).toBeInTheDocument();
    expect(screen.getByText("Superadmin")).toBeInTheDocument();
    expect(llamadasFindById).toEqual([
      {
        id: "sa-1",
        contexto: {
          tipo: "plataforma",
          ficha: "SL-32",
          motivo: "nombre del superadmin en el pie",
        },
      },
    ]);
  });

  it("no construye ni llama a `UsuarioPreferenciaRepository`, y la reactivación recibe `false`", async () => {
    resolveActorMock.mockResolvedValue({ usuarioId: "sa-1", rol: "superadmin" });

    await renderLayout();

    expect(preferencia.construido).toBe(0);
    expect(preferencia.avisosPushDe).not.toHaveBeenCalled();
    expect(propsDeLaReactivacion).toEqual([{ avisosRecordados: false }]);
    expect(resolverRevisionMock).not.toHaveBeenCalled();
  });

  // Contraprueba: el camino de empresa no cambia. Sin ella, un layout que dejara de leer la
  // preferencia para TODOS pasaría el caso de arriba.
  it("un `maestro` sigue leyendo nombre y avisos fuera del contexto de plataforma", async () => {
    resolveActorMock.mockResolvedValue({ usuarioId: "m-1", rol: "maestro" });

    await renderLayout();

    expect(llamadasFindById).toEqual([{ id: "m-1", contexto: undefined }]);
    expect(preferencia.avisosPushDe).toHaveBeenCalledWith("m-1");
    expect(propsDeLaReactivacion).toEqual([{ avisosRecordados: true }]);
  });
});
