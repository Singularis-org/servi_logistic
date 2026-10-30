import { AsyncLocalStorage } from "node:async_hooks";

import { llevaSqlstate } from "./sqlstate";

// SL-17 (design §5) — el contexto de datos de cada operacion: una empresa, un contexto de
// plataforma declarado, o nada. Vive en `AsyncLocalStorage` para que lo herede todo lo que se
// ejecuta dentro de `conEmpresa`/`comoPlataforma` sin pasarlo de mano en mano por las capas.
// Sin contexto explicito, la extension (`extension-empresa.ts`) lo resuelve desde la sesion.

export type FichaJira = `SL-${number}`;

export type ContextoDatos =
  | { tipo: "empresa"; organizacionId: string; enTransaccion?: boolean }
  | { tipo: "plataforma"; ficha: FichaJira; motivo: string };

// El almacen vive en `globalThis`, como el cliente (`__prisma__` en `prisma-client.ts`), y no en
// una constante de modulo. En `next dev`/`next start` el middleware y la app cargan copias
// distintas de este modulo en el mismo proceso: el cliente singleton lo crea la primera copia que
// llega y su extension lee el almacen de ESA copia, asi que el `comoPlataforma` de la otra
// escribia en un almacen que nadie leia y el login caia en `EmpresaNoResuelta`. Con una sola
// instancia por proceso, todas las copias leen y escriben el mismo contexto. `Symbol.for` da la
// misma clave en todas las copias sin ensuciar el espacio de nombres global.
const CLAVE_ALMACEN = Symbol.for("servi-logistic.contexto-datos");
type ConAlmacen = { [CLAVE_ALMACEN]?: AsyncLocalStorage<ContextoDatos> };
const almacen = ((globalThis as ConAlmacen)[CLAVE_ALMACEN] ??= new AsyncLocalStorage<ContextoDatos>());

export function contextoActual(): ContextoDatos | undefined {
  return almacen.getStore();
}

// Las operaciones de Prisma son perezosas: `conEmpresa(id, () => prisma.orden.findMany())`
// devuelve una `PrismaPromise` que no se ejecuta hasta su primer `then`, y ese `then` lo haria el
// llamador FUERA del contexto. Esperarla aqui dentro hace que la consulta corra con la empresa.
async function esperarDentro<T>(fn: () => Promise<T>): Promise<T> {
  return await fn();
}

export function conEmpresa<T>(organizacionId: string, fn: () => Promise<T>): Promise<T> {
  // Un id vacio no es «una empresa»: dejarlo pasar fijaria `app.organizacion_id = ''`, que la
  // politica trata como sin empresa, y el fallo apareceria lejos de aqui y con otro nombre.
  if (typeof organizacionId !== "string" || organizacionId.trim() === "") {
    return Promise.reject(new TypeError("conEmpresa: organizacionId vacio"));
  }
  return almacen.run({ tipo: "empresa", organizacionId }, () => esperarDentro(fn));
}

export function comoPlataforma<T>(
  ficha: FichaJira,
  motivo: string,
  fn: () => Promise<T>,
): Promise<T> {
  // La ficha y el motivo son el rastro de por que un camino opera sin filtro (R15, R27): sin
  // ellos la excepcion no se puede auditar.
  if (!/^SL-\d+$/.test(ficha) || motivo.trim() === "") {
    return Promise.reject(new TypeError("comoPlataforma: hace falta una ficha SL-<n> y un motivo"));
  }
  return almacen.run({ tipo: "plataforma", ficha, motivo }, () => esperarDentro(fn));
}

/**
 * Solo para `extension-empresa.ts`: marca que la transaccion en curso ya fijo la empresa, para
 * que las operaciones de dentro no abran otra transaccion (que iria en otra conexion).
 */
export function dentroDeTransaccionDeEmpresa<T>(organizacionId: string, fn: () => Promise<T>): Promise<T> {
  return almacen.run({ tipo: "empresa", organizacionId, enTransaccion: true }, () => esperarDentro(fn));
}

/* -------------------------------------------------------------------------- */
/* Errores                                                                     */
/* -------------------------------------------------------------------------- */

/** R11, R14: operacion de negocio (o SQL a mano) sin empresa ni plataforma. No se ejecuto. */
export class EmpresaNoResuelta extends Error {
  readonly modelo: string;
  readonly operacion: string;
  constructor(modelo: string, operacion: string) {
    super(`Sin empresa en contexto para ${modelo}.${operacion}: la operacion no se ejecuto`);
    this.name = "EmpresaNoResuelta";
    this.modelo = modelo;
    this.operacion = operacion;
  }
}

/** R10, R37, R38: datos de otra empresa, o una fila que cambiaria de empresa. */
export class EmpresaCruzada extends Error {
  readonly modelo: string;
  constructor(modelo: string, opciones?: { cause?: unknown }) {
    super(`Datos de otra empresa en ${modelo}`, opciones);
    this.name = "EmpresaCruzada";
    this.modelo = modelo;
  }
}

/** R35: crear un usuario sin empresa solo vale con `organizacionId: null` escrito a proposito. */
export class UsuarioSinEmpresa extends Error {
  constructor() {
    super("Usuario sin empresa: en plataforma hay que pasar organizacionId (null solo a proposito)");
    this.name = "UsuarioSinEmpresa";
  }
}

/* -------------------------------------------------------------------------- */
/* Traduccion del SQLSTATE SL017 (triggers de misma empresa, design §3 M3)     */
/* -------------------------------------------------------------------------- */

export const SQLSTATE_EMPRESA_CRUZADA = "SL017";

// Las formas en que llega el SQLSTATE por Prisma 7.8 + adapter-pg, y por que se recorre la cadena
// de causas, estan en `lib/db/sqlstate.ts` (SL-24 lo comparte para `SL024`).

/**
 * Convierte un error con SQLSTATE `SL017` en `EmpresaCruzada` (con el original en `cause`);
 * cualquier otro error se devuelve tal cual. Pensado para `throw traducirErrorDeEmpresa(e)`.
 */
export function traducirErrorDeEmpresa(e: unknown, modelo?: string): unknown {
  if (e instanceof EmpresaCruzada || !llevaSqlstate(e, SQLSTATE_EMPRESA_CRUZADA)) return e;
  return new EmpresaCruzada(modelo ?? "desconocido", { cause: e });
}
