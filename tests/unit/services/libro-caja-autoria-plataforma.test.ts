import { describe, expect, it, vi } from "vitest";
import { RolValue } from "@prisma/client";

import type {
  AnulacionDeDocumento,
  ILibroCajaAutoriaRepository,
  MarcasDeLaPlataforma,
  MovimientoDeCajaParaAutoria,
} from "@/lib/interfaces/repositories/ILibroCajaAutoriaRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { LibroCajaAutoriaService } from "@/lib/services/LibroCajaAutoriaService";
import type { AutoriaDeFilaDTO } from "@/lib/types/libro-caja-autoria";

// SLT-143 (design §5, §5.1; R13, R14, R36) — la marca de la plataforma en «Registró» y en la línea de anulación,
// con un repositorio doble. Los ids de la marca los da `marcasDeLaPlataforma`; el servicio decide qué fila la
// lleva y que el nombre y el id del superadmin no salgan. Lo que la base devuelve de verdad (la RLS, la columna
// `por_fuera` y la tabla de anulaciones) lo cubre `tests/integration/db/pago-plataforma-por-fuera.test.ts`.

const ORG = "6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const SUPERADMIN_ID = "5a5a5a5a-1111-4222-8333-444444444444";
const MAESTRA_ID = "7b7b7b7b-1111-4222-8333-444444444444";
const POR_FUERA = "0a000000-0000-4000-8000-000000000001";
const DE_LA_EMPRESA = "0a000000-0000-4000-8000-000000000002";
const CONTRA_PLATAFORMA = "0a000000-0000-4000-8000-000000000003";
const ANULADO_POR_EMPRESA = "0a000000-0000-4000-8000-000000000004";
const CONTRA_EMPRESA = "0a000000-0000-4000-8000-000000000005";
const CREADO = new Date("2026-11-19T15:00:00.000Z");

const MAESTRO: Actor = { usuarioId: MAESTRA_ID, rol: RolValue.maestro, organizacionId: ORG };

const pago = (id: string, registradoPor: string | null): MovimientoDeCajaParaAutoria => ({
  id,
  tipo: "egreso",
  categoria: "egreso_pago_plataforma",
  origenTipo: "gasto",
  origenId: null,
  registradoPor,
  createdAt: CREADO,
});

const contraAsiento = (id: string, de: string, registradoPor: string): MovimientoDeCajaParaAutoria => ({
  id,
  tipo: "ingreso",
  categoria: "ingreso_ajuste",
  origenTipo: "gasto",
  origenId: de,
  registradoPor,
  createdAt: CREADO,
});

const MOVS: MovimientoDeCajaParaAutoria[] = [
  // Registrado por el superadmin por fuera y anulado por la plataforma.
  pago(POR_FUERA, SUPERADMIN_ID),
  contraAsiento(CONTRA_PLATAFORMA, POR_FUERA, SUPERADMIN_ID),
  // Registrado por la empresa desde la wallet y confirmado por el superadmin (R14): sin marca.
  pago(DE_LA_EMPRESA, MAESTRA_ID),
  // Registrado por la empresa y anulado por la empresa (SL-45): sin marca (R36).
  pago(ANULADO_POR_EMPRESA, MAESTRA_ID),
  contraAsiento(CONTRA_EMPRESA, ANULADO_POR_EMPRESA, MAESTRA_ID),
];

/** El nombre del superadmin: si llega a una fila, la marca falló (R13, R36). */
const NOMBRE_SUPERADMIN = "Sara Superadmin";

function montar(marcas: MarcasDeLaPlataforma, movs: readonly MovimientoDeCajaParaAutoria[] = MOVS) {
  const constancia = (por: string): AnulacionDeDocumento => ({
    motivo: "Pago duplicado",
    por,
    fecha: new Date("2026-11-19T16:30:00.000Z"),
  });
  const vacio = () => new Map();
  const marcasDeLaPlataforma = vi.fn<ILibroCajaAutoriaRepository["marcasDeLaPlataforma"]>(async () => marcas);
  const repo: ILibroCajaAutoriaRepository = {
    movimientos: async (ids) => movs.filter((m) => ids.includes(m.id)),
    nombres: async () =>
      new Map([
        [SUPERADMIN_ID, NOMBRE_SUPERADMIN],
        [MAESTRA_ID, "Ana Maestra"],
      ]),
    cierres: async () => vacio(),
    pagos: async () => vacio(),
    rechazos: async () => vacio(),
    podios: async () => vacio(),
    incentivos: async () => vacio(),
    incidentes: async () => vacio(),
    pagosPorCuenta: async () => vacio(),
    debitosDeTienda: async () => vacio(),
    abonos: async () => vacio(),
    anotaciones: async () => vacio(),
    comos: async () => ({ pagos: vacio(), pagosPorCuenta: vacio(), abonos: vacio(), movimientos: vacio() }),
    anulaciones: async () => ({
      pagos: vacio(),
      pagosPorCuenta: vacio(),
      aportes: vacio(),
      abonos: vacio(),
      cobros: vacio(),
      rechazos: vacio(),
      premios: vacio(),
      incentivos: vacio(),
      // La constancia del pago por fuera la firmó el superadmin; la del otro, la maestra.
      movimientos: new Map([
        [POR_FUERA, constancia(NOMBRE_SUPERADMIN)],
        [ANULADO_POR_EMPRESA, constancia("Ana Maestra")],
      ]),
    }),
    marcasDeLaPlataforma,
  };
  const service = new LibroCajaAutoriaService(repo, { zonaHoraria: async () => "America/Costa_Rica" });
  return { service, marcasDeLaPlataforma };
}

async function filas(
  marcas: MarcasDeLaPlataforma,
  movs: readonly MovimientoDeCajaParaAutoria[] = MOVS,
): Promise<Map<string, AutoriaDeFilaDTO>> {
  const { service } = montar(marcas, movs);
  const r = await service.resolver({ movimientoIds: movs.map((m) => m.id) }, MAESTRO);
  if (r.status !== "ok") throw new Error(`resolver respondió ${r.status}`);
  return new Map(r.filas.map((f) => [f.movimientoId, f]));
}

const MARCAS: MarcasDeLaPlataforma = {
  registrados: new Set([POR_FUERA]),
  anulados: new Set([POR_FUERA]),
  enLinea: new Set(),
};

describe("SLT-143 — la marca de la plataforma en el libro de la caja (R13, R14, R36)", () => {
  it("pide las marcas de los pagos a la plataforma y de los egresos que anulan los contra-asientos", async () => {
    const { service, marcasDeLaPlataforma } = montar(MARCAS);
    await service.resolver({ movimientoIds: MOVS.map((m) => m.id) }, MAESTRO);
    expect(marcasDeLaPlataforma).toHaveBeenCalledTimes(1);
    expect(new Set(marcasDeLaPlataforma.mock.calls[0][0])).toEqual(new Set([POR_FUERA, DE_LA_EMPRESA, ANULADO_POR_EMPRESA]));
  });

  it("R13: el pago registrado por la plataforma dice «plataforma» en Registró, sin nombre ni id", async () => {
    const f = (await filas(MARCAS)).get(POR_FUERA);
    expect(f?.registro).toEqual({ nombre: null, automatico: { accion: "plataforma", por: null } });
    expect(JSON.stringify(f?.registro)).not.toContain(NOMBRE_SUPERADMIN);
    expect(JSON.stringify(f?.registro)).not.toContain(SUPERADMIN_ID);
  });

  it("R14: un pago registrado por la empresa y confirmado conserva el nombre de quien lo registró", async () => {
    const f = (await filas(MARCAS)).get(DE_LA_EMPRESA);
    expect(f?.registro).toEqual({ nombre: "Ana Maestra", automatico: null });
  });

  it("R36: el contra-asiento de una anulación de la plataforma dice «plataforma_anulacion», sin nombre ni id", async () => {
    const f = (await filas(MARCAS)).get(CONTRA_PLATAFORMA);
    expect(f?.registro).toEqual({ nombre: null, automatico: { accion: "plataforma_anulacion", por: null } });
  });

  it("R36: la línea de anulación del pago original la firma «la plataforma», con el motivo, el día y la hora", async () => {
    const f = (await filas(MARCAS)).get(POR_FUERA);
    // 16:30Z es 10:30 en Costa Rica (UTC−6).
    expect(f?.anulacion).toEqual({ motivo: "Pago duplicado", por: "la plataforma", fecha: "2026-11-19", hora: "10:30" });
  });

  it("R36: una anulación hecha por la empresa (SL-45) conserva el nombre de la persona, en el contra-asiento y en la línea", async () => {
    const todas = await filas(MARCAS);
    expect(todas.get(CONTRA_EMPRESA)?.registro).toEqual({ nombre: "Ana Maestra", automatico: null });
    expect(todas.get(ANULADO_POR_EMPRESA)?.anulacion?.por).toBe("Ana Maestra");
    expect(todas.get(ANULADO_POR_EMPRESA)?.registro).toEqual({ nombre: "Ana Maestra", automatico: null });
  });

  it("R13, R36: ninguna fila de la página lleva el nombre ni el id del superadmin", async () => {
    const texto = JSON.stringify([...(await filas(MARCAS)).values()]);
    expect(texto).not.toContain(NOMBRE_SUPERADMIN);
    expect(texto).not.toContain(SUPERADMIN_ID);
  });

  it("R13: un pago por fuera aún vigente lleva la marca del registro; su contra-asiento sin anulación de la plataforma, no", async () => {
    const todas = await filas({ registrados: new Set([POR_FUERA]), anulados: new Set(), enLinea: new Set() });
    expect(todas.get(POR_FUERA)?.registro.automatico?.accion).toBe("plataforma");
    expect(todas.get(CONTRA_PLATAFORMA)?.registro.automatico?.accion).not.toBe("plataforma_anulacion");
  });

  it("sin pagos a la plataforma ni contra-asientos de egresos en la página, pide las marcas de una lista vacía (el repositorio no consulta)", async () => {
    const { service, marcasDeLaPlataforma } = montar(MARCAS);
    await service.resolver({ movimientoIds: ["0a000000-0000-4000-8000-0000000000ff"] }, MAESTRO);
    expect(marcasDeLaPlataforma).toHaveBeenCalledWith([]);
  });
});

// SLT-226 (design §5.1, §8; R29) — «Pagado en línea» en «Registró». El pago en línea nace con `registrado_por`
// nulo y `origen_tipo = 'gasto'`, igual que un gasto de plantilla: solo la marca `enLinea` los distingue. La
// lectura real de la columna `en_linea` con la RLS la afirma `tests/integration/db/cobro-pago-en-linea.test.ts`.
const EN_LINEA = "0a000000-0000-4000-8000-000000000006";
const DE_PLANTILLA = "0a000000-0000-4000-8000-000000000007";
const MOVS_EN_LINEA: MovimientoDeCajaParaAutoria[] = [
  pago(EN_LINEA, null),
  pago(DE_PLANTILLA, null),
  pago(POR_FUERA, SUPERADMIN_ID),
];
const MARCAS_EN_LINEA: MarcasDeLaPlataforma = {
  registrados: new Set([POR_FUERA]),
  anulados: new Set(),
  enLinea: new Set([EN_LINEA]),
};

describe("SLT-226 — «Pagado en línea» en Registró (R29)", () => {
  it("R29: el pago aprobado en línea dice «pago_en_linea» en Registró, sin persona", async () => {
    const f = (await filas(MARCAS_EN_LINEA, MOVS_EN_LINEA)).get(EN_LINEA);
    expect(f?.registro).toEqual({ nombre: null, automatico: { accion: "pago_en_linea", por: null } });
  });

  it("R29: un pago a la plataforma automático sin la marca en línea sigue en «plantilla_gasto_fijo»", async () => {
    const f = (await filas(MARCAS_EN_LINEA, MOVS_EN_LINEA)).get(DE_PLANTILLA);
    expect(f?.registro).toEqual({ nombre: null, automatico: { accion: "plantilla_gasto_fijo", por: null } });
  });

  it("R29: la marca por fuera de SLT-143 sigue en «plataforma» junto a un pago en línea", async () => {
    const f = (await filas(MARCAS_EN_LINEA, MOVS_EN_LINEA)).get(POR_FUERA);
    expect(f?.registro).toEqual({ nombre: null, automatico: { accion: "plataforma", por: null } });
  });

  it("R29: pide las marcas también del pago en línea", async () => {
    const { service, marcasDeLaPlataforma } = montar(MARCAS_EN_LINEA, MOVS_EN_LINEA);
    await service.resolver({ movimientoIds: MOVS_EN_LINEA.map((m) => m.id) }, MAESTRO);
    expect(new Set(marcasDeLaPlataforma.mock.calls[0][0])).toEqual(new Set([EN_LINEA, DE_PLANTILLA, POR_FUERA]));
  });
});
