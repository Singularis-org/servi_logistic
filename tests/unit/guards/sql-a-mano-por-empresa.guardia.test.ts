import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { EXCEPCIONES_SQL_A_MANO } from "@/lib/db/excepciones-aislamiento";
import { MODELOS_DE_NEGOCIO } from "@/lib/db/modelos-de-negocio";

import {
  archivosConSqlSinFiltro,
  archivosDeCodigo,
  archivosRepetidos,
  CARPETAS_SQL_A_MANO,
  leer,
  problemasDeExcepcion,
  sqlSinFiltro,
  tieneSqlAMano,
} from "./_aislamiento-por-empresa";

/**
 * SL-17 · R25, R26 — GUARDIA: EL SQL A MANO SOBRE NEGOCIO FILTRA POR EMPRESA O ESTÁ EN LA LISTA.
 *
 * La extensión no ve el SQL a mano: `$queryRaw` y compañía solo los acota la RLS. Un archivo de
 * `lib/` o `app/` que nombra una tabla de negocio en SQL y no menciona `organizacion_id` tiene que
 * estar en `EXCEPCIONES_SQL_A_MANO` con su ficha y su motivo. La lista solo baja: si un archivo de
 * la lista ya filtra (o ya no tiene SQL a mano), la guardia exige quitarlo.
 *
 * El detector vive en `_aislamiento-por-empresa.ts`, el mismo con el que se calculó la lista.
 */

const TABLAS = MODELOS_DE_NEGOCIO.map((m) => m.tabla);

describe("SL-17 · SQL a mano filtra por empresa (R25, R26)", () => {
  const sinFiltro = archivosConSqlSinFiltro(TABLAS);
  const enLista = new Set(EXCEPCIONES_SQL_A_MANO.map((e) => e.archivo));

  it("control positivo: el barrido encuentra código y SQL a mano de verdad", () => {
    const codigo = archivosDeCodigo(CARPETAS_SQL_A_MANO);
    expect(codigo.length).toBeGreaterThan(200);
    expect(codigo.filter((rel) => tieneSqlAMano(leer(rel))).length).toBeGreaterThan(0);
    expect(sinFiltro.length).toBeGreaterThan(0);
  });

  it("todo archivo con SQL a mano sobre negocio sin organizacion_id está en la lista", () => {
    const fuera = sinFiltro
      .filter((rel) => !enLista.has(rel))
      .map((rel) => `${rel} (nombra ${sqlSinFiltro(leer(rel), TABLAS)!.join(", ")})`);
    expect(
      fuera,
      "Filtra por organizacion_id, o añade el archivo a EXCEPCIONES_SQL_A_MANO con ficha y motivo",
    ).toEqual([]);
  });

  it("la lista solo baja: una excepción que ya filtra o ya no tiene SQL a mano se quita", () => {
    const sobran = EXCEPCIONES_SQL_A_MANO.map((e) => e.archivo).filter(
      (rel) => !sinFiltro.includes(rel),
    );
    expect(sobran, "Ya no hace falta: quítala de EXCEPCIONES_SQL_A_MANO").toEqual([]);
  });

  it("cada excepción trae ficha SL-<n>, motivo y un archivo que existe (R26)", () => {
    expect(EXCEPCIONES_SQL_A_MANO.flatMap((e) => problemasDeExcepcion(e))).toEqual([]);
    expect(archivosRepetidos(EXCEPCIONES_SQL_A_MANO)).toEqual([]);
  });

  it("la lista está ordenada (así un diff muestra qué entra y qué sale)", () => {
    const archivos = EXCEPCIONES_SQL_A_MANO.map((e) => e.archivo);
    expect(archivos).toEqual([...archivos].sort());
  });

  describe("autocomprobación con fuentes inventadas", () => {
    const consulta = (sql: string) =>
      `export async function f(prisma, id) {\n  return prisma.$queryRaw\`${sql}\`;\n}\n`;

    it.each([
      ["FROM sin comillas con alias", 'SELECT o.id FROM orden o WHERE o.id = ${id}'],
      ["JOIN entre comillas", 'SELECT 1 FROM "jobs" j JOIN "carga" c ON c.id = j.id'],
      ["UPDATE", 'UPDATE "wallet_movimiento" SET monto = 0'],
      ["INSERT INTO", "INSERT INTO historial_accion (id) VALUES (${id})"],
      ["DELETE FROM con esquema", 'DELETE FROM public."zona" WHERE id = ${id}'],
      ["columna calificada", 'SELECT "tarifas"."monto" FROM x'],
    ])("%s sin organizacion_id → falla", (_caso, sql) => {
      expect(sqlSinFiltro(consulta(sql), TABLAS)).not.toBeNull();
    });

    it("con Prisma.sql y $executeRawUnsafe también se detecta", () => {
      expect(sqlSinFiltro("const s = Prisma.sql`SELECT * FROM orden`;", TABLAS)).toEqual(["orden"]);
      expect(sqlSinFiltro('await tx.$executeRawUnsafe("UPDATE carga SET x = 1");', TABLAS)).toEqual([
        "carga",
      ]);
    });

    it("con organizacion_id en el código ya no falla", () => {
      const sql = 'SELECT o.id FROM orden o WHERE o."organizacion_id" = ${org}';
      expect(sqlSinFiltro(consulta(sql), TABLAS)).toBeNull();
    });

    it("organizacion_id solo en un comentario no cuenta como filtro", () => {
      const fuente = `// aquí no filtramos por organizacion_id\n${consulta("SELECT 1 FROM orden")}`;
      expect(sqlSinFiltro(fuente, TABLAS)).toEqual(["orden"]);
    });

    it("sin contexto SQL una palabra común no es una tabla (zona, carga, tarifas)", () => {
      const fuente =
        `const titulo = "Elige una zona para la carga y revisa las tarifas";\n` +
        `const filtro = { tabla: "orden" };\n` +
        consulta('SELECT id FROM "jobs" WHERE estado = ${id}');
      expect(sqlSinFiltro(fuente, TABLAS)).toBeNull();
    });

    it("una tabla que solo es prefijo de otra no se confunde (orden_x no es orden)", () => {
      expect(sqlSinFiltro(consulta("SELECT 1 FROM orden_x"), ["orden"])).toBeNull();
    });

    it("SQL a mano solo citado en un comentario no cuenta", () => {
      expect(tieneSqlAMano("// usar $queryRaw`SELECT * FROM orden`\nconst x = 1;")).toBe(false);
    });

    describe("el barrido de un árbol inventado", () => {
      const raiz = mkdtempSync(path.join(tmpdir(), "sl17-sql-a-mano-"));
      afterAll(() => rmSync(raiz, { recursive: true, force: true }));

      it("encuentra el archivo que no filtra e ignora tests y el que filtra", () => {
        mkdirSync(path.join(raiz, "lib/repos"), { recursive: true });
        mkdirSync(path.join(raiz, "app/x"), { recursive: true });
        writeFileSync(path.join(raiz, "lib/repos/Malo.ts"), consulta("SELECT 1 FROM orden"));
        writeFileSync(
          path.join(raiz, "lib/repos/Bueno.ts"),
          consulta("SELECT 1 FROM orden WHERE organizacion_id = ${o}"),
        );
        writeFileSync(path.join(raiz, "lib/repos/Malo.test.ts"), consulta("SELECT 1 FROM orden"));
        writeFileSync(path.join(raiz, "app/x/page.tsx"), consulta('UPDATE "carga" SET a = 1'));
        expect(archivosConSqlSinFiltro(TABLAS, raiz)).toEqual(["app/x/page.tsx", "lib/repos/Malo.ts"]);
      });
    });

    it("una excepción sin ficha válida, sin motivo o con archivo inexistente falla (R26)", () => {
      const mala = { archivo: "lib/no-existe.ts", ficha: "SL-x" as `SL-${number}`, motivo: " " };
      expect(problemasDeExcepcion(mala)).toHaveLength(3);
      expect(archivosRepetidos([mala, mala])).toEqual(["lib/no-existe.ts"]);
    });
  });
});
