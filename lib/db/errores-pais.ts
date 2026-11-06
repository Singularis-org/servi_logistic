// SL-20 (design §2.2, §2.5) — los dos errores de país que lanza la base y su traducción.
//
//   · SL020 — el trigger `organizacion_pais_inmutable` (20261026130100): una escritura intentó cambiar
//     el país de una empresa (R7).
//   · SL021 — el trigger `geografia_del_pais_de_la_empresa` (20261026130300): una orden, una zona o una
//     marca de zona especial apuntó a geografía de otro país (R13, R38).
//
// Con la geografía filtrada por la RLS del país, la app normal no llega a mandar un id de otro país:
// estos errores solo aparecen ante un abuso (API, SQL a mano). Se traducen para que el borde los
// distinga de un fallo cualquiera, con el mismo patrón que `traducirErrorDeEmpresa` (SL017).

export const SQLSTATE_PAIS_INMUTABLE = "SL020";
export const SQLSTATE_GEOGRAFIA_DE_OTRO_PAIS = "SL021";

/** R7: la escritura intentó cambiar el país de una empresa. No se guardó nada. */
export class PaisInmutable extends Error {
  constructor(opciones?: { cause?: unknown }) {
    super("El país de una empresa no cambia", opciones);
    this.name = "PaisInmutable";
  }
}

/** R13, R38: la escritura apuntaba a una provincia, un cantón o un distrito de otro país. */
export class GeografiaDeOtroPais extends Error {
  constructor(opciones?: { cause?: unknown }) {
    super("La geografía no es del país de la empresa", opciones);
    this.name = "GeografiaDeOtroPais";
  }
}

// SLT-42 (design §4.2; R6, R28) — dos errores de dominio que NO vienen de la base: los lanza el
// servidor cuando al país le falta un dato que la operación necesita. No pasan por
// `traducirErrorDePais`. `withErrorHandler` no los tiene en su mapa (`lib/errors/normalize.ts`), así
// que salen como `{ status: "error", code: "INTERNAL" }` con el mensaje genérico de siempre; el
// mensaje propio solo nombra el país (un código ISO, no un dato personal).

/** R28: la operación necesita la zona horaria del país y el país aún no la tiene. No se escribió nada. */
export class PaisSinZonaHoraria extends Error {
  readonly paisId: string;
  constructor(paisId: string) {
    super(`El país ${paisId} no tiene zona horaria`);
    this.name = "PaisSinZonaHoraria";
    this.paisId = paisId;
  }
}

/** R6: al país le falta prefijo, dígitos nacionales, zona horaria o un tipo de documento activo. */
export class PaisIncompleto extends Error {
  readonly paisId: string;
  constructor(paisId: string) {
    super(`El país ${paisId} no tiene todos sus datos de teléfono, hora y documento`);
    this.name = "PaisIncompleto";
    this.paisId = paisId;
  }
}

// Las formas en que llega un SQLSTATE propio por Prisma 7 + adapter-pg están descritas en
// `lib/db/contexto-empresa.ts` (SQL a mano: P2010 con el código en el mensaje; operación de modelo:
// el `DriverAdapterError` con `cause.originalCode`; `pg` directo: `code`). Se recorre el mismo grafo.
const CLAVES_ANIDADAS = ["cause", "meta", "driverAdapterError"] as const;

function llevaSqlstate(e: unknown, sqlstate: string, vistos: Set<unknown>, profundidad: number): boolean {
  if (e === null || typeof e !== "object" || vistos.has(e) || profundidad > 6) return false;
  vistos.add(e);
  const o = e as Record<string, unknown>;
  if (o.code === sqlstate || o.originalCode === sqlstate) return true;
  if (o.code === "P2010" && typeof o.message === "string" && o.message.includes(`Code: \`${sqlstate}\``)) {
    return true;
  }
  return CLAVES_ANIDADAS.some((k) => llevaSqlstate(o[k], sqlstate, vistos, profundidad + 1));
}

/**
 * Convierte un error con SQLSTATE `SL020` en `PaisInmutable` y uno con `SL021` en
 * `GeografiaDeOtroPais` (con el original en `cause`); cualquier otro error se devuelve tal cual.
 * Pensado para `throw traducirErrorDePais(e)`.
 */
export function traducirErrorDePais(e: unknown): unknown {
  if (e instanceof PaisInmutable || e instanceof GeografiaDeOtroPais) return e;
  if (llevaSqlstate(e, SQLSTATE_PAIS_INMUTABLE, new Set(), 0)) return new PaisInmutable({ cause: e });
  if (llevaSqlstate(e, SQLSTATE_GEOGRAFIA_DE_OTRO_PAIS, new Set(), 0)) return new GeografiaDeOtroPais({ cause: e });
  return e;
}
