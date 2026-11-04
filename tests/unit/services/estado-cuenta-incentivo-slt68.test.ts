import { describe, it, expect, vi } from "vitest";

import type {
  AnulacionLeida,
  FilaDeLibroRow,
  IEstadoCuentaRepository,
} from "@/lib/interfaces/repositories/IEstadoCuentaRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { EstadoCuentaService } from "@/lib/services/EstadoCuentaService";

// SLT-68 (R16) — en el LIBRO DEL MENSAJERO la fila del incentivo es un documento propio: se ofrece
// «Anular…» mientras esta vigente y, cuando su `reverso_incentivo` existe, dice «Anulado» con el motivo.
// Con DOBLES: aqui se mide el RECONOCIMIENTO del servicio (documento, estado, «nace de un cierre»). La
// consulta que lee el reverso se mide contra Postgres en
// `tests/integration/db/incentivo-mensajero-slt68.test.ts` › «R16: en el libro del mensajero…».

const MAESTRO: Actor = { usuarioId: "00000000-0000-4000-8000-0000000000aa", rol: "maestro" };
const MENSAJERO = "00000000-0000-4000-8000-000000000001";
const INCENTIVO = "11111111-1111-4111-8111-111111111111";
const REVERSO = "22222222-2222-4222-8222-222222222222";
const CIERRE = "33333333-3333-4333-8333-333333333333";

function fila(over: Partial<FilaDeLibroRow>): FilaDeLibroRow {
  return {
    id: INCENTIVO,
    tipo: "devengo",
    categoria: "incentivo",
    origenTipo: "cierre_dia",
    origenId: CIERRE,
    descripcion: "Incentivo · Cubrió dos rutas extra",
    registradoPor: MAESTRO.usuarioId,
    registradoPorNombre: "Ana Mora",
    fechaMovimiento: new Date("2026-10-29T18:00:00.000Z"),
    monto: "2500.00",
    saldoCorrido: "2500.00",
    premioDia: null,
    ...over,
  };
}

const INCENTIVO_FILA = fila({});
const REVERSO_FILA = fila({
  id: REVERSO,
  tipo: "pago",
  categoria: "reverso_incentivo",
  origenTipo: "incentivo_mensajero",
  origenId: INCENTIVO,
  descripcion: "Anulación del incentivo · Monto equivocado",
  fechaMovimiento: new Date("2026-10-30T15:00:00.000Z"),
  saldoCorrido: "0.00",
});

function montar(filas: FilaDeLibroRow[], reversos: AnulacionLeida[]) {
  const reversosDeIncentivo = vi.fn(async (_m: string, _ids: readonly string[]) => reversos);
  const repo = {
    nombreDeCuenta: async () => "Mensajero Uno",
    enLecturaConsistente: async <T>(fn: (r: IEstadoCuentaRepository) => Promise<T>) => fn(repo as unknown as IEstadoCuentaRepository),
    paginaDeMensajero: async () => ({ filas, total: filas.length }),
    // Saldo y periodo en cero: R22 cuadra y la prueba no depende de los totales.
    totalesDeMensajero: async () => ({ devengado: "0.00", pagado: "0.00" }),
    periodoDeMensajero: async () => [],
    quienAproboLosCierres: async () => new Map<string, string | null>(),
    reversosDePremio: async () => [],
    reversosDeIncentivo,
  };
  const svc = new EstadoCuentaService(
    repo as unknown as IEstadoCuentaRepository,
    { estadoPorGestion: async () => [] } as never,
    { resolver: async (_l: string, fs: unknown[]) => fs.map(() => null) } as never,
    { resolver: async () => ({ modo: "texto", termino: "" }) } as never,
  );
  return { svc, reversosDeIncentivo };
}

async function leer(svc: EstadoCuentaService) {
  const r = await svc.leer(
    { cuenta: { tipo: "mensajero", id: MENSAJERO }, page: 1, pageSize: 50, sortBy: "fecha", sortDir: "asc" },
    MAESTRO,
  );
  if (r.status !== "ok") throw new Error(r.status);
  return r.estado.filas.map((f) => ({
    id: f.ref !== null && "movimientoId" in f.ref ? f.ref.movimientoId : null,
    anulable: f.anulable,
    naceDeUnCierre: f.naceDeUnCierre,
    esContraAsiento: f.esContraAsiento,
    anulacion: f.anulacion === null ? null : { motivo: f.anulacion.motivo, por: f.anulacion.por, fecha: f.anulacion.fecha },
  }));
}

describe("SLT-68 R16 — el incentivo en el libro del mensajero (EstadoCuentaService)", () => {
  it("R16: vigente, la fila del incentivo es anulable y NO nace de un cierre aunque cuelgue de uno", async () => {
    const m = montar([INCENTIVO_FILA], []);
    expect(await leer(m.svc)).toEqual([
      { id: INCENTIVO, anulable: true, naceDeUnCierre: false, esContraAsiento: false, anulacion: null },
    ]);
    expect(m.reversosDeIncentivo).toHaveBeenCalledWith(MENSAJERO, [INCENTIVO]);
  });

  it("R16: con su `reverso_incentivo`, el incentivo dice Anulado (motivo, quien, dia) y deja de ser anulable; el reverso es contraasiento", async () => {
    const m = montar(
      [INCENTIVO_FILA, REVERSO_FILA],
      [
        {
          documentoId: INCENTIVO,
          motivo: "Anulación del incentivo · Monto equivocado",
          anuladoPorNombre: "Ana Mora",
          fecha: new Date("2026-10-30T15:00:00.000Z"),
        },
      ],
    );
    expect(await leer(m.svc)).toEqual([
      {
        id: INCENTIVO,
        anulable: false,
        naceDeUnCierre: false,
        esContraAsiento: false,
        anulacion: { motivo: "Anulación del incentivo · Monto equivocado", por: "Ana Mora", fecha: "2026-10-30" },
      },
      { id: REVERSO, anulable: false, naceDeUnCierre: false, esContraAsiento: true, anulacion: null },
    ]);
  });
});
