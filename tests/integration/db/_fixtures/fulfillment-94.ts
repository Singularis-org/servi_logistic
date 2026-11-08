import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import type { CreateOrdenData } from "@/lib/interfaces/repositories/IOrdenRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";

import { crearOrganizacion } from "../../../fabricas/organizaciones";

// SLT-94 — lo que comparten los tests de integración del cobro de fulfillment por paquete.
//
// LAS ÓRDENES NACEN POR EL REPOSITORIO REAL. Las tres vías de creación (pantalla, carga masiva y API
// key) acaban en `OrdenRepository.createManyOrdenes` o `createManyOrdenesConGuia` (design §1, «Por qué
// el trigger cumple»): aquí se llaman esos dos métodos sobre el cliente EXTENDIDO y con la empresa
// fijada por `conEmpresa`, como lo hace `BulkOrdenService`. Los servicios de carga no se usan aquí
// porque deciden el estado de nacimiento con la marca, que es T2.
//
// Lo que se mide se mide con el cliente BASE (dueño, sin extensión ni RLS). Las filas se commitean y se
// limpian en el `afterAll` de cada archivo, acotadas a sus empresas (`limpiarEmpresas`).

export interface Geo {
  provinciaId: string;
  cantonId: string;
}

export interface EmpresaDePrueba {
  id: string;
  maestroId: string;
  zonaId: string;
}

/** La geografía Cartago/Cartago, que llega por migración. */
export async function geoCartago(base: PrismaClient): Promise<Geo> {
  const canton = await base.canton.findFirst({
    where: { nombre: "Cartago", provincia: { nombre: "Cartago" } },
    select: { id: true, provinciaId: true },
  });
  if (canton === null) throw new Error("falta la geografia Cartago/Cartago: aplica las migraciones");
  return { provinciaId: canton.provinciaId, cantonId: canton.id };
}

/** El id de un estado del catálogo. Lanza si falta: nunca deja seguir sin datos. */
export async function estatusId(base: PrismaClient, value: string): Promise<string> {
  const e = await base.orderStatus.findUnique({ where: { value }, select: { id: true } });
  if (e === null) throw new Error(`falta el estatus «${value}»: corre \`pnpm run db:seed\``);
  return e.id;
}

async function rolId(base: PrismaClient, value: string): Promise<string> {
  const r = await base.rol.findUnique({ where: { value: value as never }, select: { id: true } });
  if (r === null) throw new Error(`falta el rol «${value}»: corre \`pnpm run db:seed\``);
  return r.id;
}

/** Una empresa con su maestro y una zona. Como dueño, con la empresa explícita en cada fila. */
export async function sembrarEmpresa(base: PrismaClient, etiqueta: string): Promise<EmpresaDePrueba> {
  const id = (await crearOrganizacion(base, { nombre: `SLT94 ${etiqueta}` })).id;
  const maestroId = await sembrarUsuario(base, id, "maestro", `${etiqueta}-maestro`);
  const zona = await base.zona.create({
    data: { nombre: `Zona SLT94 ${etiqueta}`, sinpeNumero: "88880000", sinpeNombre: "Zona de prueba", organizacionId: id },
    select: { id: true },
  });
  return { id, maestroId, zonaId: zona.id };
}

/** Un usuario del rol pedido en la empresa. `seRecogeEnTienda` solo cuenta para tiendas. */
export async function sembrarUsuario(
  base: PrismaClient,
  organizacionId: string,
  rol: string,
  etiqueta: string,
  seRecogeEnTienda = true,
): Promise<string> {
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 12);
  const tipo = await base.tipoIdentificacion.findUniqueOrThrow({ where: { value: "cedula" }, select: { id: true } });
  const u = await base.usuario.create({
    data: {
      nombre: `SLT94 ${etiqueta}`,
      email: `slt94-${sufijo}@ejemplo.test`,
      telefono: "88880000",
      passwordHash: "x",
      cedula: `SLT94-${sufijo}`,
      tipoIdentificacionId: tipo.id,
      rolId: await rolId(base, rol),
      estado: "activo",
      seRecogeEnTienda,
      organizacionId,
    },
    select: { id: true },
  });
  return u.id;
}

/** La empresa calcula con el modelo nuevo (SLT-54). */
export async function activar(base: PrismaClient, organizacionId: string): Promise<void> {
  await base.tarifaActivacion.create({ data: { organizacionId } });
}

/**
 * Fija (o reescribe) el valor de fulfillment de la tienda en el nivel «tienda en todas sus zonas», en
 * monto, con su % de IVA. Devuelve el id de la fila. Como dueño: el camino de la pantalla es T3.
 */
export async function fijarFulfillment(
  base: PrismaClient,
  organizacionId: string,
  tiendaId: string,
  valor: string,
  ivaPct: string,
): Promise<string> {
  const existente = await base.tarifaValor.findFirst({
    where: { organizacionId, tiendaId, concepto: "tienda_fulfillment", zonaId: null, grupoId: null },
    select: { id: true },
  });
  if (existente !== null) {
    await base.tarifaValor.update({ where: { id: existente.id }, data: { valor, ivaPct } });
    return existente.id;
  }
  const creado = await base.tarifaValor.create({
    data: { organizacionId, tiendaId, concepto: "tienda_fulfillment", modo: "monto", valor, ivaPct },
    select: { id: true },
  });
  return creado.id;
}

export function ordenRepo(app: PrismaClient): OrdenRepository {
  return new OrdenRepository(app);
}

export interface CrearOrdenesOpciones {
  /** `true` = la ruta CON guía (`createManyOrdenesConGuia`), como pantalla y API; `false` = sin guía. */
  conGuia: boolean;
  /** Estado inicial (por defecto `en_preparacion`). */
  estatusId: string;
  geo: Geo;
}

/**
 * Crea órdenes por el repositorio real, en un lote, y devuelve `{ remision -> id }` de las que existen
 * vivas tras el lote. `remisiones` las da el test (permite repetir una para medir `skipDuplicates`).
 */
export async function crearOrdenes(
  app: PrismaClient,
  base: PrismaClient,
  e: EmpresaDePrueba,
  tiendaId: string,
  remisiones: string[],
  o: CrearOrdenesOpciones,
): Promise<{ ids: Record<string, string>; omitidas: string[] }> {
  const data: CreateOrdenData[] = remisiones.map((numRemision) => ({
    numRemision,
    estatusId: o.estatusId,
    destinatario: "Cliente SLT94",
    telefonoDest: "88887777",
    tiendaId,
    zonaId: e.zonaId,
    provinciaId: o.geo.provinciaId,
    cantonId: o.geo.cantonId,
    producto: "Caja",
    peso: null,
  }));
  const repo = ordenRepo(app);
  const historial = { actorUsuarioId: tiendaId, origenTipo: o.conGuia ? ("carga_api" as const) : ("carga_masiva" as const) };
  const lote = { cargaId: null, usuarioCargaId: tiendaId, totalFiles: data.length, name: null };
  const r = await conEmpresa(e.id, () =>
    o.conGuia
      ? repo.createManyOrdenesConGuia(data, 50, historial, lote)
      : repo.createManyOrdenes(data, 50, historial, lote),
  );
  const filas = await base.orden.findMany({
    where: { organizacionId: e.id, tiendaId, numRemision: { in: remisiones }, deletedAt: null },
    select: { id: true, numRemision: true },
  });
  return { ids: Object.fromEntries(filas.map((f) => [f.numRemision, f.id])), omitidas: r.omitidas };
}

/* -------------------------------------------------------------------------- */
/* Lecturas como dueño                                                         */
/* -------------------------------------------------------------------------- */

export interface Movimiento {
  id: string;
  organizacion_id: string;
  tienda_id: string;
  secuencia: number;
  tipo: string;
  causa: string;
  monto: string;
  iva_pct: string;
  iva: string;
  tarifa_valor_id: string | null;
  ocurrido_at: Date;
  created_at: Date;
}

export function movimientosDe(base: PrismaClient, ordenId: string): Promise<Movimiento[]> {
  return base.$queryRawUnsafe<Movimiento[]>(
    `SELECT "id", "organizacion_id", "tienda_id", "secuencia", "tipo"::text, "causa"::text,
            "monto"::text, "iva_pct"::text, "iva"::text, "tarifa_valor_id", "ocurrido_at", "created_at"
       FROM "orden_fulfillment_movimiento" WHERE "orden_id" = $1 ORDER BY "secuencia"`,
    ordenId,
  );
}

/** La forma corta de un movimiento: «secuencia tipo causa monto iva». */
export async function resumenDe(base: PrismaClient, ordenId: string): Promise<string[]> {
  return (await movimientosDe(base, ordenId)).map((m) => `${m.secuencia} ${m.tipo} ${m.causa} ${m.monto} ${m.iva}`);
}

export interface FilaDeLibro {
  libro: "tienda" | "caja";
  organizacion_id: string;
  tienda_id: string | null;
  tipo: string;
  categoria: string;
  monto: string;
  origen_tipo: string;
  fecha_movimiento: Date;
}

/** Las filas de los dos libros que cuelgan de un movimiento (`origen_id` = id del movimiento). */
export function librosDe(base: PrismaClient, movimientoId: string): Promise<FilaDeLibro[]> {
  return base.$queryRawUnsafe<FilaDeLibro[]>(
    `SELECT 'tienda' AS libro, "organizacion_id", "tienda_id", "tipo"::text, "categoria"::text, "monto"::text,
            "origen_tipo"::text, "fecha_movimiento"
       FROM "wallet_tienda_movimiento" WHERE "origen_id" = $1
     UNION ALL
     SELECT 'caja', "organizacion_id", NULL, "tipo"::text, "categoria"::text, "monto"::text,
            "origen_tipo"::text, "fecha_movimiento"
       FROM "wallet_movimiento" WHERE "origen_id" = $1
     ORDER BY 1, 5`,
    movimientoId,
  );
}

/** Saldo de la tienda en su libro: Σ crédito − Σ débito (todas las categorías). */
export async function saldoTienda(base: PrismaClient, tiendaId: string): Promise<string> {
  const [r] = await base.$queryRawUnsafe<{ s: string }[]>(
    `SELECT COALESCE(SUM(CASE WHEN "tipo" = 'credito' THEN "monto" ELSE -"monto" END), 0)::numeric(14,2)::text AS s
       FROM "wallet_tienda_movimiento" WHERE "tienda_id" = $1`,
    tiendaId,
  );
  return r.s;
}

/** Neto de la caja de la empresa en las cuatro categorías del fulfillment: Σ ingreso − Σ egreso. */
export async function cajaFulfillment(base: PrismaClient, organizacionId: string): Promise<string> {
  const [r] = await base.$queryRawUnsafe<{ s: string }[]>(
    `SELECT COALESCE(SUM(CASE WHEN "tipo" = 'ingreso' THEN "monto" ELSE -"monto" END), 0)::numeric(14,2)::text AS s
       FROM "wallet_movimiento"
      WHERE "organizacion_id" = $1 AND "origen_tipo" = 'orden_fulfillment'`,
    organizacionId,
  );
  return r.s;
}

/** SQLSTATE de un error de Prisma con driver adapter o de `pg`. */
export function sqlstateDe(error: unknown): string {
  const texto = JSON.stringify(error, Object.getOwnPropertyNames(error as object)) + String((error as Error)?.message ?? "");
  const conCode = /Code: `([0-9A-Z]{5})`/.exec(texto) ?? /"code":"([0-9A-Z]{5})"/.exec(texto);
  return conCode?.[1] ?? `?? ${String((error as Error)?.message ?? error).replace(/\s+/g, " ").slice(0, 160)}`;
}

/* -------------------------------------------------------------------------- */
/* Limpieza                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Borra TODAS las filas de las empresas `orgs`, como dueño, recorriendo por catálogo las tablas con
 * `organizacion_id` en pasadas: la que choca con una FK (p. ej. `orden` antes que
 * `orden_fulfillment_movimiento`, que la referencia con RESTRICT) se deshace con su SAVEPOINT y se
 * reintenta en la pasada siguiente. Termina con `organizacion`. Lanza si una pasada entera no avanza.
 * Debe correr bajo `bajoLockDeEscrituraReal`.
 */
export async function limpiarEmpresas(base: PrismaClient, orgs: string[]): Promise<void> {
  if (orgs.length === 0) return;
  await base.$transaction(
    async (tx) => {
      const tablas = (
        await tx.$queryRawUnsafe<{ t: string }[]>(
          `SELECT c.table_name AS t FROM information_schema.columns c
             JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
            WHERE c.table_schema = 'public' AND c.column_name = 'organizacion_id' AND t.table_type = 'BASE TABLE'
            ORDER BY 1`,
        )
      ).map((r) => r.t);
      let pendientes = [...tablas];
      for (let pasada = 0; pendientes.length > 0; pasada++) {
        if (pasada > tablas.length) throw new Error(`limpieza SLT94 atascada en: ${pendientes.join(", ")}`);
        const siguen: string[] = [];
        for (const t of pendientes) {
          await tx.$executeRawUnsafe(`SAVEPOINT slt94_limpieza`);
          try {
            await tx.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "organizacion_id" = ANY($1::text[])`, orgs);
            await tx.$executeRawUnsafe(`RELEASE SAVEPOINT slt94_limpieza`);
          } catch {
            await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT slt94_limpieza`);
            siguen.push(t);
          }
        }
        pendientes = siguen;
      }
      await tx.$executeRawUnsafe(`DELETE FROM "organizacion" WHERE "id" = ANY($1::text[])`, orgs);
    },
    { timeout: 120_000, maxWait: 30_000 },
  );
}
