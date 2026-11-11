import { describe, expect, it, vi } from "vitest";
import { RolValue, type BugReportStatus } from "@prisma/client";

import { ROLES_PLATAFORMA } from "@/lib/auth/plataforma";
import type {
  ConsultaDeReportes,
  DetalleDeReporte,
  IBugReportRepository,
  PaginaDeReportes,
  ResultadoDeCambioDeEstado,
} from "@/lib/interfaces/repositories/IBugReportRepository";
import { ENLACE_DETALLE_SEGUNDOS } from "@/lib/config/reporte-bug";
import { contextoActual } from "@/lib/db/contexto-empresa";
import type { IAlmacenImagenesReporte } from "@/lib/interfaces/external/IAlmacenImagenesReporte";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { ReportesBugPlataformaService } from "@/lib/services/ReportesBugPlataformaService";
import { filtrosReportesSchema, TRANSICIONES_REPORTE, type ReporteFilaDTO } from "@/lib/types/reporte-bug";

// SLT-97 (design §4; R2, R4, R5, R7, R9, R11, R15, R17, R18, R20) — el servicio del módulo de reportes
// con un repositorio doble. El SQL (filtros, orden, transacción y triggers) está en
// `tests/integration/db/bug-report.test.ts`.
// SLT-98 (design §7; R22, R23) — la firma de las imágenes del detalle, con un almacén doble, al final.

const SUPERADMIN: Actor = { usuarioId: "sa-1", rol: "superadmin" };
const ROLES_DE_EMPRESA: Actor[] = Object.values(RolValue)
  .filter((rol) => !(ROLES_PLATAFORMA as readonly string[]).includes(rol))
  .map((rol) => ({ usuarioId: `u-${rol}`, rol, organizacionId: "org-1" }));

const REPORTE_ID = "6f1c1d5e-2b8a-4c1e-9f3a-1b2c3d4e5f60";

const FILA: ReporteFilaDTO = {
  id: REPORTE_ID,
  creadoEn: "2026-11-09T14:05:00.000Z",
  estado: "new",
  empresa: "Envíos Uno",
  usuario: "Ana Pérez",
  rol: "maestro",
  resumen: "No carga el mapa",
};

function detalleEn(estado: BugReportStatus): DetalleDeReporte {
  return {
    reporte: {
      id: REPORTE_ID,
      descripcion: "No carga el mapa",
      empresa: "Envíos Uno",
      usuario: "Ana Pérez",
      correo: "ana@empresa.example",
      rol: "maestro",
      pagina: "/ordenes",
      navegador: "Mozilla/5.0",
      ventana: { ancho: 390, alto: 844 },
      appInstalada: true,
      creadoEn: "2026-11-09T14:05:00.000Z",
      estado,
      organizacionId: "org-1",
      imagenes: [],
    },
    historial: [],
  };
}

function repoDoble(o: { total?: number; detalle?: DetalleDeReporte | null; cambio?: ResultadoDeCambioDeEstado } = {}) {
  const repo = {
    crear: vi.fn(),
    listar: vi.fn<(c: ConsultaDeReportes) => Promise<PaginaDeReportes>>(async () => ({
      total: o.total ?? 1,
      filas: [FILA],
    })),
    detalle: vi.fn<IBugReportRepository["detalle"]>(async () => (o.detalle === undefined ? detalleEn("new") : o.detalle)),
    cambiarEstado: vi.fn<IBugReportRepository["cambiarEstado"]>(async () => o.cambio ?? { resultado: "ok" }),
  } satisfies IBugReportRepository;
  return repo;
}

/** Almacén doble que anota cada firma y el contexto de datos en que se pidió. */
function almacenDoble(firmar?: IAlmacenImagenesReporte["firmar"]) {
  const firmas: { rutas: string[]; ttl: number; contexto: ReturnType<typeof contextoActual> }[] = [];
  let n = 0;
  const almacen = {
    prepararSubida: vi.fn<IAlmacenImagenesReporte["prepararSubida"]>(),
    leer: vi.fn<IAlmacenImagenesReporte["leer"]>(),
    borrar: vi.fn<IAlmacenImagenesReporte["borrar"]>(),
    firmar: vi.fn<IAlmacenImagenesReporte["firmar"]>(
      firmar ??
        (async (rutas, ttl) => {
          firmas.push({ rutas, ttl, contexto: contextoActual() });
          n += 1;
          return Object.fromEntries(rutas.map((r) => [r, `https://firmada.test/${r}?v=${n}`]));
        }),
    ),
  } satisfies IAlmacenImagenesReporte;
  return { almacen, firmas };
}

/** El servicio con su almacén; por defecto uno que los casos de SLT-97 no tocan (sus reportes no traen imágenes). */
function servicio(repo: IBugReportRepository, almacen: IAlmacenImagenesReporte = almacenDoble().almacen) {
  return new ReportesBugPlataformaService(repo, almacen);
}

const filtros = (entrada: Record<string, unknown> = {}) => filtrosReportesSchema.parse(entrada);

describe("SLT-97 — ReportesBugPlataformaService", () => {
  it("R2 — un actor que no es de plataforma da forbidden sin tocar el repositorio", async () => {
    for (const actor of ROLES_DE_EMPRESA) {
      const repo = repoDoble();
      const s = servicio(repo);
      expect(await s.listar(actor, filtros())).toEqual({ status: "forbidden" });
      expect(await s.detalle(actor, REPORTE_ID)).toEqual({ status: "forbidden" });
      expect(await s.cambiarEstado(actor, { reporteId: REPORTE_ID, estado: "resolved", nota: "" })).toEqual({
        status: "forbidden",
      });
      expect(repo.listar).not.toHaveBeenCalled();
      expect(repo.detalle).not.toHaveBeenCalled();
      expect(repo.cambiarEstado).not.toHaveBeenCalled();
      expect(repo.crear).not.toHaveBeenCalled();
    }
  });

  // Ajustado por SLT-98 (design §7 y §15 «Tests de SLT-87 y SLT-97 que cambian de sentido»): el
  // constructor gana el almacén de imágenes, que solo firma enlaces de lectura. Sigue sin emisor ni cola;
  // el tercer parámetro, el log, tiene valor por defecto y `length` no lo cuenta.
  it("R4 — el servicio no recibe emisor de correo ni cola (el constructor solo recibe el repositorio y el almacén de imágenes)", () => {
    expect(ReportesBugPlataformaService.length).toBe(2);
  });

  it("R5 — sin filtros pide los estados new e in_review, todas las empresas, página 1 de 25", async () => {
    const repo = repoDoble();
    const r = await servicio(repo).listar(SUPERADMIN, filtros());
    expect(repo.listar).toHaveBeenCalledTimes(1);
    expect(repo.listar).toHaveBeenCalledWith({
      estados: ["new", "in_review"],
      organizationId: null,
      desde: null,
      hastaExclusivo: null,
      pagina: 1,
      tamano: 25,
    });
    expect(r).toEqual({ status: "ok", items: [FILA], total: 1, pagina: 1 });
  });

  it("R7 — «todos» no filtra por estado y un estado concreto pide solo ese", async () => {
    const repo = repoDoble();
    const s = servicio(repo);
    await s.listar(SUPERADMIN, filtros({ estado: "todos" }));
    await s.listar(SUPERADMIN, filtros({ estado: "resolved" }));
    expect(repo.listar.mock.calls.map(([c]) => c.estados)).toEqual([null, ["resolved"]]);
  });

  it("R8/R9 — la empresa pasa tal cual y las fechas son [desde 00:00Z, día siguiente a hasta 00:00Z)", async () => {
    const repo = repoDoble();
    const empresa = "0b6f0f43-6f1c-4d5e-8a2b-9c3d4e5f6a7b";
    await servicio(repo).listar(
      SUPERADMIN,
      filtros({ empresa, desde: "2026-02-28", hasta: "2026-12-31" }),
    );
    const c = repo.listar.mock.calls[0][0];
    expect(c.organizationId).toBe(empresa);
    expect(c.desde?.toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(c.hastaExclusivo?.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("R11 — una página mayor que la última devuelve la última, y una menor que 1 la primera", async () => {
    const repo = repoDoble({ total: 60 });
    const s = servicio(repo);

    const mayor = await s.listar(SUPERADMIN, filtros({ pagina: "9" }));
    expect(mayor).toMatchObject({ status: "ok", total: 60, pagina: 3 });
    expect(repo.listar.mock.calls.map(([c]) => c.pagina)).toEqual([9, 3]);

    repo.listar.mockClear();
    const menor = await s.listar(SUPERADMIN, filtros({ pagina: "-4" }));
    expect(menor).toMatchObject({ status: "ok", pagina: 1 });
    expect(repo.listar.mock.calls.map(([c]) => c.pagina)).toEqual([1]);
  });

  it("R11 — sin ningún reporte la última página es la 1", async () => {
    const repo = repoDoble({ total: 0 });
    const r = await servicio(repo).listar(SUPERADMIN, filtros({ pagina: "2" }));
    expect(r).toMatchObject({ status: "ok", total: 0, pagina: 1 });
  });

  it("R17 — desde new acepta in_review, resolved y dismissed; desde in_review, resolved y dismissed", async () => {
    expect(TRANSICIONES_REPORTE).toEqual({
      new: ["in_review", "resolved", "dismissed"],
      in_review: ["resolved", "dismissed"],
      resolved: [],
      dismissed: [],
    });
    const destinos: Record<string, unknown> = {};
    for (const estado of ["new", "in_review", "resolved", "dismissed"] as const) {
      const r = await servicio(repoDoble({ detalle: detalleEn(estado) })).detalle(
        SUPERADMIN,
        REPORTE_ID,
      );
      destinos[estado] = r.status === "ok" ? r.reporte.destinosPermitidos : r.status;
    }
    expect(destinos).toEqual({
      new: ["in_review", "resolved", "dismissed"],
      in_review: ["resolved", "dismissed"],
      resolved: [],
      dismissed: [],
    });
  });

  it("R15 — el detalle de un reporte que el repositorio no encuentra es not_found", async () => {
    const r = await servicio(repoDoble({ detalle: null })).detalle(SUPERADMIN, REPORTE_ID);
    expect(r).toEqual({ status: "not_found" });
  });

  it("R18 — el resultado del repositorio se traduce: ok con el destino, transicion_invalida con el actual, not_found", async () => {
    const pedir = (cambio: ResultadoDeCambioDeEstado) =>
      servicio(repoDoble({ cambio })).cambiarEstado(SUPERADMIN, {
        reporteId: REPORTE_ID,
        estado: "dismissed",
        nota: "",
      });
    expect(await pedir({ resultado: "ok" })).toEqual({ status: "ok", estado: "dismissed" });
    expect(await pedir({ resultado: "transicion_invalida", actual: "resolved" })).toEqual({
      status: "transicion_invalida",
      actual: "resolved",
    });
    expect(await pedir({ resultado: "not_found" })).toEqual({ status: "not_found" });
  });

  it("R20/R21 — la nota vacía llega al repositorio como null, y el actor es el de la sesión", async () => {
    const repo = repoDoble();
    const s = servicio(repo);
    await s.cambiarEstado(SUPERADMIN, { reporteId: REPORTE_ID, estado: "in_review", nota: "" });
    await s.cambiarEstado(SUPERADMIN, { reporteId: REPORTE_ID, estado: "in_review", nota: "Lo miro" });
    expect(repo.cambiarEstado.mock.calls.map(([p]) => p)).toEqual([
      { reporteId: REPORTE_ID, destino: "in_review", nota: null, actorUsuarioId: "sa-1" },
      { reporteId: REPORTE_ID, destino: "in_review", nota: "Lo miro", actorUsuarioId: "sa-1" },
    ]);
  });
});

describe("SLT-98 — imágenes en el detalle del superadmin", () => {
  const ORG = "org-del-reporte";
  const IMAGENES = [
    { id: "img-1", ruta: "u-1/img-1.png" },
    { id: "img-2", ruta: "u-1/img-2.jpg" },
  ];

  function conImagenes(imagenes = IMAGENES): DetalleDeReporte {
    const d = detalleEn("new");
    return { ...d, reporte: { ...d.reporte, organizacionId: ORG, imagenes } };
  }

  it("R22 — detalle firma las rutas con 86400 segundos dentro de conEmpresa de la empresa del reporte, en cada llamada, y el DTO no lleva rutas ni empresa", async () => {
    const { almacen, firmas } = almacenDoble();
    const s = servicio(repoDoble({ detalle: conImagenes() }), almacen);

    const primera = await s.detalle(SUPERADMIN, REPORTE_ID);
    const segunda = await s.detalle(SUPERADMIN, REPORTE_ID);

    expect(ENLACE_DETALLE_SEGUNDOS).toBe(86400);
    const esperada = {
      rutas: ["u-1/img-1.png", "u-1/img-2.jpg"],
      ttl: 86400,
      contexto: { tipo: "empresa", organizacionId: ORG },
    };
    expect(firmas).toEqual([esperada, esperada]);
    // Fuera de la firma no queda contexto de empresa.
    expect(contextoActual()).toBeUndefined();
    if (primera.status !== "ok" || segunda.status !== "ok") throw new Error("se esperaba ok");
    expect(primera.reporte.imagenes).toEqual([
      { id: "img-1", url: "https://firmada.test/u-1/img-1.png?v=1" },
      { id: "img-2", url: "https://firmada.test/u-1/img-2.jpg?v=1" },
    ]);
    // Cada carga, enlaces nuevos.
    expect(segunda.reporte.imagenes.map((i) => i.url)).toEqual([
      "https://firmada.test/u-1/img-1.png?v=2",
      "https://firmada.test/u-1/img-2.jpg?v=2",
    ]);
    // Ni la empresa ni las rutas cruzan al navegador: la ruta solo aparece dentro de la URL firmada.
    expect(primera.reporte).not.toHaveProperty("organizacionId");
    expect(primera.reporte.imagenes.every((i) => Object.keys(i).join() === "id,url")).toBe(true);
    expect(JSON.stringify(primera)).not.toContain(ORG);
  });

  it("R22 — sin imágenes no llama al almacén", async () => {
    const { almacen } = almacenDoble();
    const r = await servicio(repoDoble({ detalle: conImagenes([]) }), almacen).detalle(SUPERADMIN, REPORTE_ID);

    expect(almacen.firmar).not.toHaveBeenCalled();
    expect(almacen.prepararSubida).not.toHaveBeenCalled();
    expect(almacen.leer).not.toHaveBeenCalled();
    expect(almacen.borrar).not.toHaveBeenCalled();
    expect(r.status === "ok" && r.reporte.imagenes).toEqual([]);
  });

  it("R23 — si firmar lanza, todas las url son null y el detalle se devuelve igual", async () => {
    class StorageCaido extends Error {
      constructor() {
        super("u-1/img-1.png no se pudo firmar");
        this.name = "StorageCaido";
      }
    }
    const { almacen } = almacenDoble(async () => {
      throw new StorageCaido();
    });
    const lineas: string[] = [];
    const s = new ReportesBugPlataformaService(repoDoble({ detalle: conImagenes() }), almacen, (l) => lineas.push(l));

    const r = await s.detalle(SUPERADMIN, REPORTE_ID);

    expect(r).toMatchObject({
      status: "ok",
      reporte: {
        id: REPORTE_ID,
        descripcion: "No carga el mapa",
        destinosPermitidos: ["in_review", "resolved", "dismissed"],
        imagenes: [
          { id: "img-1", url: null },
          { id: "img-2", url: null },
        ],
      },
      historial: [],
    });
    // El log lleva el reporte y el nombre de la causa; ni la ruta ni el mensaje.
    expect(lineas).toEqual([`[reportes-bug-plataforma] fallo al firmar imagenes reporte=${REPORTE_ID} causa=StorageCaido`]);
  });

  it("R23 — una ruta que el almacén no firmó queda con url null y las demás con su enlace", async () => {
    const { almacen } = almacenDoble(async (rutas) => ({ [rutas[1]]: "https://firmada.test/dos" }));
    const r = await servicio(repoDoble({ detalle: conImagenes() }), almacen).detalle(SUPERADMIN, REPORTE_ID);

    expect(r.status === "ok" && r.reporte.imagenes).toEqual([
      { id: "img-1", url: null },
      { id: "img-2", url: "https://firmada.test/dos" },
    ]);
  });
});
