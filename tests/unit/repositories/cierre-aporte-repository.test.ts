import { describe, it, expect, vi } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";
import { CierreAporteRepository } from "@/lib/repositories/CierreAporteRepository";
import { CRITERIO_COD_RECAUDADO, CRITERIO_DE_APORTE } from "@/lib/utils/aporte-por-orden";

/**
 * Ficha 344 (T3.3, R21/R22) — la FORMA de la consulta del detalle.
 *
 * Este archivo ejecuta el codigo REAL del repositorio contra un doble que ANOTA los argumentos, y
 * afirma sobre el `where` emitido. Comprueba la FORMA; quien comprueba la CONDUCTA es
 * `tests/integration/db/detalle-movimiento-cierre-postgres.test.ts`, contra Postgres de verdad, y
 * ninguno de los dos sustituye al otro: en este repo esta medido cuatro veces que una mutacion
 * del `WHERE` pasa en verde por delante de un doble.
 */

const CIERRE = "c-1";
const TIENDA = "t-A";

function filaCongelada(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "cd-1",
    ordenId: "o-1",
    montoCobrar: new Prisma.Decimal("14900.00"),
    cobraComision: true,
    esCentral: false,
    esZonaEspecial: false,
    tiendaId: TIENDA,
    tarifaId: "ta-1",
    tarifaValorFlete: new Prisma.Decimal("1000.00"),
    tarifaValorFleteGam: new Prisma.Decimal("1500.00"),
    tarifaValorFleteDevuelto: new Prisma.Decimal("400.00"),
    tarifaValorFleteDevueltoGam: new Prisma.Decimal("600.00"),
    tarifaComisionCod: new Prisma.Decimal("3.50"),
    tarifaIvaFlete: new Prisma.Decimal("13.00"),
    tarifaIvaComisionCod: new Prisma.Decimal("13.00"),
    tarifaEspecial: null,
    tarifaEspecialDevuelta: null,
    numGuia: 501,
    numRemision: "REM-1",
    destinatario: "Ana",
    tiendaNombre: "Tienda A",
    orden: {
      gestiones: [
        // FICHA 468: la gestion trae tambien sus dos snapshots (pago al mensajero e indemnizacion).
        { resultado: "entregado", montoRecibido: new Prisma.Decimal("14900.00"), pagoMensajero: new Prisma.Decimal("1500.00"), indemnizacion: null },
        { resultado: "reprogramado", montoRecibido: null, pagoMensajero: null, indemnizacion: null },
      ],
    },
    ...over,
  };
}

function espia(filas: unknown[] = [filaCongelada()], total = 7) {
  const findMany = vi.fn(async (_args: unknown) => filas);
  const count = vi.fn(async (_args: unknown) => total);
  const findUnique = vi.fn(async (_args: unknown) => ({
    solicitadoAt: new Date("2026-08-20T18:30:00.000Z"),
    mensajero: { nombre: "Kendall", primerApellido: "Hernandez", segundoApellido: null },
  }));
  const prisma = {
    cierreDetail: { findMany, count },
    cierreDia: { findUnique },
  } as unknown as PrismaClient;
  return { repo: new CierreAporteRepository(prisma), findMany, count, findUnique };
}

/** El `where` que el repositorio le paso a `findMany` en su unica llamada. */
function whereDe(fn: { mock: { calls: unknown[][] } }): Record<string, unknown> {
  return (fn.mock.calls[0][0] as { where: Record<string, unknown> }).where;
}

const RANGO = { skip: 0, take: 25 };

/** El EXISTS de una rama: la gestion de ESTE cierre, con los resultados dados. */
function existeGestion(resultados: string[]) {
  return { gestiones: { some: { cierreId: CIERRE, resultado: { in: resultados } } } };
}

describe("CierreAporteRepository — la forma de la consulta (R21/R22)", () => {
  it("el criterio del concepto viaja dentro del where", async () => {
    const { repo, findMany, count } = espia();
    await repo.listarOrdenesQueAportan({
      cierreId: CIERRE,
      criterio: CRITERIO_DE_APORTE.ingreso_comision_cod,
      rango: RANGO,
    });

    const where = whereDe(findMany);
    expect(where.cierreId).toBe(CIERRE);
    // Los tres hechos de `cierre_detail` que exige la comision COD, en el WHERE y no en memoria.
    // SLT-52 (R41/R42): «hay tarifa congelada» = tarifa vieja (`tarifa_id`) o cierre del nuevo.
    // SLT-54 (R64): en el nuevo, con el concepto de la comision congelado. El hecho de la GESTION va
    // en cada rama, como un EXISTS acotado al MISMO cierre.
    expect(where.OR).toEqual([
      { tarifaId: { not: null }, orden: existeGestion(["entregado"]) },
      {
        tarifaModelo: "nuevo",
        conceptos: { some: { concepto: "tienda_comision_cod" } },
        orden: existeGestion(["entregado"]),
      },
    ]);
    expect(where.cobraComision).toBe(true);
    expect(where.montoCobrar).toEqual({ gt: 0 });

    // R28: el `count` va con el MISMO `where`, no con uno parecido.
    expect((count.mock.calls[0][0] as { where: unknown }).where).toEqual(where);
  });

  it("cada concepto lleva SU criterio: el flete no exige comision ni COD", async () => {
    const { repo, findMany } = espia();
    await repo.listarOrdenesQueAportan({
      cierreId: CIERRE,
      criterio: CRITERIO_DE_APORTE.ingreso_flete,
      rango: RANGO,
    });
    const where = whereDe(findMany);
    expect(where.OR).toEqual([
      { tarifaId: { not: null }, orden: existeGestion(["entregado"]) },
      {
        tarifaModelo: "nuevo",
        conceptos: { some: { concepto: "tienda_flete_entregado" } },
        orden: existeGestion(["entregado"]),
      },
    ]);
    // Las claves que NO exige sencillamente NO aparecen: un `false`/`undefined` explicito
    // cambiaria el SQL emitido.
    expect("cobraComision" in where).toBe(false);
    expect("montoCobrar" in where).toBe(false);
  });

  it("SLT-54 R64: el flete de lo que no es entrega: la rama vieja solo el rechazo, y una rama nueva por resultado", async () => {
    const { repo, findMany } = espia();
    await repo.listarOrdenesQueAportan({
      cierreId: CIERRE,
      criterio: CRITERIO_DE_APORTE.ingreso_flete_devolucion,
      rango: RANGO,
    });
    const nueva = (concepto: string, resultado: string) => ({
      tarifaModelo: "nuevo",
      conceptos: { some: { concepto } },
      orden: existeGestion([resultado]),
    });
    expect(whereDe(findMany).OR).toEqual([
      { tarifaId: { not: null }, orden: existeGestion(["devolucion_a_origen_por_rechazo"]) },
      nueva("tienda_flete_rechazo", "devolucion_a_origen_por_rechazo"),
      nueva("tienda_flete_reprogramado", "reprogramado"),
      nueva("tienda_flete_novedad", "novedad"),
      nueva("tienda_flete_incidente", "incidente"),
    ]);
  });

  it("el COD recaudado admite los cinco resultados y exige recaudo dentro del EXISTS", async () => {
    const { repo, findMany } = espia();
    await repo.listarOrdenesQueAportan({
      cierreId: CIERRE,
      criterio: CRITERIO_COD_RECAUDADO,
      rango: RANGO,
    });
    const where = whereDe(findMany);
    expect("tarifaId" in where).toBe(false);
    expect("OR" in where).toBe(false);
    expect(where.orden).toEqual({
      gestiones: {
        some: {
          cierreId: CIERRE,
          resultado: { in: ["entregado", "reprogramado", "novedad", "devolucion_a_origen_por_rechazo", "incidente"] },
          montoRecibido: { gt: 0 },
        },
      },
    });
  });

  it("R40: el tiendaId va DENTRO del where, y sin el la clave sencillamente no aparece", async () => {
    const conTienda = espia();
    await conTienda.repo.listarOrdenesQueAportan({
      cierreId: CIERRE,
      criterio: CRITERIO_DE_APORTE.ingreso_flete,
      tiendaId: TIENDA,
      rango: RANGO,
    });
    expect(whereDe(conTienda.findMany).tiendaId).toBe(TIENDA);
    // Tambien en el `count`: si el acotamiento se quedara fuera del conteo, el total diria
    // cuantas ordenes aportan en TODAS las tiendas del cierre.
    expect((conTienda.count.mock.calls[0][0] as { where: { tiendaId?: string } }).where.tiendaId).toBe(
      TIENDA,
    );

    const sinTienda = espia();
    await sinTienda.repo.listarOrdenesQueAportan({
      cierreId: CIERRE,
      criterio: CRITERIO_DE_APORTE.ingreso_flete,
      rango: RANGO,
    });
    expect("tiendaId" in whereDe(sinTienda.findMany)).toBe(false);
  });

  it("el EXISTS de gestiones lleva `{ cierreId, resultado }` y NADA MAS (ni `anuladaAt`)", async () => {
    // MONEY-CRITICAL. El feed que produjo el importe consulta
    // `gestionOrden.findMany({ where: { cierreId } })`, sin `anuladaAt: null`. Anadirlo aqui «por
    // prudencia» dejaria una gestion anulada despues de aprobar DENTRO del importe y FUERA del
    // detalle, y la suma dejaria de cuadrar. Este caso cae si alguien lo anade.
    const { repo, findMany } = espia();
    await repo.listarOrdenesQueAportan({
      cierreId: CIERRE,
      criterio: CRITERIO_DE_APORTE.ingreso_flete_devolucion,
      rango: RANGO,
    });
    // Todas las ramas: la del modelo viejo y las del nuevo.
    const ramas = whereDe(findMany).OR as Array<{ orden: { gestiones: { some: Record<string, unknown> } } }>;
    expect(ramas).toHaveLength(5);
    for (const rama of ramas) {
      expect(Object.keys(rama.orden.gestiones.some).sort()).toEqual(["cierreId", "resultado"]);
    }
    expect(ramas[0].orden.gestiones.some.resultado).toEqual({ in: ["devolucion_a_origen_por_rechazo"] });
  });

  it("R30: el orden es TOTAL — guia congelada con nulos al final, y `id` como desempate", async () => {
    const { repo, findMany } = espia();
    await repo.listarOrdenesQueAportan({
      cierreId: CIERRE,
      criterio: CRITERIO_DE_APORTE.ingreso_flete,
      rango: { skip: 50, take: 25 },
    });
    const args = findMany.mock.calls[0][0] as Record<string, unknown>;
    expect(args.orderBy).toEqual([{ numGuia: { sort: "asc", nulls: "last" } }, { id: "asc" }]);
    // Y el recorte es de la BASE (`skip`/`take`), no un `slice` posterior.
    expect(args.skip).toBe(50);
    expect(args.take).toBe(25);
  });

  it("R22: proyecta el SNAPSHOT congelado y no lee `tarifas` ni la orden vivas", async () => {
    const { repo, findMany } = espia();
    const pagina = await repo.listarOrdenesQueAportan({
      cierreId: CIERRE,
      criterio: CRITERIO_DE_APORTE.ingreso_flete,
      rango: RANGO,
    });
    const select = (findMany.mock.calls[0][0] as { select: Record<string, unknown> }).select;
    // Las entradas de la formula salen de las columnas CONGELADAS de `cierre_detail`.
    for (const columna of [
      "montoCobrar",
      "cobraComision",
      "esCentral",
      "esZonaEspecial",
      "tarifaId",
      "tarifaValorFlete",
      "tarifaValorFleteGam",
      "tarifaValorFleteDevuelto",
      "tarifaValorFleteDevueltoGam",
      "tarifaComisionCod",
      "tarifaIvaFlete",
      "tarifaIvaComisionCod",
      "tarifaEspecial",
      "tarifaEspecialDevuelta",
    ]) {
      expect(select[columna], `falta la columna congelada ${columna}`).toBe(true);
    }
    // De la ORDEN viva solo se leen sus gestiones de este cierre (el `resultado` es de la
    // GESTION, no del snapshot). Ni `montoCobrar`, ni `tienda`, ni `zona`, ni `tarifa`.
    expect(Object.keys((select.orden as { select: Record<string, unknown> }).select)).toEqual([
      "gestiones",
    ]);
    // Y lo descriptivo es el congelado, no el vivo.
    for (const columna of ["numGuia", "numRemision", "destinatario", "tiendaNombre"]) {
      expect(select[columna], `falta el descriptivo congelado ${columna}`).toBe(true);
    }

    // Money-safe en la proyeccion: Decimal -> STRING escala 2, y la tarifa reconstruida con la
    // MISMA funcion que usan los feeds.
    expect(pagina.items[0].orden.montoCobrar).toBe("14900.00");
    // SLT-52 (T5.3): el sobre que da `tarifaDe`; la vieja va dentro.
    const sobre = pagina.items[0].orden.tarifa;
    expect(sobre?.modelo).toBe("viejo");
    expect(sobre?.modelo === "viejo" ? sobre.tarifa.valorFlete : null).toBe("1000.00");
    expect(sobre?.modelo === "viejo" ? sobre.tarifa.comisionCod : null).toBe("3.50");
    expect(pagina.items[0].gestiones).toEqual([
      { resultado: "entregado", montoRecibido: "14900.00", pagoMensajero: "1500.00", indemnizacion: null },
      { resultado: "reprogramado", montoRecibido: null, pagoMensajero: null, indemnizacion: null },
    ]);
    expect(pagina.total).toBe(7); // el del `count`, no `items.length`
    expect(pagina.items).toHaveLength(1);
  });

  it("sin tarifa congelada, la tarifa reconstruida es null (gap R9 preservado)", async () => {
    const { repo } = espia([filaCongelada({ tarifaId: null })]);
    const pagina = await repo.listarOrdenesQueAportan({
      cierreId: CIERRE,
      criterio: CRITERIO_DE_APORTE.ingreso_flete,
      rango: RANGO,
    });
    expect(pagina.items[0].orden.tarifa).toBeNull();
  });

  it("R12: contar las ordenes del cierre lleva el mismo acotamiento por tienda", async () => {
    const { repo, count } = espia([], 23);
    expect(await repo.contarOrdenesDelCierre({ cierreId: CIERRE })).toBe(23);
    expect((count.mock.calls[0][0] as { where: Record<string, unknown> }).where).toEqual({
      cierreId: CIERRE,
    });

    const conTienda = espia([], 8);
    expect(await conTienda.repo.contarOrdenesDelCierre({ cierreId: CIERRE, tiendaId: TIENDA })).toBe(8);
    expect((conTienda.count.mock.calls[0][0] as { where: Record<string, unknown> }).where).toEqual({
      cierreId: CIERRE,
      tiendaId: TIENDA,
    });
  });

  it("R9: la cabecera trae la fecha del cierre y el nombre COMPLETO del mensajero", async () => {
    const { repo, findUnique } = espia();
    const cabecera = await repo.obtenerCabeceraDeCierre(CIERRE);
    expect(cabecera).toEqual({
      fecha: "2026-08-20T18:30:00.000Z",
      mensajeroNombre: "Kendall Hernandez",
    });
    expect((findUnique.mock.calls[0][0] as { where: unknown }).where).toEqual({ id: CIERRE });
  });

  it("un cierre que no esta devuelve null, sin inventar cabecera", async () => {
    const prisma = {
      cierreDetail: { findMany: vi.fn(), count: vi.fn() },
      cierreDia: { findUnique: vi.fn(async () => null) },
    } as unknown as PrismaClient;
    expect(await new CierreAporteRepository(prisma).obtenerCabeceraDeCierre("c-fantasma")).toBeNull();
  });
});
