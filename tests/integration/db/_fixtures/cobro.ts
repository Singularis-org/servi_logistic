import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import { monedaConfig } from "@/lib/config/moneda";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import { CobroPlataformaTarifaRepository } from "@/lib/repositories/CobroPlataformaTarifaRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";

import { bajoLockDeEscrituraReal } from "../_postgres-real";
import { tomarTarifaGlobal, type TarifaGlobalBajoLock } from "./cobro-plataforma-40";
import { limpiar459, sembrarPersonas459, type Personas459 } from "./escrituras-459";
import { cerrarFacturaEnCurso, confirmarComoDueno, facturaEnCurso, type AplicacionDePrueba, type FacturaCerrada } from "./factura-cerrada";

// SLT-226 (design §8) — lo que comparten los tests del cobro en línea contra Postgres: `cobro-intento`,
// `cobro-pago-en-linea` y los que vengan. Todo se escribe COMMITEADO y como DUEÑO, que es como llaman a las
// funciones de 20261124130100 el repositorio (en `comoPlataforma`) y el job del webhook; la RLS se prueba aparte,
// bajando a `servi_app` con `comoApp`.
//
// LAS FACTURAS: como en SLT-60, una orden por el repositorio real de la carga masiva y su cargo cambiado por uno del
// monto pedido; después, `cerrarFacturaEnCurso`. El cargo va a la hora de inicio de la en curso + 1 minuto, no a la
// hora real: tras el primer cierre la en curso nueva empieza en el futuro (el cierre adelanta el reloj de la empresa,
// `factura-cerrada.ts`), y un cargo con la hora real no caería en ninguna factura. Así una empresa puede tener varias
// cerradas, cada una con su total.
//
// No es un archivo de test (no acaba en `.test.ts`): vitest no lo recoge.

/**
 * El proveedor por defecto de los tests. La base admite `rebill`, `wompi` y `global66` (`cobro_intento_proveedor`,
 * R30); los casos que necesitan otro lo pasan explícito.
 */
export const PROVEEDOR = "rebill";

/** El método por defecto de los tests: `tarjeta`, `recurrente` o `transferencia` (`cobro_intento_metodo`, R31). */
export const METODO = "tarjeta";

/** La clave del intento (§12.2): factura | monto local | moneda de cobro | tasa (vacía) | proveedor | método. */
export function claveDe(facturaId: string, montoLocal: string, proveedor = PROVEEDOR, metodo = METODO): string {
  return `${facturaId}|${montoLocal}|${MONEDA_LOCAL}||${proveedor}|${metodo}`;
}

/** La moneda local la pasa el servicio desde la configuración (design §2): aquí, la misma fuente. */
export const MONEDA_LOCAL = monedaConfig.currency;

/** El reloj de las funciones: UTC, como `p_ahora` del servicio. */
export const AHORA_SQL = `(now() AT TIME ZONE 'UTC')::timestamp(3)`;

/** Lo que cualquier cliente del test sabe hacer: el de la base y el de una transacción. */
export type ClienteSql = Pick<PrismaClient, "$queryRawUnsafe" | "$executeRawUnsafe">;

export interface ContextoCobro {
  base: PrismaClient;
  /** La base envuelta como en producción (`servi_app` y la empresa del contexto), para el repositorio de órdenes. */
  app: PrismaClient;
  estatusInicialId: string;
  geo: { provinciaId: string; cantonId: string; distritoId: string };
  /** El valor global de la tarifa queda fijado mientras el archivo corre: el alta de una orden escribe su cargo. */
  tarifa: TarifaGlobalBajoLock;
}

export interface EmpresaCobro {
  p: Personas459;
  zonaId: string;
}

export const orgDe = (e: EmpresaCobro): string => e.p.organizacionId;

/** Lee los catálogos, toma el lock de la tarifa global y la fija. `ctx.tarifa.soltar()` en el `afterAll`. */
export async function prepararContextoCobro(base: PrismaClient): Promise<ContextoCobro> {
  const estatus = await base.orderStatus.findUnique({ where: { value: "por_recolectar_en_tienda" }, select: { id: true } });
  if (estatus === null) throw new Error("falta el estatus «por_recolectar_en_tienda»: corre `pnpm run db:seed`");
  const distrito = await base.distrito.findFirst({
    where: { activo: true },
    select: { id: true, cantonId: true, canton: { select: { provinciaId: true } } },
    orderBy: { id: "asc" },
  });
  if (distrito === null) throw new Error("no hay distritos: aplica las migraciones");
  const tarifa = await tomarTarifaGlobal();
  await new CobroPlataformaTarifaRepository(base).fijarGlobal("500.00");
  return {
    base,
    app: conAislamientoPorEmpresa(base, async () => null),
    estatusInicialId: estatus.id,
    geo: { provinciaId: distrito.canton.provinciaId, cantonId: distrito.cantonId, distritoId: distrito.id },
    tarifa,
  };
}

/** Una empresa con sus personas (maestro, admin, tiendas…) y una zona para colgar órdenes. Commiteada. */
export async function sembrarEmpresaCobro(ctx: ContextoCobro, etiqueta: string): Promise<EmpresaCobro> {
  const p = await sembrarPersonas459(ctx.base);
  const zona = await bajoLockDeEscrituraReal(() =>
    ctx.base.zona.create({
      data: { nombre: `Zona ${etiqueta} ${randomUUID().slice(0, 8)}`, sinpeNumero: "88880000", sinpeNombre: "Zona de prueba", organizacionId: p.organizacionId },
      select: { id: true },
    }),
  );
  return { p, zonaId: zona.id };
}

/** Una orden con un único cargo de `monto` dentro de la factura en curso de la empresa. Devuelve el id de la orden. */
async function ordenConCargoEnLaEnCurso(ctx: ContextoCobro, e: EmpresaCobro, monto: string, etiqueta: string): Promise<string> {
  const numRemision = `${etiqueta}-${randomUUID().slice(0, 12)}`;
  const r = await conEmpresa(orgDe(e), () =>
    new OrdenRepository(ctx.app).createManyOrdenes(
      [
        {
          numRemision,
          estatusId: ctx.estatusInicialId,
          destinatario: `Cliente ${etiqueta}`,
          telefonoDest: "88887777",
          tiendaId: e.p.tiendaId,
          zonaId: e.zonaId,
          provinciaId: ctx.geo.provinciaId,
          cantonId: ctx.geo.cantonId,
          distritoId: ctx.geo.distritoId,
          producto: "Caja",
          peso: null,
          notas: null,
          direccion: null,
          montoCobrar: null,
        },
      ],
      100,
      { actorUsuarioId: e.p.tiendaId, origenTipo: "carga_masiva" },
      { cargaId: null, usuarioCargaId: e.p.tiendaId, totalFiles: 1, name: null },
    ),
  );
  if (r.inserted !== 1) throw new Error(`la orden de ${etiqueta} no entró: ${JSON.stringify(r.omitidas)}`);
  const { id } = await ctx.base.orden.findFirstOrThrow({ where: { organizacionId: orgDe(e), numRemision }, select: { id: true } });
  const enCurso = await facturaEnCurso(ctx.base, orgDe(e));
  await bajoLockDeEscrituraReal(async () => {
    await ctx.base.$executeRawUnsafe(`DELETE FROM "cobro_plataforma_movimiento" WHERE "orden_id" = $1`, id);
    await ctx.base.$executeRawUnsafe(
      `INSERT INTO "cobro_plataforma_movimiento" ("id", "organizacion_id", "orden_id", "secuencia", "tipo", "fuente", "monto", "ocurrido_at")
       VALUES ($1, $2, $3, 1, 'cargo', 'plan', $4::numeric, $5::timestamp + interval '1 minute')`,
      `slt226-${randomUUID()}`,
      orgDe(e),
      id,
      monto,
      enCurso.desdeAt.toISOString().replace("T", " ").replace("Z", ""),
    );
  });
  return id;
}

/**
 * Cierra la factura en curso de la empresa con un total de `monto` (`null`: sin cargos, total 0). Lanza si el total
 * no es el pedido: un test que cree tener 30 000 por cobrar y tenga otra cosa no mide nada.
 */
export async function facturaCerradaCon(ctx: ContextoCobro, e: EmpresaCobro, monto: string | null, etiqueta: string): Promise<FacturaCerrada> {
  if (monto !== null) await ordenConCargoEnLaEnCurso(ctx, e, monto, etiqueta);
  const f = await cerrarFacturaEnCurso(ctx.base, orgDe(e));
  const esperado = monto ?? "0.00";
  if (f.total !== esperado) throw new Error(`la factura ${f.id} cerró con ${f.total}, no con ${esperado}`);
  return f;
}

/* -------------------------------------------------------------------------- */
/* Las funciones del dueño (20261124130100), tal como las llama el repositorio  */
/* -------------------------------------------------------------------------- */

export interface ResultadoObtener {
  resultado: "creado" | "existente" | "factura_no_valida" | "sin_saldo";
  intentoId: string | null;
}

/** El proveedor y el método del pedido (§12.3); por defecto, `PROVEEDOR` y `METODO`. */
export interface MedioDelCobro {
  proveedor?: string;
  metodo?: string;
}

/** §3.1 con la moneda local de la configuración. */
export async function obtenerOCrearIntento(
  c: ClienteSql,
  org: string,
  facturaId: string,
  por: string | null,
  medio: MedioDelCobro = {},
): Promise<ResultadoObtener> {
  const [f] = await c.$queryRawUnsafe<{ resultado: ResultadoObtener["resultado"]; intento_id: string | null }[]>(
    `SELECT r."resultado", r."intento_id" FROM cobro_intento_obtener_o_crear($1, $2, $3, $4, $5, $6, ${AHORA_SQL}) r`,
    org,
    facturaId,
    medio.proveedor ?? PROVEEDOR,
    medio.metodo ?? METODO,
    MONEDA_LOCAL,
    por,
  );
  return { resultado: f.resultado, intentoId: f.intento_id };
}

/** §3.1 cuando el caso necesita un intento nuevo: lanza si no responde `creado`. */
export async function crearIntento(c: ClienteSql, org: string, facturaId: string, por: string | null, medio: MedioDelCobro = {}): Promise<string> {
  const r = await obtenerOCrearIntento(c, org, facturaId, por, medio);
  if (r.resultado !== "creado" || r.intentoId === null) throw new Error(`se esperaba un intento nuevo y respondió ${JSON.stringify(r)}`);
  return r.intentoId;
}

/** §3.2: 'ok', 'ya_pendiente' o 'no_vivo'. */
export async function registrarEnlace(c: ClienteSql, org: string, intentoId: string, idExterno: string): Promise<string> {
  const [f] = await c.$queryRawUnsafe<{ r: string }[]>(
    `SELECT cobro_intento_registrar_enlace($1, $2, $3, ${AHORA_SQL}) AS r`,
    org,
    intentoId,
    idExterno,
  );
  return f.r;
}

/** §3.3: 'ok', 'sin_cambio', 'no_alcanzable' o 'sin_intento'. */
export async function avanzarIntento(c: ClienteSql, idExterno: string, destino: string): Promise<string> {
  const [f] = await c.$queryRawUnsafe<{ r: string }[]>(
    `SELECT cobro_intento_avanzar($1, $2, $3, ${AHORA_SQL}) AS r`,
    PROVEEDOR,
    idExterno,
    destino,
  );
  return f.r;
}

/** §3.5: 'ok', 'ya_registrado', 'sin_intento' o 'requiere_revision'. */
export async function registrarPagoAprobado(
  c: ClienteSql,
  d: { pagoProveedorId: string; idExterno: string | null; monto: string; moneda?: string; proveedor?: string },
): Promise<string> {
  const [f] = await c.$queryRawUnsafe<{ r: string }[]>(
    `SELECT cobro_registrar_pago_aprobado($1, $2, $3, $4::numeric, $5, ${AHORA_SQL}) AS r`,
    d.proveedor ?? PROVEEDOR,
    d.pagoProveedorId,
    d.idExterno,
    d.monto,
    d.moneda ?? MONEDA_LOCAL,
  );
  return f.r;
}

/**
 * §12.4: la marca a mano del superadmin. 'ok', 'ya_registrado', 'referencia_vacia', 'sin_intento',
 * 'referencia_en_otro_intento', 'no_vivo' o 'requiere_revision'.
 */
export async function marcarPagadoManual(c: ClienteSql, intentoId: string, referencia: string | null, por: string): Promise<string> {
  const [f] = await c.$queryRawUnsafe<{ r: string }[]>(
    `SELECT cobro_marcar_pagado_manual($1, $2, $3, ${AHORA_SQL}) AS r`,
    intentoId,
    referencia,
    por,
  );
  return f.r;
}

/* -------------------------------------------------------------------------- */
/* Los caminos que cambian el saldo (R11): SLT-60 y SLT-143, como dueño         */
/* -------------------------------------------------------------------------- */

/**
 * Un «Pago a la plataforma» de la wallet, por confirmar, escrito como dueño con las columnas del egreso de la wallet
 * (origen `gasto`, sin documento). El tope de SL-45 corre igual (es un trigger). Devuelve su id.
 */
export async function pagoPorConfirmar(c: ClienteSql, org: string, monto: string, por: string): Promise<string> {
  const id = randomUUID();
  await c.$executeRawUnsafe(
    `INSERT INTO "wallet_movimiento"
       ("id", "organizacion_id", "tipo", "categoria", "monto", "origen_tipo", "origen_id", "descripcion",
        "registrado_por", "fecha_movimiento", "created_at", "clave_idempotencia")
     VALUES ($1, $2, 'egreso', 'egreso_pago_plataforma', $3::numeric, 'gasto', NULL, 'Pago SLT-226', $4,
             ${AHORA_SQL}, ${AHORA_SQL}, $5)`,
    id,
    org,
    monto,
    por,
    randomUUID(),
  );
  return id;
}

/** SLT-60: confirma `pagoId` aplicado como dice `aplicaciones` (`confirmado_por` = `por`, de la misma empresa). */
export function confirmarPago(c: ClienteSql, org: string, pagoId: string, aplicaciones: AplicacionDePrueba[], por: string): Promise<void> {
  return confirmarComoDueno(c, org, pagoId, aplicaciones, por);
}

/** SLT-143: el registro por fuera, sin comprobante. Devuelve el id del pago. Lanza si no responde `ok`. */
export async function registrarPorFuera(c: ClienteSql, org: string, monto: string, aplicaciones: AplicacionDePrueba[], por: string): Promise<string> {
  const id = randomUUID();
  const [f] = await c.$queryRawUnsafe<{ r: string }[]>(
    `SELECT pago_plataforma_registrar_por_fuera($1, $2, $3::numeric, NULL, 'Por fuera SLT-226', $4, $5::jsonb, $6,
                                                ${AHORA_SQL}, NULL, NULL) AS r`,
    org,
    id,
    monto,
    randomUUID(),
    JSON.stringify(aplicaciones.map((a) => ({ factura_id: a.facturaId, monto: a.monto }))),
    por,
  );
  if (f.r !== "ok") throw new Error(`el registro por fuera respondió ${f.r}`);
  return id;
}

/** SLT-143: anula un pago confirmado. Lanza si no responde `ok`. */
export async function anularConfirmado(c: ClienteSql, org: string, pagoId: string, por: string): Promise<void> {
  const [f] = await c.$queryRawUnsafe<{ r: string }[]>(
    `SELECT pago_plataforma_anular_confirmado($1, $2, 'Anulado en SLT-226', $3, ${AHORA_SQL}) AS r`,
    org,
    pagoId,
    por,
  );
  if (f.r !== "ok") throw new Error(`la anulación respondió ${f.r}`);
}

/* -------------------------------------------------------------------------- */
/* Lecturas (como dueño: lo que hay de verdad)                                  */
/* -------------------------------------------------------------------------- */

export interface IntentoLeido {
  id: string;
  organizacionId: string;
  facturaId: string;
  proveedor: string;
  metodo: string;
  estado: string;
  motivoAnulacion: string | null;
  clave: string;
  montoLocal: string;
  montoCobrado: string;
  monedaLocal: string;
  monedaCobro: string;
  tasa: string | null;
  tasaFuente: string | null;
  tasaAt: Date | null;
  idExterno: string | null;
  pagoProveedorId: string | null;
  pagoId: string | null;
  creadoPor: string | null;
}

const COLUMNAS_INTENTO = `i."id" AS "id", i."organizacion_id" AS "organizacionId", i."factura_id" AS "facturaId",
  i."proveedor" AS "proveedor", i."metodo" AS "metodo", i."estado" AS "estado", i."motivo_anulacion" AS "motivoAnulacion", i."clave" AS "clave",
  i."monto_local"::text AS "montoLocal", i."monto_cobrado"::text AS "montoCobrado",
  i."moneda_local"::text AS "monedaLocal", i."moneda_cobro"::text AS "monedaCobro", i."tasa"::text AS "tasa",
  i."tasa_fuente" AS "tasaFuente", i."tasa_at" AS "tasaAt", i."id_externo" AS "idExterno",
  i."pago_proveedor_id" AS "pagoProveedorId", i."pago_id" AS "pagoId", i."creado_por" AS "creadoPor"`;

export async function leerIntento(c: ClienteSql, id: string): Promise<IntentoLeido> {
  const filas = await c.$queryRawUnsafe<IntentoLeido[]>(`SELECT ${COLUMNAS_INTENTO} FROM "cobro_intento" i WHERE i."id" = $1`, id);
  if (filas.length !== 1) throw new Error(`el intento ${id} no existe`);
  return filas[0];
}

/** Los intentos de una factura, del más viejo al más nuevo. */
export function intentosDeFactura(c: ClienteSql, facturaId: string): Promise<IntentoLeido[]> {
  return c.$queryRawUnsafe<IntentoLeido[]>(
    `SELECT ${COLUMNAS_INTENTO} FROM "cobro_intento" i WHERE i."factura_id" = $1 ORDER BY i."created_at", i."estado_at", i."id"`,
    facturaId,
  );
}

export interface FilaHistorialCobro {
  accion: string;
  entidadTipo: string;
  entidadId: string;
  entidadEtiqueta: string;
  paisId: string;
  actorUsuarioId: string | null;
  actorNombre: string | null;
  valorAnterior: string | null;
  valorNuevo: string | null;
  detalle: Record<string, unknown>;
}

/** Las filas de historial de plataforma de un intento, en el orden en que se escribieron. */
export function historialDeIntento(c: ClienteSql, intentoId: string): Promise<FilaHistorialCobro[]> {
  return c.$queryRawUnsafe<FilaHistorialCobro[]>(
    `SELECT h."accion"::text AS "accion", h."entidad_tipo"::text AS "entidadTipo", h."entidad_id" AS "entidadId",
            h."entidad_etiqueta" AS "entidadEtiqueta", h."pais_id" AS "paisId", h."actor_usuario_id" AS "actorUsuarioId",
            h."actor_nombre" AS "actorNombre", h."valor_anterior" AS "valorAnterior", h."valor_nuevo" AS "valorNuevo",
            h."detalle" AS "detalle"
       FROM "historial_plataforma" h
      WHERE h."entidad_tipo" = 'cobro_intento' AND h."entidad_id" = $1
      ORDER BY h."created_at",
               -- Los pasos de una misma sentencia comparten la hora: se ordenan por la máquina de estados.
               array_position(ARRAY['creado', 'pendiente', 'aprobado', 'rechazado', 'expirado', 'anulado', 'devuelto',
                                    'contracargo']::text[], h."valor_nuevo"::text), h."id"`,
    intentoId,
  );
}

/* -------------------------------------------------------------------------- */
/* Limpieza                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Borra todo lo que el test dejó en las empresas, en el orden de sus FK, y después las personas y la empresa
 * (`limpiar459`). `cobro_intento` va primero: cuelga del libro y de la factura sin acción y de sus usuarios con
 * RESTRICT (design §11, «Las limpiezas y el `creado_por`»); su historial de plataforma no cuelga de nada y se borra
 * por el id del intento. Idempotente: con las empresas ya borradas no hace nada.
 */
export async function limpiarEmpresasCobro(base: PrismaClient, empresas: (EmpresaCobro | undefined)[]): Promise<void> {
  const vivas = empresas.filter((e): e is EmpresaCobro => e !== undefined);
  const orgs = vivas.map(orgDe);
  if (orgs.length === 0) return;
  await bajoLockDeEscrituraReal(async () => {
    await base.$executeRawUnsafe(
      `DELETE FROM "historial_plataforma" h
        WHERE h."entidad_tipo" = 'cobro_intento'
          AND h."entidad_id" IN (SELECT i."id" FROM "cobro_intento" i WHERE i."organizacion_id" = ANY($1::text[]))`,
      orgs,
    );
    for (const tabla of [
      "cobro_intento",
      "pago_plataforma_anulacion",
      "pago_plataforma_aplicacion",
      "pago_plataforma_confirmacion",
      "wallet_comprobante",
      "ajuste_caja_anulacion",
      "wallet_movimiento",
      // Los cargos y sus trazas se van con su orden (ON DELETE CASCADE); las facturas, con la empresa.
      "historial_accion",
      "orden_historial_estado",
      "jobs",
      "orden",
      "carga",
      "zona",
    ]) {
      await base.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE "organizacion_id" = ANY($1::text[])`, orgs);
    }
  });
  for (const e of vivas) await limpiar459(base, e.p);
}

/* -------------------------------------------------------------------------- */
/* Concurrencia                                                                */
/* -------------------------------------------------------------------------- */

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Lanza `operaciones` a la vez mientras OTRA conexión (`sostenedor`) tiene el candado de los pagos de la empresa
 * (`pago_plataforma:<org>`), y lo suelta pasado un momento: así las operaciones de verdad llegan juntas a la puerta
 * y se serializan en el candado, no por suerte del planificador (molde de SLT-60 y SLT-143). Devuelve cuántas habían
 * terminado mientras el candado estaba tomado (debe ser 0) y los resultados.
 */
export async function aLaVezConCandado<T>(
  sostenedor: PrismaClient,
  org: string,
  operaciones: (() => Promise<T>)[],
): Promise<{ terminadasConElCandado: number; resultados: T[] }> {
  let dentro: () => void = () => undefined;
  let soltar: () => void = () => undefined;
  const yaDentro = new Promise<void>((r) => {
    dentro = r;
  });
  const suelto = new Promise<void>((r) => {
    soltar = r;
  });
  const fin = sostenedor.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext('pago_plataforma:' || $1))`, org);
      dentro();
      await suelto;
    },
    { timeout: 60_000, maxWait: 15_000 },
  );
  await yaDentro;
  let terminadas = 0;
  const promesas = operaciones.map((op) =>
    op().finally(() => {
      terminadas += 1;
    }),
  );
  await dormir(1500);
  const terminadasConElCandado = terminadas;
  soltar();
  await fin;
  return { terminadasConElCandado, resultados: await Promise.all(promesas) };
}
