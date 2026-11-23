import { describe, it, expect, vi } from "vitest";
import { CierreBodegaService, motivoSinResolver, resumenSolicitados } from "@/lib/services/CierreBodegaService";
import type {
  CierreDiaConsolidableRow,
  ICierreBodegaRepository,
} from "@/lib/interfaces/repositories/ICierreBodegaRepository";
import type { IOrdenRepository } from "@/lib/interfaces/repositories/IOrdenRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { Prisma } from "@prisma/client";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";

// SLT-106 «Bodega satélite: A consolidar con la cola única» — lo que `listarConsolidacion` añade
// para la cola de la satélite (R67, R195, R199/R47) y la puerta de `solicitarCierreBodega` que NO
// cambia (R200). Dobles del repositorio: el `WHERE` de los nombres se prueba contra Postgres en
// `tests/integration/db/consolidacion-cola-satelite.test.ts`.
//
// Todos los importes esperados son literales escritos a mano, nunca la salida de `paraLaCentral()`.

const SATELITE: Actor = { usuarioId: "adm-sat", rol: "adminSatelite" };
const ZONA = "z-cartago";

function fila(
  cierreDiaId: string,
  mensajeroId: string,
  dinero: { general: string; pago: string; bodega: string; aLaCentral?: string },
): CierreDiaConsolidableRow {
  return {
    cierreDiaId,
    mensajeroId,
    mensajeroNombre: `Mensajero ${mensajeroId}`,
    totales: { efectivo: dinero.general, simpe: "0.00", transferencia: "0.00", general: dinero.general },
    totalPagoMensajero: dinero.pago,
    totalIngresoBodegaRechazos: dinero.bodega,
    // El servicio no lo lee para el agregado (lo deriva de los tres agregados); por defecto un
    // valor que no podría coincidir con nada.
    paraLaCentral: dinero.aLaCentral ?? "999999.99",
    aprobadoAt: null,
    gestionesAjustadas: 0,
    pagoIndependienteEfectivo: false, // SLT-139: cierre viejo por defecto
  };
}

function servicio(opts: {
  consolidables?: CierreDiaConsolidableRow[];
  sinResolver?: string[];
  contarSolicitados?: number;
  zona?: string | null;
}) {
  const repo = {
    findCierresDiaConsolidables: vi.fn(async () => opts.consolidables ?? []),
    findMensajerosConCierreSinResolver: vi.fn(async () => opts.sinResolver ?? []),
    contarCierresDiaSolicitados: vi.fn(async () => opts.contarSolicitados ?? 0),
    findCierresBodegaByZona: vi.fn(async () => []),
    crearCierreBodega: vi.fn(async () => "cb-1"),
  } as unknown as ICierreBodegaRepository;
  const ordenRepo = {
    findUsuarioZonaId: vi.fn(async () => (opts.zona === undefined ? ZONA : opts.zona)),
  } as unknown as IOrdenRepository;
  return { svc: new CierreBodegaService(repo, ordenRepo, reglasPaisFijas()), repo };
}

async function listar(opts: Parameters<typeof servicio>[0]) {
  const { svc } = servicio(opts);
  const r = await svc.listarConsolidacion(SATELITE);
  if (r.status !== "ok") throw new Error(`esperaba ok, llegó ${r.status}`);
  return r;
}

describe("SLT-106 R67 — «Debe llegar a la central» del conjunto a consolidar", () => {
  it("dos consolidables → 96500.00 (100000.00 − 3000.00 − 500.00) = 57700.00 + 38800.00", async () => {
    const r = await listar({
      consolidables: [
        fila("cd1", "m1", { general: "60000.00", pago: "2000.00", bodega: "300.00", aLaCentral: "57700.00" }),
        fila("cd2", "m2", { general: "40000.00", pago: "1000.00", bodega: "200.00", aLaCentral: "38800.00" }),
      ],
    });
    expect(r.paraLaCentralAgregado).toBe("96500.00");
    expect(typeof r.paraLaCentralAgregado).toBe("string");
    // La resta es lineal: la suma de los «A la central» de fila (escritos a mano) es el agregado.
    const sumaFilas = r.consolidables
      .map((c) => (c as CierreDiaConsolidableRow).paraLaCentral)
      .reduce((acc, v) => acc.plus(v), new Prisma.Decimal(0))
      .toFixed(2);
    expect(sumaFilas).toBe("96500.00");
    expect(sumaFilas).toBe(r.paraLaCentralAgregado);
  });

  it("negativo con su signo: 0.00 − 2000.00 − 0.00 → -2000.00", async () => {
    const r = await listar({
      consolidables: [fila("cd1", "m1", { general: "0.00", pago: "2000.00", bodega: "0.00" })],
    });
    expect(r.paraLaCentralAgregado).toBe("-2000.00");
  });
});

describe("SLT-106 R195 — conteos y tipo de bloqueo sobre el conjunto completo", () => {
  it("tres cierres de dos mensajeros → 3 cierres, 2 mensajeros, sin bloqueo", async () => {
    const r = await listar({
      consolidables: [
        fila("cd1", "m1", { general: "10.00", pago: "0.00", bodega: "0.00" }),
        fila("cd2", "m2", { general: "10.00", pago: "0.00", bodega: "0.00" }),
        fila("cd3", "m1", { general: "10.00", pago: "0.00", bodega: "0.00" }),
      ],
    });
    expect(r.cierresAConsolidar).toBe(3);
    expect(r.mensajerosAConsolidar).toBe(2);
    expect(r.bloqueo).toBeNull();
    expect(r.puedesSolicitar).toBe(true);
    expect(r.motivoBloqueo).toBeNull();
  });

  it("con cierres sin resolver → `sin_resolver` (gana sobre los consolidables)", async () => {
    const r = await listar({
      consolidables: [fila("cd1", "m1", { general: "10.00", pago: "0.00", bodega: "0.00" })],
      sinResolver: ["Beto Mensajero"],
    });
    expect(r.bloqueo).toBe("sin_resolver");
    expect(r.puedesSolicitar).toBe(false);
  });

  it("sin consolidables ni pendientes → `vacio` con el mensaje de hoy", async () => {
    const r = await listar({});
    expect(r.bloqueo).toBe("vacio");
    expect(r.puedesSolicitar).toBe(false);
    expect(r.motivoBloqueo).toBe("No hay cierres de mensajero aprobados para consolidar.");
    expect(r.cierresAConsolidar).toBe(0);
    expect(r.mensajerosAConsolidar).toBe(0);
    expect(r.paraLaCentralAgregado).toBe("0.00");
  });

  it("sin zona → `sin_zona`, \"0.00\", 0, 0, sin consultar al repositorio", async () => {
    const { svc, repo } = servicio({ zona: null });
    const r = await svc.listarConsolidacion(SATELITE);
    if (r.status !== "ok") throw new Error("esperaba ok");
    expect(r.bloqueo).toBe("sin_zona");
    expect(r.paraLaCentralAgregado).toBe("0.00");
    expect(r.cierresAConsolidar).toBe(0);
    expect(r.mensajerosAConsolidar).toBe(0);
    expect(repo.findMensajerosConCierreSinResolver).not.toHaveBeenCalled();
  });
});

describe("SLT-106 R199/R47 — el motivo nombra a los mensajeros con cierres sin resolver", () => {
  it("un cierre → singular", () => {
    expect(motivoSinResolver(["Beto Mensajero"])).toBe(
      "Todavía no puedes consolidar: Beto Mensajero tiene un cierre sin resolver. Apruébalo o recházalo primero.",
    );
  });

  it("varios cierres del mismo mensajero → «tiene cierres», el nombre una vez", () => {
    expect(motivoSinResolver(["Beto Mensajero", "Beto Mensajero"])).toBe(
      "Todavía no puedes consolidar: Beto Mensajero tiene cierres sin resolver. Apruébalos o recházalos primero.",
    );
  });

  it("varios mensajeros → sin repetidos, en orden alfabético, «, » y « y »", () => {
    expect(
      motivoSinResolver(["Carla Mensajera", "Ana Mensajera", "Beto Mensajero", "Ana Mensajera"]),
    ).toBe(
      "Todavía no puedes consolidar: Ana Mensajera, Beto Mensajero y Carla Mensajera tienen cierres sin resolver. Apruébalos o recházalos primero.",
    );
  });

  it("`listarConsolidacion` emite ese motivo con los nombres del repositorio", async () => {
    const r = await listar({ sinResolver: ["Beto Mensajero", "Ana Mensajera", "Beto Mensajero"] });
    expect(r.motivoBloqueo).toBe(
      "Todavía no puedes consolidar: Ana Mensajera y Beto Mensajero tienen cierres sin resolver. Apruébalos o recházalos primero.",
    );
  });
});

describe("SLT-106 R200 — `solicitarCierreBodega` no cambia", () => {
  it("con dos sin resolver → conflict con el texto de hoy, por el conteo y no por los nombres", async () => {
    const { svc, repo } = servicio({
      contarSolicitados: 2,
      sinResolver: ["Ana Mensajera", "Beto Mensajero"],
      consolidables: [fila("cd1", "m1", { general: "10.00", pago: "0.00", bodega: "0.00" })],
    });
    const r = await svc.solicitarCierreBodega(SATELITE);
    expect(r).toEqual({
      status: "conflict",
      motivo: "Primero resuelve los cierres de tus mensajeros antes de cerrar la bodega.",
    });
    expect(repo.contarCierresDiaSolicitados).toHaveBeenCalledWith(ZONA);
    expect(repo.findMensajerosConCierreSinResolver).not.toHaveBeenCalled();
    expect(repo.crearCierreBodega).not.toHaveBeenCalled();
  });
});

// SLT-107 «Bodega satélite: Solicitados y su cierre de bodega en lectura» (R68, R287) — las tres
// cifras de «Solicitados». Importes y fechas, literales escritos a mano.
//
// «Hoy» fijo: 2026-11-12 09:00 en Costa Rica (UTC−6). 30 días calendario contando hoy empiezan el
// 2026-10-14 a las 00:00 de Costa Rica = 2026-10-14T06:00:00.000Z.
describe("SLT-107 R287 — `solicitadosResumen` de `listarConsolidacion`", () => {
  const HOY = new Date("2026-11-12T15:00:00.000Z");

  type CierreResumen = Parameters<typeof resumenSolicitados>[0][number];
  function cb(c: Partial<CierreResumen>): CierreResumen {
    return { paraLaCentral: "0.00", montoRecibido: null, faltaPorRecibir: "0.00", conciliadoAt: null, ...c };
  }

  function servicioConCierres(
    cierres: CierreResumen[],
    opts: { zona?: string | null; reglas?: ReturnType<typeof reglasPaisFijas> } = {},
  ) {
    const repo = {
      findCierresDiaConsolidables: vi.fn(async () => []),
      findMensajerosConCierreSinResolver: vi.fn(async () => []),
      findCierresBodegaByZona: vi.fn(async () => cierres),
    } as unknown as ICierreBodegaRepository;
    const ordenRepo = {
      findUsuarioZonaId: vi.fn(async () => (opts.zona === undefined ? ZONA : opts.zona)),
    } as unknown as IOrdenRepository;
    return new CierreBodegaService(repo, ordenRepo, opts.reglas ?? reglasPaisFijas(), () => HOY);
  }

  async function resumen(cierres: CierreResumen[]) {
    const r = await servicioConCierres(cierres).listarConsolidacion(SATELITE);
    if (r.status !== "ok") throw new Error(`esperaba ok, llegó ${r.status}`);
    return r.solicitadosResumen;
  }

  it("por llegar: tres sin marca 438163.27 + (−1200.00) + 0.00 = 436963.27, con su signo; los marcados no", async () => {
    const r = await resumen([
      cb({ paraLaCentral: "438163.27" }),
      cb({ paraLaCentral: "-1200.00" }),
      cb({ paraLaCentral: "0.00" }),
      cb({ paraLaCentral: "77777.77", montoRecibido: "77777.77", conciliadoAt: "2026-11-10T15:00:00.000Z" }),
    ]);
    expect(r.porLlegar).toEqual({ monto: "436963.27", cierres: 3 });
  });

  it("solo pendientes con negativo neto: −1200.00 + 300.00 = −900.00 (signo conservado)", async () => {
    const r = await resumen([cb({ paraLaCentral: "-1200.00" }), cb({ paraLaCentral: "300.00" })]);
    expect(r.porLlegar).toEqual({ monto: "-900.00", cierres: 2 });
  });

  it("recibido (30 días): 00:00 del día 30 hacia atrás entra; 23:59 del día 31 no; suma `montoRecibido`", async () => {
    const r = await resumen([
      // 2026-10-14 00:00 Costa Rica: el primer instante de los 30 días.
      cb({ montoRecibido: "1000.10", conciliadoAt: "2026-10-14T06:00:00.000Z" }),
      // 2026-10-13 23:59 Costa Rica: día 31, fuera.
      cb({ montoRecibido: "50000.00", conciliadoAt: "2026-10-14T05:59:00.000Z" }),
      // Hoy.
      cb({ montoRecibido: "2500.25", conciliadoAt: "2026-11-12T14:00:00.000Z" }),
    ]);
    expect(r.recibido30Dias).toEqual({ monto: "3500.35", cierres: 2 });
  });

  it("T0.3 (a): recibido hace 45 días y corregido hoy -> cuenta, porque el ancla es el `conciliadoAt` VIGENTE", async () => {
    // «Corregir recibido» reescribe `conciliado_at` con «ahora» (CierresBodegaAdminRepository.corregirConciliacion):
    // el cierre llega aquí con la fecha de la corrección, no con la de la primera marca (2026-09-28).
    const r = await resumen([cb({ montoRecibido: "8000.00", conciliadoAt: "2026-11-12T13:30:00.000Z" })]);
    expect(r.recibido30Dias).toEqual({ monto: "8000.00", cierres: 1 });
  });

  it("falta por recibir: 15000.00 entra; 0.00 y −500.00 (llegó de más) no; un pendiente sin marca tampoco", async () => {
    const r = await resumen([
      cb({ montoRecibido: "5000.00", faltaPorRecibir: "15000.00", conciliadoAt: "2026-11-01T15:00:00.000Z" }),
      cb({ montoRecibido: "9000.00", faltaPorRecibir: "0.00", conciliadoAt: "2026-11-01T15:00:00.000Z" }),
      cb({ montoRecibido: "9500.00", faltaPorRecibir: "-500.00", conciliadoAt: "2026-11-01T15:00:00.000Z" }),
      // Sin marca, `faltaPorRecibir` = su `paraLaCentral` entero: eso es «por llegar», no «falta».
      cb({ paraLaCentral: "4000.00", faltaPorRecibir: "4000.00" }),
    ]);
    expect(r.faltaPorRecibir).toEqual({ monto: "15000.00", cierres: 1 });
  });

  it("falta por recibir: 0.01 entra (el corte es > 0 con decimales, no >= 0)", async () => {
    const r = await resumen([
      cb({ montoRecibido: "99.99", faltaPorRecibir: "0.01", conciliadoAt: "2026-11-01T15:00:00.000Z" }),
    ]);
    expect(r.faltaPorRecibir).toEqual({ monto: "0.01", cierres: 1 });
  });

  it("sin cierres de bodega: las tres en \"0.00\" y 0 (las tarjetas se pintan igual, PA2)", async () => {
    const r = await resumen([]);
    expect(r).toEqual({
      porLlegar: { monto: "0.00", cierres: 0 },
      recibido30Dias: { monto: "0.00", cierres: 0 },
      faltaPorRecibir: { monto: "0.00", cierres: 0 },
    });
  });

  it("sin zona: las tres en \"0.00\" y 0, sin leer la zona horaria", async () => {
    const reglas = reglasPaisFijas();
    const zonaHoraria = vi.spyOn(reglas, "zonaHoraria");
    const r = await servicioConCierres([cb({ paraLaCentral: "100.00" })], { zona: null, reglas }).listarConsolidacion(
      SATELITE,
    );
    if (r.status !== "ok") throw new Error(`esperaba ok, llegó ${r.status}`);
    expect(r.solicitadosResumen).toEqual({
      porLlegar: { monto: "0.00", cierres: 0 },
      recibido30Dias: { monto: "0.00", cierres: 0 },
      faltaPorRecibir: { monto: "0.00", cierres: 0 },
    });
    expect(zonaHoraria).not.toHaveBeenCalled();
  });

  it("`resumenSolicitados` pura: el corte lo da `desde`, inclusivo", () => {
    const desde = new Date("2026-10-14T06:00:00.000Z");
    const r = resumenSolicitados(
      [
        cb({ montoRecibido: "10.00", conciliadoAt: "2026-10-14T06:00:00.000Z" }),
        cb({ montoRecibido: "20.00", conciliadoAt: "2026-10-14T05:59:59.999Z" }),
      ],
      desde,
    );
    expect(r.recibido30Dias).toEqual({ monto: "10.00", cierres: 1 });
  });
});
