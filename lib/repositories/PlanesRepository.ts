import { Prisma, type ModuloApagable, type PrismaClient, type RolValue } from "@prisma/client";

import { comoPlataforma } from "@/lib/db/contexto-empresa";
import type { ActorCongelado, EntradaAccion } from "@/lib/interfaces/repositories/IHistorialAccionRepository";
import type {
  AvisoCorreoPlan,
  CambioPendiente,
  DestinatariosDelAviso,
  DetallePlanLeido,
  EmpresaDePlanes,
  InicioDelCicloElegido,
  IPlanesRepository,
  PlanDeEmpresaLeida,
  PlanDelCatalogoLeido,
  ResultadoAplicar,
  ResultadoArchivar,
  ResultadoAsignar,
  ResultadoCancelarCambio,
  ResultadoEdicion,
  ResultadoProgramar,
  ResultadoRecordatorio,
  VistaPreviaLeida,
} from "@/lib/interfaces/repositories/IPlanesRepository";
import { inicioDelSiguienteCiclo } from "@/lib/planes/ciclo";
import type { CambioDelPlanLeido } from "@/lib/planes/consumo";
import { SOLO_PRIMERA_ASIGNACION } from "@/lib/planes/mensajes";
import { diferenciasDelPlan, hayCambios, type CambiosDelPlan } from "@/lib/planes/rastro";
import { apagarEnTx, encenderEnTx, entradaDelCambio } from "@/lib/repositories/_shared/modulos-en-tx";
import { JobRepository } from "@/lib/repositories/JobRepository";
import { ACTOR_SISTEMA, appendAccion, resolverActorCongelado } from "@/lib/repositories/registrar-accion";
import { etiquetaDeEntidad } from "@/lib/types/historial-accion-etiquetas";
import {
  ROLES_CON_TOPE,
  type CrearPlanInput,
  type PlanDTO,
  type PrecioPlan,
  type RolConTope,
  type TopeExcedido,
  type TopesPlan,
  type VersionPlan,
  versionPlanSchema,
} from "@/lib/types/planes";

// SL-24 (design §2, §4.4, §5, §7, §9, §16.3) — el catálogo de planes y su asignación. Lo escribe solo
// el superadmin, que no tiene empresa: todo corre en `comoPlataforma` (como dueño, sin el filtro de la
// extensión ni el REVOKE de `servi_app`, R8). Por eso `organizacion_id` va explícito en el historial.
//
// Cerrojos (§4.4), siempre en este orden para no interbloquear con las altas de los triggers, que piden
// empresa → plan:
//   · asignar: `organizacion` FOR UPDATE → plan FOR SHARE → contar → escribir;
//   · editar, archivar, programar, cancelar y aplicar un cambio programado: plan FOR UPDATE (nunca
//     piden la empresa después).
// El FOR UPDATE espera a las altas en vuelo (que tienen las filas en FOR SHARE) y cuenta con ellas ya
// confirmadas; las altas siguientes leen lo nuevo.
//
// Cada cambio deja su rastro en la misma transacción: `plan_rastro` (plataforma, P5) al crear, editar,
// archivar, y al programar, reemplazar, cancelar o aplicar un cambio (R43); `historial_accion` de la empresa al asignar y por cada módulo que se
// enciende o apaga (R29). Si el rastro falla, nada persiste.
//
// SLT-58 (design §3.2) suma tres lecturas para las pantallas del superadmin (catálogo, detalle de un
// plan, plan de una empresa), también en `comoPlataforma` y sin escribir nada. Su enmienda (§11) suma
// la fecha de inicio del ciclo en la primera asignación y su vista previa, de solo lectura.

export type PlanesPrismaClient = Pick<
  PrismaClient,
  "plan" | "organizacion" | "planCambioProgramado" | "usuario" | "historialAccion" | "planRastro" | "$transaction"
>;
type Tx = Prisma.TransactionClient;

const INCLUIR = {
  topesPorRol: { select: { rol: true, maximo: true } },
  modulos: { select: { modulo: true } },
} as const;

type FilaPlan = Prisma.PlanGetPayload<{ include: typeof INCLUIR }>;

const ROLES: ReadonlySet<string> = new Set(ROLES_CON_TOPE);

/* -------------------------------------------------------------------------- */
/* Filas ↔ DTO                                                                 */
/* -------------------------------------------------------------------------- */

function precioDe(f: FilaPlan): PrecioPlan {
  if (f.precioNegociable) return { tipo: "negociable" };
  if (f.precioMensual === null) return { tipo: "sin_precio" };
  // `toFixed(2)` de `Prisma.Decimal`: exacto, sin pasar por `Number`.
  const anual =
    f.precioAnual !== null
      ? { tipo: "fijo" as const, monto: f.precioAnual.toFixed(2) }
      : f.descuentoAnualPct !== null
        ? { tipo: "descuento" as const, porcentaje: f.descuentoAnualPct.toFixed(2) }
        : null;
  return { tipo: "monto", mensual: f.precioMensual.toFixed(2), anual };
}

function aDTO(f: FilaPlan): PlanDTO {
  const porRol: TopesPlan["porRol"] = {};
  for (const t of f.topesPorRol) if (ROLES.has(t.rol)) porRol[t.rol as RolConTope] = t.maximo;
  return {
    id: f.id,
    nombre: f.nombre,
    visibilidad: f.visibilidad,
    organizacionId: f.organizacionExclusivaId,
    topes: { ordenesPorCiclo: f.topeOrdenesCiclo, porRol, apiKeys: f.topeApiKeys },
    modulos: f.modulos.map((m) => m.modulo),
    precio: precioDe(f),
    costoPorOrden: f.costoPorOrden === null ? null : f.costoPorOrden.toFixed(2),
    archivado: f.archivadoAt !== null,
  };
}

/** Las columnas del precio: las cinco formas de `plan_precio_forma` (R3). Los importes, como texto. */
function columnasDelPrecio(p: PrecioPlan) {
  if (p.tipo !== "monto") {
    return { precioNegociable: p.tipo === "negociable", precioMensual: null, precioAnual: null, descuentoAnualPct: null };
  }
  return {
    precioNegociable: false,
    precioMensual: p.mensual,
    precioAnual: p.anual?.tipo === "fijo" ? p.anual.monto : null,
    descuentoAnualPct: p.anual?.tipo === "descuento" ? p.anual.porcentaje : null,
  };
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

/* -------------------------------------------------------------------------- */
/* Uso contra topes (R12, R16)                                                 */
/* -------------------------------------------------------------------------- */

interface FilaUso {
  ordenes: number;
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

/**
 * SLT-58 (§11.4, paso 2): el ciclo que tendría la empresa con la fecha elegida, para contar sus
 * órdenes antes de escribirlo. `ancla: null` = `now()` de la base (la fecha es «hoy», P9).
 */
interface CicloCandidato {
  /** `TIMESTAMP` sin zona como texto (`AAAA-MM-DD HH:MM:SS.mmm`, números UTC), o `null` = ahora. */
  ancla: string | null;
}

/** Un `Date` UTC como literal de `TIMESTAMP` sin zona: la zona de la sesión no lo mueve. */
function comoTimestamp(instante: Date): string {
  return instante.toISOString().replace("T", " ").replace("Z", "");
}

function cicloCandidato(inicio: InicioDelCicloElegido): CicloCandidato {
  return { ancla: inicio.ancla === "ahora" ? null : comoTimestamp(inicio.ancla) };
}

/**
 * El uso de una empresa, con las mismas funciones que cuentan los triggers (una sola definición de
 * «uso», §4.2). Sin ancla (empresa sin plan) el ciclo empieza ahora: asignar el primer plan no
 * cuenta órdenes previas (§5.2, paso 3). `'Admin Tienda'` es la etiqueta de Postgres de `adminTienda`.
 *
 * SLT-58 (§11.2, §11.4): el ciclo sale de `plan_inicio_ciclo_en_curso`, la misma envoltura que los
 * triggers, el cupo y «Mi plan». Con un `candidato` (primera asignación con fecha) se cuenta con el
 * ciclo que dejaría la asignación: ancla futura → ciclo corto desde ahora (R34); ancla pasada → el
 * ciclo de SL-24 R20 desde ella (R33).
 */
async function usoDe(tx: Tx, organizacionId: string, candidato?: CicloCandidato): Promise<FilaUso> {
  const ahora = Prisma.sql`(now() AT TIME ZONE 'UTC')`;
  let inicio: Prisma.Sql;
  if (candidato === undefined) {
    inicio = Prisma.sql`plan_inicio_ciclo_en_curso(o."plan_ciclo_corto_desde_at", COALESCE(o."plan_ciclo_ancla_at", ${ahora}), ${ahora})`;
  } else if (candidato.ancla === null) {
    inicio = Prisma.sql`plan_inicio_ciclo_en_curso(NULL, ${ahora}, ${ahora})`;
  } else {
    const ancla = Prisma.sql`${candidato.ancla}::timestamp`;
    inicio = Prisma.sql`plan_inicio_ciclo_en_curso(CASE WHEN ${ancla} > ${ahora} THEN ${ahora} END, ${ancla}, ${ahora})`;
  }
  const [fila] = await tx.$queryRaw<FilaUso[]>`
    SELECT plan_uso_ordenes(o."id", ${inicio}) AS "ordenes",
           plan_uso_api_keys(o."id") AS "api_keys",
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
  candidato?: CicloCandidato,
): Promise<TopeExcedido[]> {
  const excedidos: TopeExcedido[] = [];
  for (const empresa of empresas) {
    const uso = await usoDe(tx, empresa.id, candidato);
    const pasa = (tope: TopeExcedido["tope"], usados: number, maximo: number | null | undefined) => {
      if (maximo !== null && maximo !== undefined && usados > maximo) {
        excedidos.push({ organizacionId: empresa.id, empresa: empresa.nombre, tope, usados, maximo });
      }
    };
    pasa("ordenes", uso.ordenes, topes.ordenesPorCiclo);
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
 * empresas no se toca (R38): no escribe `plan_ciclo_ancla_at`.
 */
async function aplicarVersion(tx: Tx, antes: PlanDTO, version: VersionPlan, actor: ActorCongelado): Promise<void> {
  await tx.plan.update({
    where: { id: antes.id },
    data: {
      nombre: version.nombre,
      topeOrdenesCiclo: version.topes.ordenesPorCiclo,
      topeApiKeys: version.topes.apiKeys,
      ...columnasDelPrecio(version.precio),
      costoPorOrden: version.costoPorOrden,
    },
  });
  await tx.planTopeRol.deleteMany({ where: { planId: antes.id } });
  await tx.planTopeRol.createMany({ data: filasDeTopes(version.topes).map((t) => ({ planId: antes.id, ...t })) });
  await tx.planModulo.deleteMany({ where: { planId: antes.id } });
  await tx.planModulo.createMany({ data: version.modulos.map((modulo) => ({ planId: antes.id, modulo })) });

  const anadidos = version.modulos.filter((m) => !antes.modulos.includes(m));
  const quitados = antes.modulos.filter((m) => !version.modulos.includes(m));
  if (anadidos.length === 0 && quitados.length === 0) return;
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
  await tx.planCambioProgramado.deleteMany({ where: { id: pendiente.id } });
  // R45 (§16.2): un `plan_aviso_correo` `cancelado` por cada empresa del plan, en esta transacción.
  // Sirve a cancelar a mano y a archivar (R40); reemplazar NO pasa por aquí (no lleva correo de
  // cancelación aparte). El envío va por la cola: un fallo del correo no deshace la cancelación.
  const vigenteDesde = pendiente.vigenteDesde.toISOString();
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
        vigenteDesde,
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

const UN_DIA_MS = 24 * 60 * 60 * 1000;
/** Los dos recordatorios: 7×24 h y 24 h antes de `vigente_desde` (§16.1). */
const DIAS_DE_RECORDATORIO = [7, 1] as const;

/** `dedupe_key` de un recordatorio de ESA programación: uno por días, aunque se encole dos veces. */
export function dedupeRecordatorio(cambioId: string, dias: 7 | 1): string {
  return `plan_recordatorio:${cambioId}:${dias}`;
}

/**
 * `dedupe_key` de un aviso: `plan_aviso:<cambioId|editId>:<tipo>:<organizacionId>` (§16.4). Impide
 * encolar dos veces el mismo aviso a la misma empresa (R42), aunque el recordatorio se repita.
 */
export function dedupeAviso(origenId: string, tipo: AvisoCorreoPlan["tipo"], organizacionId: string): string {
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
  const [{ previa }] = await tx.$queryRaw<{ previa: string | null }[]>`
    SELECT current_setting('app.organizacion_id', true) AS "previa"`;
  const jobs = new JobRepository(tx);
  for (const a of avisos) {
    await tx.$executeRaw`SELECT set_config('app.organizacion_id', ${a.organizacionId}, true)`;
    await jobs.enqueue("plan_aviso_correo", { ...a.payload }, { dedupeKey: a.dedupeKey }, tx);
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

/* -------------------------------------------------------------------------- */
/* El repositorio                                                              */
/* -------------------------------------------------------------------------- */

export class PlanesRepository implements IPlanesRepository {
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
      this.prisma.$transaction(async (tx) => {
        const { id } = await tx.plan.create({
          data: {
            nombre: input.nombre,
            visibilidad: input.visibilidad,
            organizacionExclusivaId: input.organizacionId,
            topeOrdenesCiclo: input.topes.ordenesPorCiclo,
            topeApiKeys: input.topes.apiKeys,
            ...columnasDelPrecio(input.precio),
            costoPorOrden: input.costoPorOrden,
            topesPorRol: { create: filasDeTopes(input.topes) },
            modulos: { create: input.modulos.map((modulo) => ({ modulo })) },
          },
          select: { id: true },
        });
        const creado: PlanDTO = {
          id,
          nombre: input.nombre,
          visibilidad: input.visibilidad,
          organizacionId: input.organizacionId,
          topes: input.topes,
          modulos: input.modulos,
          precio: input.precio,
          costoPorOrden: input.costoPorOrden,
          archivado: false,
        };
        const actor = await resolverActorCongelado(tx, actorUsuarioId);
        await escribirRastro(tx, creado, "creado", diferenciasDelPlan(null, creado), actorUsuarioId, actor);
        return id;
      }),
    );
  }

  editar(planId: string, version: VersionPlan, actorUsuarioId: string): Promise<ResultadoEdicion> {
    return comoPlataforma("SL-24", "editar un plan del catálogo de inmediato (superadmin)", () =>
      this.prisma.$transaction(async (tx): Promise<ResultadoEdicion> => {
        if (!(await bloquearPlanParaEscribir(tx, planId))) return { estado: "not_found" };
        const antes = (await leerPlan(tx, planId)) as PlanDTO;
        if (antes.archivado) return { estado: "archivado" };
        const cambios = diferenciasDelPlan(antes, { ...antes, ...version });
        if (!hayCambios(cambios)) return { estado: "ok", cambio: false, avisos: [] };

        // R16 (revisado el 2026-10-28): ya no se rechaza. Se guarda y se avisa de quién ya pasa un
        // tope; desde ahora sus altas que pasen el tope las rechazan los triggers.
        const empresas = await empresasDelPlan(tx, planId);
        const avisos = await excedidosDe(tx, empresas, version.topes);
        const actor = await resolverActorCongelado(tx, actorUsuarioId);
        await aplicarVersion(tx, antes, version, actor);
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
        if (!(await bloquearPlanParaEscribir(tx, planId))) return { estado: "not_found" };
        const plan = (await leerPlan(tx, planId)) as PlanDTO;
        if (plan.archivado) return { estado: "ok", cambio: false };
        // Las empresas lo conservan y los triggers no miran `archivado_at`: siguen topadas (R6).
        await tx.plan.update({ where: { id: planId }, data: { archivadoAt: new Date() } });
        const actor = await resolverActorCongelado(tx, actorUsuarioId);
        const cambios = diferenciasDelPlan(plan, { ...plan, archivado: true });
        await escribirRastro(tx, plan, "archivado", cambios, actorUsuarioId, actor);
        await cancelarPendienteEnTx(tx, plan, actorUsuarioId, actor);
        return { estado: "ok", cambio: true };
      }),
    );
  }

  async asignar(
    organizacionId: string,
    planId: string,
    actorUsuarioId: string,
    inicio?: InicioDelCicloElegido,
  ): Promise<ResultadoAsignar> {
    return comoPlataforma("SL-24", "asignar un plan a una empresa (superadmin)", () =>
      this.prisma.$transaction(async (tx): Promise<ResultadoAsignar> => {
        const [empresa] = await tx.$queryRaw<{ id: string; nombre: string; plan_id: string | null }[]>`
          SELECT "id", "nombre", "plan_id" FROM "organizacion" WHERE "id" = ${organizacionId} FOR UPDATE`;
        const bloqueado = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "plan" WHERE "id" = ${planId} FOR SHARE`;
        if (empresa === undefined || bloqueado.length === 0) return { estado: "not_found" };
        const plan = (await leerPlan(tx, planId)) as PlanDTO;
        if (plan.archivado) return { estado: "archivado" };
        if (plan.visibilidad === "custom" && plan.organizacionId !== organizacionId) {
          return { estado: "custom_de_otra_empresa" };
        }
        // SLT-58 R31 (carrera): la fecha solo vale en la primera asignación. El servicio ya lo miró,
        // pero otra petición pudo asignar un plan entre su lectura y este cerrojo.
        if (inicio !== undefined && empresa.plan_id !== null) {
          return { estado: "validation_error", fieldErrors: { inicioCiclo: [SOLO_PRIMERA_ASIGNACION] } };
        }
        // R13: el mismo plan no cambia nada ni registra nada.
        if (empresa.plan_id === planId) return { estado: "ok", cambio: false };

        // R12: bajar a un plan que la empresa ya pasa se rechaza sin escribir nada. SLT-58 (R36, R42;
        // P7 y P14 cerradas): en la primera asignación CON fecha, el uso se cuenta con el ciclo que
        // resulta de la fecha y ningún tope pasado rechaza: se asigna y se avisa. Los triggers ya
        // bloquean desde aquí las altas que pasen el tope (SL-24 R16).
        const excedidos = await excedidosDe(
          tx,
          [empresa],
          plan.topes,
          inicio === undefined ? undefined : cicloCandidato(inicio),
        );
        if (inicio === undefined && excedidos.length > 0) return { estado: "tope_excedido", excedidos };

        // P2a: el ancla del primer plan se conserva; sin plan, nace ahora, en la escala de
        // `orden.created_at` y de los triggers (`now()` de la base, no el reloj de Node), en UTC
        // explícito: `now()::timestamp` sería la hora local de la sesión (decisión 2026-10-28).
        if (inicio === undefined) {
          await tx.$executeRaw`UPDATE "organizacion" SET "plan_id" = ${planId}, "plan_ciclo_ancla_at" = COALESCE("plan_ciclo_ancla_at", now() AT TIME ZONE 'UTC') WHERE "id" = ${organizacionId}`;
        } else {
          // SLT-58 (R32, R34): el ancla elegida («hoy» = ahora, P9) y, si es futura, el ciclo corto
          // desde ahora, en una sola sentencia y con el mismo `now()` (el CHECK pide corto < ancla).
          const ahora = Prisma.sql`(now() AT TIME ZONE 'UTC')`;
          const elegida = inicio.ancla === "ahora" ? ahora : Prisma.sql`${comoTimestamp(inicio.ancla)}::timestamp`;
          const ancla = Prisma.sql`COALESCE("plan_ciclo_ancla_at", ${elegida})`;
          await tx.$executeRaw`UPDATE "organizacion" SET "plan_id" = ${planId}, "plan_ciclo_ancla_at" = ${ancla}, "plan_ciclo_corto_desde_at" = CASE WHEN ${ancla} > ${ahora} THEN ${ahora} END WHERE "id" = ${organizacionId}`;
        }
        const modulos = await sincronizarModulos(tx, organizacionId, plan.modulos);
        const actor = await resolverActorCongelado(tx, actorUsuarioId);
        // Una sola llamada: el `plan_asignado` y las filas de módulos comparten `lote_id` (§9).
        await appendAccion(tx, [
          {
            accion: "plan_asignado",
            entidadTipo: "plan",
            entidadId: planId,
            entidadEtiqueta: etiquetaDeEntidad("plan", { nombre: plan.nombre }),
            valorAnterior: null,
            // SLT-58 R39 (P12): la fecha elegida, `AAAA-MM-DD`; sin fecha, como SL-24.
            valorNuevo: inicio?.fecha ?? null,
            organizacionId,
            ...actor,
          },
          ...modulos.map((e): EntradaAccion => ({ ...e, ...actor })),
        ]);
        // Sin fecha, la forma de SL-24 sin `avisos` (sus tests comparan el resultado entero).
        return inicio === undefined ? { estado: "ok", cambio: true } : { estado: "ok", cambio: true, avisos: excedidos };
      }),
    );
  }

  vistaPreviaAsignacion(
    organizacionId: string,
    planId: string,
    inicio: InicioDelCicloElegido,
  ): Promise<VistaPreviaLeida | null> {
    // SLT-58 (§11.4; R37): lectura, sin cerrojos ni escrituras. El mismo uso (`excedidosDe` con el
    // ciclo candidato) que `asignar`, así que avisa lo mismo; la autoridad sigue siendo el trigger.
    return comoPlataforma("SL-24", "vista previa de la primera asignación de un plan (superadmin, SLT-58)", () =>
      this.prisma.$transaction(async (tx): Promise<VistaPreviaLeida | null> => {
        const empresa = await tx.organizacion.findUnique({
          where: { id: organizacionId },
          select: { id: true, nombre: true },
        });
        const plan = await leerPlan(tx, planId);
        if (empresa === null || plan === null) return null;
        const avisos = await excedidosDe(tx, [empresa], plan.topes, cicloCandidato(inicio));
        // El «ahora» de la base, en la escala del ancla (P10: el aviso nombra el día del cambio de ciclo).
        const [{ ahora }] = await tx.$queryRaw<{ ahora: Date }[]>`SELECT (now() AT TIME ZONE 'UTC') AS "ahora"`;
        const ancla = inicio.ancla === "ahora" ? ahora : inicio.ancla;
        return { avisos, siguienteCiclo: inicioDelSiguienteCiclo(ancla, ahora) };
      }),
    );
  }

  cancelarCambio(planId: string, actorUsuarioId: string): Promise<ResultadoCancelarCambio> {
    return comoPlataforma("SL-24", "cancelar el cambio programado de un plan (superadmin)", () =>
      this.prisma.$transaction(async (tx): Promise<ResultadoCancelarCambio> => {
        if (!(await bloquearPlanParaEscribir(tx, planId))) return { estado: "not_found" };
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

        // 3. R16 (revisado): con el uso de HOY contra los topes nuevos; se avisa, no se rechaza.
        const empresas = await empresasDelPlan(tx, planId);
        const avisos = await excedidosDe(tx, empresas, version.topes);
        const actor = await resolverActorCongelado(tx, actorUsuarioId);
        const despues = vigenteDesde.toISOString();

        // 4. R39: un solo pendiente por plan. Reemplazar = borrar y crear otro con id nuevo; los
        // trabajos del viejo no se tocan: al correr no encuentran su `cambioId` (§16.3).
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

        // 6. Outbox, en esta misma transacción.
        await encolarAplicacion(tx, { planId, cambioId }, vigenteDesde);
        // R42: los recordatorios, 7×24 h y 24 h antes; solo los que caen DESPUÉS de ahora. Sin empresa
        // (`organizacion_id` NULL): reparten por empresa al correr, con las que tengan el plan entonces.
        const jobs = new JobRepository(tx);
        for (const dias of DIAS_DE_RECORDATORIO) {
          const runAfter = new Date(vigenteDesde.getTime() - dias * UN_DIA_MS);
          if (runAfter.getTime() <= ahora.getTime()) continue;
          await jobs.enqueue(
            "plan_recordatorio_cambio",
            { planId, cambioId, dias },
            { runAfter, dedupeKey: dedupeRecordatorio(cambioId, dias) },
            tx,
          );
        }
        // R41 y R45: un correo de guardado por empresa, con la fecha del pendiente al que reemplaza
        // (no sale correo de cancelación aparte, §16.2).
        const reemplazaA = pendiente === null ? null : pendiente.vigenteDesde.toISOString();
        await encolarAvisos(
          tx,
          empresas.map((e) => ({
            organizacionId: e.id,
            dedupeKey: dedupeAviso(cambioId, "guardado", e.id),
            payload: {
              cambioId,
              planId,
              planNombre: vigente.nombre,
              tipo: "guardado",
              cambios,
              vigenteDesde: despues,
              reemplazaA,
              topesPasados: topesDeLaEmpresa(avisos, e.id),
            },
          })),
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
          select: { id: true, vigenteDesde: true, version: true, actorUsuarioId: true, actorNombre: true },
        });
        if (pendiente === null) return { estado: "sin_pendiente" };
        // Reloj adelantado del trabajo: no se adelanta el cambio; lo recoge el barrido.
        if (pendiente.vigenteDesde.getTime() > ahora.getTime()) return { estado: "aun_no_rige" };

        // La misma validación que al guardar (§16.1). Una versión que ya no pasa falla el trabajo
        // (se reintenta y queda en `failed` con el motivo) sin escribir nada.
        const version: VersionPlan = versionPlanSchema.parse(pendiente.version);
        const antes = (await leerPlan(tx, cambio.planId)) as PlanDTO;
        const cambios = diferenciasDelPlan(antes, { ...antes, ...version });
        // 3. La misma función que la edición inmediata (R17 en las empresas que lo tienen AHORA).
        // El historial de SL-23 de cada empresa lo firma el sistema; el ciclo no se toca (R38).
        if (hayCambios(cambios)) await aplicarVersion(tx, antes, version, ACTOR_SISTEMA);
        // 4. R43: la fila del sistema, con quien lo programó.
        await escribirRastro(
          tx,
          { id: cambio.planId, nombre: version.nombre },
          "cambio_aplicado",
          cambios,
          pendiente.actorUsuarioId,
          { actorUsuarioId: pendiente.actorUsuarioId, actorNombre: actorDelAplicador(pendiente.actorNombre), actorRol: null },
        );
        // 5. Ya no está pendiente: una segunda ejecución no lo encuentra.
        await tx.planCambioProgramado.deleteMany({ where: { id: pendiente.id } });
        return { estado: "aplicado" };
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
        // R42: las empresas que tienen el plan AHORA y sus topes pasados contra la versión pendiente.
        const empresas = await empresasDelPlan(tx, cambio.planId);
        const excedidos = await excedidosDe(tx, empresas, version.topes);
        const tipo = dias === 7 ? "recordatorio_7" : "recordatorio_1";
        const vigenteDesde = pendiente.vigenteDesde.toISOString();
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
              vigenteDesde,
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
          cambioProgramado: { select: { vigenteDesde: true, version: true } },
          empresas: { select: { id: true, nombre: true }, orderBy: [{ nombre: "asc" }, { id: "asc" }] },
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
        pendiente: pendienteDe(fila.cambioProgramado),
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
            planCicloCortoDesdeAt: true,
            plan: {
              include: { ...INCLUIR, cambioProgramado: { select: { vigenteDesde: true, version: true } } },
            },
          },
        });
        if (empresa === null) return null;
        // Plataforma no filtra por empresa: el `organizacionId` va explícito (R21).
        const asignaciones = await tx.historialAccion.findMany({
          where: { organizacionId, accion: "plan_asignado" },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: LIMITE_ASIGNACIONES,
          select: { createdAt: true, actorNombre: true, entidadEtiqueta: true },
        });
        const lista = asignaciones.map((a) => ({
          creadoAt: a.createdAt,
          actorNombre: a.actorNombre,
          planNombre: a.entidadEtiqueta,
        }));
        const { plan } = empresa;
        if (plan === null) return { organizacionId, plan: null, asignaciones: lista };

        // El CHECK de 20261028130000 impide un plan sin ancla.
        const ancla = empresa.planCicloAnclaAt;
        if (ancla === null) throw new Error(`planDeEmpresa: la empresa ${organizacionId} tiene plan y no ancla`);
        const dto = aDTO(plan);
        const uso = await usoDe(tx, organizacionId);
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
            },
            ancla,
            cortoDesde: empresa.planCicloCortoDesdeAt,
            uso: {
              ordenes: uso.ordenes,
              apiKeys: uso.api_keys,
              porRol: Object.fromEntries(ROLES_CON_TOPE.map((rol) => [rol, uso[COLUMNA_DEL_ROL[rol]]])) as Record<
                RolConTope,
                number
              >,
            },
            cambio: pendienteDe(plan.cambioProgramado),
          },
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
}
