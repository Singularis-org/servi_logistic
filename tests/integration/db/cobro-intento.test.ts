import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { comoApp } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, bajoLockDeEscrituraReal, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import {
  AHORA_SQL,
  MONEDA_LOCAL,
  PROVEEDOR,
  aLaVezConCandado,
  anularConfirmado,
  avanzarIntento,
  confirmarPago,
  crearIntento,
  facturaCerradaCon,
  historialDeIntento,
  intentosDeFactura,
  leerIntento,
  limpiarEmpresasCobro,
  obtenerOCrearIntento,
  orgDe,
  pagoPorConfirmar,
  prepararContextoCobro,
  registrarEnlace,
  registrarPorFuera,
  sembrarEmpresaCobro,
  type ContextoCobro,
  type EmpresaCobro,
} from "./_fixtures/cobro";
import { facturaEnCurso, type FacturaCerrada } from "./_fixtures/factura-cerrada";
import { capturar, revertida, sqlstateDe } from "./_fixtures/planes";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SLT-226 (design §8, «cobro-intento.test.ts, paso a paso») — EL INTENTO DE COBRO, SU MÁQUINA DE ESTADOS Y SU
// HISTORIAL, contra Postgres.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Dos empresas con personas reales (`sembrarPersonas459`):
//   · A: A1, una cerrada de 30 000 con 10 000 ya pagados por fuera (saldo 20 000, el ejemplo de R1); A2 y A3, cerradas
//     de 30 000 sin pagos; A0, una cerrada sin cargos (saldo 0, R5); y su factura en curso (R5);
//   · B: B1, una cerrada de 30 000: la «factura de otra empresa» (R5), el id externo repetido (R10) y la RLS (R26).
//
// Los pasos COMMITEADOS (R1, R2, R4, R10, R11, R25) van en orden y se apoyan en los anteriores; las restricciones de la
// base (R3, R5–R9, R26) se prueban como dueño en transacciones que se revierten (`revertida`), sobre intentos
// sembrados a mano: así el rechazo es de la base, no de la función que lo evitaría.
//
// MUTACIONES QUE LO MATAN (design §8; medidas el 2026-11-20 en una base desechable copiada de la migrada): 1) el único
// parcial sin `WHERE` (8 rojos: R11, el intento siguiente da 23505) o quitado (R4: el INSERT del dueño entra); 2) el
// trigger `cobro_intento_solo_avanza` que deja pasar todo (10 rojos: R7, R8, R10); 6) los dos triggers de §3.4
// quitados (8 rojos: R11 en sus tres caminos).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const OTRA_MONEDA = MONEDA_LOCAL === "USD" ? "EUR" : "USD";

let base: PrismaClient;
let otra: PrismaClient;
let sostenedor: PrismaClient;
let ctx: ContextoCobro | undefined;
let A: EmpresaCobro | undefined;
let B: EmpresaCobro | undefined;
const factura: Record<string, FacturaCerrada> = {};
const intento: Record<string, string> = {};
let pagoConfirmadoA1 = "";
let enCursoA = "";

const empresaA = () => A as EmpresaCobro;
const empresaB = () => B as EmpresaCobro;
const maestroA = () => empresaA().p.maestro.usuarioId;
const escribir = <T>(fn: () => Promise<T>) => bajoLockDeEscrituraReal(fn);

/** El SQLSTATE con el que falla `fn`, o `null` si no falla. */
async function errorDe(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return sqlstateDe(e);
  }
}

/** El SQLSTATE con el que falla `fn` dentro de un SAVEPOINT de `tx`, o `null`. */
async function errorEnTx(tx: TxDeTest, fn: () => Promise<unknown>): Promise<string | null> {
  const e = await capturar(tx, fn);
  return e === null ? null : sqlstateDe(e);
}

/** Cuántas filas de intento y de su historial tiene la empresa (para afirmar «sin escribir nada»). */
async function conteos(c: TxDeTest | PrismaClient, org: string) {
  const [f] = await c.$queryRawUnsafe<{ intentos: number; historial: number }[]>(
    `SELECT (SELECT count(*)::int FROM "cobro_intento" WHERE "organizacion_id" = $1) AS "intentos",
            (SELECT count(*)::int FROM "historial_plataforma" h
              WHERE h."entidad_tipo" = 'cobro_intento' AND h."detalle"->>'organizacion_id' = $1) AS "historial"`,
    org,
  );
  return f;
}

async function vivosDe(c: TxDeTest | PrismaClient, facturaId: string): Promise<string[]> {
  const filas = await c.$queryRawUnsafe<{ id: string }[]>(
    `SELECT "id" FROM "cobro_intento" WHERE "factura_id" = $1 AND "estado" IN ('creado', 'pendiente') ORDER BY "id"`,
    facturaId,
  );
  return filas.map((f) => f.id);
}

interface IntentoAMano {
  facturaId: string;
  montoLocal?: string;
  monedaCobro?: string;
  montoCobrado?: string;
  tasa?: string | null;
  tasaFuente?: string | null;
  tasaAt?: boolean;
  estado?: string;
  clave?: string;
}

/**
 * Un intento escrito por el DUEÑO saltándose las funciones: es lo que la base tiene que parar por sí sola (R4, R6–R9).
 * En moneda local por defecto, con la clave que pidan.
 */
async function insertarAMano(tx: TxDeTest, org: string, d: IntentoAMano): Promise<string> {
  const id = randomUUID();
  const montoLocal = d.montoLocal ?? "1000.00";
  await tx.$executeRawUnsafe(
    `INSERT INTO "cobro_intento"
       ("id", "organizacion_id", "factura_id", "proveedor", "clave", "monto_local", "moneda_local", "moneda_cobro",
        "monto_cobrado", "tasa", "tasa_fuente", "tasa_at", "estado", "created_at", "estado_at")
     VALUES ($1, $2, $3, $4, $5, $6::numeric, $7, $8, $9::numeric, $10::numeric, $11,
             CASE WHEN $12 THEN ${AHORA_SQL} END, $13, ${AHORA_SQL}, ${AHORA_SQL})`,
    id,
    org,
    d.facturaId,
    PROVEEDOR,
    d.clave ?? `a-mano|${id}`,
    montoLocal,
    MONEDA_LOCAL,
    d.monedaCobro ?? MONEDA_LOCAL,
    d.montoCobrado ?? montoLocal,
    d.tasa ?? null,
    d.tasaFuente ?? null,
    d.tasaAt ?? false,
    d.estado ?? "creado",
  );
  return id;
}

/** Un UPDATE del dueño sobre un intento. */
function actualizar(tx: TxDeTest, id: string, set: string, ...args: unknown[]) {
  return tx.$executeRawUnsafe(`UPDATE "cobro_intento" SET ${set} WHERE "id" = $1`, id, ...args);
}

async function estadoEnTx(tx: TxDeTest, id: string): Promise<string> {
  return (await leerIntento(tx, id)).estado;
}

/* -------------------------------------------------------------------------- */

describeSiHayBase("SLT-226 — el intento de cobro: creación, máquina de estados, historial y acceso (Postgres, design §8)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    otra = crearPrismaDeTest();
    sostenedor = crearPrismaDeTest();
    ctx = await prepararContextoCobro(base);

    A = await sembrarEmpresaCobro(ctx, "SLT226 A");
    B = await sembrarEmpresaCobro(ctx, "SLT226 B");

    factura.A1 = await facturaCerradaCon(ctx, A, "30000.00", "SLT226-A1");
    factura.A2 = await facturaCerradaCon(ctx, A, "30000.00", "SLT226-A2");
    factura.A3 = await facturaCerradaCon(ctx, A, "30000.00", "SLT226-A3");
    factura.A0 = await facturaCerradaCon(ctx, A, null, "SLT226-A0");
    factura.B1 = await facturaCerradaCon(ctx, B, "30000.00", "SLT226-B1");
    enCursoA = (await facturaEnCurso(base, orgDe(A))).id;

    // R1: 10 000 ya confirmados en A1. Por fuera (SLT-143), antes de que exista ningún intento.
    await escribir(() => registrarPorFuera(base, orgDe(empresaA()), "10000.00", [{ facturaId: factura.A1.id, monto: "10000.00" }], maestroA()));
  }, 300_000);

  afterAll(async () => {
    if (base === undefined) return;
    try {
      await limpiarEmpresasCobro(base, [A, B]);
    } finally {
      await ctx?.tarifa.soltar();
      await Promise.all([base.$disconnect(), otra?.$disconnect(), sostenedor?.$disconnect()]);
    }
  }, 300_000);

  /* ------------------------- control de no vacuidad ------------------------ */

  it("control: las funciones y los triggers existen, las facturas están cerradas y A1 tiene 20 000 de saldo", async () => {
    const funciones = await base.$queryRawUnsafe<{ proname: string }[]>(
      `SELECT DISTINCT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = ANY($1::text[]) ORDER BY p.proname`,
      [
        "_cobro_historial",
        "_cobro_intento_pasar",
        "cobro_intento_anular_por_saldo",
        "cobro_intento_avanzar",
        "cobro_intento_obtener_o_crear",
        "cobro_intento_registrar_enlace",
        "cobro_intento_solo_avanza",
      ],
    );
    expect(funciones).toHaveLength(7);
    const triggers = await base.$queryRawUnsafe<{ tgname: string }[]>(
      `SELECT t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND NOT t.tgisinternal AND t.tgname = ANY($1::text[]) ORDER BY t.tgname`,
      ["cobro_intento_saldo_anulacion", "cobro_intento_saldo_aplicacion", "cobro_intento_solo_avanza"],
    );
    expect(triggers).toHaveLength(3);
    const filas = await base.facturaPlataforma.findMany({
      where: { id: { in: Object.values(factura).map((f) => f.id) } },
      select: { estado: true },
    });
    expect(filas.map((f) => f.estado)).toEqual(Array(5).fill("cerrada"));
    const [s] = await base.$queryRawUnsafe<{ saldo: string }[]>(
      `SELECT s."saldo"::text AS "saldo" FROM factura_plataforma_saldos($1) s WHERE s."factura_id" = $2`,
      orgDe(empresaA()),
      factura.A1.id,
    );
    expect(s.saldo).toBe("20000.00");
    expect(await conteos(base, orgDe(empresaA()))).toEqual({ intentos: 0, historial: 0 });
  });

  /* ------------------------------ crear (capa 1) ---------------------------- */

  it("R1, R25: factura de 30 000 con 10 000 confirmados → intento `creado` de 20 000 en la moneda local, sin tasa, y una fila de historial con el país de A", async () => {
    const r = await escribir(() => obtenerOCrearIntento(base, orgDe(empresaA()), factura.A1.id, maestroA()));
    expect(r.resultado).toBe("creado");
    intento.a1 = r.intentoId as string;

    const i = await leerIntento(base, intento.a1);
    expect(i).toMatchObject({
      organizacionId: orgDe(empresaA()),
      facturaId: factura.A1.id,
      estado: "creado",
      motivoAnulacion: null,
      montoLocal: "20000.00",
      montoCobrado: "20000.00",
      monedaLocal: MONEDA_LOCAL,
      monedaCobro: MONEDA_LOCAL,
      tasa: null,
      tasaFuente: null,
      tasaAt: null,
      idExterno: null,
      pagoProveedorId: null,
      pagoId: null,
      creadoPor: maestroA(),
      clave: `${factura.A1.id}|20000.00|${MONEDA_LOCAL}|`,
    });

    const { paisId } = await base.organizacion.findUniqueOrThrow({ where: { id: orgDe(empresaA()) }, select: { paisId: true } });
    const h = await historialDeIntento(base, intento.a1);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({
      accion: "cobro_intento_transicion",
      entidadTipo: "cobro_intento",
      entidadId: intento.a1,
      paisId,
      actorUsuarioId: maestroA(),
      valorAnterior: null,
      valorNuevo: "creado",
    });
    expect(h[0].actorNombre).toEqual(expect.stringContaining("Maestro"));
    expect(h[0].entidadEtiqueta).toContain(`Factura N.º ${factura.A1.numero}`);
    expect(h[0].detalle).toMatchObject({ organizacion_id: orgDe(empresaA()), factura_id: factura.A1.id, moneda_cobro: MONEDA_LOCAL });
  });

  it("R2: pedirlo otra vez con la misma clave devuelve `existente` con el mismo id, sin otra fila ni otro historial", async () => {
    const antes = await conteos(base, orgDe(empresaA()));
    const r = await escribir(() => obtenerOCrearIntento(base, orgDe(empresaA()), factura.A1.id, maestroA()));
    expect(r).toEqual({ resultado: "existente", intentoId: intento.a1 });
    expect(await vivosDe(base, factura.A1.id)).toEqual([intento.a1]);
    expect(await conteos(base, orgDe(empresaA()))).toEqual(antes);
  });

  /* ------------------------------ el enlace (R10) ---------------------------- */

  it("R10, R25: registrar el enlace pasa el intento a `pendiente` con el id externo (historial sin actor); el mismo id da `ya_pendiente` y otro id da SL226", async () => {
    const ext = `ext-a1-${randomUUID()}`;
    intento.extA1 = ext;
    expect(await escribir(() => registrarEnlace(base, orgDe(empresaA()), intento.a1, ext))).toBe("ok");
    expect(await leerIntento(base, intento.a1)).toMatchObject({ estado: "pendiente", idExterno: ext });
    const h = await historialDeIntento(base, intento.a1);
    expect(h.map((f) => [f.valorAnterior, f.valorNuevo, f.actorUsuarioId])).toEqual([
      [null, "creado", maestroA()],
      ["creado", "pendiente", null],
    ]);

    expect(await escribir(() => registrarEnlace(base, orgDe(empresaA()), intento.a1, ext))).toBe("ya_pendiente");
    expect(await escribir(() => errorDe(() => registrarEnlace(base, orgDe(empresaA()), intento.a1, `otro-${randomUUID()}`)))).toBe("SL226");
    expect(await leerIntento(base, intento.a1)).toMatchObject({ estado: "pendiente", idExterno: ext });
    expect(await historialDeIntento(base, intento.a1)).toHaveLength(2);
  });

  it("R10: el mismo id externo en un intento de B da 23505 y el de B no cambia; el intento de B pedido con la empresa A da `no_vivo`", async () => {
    intento.b1 = await escribir(() => crearIntento(base, orgDe(empresaB()), factura.B1.id, empresaB().p.maestro.usuarioId));
    expect(await escribir(() => errorDe(() => registrarEnlace(base, orgDe(empresaB()), intento.b1, intento.extA1)))).toBe("23505");
    expect(await leerIntento(base, intento.b1)).toMatchObject({ estado: "creado", idExterno: null });
    expect(await escribir(() => registrarEnlace(base, orgDe(empresaA()), intento.b1, `ext-${randomUUID()}`))).toBe("no_vivo");
    expect(await leerIntento(base, intento.b1)).toMatchObject({ estado: "creado", idExterno: null });
  });

  /* --------------------------- el saldo cambia (R11) ------------------------- */

  it("R11, R25: con el vivo de 20 000, confirmar (SLT-60) un pago de 5 000 a A1 lo deja `anulado/saldo_cambiado` (historial sin actor), y el siguiente pedido es de 15 000", async () => {
    await escribir(async () => {
      pagoConfirmadoA1 = await pagoPorConfirmar(base, orgDe(empresaA()), "5000.00", maestroA());
      // Por confirmar no cambia el saldo: el vivo sigue vivo.
      expect((await leerIntento(base, intento.a1)).estado).toBe("pendiente");
      await confirmarPago(base, orgDe(empresaA()), pagoConfirmadoA1, [{ facturaId: factura.A1.id, monto: "5000.00" }], maestroA());
    });
    expect(await leerIntento(base, intento.a1)).toMatchObject({ estado: "anulado", motivoAnulacion: "saldo_cambiado", idExterno: intento.extA1 });
    const h = await historialDeIntento(base, intento.a1);
    expect(h).toHaveLength(3);
    expect(h[2]).toMatchObject({ valorAnterior: "pendiente", valorNuevo: "anulado", actorUsuarioId: null, actorNombre: null });
    expect(h[2].detalle).toMatchObject({ motivo: "saldo_cambiado" });

    const r = await escribir(() => obtenerOCrearIntento(base, orgDe(empresaA()), factura.A1.id, maestroA()));
    expect(r.resultado).toBe("creado");
    intento.a1b = r.intentoId as string;
    expect(await leerIntento(base, intento.a1b)).toMatchObject({ estado: "creado", montoLocal: "15000.00", montoCobrado: "15000.00" });
    expect(await vivosDe(base, factura.A1.id)).toEqual([intento.a1b]);
  });

  it("R11: anular (SLT-143) ese pago confirmado deja `anulado/saldo_cambiado` el vivo de 15 000, y el siguiente vuelve a ser de 20 000", async () => {
    await escribir(() => anularConfirmado(base, orgDe(empresaA()), pagoConfirmadoA1, maestroA()));
    expect(await leerIntento(base, intento.a1b)).toMatchObject({ estado: "anulado", motivoAnulacion: "saldo_cambiado" });
    expect((await historialDeIntento(base, intento.a1b)).map((f) => [f.valorAnterior, f.valorNuevo, f.actorUsuarioId])).toEqual([
      [null, "creado", maestroA()],
      ["creado", "anulado", null],
    ]);
    intento.a1c = await escribir(() => crearIntento(base, orgDe(empresaA()), factura.A1.id, maestroA()));
    expect(await leerIntento(base, intento.a1c)).toMatchObject({ estado: "creado", montoLocal: "20000.00" });
  });

  it("R11: un pago por fuera (SLT-143) aplicado a A2 anula su vivo, sin tocar el vivo de A1; el siguiente de A2 es de 25 000", async () => {
    intento.a2 = await escribir(() => crearIntento(base, orgDe(empresaA()), factura.A2.id, maestroA()));
    expect(await leerIntento(base, intento.a2)).toMatchObject({ montoLocal: "30000.00" });
    await escribir(() => registrarPorFuera(base, orgDe(empresaA()), "5000.00", [{ facturaId: factura.A2.id, monto: "5000.00" }], maestroA()));
    expect(await leerIntento(base, intento.a2)).toMatchObject({ estado: "anulado", motivoAnulacion: "saldo_cambiado" });
    expect((await leerIntento(base, intento.a1c)).estado).toBe("creado");
    intento.a2b = await escribir(() => crearIntento(base, orgDe(empresaA()), factura.A2.id, maestroA()));
    expect(await leerIntento(base, intento.a2b)).toMatchObject({ estado: "creado", montoLocal: "25000.00" });
  });

  it("R3, R25: un vivo con OTRA clave (sembrado a mano) se anula `clave_distinta` y nace uno nuevo, en la misma sentencia", async () => {
    const r = await revertida(base, async (tx) => {
      // Se cierra el vivo de A2 como lo haría §3.4 y se siembra uno con una clave vieja: el saldo «cambió» sin pasar
      // por los triggers (p. ej. la moneda), que es justo el caso que la clave cubre.
      await actualizar(tx, intento.a2b, `"estado" = 'anulado', "motivo_anulacion" = 'saldo_cambiado'`);
      const viejo = await insertarAMano(tx, orgDe(empresaA()), { facturaId: factura.A2.id, montoLocal: "99.00", clave: `${factura.A2.id}|99.00|${MONEDA_LOCAL}|` });
      const pedido = await obtenerOCrearIntento(tx, orgDe(empresaA()), factura.A2.id, maestroA());
      return {
        pedido,
        viejo: await leerIntento(tx, viejo),
        historialViejo: (await historialDeIntento(tx, viejo)).map((f) => [f.valorAnterior, f.valorNuevo, f.detalle.motivo ?? null]),
        nuevo: pedido.intentoId === null ? null : await leerIntento(tx, pedido.intentoId),
        vivos: await vivosDe(tx, factura.A2.id),
      };
    });
    expect(r.pedido.resultado).toBe("creado");
    expect(r.viejo).toMatchObject({ estado: "anulado", motivoAnulacion: "clave_distinta" });
    expect(r.historialViejo).toEqual([["creado", "anulado", "clave_distinta"]]);
    expect(r.nuevo).toMatchObject({ estado: "creado", montoLocal: "25000.00", clave: `${factura.A2.id}|25000.00|${MONEDA_LOCAL}|` });
    expect(r.vivos).toEqual([r.pedido.intentoId]);
  });

  /* ----------------------------- concurrencia (R4) --------------------------- */

  it("R4: dos pedidos a la vez sobre A3 terminan con un solo intento vivo y los dos reciben el mismo id", async () => {
    const { terminadasConElCandado, resultados } = await escribir(() =>
      aLaVezConCandado(sostenedor, orgDe(empresaA()), [
        () => obtenerOCrearIntento(base, orgDe(empresaA()), factura.A3.id, maestroA()),
        () => obtenerOCrearIntento(otra, orgDe(empresaA()), factura.A3.id, maestroA()),
      ]),
    );
    expect(terminadasConElCandado).toBe(0);
    expect(resultados.map((r) => r.resultado).sort()).toEqual(["creado", "existente"]);
    expect(resultados[0].intentoId).not.toBeNull();
    expect(resultados[1].intentoId).toBe(resultados[0].intentoId);
    expect((await intentosDeFactura(base, factura.A3.id)).map((i) => i.id)).toEqual([resultados[0].intentoId]);
    intento.a3 = resultados[0].intentoId as string;
  });

  it("R4: un INSERT del dueño de un segundo vivo para A3, en `creado` o en `pendiente`, da 23505 en el único parcial", async () => {
    const r = await revertida(base, async (tx) => {
      // Con el vivo de A3 en `creado`, y después en `pendiente` (los dos estados vivos).
      const creado = await capturar(tx, () => insertarAMano(tx, orgDe(empresaA()), { facturaId: factura.A3.id }));
      await actualizar(tx, intento.a3, `"estado" = 'pendiente'`);
      const conPendiente = await capturar(tx, () => insertarAMano(tx, orgDe(empresaA()), { facturaId: factura.A3.id }));
      const msg = (e: unknown) => (e === null ? null : { sqlstate: sqlstateDe(e), indice: String((e as Error).message).includes("cobro_intento_un_vivo_por_factura") });
      return { creado: msg(creado), conPendiente: msg(conPendiente) };
    });
    expect(r).toEqual({ creado: { sqlstate: "23505", indice: true }, conPendiente: { sqlstate: "23505", indice: true } });
  });

  /* ------------------------------ rechazos (R5) ------------------------------ */

  it("R5: la factura en curso, la de otra empresa, una inexistente y una con saldo 0 se rechazan sin escribir nada", async () => {
    const r = await revertida(base, async (tx) => {
      const antes = await conteos(tx, orgDe(empresaA()));
      const antesB = await conteos(tx, orgDe(empresaB()));
      const resultados = {
        enCurso: (await obtenerOCrearIntento(tx, orgDe(empresaA()), enCursoA, maestroA())).resultado,
        deOtraEmpresa: (await obtenerOCrearIntento(tx, orgDe(empresaA()), factura.B1.id, maestroA())).resultado,
        inexistente: (await obtenerOCrearIntento(tx, orgDe(empresaA()), randomUUID(), maestroA())).resultado,
        saldoCero: (await obtenerOCrearIntento(tx, orgDe(empresaA()), factura.A0.id, maestroA())).resultado,
      };
      return { resultados, antes, despues: await conteos(tx, orgDe(empresaA())), antesB, despuesB: await conteos(tx, orgDe(empresaB())) };
    });
    expect(r.resultados).toEqual({ enCurso: "factura_no_valida", deOtraEmpresa: "factura_no_valida", inexistente: "factura_no_valida", saldoCero: "sin_saldo" });
    expect(r.despues).toEqual(r.antes);
    expect(r.despuesB).toEqual(r.antesB);
  });

  /* ------------------------- importes y conversión (R6) ---------------------- */

  it("R6: los importes son decimales, y el dueño no puede escribir un monto ≤ 0, una foto incompleta, una foto en moneda local ni un cobrado distinto en moneda local (23514)", async () => {
    const tipos = await base.$queryRawUnsafe<{ column_name: string; data_type: string; numeric_scale: number }[]>(
      `SELECT column_name, data_type, numeric_scale FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'cobro_intento' AND column_name IN ('monto_local', 'monto_cobrado', 'tasa')
        ORDER BY column_name`,
    );
    expect(tipos).toEqual([
      { column_name: "monto_cobrado", data_type: "numeric", numeric_scale: 2 },
      { column_name: "monto_local", data_type: "numeric", numeric_scale: 2 },
      { column_name: "tasa", data_type: "numeric", numeric_scale: 8 },
    ]);

    const r = await revertida(base, async (tx) => {
      const o = orgDe(empresaA());
      const f = factura.A0.id;
      const foto = { monedaCobro: OTRA_MONEDA, montoCobrado: "40.00", tasa: "500.00000000", tasaFuente: "prueba", tasaAt: true };
      return {
        montoCero: await errorEnTx(tx, () => insertarAMano(tx, o, { facturaId: f, montoLocal: "0.00" })),
        montoNegativo: await errorEnTx(tx, () => insertarAMano(tx, o, { facturaId: f, montoLocal: "-1.00" })),
        cobradoCero: await errorEnTx(tx, () => insertarAMano(tx, o, { facturaId: f, ...foto, montoCobrado: "0.00" })),
        tasaCero: await errorEnTx(tx, () => insertarAMano(tx, o, { facturaId: f, ...foto, tasa: "0" })),
        sinFuente: await errorEnTx(tx, () => insertarAMano(tx, o, { facturaId: f, ...foto, tasaFuente: null })),
        sinFecha: await errorEnTx(tx, () => insertarAMano(tx, o, { facturaId: f, ...foto, tasaAt: false })),
        sinTasa: await errorEnTx(tx, () => insertarAMano(tx, o, { facturaId: f, ...foto, tasa: null })),
        fotoEnLocal: await errorEnTx(tx, () => insertarAMano(tx, o, { facturaId: f, tasa: "1.00000000", tasaFuente: "prueba", tasaAt: true })),
        cobradoDistintoEnLocal: await errorEnTx(tx, () => insertarAMano(tx, o, { facturaId: f, montoLocal: "1000.00", montoCobrado: "999.00" })),
        // Control: con la foto entera en otra moneda, sí entra (el CHECK no rechaza todo).
        fotoCompleta: await errorEnTx(tx, () => insertarAMano(tx, o, { facturaId: f, ...foto })),
      };
    });
    expect(r).toEqual({
      montoCero: "23514",
      montoNegativo: "23514",
      cobradoCero: "23514",
      tasaCero: "23514",
      sinFuente: "23514",
      sinFecha: "23514",
      sinTasa: "23514",
      fotoEnLocal: "23514",
      cobradoDistintoEnLocal: "23514",
      fotoCompleta: null,
    });
  });

  /* ---------------------------- máquina de estados (R7) ---------------------- */

  it("R7: el dueño solo puede mover un intento por la tabla de R7; cualquier otro cambio da SL226 y deja la fila igual", async () => {
    const r = await revertida(base, async (tx) => {
      const o = orgDe(empresaA());
      const f = factura.A0.id;
      const pasos: Record<string, string | null> = {};
      const intentar = async (nombre: string, id: string, estado: string, extra = "") => {
        const antes = await estadoEnTx(tx, id);
        pasos[nombre] = await errorEnTx(tx, () => actualizar(tx, id, `"estado" = '${estado}'${extra}`));
        if (pasos[nombre] !== null) expect(await estadoEnTx(tx, id), nombre).toBe(antes);
      };

      // Nacer en otro estado.
      pasos.naceEnPendiente = await errorEnTx(tx, () => insertarAMano(tx, o, { facturaId: f, estado: "pendiente" }));

      // creado → aprobado / rechazado / expirado / devuelto: saltos.
      const i = await insertarAMano(tx, o, { facturaId: f });
      const conPago = `, "pago_proveedor_id" = 'pp-${randomUUID()}', "pago_id" = '${randomUUID()}'`;
      await intentar("creadoAAprobado", i, "aprobado", conPago);
      await intentar("creadoARechazado", i, "rechazado");
      await intentar("creadoAExpirado", i, "expirado");
      await intentar("creadoADevuelto", i, "devuelto");
      // creado → pendiente → rechazado: permitido; rechazado es terminal.
      await intentar("creadoAPendiente", i, "pendiente");
      await intentar("pendienteARechazado", i, "rechazado");
      await intentar("rechazadoAPendiente", i, "pendiente");
      await intentar("rechazadoAAnulado", i, "anulado", `, "motivo_anulacion" = 'saldo_cambiado'`);

      // pendiente → aprobado → devuelto: permitido; ni atrás ni de lado. La FK del pago es diferida y esta
      // transacción no llega al COMMIT: el pago inventado no se comprueba.
      const j = await insertarAMano(tx, o, { facturaId: f });
      await intentar("creadoAPendiente2", j, "pendiente");
      await intentar("pendienteAAprobado", j, "aprobado", conPago);
      await intentar("aprobadoAPendiente", j, "pendiente");
      await intentar("aprobadoARechazado", j, "rechazado");
      await intentar("aprobadoADevuelto", j, "devuelto");
      await intentar("devueltoAAprobado", j, "aprobado");
      await intentar("devueltoAContracargo", j, "contracargo");

      // anulado es terminal (decisión P4); y pendiente → expirado / creado → anulado sí.
      const k = await insertarAMano(tx, o, { facturaId: f });
      await intentar("creadoAAnulado", k, "anulado", `, "motivo_anulacion" = 'clave_distinta'`);
      await intentar("anuladoACreado", k, "creado");
      await intentar("anuladoAPendiente", k, "pendiente");
      const m = await insertarAMano(tx, o, { facturaId: f });
      await intentar("creadoAPendiente3", m, "pendiente");
      await intentar("pendienteAExpirado", m, "expirado");
      await intentar("expiradoAPendiente", m, "pendiente");
      return pasos;
    });
    expect(r).toEqual({
      naceEnPendiente: "SL226",
      creadoAAprobado: "SL226",
      creadoARechazado: "SL226",
      creadoAExpirado: "SL226",
      creadoADevuelto: "SL226",
      creadoAPendiente: null,
      pendienteARechazado: null,
      rechazadoAPendiente: "SL226",
      rechazadoAAnulado: "SL226",
      creadoAPendiente2: null,
      pendienteAAprobado: null,
      aprobadoAPendiente: "SL226",
      aprobadoARechazado: "SL226",
      aprobadoADevuelto: null,
      devueltoAAprobado: "SL226",
      devueltoAContracargo: "SL226",
      creadoAAnulado: null,
      anuladoACreado: "SL226",
      anuladoAPendiente: "SL226",
      creadoAPendiente3: null,
      pendienteAExpirado: null,
      expiradoAPendiente: "SL226",
    });
  });

  /* --------------------------- columnas fijas (R8) --------------------------- */

  it("R8: el dueño no puede cambiar la empresa, la factura, el proveedor, la clave, los importes, las monedas ni la foto; los ids externos y el pago solo pasan de vacío a un valor", async () => {
    const r = await revertida(base, async (tx) => {
      const o = orgDe(empresaA());
      const i = await insertarAMano(tx, o, { facturaId: factura.A0.id });
      const cambio = (set: string, ...args: unknown[]) => errorEnTx(tx, () => actualizar(tx, i, set, ...args));
      const pp = `pp-${randomUUID()}`;
      const pago = randomUUID();
      const ext = `ext-${randomUUID()}`;
      return {
        empresa: (await cambio(`"organizacion_id" = $2`, orgDe(empresaB()))) !== null,
        factura: await cambio(`"factura_id" = $2`, factura.A1.id),
        proveedor: await cambio(`"proveedor" = 'otro'`),
        clave: await cambio(`"clave" = 'otra'`),
        montoLocal: await cambio(`"monto_local" = 1, "monto_cobrado" = 1`),
        monedaCobro: await cambio(`"moneda_cobro" = $2, "tasa" = 1, "tasa_fuente" = 'x', "tasa_at" = ${AHORA_SQL}`, OTRA_MONEDA),
        creadoPor: await cambio(`"creado_por" = $2`, maestroA()),
        // De vacío a un valor, una vez: entra; después, ni a otro valor ni de vuelta a vacío.
        idExternoPrimero: await cambio(`"id_externo" = $2`, ext),
        idExternoOtro: await cambio(`"id_externo" = $2`, `otro-${ext}`),
        idExternoVacio: await cambio(`"id_externo" = NULL`),
        pagoProveedorPrimero: await cambio(`"pago_proveedor_id" = $2`, pp),
        pagoProveedorOtro: await cambio(`"pago_proveedor_id" = $2`, `otro-${pp}`),
        pagoPrimero: await cambio(`"pago_id" = $2`, pago),
        pagoOtro: await cambio(`"pago_id" = $2`, randomUUID()),
        pagoVacio: await cambio(`"pago_id" = NULL`),
        fila: await leerIntento(tx, i),
      };
    });
    expect(r).toMatchObject({
      empresa: true,
      factura: "SL226",
      proveedor: "SL226",
      clave: "SL226",
      montoLocal: "SL226",
      monedaCobro: "SL226",
      creadoPor: "SL226",
      idExternoPrimero: null,
      idExternoOtro: "SL226",
      idExternoVacio: "SL226",
      pagoProveedorPrimero: null,
      pagoProveedorOtro: "SL226",
      pagoPrimero: null,
      pagoOtro: "SL226",
      pagoVacio: "SL226",
    });
    expect(r.fila).toMatchObject({ organizacionId: orgDe(empresaA()), facturaId: factura.A0.id, montoLocal: "1000.00", monedaCobro: MONEDA_LOCAL, estado: "creado" });
  });

  /* -------------------------- el pago es obligatorio (R9) -------------------- */

  it("R9: `aprobado` sin el pago del proveedor o sin el pago del libro da 23514", async () => {
    const r = await revertida(base, async (tx) => {
      const i = await insertarAMano(tx, orgDe(empresaA()), { facturaId: factura.A0.id });
      await actualizar(tx, i, `"estado" = 'pendiente'`);
      return {
        sinPagoDelLibro: await errorEnTx(tx, () => actualizar(tx, i, `"estado" = 'aprobado', "pago_proveedor_id" = $2`, `pp-${randomUUID()}`)),
        sinPagoDelProveedor: await errorEnTx(tx, () => actualizar(tx, i, `"estado" = 'aprobado', "pago_id" = $2`, randomUUID())),
        sinNada: await errorEnTx(tx, () => actualizar(tx, i, `"estado" = 'aprobado'`)),
        estado: await estadoEnTx(tx, i),
      };
    });
    expect(r).toEqual({ sinPagoDelLibro: "23514", sinPagoDelProveedor: "23514", sinNada: "23514", estado: "pendiente" });
  });

  /* ------------------------------- acceso (R26, R8) -------------------------- */

  it("R8, R26: como `servi_app`, la empresa no puede borrar, cambiar ni insertar intentos ni llamar a las funciones del dueño (42501), y la fila sigue igual", async () => {
    const r = await revertida(base, async (tx) => {
      await comoApp(tx, orgDe(empresaA()));
      const res = {
        borrar: await errorEnTx(tx, () => tx.$executeRawUnsafe(`DELETE FROM "cobro_intento" WHERE "id" = $1`, intento.a1c)),
        cambiar: await errorEnTx(tx, () => tx.$executeRawUnsafe(`UPDATE "cobro_intento" SET "estado" = 'pendiente' WHERE "id" = $1`, intento.a1c)),
        insertar: await errorEnTx(tx, () => insertarAMano(tx, orgDe(empresaA()), { facturaId: factura.A0.id })),
        crear: await errorEnTx(tx, () => obtenerOCrearIntento(tx, orgDe(empresaA()), factura.A0.id, maestroA())),
        enlace: await errorEnTx(tx, () => registrarEnlace(tx, orgDe(empresaA()), intento.a1c, `ext-${randomUUID()}`)),
        avanzar: await errorEnTx(tx, () => avanzarIntento(tx, intento.extA1, "rechazado")),
      };
      await tx.$executeRawUnsafe(`RESET ROLE`);
      return { ...res, fila: await leerIntento(tx, intento.a1c) };
    });
    expect(r).toMatchObject({ borrar: "42501", cambiar: "42501", insertar: "42501", crear: "42501", enlace: "42501", avanzar: "42501" });
    expect(r.fila).toMatchObject({ id: intento.a1c, estado: "creado", idExterno: null });
  });

  it("R26: como `servi_app`, B lee solo sus intentos, A solo los suyos, y sin empresa no se lee ninguno", async () => {
    const leerComo = (org: string | null) =>
      revertida(base, async (tx) => {
        if (org === null) await tx.$executeRawUnsafe(`SELECT set_config('role', 'servi_app', true)`);
        else await comoApp(tx, org);
        const filas = await tx.$queryRawUnsafe<{ organizacion_id: string; id: string }[]>(
          `SELECT "organizacion_id", "id" FROM "cobro_intento" WHERE "organizacion_id" = ANY($1::text[])`,
          [orgDe(empresaA()), orgDe(empresaB())],
        );
        return { empresas: [...new Set(filas.map((f) => f.organizacion_id))], ids: filas.map((f) => f.id) };
      });
    const deB = await leerComo(orgDe(empresaB()));
    expect(deB).toEqual({ empresas: [orgDe(empresaB())], ids: [intento.b1] });
    const deA = await leerComo(orgDe(empresaA()));
    expect(deA.empresas).toEqual([orgDe(empresaA())]);
    expect(deA.ids).toEqual(expect.arrayContaining([intento.a1, intento.a1b, intento.a1c, intento.a2, intento.a2b, intento.a3]));
    expect(deA.ids).not.toContain(intento.b1);
    expect(await leerComo(null)).toEqual({ empresas: [], ids: [] });
  });

  /* --------------------------- atomicidad del historial (R25) ---------------- */

  it("R25: si la transacción que cambia un estado falla después, no quedan ni el cambio ni su fila de historial", async () => {
    const antes = { fila: await leerIntento(base, intento.a1c), historial: await historialDeIntento(base, intento.a1c) };
    expect(antes.fila.estado).toBe("creado");
    const dentro: { estado?: string; historial?: number } = {};
    const fallo = await escribir(() =>
      errorDe(() =>
        base.$transaction(async (tx) => {
          expect(await registrarEnlace(tx, orgDe(empresaA()), intento.a1c, `ext-${randomUUID()}`)).toBe("ok");
          dentro.estado = await estadoEnTx(tx, intento.a1c);
          dentro.historial = (await historialDeIntento(tx, intento.a1c)).length;
          // Lo que viene después en la misma transacción falla: el cambio y su rastro se van juntos.
          await tx.$executeRawUnsafe(`SELECT 1 / 0`);
        }),
      ),
    );
    expect(fallo).toBe("22012");
    expect(dentro).toEqual({ estado: "pendiente", historial: antes.historial.length + 1 });
    expect(await leerIntento(base, intento.a1c)).toEqual(antes.fila);
    expect(await historialDeIntento(base, intento.a1c)).toEqual(antes.historial);
  });
});
