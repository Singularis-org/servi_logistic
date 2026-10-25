import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";

import { crearOrganizacion } from "../../../fabricas/organizaciones";
import { bajoLockDeEscrituraReal } from "../_postgres-real";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// FICHA 459 — piezas de los tests que pasan POR LAS SERVER ACTIONS y COMMITEAN.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// POR QUE COMMITEAN: la action construye su servicio con `getPrismaClient()` —el composition
// root REAL— y abre SU transaccion. Un test que la envolviera en una transaccion revertida ya no
// estaria probando el composition root (memoria «el composition root que no inyecta»). El precio
// es limpiar a mano: `limpiar459` borra, en el orden que exigen las FK, todo lo que cuelga de las
// personas sembradas, y corre en un `finally`.
//
// POR QUE UN CANDADO: el saldo inicial es UNICO en toda la base (R70). Dos archivos de esta ficha
// que registren un saldo inicial a la vez se pisarian. `conCandado459` toma un advisory lock de
// transaccion con una clave propia y lo sostiene mientras corre el cuerpo del test: los archivos
// de la 459 que escriben se serializan entre si, sin frenar a nadie mas.
//
// SL-17 — LA EMPRESA: cada siembra crea su organizacion COMMITEADA y la pone en cada usuario y en
// cada actor. Las escrituras directas del cliente del test (dueno de las tablas, sin la extension)
// la pasan explicita: sin empresa fijada, el `DEFAULT` de `organizacion_id` da NULL y salta el NOT
// NULL. Las actions, en cambio, resuelven la empresa por la extension; fuera de una peticion no hay
// cookie de la que sacarla, asi que el cuerpo del test corre dentro de `conEmpresa` (`conEmpresa459`).
//
// SL-17 T4.3b — la siembra y la limpieza de `organizacion`/`usuario` corren bajo el lock de la 227
// (`bajoLockDeEscrituraReal`): commitean fuera de una transaccion revertida y, sin el, se cruzaban con
// los `down.sql` serializados de la familia `notificacion` (40P01). Orden de locks: el candado 459 se
// toma ANTES que el de la 227 (siembra y limpieza van dentro del cuerpo), nunca al reves.

export const CLAVE_CANDADO_459 = 459_0001;

export async function conCandado459<T>(prisma: PrismaClient, cuerpo: () => Promise<T>): Promise<T> {
  let soltar: () => void = () => undefined;
  const fin = new Promise<void>((r) => {
    soltar = r;
  });
  let tomado: () => void = () => undefined;
  const listo = new Promise<void>((r) => {
    tomado = r;
  });
  const sosten = prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${CLAVE_CANDADO_459})`);
      tomado();
      await fin;
    },
    { timeout: 300_000, maxWait: 120_000 },
  );
  try {
    await listo;
    return await cuerpo();
  } finally {
    soltar();
    await sosten;
  }
}

export interface Personas459 {
  /** La empresa de todas las personas sembradas (SL-17). */
  organizacionId: string;
  maestro: Actor;
  admin: Actor;
  mensajero: Actor;
  tiendaId: string;
  tiendaNombre: string;
  tiendaInactivaId: string;
  otraTiendaId: string;
  usuarios: string[];
}

/** Siembra COMMITEADA de las personas de un test. Todas con sufijo aleatorio. */
export function sembrarPersonas459(prisma: PrismaClient): Promise<Personas459> {
  return bajoLockDeEscrituraReal(() => sembrarPersonasSinLock(prisma));
}

async function sembrarPersonasSinLock(prisma: PrismaClient): Promise<Personas459> {
  const roles = await prisma.rol.findMany({ select: { id: true, value: true } });
  const tipo = await prisma.tipoIdentificacion.findUnique({ where: { value: "cedula" }, select: { id: true } });
  const rolDe = (v: string) => {
    const r = roles.find((x) => x.value === v);
    if (r === undefined) throw new Error(`falta el rol «${v}»: corre \`pnpm run db:seed\``);
    return r.id;
  };
  if (tipo === null) throw new Error("falta el tipo `cedula`: corre `pnpm run db:seed`");
  const organizacionId = (await crearOrganizacion(prisma)).id;
  const sufijo = randomUUID().slice(0, 8);
  let n = 0;
  const usuarios: string[] = [];
  const crear = async (prefijo: string, rol: string, estado: "activo" | "inactivo" = "activo") => {
    const clave = `${sufijo}-${(n += 1)}`;
    const u = await prisma.usuario.create({
      data: {
        nombre: `${prefijo} 459 ${clave}`,
        email: `${prefijo.toLowerCase()}459e-${clave}@example.test`,
        telefono: "88880000",
        passwordHash: "x",
        cedula: `459E-${prefijo}-${clave}`,
        tipoIdentificacionId: tipo.id,
        rolId: rolDe(rol),
        estado,
        organizacionId,
      },
      select: { id: true, nombre: true },
    });
    usuarios.push(u.id);
    return u;
  };
  const maestro = await crear("Maestro", "maestro");
  const admin = await crear("Admin", "admin");
  const mensajero = await crear("Mensajero", "mensajero");
  const tienda = await crear("TiendaE", "adminTienda");
  const inactiva = await crear("TiendaI", "adminTienda", "inactivo");
  const otra = await crear("TiendaO", "adminTienda");
  return {
    organizacionId,
    maestro: { usuarioId: maestro.id, rol: "maestro", organizacionId },
    admin: { usuarioId: admin.id, rol: "admin", organizacionId },
    mensajero: { usuarioId: mensajero.id, rol: "mensajero", organizacionId },
    tiendaId: tienda.id,
    tiendaNombre: tienda.nombre,
    tiendaInactivaId: inactiva.id,
    otraTiendaId: otra.id,
    usuarios,
  };
}

/**
 * Ejecuta `cuerpo` con la empresa de las personas en contexto: es lo que, en una peticion, haria la
 * sesion. Sin esto, la action falla cerrado (`EmpresaNoResuelta` → `INTERNAL`) y el test no mide nada.
 */
export function conEmpresa459<T>(p: Personas459, cuerpo: () => Promise<T>): Promise<T> {
  return conEmpresa(p.organizacionId, cuerpo);
}

/**
 * Un cliente propio de un test de concurrencia, con la MISMA envoltura que `getPrismaClient()`: sus
 * transacciones fijan la empresa del contexto y bajan a `servi_app` (RLS y triggers de misma empresa
 * activos), como en produccion. Sin ella, el cliente pelado escribe con `organizacion_id` NULL y el
 * trigger lo rechaza. El resolutor devuelve null: la empresa solo puede venir de `conEmpresa459`.
 */
export function clienteConEmpresa459(base: PrismaClient): PrismaClient {
  return conAislamientoPorEmpresa(base, async () => null);
}

/**
 * La empresa de una tienda, leida de su usuario: las escrituras directas no pasan por la extension y
 * tienen que llevarla explicita. Leerla evita cambiar la firma de los helpers que ya usan ~30 tests.
 */
export async function empresaDe459(prisma: PrismaClient, usuarioId: string): Promise<string> {
  const u = await prisma.usuario.findUniqueOrThrow({ where: { id: usuarioId }, select: { organizacionId: true } });
  if (u.organizacionId === null) throw new Error(`el usuario ${usuarioId} no tiene empresa: siembralo con sembrarPersonas459`);
  return u.organizacionId;
}

/** Un credito de partida en el libro de una tienda (le da saldo a favor). Commiteado. */
export async function acreditar459(prisma: PrismaClient, tiendaId: string, monto: string): Promise<void> {
  await prisma.walletTiendaMovimiento.create({
    data: {
      organizacionId: await empresaDe459(prisma, tiendaId),
      tiendaId,
      tipo: "credito",
      categoria: "cod_recaudado",
      monto: new Prisma.Decimal(monto),
      origenTipo: "manual",
      origenId: null,
      descripcion: "semilla 459",
    },
  });
}

/**
 * Borra TODO lo que cuelga de las personas sembradas, en el orden que piden las FK (todas RESTRICT).
 * Los libros de dinero solo se borran aqui porque las filas son de ESTE test y nunca existieron
 * fuera de la base de pruebas.
 */
export async function limpiar459(prisma: PrismaClient, p: Personas459 | null): Promise<void> {
  if (p === null) return;
  await bajoLockDeEscrituraReal(() => limpiarSinLock(prisma, p));
}

async function limpiarSinLock(prisma: PrismaClient, p: Personas459): Promise<void> {
  const usuarios = p.usuarios;
  const pagos = await prisma.pagoPorCuentaTienda.findMany({
    where: { OR: [{ tiendaId: { in: usuarios } }, { registradoPor: { in: usuarios } }] },
    select: { id: true },
  });
  const aportes = await prisma.aporteCapital.findMany({
    where: { registradoPor: { in: usuarios } },
    select: { id: true },
  });
  // Ficha 457: los pagos de una tienda a la empresa de estas personas (documento propio).
  const abonos = await prisma.abonoTienda.findMany({
    where: { OR: [{ tiendaId: { in: usuarios } }, { registradoPor: { in: usuarios } }] },
    select: { id: true },
  });
  const documentos = [...pagos.map((x) => x.id), ...aportes.map((x) => x.id), ...abonos.map((x) => x.id)];
  await prisma.historialAccion.deleteMany({
    where: { OR: [{ entidadId: { in: documentos } }, { actorUsuarioId: { in: usuarios } }] },
  });
  await prisma.abonoTiendaAnulacion.deleteMany({ where: { abonoId: { in: abonos.map((x) => x.id) } } });
  await prisma.pagoPorCuentaTiendaAnulacion.deleteMany({ where: { pagoId: { in: pagos.map((x) => x.id) } } });
  await prisma.aporteCapitalAnulacion.deleteMany({ where: { aporteId: { in: aportes.map((x) => x.id) } } });
  // Ficha 461: las anulaciones cuelgan por FK RESTRICT de las filas de los libros; van ANTES.
  await prisma.cobroTiendaAnulacion.deleteMany({
    where: { OR: [{ anuladoPor: { in: usuarios } }, { cobro: { tiendaId: { in: usuarios } } }] },
  });
  await prisma.ajusteCajaAnulacion.deleteMany({
    where: { OR: [{ anuladoPor: { in: usuarios } }, { movimiento: { registradoPor: { in: usuarios } } }] },
  });
  await prisma.walletMovimiento.deleteMany({
    where: { OR: [{ origenId: { in: documentos } }, { registradoPor: { in: usuarios } }] },
  });
  await prisma.walletTiendaMovimiento.deleteMany({
    where: { OR: [{ tiendaId: { in: usuarios } }, { registradoPor: { in: usuarios } }] },
  });
  // Los pagos de la empresa a una tienda que siembran los tests de concurrencia (T B.13).
  await prisma.liquidacionPago.deleteMany({ where: { tiendaId: { in: usuarios } } });
  await prisma.abonoTienda.deleteMany({ where: { id: { in: abonos.map((x) => x.id) } } });
  await prisma.pagoPorCuentaTienda.deleteMany({ where: { id: { in: pagos.map((x) => x.id) } } });
  await prisma.aporteCapital.deleteMany({ where: { id: { in: aportes.map((x) => x.id) } } });
  await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
  // La organizacion, la ultima: las tablas de negocio la referencian con ON DELETE RESTRICT, asi que
  // si queda algo sin borrar de ESTA empresa el delete falla y lo dice, en vez de dejar basura muda.
  await prisma.organizacion.delete({ where: { id: p.organizacionId } });
}

/**
 * Ficha 457 — deja a una tienda EN CONTRA: un debito `cobro_manual` como los de la 381 (origen manual,
 * sin linea de caja). Commiteado. Es la precondicion del pago de una tienda a la empresa (R14).
 */
export async function endeudar457(prisma: PrismaClient, tiendaId: string, monto: string): Promise<void> {
  await prisma.walletTiendaMovimiento.create({
    data: {
      organizacionId: await empresaDe459(prisma, tiendaId),
      tiendaId,
      tipo: "debito",
      categoria: "cobro_manual",
      monto: new Prisma.Decimal(monto),
      origenTipo: "manual",
      origenId: null,
      descripcion: "deuda sembrada 457",
    },
  });
}

/** Un `FormData` como el que arma el dialogo: solo las claves que se le pasan. */
export function formData459(campos: Record<string, string | Blob | undefined>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) {
    if (v !== undefined) f.append(k, v);
  }
  return f;
}
