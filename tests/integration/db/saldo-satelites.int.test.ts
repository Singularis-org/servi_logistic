import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Prisma, type PrismaClient } from "@prisma/client";

import { quitarComentarios } from "../../fixtures/sin-comentarios";
import { SaldosSatelitesRepository } from "@/lib/repositories/SaldosSatelitesRepository";
import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⭑ FICHA 431 / T9 (R17/R18/R19/R20/R21/R22) — EL SALDO SIN CONCILIAR, CONTRA POSTGRES.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ POR QUE ESTE ARCHIVO NO PUEDE SER UN TEST CON DOBLES. Lo que se mide vive ENTERO en un `WHERE`
// y en dos `groupBy`: `estado <> 'rechazado'` para el dinero, y `conciliado_at IS NULL` para la
// cola. Un doble de Prisma devuelve lo que el test le diga y no ve el SQL — medido cuatro veces en
// este repo: una mutacion del `WHERE` pasa los tests de servicio en verde.
//
// LAS CUATRO POBLACIONES, que son los cuatro casos que la formula tiene que cubrir sin un `if`:
//   1. SIN MARCAR                -> aporta su efectivo INTEGRO;
//   2. MARCADA COMPLETA          -> aporta 0;
//   3. MARCADA POR MENOS (R18)   -> aporta LA DIFERENCIA. Es el caso de los ₡485.000 de ₡500.000,
//      y es el que desaparece si alguien «optimiza» la consulta del dinero filtrando por
//      `conciliado_at IS NULL`;
//   4. RECHAZADA                 -> NO aporta nada (queda fuera del conjunto).
//
// ⚠️ SLT-73 (D3/R5/R8) REABRIO LA Q2 DE LA 431: el saldo ya NO mide el efectivo. Es la deuda:
// Σ `paraLaCentral` de los `cierre_dia` aprobados con destino satelite − Σ recibido. Por eso cada
// consolidacion sembrada aqui lleva UN `cierre_dia` aprobado con su MISMO snapshot (pago y ganancia
// en cero, asi el esperado es el general). Las consolidaciones siguen sembrando SINPE distinto de
// cero, de forma que volver a `totalEfectivo` en el repositorio PONGA ESTO ROJO. Los casos propios
// de SLT-73 (sin consolidar, rechazada con cierres, aporte negativo, otra empresa) viven en
// `slt73-deuda-satelite.int.test.ts`.
//
// ⚠️ NADA DE `if (!fks) return;`: siembra sus propias filas y falla ruidosamente si no puede.
//
// AISLAMIENTO: transaccion SIEMPRE revertida + sufijo propio en los nombres de zona. Sin base
// alcanzable se SALTA, y en ese caso el verde de esta task NO cuenta.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;
const SUFIJO = `431-sal-${Date.now().toString(36)}`;

// ---------------------------------------------------------------------------------------------
// R19/R20 — money-safe, barrido ESTATICO con su contraprueba.
// ---------------------------------------------------------------------------------------------

const RAIZ = path.resolve(__dirname, "../../..");
const RUTA_REPO = "lib/repositories/SaldosSatelitesRepository.ts";

/** Las formas de perder un centimo convirtiendo el importe. `toFixed` sobre un `Decimal` NO lo es. */
const CONVERSIONES = [/\bNumber\s*\(/, /\bparseFloat\s*\(/, /\bparseInt\s*\(/] as const;

describe("431/R20 — el saldo no pasa por coma flotante (barrido estatico)", () => {
  const FUENTE = quitarComentarios(readFileSync(path.join(RAIZ, RUTA_REPO), "utf8"));

  it("anti-vacuidad: el fuente se leyo y es el que se cree", () => {
    expect(FUENTE.length).toBeGreaterThan(500);
    expect(FUENTE).toContain("Prisma.Decimal");
    expect(FUENTE).toContain("toFixed(2)");
  });

  it("CONTRAPRUEBA: el detector caza la conversion si se le da un cuerpo mutado", () => {
    const mutado = "{ return Number(efectivo).toFixed(2); }";
    expect(CONVERSIONES.some((re) => re.test(mutado))).toBe(true);
  });

  it("⭑ el repositorio real no convierte ningun importe a numero", () => {
    const infractoras = CONVERSIONES.filter((re) => re.test(FUENTE));
    expect(
      infractoras.map(String),
      "un importe del saldo pasa por coma flotante. `Prisma.Decimal` -> `toFixed(2)` y nada mas.",
    ).toEqual([]);
  });

  it("⭑ R19: el saldo NO se guarda — no hay columna ni escritura en este repositorio", () => {
    // El saldo se DERIVA en cada lectura. Este repositorio es de solo lectura por contrato, y esto
    // lo ancla: si alguien le añadiera una escritura «para cachear el saldo», se pone rojo.
    expect(FUENTE).not.toMatch(/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/);
  });
});

// ---------------------------------------------------------------------------------------------
// Contra Postgres: las cuatro poblaciones.
// ---------------------------------------------------------------------------------------------

describeSiHayBase("431/T9 — el saldo sin conciliar, con filas reales", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function sembrarZona(tx: TxDeTest, marca: string): Promise<string> {
    const fila = await tx.zona.create({
      data: {
        nombre: `Zona ${SUFIJO}-${marca}`,
        sinpeNumero: "80000000",
        sinpeNombre: "Titular de Prueba",
        cobroVehiculo: false,
        esCentral: false,
      },
      select: { id: true },
    });
    return fila.id;
  }

  /** Crea su propio usuario: la base de los tests puede no tener ninguno (SLT-73). */
  async function algunUsuarioId(tx: TxDeTest): Promise<string> {
    return (await crearUsuarioDePrueba(tx, "adminSatelite")).id;
  }

  interface Semilla {
    efectivo: string;
    simpe: string;
    estado?: "solicitado" | "aprobado" | "rechazado";
    /** `null` = sin marcar. Con valor, se escribe la marca COMPLETA (el CHECK lo exige). */
    recibido?: string | null;
    diasAtras?: number;
    /**
     * ⭑ FICHA 431 (frontend) — CUANDO se marco, en dias hacia atras. Solo aplica si hay
     * `recibido`. Existe porque «la ultima recibida» se ordena por `conciliado_at`, y con el
     * `new Date()` de antes todas las marcas caian en el mismo instante: el caso no podria
     * distinguir cual es la ultima y pasaria por casualidad.
     */
    conciliadaHaceDias?: number;
  }

  async function sembrarConsolidacion(
    tx: TxDeTest,
    zonaId: string,
    usuarioId: string,
    s: Semilla,
  ): Promise<string> {
    const estado = s.estado ?? "solicitado";
    const marcada = s.recibido != null;
    const solicitadoAt = new Date(Date.now() - (s.diasAtras ?? 0) * 86_400_000);
    const fila = await tx.cierreBodega.create({
      data: {
        zonaId,
        solicitadoPor: usuarioId,
        estado,
        solicitadoAt,
        totalEfectivo: new Prisma.Decimal(s.efectivo),
        totalSimpe: new Prisma.Decimal(s.simpe),
        totalGeneral: new Prisma.Decimal(s.efectivo).plus(new Prisma.Decimal(s.simpe)),
        ...(marcada
          ? {
              conciliadoAt: new Date(Date.now() - (s.conciliadaHaceDias ?? 0) * 86_400_000),
              conciliadoPor: usuarioId,
              montoRecibido: new Prisma.Decimal(s.recibido as string),
              resueltoAt: new Date(),
              resueltoPor: usuarioId,
            }
          : {}),
      },
      select: { id: true },
    });
    // SLT-73: el cierre del dia que la consolidacion agrupa, con su MISMO snapshot. Una rechazada no
    // lleva cierre: su recibido es siempre nulo (CHECK `cierre_bodega_conciliacion_coherente`) y lo
    // que se mide de ella aqui es que no sale en pantalla.
    if (estado !== "rechazado") {
      await tx.cierreDia.create({
        data: {
          mensajeroId: usuarioId,
          estado: "aprobado",
          destinoTipo: "bodega_satelite",
          destinoZonaId: zonaId,
          totalEfectivo: new Prisma.Decimal(s.efectivo),
          totalSimpe: new Prisma.Decimal(s.simpe),
          totalGeneral: new Prisma.Decimal(s.efectivo).plus(new Prisma.Decimal(s.simpe)),
          cierreBodegaId: fila.id,
        },
      });
    }
    return fila.id;
  }

  it("⭑ R17/R18: las CUATRO poblaciones en una sola bodega, y el saldo las cuadra", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const usuarioId = await algunUsuarioId(tx);
      const zonaId = await sembrarZona(tx, "cuatro");

      // 1. sin marcar          -> aporta 1400.00 (su general integro: SLT-73 cuenta el SINPE)
      await sembrarConsolidacion(tx, zonaId, usuarioId, {
        efectivo: "1000.00",
        simpe: "400.00",
        diasAtras: 5,
      });
      // 2. marcada por el efectivo -> aporta 200.00 (el SINPE que no llego)
      await sembrarConsolidacion(tx, zonaId, usuarioId, {
        efectivo: "800.00",
        simpe: "200.00",
        estado: "aprobado",
        recibido: "800.00",
      });
      // 3. marcada POR MENOS   -> aporta 115.00 (600 esperados, 485 recibidos)
      await sembrarConsolidacion(tx, zonaId, usuarioId, {
        efectivo: "500.00",
        simpe: "100.00",
        estado: "aprobado",
        recibido: "485.00",
      });
      // 4. RECHAZADA           -> NO aporta (fuera del conjunto)
      await sembrarConsolidacion(tx, zonaId, usuarioId, {
        efectivo: "9999.00",
        simpe: "0.00",
        estado: "rechazado",
      });

      const repo = new SaldosSatelitesRepository(tx as unknown as PrismaClient);
      const todos = await repo.findSaldosCompleto();
      return todos.find((s) => s.zonaId === zonaId) ?? null;
    });

    // Control positivo: la bodega sembrada esta en el resultado. Sin esto, «undefined» pasaria
    // cualquier aserción que no lo mire.
    expect(r, "la bodega sembrada no aparece en el listado de saldos").not.toBeNull();

    // ⭑ EL NUMERO (SLT-73). 1400 + 200 + 115 = 1715.00. Con la formula de la 431 (efectivo) seria
    // 1000 + 0 + 15 = 1015.00; si omitiera lo recibido, 3000.00. Numeros DISTINTOS de este.
    expect(r!.saldoSinConciliar).toBe("1715.00");
    expect(r!.aporteSinConsolidar).toBe("0.00");
    expect(r!.cierresSinConsolidar).toBe(0);

    // El contexto que viaja al lado, para que la resta sea auditable desde la pantalla.
    expect(r!.totalEfectivo).toBe("2300.00"); // 1000 + 800 + 500 (la rechazada, fuera)
    expect(r!.totalConsolidado).toBe("3000.00"); // + 400 + 200 + 100 de SINPE
    expect(r!.totalRecibido).toBe("1285.00"); // 800 + 485

    // R21: solo la SIN MARCAR sigue en la cola, y lleva 5 dias.
    expect(r!.consolidacionesSinConciliar).toBe(1);
    expect(r!.diasDeLaMasAntigua).toBe(5);
    expect(r!.fechaDeLaMasAntigua).not.toBeNull();
  });

  it("⭑ SLT-73 D3/R5: el SINPE SI cuenta — dos bodegas con el mismo general y distinto efectivo", async () => {
    // D3 (2026-10-31) reabrio la Q2 de la 431: el SINPE de la satelite es el medio por el que ella
    // cobra, y sigue siendo deuda con la central. Las dos bodegas deben lo mismo.
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const usuarioId = await algunUsuarioId(tx);
      const zEfectivo = await sembrarZona(tx, "todo-efectivo");
      const zSinpe = await sembrarZona(tx, "todo-sinpe");

      await sembrarConsolidacion(tx, zEfectivo, usuarioId, {
        efectivo: "1000.00",
        simpe: "0.00",
      });
      await sembrarConsolidacion(tx, zSinpe, usuarioId, { efectivo: "0.00", simpe: "1000.00" });

      const repo = new SaldosSatelitesRepository(tx as unknown as PrismaClient);
      const todos = await repo.findSaldosCompleto();
      return {
        efectivo: todos.find((s) => s.zonaId === zEfectivo),
        sinpe: todos.find((s) => s.zonaId === zSinpe),
      };
    });

    expect(r.efectivo, "falta la bodega de efectivo").toBeDefined();
    expect(r.sinpe, "falta la bodega de SINPE").toBeDefined();
    // Mismo consolidado…
    expect(r.efectivo!.totalConsolidado).toBe("1000.00");
    expect(r.sinpe!.totalConsolidado).toBe("1000.00");
    // …y la MISMA deuda. Con el efectivo, la de SINPE saldria «al dia» ("0.00").
    expect(r.efectivo!.saldoSinConciliar).toBe("1000.00");
    expect(r.sinpe!.saldoSinConciliar).toBe("1000.00");
  });

  it("R18: recibido de MAS -> el saldo queda NEGATIVO y no se recorta a cero", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const usuarioId = await algunUsuarioId(tx);
      const zonaId = await sembrarZona(tx, "de-mas");
      await sembrarConsolidacion(tx, zonaId, usuarioId, {
        efectivo: "100.00",
        simpe: "0.00",
        estado: "aprobado",
        recibido: "150.00",
      });
      const repo = new SaldosSatelitesRepository(tx as unknown as PrismaClient);
      const todos = await repo.findSaldosCompleto();
      return todos.find((s) => s.zonaId === zonaId) ?? null;
    });

    expect(r).not.toBeNull();
    expect(r!.saldoSinConciliar).toBe("-50.00");
  });

  it("una bodega SIN consolidaciones vale 0.00 y `null` de antiguedad, no un hueco", async () => {
    // El cero tiene que ser un importe decible: `null` obligaria a la pantalla a interpretarlo. Y
    // `diasDeLaMasAntigua` SI es `null`, porque «no hay cola» no es lo mismo que «la mas vieja es
    // de hoy».
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const zonaId = await sembrarZona(tx, "vacia");
      const repo = new SaldosSatelitesRepository(tx as unknown as PrismaClient);
      const todos = await repo.findSaldosCompleto();
      return todos.find((s) => s.zonaId === zonaId) ?? null;
    });

    expect(r).not.toBeNull();
    expect(r!.saldoSinConciliar).toBe("0.00");
    expect(r!.totalRecibido).toBe("0.00");
    expect(r!.consolidacionesSinConciliar).toBe(0);
    expect(r!.diasDeLaMasAntigua).toBeNull();
    expect(r!.fechaDeLaMasAntigua).toBeNull();
  });

  it("⭑ R21: la antiguedad es la de la MAS VIEJA SIN CONCILIAR, no la de la mas vieja", async () => {
    // Trampa real: la consolidacion mas antigua de la bodega puede estar YA conciliada. Si la
    // consulta de la cola no filtrara `conciliado_at IS NULL`, el numero diria 30 dias de una deuda
    // que no existe.
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const usuarioId = await algunUsuarioId(tx);
      const zonaId = await sembrarZona(tx, "antiguedad");
      // la MAS vieja, pero ya conciliada: NO cuenta
      await sembrarConsolidacion(tx, zonaId, usuarioId, {
        efectivo: "100.00",
        simpe: "0.00",
        estado: "aprobado",
        recibido: "100.00",
        diasAtras: 30,
      });
      // la mas vieja SIN conciliar
      await sembrarConsolidacion(tx, zonaId, usuarioId, {
        efectivo: "50.00",
        simpe: "0.00",
        diasAtras: 7,
      });
      await sembrarConsolidacion(tx, zonaId, usuarioId, {
        efectivo: "25.00",
        simpe: "0.00",
        diasAtras: 1,
      });
      const repo = new SaldosSatelitesRepository(tx as unknown as PrismaClient);
      const todos = await repo.findSaldosCompleto();
      return todos.find((s) => s.zonaId === zonaId) ?? null;
    });

    expect(r).not.toBeNull();
    expect(r!.consolidacionesSinConciliar).toBe(2);
    expect(r!.diasDeLaMasAntigua).toBe(7); // 7, NO 30
  });

  it("⭑ R22/R24: el desglose compone el total y deriva `faltaPorRecibir` en el SERVIDOR", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const usuarioId = await algunUsuarioId(tx);
      const zonaId = await sembrarZona(tx, "desglose");
      await sembrarConsolidacion(tx, zonaId, usuarioId, {
        efectivo: "500.00",
        simpe: "123.45",
        estado: "aprobado",
        recibido: "485.00",
      });
      await sembrarConsolidacion(tx, zonaId, usuarioId, { efectivo: "200.00", simpe: "0.00" });
      // Una rechazada, que NO debe salir en el desglose (D2: el estado se retira de la pantalla).
      await sembrarConsolidacion(tx, zonaId, usuarioId, {
        efectivo: "9999.00",
        simpe: "0.00",
        estado: "rechazado",
      });

      const repo = new SaldosSatelitesRepository(tx as unknown as PrismaClient);
      return repo.findConsolidacionesCompleto(zonaId);
    });

    expect(r).toHaveLength(2); // la rechazada, fuera
    const conciliada = r.find((c) => c.conciliado);
    const pendiente = r.find((c) => !c.conciliado);

    expect(conciliada, "falta la consolidacion conciliada").toBeDefined();
    expect(conciliada!.totales).toEqual({
      efectivo: "500.00",
      simpe: "123.45",
      transferencia: "0.00",
      general: "623.45",
    });
    expect(conciliada!.montoRecibido).toBe("485.00");
    // ⭑ SLT-73 (R8): sobre «Para la central» (aqui el general, sin pago ni ganancia):
    // 623.45 − 485 = 138.45. Con el efectivo serian 15.00.
    expect(conciliada!.paraLaCentral).toBe("623.45");
    expect(conciliada!.faltaPorRecibir).toBe("138.45");

    expect(pendiente, "falta la consolidacion pendiente").toBeDefined();
    expect(pendiente!.montoRecibido).toBeNull(); // `null`, no "0.00"
    expect(pendiente!.faltaPorRecibir).toBe("200.00");

    // ⭑ LA IDENTIDAD QUE CIERRA EL CIRCULO: la suma de la columna de detalle ES el saldo de la
    // bodega. Si las dos escalas usaran formulas distintas, esto se pone rojo.
    const suma = r
      .reduce((acc, c) => acc.plus(new Prisma.Decimal(c.faltaPorRecibir)), new Prisma.Decimal(0))
      .toFixed(2);
    expect(suma).toBe("338.45");
  });

  it("R24: `soloSinConciliar` recorta a la cola, y sin el vienen las dos poblaciones", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const usuarioId = await algunUsuarioId(tx);
      const zonaId = await sembrarZona(tx, "recorte");
      await sembrarConsolidacion(tx, zonaId, usuarioId, {
        efectivo: "10.00",
        simpe: "0.00",
        estado: "aprobado",
        recibido: "10.00",
      });
      await sembrarConsolidacion(tx, zonaId, usuarioId, { efectivo: "20.00", simpe: "0.00" });
      const repo = new SaldosSatelitesRepository(tx as unknown as PrismaClient);
      return {
        todas: await repo.findConsolidacionesCompleto(zonaId),
        soloCola: await repo.findConsolidacionesCompleto(zonaId, true),
      };
    });

    expect(r.todas).toHaveLength(2);
    expect(r.soloCola).toHaveLength(1);
    expect(r.soloCola[0].conciliado).toBe(false);
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // ⭑ FICHA 431 (pasada de FRONTEND) — LA ULTIMA RECIBIDA, y LAS TRES CIFRAS DE CABECERA.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  //
  // Las dos lecturas que la pantalla añadio y que NACIERON SIN TEST en el rescate del WIP. Van
  // aqui y no en un unitario con dobles por el mismo motivo que todo lo de arriba: lo que hay
  // que medir vive en un `WHERE` y en un `_max`, y un doble de Prisma devuelve lo que el test le
  // diga sin mirar el SQL.

  it("⭑ la ULTIMA recibida es UNA fila — la mas reciente por `conciliado_at`, no la suma", async () => {
    // LA CONFUSION QUE ESTE CASO EXISTE PARA IMPEDIR: la columna se llama «Ultima recibida» y el
    // dato que tenia al lado (`totalRecibido`) es la SUMA historica. Se siembran TRES marcas en
    // dias distintos y con importes distintos para que las dos cifras no puedan coincidir.
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const usuarioId = await algunUsuarioId(tx);
      const zonaId = await sembrarZona(tx, "ultima");

      // La mas antigua.
      await sembrarConsolidacion(tx, zonaId, usuarioId, {
        efectivo: "100.00",
        simpe: "0.00",
        estado: "aprobado",
        recibido: "100.00",
        conciliadaHaceDias: 10,
      });
      // La de en medio.
      await sembrarConsolidacion(tx, zonaId, usuarioId, {
        efectivo: "200.00",
        simpe: "0.00",
        estado: "aprobado",
        recibido: "200.00",
        conciliadaHaceDias: 5,
      });
      // ⭑ LA ULTIMA, y llego INCOMPLETA: 500 declarados, 485 recibidos.
      await sembrarConsolidacion(tx, zonaId, usuarioId, {
        efectivo: "500.00",
        simpe: "0.00",
        estado: "aprobado",
        recibido: "485.00",
        conciliadaHaceDias: 1,
      });

      const repo = new SaldosSatelitesRepository(tx as unknown as PrismaClient);
      const todos = await repo.findSaldosCompleto();
      return todos.find((s) => s.zonaId === zonaId) ?? null;
    });

    expect(r, "la bodega sembrada no aparece").not.toBeNull();
    expect(r!.ultimaRecibida, "no se resolvio la ultima recibida").not.toBeNull();

    // ⭑ EL NUMERO: 485.00, el de la fila mas reciente. La SUMA seria 785.00 y la mas antigua
    // 100.00: los tres errores dan cifras DISTINTAS de esta.
    expect(r!.ultimaRecibida!.monto).toBe("485.00");
    expect(r!.totalRecibido).toBe("785.00");
    expect(r!.ultimaRecibida!.monto).not.toBe(r!.totalRecibido);

    // Y trae el declarado de ESA fila y su faltante, derivados en el SERVIDOR.
    expect(r!.ultimaRecibida!.declarado).toBe("500.00");
    expect(r!.ultimaRecibida!.faltaPorRecibir).toBe("15.00");
  });

  it("una bodega sin NINGUNA marca no tiene ultima recibida: `null`, no un cero", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const usuarioId = await algunUsuarioId(tx);
      const zonaId = await sembrarZona(tx, "sin-ultima");
      await sembrarConsolidacion(tx, zonaId, usuarioId, { efectivo: "50.00", simpe: "0.00" });
      const repo = new SaldosSatelitesRepository(tx as unknown as PrismaClient);
      const todos = await repo.findSaldosCompleto();
      return todos.find((s) => s.zonaId === zonaId) ?? null;
    });
    expect(r).not.toBeNull();
    // `null` = «nunca entrego». Un "0.00" diria «entrego cero colones», que es otra cosa.
    expect(r!.ultimaRecibida).toBeNull();
  });

  it("⭑ R20/R23 — las TRES cifras de cabecera salen de la MISMA formula que la tabla", async () => {
    // POR QUE ESTA LECTURA EXISTE: la pantalla NO PUEDE sumar los saldos de las bodegas en el
    // navegador (R20 prohibe aritmetica de dinero en el cliente). Estas tres cifras son sumas
    // sobre el conjunto entero, asi que las deriva el servidor — y con la MISMA `saldoDe` que la
    // columna de abajo, para que la cabecera y la tabla no puedan discrepar.
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const usuarioId = await algunUsuarioId(tx);
      const repo = new SaldosSatelitesRepository(tx as unknown as PrismaClient);
      const antes = await repo.findResumen();

      const zonaId = await sembrarZona(tx, "res-suma");
      // Una SIN marcar: aporta su efectivo INTEGRO (1000) al pendiente y 1 a la cola.
      await sembrarConsolidacion(tx, zonaId, usuarioId, { efectivo: "1000.00", simpe: "400.00" });
      // Una marcada POR MENOS: aporta la diferencia (15) y 1 a «con diferencia».
      await sembrarConsolidacion(tx, zonaId, usuarioId, {
        efectivo: "500.00",
        simpe: "0.00",
        estado: "aprobado",
        recibido: "485.00",
      });

      const despues = await repo.findResumen();
      const saldos = await repo.findSaldosCompleto();
      return { antes, despues, fila: saldos.find((s) => s.zonaId === zonaId) ?? null };
    });

    expect(r.fila, "falta la bodega sembrada").not.toBeNull();
    // La FILA de la tabla dice 1415.00 (1400 + 15). Con el efectivo diria 1015.00.
    expect(r.fila!.saldoSinConciliar).toBe("1415.00");

    // ⚠️ LA BASE ES COMPARTIDA: puede haber otras zonas satelite sembradas por otra suite, asi
    // que el resumen NO se compara contra un literal —seria un test que depende de lo que otro
    // dejo—. Lo que SI es una propiedad del codigo, siempre: la cabecera SUBE exactamente lo
    // que aporta la fila, que es lo que significa «la misma formula».
    const subida = new Prisma.Decimal(r.despues.pendienteTotal)
      .minus(r.antes.pendienteTotal)
      .toFixed(2);
    expect(subida).toBe(r.fila!.saldoSinConciliar);

    // Y los conteos suben uno cada uno: una sin marcar y una incompleta.
    expect(r.despues.consolidacionesSinConciliar).toBe(r.antes.consolidacionesSinConciliar + 1);
    expect(r.despues.consolidacionesConDiferencia).toBe(r.antes.consolidacionesConDiferencia + 1);
    expect(r.despues.bodegasConPendiente).toBe(r.antes.bodegasConPendiente + 1);
  });

  it("⭑ el resumen EXCLUYE las rechazadas, igual que la tabla", async () => {
    // El mismo `WHERE` que la tabla, medido: se siembra una consolidacion ENORME `rechazado` y
    // se comprueba que el pendiente total NO se mueve. Sin el filtro, este caso veria aparecer
    // ₡999.999 de la nada.
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const usuarioId = await algunUsuarioId(tx);
      const repo = new SaldosSatelitesRepository(tx as unknown as PrismaClient);
      const antes = await repo.findResumen();

      const zonaId = await sembrarZona(tx, "res-rechazada");
      await sembrarConsolidacion(tx, zonaId, usuarioId, {
        efectivo: "999999.00",
        simpe: "0.00",
        estado: "rechazado",
      });
      const despues = await repo.findResumen();
      return { antes, despues };
    });

    expect(r.despues.pendienteTotal).toBe(r.antes.pendienteTotal);
    expect(r.despues.consolidacionesSinConciliar).toBe(r.antes.consolidacionesSinConciliar);
    expect(r.despues.bodegasConPendiente).toBe(r.antes.bodegasConPendiente);
  });

  it("⭑ «con diferencia» solo cuenta el faltante POSITIVO: una de mas no compensa a una de menos", async () => {
    // Son dos bultos y dos conversaciones distintas. Sumarlas con signo dejaria la tarjeta en
    // cero justo cuando hay DOS problemas, no ninguno.
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const usuarioId = await algunUsuarioId(tx);
      const repo = new SaldosSatelitesRepository(tx as unknown as PrismaClient);
      const antes = await repo.findResumen();

      const zonaId = await sembrarZona(tx, "res-compensa");
      // Llego de MENOS: faltan 100.
      await sembrarConsolidacion(tx, zonaId, usuarioId, {
        efectivo: "1000.00",
        simpe: "0.00",
        estado: "aprobado",
        recibido: "900.00",
      });
      // Llego de MAS: sobran 100. NO debe cancelar a la anterior en la tarjeta.
      await sembrarConsolidacion(tx, zonaId, usuarioId, {
        efectivo: "1000.00",
        simpe: "0.00",
        estado: "aprobado",
        recibido: "1100.00",
      });
      const despues = await repo.findResumen();
      return { antes, despues };
    });

    // UNA sola cuenta como «con diferencia» (la que falto), y su importe es el faltante entero.
    expect(r.despues.consolidacionesConDiferencia).toBe(r.antes.consolidacionesConDiferencia + 1);
    const subida = new Prisma.Decimal(r.despues.diferenciaTotal)
      .minus(r.antes.diferenciaTotal)
      .toFixed(2);
    expect(subida).toBe("100.00");

    // Y el PENDIENTE total si se compensa —ahi el signo si cuenta—: +100 − 100 = 0.
    expect(r.despues.pendienteTotal).toBe(r.antes.pendienteTotal);
  });

  it("la pagina es un segmento del conjunto: mismo criterio y mismo orden", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const usuarioId = await algunUsuarioId(tx);
      const zonaId = await sembrarZona(tx, "pagina");
      for (const dias of [1, 2, 3, 4, 5]) {
        await sembrarConsolidacion(tx, zonaId, usuarioId, {
          efectivo: "10.00",
          simpe: "0.00",
          diasAtras: dias,
        });
      }
      const repo = new SaldosSatelitesRepository(tx as unknown as PrismaClient);
      const completo = await repo.findConsolidacionesCompleto(zonaId);
      const pagina = await repo.findConsolidacionesPaginado(zonaId, { skip: 2, take: 2 });
      return { completo, pagina };
    });

    expect(r.completo).toHaveLength(5);
    expect(r.pagina.total).toBe(5); // el total del CONJUNTO, no de la pagina
    expect(r.pagina.items.map((c) => c.cierreBodegaId)).toEqual(
      r.completo.slice(2, 4).map((c) => c.cierreBodegaId),
    );
  });
});
