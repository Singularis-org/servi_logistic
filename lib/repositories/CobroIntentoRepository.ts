import type { CobroIntento, PrismaClient } from "@prisma/client";

import { comoPlataforma, conEmpresa } from "@/lib/db/contexto-empresa";
import { llevaSqlstate, mensajesDeLaCadena } from "@/lib/db/sqlstate";
import type {
  AlcanceDeLectura,
  AvanzarRepoInput,
  AvanzarRepoResult,
  CerrarEventoRepoInput,
  ICobroIntentoRepository,
  ObtenerOCrearRepoInput,
  ObtenerOCrearRepoResult,
  RegistrarEnlaceRepoInput,
  RegistrarEventoRepoInput,
  RegistrarPagoAprobadoRepoInput,
  RegistrarPagoAprobadoRepoResult,
} from "@/lib/interfaces/repositories/ICobroIntentoRepository";
import {
  CobroIntentoInvalido,
  ESTADOS_COBRO,
  PROVEEDORES_COBRO,
  type CobroIntentoDTO,
  type EstadoCobro,
  type ProveedorCobroId,
} from "@/lib/types/cobro";

// SLT-226 (design §4.3) — el cobro en línea. Las funciones que llama son del dueño con `REVOKE EXECUTE … FROM
// PUBLIC`: `servi_app` no puede ejecutarlas, así que corren como plataforma (molde de
// `PagoPlataformaConfirmacionRepository`). `FichaJira` no admite `SLT` (deuda D29): lleva `SL-45`, la ficha del pago
// a la plataforma. Las funciones reciben la empresa o la resuelven del intento, y escriben `organizacion_id`
// explícito: como dueño no hay RLS que lo ponga.
//
// `intentosDeFactura` es la excepción de lectura (R27): con la empresa de la sesión corre en `conEmpresa`, baja a
// `servi_app` y la RLS esconde los intentos de las demás; solo el superadmin lee como plataforma.

type CobroIntentoPrismaClient = Pick<PrismaClient, "$queryRaw" | "cobroIntento">;

const FICHA = "SL-45";
const SQLSTATE_COBRO = "SL226";

/** El instante como `TIMESTAMP` sin zona en UTC, como lo guarda la base (la forma de `FacturaPlataformaRepository`). */
function comoTimestamp(instante: Date): string {
  return instante.toISOString().replace("T", " ").replace("Z", "");
}

/** design §3.9: el `codigo` del JSON que el trigger `cobro_intento_solo_avanza` pone en MESSAGE, o `null`. */
export function traducirErrorDeCobro(e: unknown): CobroIntentoInvalido | null {
  if (!llevaSqlstate(e, SQLSTATE_COBRO)) return null;
  for (const mensaje of mensajesDeLaCadena(e)) {
    for (const trozo of mensaje.match(/\{[^{}]*\}/g) ?? []) {
      let o: unknown;
      try {
        o = JSON.parse(trozo);
      } catch {
        // Un trozo entre llaves que no es JSON no es el mensaje del trigger: se sigue buscando.
        continue;
      }
      const codigo = (o as { codigo?: unknown } | null)?.codigo;
      if (codigo === "transicion_invalida" || codigo === "columna_fija") return new CobroIntentoInvalido(codigo, { cause: e });
    }
  }
  return null;
}

/** Corre `fn` y traduce un `SL226` a `CobroIntentoInvalido`; cualquier otro error sigue tal cual. */
async function traduciendo<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw traducirErrorDeCobro(e) ?? e;
  }
}

function inesperado(funcion: string, valor: unknown): Error {
  return new Error(`${funcion} devolvió un resultado inesperado: ${String(valor)}`);
}

function deLista<T extends string>(lista: readonly T[], valor: string, campo: string): T {
  if ((lista as readonly string[]).includes(valor)) return valor as T;
  throw new Error(`CobroIntentoRepository: la base devolvió ${campo} = ${valor}, fuera de lo admitido`);
}

function aDTO(i: CobroIntento): CobroIntentoDTO {
  return {
    id: i.id,
    facturaId: i.facturaId,
    proveedor: deLista<ProveedorCobroId>(PROVEEDORES_COBRO, i.proveedor, "proveedor"),
    estado: deLista<EstadoCobro>(ESTADOS_COBRO, i.estado, "estado"),
    montoLocal: i.montoLocal.toFixed(2),
    monedaLocal: i.monedaLocal,
    montoCobrado: i.montoCobrado.toFixed(2),
    monedaCobro: i.monedaCobro,
    tasa: i.tasa === null ? null : i.tasa.toFixed(8),
    tasaFuente: i.tasaFuente,
    tasaAt: i.tasaAt,
    idExterno: i.idExterno,
    pagoProveedorId: i.pagoProveedorId,
    createdAt: i.createdAt,
    estadoAt: i.estadoAt,
    aprobadoAt: i.aprobadoAt,
  };
}

export class CobroIntentoRepository implements ICobroIntentoRepository {
  constructor(private readonly prisma: CobroIntentoPrismaClient) {}

  obtenerOCrear(input: ObtenerOCrearRepoInput): Promise<ObtenerOCrearRepoResult> {
    return comoPlataforma(FICHA, "SLT-226: crear o reutilizar el intento de cobro en línea de una factura de la empresa (R1–R5)", () =>
      traduciendo(async () => {
        // Una sola sentencia: el candado de la empresa y el FOR UPDATE de la factura serializan dos pedidos (R4).
        const [fila] = await this.prisma.$queryRaw<{ resultado: string; intento_id: string | null }[]>`
          SELECT r."resultado", r."intento_id"
            FROM cobro_intento_obtener_o_crear(${input.organizacionId}, ${input.facturaId}, ${input.proveedor},
                                               ${input.monedaLocal}, ${input.por},
                                               ${comoTimestamp(input.ahora)}::timestamp) r`;
        if (fila?.resultado === "factura_no_valida" || fila?.resultado === "sin_saldo") return { estado: fila.resultado };
        if ((fila?.resultado !== "creado" && fila?.resultado !== "existente") || !fila.intento_id) {
          throw inesperado("cobro_intento_obtener_o_crear", fila?.resultado);
        }
        // El intento ya está escrito y no se borra: leerlo en otra sentencia no puede perderlo.
        const intento = await this.prisma.cobroIntento.findFirst({
          where: { id: fila.intento_id, organizacionId: input.organizacionId },
        });
        if (intento === null) throw new Error(`cobro_intento_obtener_o_crear devolvió ${fila.intento_id} y no se encontró`);
        return { estado: fila.resultado, intento: aDTO(intento) };
      }),
    );
  }

  registrarEnlace(input: RegistrarEnlaceRepoInput): Promise<"ok" | "ya_pendiente" | "no_vivo"> {
    return comoPlataforma(FICHA, "SLT-226: guardar el id del cobro que creó el proveedor y pasar el intento a pendiente (R10)", () =>
      traduciendo(async () => {
        const [fila] = await this.prisma.$queryRaw<{ resultado: string }[]>`
          SELECT cobro_intento_registrar_enlace(${input.organizacionId}, ${input.intentoId}, ${input.idExterno},
                                                ${comoTimestamp(input.ahora)}::timestamp) AS "resultado"`;
        const r = fila?.resultado;
        if (r === "ok" || r === "ya_pendiente" || r === "no_vivo") return r;
        throw inesperado("cobro_intento_registrar_enlace", r);
      }),
    );
  }

  avanzar(input: AvanzarRepoInput): Promise<AvanzarRepoResult> {
    return comoPlataforma(FICHA, "SLT-226: llevar un intento al estado que da el proveedor, sin una empresa en sesión (R14, R15, R23, R24)", () =>
      traduciendo(async () => {
        const [fila] = await this.prisma.$queryRaw<{ resultado: string }[]>`
          SELECT cobro_intento_avanzar(${input.proveedor}, ${input.idExterno}, ${input.destino},
                                       ${comoTimestamp(input.ahora)}::timestamp) AS "resultado"`;
        const r = fila?.resultado;
        if (r !== "ok" && r !== "sin_cambio" && r !== "no_alcanzable" && r !== "sin_intento") {
          throw inesperado("cobro_intento_avanzar", r);
        }
        return { resultado: r, intentoId: r === "sin_intento" ? null : await this.idDelIntento(input.proveedor, input.idExterno) };
      }),
    );
  }

  registrarPagoAprobado(input: RegistrarPagoAprobadoRepoInput): Promise<RegistrarPagoAprobadoRepoResult> {
    return comoPlataforma(FICHA, "SLT-226: registrar en la caja de la empresa el pago aprobado en línea, sin una empresa en sesión (R17–R22)", () =>
      traduciendo(async () => {
        // Una sola sentencia: el intento, el movimiento, la confirmación y la aplicación, o nada (R17, R20).
        const [fila] = await this.prisma.$queryRaw<{ resultado: string }[]>`
          SELECT cobro_registrar_pago_aprobado(${input.proveedor}, ${input.pagoProveedorId}, ${input.idExterno},
                                               ${input.monto}::numeric, ${input.moneda},
                                               ${comoTimestamp(input.ahora)}::timestamp) AS "resultado"`;
        const r = fila?.resultado;
        if (r !== "ok" && r !== "ya_registrado" && r !== "sin_intento" && r !== "requiere_revision") {
          throw inesperado("cobro_registrar_pago_aprobado", r);
        }
        return { resultado: r, intentoId: r === "sin_intento" ? null : await this.idDelIntento(input.proveedor, input.idExterno) };
      }),
    );
  }

  registrarEvento(input: RegistrarEventoRepoInput): Promise<"nuevo" | "repetido" | "pendiente"> {
    return comoPlataforma(FICHA, "SLT-226: guardar una sola vez el evento del proveedor de cobro, tabla de plataforma (R12, R13)", async () => {
      const [fila] = await this.prisma.$queryRaw<{ resultado: string }[]>`
        SELECT cobro_evento_registrar(${input.proveedor}, ${input.logId}, ${input.tipo}, ${input.pagoProveedorId},
                                      ${comoTimestamp(input.ahora)}::timestamp) AS "resultado"`;
      const r = fila?.resultado;
      if (r === "nuevo" || r === "repetido" || r === "pendiente") return r;
      throw inesperado("cobro_evento_registrar", r);
    });
  }

  cerrarEvento(input: CerrarEventoRepoInput): Promise<"ok" | "ya_cerrado" | "sin_evento"> {
    return comoPlataforma(FICHA, "SLT-226: cerrar el evento del proveedor de cobro con su resultado, tabla de plataforma (R13, R15)", async () => {
      const [fila] = await this.prisma.$queryRaw<{ resultado: string }[]>`
        SELECT cobro_evento_cerrar(${input.proveedor}, ${input.logId}, ${input.resultado}, ${input.intentoId},
                                   ${comoTimestamp(input.ahora)}::timestamp) AS "resultado"`;
      const r = fila?.resultado;
      if (r === "ok" || r === "ya_cerrado" || r === "sin_evento") return r;
      throw inesperado("cobro_evento_cerrar", r);
    });
  }

  async intentosDeFactura(alcance: AlcanceDeLectura, facturaId: string): Promise<CobroIntentoDTO[]> {
    const leer = async (organizacionId?: string) => {
      const filas = await this.prisma.cobroIntento.findMany({
        // Con empresa, el filtro va escrito aunque la RLS ya acote: el aislamiento no depende del cliente.
        where: organizacionId === undefined ? { facturaId } : { facturaId, organizacionId },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      });
      return filas.map(aDTO);
    };
    if (alcance.tipo === "empresa") return conEmpresa(alcance.organizacionId, () => leer(alcance.organizacionId));
    return comoPlataforma(FICHA, "SLT-226: el superadmin, que no tiene empresa, lee los intentos de cobro de una factura de cualquier empresa (R27)", () => leer());
  }

  /** El intento del cobro del proveedor, por el único global `(proveedor, id_externo)` (R10). */
  private async idDelIntento(proveedor: ProveedorCobroId, idExterno: string): Promise<string | null> {
    const i = await this.prisma.cobroIntento.findFirst({ where: { proveedor, idExterno }, select: { id: true } });
    return i?.id ?? null;
  }
}
