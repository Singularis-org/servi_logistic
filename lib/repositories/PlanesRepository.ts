import { randomUUID } from "node:crypto";

import { Prisma, type ModuloApagable, type PrismaClient, type RolValue } from "@prisma/client";

import { comoPlataforma } from "@/lib/db/contexto-empresa";
import type { ActorCongelado, EntradaAccion } from "@/lib/interfaces/repositories/IHistorialAccionRepository";
import type {
  AsignacionLeida,
  AvisoCorreoPlan,
  AvisoNoAplicadaPlan,
  CambioDeEmpresaPendiente,
  CambioPendiente,
  DestinatariosDelAviso,
  DetallePlanLeido,
  EfectoElegido,
  EmpresaDePlanes,
  EmpresaParaElMaestro,
  IPlanesDelMaestroRepository,
  IPlanesRecepcionesRepository,
  IPlanesRepository,
  NoAplicadaLeida,
  PlanDeEmpresaLeida,
  PrecioDesdeLeido,
  PendienteDelDetalleLeido,
  PlanDelCatalogoLeido,
  RecepcionPendiente,
  AsignacionAlCrear,
  ResultadoAplicar,
  ResultadoArchivar,
  ResultadoAsignar,
  ResultadoCambiarTipoCobro,
  ResultadoCambioDelMaestro,
  ResultadoCancelarCambio,
  ResultadoCancelarCambioDelPlan,
  ResultadoCancelarDelMaestro,
  ResultadoCrearYAsignar,
  ResultadoEdicion,
  ResultadoProgramar,
  ResultadoRecibir,
  ResultadoRecordatorio,
  VistaPreviaLeida,
} from "@/lib/interfaces/repositories/IPlanesRepository";
import { valorDelHistorialDeAsignacion } from "@/lib/planes/cobro";
import type { CambioDelPlanLeido } from "@/lib/planes/consumo";
import { costoVigenteDeLaTarifa, type TarifaLeida } from "@/lib/planes/costeo";
import { esPlanDisponible } from "@/lib/planes/costo-concreto";
import { fechaDeRecepcion, recordatoriosDe, type DiasDeRecordatorio } from "@/lib/planes/recepcion";
import {
  FECHA_DE_EFECTO_OBLIGATORIA,
  MOTIVOS_NO_APLICADA,
  SOLO_CON_PLAN,
  SOLO_PRIMERA_ASIGNACION,
  type MotivoNoAplicada,
} from "@/lib/planes/mensajes";
import { cambiaElPrecio, diferenciasDelPlan, hayCambios, importeCanonico, type CambiosDelPlan } from "@/lib/planes/rastro";
import { apagarEnTx, encenderEnTx, entradaDelCambio } from "@/lib/repositories/_shared/modulos-en-tx";
import { pendienteDeEmpresa, precioDelHistorial } from "@/lib/repositories/_shared/precio-del-periodo";
import { JobRepository } from "@/lib/repositories/JobRepository";
import { ACTOR_SISTEMA, appendAccion, resolverActorCongelado } from "@/lib/repositories/registrar-accion";
import { etiquetaDeEntidad } from "@/lib/types/historial-accion-etiquetas";
import {
  ACCIONES_DE_ASIGNACION,
  ROLES_CON_TOPE,
  TIPOS_COBRO,
  type AccionDeAsignacion,
  type CostoPorOrdenPorcentual,
  type CrearPlanInput,
  type DescuentoPeriodo,
  type PeriodicidadOrdenes,
  periodicidadOrdenesSchema,
  type PlanDTO,
  type PrecioPlan,
  precioPlanSchema,
  type RolConTope,
  type TipoCobro,
  type TopeExcedido,
  type TopesPlan,
  tipoCobroSchema,
  type VersionPlan,
  versionPlanSchema,
} from "@/lib/types/planes";
import {
  fechaCalendarioPlataforma,
  fechaDeEfectoPorDefecto,
  inicioDelDiaPlataforma,
  inicioDelPeriodoCalendario,
} from "@/lib/planes/ciclo";

// SL-24 (design §2, §4.4, §5, §7, §9, §16.3) — el catálogo de planes y su asignación. Lo escribe solo
// el superadmin, que no tiene empresa: todo corre en `comoPlataforma` (como dueño, sin el filtro de la
// extensión ni el REVOKE de `servi_app`, R8). Por eso `organizacion_id` va explícito en el historial.
//
// Cerrojos (§4.4), siempre en este orden para no interbloquear con las altas de los triggers, que piden
// empresa → plan:
//   · asignar: `organizacion` FOR UPDATE → plan FOR SHARE → contar → escribir;
//   · cambiar solo el tipo de cobro (ajuste planes-custom D10): `organizacion` FOR UPDATE → plan FOR SHARE → escribir;
//   · editar, archivar, programar, cancelar y aplicar un cambio programado: plan FOR UPDATE (nunca
//     piden la empresa después). SLT-86 (R21): archivar escribe en las empresas con un pendiente hacia
//     el plan, así que las pide ANTES que el plan, en el mismo orden empresa → plan;
//   · el cambio de empresa con fecha (SLT-86 §5.1–§5.3), aplicarlo y cancelarlo: `organizacion` FOR
//     UPDATE → plan FOR SHARE, como asignar.
// El FOR UPDATE espera a las altas en vuelo (que tienen las filas en FOR SHARE) y cuenta con ellas ya
// confirmadas; las altas siguientes leen lo nuevo.
//
// Cada cambio deja su rastro en la misma transacción: `plan_rastro` (plataforma, P5) al crear, editar,
// archivar, y al programar, reemplazar, cancelar o aplicar un cambio (R43); `historial_accion` de la empresa al asignar y por cada módulo que se
// enciende o apaga (R29), y, desde SLT-86, al cancelar el cambio pendiente de una empresa. Si el rastro falla,
// nada persiste.
//
// SLT-58 (design §3.2) suma tres lecturas para las pantallas del superadmin (catálogo, detalle de un
// plan, plan de una empresa), también en `comoPlataforma` y sin escribir nada. Su enmienda (§11) suma
// la fecha de inicio del ciclo en la primera asignación y su vista previa, de solo lectura.

export type PlanesPrismaClient = Pick<
  PrismaClient,
  | "plan"
  | "organizacion"
  | "planCambioProgramado"
  | "planCambioRecepcion"
  | "usuario"
  | "historialAccion"
  | "planRastro"
  | "$transaction"
>;
type Tx = Prisma.TransactionClient;

const INCLUIR = {
  topesPorRol: { select: { rol: true, maximo: true } },
  modulos: { select: { modulo: true } },
  // SLT-86 (design §1.1; R10): el descuento vigente de cada período, una fila por período con descuento.
  descuentos: { select: { periodo: true, porcentaje: true, monto: true } },
} as const;

type FilaPlan = Prisma.PlanGetPayload<{ include: typeof INCLUIR }>;

const ROLES: ReadonlySet<string> = new Set(ROLES_CON_TOPE);

/* -------------------------------------------------------------------------- */
/* Filas ↔ DTO                                                                 */
/* -------------------------------------------------------------------------- */

/** D16: la acción de una fila del historial de asignaciones; la consulta ya filtra por estas tres (SLT-86: la cancelación). */
function comoAccionDeAsignacion(accion: string): AccionDeAsignacion {
  const encontrada = ACCIONES_DE_ASIGNACION.find((a) => a === accion);
  if (encontrada === undefined) throw new Error(`planDeEmpresa: acción ${accion} fuera del historial de asignaciones`);
  return encontrada;
}

/**
 * SLT-86 (R10): `plan.precio_mensual` y una fila de `plan_descuento_periodo` por período con descuento. El
 * CHECK `plan_descuento_periodo_una_forma` deja exactamente una de las dos columnas. `toFixed(2)` de
 * `Prisma.Decimal`: exacto, sin pasar por `Number`.
 */
function precioDe(f: FilaPlan): PrecioPlan {
  if (f.precioMensual === null) return { tipo: "sin_precio" };
  const descuentos: Partial<Record<TipoCobro, DescuentoPeriodo>> = {};
  for (const d of f.descuentos) {
    descuentos[tipoCobroSchema.parse(d.periodo)] =
      d.porcentaje !== null
        ? { tipo: "porcentaje", porcentaje: d.porcentaje.toFixed(2) }
        : { tipo: "monto", monto: (d.monto as Prisma.Decimal).toFixed(2) };
  }
  return { tipo: "monto", mensual: f.precioMensual.toFixed(2), descuentos };
}

function aDTO(f: FilaPlan): PlanDTO {
  const porRol: TopesPlan["porRol"] = {};
  for (const t of f.topesPorRol) if (ROLES.has(t.rol)) porRol[t.rol as RolConTope] = t.maximo;
  return {
    id: f.id,
    nombre: f.nombre,
    visibilidad: f.visibilidad,
    organizacionId: f.organizacionExclusivaId,
    topes: { porRol, apiKeys: f.topeApiKeys },
    modulos: f.modulos.map((m) => m.modulo),
    precio: precioDe(f),
    costoPorOrden: f.costoPorOrden === null ? null : f.costoPorOrden.toFixed(2),
    // SLT-83 (R1): el modo se deriva de qué columna tiene valor; el `CHECK` impide los dos a la vez.
    costoPorOrdenPorcentual:
      f.costoPorOrdenPct === null
        ? null
        : {
            porcentaje: f.costoPorOrdenPct.toFixed(2),
            minimo: f.costoPorOrdenMinimo === null ? null : f.costoPorOrdenMinimo.toFixed(2),
          },
    // SLT-118 (R35): el CHECK `plan_periodicidad_ordenes_check` deja solo los dos valores.
    periodicidadOrdenes: periodicidadOrdenesSchema.parse(f.periodicidadOrdenes),
    archivado: f.archivadoAt !== null,
  };
}

/** La columna del costo base mensual (R3; D1: sin «negociable»). El importe, como texto. */
function columnasDelPrecio(p: PrecioPlan) {
  return { precioMensual: p.tipo === "monto" ? p.mensual : null };
}

/**
 * SLT-86 (R10, R11): deja en `plan_descuento_periodo` exactamente los descuentos del precio. «Sin precio»
 * deja el plan sin descuentos (R11): zod ya rechazó los que llegaran con él.
 */
async function guardarDescuentos(tx: Tx, planId: string, precio: PrecioPlan): Promise<void> {
  await tx.planDescuentoPeriodo.deleteMany({ where: { planId } });
  if (precio.tipo !== "monto") return;
  const filas = TIPOS_COBRO.flatMap((periodo) => {
    const d = precio.descuentos[periodo];
    if (d === undefined) return [];
    return [
      {
        planId,
        periodo,
        porcentaje: d.tipo === "porcentaje" ? d.porcentaje : null,
        monto: d.tipo === "monto" ? d.monto : null,
      },
    ];
  });
  if (filas.length > 0) await tx.planDescuentoPeriodo.createMany({ data: filas });
}

/**
 * SLT-86 (design §1.2; R15): el precio que rige desde `desde` (las 00:00 de la fecha de efecto) o desde
 * siempre (`-infinity`, al crear). Dos ediciones del mismo día dejan la última. `descuentos` con la forma
 * de `PrecioPlan.descuentos`, que es la que lee `precio_del_periodo`.
 */
async function escribirPrecioDelHistorial(
  tx: Tx,
  planId: string,
  desde: Date | "siempre",
  precio: PrecioPlan,
  /**
   * SLT-128 (design §3.2, §3.3; R3): `"dejar"` = si ya hay fila en `desde`, se queda. La recepción de la primera
   * empresa la escribe y ni las siguientes ni la promoción la tocan.
   */
  siYaEsta: "pisar" | "dejar" = "pisar",
): Promise<void> {
  const mensual = precio.tipo === "monto" ? precio.mensual : null;
  // Con dos decimales, como los lee `plan_descuento_periodo`: «10» y «10.00» son el mismo descuento.
  const canonicos: Partial<Record<TipoCobro, DescuentoPeriodo>> = {};
  if (precio.tipo === "monto") {
    for (const periodo of TIPOS_COBRO) {
      const d = precio.descuentos[periodo];
      if (d === undefined) continue;
      canonicos[periodo] =
        d.tipo === "porcentaje"
          ? { tipo: "porcentaje", porcentaje: importeCanonico(d.porcentaje) }
          : { tipo: "monto", monto: importeCanonico(d.monto) };
    }
  }
  const descuentos = JSON.stringify(canonicos);
  const desdeAt = desde === "siempre" ? Prisma.sql`'-infinity'::timestamp` : Prisma.sql`${comoTimestamp(desde)}::timestamp`;
  const alChocar =
    siYaEsta === "dejar"
      ? Prisma.sql`DO NOTHING`
      : Prisma.sql`DO UPDATE SET "precio_mensual" = EXCLUDED."precio_mensual", "descuentos" = EXCLUDED."descuentos"`;
  await tx.$executeRaw`
    INSERT INTO "plan_precio_historial" ("plan_id", "desde_at", "precio_mensual", "descuentos")
    VALUES (${planId}, ${desdeAt}, ${mensual}::numeric, ${descuentos}::jsonb)
    ON CONFLICT ("plan_id", "desde_at") ${alChocar}`;
}

/** SLT-83 (R1, R4): las dos columnas del modo porcentual; `null` las vacía (el plan pasa a fijo o vacío). */
function columnasDelPorcentual(c: CostoPorOrdenPorcentual | null) {
  return { costoPorOrdenPct: c?.porcentaje ?? null, costoPorOrdenMinimo: c?.minimo ?? null };
}

function filasDeTopes(t: TopesPlan): { rol: RolValue; maximo: number }[] {
  return ROLES_CON_TOPE.flatMap((rol) => {
    const maximo = t.porRol[rol];
    return maximo === undefined ? [] : [{ rol, maximo }];
  });
}

async function leerPlan(tx: Tx, planId: string): Promise<PlanDTO | null> {
  const fila = await tx.plan.findUnique({ where: { id: planId }, include: INCLUIR });
  return fila === null ? null : aDTO(fila);
}

/** `false` si el plan no existe. */
async function bloquearPlanParaEscribir(tx: Tx, planId: string): Promise<boolean> {
  const filas = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "plan" WHERE "id" = ${planId} FOR UPDATE`;
  return filas.length > 0;
}

/**
 * SLT-118 (design §3.2; R37, P12): con el plan ya bloqueado para escribir, cuántas empresas quedarían con tipo
 * quincenal en un plan de órdenes mensuales si `version` se aplica sobre `antes`: las que lo tienen con tipo
 * quincenal y las que lo tienen como cambio pendiente con tipo quincenal. 0 si la versión no pasa de
 * quincenal a mensual. El cerrojo del plan espera a las asignaciones en vuelo (que lo tienen FOR SHARE) y las
 * siguientes leen el plan ya mensual y se rechazan solas.
 */
async function empresasQuincenalesSiPasaAMensual(
  tx: Tx,
  antes: PlanDTO,
  version: VersionPlan,
  /**
   * SLT-128 (R28): las empresas cuya recepción de ESTE cambio quedó «no aplicada»: conservan su versión al
   * promover, así que no frenan el plan.
   */
  excluir: readonly string[] = [],
): Promise<number> {
  if (version.periodicidadOrdenes !== "mensual" || antes.periodicidadOrdenes === "mensual") return 0;
  const [{ empresas }] = await tx.$queryRaw<{ empresas: number }[]>`
    SELECT count(*)::int AS "empresas"
      FROM "organizacion"
     WHERE (("plan_id" = ${antes.id} AND "plan_tipo_cobro" = 'quincenal')
        OR ("plan_cambio_plan_id" = ${antes.id} AND "plan_cambio_tipo_cobro" = 'quincenal'))
       AND NOT ("id" = ANY(${[...excluir]}::text[]))`;
  return empresas;
}

/* -------------------------------------------------------------------------- */
/* Uso contra topes (R12, R16)                                                 */
/* -------------------------------------------------------------------------- */

// SLT-86 (R8): sin órdenes. Ya no tienen tope, así que no se cuentan contra uno; las órdenes del período
// las cuenta `planDeEmpresa` aparte.
interface FilaUso {
  api_keys: number;
  admin: number;
  mensajero: number;
  admin_tienda: number;
  admin_satelite: number;
}

// SLT-66 (R1, R3): el maestro no tiene tope, así que tampoco se cuenta.
const COLUMNA_DEL_ROL: Record<RolConTope, keyof FilaUso> = {
  admin: "admin",
  mensajero: "mensajero",
  adminTienda: "admin_tienda",
  adminSatelite: "admin_satelite",
};

/** Un `Date` UTC como literal de `TIMESTAMP` sin zona: la zona de la sesión no lo mueve. */
function comoTimestamp(instante: Date): string {
  return instante.toISOString().replace("T", " ").replace("Z", "");
}

/**
 * El uso de una empresa contra los topes que quedan (usuarios por rol y API keys), con las mismas
 * funciones que cuentan los triggers (una sola definición de «uso», §4.2). `'Admin Tienda'` es la
 * etiqueta de Postgres de `adminTienda`.
 *
 * SLT-86 (R8): sin órdenes ni ciclo. Ninguno de los dos topes que quedan depende de la fecha, así que el
 * «ciclo candidato» de SLT-58 (§11.4) ya no hace falta.
 */
async function usoDe(tx: Tx, organizacionId: string): Promise<FilaUso> {
  const [fila] = await tx.$queryRaw<FilaUso[]>`
    SELECT plan_uso_api_keys(o."id") AS "api_keys",
           plan_uso_rol(o."id", 'admin'::rol_value) AS "admin",
           plan_uso_rol(o."id", 'mensajero'::rol_value) AS "mensajero",
           plan_uso_rol(o."id", 'Admin Tienda'::rol_value) AS "admin_tienda",
           plan_uso_rol(o."id", 'adminSatelite'::rol_value) AS "admin_satelite"
      FROM "organizacion" o
     WHERE o."id" = ${organizacionId}`;
  return fila;
}

/** Los topes de `topes` que cada empresa ya pasa (`usados > maximo`; igual al tope no pasa). */
async function excedidosDe(
  tx: Tx,
  empresas: readonly { id: string; nombre: string }[],
  topes: TopesPlan,
): Promise<TopeExcedido[]> {
  const excedidos: TopeExcedido[] = [];
  for (const empresa of empresas) {
    const uso = await usoDe(tx, empresa.id);
    const pasa = (tope: TopeExcedido["tope"], usados: number, maximo: number | null | undefined) => {
      if (maximo !== null && maximo !== undefined && usados > maximo) {
        excedidos.push({ organizacionId: empresa.id, empresa: empresa.nombre, tope, usados, maximo });
      }
    };
    for (const rol of ROLES_CON_TOPE) pasa(rol, uso[COLUMNA_DEL_ROL[rol]], topes.porRol[rol]);
    pasa("api_keys", uso.api_keys, topes.apiKeys);
  }
  return excedidos;
}

/* -------------------------------------------------------------------------- */
/* Módulos (§7)                                                                */
/* -------------------------------------------------------------------------- */

/** Enciende y apaga en la transacción; devuelve solo las entradas de lo que de verdad cambió. */
async function cambiarModulos(
  tx: Tx,
  organizacionId: string,
  encender: readonly ModuloApagable[],
  apagar: readonly ModuloApagable[],
) {
  const entradas: ReturnType<typeof entradaDelCambio>[] = [];
  for (const modulo of encender) {
    const r = await encenderEnTx(tx, organizacionId, modulo);
    if (r.cambio) entradas.push(entradaDelCambio("modulo_activado", organizacionId, r.filaId, modulo));
  }
  for (const modulo of apagar) {
    const r = await apagarEnTx(tx, organizacionId, modulo);
    if (r.cambio) entradas.push(entradaDelCambio("modulo_desactivado", organizacionId, r.filaId, modulo));
  }
  return entradas;
}

/** R10: deja encendidos exactamente los incluidos. Borra las excepciones de SL-23 (R11). */
async function sincronizarModulos(tx: Tx, organizacionId: string, objetivo: readonly ModuloApagable[]) {
  const actuales = (await tx.organizacionModulo.findMany({ where: { organizacionId }, select: { modulo: true } })).map(
    (f) => f.modulo,
  );
  return cambiarModulos(
    tx,
    organizacionId,
    objetivo.filter((m) => !actuales.includes(m)),
    actuales.filter((m) => !objetivo.includes(m)),
  );
}

/* -------------------------------------------------------------------------- */
/* Escrituras compartidas                                                      */
/* -------------------------------------------------------------------------- */

/** El nombre congelado del rastro. `actor_nombre` es NOT NULL: un actor que no resuelve queda en ''. */
function nombreDelActor(actor: ActorCongelado): string {
  return actor.actorNombre ?? "";
}

type AccionDelRastro =
  | "creado"
  | "editado"
  | "archivado"
  | "cambio_programado"
  | "cambio_reemplazado"
  | "cambio_cancelado"
  | "cambio_aplicado";

async function escribirRastro(
  tx: Tx,
  plan: { id: string; nombre: string },
  accion: AccionDelRastro,
  cambios: CambiosDelPlan | Record<string, { antes: unknown; despues: unknown }>,
  actorUsuarioId: string,
  actor: ActorCongelado,
): Promise<string> {
  const { id } = await tx.planRastro.create({
    data: {
      planId: plan.id,
      planNombre: plan.nombre,
      accion,
      cambios: cambios as Prisma.InputJsonValue,
      actorUsuarioId,
      actorNombre: nombreDelActor(actor),
    },
    select: { id: true },
  });
  return id;
}

/**
 * Aplica una versión del plan (§5.3, §16.3): columnas, topes por rol, módulos incluidos y la
 * diferencia de módulos en cada empresa que tiene el plan EN ESTE MOMENTO (R17). Solo enciende lo
 * añadido y apaga lo quitado: las excepciones de cada empresa en los demás módulos no se tocan (P3).
 * La comparten la edición inmediata y el aplicador del cambio programado (T11). El ciclo de las
 * empresas no se toca (R38): no escribe `plan_ciclo_ancla_at`. SLT-86 (R15): tampoco su entrada, tipo ni
 * período; el precio nuevo les llega por el historial, desde su primer período que empiece en `precioDesde`.
 */
async function aplicarVersion(
  tx: Tx,
  antes: PlanDTO,
  version: VersionPlan,
  actor: ActorCongelado,
  /** SLT-86 (§1.2; R15): desde cuándo rige el precio nuevo, si la versión lo cambia. */
  precioDesde: Date,
  /**
   * SLT-128 (design §3.2; R10): al promover, cada empresa ya recibió sus módulos: repetirlos borraría las
   * excepciones de R4. El precio lo escribe aparte `escribirPrecioDelCambio`, como al recibir.
   */
  opciones: { sincronizarModulos: boolean; escribirPrecio: boolean } = { sincronizarModulos: true, escribirPrecio: true },
): Promise<void> {
  await tx.plan.update({
    where: { id: antes.id },
    data: {
      nombre: version.nombre,
      topeApiKeys: version.topes.apiKeys,
      ...columnasDelPrecio(version.precio),
      costoPorOrden: version.costoPorOrden,
      ...columnasDelPorcentual(version.costoPorOrdenPorcentual),
      // SLT-118 (R35, R36): ausente = sin cambio (Prisma no escribe un `undefined`). Las facturas en curso no
      // se tocan: cada una cierra con la periodicidad con la que se abrió.
      periodicidadOrdenes: version.periodicidadOrdenes,
    },
  });
  await guardarDescuentos(tx, antes.id, version.precio);
  // R15: el precio vigente y su fila del historial cambian juntos; sin cambio de precio, ninguna fila.
  if (opciones.escribirPrecio && cambiaElPrecio(diferenciasDelPlan(antes, { ...antes, ...version }))) {
    const vigente = (await leerPlan(tx, antes.id)) as PlanDTO;
    await escribirPrecioDelHistorial(tx, antes.id, precioDesde, vigente.precio);
  }
  await tx.planTopeRol.deleteMany({ where: { planId: antes.id } });
  await tx.planTopeRol.createMany({ data: filasDeTopes(version.topes).map((t) => ({ planId: antes.id, ...t })) });
  await tx.planModulo.deleteMany({ where: { planId: antes.id } });
  await tx.planModulo.createMany({ data: version.modulos.map((modulo) => ({ planId: antes.id, modulo })) });

  const anadidos = version.modulos.filter((m) => !antes.modulos.includes(m));
  const quitados = antes.modulos.filter((m) => !version.modulos.includes(m));
  if (!opciones.sincronizarModulos || (anadidos.length === 0 && quitados.length === 0)) return;
  const empresas = await tx.organizacion.findMany({
    where: { planId: antes.id },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  for (const empresa of empresas) {
    const entradas = await cambiarModulos(tx, empresa.id, anadidos, quitados);
    // Una llamada por empresa: sus filas de módulos comparten lote (SL-23).
    await appendAccion(
      tx,
      entradas.map((e): EntradaAccion => ({ ...e, ...actor })),
    );
  }
}

/** R40: borra el pendiente con su fila `cambio_cancelado`. `false` si no había ninguno. */
async function cancelarPendienteEnTx(
  tx: Tx,
  plan: { id: string; nombre: string },
  actorUsuarioId: string,
  actor: ActorCongelado,
): Promise<boolean> {
  const pendiente = await tx.planCambioProgramado.findUnique({
    where: { planId: plan.id },
    select: { id: true, vigenteDesde: true },
  });
  if (pendiente === null) return false;
  // SLT-128 (R20): a cada empresa se le anunció SU recepción; la cancelación habla de esa fecha. Se leen antes
  // de borrar el pendiente, que se las lleva en cascada.
  const recepciones = new Map(
    (await tx.planCambioRecepcion.findMany({ where: { cambioId: pendiente.id }, select: { empresaId: true, recibeAt: true } })).map(
      (r) => [r.empresaId, r.recibeAt],
    ),
  );
  await tx.planCambioProgramado.deleteMany({ where: { id: pendiente.id } });
  // R45 (§16.2): un `plan_aviso_correo` `cancelado` por cada empresa del plan, en esta transacción.
  // Sirve a cancelar a mano y a archivar (R40); reemplazar NO pasa por aquí (no lleva correo de
  // cancelación aparte). El envío va por la cola: un fallo del correo no deshace la cancelación.
  await encolarAvisos(
    tx,
    (await empresasDelPlan(tx, plan.id)).map((e) => ({
      organizacionId: e.id,
      dedupeKey: dedupeAviso(pendiente.id, "cancelado", e.id),
      payload: {
        cambioId: pendiente.id,
        planId: plan.id,
        planNombre: plan.nombre,
        tipo: "cancelado",
        cambios: {},
        vigenteDesde: (recepciones.get(e.id) ?? pendiente.vigenteDesde).toISOString(),
        reemplazaA: null,
        topesPasados: [],
      },
    })),
  );
  await escribirRastro(
    tx,
    plan,
    "cambio_cancelado",
    { vigenteDesde: { antes: pendiente.vigenteDesde.toISOString(), despues: null } },
    actorUsuarioId,
    actor,
  );
  return true;
}

/* -------------------------------------------------------------------------- */
/* Cambio programado (§16)                                                     */
/* -------------------------------------------------------------------------- */

/** El trabajo que aplica, como mucho 5 intentos (§16.3). */
const MAX_INTENTOS_APLICAR = 5;

/** `dedupe_key` del trabajo que aplica ESA programación (§16.2, paso 6). */
export function dedupeAplicarCambio(cambioId: string): string {
  return `plan_cambio:${cambioId}`;
}

/**
 * Outbox (§16.2, paso 6): el trabajo nace en la misma transacción que la programación, sin empresa
 * (`organizacion_id` NULL por el DEFAULT: aquí corre en plataforma). El payload lleva el plan para
 * poder cerrar el plan ANTES de leer el cambio (orden de cerrojos de §4.4) y el id de ESTA
 * programación: un trabajo de una programación reemplazada o cancelada no la encuentra (R39).
 */
async function encolarAplicacion(tx: Tx, cambio: CambioPendiente, vigenteDesde: Date): Promise<void> {
  await new JobRepository(tx).enqueue(
    "plan_aplicar_cambio",
    { planId: cambio.planId, cambioId: cambio.cambioId },
    { runAfter: vigenteDesde, dedupeKey: dedupeAplicarCambio(cambio.cambioId), maxIntentos: MAX_INTENTOS_APLICAR },
    tx,
  );
}

/* -------------------------------------------------------------------------- */
/* Correos del cambio (T12; §16.2 paso 6, §16.4; R41, R42, R45)                */
/* -------------------------------------------------------------------------- */

// SLT-128 (R21): los recordatorios ya no son del plan: cada empresa tiene los suyos, contados hasta su
// recepción (`fijarRecepciones`, `dedupeRecordatorio`).

/**
 * `dedupe_key` de un aviso: `plan_aviso:<cambioId|editId>:<tipo>:<organizacionId>` (§16.4). Impide
 * encolar dos veces el mismo aviso a la misma empresa (R42), aunque el recordatorio se repita.
 */
export function dedupeAviso(
  origenId: string,
  tipo: AvisoCorreoPlan["tipo"] | AvisoNoAplicadaPlan["tipo"],
  organizacionId: string,
): string {
  return `plan_aviso:${origenId}:${tipo}:${organizacionId}`;
}

/** Los topes pasados de UNA empresa, sin su id (el payload no lleva más de lo que pinta el correo). */
function topesDeLaEmpresa(avisos: readonly TopeExcedido[], organizacionId: string): AvisoCorreoPlan["topesPasados"] {
  return avisos
    .filter((a) => a.organizacionId === organizacionId)
    .map(({ empresa, tope, usados, maximo }) => ({ empresa, tope, usados, maximo }));
}

/**
 * Outbox de los avisos: un `plan_aviso_correo` por empresa destino, en la transacción que llama. El
 * `organizacion_id` del trabajo sale del DEFAULT de `jobs` (`app.organizacion_id`, SL-17 M4), así que
 * se fija la empresa de cada aviso antes de encolarlo y se deja como estaba al final: el resto de la
 * transacción de plataforma (y el `plan_aplicar_cambio`, sin empresa) no la ve. Es el patrón de
 * `OrganizacionRepository` al dar de alta una empresa.
 */
async function encolarAvisos(
  tx: Tx,
  avisos: readonly { organizacionId: string; dedupeKey: string; payload: AvisoCorreoPlan }[],
): Promise<void> {
  if (avisos.length === 0) return;
  const jobs = new JobRepository(tx);
  await encolarEnEmpresas(
    tx,
    avisos.map((a) => ({
      organizacionId: a.organizacionId,
      encolar: () => jobs.enqueue("plan_aviso_correo", { ...a.payload }, { dedupeKey: a.dedupeKey }, tx),
    })),
  );
}

/**
 * Encola cada trabajo con su empresa fijada en `app.organizacion_id` y deja el valor de antes al final.
 * Sin `finally` a propósito: si un encolado falla, la transacción ya está abortada y otra sentencia
 * taparía el error de verdad; el `set_config` es local a la transacción y se va con ella.
 */
async function encolarEnEmpresas(
  tx: Tx,
  trabajos: readonly { organizacionId: string; encolar: () => Promise<unknown> }[],
): Promise<void> {
  const [{ previa }] = await tx.$queryRaw<{ previa: string | null }[]>`
    SELECT current_setting('app.organizacion_id', true) AS "previa"`;
  for (const t of trabajos) {
    await tx.$executeRaw`SELECT set_config('app.organizacion_id', ${t.organizacionId}, true)`;
    await t.encolar();
  }
  await tx.$executeRaw`SELECT set_config('app.organizacion_id', ${previa ?? ""}, true)`;
}

/** Las empresas que tienen el plan AHORA, en orden estable. */
function empresasDelPlan(tx: Tx, planId: string): Promise<{ id: string; nombre: string }[]> {
  return tx.organizacion.findMany({ where: { planId }, orderBy: { id: "asc" }, select: { id: true, nombre: true } });
}

/** «Sistema (programado por <nombre>)», cortado a los 120 de `actor_nombre` (§16.3, paso 4). */
function actorDelAplicador(programadoPor: string): string {
  return `Sistema (programado por ${programadoPor})`.slice(0, 120);
}

/* -------------------------------------------------------------------------- */
/* SLT-128 (design §3, §4) — el cambio programado llega a cada empresa          */
/* -------------------------------------------------------------------------- */
// Durante un cambio a medias, empresas del mismo plan corren versiones distintas. La de una empresa vive en
// `plan_version_empresa` (sin fila = la del plan) y cada recepción en `plan_cambio_recepcion`. Las dos tablas son
// de plataforma: aquí se leen y escriben en `comoPlataforma`, con la empresa explícita en `empresa_id`.

/** Lo que hace falta del pendiente para recibirlo o promoverlo. */
const PENDIENTE_COMPLETO = {
  id: true,
  planId: true,
  vigenteDesde: true,
  version: true,
  actorUsuarioId: true,
  actorNombre: true,
} as const;

type PendienteCompleto = Prisma.PlanCambioProgramadoGetPayload<{ select: typeof PENDIENTE_COMPLETO }>;

/** Una versión con la periodicidad de órdenes siempre presente: así se guarda en `plan_version_empresa` (§1.2). */
type VersionCompleta = VersionPlan & { periodicidadOrdenes: PeriodicidadOrdenes };

/**
 * La versión del pendiente validada (§16.1) y completada: una programada antes de SLT-118 no trae la
 * periodicidad, que entonces es la del plan.
 */
function versionCompleta(version: Prisma.JsonValue, plan: PlanDTO): VersionCompleta {
  const v = versionPlanSchema.parse(version);
  // Ausente en el plan = el DEFAULT `quincenal` de la columna (SLT-118 R35).
  return { ...v, periodicidadOrdenes: v.periodicidadOrdenes ?? plan.periodicidadOrdenes ?? "quincenal" };
}

/** La versión propia de la empresa en ESE plan, o `null` si corre la del plan. */
async function versionPropiaDe(tx: Tx, organizacionId: string, planId: string): Promise<VersionPlan | null> {
  const fila = await tx.planVersionEmpresa.findUnique({
    where: { empresaId: organizacionId },
    select: { planId: true, version: true },
  });
  return fila === null || fila.planId !== planId ? null : versionPlanSchema.parse(fila.version);
}

/** El plan tal como lo corre una empresa: su versión propia sobre la fila del plan. */
function comoLaCorre(plan: PlanDTO, propia: VersionPlan | null): PlanDTO {
  if (propia === null) return plan;
  return { ...plan, ...propia, periodicidadOrdenes: propia.periodicidadOrdenes ?? plan.periodicidadOrdenes };
}

/** «Plan partido» (§1.2): alguna empresa corre una versión propia de este plan. */
async function planPartido(tx: Tx, planId: string): Promise<boolean> {
  return (await tx.planVersionEmpresa.findFirst({ where: { planId }, select: { empresaId: true } })) !== null;
}

/**
 * SLT-128 (§14.1; R28): una recepción PENDIENTE no está recibida ni «no aplicada». La no aplicada cuenta como
 * resuelta: no frena la promoción (R10, R18), el archivado (R15) ni el cierre (R9), y el barrido no la devuelve.
 */
const PENDIENTE = { recibidoAt: null, noAplicadaAt: null } as const;

/** Cuántas recepciones de ESA programación siguen pendientes (ni recibidas ni no aplicadas). */
function recepcionesSinRecibir(tx: Tx, cambioId: string): Promise<number> {
  return tx.planCambioRecepcion.count({ where: { cambioId, ...PENDIENTE } });
}

/**
 * SLT-128 (R8, R28): el motivo por el que una regla del plan impide aplicar `version` a una empresa con ese tipo
 * de cobro, o `null` si se puede. Hoy solo R8 (SLT-118 R37): la cuota del 16 no tendría factura que la emita.
 */
function motivoNoAplicable(tipoCobro: string, version: VersionCompleta): MotivoNoAplicada | null {
  return tipoCobro === "quincenal" && version.periodicidadOrdenes === "mensual" ? "cobro_quincenal_ordenes_mensuales" : null;
}

/** Un código leído de la base (lo acota el `CHECK` de `no_aplicada_motivo`). */
function comoMotivo(motivo: string | null): MotivoNoAplicada {
  const m = MOTIVOS_NO_APLICADA.find((x) => x === motivo);
  if (m === undefined) throw new Error(`no_aplicada_motivo desconocido: ${String(motivo)}`);
  return m;
}

/** La versión que corre el plan (su fila), con la forma de `plan_version_empresa` (§1.2). */
function versionDelPlan(plan: PlanDTO): VersionCompleta {
  return {
    nombre: plan.nombre,
    topes: plan.topes,
    modulos: plan.modulos,
    precio: plan.precio,
    costoPorOrden: plan.costoPorOrden,
    costoPorOrdenPorcentual: plan.costoPorOrdenPorcentual,
    periodicidadOrdenes: plan.periodicidadOrdenes ?? "quincenal",
  };
}

/**
 * SLT-128 (design §14.4; R28): el aviso de una recepción no aplicada, SIN empresa (`organizacion_id` NULL, como
 * `encolarAplicacion`): lo envía el manejador a cada dirección de `PLAN_CHANGE_ALERT_EMAILS`. Uno por recepción.
 */
async function encolarAvisoNoAplicada(tx: Tx, aviso: AvisoNoAplicadaPlan): Promise<void> {
  await new JobRepository(tx).enqueue(
    "plan_aviso_correo",
    { ...aviso },
    { dedupeKey: dedupeAviso(aviso.cambioId, "no_aplicada", aviso.empresaId) },
    tx,
  );
}

/** `dedupe_key` del `plan_aplicar_cambio` con empresa (§4): una por programación, empresa y fecha. */
export function dedupeRecepcion(cambioId: string, organizacionId: string, recibeAt: Date): string {
  return `plan_cambio:${cambioId}:${organizacionId}:${recibeAt.toISOString()}`;
}

/** `dedupe_key` de un recordatorio con empresa (§4; R22): uno por programación, empresa, fecha y días. */
export function dedupeRecordatorio(cambioId: string, organizacionId: string, recibeAt: Date, dias: DiasDeRecordatorio): string {
  return `plan_recordatorio:${cambioId}:${organizacionId}:${recibeAt.toISOString()}:${dias}`;
}

/**
 * El aviso de un recordatorio lleva la fecha de la recepción en la clave (§4; R19): si la recepción se mueve,
 * el de la fecha nueva sí sale.
 */
function dedupeAvisoRecordatorio(cambioId: string, tipo: AvisoCorreoPlan["tipo"], organizacionId: string, recibeAt: Date): string {
  return `${dedupeAviso(cambioId, tipo, organizacionId)}:${recibeAt.toISOString()}`;
}

const TIPO_DE_RECORDATORIO: Record<DiasDeRecordatorio, AvisoCorreoPlan["tipo"]> = {
  7: "recordatorio_7",
  3: "recordatorio_3",
  1: "recordatorio_1",
};

/**
 * Fija la recepción de cada empresa (la crea o le mueve la fecha, R19) y encola, CON la empresa, su
 * `plan_aplicar_cambio` en `recibe_at` y sus recordatorios contados desde `ahora` (R21). Los trabajos de una
 * fecha anterior no se borran: al correr no encuentran su `recibeAt` y no hacen nada.
 */
async function fijarRecepciones(
  tx: Tx,
  cambio: CambioPendiente,
  recepciones: readonly { organizacionId: string; recibeAt: Date }[],
  ahora: Date,
): Promise<void> {
  if (recepciones.length === 0) return;
  for (const r of recepciones) {
    await tx.planCambioRecepcion.upsert({
      where: { cambioId_empresaId: { cambioId: cambio.cambioId, empresaId: r.organizacionId } },
      create: { cambioId: cambio.cambioId, empresaId: r.organizacionId, recibeAt: r.recibeAt },
      update: { recibeAt: r.recibeAt },
    });
  }
  const jobs = new JobRepository(tx);
  await encolarEnEmpresas(
    tx,
    recepciones.map((r) => ({
      organizacionId: r.organizacionId,
      encolar: async () => {
        const recibeAt = r.recibeAt.toISOString();
        await jobs.enqueue(
          "plan_aplicar_cambio",
          { planId: cambio.planId, cambioId: cambio.cambioId, recibeAt },
          {
            runAfter: r.recibeAt,
            dedupeKey: dedupeRecepcion(cambio.cambioId, r.organizacionId, r.recibeAt),
            maxIntentos: MAX_INTENTOS_APLICAR,
          },
          tx,
        );
        for (const { dias, runAfter } of recordatoriosDe(ahora, r.recibeAt)) {
          await jobs.enqueue(
            "plan_recordatorio_cambio",
            { planId: cambio.planId, cambioId: cambio.cambioId, dias, recibeAt },
            { runAfter, dedupeKey: dedupeRecordatorio(cambio.cambioId, r.organizacionId, r.recibeAt, dias) },
            tx,
          );
        }
      },
    })),
  );
}

/**
 * R3: la fila del historial con `desde_at = F` si el precio del cambio no es el que el historial ya da en F. Se
 * compara con el historial y no con la fila del plan: tras un reemplazo (R13) el historial puede llevar ya el
 * precio de un cambio anterior que alguna empresa recibió. Si la fila ya está (la escribió otra recepción), se
 * queda.
 */
async function escribirPrecioDelCambio(tx: Tx, plan: PlanDTO, desde: Date, precio: PrecioPlan): Promise<void> {
  const [fila] = await tx.$queryRaw<{ precio_mensual: string | null; descuentos: unknown }[]>`
    SELECT "precio_mensual"::text AS "precio_mensual", "descuentos"
      FROM "plan_precio_historial"
     WHERE "plan_id" = ${plan.id} AND "desde_at" <= ${comoTimestamp(desde)}::timestamp
     ORDER BY "desde_at" DESC LIMIT 1`;
  const rige = fila === undefined ? plan.precio : precioDelHistorial(fila.precio_mensual, fila.descuentos);
  if (!cambiaElPrecio(diferenciasDelPlan({ ...plan, precio: rige }, { ...plan, precio }))) return;
  await escribirPrecioDelHistorial(tx, plan.id, desde, precio, "dejar");
}

/**
 * §3.2 (R10): con el plan ya en FOR UPDATE, el pendiente pasa a ser la versión del plan. Sin tocar los módulos
 * de ninguna empresa (cada una ya los recibió); se borran las versiones propias del plan, queda la fila
 * `cambio_aplicado` del rastro con quien lo programó y el pendiente desaparece (con sus recepciones).
 */
async function promoverEnTx(tx: Tx, pendiente: PendienteCompleto): Promise<void> {
  const antes = (await leerPlan(tx, pendiente.planId)) as PlanDTO;
  const version: VersionPlan = versionPlanSchema.parse(pendiente.version);
  // SLT-128 (§14.3; R28): las empresas con la recepción no aplicada conservan la versión que tenían.
  const noAplicadas = await tx.planCambioRecepcion.findMany({
    where: { cambioId: pendiente.id, noAplicadaAt: { not: null } },
    orderBy: { empresaId: "asc" },
    select: { empresaId: true, recibeAt: true, noAplicadaAt: true, noAplicadaMotivo: true },
  });
  // SLT-118 (R37): con las empresas de AHORA, salvo las no aplicadas (R28). Si ya no pasa, falla sin escribir
  // (cada recepción ya lo miró, R8).
  const quincenales = await empresasQuincenalesSiPasaAMensual(
    tx,
    antes,
    version,
    noAplicadas.map((r) => r.empresaId),
  );
  if (quincenales > 0) {
    throw new Error(
      `promover: el cambio ${pendiente.id} pasa el plan ${pendiente.planId} a órdenes mensuales y ${quincenales} empresa(s) lo tienen con tipo quincenal (R37)`,
    );
  }
  const cambios = diferenciasDelPlan(antes, { ...antes, ...version });
  if (hayCambios(cambios)) {
    await aplicarVersion(tx, antes, version, ACTOR_SISTEMA, pendiente.vigenteDesde, {
      sincronizarModulos: false,
      escribirPrecio: false,
    });
    await escribirPrecioDelCambio(tx, antes, pendiente.vigenteDesde, version.precio);
  }
  // R28: antes de borrar las versiones propias del plan, cada no aplicada se queda con la que tenía (su fila propia
  // o la del plan antes de promover), marcada con su motivo: el aviso del detalle sigue mientras la conserve.
  const conservan: string[] = [];
  for (const r of noAplicadas) {
    const propia = await tx.planVersionEmpresa.findUnique({
      where: { empresaId: r.empresaId },
      select: { planId: true, version: true, desdeAt: true },
    });
    const suya = propia !== null && propia.planId === pendiente.planId ? propia : null;
    const fila = {
      planId: pendiente.planId,
      cambioId: pendiente.id,
      version: (suya === null ? versionDelPlan(antes) : suya.version) as Prisma.InputJsonValue,
      desdeAt: suya === null ? r.recibeAt : suya.desdeAt,
      noAplicadaAt: r.noAplicadaAt,
      noAplicadaMotivo: r.noAplicadaMotivo,
    };
    await tx.planVersionEmpresa.upsert({ where: { empresaId: r.empresaId }, create: { empresaId: r.empresaId, ...fila }, update: fila });
    conservan.push(r.empresaId);
  }
  await tx.planVersionEmpresa.deleteMany({ where: { planId: pendiente.planId, empresaId: { notIn: conservan } } });
  await escribirRastro(
    tx,
    { id: pendiente.planId, nombre: version.nombre },
    "cambio_aplicado",
    cambios,
    pendiente.actorUsuarioId,
    { actorUsuarioId: pendiente.actorUsuarioId, actorNombre: actorDelAplicador(pendiente.actorNombre), actorRol: null },
  );
  // Ya no está pendiente: una segunda ejecución no lo encuentra. Sus recepciones se van en cascada.
  await tx.planCambioProgramado.deleteMany({ where: { id: pendiente.id } });
}

/**
 * R17 (P4): la empresa (ya en FOR UPDATE) entra a `plan` con efecto `desde`. Con un pendiente C: en F o después
 * entra con la versión de C (se escribe antes de `factura_plataforma_tomar_cambio`, que la lee); antes de F
 * entra con la del plan y recibe C en su recepción, con sus recordatorios desde `ahora` y sin correo de guardado
 * (P10 b). Devuelve los módulos con los que entra.
 */
async function entrarAlCambioEnTx(
  tx: Tx,
  organizacionId: string,
  plan: PlanDTO,
  tipoCobro: TipoCobro,
  desde: Date,
  ahora: Date,
): Promise<readonly ModuloApagable[]> {
  const pendiente = await tx.planCambioProgramado.findUnique({
    where: { planId: plan.id },
    select: { id: true, vigenteDesde: true, version: true },
  });
  if (pendiente === null) return plan.modulos;
  if (desde.getTime() >= pendiente.vigenteDesde.getTime()) {
    const version = versionCompleta(pendiente.version, plan);
    const fila = {
      planId: plan.id,
      cambioId: pendiente.id,
      version: version as Prisma.InputJsonValue,
      desdeAt: desde,
      noAplicadaAt: null,
      noAplicadaMotivo: null,
    };
    await tx.planVersionEmpresa.upsert({ where: { empresaId: organizacionId }, create: { empresaId: organizacionId, ...fila }, update: fila });
    return version.modulos;
  }
  await fijarRecepciones(
    tx,
    { planId: plan.id, cambioId: pendiente.id },
    [{ organizacionId, recibeAt: fechaDeRecepcion(tipoCobro, pendiente.vigenteDesde) }],
    ahora,
  );
  return plan.modulos;
}

/**
 * R18: la empresa (ya en FOR UPDATE) deja `planAntesId`. Se borran su versión propia y su recepción del pendiente
 * de ese plan; sus trabajos ya encolados no la encuentran. Si era la última sin recibirlo y F ya pasó, devuelve el
 * pendiente que hay que promover (R10), ya con el plan de antes en FOR UPDATE (después de la empresa, §6). Quien
 * llama lo promueve DESPUÉS de sacar a la empresa del plan: si no, la regla de R37 la seguiría contando.
 */
async function salirDelCambioEnTx(
  tx: Tx,
  organizacionId: string,
  planAntesId: string,
  ahora: Date,
): Promise<PendienteCompleto | null> {
  await tx.planVersionEmpresa.deleteMany({ where: { empresaId: organizacionId, planId: planAntesId } });
  const pendiente = await tx.planCambioProgramado.findUnique({
    where: { planId: planAntesId },
    select: { id: true, vigenteDesde: true },
  });
  if (pendiente === null) return null;
  await tx.planCambioRecepcion.deleteMany({ where: { cambioId: pendiente.id, empresaId: organizacionId } });
  // Sin bloquear el plan si no hay nada que promover: dos empresas que se cruzan de plan no se esperan.
  if (pendiente.vigenteDesde.getTime() > ahora.getTime() || (await recepcionesSinRecibir(tx, pendiente.id)) > 0) return null;
  await bloquearPlanParaEscribir(tx, planAntesId);
  // Bajo el cerrojo, ESE pendiente otra vez: otra transacción pudo promoverlo, cancelarlo o reemplazarlo.
  const vigente = await tx.planCambioProgramado.findFirst({
    where: { id: pendiente.id, planId: planAntesId },
    select: PENDIENTE_COMPLETO,
  });
  if (vigente === null || vigente.vigenteDesde.getTime() > ahora.getTime()) return null;
  return (await recepcionesSinRecibir(tx, vigente.id)) > 0 ? null : vigente;
}

/**
 * R19: con el mismo plan y otro tipo de cobro, una recepción sin recibir pasa al primer inicio de un período del
 * tipo nuevo que no sea anterior a F ni a `desde` (el efecto del cambio de tipo). Si ya rige en `desde` o antes,
 * no se mueve. Los recordatorios de la fecha nueva se cuentan desde `ahora`.
 */
async function moverRecepcionEnTx(
  tx: Tx,
  organizacionId: string,
  planId: string,
  tipoCobro: TipoCobro,
  desde: Date,
  ahora: Date,
): Promise<void> {
  const pendiente = await tx.planCambioProgramado.findUnique({
    where: { planId },
    select: { id: true, vigenteDesde: true, recepciones: { where: { empresaId: organizacionId, ...PENDIENTE }, select: { recibeAt: true } } },
  });
  const recepcion = pendiente?.recepciones[0];
  if (pendiente === null || recepcion === undefined) return;
  if (recepcion.recibeAt.getTime() <= desde.getTime()) return;
  const base = Math.max(pendiente.vigenteDesde.getTime(), desde.getTime());
  const recibeAt = fechaDeRecepcion(tipoCobro, new Date(base));
  if (recibeAt.getTime() === recepcion.recibeAt.getTime()) return;
  await fijarRecepciones(tx, { planId, cambioId: pendiente.id }, [{ organizacionId, recibeAt }], ahora);
}

/** R17: el plan con el que entra una empresa con efecto `desde`: la versión del pendiente si `desde ≥ F`. */
async function planAlEntrar(tx: Tx, plan: PlanDTO, desde: Date): Promise<PlanDTO> {
  const pendiente = await tx.planCambioProgramado.findUnique({
    where: { planId: plan.id },
    select: { vigenteDesde: true, version: true },
  });
  if (pendiente === null || desde.getTime() < pendiente.vigenteDesde.getTime()) return plan;
  return { ...plan, ...versionCompleta(pendiente.version, plan) };
}

/* -------------------------------------------------------------------------- */
/* Lecturas del superadmin (SLT-58, design §3.2)                               */
/* -------------------------------------------------------------------------- */

/** El rastro del detalle de un plan (R16) y el historial de asignaciones de una empresa (R21). */
const LIMITE_RASTRO = 100;
const LIMITE_ASIGNACIONES = 50;

/**
 * El pendiente con su versión validada por el mismo esquema que el aplicador (§16.1): una versión que
 * ya no pasa es un dato roto y se rechaza aquí, no se pinta a medias.
 */
function pendienteDe(c: { vigenteDesde: Date; version: Prisma.JsonValue } | null): CambioDelPlanLeido | null {
  return c === null ? null : { vigenteDesde: c.vigenteDesde, version: versionPlanSchema.parse(c.version) };
}

/**
 * SLT-128 (design §3.6; R11): el pendiente del detalle con «N de M»: de sus recepciones, cuántas ya se aplicaron
 * y cuántas tiene. Un plan sin empresas tiene 0 de 0.
 */
function pendienteDelDetalle(
  c: { vigenteDesde: Date; version: Prisma.JsonValue; recepciones: { recibidoAt: Date | null }[] } | null,
): PendienteDelDetalleLeido | null {
  const leido = pendienteDe(c);
  if (c === null || leido === null) return null;
  return { ...leido, recibidas: c.recepciones.filter((r) => r.recibidoAt !== null).length, total: c.recepciones.length };
}

type FilaNoAplicada = {
  empresaId: string;
  noAplicadaAt: Date | null;
  noAplicadaMotivo: string | null;
  empresa: { nombre: string };
};

/**
 * SLT-128 (design §14.3; R28): las empresas que no recibieron el cambio: las recepciones no aplicadas del pendiente
 * y las versiones conservadas por una no aplicada. Una por empresa (la del pendiente gana: es la más reciente), por
 * nombre. `desde` es el instante en que quedó no aplicada.
 */
function noAplicadasDelDetalle(
  recepciones: readonly FilaNoAplicada[],
  conservadas: readonly FilaNoAplicada[],
): NoAplicadaLeida[] {
  const porEmpresa = new Map<string, NoAplicadaLeida>();
  for (const f of [...conservadas, ...recepciones]) {
    if (f.noAplicadaAt === null) continue;
    porEmpresa.set(f.empresaId, {
      empresaId: f.empresaId,
      empresa: f.empresa.nombre,
      motivo: comoMotivo(f.noAplicadaMotivo),
      desde: f.noAplicadaAt,
    });
  }
  return [...porEmpresa.values()].sort((a, b) => a.empresa.localeCompare(b.empresa, "es") || a.empresaId.localeCompare(b.empresaId));
}

/**
 * SLT-128 (design §3.6; R12): el cambio programado como lo ve UNA empresa: con su recepción como fecha mientras
 * no lo reciba, y ninguno si ya lo recibió o no tiene recepción (entró con la versión nueva, R17).
 */
function cambioDeLaEmpresa(
  c: { version: Prisma.JsonValue; recepciones: { recibeAt: Date }[] } | null,
): CambioDelPlanLeido | null {
  const recepcion = c?.recepciones[0];
  if (c === null || recepcion === undefined) return null;
  return pendienteDe({ vigenteDesde: recepcion.recibeAt, version: c.version });
}

/** Crea el plan, sus topes y sus módulos, con su fila `creado` de `plan_rastro` (R1, R29), dentro de `tx`. */
async function crearEnTx(tx: Tx, input: CrearPlanInput, actorUsuarioId: string): Promise<string> {
  const { id } = await tx.plan.create({
    data: {
      nombre: input.nombre,
      visibilidad: input.visibilidad,
      organizacionExclusivaId: input.organizacionId,
      topeApiKeys: input.topes.apiKeys,
      ...columnasDelPrecio(input.precio),
      costoPorOrden: input.costoPorOrden,
      ...columnasDelPorcentual(input.costoPorOrdenPorcentual),
      // SLT-118 (R35): ausente = el DEFAULT `quincenal` de la columna.
      periodicidadOrdenes: input.periodicidadOrdenes,
      topesPorRol: { create: filasDeTopes(input.topes) },
      modulos: { create: input.modulos.map((modulo) => ({ modulo })) },
    },
    select: { id: true },
  });
  await guardarDescuentos(tx, id, input.precio);
  // SLT-86 (§1.2; R15): el precio de alta rige desde siempre, como la fila que sembró la migración.
  await escribirPrecioDelHistorial(tx, id, "siempre", input.precio);
  const creado: PlanDTO = {
    id,
    nombre: input.nombre,
    visibilidad: input.visibilidad,
    organizacionId: input.organizacionId,
    topes: input.topes,
    modulos: input.modulos,
    precio: input.precio,
    costoPorOrden: input.costoPorOrden,
    costoPorOrdenPorcentual: input.costoPorOrdenPorcentual,
    periodicidadOrdenes: input.periodicidadOrdenes ?? "quincenal",
    archivado: false,
  };
  const actor = await resolverActorCongelado(tx, actorUsuarioId);
  await escribirRastro(tx, creado, "creado", diferenciasDelPlan(null, creado), actorUsuarioId, actor);
  return id;
}

/**
 * SLT-58 (§11.4; R37) y ajuste planes-custom (D13): los topes que la empresa ya pasa contra unos topes
 * dados. Lectura, sin cerrojos ni escrituras. `null` si la empresa no existe. SLT-86 (R8): sin órdenes;
 * los de usuarios y API keys no dependen de la fecha, así que la vista previa ya no la recibe.
 */
async function vistaPreviaEnTx(tx: Tx, organizacionId: string, topes: TopesPlan): Promise<VistaPreviaLeida | null> {
  const empresa = await tx.organizacion.findUnique({ where: { id: organizacionId }, select: { id: true, nombre: true } });
  if (empresa === null) return null;
  return { avisos: await excedidosDe(tx, [empresa], topes) };
}

/* -------------------------------------------------------------------------- */
/* SLT-86 (design §5.1–§5.3) — cambios de empresa con fecha de efecto          */
/* -------------------------------------------------------------------------- */
// El pendiente vive en las columnas `plan_cambio_*` de `organizacion` (§1.3, A6): uno como mucho por
// empresa, todas o ninguna (CHECK `organizacion_plan_cambio_completo`). Reemplazar = escribir otro con
// un id nuevo; el trabajo del viejo no lo encuentra al correr (R20).

/** La empresa bajo su cerrojo, con lo vigente y el pendiente. */
interface EmpresaBloqueada {
  id: string;
  nombre: string;
  plan_id: string | null;
  plan_tipo_cobro: string;
  plan_cambio_id: string | null;
  plan_cambio_plan_id: string | null;
  plan_cambio_tipo_cobro: string | null;
  plan_cambio_desde_at: Date | null;
  plan_cambio_actor_id: string | null;
}

async function bloquearEmpresa(tx: Tx, organizacionId: string): Promise<EmpresaBloqueada | undefined> {
  const [empresa] = await tx.$queryRaw<EmpresaBloqueada[]>`
    SELECT "id", "nombre", "plan_id", "plan_tipo_cobro", "plan_cambio_id", "plan_cambio_plan_id",
           "plan_cambio_tipo_cobro", "plan_cambio_desde_at", "plan_cambio_actor_id"
      FROM "organizacion" WHERE "id" = ${organizacionId} FOR UPDATE`;
  return empresa;
}

/** `dedupe_key` del trabajo que aplica ESE pendiente de empresa (design §5.1, paso 4). */
export function dedupeCambioEmpresa(cambioId: string): string {
  return `plan_cambio_empresa:${cambioId}`;
}

const SIN_PENDIENTE = Prisma.sql`"plan_cambio_id" = NULL, "plan_cambio_plan_id" = NULL, "plan_cambio_tipo_cobro" = NULL,
       "plan_cambio_desde_at" = NULL, "plan_cambio_actor_id" = NULL`;

/**
 * Guarda el pendiente (reemplaza el que hubiera) y encola, en esta transacción, el trabajo que lo
 * aplicará a sus 00:00 (outbox). El trabajo va CON la empresa (`jobs.organizacion_id`), así que el
 * drenador lo corre en su contexto.
 */
async function escribirPendiente(
  tx: Tx,
  organizacionId: string,
  planId: string,
  tipoCobro: TipoCobro,
  desde: Date,
  actorUsuarioId: string,
): Promise<void> {
  const cambioId = randomUUID();
  await tx.$executeRaw`
    UPDATE "organizacion"
       SET "plan_cambio_id" = ${cambioId}, "plan_cambio_plan_id" = ${planId}, "plan_cambio_tipo_cobro" = ${tipoCobro},
           "plan_cambio_desde_at" = ${comoTimestamp(desde)}::timestamp, "plan_cambio_actor_id" = ${actorUsuarioId}
     WHERE "id" = ${organizacionId}`;
  await encolarEnEmpresas(tx, [
    {
      organizacionId,
      encolar: () =>
        new JobRepository(tx).enqueue(
          "plan_aplicar_cambio_empresa",
          { cambioId },
          { runAfter: desde, dedupeKey: dedupeCambioEmpresa(cambioId), maxIntentos: MAX_INTENTOS_APLICAR },
          tx,
        ),
    },
  ]);
}

/**
 * R31 (carrera) y R16 bajo el cerrojo: la fecha de inicio es de la primera asignación y la de efecto de
 * un cambio a una empresa con plan. El servicio ya lo miró; otra petición pudo asignar entre medias.
 */
function claseQueNoCasa(efecto: EfectoElegido, planActual: string | null): Extract<ResultadoAsignar, { estado: "validation_error" }> | null {
  if (efecto.clase === "inicio" && planActual !== null) {
    const campo = efecto.elegida ? "inicioCiclo" : "vigenteDesde";
    return { estado: "validation_error", fieldErrors: { [campo]: [efecto.elegida ? SOLO_PRIMERA_ASIGNACION : FECHA_DE_EFECTO_OBLIGATORIA] } };
  }
  if (efecto.clase === "cambio" && planActual === null) {
    return { estado: "validation_error", fieldErrors: { vigenteDesde: [SOLO_CON_PLAN] } };
  }
  return null;
}

type ResultadoDelCambio = Extract<ResultadoAsignar, { estado: "ok" | "tope_excedido" | "periodicidad_incompatible" }>;

/**
 * SLT-118 (design §3.1; R30, R31, R33; decisiones P7 y P9): la fecha de efecto real de un cambio del
 * superadmin. Solo un `"cambio"` se lleva; un `"inicio"` (primera asignación) rige el día elegido (R33, P8).
 * El tipo de referencia es el más largo entre el vigente y el nuevo (orden de `TIPOS_COBRO`): así un cambio a
 * un tipo más largo rige al inicio de un período del tipo nuevo (P9). Si la fecha ya es el primer día de un
 * período de ese tipo, se respeta (R31); si no, va al primer día del período siguiente (R30). El rango de
 * SLT-86 R16 no se vuelve a mirar: vale sobre la elegida (R34, P10).
 */
export function efectoAlInicioDelPeriodo(efecto: EfectoElegido, tipoVigente: TipoCobro, tipoNuevo: TipoCobro): EfectoElegido {
  if (efecto.clase !== "cambio") return efecto;
  const referencia = TIPOS_COBRO.indexOf(tipoNuevo) > TIPOS_COBRO.indexOf(tipoVigente) ? tipoNuevo : tipoVigente;
  if (inicioDelPeriodoCalendario(referencia, efecto.desde).getTime() === efecto.desde.getTime()) return efecto;
  const fecha = fechaDeEfectoPorDefecto(referencia, efecto.desde);
  return { ...efecto, fecha, desde: inicioDelDiaPlataforma(fecha) };
}


/** Ajuste planes-custom (D2): revierte la transacción de `crearYAsignar` llevando el rechazo afuera. */
class AsignacionRechazada extends Error {
  constructor(readonly resultado: Exclude<ResultadoAsignar, { estado: "ok" }>) {
    super(`crearYAsignar: la asignación se rechazó (${resultado.estado}); no se crea el plan`);
  }
}

/* -------------------------------------------------------------------------- */
/* El repositorio                                                              */
/* -------------------------------------------------------------------------- */

export class PlanesRepository implements IPlanesRepository, IPlanesDelMaestroRepository, IPlanesRecepcionesRepository {
  constructor(private readonly prisma: PlanesPrismaClient) {}

  empresa(organizacionId: string): Promise<EmpresaDePlanes | null> {
    return comoPlataforma("SL-24", "leer la empresa a la que el superadmin asigna un plan", () =>
      this.prisma.organizacion.findUnique({
        where: { id: organizacionId },
        select: { id: true, nombre: true, planId: true },
      }),
    );
  }

  plan(planId: string): Promise<PlanDTO | null> {
    return comoPlataforma("SL-24", "leer un plan del catálogo (superadmin)", async () => {
      const fila = await this.prisma.plan.findUnique({ where: { id: planId }, include: INCLUIR });
      return fila === null ? null : aDTO(fila);
    });
  }

  crear(input: CrearPlanInput, actorUsuarioId: string): Promise<string> {
    return comoPlataforma("SL-24", "crear un plan del catálogo (superadmin)", () =>
      this.prisma.$transaction((tx) => crearEnTx(tx, input, actorUsuarioId)),
    );
  }

  editar(planId: string, version: VersionPlan, actorUsuarioId: string, precioDesde: Date): Promise<ResultadoEdicion> {
    return comoPlataforma("SL-24", "editar un plan del catálogo de inmediato (superadmin)", () =>
      this.prisma.$transaction(async (tx): Promise<ResultadoEdicion> => {
        if (!(await bloquearPlanParaEscribir(tx, planId))) return { estado: "not_found" };
        const antes = (await leerPlan(tx, planId)) as PlanDTO;
        if (antes.archivado) return { estado: "archivado" };
        // SLT-128 (R16, P7): con el plan partido, aplicar «a todas en el acto» dejaría a cada empresa en una
        // versión que nadie programó. Se pide programarlo con fecha.
        if (await planPartido(tx, planId)) return { estado: "cambio_a_medias" };
        const cambios = diferenciasDelPlan(antes, { ...antes, ...version });
        if (!hayCambios(cambios)) return { estado: "ok", cambio: false, avisos: [] };
        // SLT-118 (R37): a mensual con alguna empresa quincenal, se rechaza sin escribir.
        const quincenales = await empresasQuincenalesSiPasaAMensual(tx, antes, version);
        if (quincenales > 0) return { estado: "periodicidad_incompatible", empresas: quincenales };

        // R16 (revisado el 2026-10-28): ya no se rechaza. Se guarda y se avisa de quién ya pasa un
        // tope; desde ahora sus altas que pasen el tope las rechazan los triggers.
        const empresas = await empresasDelPlan(tx, planId);
        const avisos = await excedidosDe(tx, empresas, version.topes);
        const actor = await resolverActorCongelado(tx, actorUsuarioId);
        await aplicarVersion(tx, antes, version, actor, precioDesde);
        const editId = await escribirRastro(tx, { id: planId, nombre: version.nombre }, "editado", cambios, actorUsuarioId, actor);
        // R41 (§16.4): un correo de guardado por empresa del plan, en esta transacción. La clave lleva
        // el id de la fila `editado` de `plan_rastro` (no hay programación).
        await encolarAvisos(
          tx,
          empresas.map((e) => ({
            organizacionId: e.id,
            dedupeKey: dedupeAviso(editId, "guardado", e.id),
            payload: {
              cambioId: null,
              planId,
              planNombre: antes.nombre,
              tipo: "guardado",
              cambios,
              vigenteDesde: null,
              reemplazaA: null,
              topesPasados: topesDeLaEmpresa(avisos, e.id),
            },
          })),
        );
        return { estado: "ok", cambio: true, avisos };
      }),
    );
  }

  archivar(planId: string, actorUsuarioId: string): Promise<ResultadoArchivar> {
    return comoPlataforma("SL-24", "archivar un plan del catálogo (superadmin)", () =>
      this.prisma.$transaction(async (tx): Promise<ResultadoArchivar> => {
        // SLT-86 (R21): las empresas con un pendiente hacia el plan, ANTES que el plan (empresa → plan,
        // el orden de `asignar`). Un pendiente que llegue después de este cerrojo espera al del plan y
        // encuentra el plan archivado.
        const conPendiente = await tx.$queryRaw<EmpresaBloqueada[]>`
          SELECT "id", "nombre", "plan_id", "plan_tipo_cobro", "plan_cambio_id", "plan_cambio_plan_id",
                 "plan_cambio_tipo_cobro", "plan_cambio_desde_at", "plan_cambio_actor_id"
            FROM "organizacion" WHERE "plan_cambio_plan_id" = ${planId} ORDER BY "id" FOR UPDATE`;
        if (!(await bloquearPlanParaEscribir(tx, planId))) return { estado: "not_found" };
        const plan = (await leerPlan(tx, planId)) as PlanDTO;
        if (plan.archivado) return { estado: "ok", cambio: false };
        // SLT-128 (R15; sustituye SL-24 R40): con un pendiente que aún no llegó a todas sus empresas no se archiva.
        // Sin recepciones (plan sin empresas) se cancela como antes, más abajo.
        const pendiente = await tx.planCambioProgramado.findUnique({ where: { planId }, select: { id: true } });
        if (pendiente !== null && (await recepcionesSinRecibir(tx, pendiente.id)) > 0) return { estado: "cambio_a_medias" };
        // Las empresas lo conservan y los triggers no miran `archivado_at`: siguen topadas (R6).
        await tx.plan.update({ where: { id: planId }, data: { archivadoAt: new Date() } });
        const actor = await resolverActorCongelado(tx, actorUsuarioId);
        const cambios = diferenciasDelPlan(plan, { ...plan, archivado: true });
        await escribirRastro(tx, plan, "archivado", cambios, actorUsuarioId, actor);
        await cancelarPendienteEnTx(tx, plan, actorUsuarioId, actor);
        // SLT-86 (R21): esas empresas siguen como estaban; una primera asignación pendiente, sin plan. Sus
        // trabajos ya encolados no encuentran su `cambioId` al correr. Cada una deja su fila de cancelación
        // con quien archiva (decisión del 2026-11-05).
        for (const empresa of conPendiente) await this.cancelarPendienteDeEmpresaEnTx(tx, empresa, actor);
        return { estado: "ok", cambio: true };
      }),
    );
  }

  async asignar(
    organizacionId: string,
    planId: string,
    actorUsuarioId: string,
    efecto: EfectoElegido,
    tipoCobro: TipoCobro,
    ahora: Date,
  ): Promise<ResultadoAsignar> {
    return comoPlataforma("SL-24", "asignar un plan a una empresa (superadmin)", () =>
      this.prisma.$transaction((tx) => this.asignarEnTx(tx, organizacionId, planId, actorUsuarioId, efecto, tipoCobro, ahora)),
    );
  }

  crearYAsignar(
    input: CrearPlanInput & { organizacionId: string },
    actorUsuarioId: string,
    asignacion: AsignacionAlCrear,
    ahora: Date,
  ): Promise<ResultadoCrearYAsignar> {
    // Ajuste planes-custom (D2): crear el custom y asignarlo es UNA transacción. Cualquier rechazo de la
    // asignación (topes, R31 bajo cerrojo…) la revierte entera: ni plan, ni rastro, ni historial.
    return comoPlataforma("SL-24", "crear un plan custom y asignarlo a su empresa (superadmin)", async () => {
      try {
        return await this.prisma.$transaction(async (tx): Promise<ResultadoCrearYAsignar> => {
          // La empresa primero (§4.4): el mismo orden que `asignar`, que la vuelve a pedir (ya es nuestra).
          const empresa = await tx.$queryRaw<{ id: string }[]>`
            SELECT "id" FROM "organizacion" WHERE "id" = ${input.organizacionId} FOR UPDATE`;
          if (empresa.length === 0) return { estado: "not_found" };
          const planId = await crearEnTx(tx, input, actorUsuarioId);
          const r = await this.asignarEnTx(
            tx,
            input.organizacionId,
            planId,
            actorUsuarioId,
            asignacion.efecto,
            asignacion.tipoCobro,
            ahora,
          );
          if (r.estado !== "ok") throw new AsignacionRechazada(r);
          return { estado: "ok", planId, avisos: r.avisos, pendiente: r.pendiente, vigenteDesde: r.vigenteDesde };
        });
      } catch (e) {
        if (e instanceof AsignacionRechazada) return e.resultado;
        throw e;
      }
    });
  }

  /**
   * Asigna o cambia el plan de una empresa (§5.2; R9–R13; SLT-86 §5.1) dentro de `tx`. La comparten
   * `asignar` y `crearYAsignar` (ajuste planes-custom D2): un rechazo devuelve su resultado sin haber
   * escrito nada, y quien abrió la transacción decide si la confirma o la revierte. Recibe la `tx` como
   * primer parámetro: el `appendAccion` no puede caer fuera de la transacción de quien la abrió.
   */
  private async asignarEnTx(
    tx: Tx,
    organizacionId: string,
    planId: string,
    actorUsuarioId: string,
    efecto: EfectoElegido,
    tipoCobro: TipoCobro,
    ahora: Date,
  ): Promise<ResultadoAsignar> {
    const empresa = await bloquearEmpresa(tx, organizacionId);
    const bloqueado = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "plan" WHERE "id" = ${planId} FOR SHARE`;
    if (empresa === undefined || bloqueado.length === 0) return { estado: "not_found" };
    const plan = (await leerPlan(tx, planId)) as PlanDTO;
    if (plan.archivado) return { estado: "archivado" };
    if (plan.visibilidad === "custom" && plan.organizacionId !== organizacionId) {
      return { estado: "custom_de_otra_empresa" };
    }
    const noCasa = claseQueNoCasa(efecto, empresa.plan_id);
    if (noCasa !== null) return noCasa;
    return this.cambiarEmpresaEnTx(tx, empresa, plan, tipoCobro, efecto, actorUsuarioId, ahora);
  }

  vistaPreviaAsignacion(organizacionId: string, planId: string): Promise<VistaPreviaLeida | null> {
    // SLT-58 (§11.4; R37): lectura, sin cerrojos ni escrituras. El mismo uso (`excedidosDe`) que
    // `asignar`, así que avisa lo mismo; la autoridad sigue siendo el trigger.
    return comoPlataforma("SL-24", "vista previa de la primera asignación de un plan (superadmin, SLT-58)", () =>
      this.prisma.$transaction(async (tx): Promise<VistaPreviaLeida | null> => {
        const plan = await leerPlan(tx, planId);
        if (plan === null) return null;
        return vistaPreviaEnTx(tx, organizacionId, plan.topes);
      }),
    );
  }

  vistaPreviaConTopes(organizacionId: string, topes: TopesPlan): Promise<VistaPreviaLeida | null> {
    // Ajuste planes-custom (D13): la misma lectura que `vistaPreviaAsignacion`, con los topes del form del
    // custom en vez de los de un plan guardado. Lo que avisa es lo que avisará `crearYAsignar`.
    return comoPlataforma("SL-24", "vista previa de un plan custom antes de crearlo (superadmin, ajuste planes-custom)", () =>
      this.prisma.$transaction((tx) => vistaPreviaEnTx(tx, organizacionId, topes)),
    );
  }

  cambiarTipoCobro(
    organizacionId: string,
    tipoCobro: TipoCobro,
    efecto: EfectoElegido,
    actorUsuarioId: string,
    ahora: Date,
  ): Promise<ResultadoCambiarTipoCobro> {
    // Ajuste planes-custom (D10) y SLT-86 (R16–R19): el tipo de cobro del plan que la empresa ya tiene, con
    // fecha de efecto. Mismo orden de cerrojos que `asignar` (empresa FOR UPDATE → plan FOR SHARE).
    return comoPlataforma("SL-24", "cambiar el tipo de cobro del plan de una empresa (superadmin)", () =>
      this.prisma.$transaction(async (tx): Promise<ResultadoCambiarTipoCobro> => {
        const empresa = await bloquearEmpresa(tx, organizacionId);
        if (empresa === undefined) return { estado: "not_found" };
        if (empresa.plan_id === null) return { estado: "sin_plan" };
        await tx.$queryRaw`SELECT "id" FROM "plan" WHERE "id" = ${empresa.plan_id} FOR SHARE`;
        // La FK de `organizacion.plan_id` impide que el plan no exista.
        const plan = await leerPlan(tx, empresa.plan_id);
        if (plan === null) throw new Error(`cambiarTipoCobro: el plan de ${organizacionId} no existe`);
        const r = await this.cambiarEmpresaEnTx(tx, empresa, plan, tipoCobro, efecto, actorUsuarioId, ahora);
        // SLT-118 (R37): quincenal con el plan de órdenes mensuales de la empresa; nada se escribió.
        if (r.estado === "periodicidad_incompatible") return r;
        // Con el mismo plan no se miran topes, así que no puede rechazarse por uno.
        if (r.estado !== "ok") throw new Error(`cambiarTipoCobro: rechazo imposible (${r.estado}) para ${organizacionId}`);
        return { estado: "ok", cambio: r.cambio, pendiente: r.pendiente, vigenteDesde: r.vigenteDesde };
      }),
    );
  }

  /**
   * §5.1, pasos 2–4, con la empresa ya bajo el cerrojo y el plan revalidado.
   *   · SLT-118 (R37, P12): tipo quincenal con un plan de órdenes mensuales se rechaza sin escribir. Cubre
   *     asignar, `crearYAsignar` y `cambiarTipoCobro`.
   *   · R19: mismo plan y mismo tipo que rigen → cancela el pendiente, con su fila de cancelación
   *     (decisión del 2026-11-05), o no hace nada si no lo hay.
   *   · SLT-118 (R30, R31): un `"cambio"` se lleva al inicio de un período del tipo de referencia
   *     (`efectoAlInicioDelPeriodo`); desde aquí todo usa la fecha real, también el pendiente, su trabajo y
   *     el historial. La primera asignación no se toca (R33).
   *   · Fecha futura → pendiente y avisos, sin rechazar (R18); `vigenteDesde` es la fecha real (R32).
   *   · Fecha de hoy o pasada → se aplica. Un tope ya pasado rechaza un cambio de plan (R18, SL-24 R12) y
   *     la primera asignación sin fecha (SLT-58 P14); la primera asignación con fecha se asigna y avisa
   *     (SLT-58 R36, R42). Cambiar solo el tipo no mira topes: el plan es el mismo.
   */
  private async cambiarEmpresaEnTx(
    tx: Tx,
    empresa: EmpresaBloqueada,
    plan: PlanDTO,
    tipoCobro: TipoCobro,
    elegido: EfectoElegido,
    actorUsuarioId: string,
    ahora: Date,
  ): Promise<ResultadoDelCambio> {
    // 1. SLT-118 (R37, P12): la cuota del 16 no tendría factura que la emita. Con el plan leído bajo el cerrojo.
    if (tipoCobro === "quincenal" && plan.periodicidadOrdenes === "mensual") return { estado: "periodicidad_incompatible" };
    // 2. R19: lo pedido ya es lo que rige.
    if (empresa.plan_id === plan.id && empresa.plan_tipo_cobro === tipoCobro) {
      if (empresa.plan_cambio_id === null) return { estado: "ok", cambio: false, avisos: [], pendiente: false };
      await this.cancelarPendienteDeEmpresaEnTx(tx, empresa, await resolverActorCongelado(tx, actorUsuarioId));
      return { estado: "ok", cambio: true, avisos: [], pendiente: false };
    }
    // 3. SLT-118 (R30, R31, R33): la fecha real, bajo el cerrojo (el tipo vigente es el de la empresa ahora).
    const efecto = efectoAlInicioDelPeriodo(elegido, tipoCobroSchema.parse(empresa.plan_tipo_cobro), tipoCobro);
    // SLT-128 (R17): quien entra en la F del pendiente del plan o después entra con esa versión; la periodicidad
    // (R37) y los topes se miran contra ella.
    const queRige = empresa.plan_id === plan.id ? plan : await planAlEntrar(tx, plan, efecto.desde);
    if (tipoCobro === "quincenal" && queRige.periodicidadOrdenes === "mensual") return { estado: "periodicidad_incompatible" };
    // 4. Pendiente o en el acto, con la fecha real.
    const excedidos = empresa.plan_id === plan.id ? [] : await excedidosDe(tx, [empresa], queRige.topes);
    if (efecto.desde.getTime() > ahora.getTime()) {
      await escribirPendiente(tx, empresa.id, plan.id, tipoCobro, efecto.desde, actorUsuarioId);
      return { estado: "ok", cambio: true, avisos: excedidos, pendiente: true, vigenteDesde: fechaCalendarioPlataforma(efecto.desde) };
    }
    const avisa = efecto.clase === "inicio" && efecto.elegida;
    if (!avisa && excedidos.length > 0) return { estado: "tope_excedido", excedidos };
    await this.aplicarEnTx(tx, empresa, plan, tipoCobro, efecto.desde, await resolverActorCongelado(tx, actorUsuarioId), ahora);
    return { estado: "ok", cambio: true, avisos: avisa ? excedidos : [], pendiente: false };
  }

  /**
   * Aplica un cambio de empresa (§5.2, pasos 2–4): plan, tipo y entrada a las 00:00 de la fecha, sin
   * pendiente; los módulos del plan si cambió el plan (con el mismo plan no se tocan: borraría las
   * excepciones de SL-23, R11); y la fila del historial con `actor`. `plan_asignado` si cambió el plan;
   * si no, `plan_tipo_cobro_cambiado` (D16). El `valor_nuevo` lleva la fecha delante del tipo (R30).
   *
   * SLT-128 (design §3.5; R17–R19): el punto común para entrar, salir y cambiar de tipo con un pendiente del
   * plan. Sale del de antes (R18), entra al nuevo con su versión o con su recepción (R17) o mueve su recepción
   * (R19). `ahora` cuenta los recordatorios de una recepción nueva o movida.
   */
  private async aplicarEnTx(
    tx: Tx,
    empresa: Pick<EmpresaBloqueada, "id" | "plan_id" | "plan_tipo_cobro">,
    plan: PlanDTO,
    tipoCobro: TipoCobro,
    desde: Date,
    actor: ActorCongelado,
    ahora: Date,
  ): Promise<void> {
    const entra = empresa.plan_id !== plan.id;
    const aPromover = entra && empresa.plan_id !== null ? await salirDelCambioEnTx(tx, empresa.id, empresa.plan_id, ahora) : null;
    if (!entra) await moverRecepcionEnTx(tx, empresa.id, plan.id, tipoCobro, desde, ahora);
    // Antes de `tomar_cambio`: la factura que abre lee el nombre y la periodicidad de la versión de la empresa.
    const modulosAlEntrar = entra ? await entrarAlCambioEnTx(tx, empresa.id, plan, tipoCobro, desde, ahora) : plan.modulos;
    // SLT-118 (design §2.3; R15–R17, R28): las facturas de la plataforma toman el cambio ANTES del UPDATE,
    // con la empresa ya en FOR UPDATE: la función sabe si es una primera asignación por `plan_id IS NULL`.
    // Solo fija y marca facturas no cerradas; no cierra ni depende del reloj.
    await tx.$executeRaw`
      SELECT factura_plataforma_tomar_cambio(${empresa.id}, ${comoTimestamp(desde)}::timestamp, ${plan.id}, ${tipoCobro})`;
    await tx.$executeRaw`
      UPDATE "organizacion"
         SET "plan_id" = ${plan.id}, "plan_tipo_cobro" = ${tipoCobro}, "plan_ciclo_ancla_at" = ${comoTimestamp(desde)}::timestamp,
             ${SIN_PENDIENTE}
       WHERE "id" = ${empresa.id}`;
    // SLT-128 (R18): era la última del plan de antes sin recibir su pendiente, y F ya pasó.
    if (aPromover !== null) await promoverEnTx(tx, aPromover);
    const comun = {
      entidadTipo: "plan",
      entidadId: plan.id,
      entidadEtiqueta: etiquetaDeEntidad("plan", { nombre: plan.nombre }),
      valorNuevo: valorDelHistorialDeAsignacion(fechaCalendarioPlataforma(desde), tipoCobro),
      organizacionId: empresa.id,
      ...actor,
    } as const;
    if (empresa.plan_id === plan.id) {
      await appendAccion(tx, [
        { ...comun, accion: "plan_tipo_cobro_cambiado", valorAnterior: tipoCobroSchema.parse(empresa.plan_tipo_cobro) },
      ]);
      return;
    }
    const modulos = await sincronizarModulos(tx, empresa.id, modulosAlEntrar);
    // Una sola llamada: el `plan_asignado` y las filas de módulos comparten `lote_id` (§9).
    await appendAccion(tx, [
      { ...comun, accion: "plan_asignado", valorAnterior: null },
      ...modulos.map((e): EntradaAccion => ({ ...e, ...actor })),
    ]);
  }

  cancelarCambioEmpresa(organizacionId: string, actorUsuarioId: string): Promise<ResultadoCancelarCambio> {
    return comoPlataforma("SL-24", "cancelar el cambio pendiente de una empresa (superadmin, SLT-86)", () =>
      this.prisma.$transaction(async (tx): Promise<ResultadoCancelarCambio> => {
        const empresa = await bloquearEmpresa(tx, organizacionId);
        if (empresa === undefined) return { estado: "not_found" };
        if (empresa.plan_cambio_id === null) return { estado: "sin_cambio_programado" };
        // El trabajo encolado no encuentra su `cambioId` al correr.
        await this.cancelarPendienteDeEmpresaEnTx(tx, empresa, await resolverActorCongelado(tx, actorUsuarioId));
        return { estado: "ok" };
      }),
    );
  }

  /**
   * SLT-86 (design §5.3; R19, R21; decisión del humano del 2026-11-05): el único punto que cancela el
   * pendiente de una empresa, ya bajo su cerrojo y con un pendiente. Lo limpia y deja en su historial la
   * fila `plan_cambio_empresa_cancelado` con `actor`: el plan del pendiente y, en `valor_nuevo`, la fecha de
   * efecto y el tipo que no llegaron a regir, con el formato de las asignaciones. Recibe la `tx` de quien
   * abrió la transacción («Cancelar cambio», la petición igual a lo vigente o el archivado del plan).
   */
  private async cancelarPendienteDeEmpresaEnTx(tx: Tx, empresa: EmpresaBloqueada, actor: ActorCongelado): Promise<void> {
    // El CHECK `organizacion_plan_cambio_completo` garantiza las cinco columnas con el id.
    const planId = empresa.plan_cambio_plan_id as string;
    const desde = empresa.plan_cambio_desde_at as Date;
    const tipoCobro = tipoCobroSchema.parse(empresa.plan_cambio_tipo_cobro);
    const plan = await tx.plan.findUnique({ where: { id: planId }, select: { nombre: true } });
    if (plan === null) throw new Error(`cancelarPendienteDeEmpresaEnTx: el plan ${planId} del pendiente no existe`);
    await tx.$executeRaw`UPDATE "organizacion" SET ${SIN_PENDIENTE} WHERE "id" = ${empresa.id}`;
    await appendAccion(tx, [
      {
        accion: "plan_cambio_empresa_cancelado",
        entidadTipo: "plan",
        entidadId: planId,
        entidadEtiqueta: etiquetaDeEntidad("plan", { nombre: plan.nombre }),
        valorAnterior: null,
        valorNuevo: valorDelHistorialDeAsignacion(fechaCalendarioPlataforma(desde), tipoCobro),
        organizacionId: empresa.id,
        ...actor,
      },
    ]);
  }

  aplicarCambioDeEmpresa(cambio: CambioDeEmpresaPendiente, ahora: Date): Promise<ResultadoAplicar> {
    return comoPlataforma("SL-24", "aplicar el cambio pendiente de una empresa (trabajo de la cola, SLT-86)", () =>
      this.prisma.$transaction(async (tx): Promise<ResultadoAplicar> => {
        // ESE pendiente, por su id (R20): reemplazado, cancelado o ya aplicado no está.
        const empresa = await bloquearEmpresa(tx, cambio.organizacionId);
        if (empresa === undefined || empresa.plan_cambio_id !== cambio.cambioId) return { estado: "sin_pendiente" };
        // El CHECK `organizacion_plan_cambio_completo` garantiza las cinco columnas con el id.
        const planId = empresa.plan_cambio_plan_id as string;
        const desde = empresa.plan_cambio_desde_at as Date;
        // Reloj adelantado del trabajo: no se adelanta el cambio; lo recoge el barrido.
        if (desde.getTime() > ahora.getTime()) return { estado: "aun_no_rige" };
        await tx.$queryRaw`SELECT "id" FROM "plan" WHERE "id" = ${planId} FOR SHARE`;
        const plan = await leerPlan(tx, planId);
        if (plan === null) throw new Error(`aplicarCambioDeEmpresa: el plan ${planId} del pendiente no existe`);
        // R18: un tope ya pasado no lo impide (SLT-58 R36). R20: el historial lo firma quien lo programó.
        const actor = await resolverActorCongelado(tx, empresa.plan_cambio_actor_id);
        await this.aplicarEnTx(tx, empresa, plan, tipoCobroSchema.parse(empresa.plan_cambio_tipo_cobro), desde, actor, ahora);
        return { estado: "aplicado" };
      }),
    );
  }

  cambiosDeEmpresaVencidos(ahora: Date): Promise<CambioDeEmpresaPendiente[]> {
    return comoPlataforma("SL-24", "barrer los cambios de empresa vencidos (trabajo de la cola, SLT-86)", async () => {
      const filas = await this.prisma.organizacion.findMany({
        where: { planCambioDesdeAt: { lte: ahora } },
        orderBy: [{ planCambioDesdeAt: "asc" }, { id: "asc" }],
        select: { id: true, planCambioId: true },
      });
      return filas.flatMap((f) => (f.planCambioId === null ? [] : [{ organizacionId: f.id, cambioId: f.planCambioId }]));
    });
  }

  cancelarCambio(planId: string, actorUsuarioId: string): Promise<ResultadoCancelarCambioDelPlan> {
    return comoPlataforma("SL-24", "cancelar el cambio programado de un plan (superadmin)", () =>
      this.prisma.$transaction(async (tx): Promise<ResultadoCancelarCambioDelPlan> => {
        if (!(await bloquearPlanParaEscribir(tx, planId))) return { estado: "not_found" };
        // SLT-128 (R14; P1, P8): alguna empresa ya lo recibió, o recibió uno anterior que este reemplazó. Cancelar
        // dejaría el plan partido para siempre: se pide programar otro cambio con los valores de antes.
        if (await planPartido(tx, planId)) return { estado: "cambio_a_medias" };
        const plan = (await leerPlan(tx, planId)) as PlanDTO;
        const actor = await resolverActorCongelado(tx, actorUsuarioId);
        const cancelado = await cancelarPendienteEnTx(tx, plan, actorUsuarioId, actor);
        return cancelado ? { estado: "ok" } : { estado: "sin_cambio_programado" };
      }),
    );
  }

  programarCambio(
    planId: string,
    version: VersionPlan,
    vigenteDesde: Date,
    actorUsuarioId: string,
    ahora: Date,
  ): Promise<ResultadoProgramar> {
    return comoPlataforma("SL-24", "programar un cambio de un plan del catálogo (superadmin)", () =>
      this.prisma.$transaction(async (tx): Promise<ResultadoProgramar> => {
        // SLT-128 (design §6): las empresas del plan FOR SHARE ANTES que el plan (empresa → plan). Un cambio de
        // tipo en vuelo (empresa FOR UPDATE) termina antes y la recepción se calcula con su tipo.
        await tx.$queryRaw`SELECT "id" FROM "organizacion" WHERE "plan_id" = ${planId} ORDER BY "id" FOR SHARE`;
        // 1. Cerrojo del plan (§4.4): espera a las altas en vuelo, a otra edición y al aplicador.
        if (!(await bloquearPlanParaEscribir(tx, planId))) return { estado: "not_found" };
        const vigente = (await leerPlan(tx, planId)) as PlanDTO;
        if (vigente.archivado) return { estado: "archivado" };
        const pendiente = await tx.planCambioProgramado.findUnique({
          where: { planId },
          select: { id: true, vigenteDesde: true },
        });
        // 2. La versión vigente sin pendiente: nada que programar ni que registrar.
        const cambios = diferenciasDelPlan(vigente, { ...vigente, ...version });
        if (!hayCambios(cambios) && pendiente === null) return { estado: "ok", cambio: false, avisos: [], cambioId: null };
        // SLT-118 (R37): a mensual con alguna empresa quincenal, se rechaza sin escribir (al aplicarla se repite).
        const quincenales = await empresasQuincenalesSiPasaAMensual(tx, vigente, version);
        if (quincenales > 0) return { estado: "periodicidad_incompatible", empresas: quincenales };

        // 3. R16 (revisado): con el uso de HOY contra los topes nuevos; se avisa, no se rechaza. SLT-128: las
        // empresas de AHORA, releídas bajo el cerrojo del plan (una asignación que lo esperaba ya entró), con su tipo.
        const empresas = await tx.$queryRaw<{ id: string; nombre: string; plan_tipo_cobro: string }[]>`
          SELECT "id", "nombre", "plan_tipo_cobro" FROM "organizacion" WHERE "plan_id" = ${planId} ORDER BY "id"`;
        const avisos = await excedidosDe(tx, empresas, version.topes);
        const actor = await resolverActorCongelado(tx, actorUsuarioId);
        const despues = vigenteDesde.toISOString();
        // SLT-128 (R20): la recepción anterior de cada empresa que aún no lo había recibido, para su «reemplaza
        // al previsto para…». Antes de borrar el pendiente, que se las lleva en cascada.
        const anteriores = new Map<string, Date>(
          pendiente === null
            ? []
            : (
                await tx.planCambioRecepcion.findMany({
                  where: { cambioId: pendiente.id, ...PENDIENTE },
                  select: { empresaId: true, recibeAt: true },
                })
              ).map((r) => [r.empresaId, r.recibeAt]),
        );

        // 4. R39: un solo pendiente por plan. Reemplazar = borrar y crear otro con id nuevo; los trabajos del
        // viejo no se tocan: al correr no encuentran su `cambioId` (§16.3). SLT-128 (R13): sus recepciones se van
        // en cascada (quien no lo recibió ya no lo recibe) y las versiones propias se quedan (no se deshace).
        if (pendiente !== null) {
          await tx.planCambioProgramado.deleteMany({ where: { id: pendiente.id } });
          await escribirRastro(
            tx,
            vigente,
            "cambio_reemplazado",
            { vigenteDesde: { antes: pendiente.vigenteDesde.toISOString(), despues } },
            actorUsuarioId,
            actor,
          );
        }

        // 5. La programación y su fila (R43): qué cambia respecto de la vigente, y desde cuándo.
        const { id: cambioId } = await tx.planCambioProgramado.create({
          data: {
            planId,
            vigenteDesde,
            version: version as Prisma.InputJsonValue,
            avisosAlProgramar: avisos as unknown as Prisma.InputJsonValue,
            actorUsuarioId,
            actorNombre: nombreDelActor(actor),
          },
          select: { id: true },
        });
        await escribirRastro(
          tx,
          vigente,
          "cambio_programado",
          { ...cambios, vigenteDesde: { antes: null, despues } },
          actorUsuarioId,
          actor,
        );

        // 6. Outbox, en esta misma transacción. El trabajo sin empresa en F solo promueve el plan (§3.2).
        await encolarAplicacion(tx, { planId, cambioId }, vigenteDesde);
        // SLT-128 (R1, R21): la recepción de cada empresa según su tipo, con su trabajo y sus recordatorios.
        const recepciones = empresas.map((e) => ({
          organizacionId: e.id,
          recibeAt: fechaDeRecepcion(tipoCobroSchema.parse(e.plan_tipo_cobro), vigenteDesde),
        }));
        await fijarRecepciones(tx, { planId, cambioId }, recepciones, ahora);
        // SLT-128 (R20; sustituye R41 y R45 por plan): un correo de guardado por empresa con SU recepción, lo que
        // cambia respecto de SU versión (la propia, si recibió uno anterior) y la recepción a la que reemplaza.
        const propias = new Map(
          (await tx.planVersionEmpresa.findMany({ where: { planId }, select: { empresaId: true, version: true } })).map(
            (v) => [v.empresaId, versionPlanSchema.parse(v.version)],
          ),
        );
        await encolarAvisos(
          tx,
          recepciones.map((r) => {
            const suya = comoLaCorre(vigente, propias.get(r.organizacionId) ?? null);
            return {
              organizacionId: r.organizacionId,
              dedupeKey: dedupeAviso(cambioId, "guardado", r.organizacionId),
              payload: {
                cambioId,
                planId,
                planNombre: suya.nombre,
                tipo: "guardado",
                cambios: diferenciasDelPlan(suya, { ...suya, ...version }),
                vigenteDesde: r.recibeAt.toISOString(),
                reemplazaA: anteriores.get(r.organizacionId)?.toISOString() ?? null,
                topesPasados: topesDeLaEmpresa(avisos, r.organizacionId),
              },
            };
          }),
        );
        return { estado: "ok", cambio: true, avisos, cambioId };
      }),
    );
  }

  aplicarCambioProgramado(cambio: CambioPendiente, ahora: Date): Promise<ResultadoAplicar> {
    return comoPlataforma("SL-24", "aplicar el cambio programado de un plan (trabajo de la cola)", () =>
      this.prisma.$transaction(async (tx): Promise<ResultadoAplicar> => {
        // 1. El plan primero (§4.4): las altas en vuelo terminan contra la versión vieja y las
        // siguientes cuentan contra la nueva (R24).
        if (!(await bloquearPlanParaEscribir(tx, cambio.planId))) return { estado: "sin_pendiente" };
        // 2. ESTA programación, por su id (R39): reemplazada, cancelada o ya aplicada no está.
        const pendiente = await tx.planCambioProgramado.findFirst({
          where: { id: cambio.cambioId, planId: cambio.planId },
          select: PENDIENTE_COMPLETO,
        });
        if (pendiente === null) return { estado: "sin_pendiente" };
        // Reloj adelantado del trabajo: no se adelanta el cambio; lo recoge el barrido.
        if (pendiente.vigenteDesde.getTime() > ahora.getTime()) return { estado: "aun_no_rige" };
        // 3. SLT-128 (design §3.2; R10): el plan pasa a la versión nueva cuando la recibe la última de sus empresas.
        // Hasta entonces no hace nada; lo promoverá la última recepción. Sin empresas, promueve en F, como antes.
        if ((await recepcionesSinRecibir(tx, pendiente.id)) > 0) return { estado: "espera" };
        await promoverEnTx(tx, pendiente);
        return { estado: "aplicado" };
      }),
    );
  }

  recibirCambio(cambio: CambioPendiente, organizacionId: string, ahora: Date): Promise<ResultadoRecibir> {
    return comoPlataforma("SL-24", "recibir el cambio programado de un plan en una empresa (trabajo de la cola, SLT-128)", () =>
      this.prisma.$transaction(async (tx): Promise<ResultadoRecibir> => {
        // 1. design §6: empresa FOR UPDATE → plan FOR UPDATE. Un alta (empresa y plan FOR SHARE) espera, y la
        // siguiente cuenta contra los topes nuevos (SL-24 R24). Una empresa que ya dejó el plan no lo recibe (R18).
        const empresa = await bloquearEmpresa(tx, organizacionId);
        if (empresa === undefined || empresa.plan_id !== cambio.planId) return { estado: "sin_pendiente" };
        if (!(await bloquearPlanParaEscribir(tx, cambio.planId))) return { estado: "sin_pendiente" };
        // ESTA programación y SU recepción (R5): reemplazada, cancelada o ya recibida no está.
        const pendiente = await tx.planCambioProgramado.findFirst({
          where: { id: cambio.cambioId, planId: cambio.planId },
          select: PENDIENTE_COMPLETO,
        });
        if (pendiente === null) return { estado: "sin_pendiente" };
        const clave = { cambioId_empresaId: { cambioId: pendiente.id, empresaId: organizacionId } };
        const recepcion = await tx.planCambioRecepcion.findUnique({
          where: clave,
          select: { recibeAt: true, recibidoAt: true, noAplicadaAt: true },
        });
        // R28: una no aplicada ya está resuelta; ni el trabajo ni el barrido la vuelven a intentar.
        if (recepcion === null || recepcion.recibidoAt !== null || recepcion.noAplicadaAt !== null) return { estado: "sin_pendiente" };
        // Reloj por detrás de la recepción: no se adelanta; lo recoge el barrido (R5).
        if (recepcion.recibeAt.getTime() > ahora.getTime()) return { estado: "aun_no_rige" };

        // 2. La versión del pendiente, completada con la periodicidad del plan si no la trae.
        const plan = (await leerPlan(tx, cambio.planId)) as PlanDTO;
        const version = versionCompleta(pendiente.version, plan);
        // 3. R8, R28 (§14.3): una regla del plan impide aplicársela. No se escribe nada de la versión (ni módulos,
        // ni precio, ni versión propia): la recepción queda «no aplicada» con su motivo, sale el aviso a la lista
        // de alertas y, si era la última pendiente y F ya pasó, el plan se promueve igual (cuenta como resuelta).
        // El trabajo termina sin error. Un error de base o de red sigue lanzando y la cola reintenta.
        const motivo = motivoNoAplicable(empresa.plan_tipo_cobro, version);
        if (motivo !== null) {
          await tx.planCambioRecepcion.update({ where: clave, data: { noAplicadaAt: ahora, noAplicadaMotivo: motivo } });
          await encolarAvisoNoAplicada(tx, {
            tipo: "no_aplicada",
            planId: plan.id,
            cambioId: pendiente.id,
            empresaId: organizacionId,
            empresa: empresa.nombre,
            plan: plan.nombre,
            recibeAt: recepcion.recibeAt.toISOString(),
            motivo,
          });
          if (pendiente.vigenteDesde.getTime() <= ahora.getTime() && (await recepcionesSinRecibir(tx, pendiente.id)) === 0) {
            await promoverEnTx(tx, pendiente);
          }
          return { estado: "no_aplicada", motivo };
        }
        // 4. R4: los módulos contra la versión que ELLA tenía, solo en ella; sus excepciones no se tocan. El
        // historial de SL-23 lo firma el sistema, en un solo lote.
        const tenia = comoLaCorre(plan, await versionPropiaDe(tx, organizacionId, plan.id));
        const entradas = await cambiarModulos(
          tx,
          organizacionId,
          version.modulos.filter((m) => !tenia.modulos.includes(m)),
          tenia.modulos.filter((m) => !version.modulos.includes(m)),
        );
        await appendAccion(
          tx,
          entradas.map((e): EntradaAccion => ({ ...e, ...ACTOR_SISTEMA })),
        );
        // 5. R3: el precio rige desde F en el historial del plan; cada empresa lo toma en su primer período desde F.
        await escribirPrecioDelCambio(tx, plan, pendiente.vigenteDesde, version.precio);
        // 6. R2: su versión propia, que leen los triggers, la tarifa, «Mi plan» y la factura. Sin tocar el ciclo (R5).
        // R28: sin la marca de una no aplicada anterior: el aviso del detalle se va solo.
        const fila = {
          planId: plan.id,
          cambioId: pendiente.id,
          version: version as Prisma.InputJsonValue,
          desdeAt: recepcion.recibeAt,
          noAplicadaAt: null,
          noAplicadaMotivo: null,
        };
        await tx.planVersionEmpresa.upsert({
          where: { empresaId: organizacionId },
          create: { empresaId: organizacionId, ...fila },
          update: fila,
        });
        await tx.planCambioRecepcion.update({ where: clave, data: { recibidoAt: ahora } });
        // 7. R10: era la última y F ya pasó → el plan se promueve en esta misma transacción.
        if (pendiente.vigenteDesde.getTime() <= ahora.getTime() && (await recepcionesSinRecibir(tx, pendiente.id)) === 0) {
          await promoverEnTx(tx, pendiente);
        }
        return { estado: "aplicado" };
      }),
    );
  }

  recepcionesVencidas(ahora: Date): Promise<RecepcionPendiente[]> {
    return comoPlataforma("SL-24", "barrer las recepciones vencidas de los cambios programados (trabajo de la cola, SLT-128)", async () => {
      const filas = await this.prisma.planCambioRecepcion.findMany({
        where: { ...PENDIENTE, recibeAt: { lte: ahora } },
        orderBy: [{ recibeAt: "asc" }, { cambioId: "asc" }, { empresaId: "asc" }],
        select: { cambioId: true, empresaId: true, cambio: { select: { planId: true } } },
      });
      return filas.map((f) => ({ planId: f.cambio.planId, cambioId: f.cambioId, organizacionId: f.empresaId }));
    });
  }

  repartirRecordatorioDeEmpresa(
    cambio: CambioPendiente,
    organizacionId: string,
    dias: DiasDeRecordatorio,
    recibeAt: Date,
  ): Promise<ResultadoRecordatorio> {
    return comoPlataforma("SL-24", "encolar el recordatorio de un cambio programado a una empresa (trabajo de la cola, SLT-128)", () =>
      this.prisma.$transaction(async (tx): Promise<ResultadoRecordatorio> => {
        // design §6: empresa → plan, los dos FOR SHARE: espera a una recepción, un cambio de tipo, una salida, una
        // cancelación o un reemplazo en vuelo, y lee lo que dejaron.
        const [empresa] = await tx.$queryRaw<{ id: string; nombre: string; plan_id: string | null }[]>`
          SELECT "id", "nombre", "plan_id" FROM "organizacion" WHERE "id" = ${organizacionId} FOR SHARE`;
        if (empresa === undefined || empresa.plan_id !== cambio.planId) return { estado: "sin_pendiente" };
        await tx.$queryRaw`SELECT "id" FROM "plan" WHERE "id" = ${cambio.planId} FOR SHARE`;
        const pendiente = await tx.planCambioProgramado.findFirst({
          where: { id: cambio.cambioId, planId: cambio.planId },
          select: { id: true, version: true },
        });
        if (pendiente === null) return { estado: "sin_pendiente" };
        // R22: ya recibida, o movida a otra fecha (R19): este recordatorio ya no avisa de nada.
        const recepcion = await tx.planCambioRecepcion.findUnique({
          where: { cambioId_empresaId: { cambioId: pendiente.id, empresaId: organizacionId } },
          select: { recibeAt: true, recibidoAt: true, noAplicadaAt: true },
        });
        // R28: tampoco si quedó «no aplicada».
        if (
          recepcion === null ||
          recepcion.recibidoAt !== null ||
          recepcion.noAplicadaAt !== null ||
          recepcion.recibeAt.getTime() !== recibeAt.getTime()
        ) {
          return { estado: "sin_pendiente" };
        }
        const plan = (await leerPlan(tx, cambio.planId)) as PlanDTO;
        const version: VersionPlan = versionPlanSchema.parse(pendiente.version);
        const suya = comoLaCorre(plan, await versionPropiaDe(tx, organizacionId, plan.id));
        // R22 (SL-24 R42): los topes que la empresa ya pasa AHORA contra la versión que recibirá.
        const excedidos = await excedidosDe(tx, [empresa], version.topes);
        const tipo = TIPO_DE_RECORDATORIO[dias];
        await encolarAvisos(tx, [
          {
            organizacionId,
            dedupeKey: dedupeAvisoRecordatorio(pendiente.id, tipo, organizacionId, recibeAt),
            payload: {
              cambioId: pendiente.id,
              planId: cambio.planId,
              planNombre: suya.nombre,
              tipo,
              cambios: diferenciasDelPlan(suya, { ...suya, ...version }),
              vigenteDesde: recibeAt.toISOString(),
              reemplazaA: null,
              topesPasados: topesDeLaEmpresa(excedidos, organizacionId),
            },
          },
        ]);
        return { estado: "repartido", empresas: 1 };
      }),
    );
  }

  cambiosVencidos(ahora: Date): Promise<CambioPendiente[]> {
    return comoPlataforma("SL-24", "barrer los cambios programados vencidos (trabajo de la cola)", async () => {
      const filas = await this.prisma.planCambioProgramado.findMany({
        where: { vigenteDesde: { lte: ahora } },
        orderBy: [{ vigenteDesde: "asc" }, { id: "asc" }],
        select: { id: true, planId: true },
      });
      return filas.map((f) => ({ planId: f.planId, cambioId: f.id }));
    });
  }

  repartirRecordatorio(cambio: CambioPendiente, dias: 7 | 1): Promise<ResultadoRecordatorio> {
    return comoPlataforma("SL-24", "repartir el recordatorio de un cambio programado (trabajo de la cola)", () =>
      this.prisma.$transaction(async (tx): Promise<ResultadoRecordatorio> => {
        // El plan primero (§4.4): espera a una cancelación, un reemplazo o un aplicador en vuelo.
        if (!(await bloquearPlanParaEscribir(tx, cambio.planId))) return { estado: "sin_pendiente" };
        // R39 (mutación 9): solo ESTA programación. Cancelada, reemplazada o ya aplicada no avisa.
        const pendiente = await tx.planCambioProgramado.findUnique({
          where: { planId: cambio.planId },
          select: { id: true, vigenteDesde: true, version: true },
        });
        if (pendiente === null || pendiente.id !== cambio.cambioId) return { estado: "sin_pendiente" };

        const version: VersionPlan = versionPlanSchema.parse(pendiente.version);
        const vigente = (await leerPlan(tx, cambio.planId)) as PlanDTO;
        const cambios = diferenciasDelPlan(vigente, { ...vigente, ...version });
        // SLT-128 (R24): queda para los trabajos sin empresa encolados antes del despliegue. Solo a las empresas
        // que tienen el plan AHORA y aún no lo recibieron, cada una con SU recepción como fecha (R42: sus topes
        // pasados contra la versión pendiente).
        const recepciones = new Map(
          (
            await tx.planCambioRecepcion.findMany({
              where: { cambioId: pendiente.id, ...PENDIENTE },
              select: { empresaId: true, recibeAt: true },
            })
          ).map((r) => [r.empresaId, r.recibeAt]),
        );
        const empresas = (await empresasDelPlan(tx, cambio.planId)).filter((e) => recepciones.has(e.id));
        const excedidos = await excedidosDe(tx, empresas, version.topes);
        const tipo = dias === 7 ? "recordatorio_7" : "recordatorio_1";
        await encolarAvisos(
          tx,
          empresas.map((e) => ({
            organizacionId: e.id,
            dedupeKey: dedupeAviso(pendiente.id, tipo, e.id),
            payload: {
              cambioId: pendiente.id,
              planId: cambio.planId,
              planNombre: vigente.nombre,
              tipo,
              cambios,
              vigenteDesde: (recepciones.get(e.id) as Date).toISOString(),
              reemplazaA: null,
              topesPasados: topesDeLaEmpresa(excedidos, e.id),
            },
          })),
        );
        return { estado: "repartido", empresas: empresas.length };
      }),
    );
  }

  destinatariosDelAviso(organizacionId: string, cambioPendiente: string | null): Promise<DestinatariosDelAviso | null> {
    return comoPlataforma("SL-24", "leer los maestros activos a los que avisar de un cambio de plan (trabajo de la cola)", async () => {
      // §16.4, paso 2: un recordatorio de una programación que ya no está pendiente no se envía.
      if (cambioPendiente !== null) {
        const sigue = await this.prisma.planCambioProgramado.findUnique({ where: { id: cambioPendiente }, select: { id: true } });
        if (sigue === null) return null;
      }
      const empresa = await this.prisma.organizacion.findUnique({ where: { id: organizacionId }, select: { nombre: true } });
      if (empresa === null) return null;
      // P7: todos los maestros activos de la empresa, filtrados a mano (plataforma no filtra).
      const maestros = await this.prisma.usuario.findMany({
        where: { organizacionId, estado: "activo", rol: { value: "maestro" } },
        orderBy: { id: "asc" },
        select: { email: true, nombre: true },
      });
      return { empresaNombre: empresa.nombre, maestros };
    });
  }

  asignables(organizacionId: string): Promise<PlanDTO[]> {
    return comoPlataforma("SL-24", "listar los planes asignables a una empresa (superadmin)", async () => {
      const filas = await this.prisma.plan.findMany({
        where: {
          archivadoAt: null,
          OR: [{ visibilidad: "publico" }, { visibilidad: "custom", organizacionExclusivaId: organizacionId }],
        },
        include: INCLUIR,
        orderBy: [{ nombre: "asc" }, { id: "asc" }],
      });
      return filas.map(aDTO);
    });
  }

  preciosQueRigenDesde(planIds: readonly string[], desde: Date): Promise<PrecioDesdeLeido[]> {
    if (planIds.length === 0) return Promise.resolve([]);
    return comoPlataforma("SL-24", "leer los precios que regirán a los planes asignables (superadmin, SLT-86)", () =>
      this.prisma.$transaction(async (tx): Promise<PrecioDesdeLeido[]> => {
        const ids = [...planIds];
        // R15 (§1.2): la fila con el mayor `desde_at <= desde` (la que rige a esa hora) y las posteriores. El
        // `-infinity` del alta sale como NULL: no cabe en un `Date`.
        const filas = await tx.$queryRaw<
          { plan_id: string; desde: Date | null; precio_mensual: string | null; descuentos: unknown }[]
        >`
          SELECT h."plan_id", CASE WHEN isfinite(h."desde_at") THEN h."desde_at" END AS "desde",
                 h."precio_mensual"::text AS "precio_mensual", h."descuentos"
            FROM "plan_precio_historial" h
           WHERE h."plan_id" = ANY(${ids}::text[])
             AND h."desde_at" >= COALESCE((SELECT max(v."desde_at") FROM "plan_precio_historial" v
                                            WHERE v."plan_id" = h."plan_id" AND v."desde_at" <= ${comoTimestamp(desde)}::timestamp),
                                          '-infinity'::timestamp)
           ORDER BY h."plan_id", h."desde_at"`;
        // §1.2: un precio programado entra en el historial al aplicarse, desde las 00:00 de su `vigente_desde`.
        // Hasta entonces solo está en la versión pendiente; se suma detrás, como lo dejará el aplicador.
        const pendientes = await tx.planCambioProgramado.findMany({
          where: { planId: { in: ids } },
          select: { planId: true, vigenteDesde: true, version: true },
        });
        return [
          ...filas.map((f) => ({
            planId: f.plan_id,
            desde: f.desde,
            precio: precioDelHistorial(f.precio_mensual, f.descuentos),
            programado: false,
          })),
          ...pendientes.map((p) => ({
            planId: p.planId,
            desde: p.vigenteDesde,
            precio: precioPlanSchema.parse((p.version as { precio?: unknown } | null)?.precio),
            programado: true,
          })),
        ];
      }),
    );
  }

  /* ------------------------------------------------------------------------ */
  /* SLT-58 (design §3.2): las lecturas del superadmin. No escriben (R25).     */
  /* ------------------------------------------------------------------------ */

  catalogo(): Promise<PlanDelCatalogoLeido[]> {
    return comoPlataforma("SL-24", "leer el catálogo de planes con sus empresas (superadmin, SLT-58)", async () => {
      const filas = await this.prisma.plan.findMany({
        include: {
          ...INCLUIR,
          organizacionExclusiva: { select: { nombre: true } },
          cambioProgramado: { select: { vigenteDesde: true } },
          _count: { select: { empresas: true } },
        },
        orderBy: [{ nombre: "asc" }, { id: "asc" }],
      });
      return filas.map((f) => ({
        plan: aDTO(f),
        empresaNombre: f.organizacionExclusiva?.nombre ?? null,
        empresas: f._count.empresas,
        vigenteDesdePendiente: f.cambioProgramado?.vigenteDesde ?? null,
      }));
    });
  }

  detalle(planId: string): Promise<DetallePlanLeido | null> {
    return comoPlataforma("SL-24", "leer el detalle de un plan con su rastro (superadmin, SLT-58)", async () => {
      const fila = await this.prisma.plan.findUnique({
        where: { id: planId },
        include: {
          ...INCLUIR,
          organizacionExclusiva: { select: { nombre: true } },
          // SLT-128 (R11): sus recepciones, para «N de M empresas ya lo recibieron».
          cambioProgramado: {
            select: {
              vigenteDesde: true,
              version: true,
              // SLT-128 (R28): las no aplicadas cuentan en `total` pero no en `recibidas`, y van a `noAplicadas`.
              recepciones: {
                select: {
                  recibidoAt: true,
                  empresaId: true,
                  noAplicadaAt: true,
                  noAplicadaMotivo: true,
                  empresa: { select: { nombre: true } },
                },
              },
            },
          },
          empresas: { select: { id: true, nombre: true }, orderBy: [{ nombre: "asc" }, { id: "asc" }] },
          // SLT-128 (§14.3; R28): las versiones que sus empresas conservan por una no aplicada, ya promovido el plan.
          versionesDeEmpresa: {
            where: { noAplicadaAt: { not: null } },
            select: { empresaId: true, noAplicadaAt: true, noAplicadaMotivo: true, empresa: { select: { nombre: true } } },
          },
        },
      });
      if (fila === null) return null;
      // Usa el índice `(plan_id, created_at)`. El `id` solo desempata: las filas de una misma
      // operación (reemplazar y programar) comparten `created_at`.
      const rastro = await this.prisma.planRastro.findMany({
        where: { planId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: LIMITE_RASTRO,
        select: { id: true, accion: true, cambios: true, actorNombre: true, createdAt: true },
      });
      return {
        plan: aDTO(fila),
        empresaNombre: fila.organizacionExclusiva?.nombre ?? null,
        pendiente: pendienteDelDetalle(fila.cambioProgramado),
        noAplicadas: noAplicadasDelDetalle(fila.cambioProgramado?.recepciones ?? [], fila.versionesDeEmpresa),
        empresas: fila.empresas,
        rastro: rastro.map((r) => ({
          id: r.id,
          accion: r.accion,
          // Lo escribió `escribirRastro` con `diferenciasDelPlan`: `{ campo: { antes, despues } }`.
          cambios: r.cambios as CambiosDelPlan,
          actorNombre: r.actorNombre,
          creadoAt: r.createdAt,
        })),
      };
    });
  }

  planDeEmpresa(organizacionId: string): Promise<PlanDeEmpresaLeida | null> {
    return comoPlataforma("SL-24", "leer el plan, el uso y las asignaciones de una empresa (superadmin, SLT-58)", () =>
      this.prisma.$transaction(async (tx): Promise<PlanDeEmpresaLeida | null> => {
        const empresa = await tx.organizacion.findUnique({
          where: { id: organizacionId },
          select: {
            planCicloAnclaAt: true,
            planTipoCobro: true,
            plan: {
              include: {
                ...INCLUIR,
                // SLT-128 (R12): el pendiente del plan con SU recepción si aún no lo recibió.
                cambioProgramado: {
                  select: {
                    vigenteDesde: true,
                    version: true,
                    recepciones: { where: { empresaId: organizacionId, ...PENDIENTE }, select: { recibeAt: true } },
                  },
                },
              },
            },
            // SLT-86 (§3.3; R26): el pendiente de la empresa. El superadmin no pasa por la lectura acotada:
            // lee las columnas directamente, como el resto del detalle. El actor no sale de aquí.
            planCambioTipoCobro: true,
            planCambioDesdeAt: true,
            planCambioPlanId: true,
          },
        });
        if (empresa === null) return null;
        // Plataforma no filtra por empresa: el `organizacionId` va explícito (R21).
        const asignaciones = await tx.historialAccion.findMany({
          // D16: el cambio de solo el tipo (D10) tiene su propia acción y sigue siendo una fila del historial.
          where: { organizacionId, accion: { in: [...ACCIONES_DE_ASIGNACION] } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: LIMITE_ASIGNACIONES,
          select: {
            createdAt: true,
            actorNombre: true,
            entidadEtiqueta: true,
            accion: true,
            valorAnterior: true,
            valorNuevo: true,
          },
        });
        const lista = asignaciones.map((a): AsignacionLeida => ({
          creadoAt: a.createdAt,
          actorNombre: a.actorNombre,
          planNombre: a.entidadEtiqueta,
          // D14, D16: el tipo de cobro de cada fila y si fue un cambio de solo el tipo (D10).
          accion: comoAccionDeAsignacion(a.accion),
          valorAnterior: a.valorAnterior,
          valorNuevo: a.valorNuevo,
        }));
        const { plan } = empresa;
        // El CHECK `organizacion_plan_cambio_completo` deja las columnas juntas, o ninguna. El nombre del plan
        // que entra va en otra consulta, después: dos relaciones hermanas serían dos consultas a la vez sobre
        // la conexión de la transacción (ficha 450).
        const planQueEntra =
          empresa.planCambioPlanId === null
            ? null
            : await tx.plan.findUnique({ where: { id: empresa.planCambioPlanId }, select: { nombre: true } });
        const pendiente =
          planQueEntra === null || empresa.planCambioTipoCobro === null || empresa.planCambioDesdeAt === null
            ? null
            : pendienteDeEmpresa(planQueEntra.nombre, empresa.planCambioTipoCobro, empresa.planCambioDesdeAt);
        // R26 sin plan: la primera asignación pendiente, para «Sin límites» y «{Plan} empieza a regir el {fecha}».
        if (plan === null) return { organizacionId, plan: null, pendienteSinPlan: pendiente, asignaciones: lista };

        // El CHECK de 20261028130000 impide un plan sin entrada.
        const entrada = empresa.planCicloAnclaAt;
        if (entrada === null) throw new Error(`planDeEmpresa: la empresa ${organizacionId} tiene plan y no entrada`);
        // SLT-128 (R2, R12): durante un cambio a medias, la versión que corre ESTA empresa (la propia, si ya lo
        // recibió). Aparte de la consulta de la empresa, como el plan que entra (ficha 450).
        const dto = comoLaCorre(aDTO(plan), await versionPropiaDe(tx, organizacionId, plan.id));
        const uso = await usoDe(tx, organizacionId);
        // SLT-66 (R18, §3.2): la misma función que el trigger del cargo, para que el detalle diga lo que
        // cobrará la próxima orden. El enum va como texto: el driver no conoce el tipo de Postgres.
        // SLT-83 (R22, R23): con su modo (porcentaje y mínimo).
        const [tarifa] = await tx.$queryRaw<TarifaLeida[]>`
          SELECT "monto"::text AS "monto", "fuente"::text AS "fuente",
                 "porcentaje"::text AS "porcentaje", "minimo"::text AS "minimo"
          FROM cobro_plataforma_tarifa_de(${organizacionId})`;
        if (tarifa === undefined) throw new Error(`planDeEmpresa: sin tarifa vigente para ${organizacionId}`);
        // SLT-83 (R24): la misma función y el mismo inicio de ciclo que `plan_de_la_empresa` («Mi plan»).
        // SLT-86 (§3.3; R7, R15, R28): el inicio es el del período en curso de calendario; con él se cuentan
        // las órdenes del período (`usoDe` ya no las cuenta, R8) y se elige el precio del período: la fila del
        // historial con el mayor `desde_at` que no pase de ese inicio. `desde_at` no sale de la consulta:
        // `-infinity` no cabe en un `DateTime`.
        const [periodo] = await tx.$queryRaw<
          { cobrado: string; pendientes: number; ordenes: number; precio_mensual: string | null; descuentos: unknown }[]
        >`
          SELECT c."cobrado"::text AS "cobrado", c."pendientes", plan_uso_ordenes(o."id", ci."inicio") AS "ordenes",
                 h."precio_mensual"::text AS "precio_mensual", h."descuentos"
            FROM "organizacion" o
           CROSS JOIN LATERAL (SELECT plan_inicio_ciclo_de(o."plan_ciclo_ancla_at", o."plan_tipo_cobro", (now() AT TIME ZONE 'UTC')) AS "inicio") ci
           CROSS JOIN LATERAL plan_cobro_del_ciclo(o."id", ci."inicio") c
            LEFT JOIN LATERAL (SELECT ph."precio_mensual", ph."descuentos" FROM "plan_precio_historial" ph
                                WHERE ph."plan_id" = o."plan_id" AND ph."desde_at" <= ci."inicio"
                                ORDER BY ph."desde_at" DESC LIMIT 1) h ON true
           WHERE o."id" = ${organizacionId}`;
        if (periodo === undefined) throw new Error(`planDeEmpresa: sin cobro del ciclo para ${organizacionId}`);
        // La migración y `crear` siembran una fila `-infinity` por plan: sin ella el dato está roto.
        if (periodo.descuentos === null || periodo.descuentos === undefined) {
          throw new Error(`planDeEmpresa: el plan ${plan.id} no tiene precio en su historial`);
        }
        const cobroCiclo = { cobrado: periodo.cobrado, pendientes: periodo.pendientes };
        return {
          organizacionId,
          plan: {
            dto,
            vigente: {
              nombre: dto.nombre,
              topes: dto.topes,
              modulos: dto.modulos,
              precio: dto.precio,
              costoPorOrden: dto.costoPorOrden,
              costoPorOrdenPorcentual: dto.costoPorOrdenPorcentual,
            },
            entrada,
            precioDelPeriodo: precioDelHistorial(periodo.precio_mensual, periodo.descuentos),
            pendiente,
            uso: {
              ordenes: periodo.ordenes,
              apiKeys: uso.api_keys,
              porRol: Object.fromEntries(ROLES_CON_TOPE.map((rol) => [rol, uso[COLUMNA_DEL_ROL[rol]]])) as Record<
                RolConTope,
                number
              >,
            },
            cambio: cambioDeLaEmpresa(plan.cambioProgramado),
            costoVigente: costoVigenteDeLaTarifa(tarifa),
            cobroCiclo,
            // SLT-86 (R1): el CHECK de 20261106120000 deja los cuatro tipos.
            tipoCobro: tipoCobroSchema.parse(empresa.planTipoCobro),
          },
          pendienteSinPlan: null,
          asignaciones: lista,
        };
      }),
    );
  }

  publicos(): Promise<PlanDTO[]> {
    return comoPlataforma("SL-24", "leer los planes públicos del catálogo", async () => {
      const filas = await this.prisma.plan.findMany({
        where: { archivadoAt: null, visibilidad: "publico" },
        include: INCLUIR,
        orderBy: [{ nombre: "asc" }, { id: "asc" }],
      });
      return filas.map(aDTO);
    });
  }

  /* ------------------------------------------------------------------------ */
  /* SLT-99 (design §3) — el maestro cambia el plan de SU empresa. La empresa  */
  /* la pone el servicio desde la sesión; el pendiente es el de SLT-86.        */
  /* ------------------------------------------------------------------------ */

  empresaParaElMaestro(organizacionId: string): Promise<EmpresaParaElMaestro | null> {
    return comoPlataforma("SL-24", "leer el plan y el pendiente de la empresa del maestro (SLT-99)", async () => {
      const fila = await this.prisma.organizacion.findUnique({
        where: { id: organizacionId },
        select: { planId: true, planTipoCobro: true, planCambioId: true, plan: { select: { visibilidad: true } } },
      });
      if (fila === null) return null;
      return {
        planId: fila.planId,
        planEsCustom: fila.plan?.visibilidad === "custom",
        tipoCobro: tipoCobroSchema.parse(fila.planTipoCobro),
        hayPendiente: fila.planCambioId !== null,
      };
    });
  }

  cambiarPlanPorLaEmpresa(
    organizacionId: string,
    planId: string,
    actorUsuarioId: string,
    ahora: Date,
  ): Promise<ResultadoCambioDelMaestro> {
    return comoPlataforma("SL-24", "cambiar el plan de su empresa (maestro, SLT-99)", () =>
      this.prisma.$transaction(async (tx): Promise<ResultadoCambioDelMaestro> => {
        // Empresa FOR UPDATE → plan FOR SHARE, el orden de `asignar` (§4.4).
        const empresa = await bloquearEmpresa(tx, organizacionId);
        if (empresa === undefined) throw new Error(`cambiarPlanPorLaEmpresa: la empresa ${organizacionId} de la sesión no existe`);
        if (empresa.plan_id === null) return { estado: "sin_plan" };
        // R10: con el tipo VIGENTE leído bajo el cerrojo, no el de un pendiente; así el tipo que fija la fecha
        // es el que se guarda. Es inicio de período de calendario: al aplicarse no abre tramo (R14).
        const tipoCobro = tipoCobroSchema.parse(empresa.plan_tipo_cobro);
        const corte = fechaDeEfectoPorDefecto(tipoCobro, ahora);
        // R15 (decisión 2026-11-10, m1): su plan activo quita el pendiente, sea de quien sea (P3), con su fila
        // (SLT-86 R19): el mismo camino que «Cancelar cambio». Antes de mirar la disponibilidad, para que un
        // activo custom o archivado también lo cancele; no lee ni bloquea el plan porque no lo asigna.
        if (empresa.plan_id === planId) {
          if (empresa.plan_cambio_id !== null) {
            await this.cancelarPendienteDeEmpresaEnTx(tx, empresa, await resolverActorCongelado(tx, actorUsuarioId));
          }
          return { estado: "ok", vigenteDesde: null };
        }
        await tx.$queryRaw`SELECT "id" FROM "plan" WHERE "id" = ${planId} FOR SHARE`;
        const plan = await leerPlan(tx, planId);
        if (plan === null) return { estado: "no_disponible" };
        if (!esPlanDisponible(plan)) return { estado: "no_disponible" };
        // R13 (P4): por rol y API keys, y SIN escribir aunque la fecha sea futura: aquí se separa del
        // superadmin, que guarda y avisa (SLT-86 R18).
        const excedidos = await excedidosDe(tx, [empresa], plan.topes);
        if (excedidos.length > 0) return { estado: "tope_excedido", excedidos };
        // R11, R15: reemplaza el que hubiera (también uno del superadmin con otro tipo, P3), sin historial.
        await escribirPendiente(tx, empresa.id, plan.id, tipoCobro, inicioDelDiaPlataforma(corte), actorUsuarioId);
        return { estado: "ok", vigenteDesde: corte };
      }),
    );
  }

  cancelarCambioPorLaEmpresa(organizacionId: string, actorUsuarioId: string): Promise<ResultadoCancelarDelMaestro> {
    return comoPlataforma("SL-24", "cancelar el cambio pendiente de su empresa (maestro, SLT-99)", () =>
      this.prisma.$transaction(async (tx): Promise<ResultadoCancelarDelMaestro> => {
        const empresa = await bloquearEmpresa(tx, organizacionId);
        if (empresa === undefined) throw new Error(`cancelarCambioPorLaEmpresa: la empresa ${organizacionId} de la sesión no existe`);
        // R18 (P5, decisión 2026-11-10): sin plan, el pendiente es la primera asignación de la plataforma
        // (SLT-86, mismas columnas `plan_cambio_*`) y el maestro no la cancela. Se decide bajo el cerrojo.
        if (empresa.plan_id === null) return { estado: "sin_plan" };
        if (empresa.plan_cambio_id === null) return { estado: "sin_cambio_programado" };
        // R16 (P3): sea de quien sea el pendiente, la fila la firma el maestro.
        await this.cancelarPendienteDeEmpresaEnTx(tx, empresa, await resolverActorCongelado(tx, actorUsuarioId));
        return { estado: "ok" };
      }),
    );
  }
}
