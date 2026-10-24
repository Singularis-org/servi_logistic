import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SL-45 R17 — un pago a la plataforma registrado NO se edita ni se borra por ningún camino de la app.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// El pago es una fila de `wallet_movimiento` (categoría `egreso_pago_plataforma`). Desde la review B1
// el libro es append-only también en la BASE: `20261024140000_pago_plataforma_blindaje` le quita a
// `servi_app` el UPDATE y el DELETE (medido en `pago-plataforma-sl45-blindaje.test.ts`). Ese REVOKE
// solo vale mientras la app no los necesite, y eso es lo que esta guardia sostiene: si un día un
// módulo cambiara o borrara filas del libro, aquí se pone rojo antes de que falle en producción con
// 42501. Lo que lo garantiza es que el único escritor del libro es su
// repositorio (`premio-ranking-alcance.guardia.test.ts`) y que ese escritor solo inserta. Esta guardia
// cierra lo segundo, que ninguna otra medía: ni un delegado de Prisma ni SQL crudo cambian o borran una
// fila del libro en `lib/`, `app/` o `scripts/`, y ningún contrato del libro ni del pago ofrece hacerlo.
// La corrección de un pago es «Anular…» (contra-asiento) y uno nuevo; que la anulación no toca la fila
// lo mide `tests/integration/db/descarga-pago-plataforma-sl45.test.ts` contra Postgres.

const RAIZ = path.resolve(__dirname, "../../..");

/** Las escrituras de Prisma que cambian o borran una fila. `create` no: insertar es lo que sí se hace. */
const MUTACIONES = ["update", "updateMany", "upsert", "delete", "deleteMany"];

function fuentesDe(carpeta: string): string[] {
  const abs = path.join(RAIZ, carpeta);
  const salida: string[] = [];
  for (const entrada of readdirSync(abs)) {
    const rel = `${carpeta}/${entrada}`;
    if (statSync(path.join(RAIZ, rel)).isDirectory()) salida.push(...fuentesDe(rel));
    else if (/\.(ts|tsx|sql)$/.test(entrada)) salida.push(rel);
  }
  return salida;
}

/** Código sin comentarios: se mide lo que se ejecuta, no lo que se explica. */
function codigoSinComentarios(ruta: string): string {
  return readFileSync(path.join(RAIZ, ruta), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^\s*--.*$/gm, "");
}

const FUENTES = [...fuentesDe("lib"), ...fuentesDe("app"), ...fuentesDe("scripts")];

/** Llamadas a un delegado de Prisma del libro que lo cambian o lo borran. */
function mutacionesPrisma(codigo: string): string[] {
  return [...codigo.matchAll(new RegExp(`walletMovimiento\\s*\\.\\s*(${MUTACIONES.join("|")})\\s*\\(`, "g"))].map((m) => m[0]);
}

/** SQL crudo que cambia o borra filas del libro (`UPDATE … wallet_movimiento`, `DELETE FROM … wallet_movimiento`). */
function mutacionesSql(codigo: string): string[] {
  const re = /\b(?:update\s+(?:only\s+)?(?:"?public"?\.)?"?wallet_movimiento"?(?![\w])|delete\s+from\s+(?:only\s+)?(?:"?public"?\.)?"?wallet_movimiento"?(?![\w])|truncate\s+(?:table\s+)?(?:"?public"?\.)?"?wallet_movimiento"?(?![\w]))/gi;
  return [...codigo.matchAll(re)].map((m) => m[0]);
}

/** Los nombres de los métodos de un contrato (`interface … { nombre(… }`). */
function metodosDe(ruta: string, interfaz: string): string[] {
  const codigo = codigoSinComentarios(ruta);
  const inicio = codigo.indexOf(`export interface ${interfaz}`);
  if (inicio < 0) throw new Error(`no se encontró \`${interfaz}\` en ${ruta}: la guardia no mediría nada`);
  const cuerpo = codigo.slice(inicio, codigo.indexOf("\n}", inicio));
  return [...cuerpo.matchAll(/^\s{2}(\w+)\s*[(<]/gm)].map((m) => m[1]);
}

const NOMBRE_DE_MUTACION = /^(update|upsert|delete|remove|borrar|eliminar|editar|actualizar|modificar|cambiar|corregir)/i;

describe("SL-45 R17 — el libro de la caja, y con él el pago a la plataforma, solo se anexa", () => {
  it("control: el censo lee el código de la app y reconoce las dos formas de escribir", () => {
    expect(FUENTES.length).toBeGreaterThan(500);
    expect(FUENTES).toContain("lib/repositories/WalletMovimientoRepository.ts");
    // Los detectores no están ciegos: reconocen cada forma de cambiar o borrar.
    expect(mutacionesPrisma("await tx.walletMovimiento.update({ where: { id } })")).toHaveLength(1);
    expect(mutacionesPrisma("this.prisma.walletMovimiento.deleteMany({})")).toHaveLength(1);
    expect(mutacionesPrisma("tx.walletMovimiento.createMany({ data })")).toEqual([]);
    expect(mutacionesSql('UPDATE "wallet_movimiento" SET monto = 1')).toHaveLength(1);
    expect(mutacionesSql("delete from wallet_movimiento where id = $1")).toHaveLength(1);
    expect(mutacionesSql('DELETE FROM "wallet_movimiento_anotacion"')).toEqual([]);
    expect(mutacionesSql("SELECT * FROM wallet_movimiento")).toEqual([]);
    // Y el escritor del libro sí escribe: inserta.
    expect(codigoSinComentarios("lib/repositories/WalletMovimientoRepository.ts")).toMatch(/walletMovimiento\s*\.\s*create(Many)?\s*\(/);
  });

  it("ningún módulo de lib/, app/ o scripts/ actualiza ni borra filas de `wallet_movimiento` con Prisma", () => {
    const hallazgos = FUENTES.flatMap((ruta) => mutacionesPrisma(codigoSinComentarios(ruta)).map((m) => `${ruta}: ${m}`));
    expect(hallazgos).toEqual([]);
  });

  it("ningún módulo de lib/, app/ o scripts/ actualiza ni borra filas de `wallet_movimiento` con SQL crudo", () => {
    const hallazgos = FUENTES.flatMap((ruta) => mutacionesSql(codigoSinComentarios(ruta)).map((m) => `${ruta}: ${m}`));
    expect(hallazgos).toEqual([]);
  });

  it("los contratos del libro y del pago no ofrecen editar ni borrar un movimiento", () => {
    const libro = metodosDe("lib/interfaces/repositories/IWalletMovimientoRepository.ts", "IWalletMovimientoRepository");
    const pago = metodosDe("lib/interfaces/repositories/IPagoPlataformaRepository.ts", "IPagoPlataformaRepository");
    // Control de no vacuidad: el recorte del contrato encuentra sus métodos de verdad.
    expect(libro).toContain("crearMovimientoRegistrado");
    expect(libro).toContain("listar");
    expect(pago).toContain("sumaPagosVigentes");
    expect([...libro, ...pago].filter((m) => NOMBRE_DE_MUTACION.test(m))).toEqual([]);
  });
});
