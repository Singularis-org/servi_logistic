import { AsyncLocalStorage } from "node:async_hooks";

// SLT-121 (design §6.1; R11, R15, R17) — el permiso de escribir con la empresa congelada. El trigger
// `bloqueo_por_mora` deja pasar a `servi_app` solo si la transaccion trae `app.mora_permitida`; la
// envoltura de `extension-empresa.ts` lo fija con el motivo que haya aqui, en la misma sentencia que la
// empresa. Es un almacen propio y no un campo de `ContextoDatos`: el permiso lo concede quien sabe POR QUE
// la escritura vale (la wallet, el webhook, la cola) y la empresa puede salir de la sesion, no de un
// `conEmpresa` explicito. Donde se concede es una lista cerrada (guardia `mora-permiso-solo-en-lista`).
//
// En `globalThis` con `Symbol.for` por lo mismo que el contexto de empresa (`contexto-empresa.ts`): el
// middleware y la app cargan copias distintas del modulo en el mismo proceso, y la extension lee el
// almacen de la copia que creo el cliente.

export const MOTIVOS_EN_MORA = ["pago_plataforma", "cuenta_propia", "whatsapp_entrante", "sistema"] as const;
export type MotivoEnMora = (typeof MOTIVOS_EN_MORA)[number];

const CLAVE_ALMACEN = Symbol.for("servi-logistic.permiso-en-mora");
type ConAlmacen = { [CLAVE_ALMACEN]?: AsyncLocalStorage<MotivoEnMora> };
const almacen = ((globalThis as ConAlmacen)[CLAVE_ALMACEN] ??= new AsyncLocalStorage<MotivoEnMora>());

/**
 * Corre `fn` con el permiso `motivo`: lo que escriba dentro pasa el bloqueo de la mora. Espera dentro por
 * la misma razon que `conEmpresa`: una `PrismaPromise` es perezosa y su primer `then` fuera del almacen
 * correria sin el permiso.
 */
export function permitidoEnMora<T>(motivo: MotivoEnMora, fn: () => Promise<T>): Promise<T> {
  // Un motivo fuera de la lista no es un permiso: dejarlo pasar abriria el bloqueo con un texto cualquiera.
  if (!(MOTIVOS_EN_MORA as readonly string[]).includes(motivo)) {
    return Promise.reject(new TypeError(`permitidoEnMora: motivo desconocido «${String(motivo)}»`));
  }
  return almacen.run(motivo, async () => await fn());
}

/** El motivo vigente, o `null` si nadie lo concedio: entonces la envoltura fija `''` y el bloqueo aplica. */
export function permisoEnMoraActual(): MotivoEnMora | null {
  return almacen.getStore() ?? null;
}
