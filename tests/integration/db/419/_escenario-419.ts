import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import type { IFileStorage } from "@/lib/interfaces/external/IFileStorage";
import type { ISignedUrlProvider } from "@/lib/interfaces/external/ISignedUrlProvider";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { DevolucionTiendaRepository } from "@/lib/repositories/DevolucionTiendaRepository";
import { DevolucionTiendaService } from "@/lib/services/DevolucionTiendaService";
import {
  crearPrismaDeTest,
  fksDeOrden,
  serializarEscriturasReales,
  type TxDeTest,
} from "../_postgres-real";

/**
 * FICHA 419 — escenario de los tests contra Postgres real de la confirmacion CENTRAL de entrega a
 * la tienda. Personas y ordenes PROPIAS (dos tiendas, un maestro, un admin, una adminSatelite);
 * catalogo y FKs geograficas leidos de la base. Dos modos:
 *   - `conEscenario419`: todo dentro de una transaccion REVERTIDA; el repositorio abre su
 *     `$transaction` como SAVEPOINT real (`clienteConSavepoint419`), asi que un `throw` dentro del
 *     repositorio revierte de verdad lo que el repositorio ya escribio (R11/R13 no pasan por
 *     accidente).
 *   - `sembrarComprometido419` + `limpiar419`: datos CONFIRMADOS para la concurrencia (R8), con
 *     dos conexiones reales; se borran por id al terminar.
 * Si falta catalogo, FALLA RUIDOSAMENTE. Sin base, la suite se salta con `describe.skip`.
 */

export const FOTO = [{ contentType: "image/jpeg", bytes: new Uint8Array([1, 2, 3]) }];

export interface Mundo419 {
  prisma: PrismaClient;
  provinciaId: string;
  cantonId: string;
  centralZonaId: string;
  tipoIdentificacionId: string;
  rolId: Map<string, string>;
  estatus: Map<string, string>;
}

let secuencia = 0;
const ALEATORIO = randomUUID().replace(/-/g, "").slice(0, 8);
const SUFIJO = `419f${Date.now().toString(36)}${ALEATORIO}`;
const GUIA_BASE = 419_000_000 + ((Date.now() + parseInt(ALEATORIO.slice(0, 6), 16)) % 30_000_000);

function clave(): string {
  secuencia += 1;
  return `${SUFIJO}${secuencia}`;
}
function guia(): number {
  secuencia += 1;
  return GUIA_BASE + secuencia;
}

export async function prepararMundo419(): Promise<Mundo419> {
  const prisma = crearPrismaDeTest();
  const fks = await fksDeOrden(prisma);
  if (fks === null) throw new Error("tabla `orden` vacia: corre `pnpm run db:seed`.");
  const u = await prisma.usuario.findFirst({ select: { tipoIdentificacionId: true } });
  if (u === null) throw new Error("hace falta al menos un usuario en la base.");
  const roles = await prisma.rol.findMany({ select: { id: true, value: true } });
  const rolId = new Map(roles.map((r) => [r.value as string, r.id]));
  for (const r of ["maestro", "admin", "adminTienda", "adminSatelite", "mensajero"]) {
    if (!rolId.has(r)) throw new Error(`falta el rol «${r}» en la base`);
  }
  const catalogo = await prisma.orderStatus.findMany({ select: { id: true, value: true } });
  const estatus = new Map(catalogo.map((c) => [c.value, c.id]));
  for (const v of ["devolviendo_a_tienda", "devuelta_a_tienda", "por_devolver_a_tienda"]) {
    if (!estatus.has(v)) throw new Error(`falta el estatus «${v}» en \`order_status\``);
  }
  const central = await prisma.zona.findFirst({ where: { esCentral: true }, select: { id: true } });
  if (central === null) {
    throw new Error(
      "la base no tiene zona central: esta suite necesita crear su zona en el test (SL-31).",
    );
  }
  return {
    prisma,
    provinciaId: fks.provinciaId,
    cantonId: fks.cantonId,
    centralZonaId: central.id,
    tipoIdentificacionId: u.tipoIdentificacionId,
    rolId,
    estatus,
  };
}

/** Error con el que `clienteConSavepoint419(tx, "enlace")` fuerza el fallo del paso 6 (R13). */
export class EnlaceCaido extends Error {
  constructor() {
    super("fallo PROVOCADO del enlace orden<->comprobante");
    this.name = "EnlaceCaido";
  }
}

/**
 * La tx del test con un `$transaction` que abre un SAVEPOINT REAL (tecnica de
 * `clienteConSavepoint`, ficha 373/362). `romper = "enlace"` sustituye
 * `devolucionTiendaOrden.createMany` por una funcion que LANZA: el UPDATE, el historial y el
 * webhook son los reales y ya se ejecutaron cuando falla.
 */
export function clienteConSavepoint419(tx: TxDeTest, romper?: "enlace"): PrismaClient {
  const proxy: unknown = new Proxy(tx as object, {
    get(objetivo, prop) {
      if (romper === "enlace" && prop === "devolucionTiendaOrden") {
        return {
          createMany: () => {
            throw new EnlaceCaido();
          },
        };
      }
      if (prop === "$transaction") {
        return async (fn: (t: unknown) => unknown) => {
          const punto = `sp_${randomUUID().replace(/-/g, "")}`;
          await tx.$executeRawUnsafe(`SAVEPOINT ${punto}`);
          try {
            const salida = await fn(proxy);
            await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${punto}`);
            return salida;
          } catch (error) {
            await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${punto}`);
            throw error;
          }
        };
      }
      const valor = Reflect.get(objetivo, prop) as unknown;
      return typeof valor === "function" ? valor.bind(objetivo) : valor;
    },
  });
  return proxy as PrismaClient;
}

/** Storage y firmador de mentira que apuntan lo que se sube y lo que se retira. */
export function storageEspia() {
  const subidos: string[] = [];
  const retirados: string[] = [];
  const storage: IFileStorage = {
    upload: async (input) => {
      subidos.push(input.path);
      return input.path;
    },
    remove: async (paths) => {
      retirados.push(...paths);
    },
  };
  const urls: ISignedUrlProvider = {
    createSignedUrl: async (ruta) => `https://firmada.test/${ruta}`,
    createSignedUrls: async (rutas) =>
      Object.fromEntries(rutas.map((r) => [r, `https://firmada.test/${r}`])),
  };
  return { storage, urls, subidos, retirados };
}

export type Estatus419 = "devolviendo_a_tienda" | "devuelta_a_tienda" | "por_devolver_a_tienda";

/** Personas propias + verbos. `db` es el cliente donde se escribe (tx o cliente comprometido). */
export async function crearPersonas419(mundo: Mundo419, db: TxDeTest | PrismaClient) {
  async function crearUsuario(rol: string): Promise<string> {
    const k = clave();
    const u = await db.usuario.create({
      data: {
        nombre: `${rol} 419 ${k}`,
        email: `${rol.toLowerCase()}419-${k}@example.test`,
        telefono: "88880000",
        passwordHash: "no-se-usa",
        cedula: `C419${k}`,
        tipoIdentificacionId: mundo.tipoIdentificacionId,
        rolId: mundo.rolId.get(rol) as string,
        zonaId: rol === "adminSatelite" ? mundo.centralZonaId : null,
        estado: "activo",
      },
      select: { id: true },
    });
    return u.id;
  }
  const tiendaA = await crearUsuario("adminTienda");
  const tiendaB = await crearUsuario("adminTienda");
  const maestroId = await crearUsuario("maestro");
  const adminId = await crearUsuario("admin");
  const mensajeroId = await crearUsuario("mensajero");

  const actorMaestro: Actor = { usuarioId: maestroId, rol: "maestro", zonaId: null };
  const actorAdmin: Actor = { usuarioId: adminId, rol: "admin", zonaId: null };

  const id = (v: string): string => {
    const r = mundo.estatus.get(v);
    if (r === undefined) throw new Error(`estatus «${v}» no esta en el catalogo`);
    return r;
  };

  async function sembrarOrden(o: {
    estatus: Estatus419;
    tiendaId?: string;
    borrada?: boolean;
  }): Promise<{ ordenId: string; numGuia: number }> {
    const k = clave();
    const numGuia = guia();
    const orden = await db.orden.create({
      data: {
        numGuia,
        numRemision: `R-${k}`,
        destinatario: `Dest ${k}`,
        telefonoDest: "88880000",
        producto: `Prod ${k}`,
        estatusId: id(o.estatus),
        montoCobrar: 0,
        tiendaId: o.tiendaId ?? tiendaA,
        zonaId: mundo.centralZonaId,
        provinciaId: mundo.provinciaId,
        cantonId: mundo.cantonId,
        deletedAt: o.borrada ? new Date() : null,
      },
      select: { id: true },
    });
    return { ordenId: orden.id, numGuia };
  }

  return {
    tiendaA,
    tiendaB,
    maestroId,
    adminId,
    mensajeroId,
    usuarios: [tiendaA, tiendaB, maestroId, adminId, mensajeroId],
    actorMaestro,
    actorAdmin,
    id,
    sembrarOrden,
  };
}

/** Lecturas sobre el cliente dado. */
export function lecturas419(mundo: Mundo419, db: TxDeTest | PrismaClient) {
  const devolviendo = mundo.estatus.get("devolviendo_a_tienda") as string;
  const devuelta = mundo.estatus.get("devuelta_a_tienda") as string;
  return {
    async estadoDe(ordenId: string): Promise<string> {
      const o = await db.orden.findUniqueOrThrow({
        where: { id: ordenId },
        select: { estatus: { select: { value: true } } },
      });
      return o.estatus.value;
    },
    /** Filas de historial `devolviendo_a_tienda -> devuelta_a_tienda` de la orden. */
    async historialDevuelta(ordenId: string) {
      return db.ordenHistorialEstado.findMany({
        where: { ordenId, estatusOrigenId: devolviendo, estatusDestinoId: devuelta },
        select: { actorUsuarioId: true, origenTipo: true },
      });
    },
    async historialTotal(ordenId: string): Promise<number> {
      return db.ordenHistorialEstado.count({ where: { ordenId } });
    },
    async enlaceDe(ordenId: string) {
      return db.devolucionTiendaOrden.findUnique({
        where: { ordenId },
        select: {
          comprobanteId: true,
          comprobante: { select: { tiendaId: true, subidoPor: true, createdAt: true } },
        },
      });
    },
    async comprobantesDe(tiendaId: string) {
      return db.devolucionTiendaComprobante.findMany({
        where: { tiendaId },
        select: {
          id: true,
          subidoPor: true,
          evidencias: { select: { storagePath: true, indice: true, contentType: true } },
          ordenes: { select: { ordenId: true } },
        },
      });
    },
  };
}

/** Servicio REAL sobre el cliente dado, con storage espia. */
export function montarServicio419(cliente: PrismaClient) {
  const espia = storageEspia();
  const repo = new DevolucionTiendaRepository(cliente);
  const service = new DevolucionTiendaService(repo, espia.storage, espia.urls);
  return { repo, service, ...espia };
}

/** Ejecuta `fn` en una transaccion REVERTIDA con el lock de aviso de escrituras reales. */
export async function conEscenario419<T>(
  mundo: Mundo419,
  fn: (tx: TxDeTest) => Promise<T>,
): Promise<T> {
  class Revertir extends Error {
    constructor(readonly valor: T) {
      super("rollback deliberado del test 419");
    }
  }
  try {
    await mundo.prisma.$transaction(
      async (tx) => {
        await serializarEscriturasReales(tx);
        throw new Revertir(await fn(tx));
      },
      { timeout: 60_000, maxWait: 30_000 },
    );
  } catch (error) {
    if (error instanceof Revertir) return error.valor;
    throw error;
  }
  throw new Error("la transaccion termino sin revertirse: imposible");
}

/** Borra, en orden de FKs, todo lo que un escenario CONFIRMADO pudo dejar. */
export async function limpiar419(
  prisma: PrismaClient,
  s: { usuarios: string[]; ordenIds: string[] },
): Promise<void> {
  const comprobantes = (
    await prisma.devolucionTiendaComprobante.findMany({
      where: { OR: [{ tiendaId: { in: s.usuarios } }, { subidoPor: { in: s.usuarios } }] },
      select: { id: true },
    })
  ).map((c) => c.id);
  await prisma.devolucionTiendaOrden.deleteMany({ where: { comprobanteId: { in: comprobantes } } });
  await prisma.devolucionTiendaEvidencia.deleteMany({ where: { comprobanteId: { in: comprobantes } } });
  await prisma.devolucionTiendaComprobante.deleteMany({ where: { id: { in: comprobantes } } });
  for (const ordenId of s.ordenIds) {
    await prisma.job.deleteMany({ where: { payload: { path: ["ordenId"], equals: ordenId } } });
  }
  await prisma.ordenHistorialEstado.deleteMany({ where: { ordenId: { in: s.ordenIds } } });
  await prisma.orden.deleteMany({ where: { id: { in: s.ordenIds } } });
  await prisma.notificacion.deleteMany({
    where: { OR: [{ destinatarioUsuarioId: { in: s.usuarios } }, { tiendaId: { in: s.usuarios } }] },
  });
  await prisma.usuario.deleteMany({ where: { id: { in: s.usuarios } } });
}
