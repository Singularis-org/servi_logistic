// El libro de la caja SUMADO POR DIA calendario de Costa Rica.
//
// ─── POR QUE SQL CRUDO, otra vez y por el mismo motivo de siempre ───────────────────────
//
// `fecha_movimiento` es un INSTANTE (`timestamp`, no `@db.Date`) y `groupBy` de Prisma solo
// agrupa por COLUMNAS, nunca por expresiones: no hay forma de pedirle «agrupa por el dia
// calendario de Costa Rica de esta columna». La alternativa —una columna generada `fecha_cr`—
// no es declarable en el datamodel sin que el cliente la meta en los `INSERT` y rompa toda
// escritura del libro. Es el mismo callejon que ya documento la feature 180 para esta misma
// tabla, con la misma salida.
//
// UNA SOLA TABLA, la de siempre: `wallet_movimiento`. Ni un join. Parametrizado con
// `Prisma.sql`; `$queryRawUnsafe` no esta en el tipo del cliente y no puede estar.
//
// ─── LA FRONTERA DEL DIA: UNA SOLA DEFINICION, Y VIAJA COMO PARAMETRO ───────────────────
//
// En este SQL no se ESCRIBE ninguna zona: ni `America/Costa_Rica`, ni `date_trunc` con zona
// escrita, ni `interval '6 hours'`. SLT-42 (R22, R23; decision del humano del 2026-11-06): el
// dia se calcula con `AT TIME ZONE $n`, con la zona IANA del pais de la empresa como PARAMETRO
// —la misma con la que el servicio resolvio la ventana—, igual que en
// `ConteoCargadasPorDiaRepository`. Por eso los dias de esta serie y los de aquella empiezan y
// acaban en el mismo instante, tambien en los dias de 23 y 25 horas.
//
// ─── NO SE CLASIFICA NADA AQUI ──────────────────────────────────────────────────────────
//
// Sale desglosado por `(dia, categoria, tipo)` y la particion propio/terceros la hace
// `derivarFinanzasDiarias` con `NATURALEZA_POR_CATEGORIA`. Decidir aqui que es ganancia
// escribiria esa regla de negocio por segunda vez, dentro de una cadena de SQL donde nadie la
// buscaria.

import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

import type {
  AgregadoDiarioCajaRow,
  IFinanzasDiarioRepository,
} from "@/lib/interfaces/repositories/IFinanzasDiarioRepository";
import type { WalletMovimientoCategoria, WalletMovimientoTipo } from "@/lib/types/wallet";

/** Cliente MINIMO consumido: una sola consulta cruda. */
type FinanzasDiarioPrismaClient = Pick<PrismaClient, "$queryRaw">;

/**
 * El dia calendario de `fecha_movimiento` en la zona `zona`, como TEXTO `YYYY-MM-DD`.
 *
 * `fecha_movimiento` es `timestamp` SIN zona con el reloj de pared UTC: `AT TIME ZONE 'UTC'` lo
 * vuelve el instante y `AT TIME ZONE $zona` da el reloj de pared de esa zona, con su horario de
 * verano (R23). La zona es un PARAMETRO (`$n::text`; el cast evita el `42P18`), nunca
 * interpolada. Texto y no `date` porque una columna `date` vuelve del driver como un `Date` de
 * JavaScript y cada consumidor tendria que volver a elegir huso para leerla.
 *
 * Exportado solo para que el test de integracion lo ejecute contra Postgres sobre filas
 * sinteticas (alias `m`).
 */
export function diaDelMovimientoEnZona(zona: string): Prisma.Sql {
  return Prisma.sql`to_char(
  ((m."fecha_movimiento" AT TIME ZONE 'UTC') AT TIME ZONE ${zona}::text)::date,
  'YYYY-MM-DD'
)`;
}

/**
 * La fila cruda tal como la entrega `$queryRaw`. `SUM(monto)` es `numeric` y llega como
 * `Prisma.Decimal`: tiparlo explicitamente es lo unico que impide que el dinero se escape a
 * `number` sin que nadie lo note — `$queryRaw<T>` no valida nada.
 */
interface FilaCruda {
  readonly fecha: string;
  readonly categoria: WalletMovimientoCategoria;
  readonly tipo: WalletMovimientoTipo;
  /** `SUM(numeric)` llega como `Prisma.Decimal`; se admite tambien `string` porque asi es como
   *  lo entrega un doble de test —y algun driver— y `new Prisma.Decimal` acepta las dos sin
   *  pasar en ningun momento por `number`. */
  readonly total: Prisma.Decimal | string | null;
}

export class FinanzasDiarioRepository implements IFinanzasDiarioRepository {
  constructor(private readonly prisma: FinanzasDiarioPrismaClient) {}

  async sumarPorDia(desde: Date, hasta: Date, zona: string): Promise<readonly AgregadoDiarioCajaRow[]> {
    // ⚠ EL CAST ES `::timestamp`, NO `::timestamptz`, y esto se midio contra Postgres en la
    // feature 180: `fecha_movimiento` es `timestamp` SIN zona y guarda el reloj de pared UTC.
    // Con `::timestamptz`, Postgres interpretaria el texto en el huso de la SESION —el del
    // proceso de Node— y desplazaria toda frontera cinco o seis horas sin que nada fallara.
    //
    // Ventana SEMIABIERTA `[desde, hasta)`: el borde superior es la 00:00 CR del dia siguiente
    // al ultimo, asi que un `<=` metería ese dia entero.
    //
    // La tabla es APPEND-ONLY y sin soft delete (`db/schema.prisma`), asi que aqui no hay
    // ningun `deleted_at IS NULL` que poner: no es un olvido, es que no existe esa columna.
    const filas = await this.prisma.$queryRaw<FilaCruda[]>`
      SELECT ${diaDelMovimientoEnZona(zona)} AS fecha,
             m."categoria"              AS categoria,
             m."tipo"                   AS tipo,
             SUM(m."monto")             AS total
      FROM "wallet_movimiento" m
      WHERE m."fecha_movimiento" >= ${desde}::timestamp
        AND m."fecha_movimiento" <  ${hasta}::timestamp
      GROUP BY 1, 2, 3
      ORDER BY 1 ASC`;

    // `toFixed(2)` y NO `Number(...)`: el importe cruza esta frontera como STRING de escala 2 y
    // no vuelve a ser un numero en ningun punto del camino hasta la pantalla.
    return filas.map((f) => ({
      fecha: f.fecha,
      categoria: f.categoria,
      tipo: f.tipo,
      total: new Prisma.Decimal(f.total ?? 0).toFixed(2),
    }));
  }
}
