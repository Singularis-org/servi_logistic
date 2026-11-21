// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import { guardarValoresTarifa } from "@/lib/actions/tarifas";
import { construirPaisService } from "@/lib/actions/_shared/paises-plataforma";
import { empresaDeLaPeticion } from "@/lib/auth/empresa-de-la-peticion";
import { IMPUESTO_ROTULO } from "@/lib/constants/impuesto-rotulo";
import { getPrismaClient } from "@/lib/db/prisma-client";
import type { IPaisService, PaisParaPantallas } from "@/lib/interfaces/services/IPaisService";
import type { Actor, ITarifaValorService } from "@/lib/interfaces/services/ITarifaValorService";
import { TarifaValorRepository } from "@/lib/repositories/TarifaValorRepository";
import { TarifaValorService } from "@/lib/services/TarifaValorService";
import { serviciosDeTarifas } from "@/lib/tarifas/servicios";
import { ETIQUETAS_NEUTRAS } from "@/lib/types/pais";
import { MONEDA_DE_PRUEBA } from "@/tests/fabricas/reglas-pais";
import { quitarComentarios } from "@/tests/fixtures/sin-comentarios";

// SLT-241 — Moneda e impuesto del pais en pantallas: tarifas, configuracion y ranking.
//
// Un `describe` por requisito (o por bloque de cableado de design §9). Cada bloque de tasks.md AÑADE
// los suyos al final del archivo, con sus propios imports y dobles locales: no se reordena lo de los
// demas. Las pantallas se prueban con `MONEDA_DE_PRUEBA` + «IGV», con `MONEDA_CR` + «IVA» y sin
// proveedor (R16, R17).
//
// Los `vi.mock` de abajo son de la escritura de tarifas (bloque 1: R7, R8 y §9). Por defecto llaman a la
// implementacion real, asi que no cambian nada a los bloques que no los configuran; los casos que los
// necesitan los fijan con `mockReturnValue`/`mockImplementation` y `afterEach` los devuelve a la real.

vi.mock("@/lib/auth/empresa-de-la-peticion", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/auth/empresa-de-la-peticion")>();
  return { ...real, empresaDeLaPeticion: vi.fn(real.empresaDeLaPeticion) };
});

vi.mock("@/lib/actions/_shared/paises-plataforma", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/actions/_shared/paises-plataforma")>();
  return { ...real, construirPaisService: vi.fn(real.construirPaisService) };
});

vi.mock("@/lib/db/prisma-client", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/db/prisma-client")>();
  return { ...real, getPrismaClient: vi.fn(real.getPrismaClient) };
});

vi.mock("@/lib/tarifas/servicios", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/tarifas/servicios")>();
  return { ...real, serviciosDeTarifas: vi.fn(real.serviciosDeTarifas) };
});

afterEach(() => {
  // `mockReset` devuelve cada `vi.fn(real)` a la implementacion real y borra sus llamadas.
  vi.mocked(empresaDeLaPeticion).mockReset();
  vi.mocked(construirPaisService).mockReset();
  vi.mocked(getPrismaClient).mockReset();
  vi.mocked(serviciosDeTarifas).mockReset();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------------------------
// Bloque 1 — escritura de tarifas en el servidor (R7, R8, design §3, §5.2, §9)
// ---------------------------------------------------------------------------------------------

const MAESTRO: Actor = { usuarioId: "u-maestro", rol: "maestro" };
const conMaestro = async () => MAESTRO;

const PAIS_DE_PRUEBA: PaisParaPantallas = {
  etiquetas: ETIQUETAS_NEUTRAS,
  moneda: MONEDA_DE_PRUEBA,
  impuestoNombre: "IGV",
};

const NIVEL = { zonaId: "zona-1", grupoId: null, tiendaId: null, vehiculoId: null };
const COBRO = { concepto: "tienda_flete_entregado", modo: "monto", valor: "1500", ivaPct: "13", ...NIVEL };
const PAGO = { concepto: "mensajero_entregado", modo: "monto", valor: "900", ...NIVEL };

/** Tres cambios en una sola peticion: dos fijar y un quitar (R7: el pais se lee una vez). */
const TRES_CAMBIOS = {
  cambios: [
    { accion: "fijar", clave: "a", datos: COBRO },
    { accion: "fijar", clave: "b", datos: PAGO },
    { accion: "quitar", clave: "c", id: "tv-9" },
  ],
};

/** Un `ITarifaValorService` doble: lo que importa aqui es con que impuesto se construyo, no lo que hace. */
function servicioDoble() {
  return {
    fijarValor: vi.fn().mockResolvedValue({ status: "ok", id: "tv-1" }),
    quitarValor: vi.fn().mockResolvedValue({ status: "ok" }),
    listarValores: vi.fn().mockResolvedValue({ status: "ok", items: [] }),
  } satisfies ITarifaValorService;
}

const PRISMA_DE_LA_PETICION = { soy: "el cliente de la peticion" } as unknown as PrismaClient;

/**
 * Dobla lo que `guardarValoresTarifa` lee de la peticion: la empresa de la sesion, el servicio de paises
 * (solo `paraPantallas`), el cliente de Prisma y la fabrica, que devuelve un servicio doble.
 */
function dobladoDeLaPeticion(paraPantallas: IPaisService["paraPantallas"], empresa: string | null = "org-1") {
  const servicio = servicioDoble();
  const paises = { paraPantallas: vi.fn(paraPantallas) };
  vi.mocked(empresaDeLaPeticion).mockResolvedValue(empresa);
  vi.mocked(construirPaisService).mockReturnValue(paises as unknown as IPaisService);
  vi.mocked(getPrismaClient).mockReturnValue(PRISMA_DE_LA_PETICION);
  vi.mocked(serviciosDeTarifas).mockImplementation(
    () => ({ tarifaValor: servicio }) as unknown as ReturnType<typeof serviciosDeTarifas>,
  );
  return { servicio, paises };
}

describe("SLT-241 R7 — la escritura de tarifas lee el pais de la empresa de la sesion una vez por peticion", () => {
  it("R7: con tres cambios, `paraPantallas` se llama UNA vez, con la empresa de la sesion, antes del primer cambio", async () => {
    const { servicio, paises } = dobladoDeLaPeticion(async () => PAIS_DE_PRUEBA);

    const res = await guardarValoresTarifa(TRES_CAMBIOS, { getActor: conMaestro });

    expect(res).toEqual({
      status: "ok",
      resultados: [
        { clave: "a", status: "ok" },
        { clave: "b", status: "ok" },
        { clave: "c", status: "ok" },
      ],
    });
    expect(paises.paraPantallas).toHaveBeenCalledTimes(1);
    expect(paises.paraPantallas).toHaveBeenCalledWith("org-1");
    expect(servicio.fijarValor).toHaveBeenCalledTimes(2);
    expect(servicio.quitarValor).toHaveBeenCalledTimes(1);
    const lectura = paises.paraPantallas.mock.invocationCallOrder[0];
    expect(lectura).toBeLessThan(servicio.fijarValor.mock.invocationCallOrder[0]);
  });

  it("R7: la fabrica se construye UNA vez, con el cliente de la peticion y el impuesto del pais («IGV»)", async () => {
    dobladoDeLaPeticion(async () => PAIS_DE_PRUEBA);

    await guardarValoresTarifa(TRES_CAMBIOS, { getActor: conMaestro });

    expect(serviciosDeTarifas).toHaveBeenCalledTimes(1);
    expect(serviciosDeTarifas).toHaveBeenCalledWith(PRISMA_DE_LA_PETICION, "IGV");
  });

  it("R7 (design §3): con el servicio inyectado no se lee el pais ni se construye la fabrica", async () => {
    const { paises } = dobladoDeLaPeticion(async () => PAIS_DE_PRUEBA);
    const inyectado = servicioDoble();

    const res = await guardarValoresTarifa(TRES_CAMBIOS, { getActor: conMaestro, servicio: inyectado });

    expect(res).toMatchObject({ status: "ok" });
    expect(inyectado.fijarValor).toHaveBeenCalledTimes(2);
    expect(paises.paraPantallas).not.toHaveBeenCalled();
    expect(empresaDeLaPeticion).not.toHaveBeenCalled();
    expect(serviciosDeTarifas).not.toHaveBeenCalled();
  });

  it("R7 (design §10): sin sesion se rechaza antes de leer el pais", async () => {
    const { paises } = dobladoDeLaPeticion(async () => PAIS_DE_PRUEBA);

    const res = await guardarValoresTarifa(TRES_CAMBIOS, { getActor: async () => null });

    expect(res).toEqual({ status: "unauthenticated" });
    expect(paises.paraPantallas).not.toHaveBeenCalled();
    expect(serviciosDeTarifas).not.toHaveBeenCalled();
  });
});

describe("SLT-241 R8 — si la lectura del pais falla, el guardado usa el rotulo de la plataforma y no falla", () => {
  it("R8: `paraPantallas` lanza → la fabrica recibe IMPUESTO_ROTULO, el resultado es ok y el error queda en el log", async () => {
    const fallo = new Error("la base no responde");
    const { servicio, paises } = dobladoDeLaPeticion(async () => {
      throw fallo;
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await guardarValoresTarifa(TRES_CAMBIOS, { getActor: conMaestro });

    expect(res).toMatchObject({ status: "ok" });
    expect(paises.paraPantallas).toHaveBeenCalledTimes(1);
    expect(serviciosDeTarifas).toHaveBeenCalledWith(PRISMA_DE_LA_PETICION, IMPUESTO_ROTULO);
    expect(servicio.fijarValor).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("[país] no se pudo leer el país de la empresa org-1"), fallo);
  });

  it("R8: sin empresa en la sesion → IMPUESTO_ROTULO, sin consultar el pais", async () => {
    const { paises } = dobladoDeLaPeticion(async () => PAIS_DE_PRUEBA, null);

    const res = await guardarValoresTarifa(TRES_CAMBIOS, { getActor: conMaestro });

    expect(res).toMatchObject({ status: "ok" });
    expect(paises.paraPantallas).not.toHaveBeenCalled();
    expect(serviciosDeTarifas).toHaveBeenCalledWith(PRISMA_DE_LA_PETICION, IMPUESTO_ROTULO);
  });
});

// --- §9: `serviciosDeTarifas(prisma, "IGV")` llega al servicio y al repositorio ---------------------

/** El cliente doble justo para fijar un cobro con el repositorio REAL (mismo patron que servicios-composicion). */
function clienteDoble() {
  const tx = {
    tarifaValor: {
      findFirst: vi.fn().mockResolvedValue({
        id: "tv-1",
        modo: "monto",
        valor: new Prisma.Decimal("1500"),
        ivaPct: new Prisma.Decimal("13"),
      }),
      findUnique: vi.fn().mockResolvedValue({ concepto: "tienda_flete_entregado", zona: { nombre: "Norte" } }),
      update: vi.fn().mockResolvedValue({ id: "tv-1" }),
      create: vi.fn(),
    },
    usuario: {
      findUnique: vi.fn().mockResolvedValue({ nombre: "Ana", primerApellido: "Mora", rol: { value: "maestro" } }),
    },
    historialAccion: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const cliente = {
    zona: { findFirst: vi.fn().mockResolvedValue({ id: "zona-1" }) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return { tx, cliente };
}

/** Lee la dependencia privada que la fabrica inyecto: es justo lo que se quiere comprobar. */
function dependencia(objeto: object, campo: string): unknown {
  return (objeto as Record<string, unknown>)[campo];
}

describe("SLT-241 §9 — `serviciosDeTarifas(prisma, impuesto)` pasa el impuesto al servicio y al repositorio", () => {
  it("§9/R5: el servicio de la fabrica valida con «IGV»", async () => {
    const { cliente } = clienteDoble();
    const { tarifaValor } = serviciosDeTarifas(cliente as unknown as PrismaClient, "IGV");

    const res = await tarifaValor.fijarValor({ ...COBRO, ivaPct: "101" } as never, MAESTRO);

    expect(res).toEqual({
      status: "validation_error",
      fieldErrors: { ivaPct: ["El IGV debe ser un porcentaje entre 0 y 100 con hasta 2 decimales."] },
    });
  });

  it("§9/R6: el repositorio de la fabrica es el real, con el cliente dado, y escribe «IGV» en el historial", async () => {
    const { tx, cliente } = clienteDoble();
    const { tarifaValor } = serviciosDeTarifas(cliente as unknown as PrismaClient, "IGV");
    const repo = dependencia(tarifaValor, "repo");
    expect(repo).toBeInstanceOf(TarifaValorRepository);
    expect(dependencia(repo as object, "prisma")).toBe(cliente);
    expect(dependencia(repo as object, "impuestoNombre")).toBe("IGV");

    const res = await tarifaValor.fijarValor({ ...COBRO, valor: "1800" } as never, MAESTRO);

    expect(res).toEqual({ status: "ok", id: "tv-1" });
    const [fila] = tx.historialAccion.createMany.mock.calls[0][0].data;
    expect(fila).toMatchObject({
      valorAnterior: "monto 1500.00 IGV 13.00",
      valorNuevo: "monto 1800.00 IGV 13.00",
    });
  });

  it("§9/R16: sin impuesto, la fabrica cae al rotulo de la plataforma en el servicio y en el repositorio", async () => {
    const { tx, cliente } = clienteDoble();
    const { tarifaValor } = serviciosDeTarifas(cliente as unknown as PrismaClient);
    expect(tarifaValor).toBeInstanceOf(TarifaValorService);
    expect(dependencia(dependencia(tarifaValor, "repo") as object, "impuestoNombre")).toBe(IMPUESTO_ROTULO);

    await tarifaValor.fijarValor({ ...COBRO, valor: "1800" } as never, MAESTRO);

    const [fila] = tx.historialAccion.createMany.mock.calls[0][0].data;
    expect(fila).toMatchObject({ valorAnterior: "monto 1500.00 IVA 13.00", valorNuevo: "monto 1800.00 IVA 13.00" });
  });
});

// --- §9: el fuente de `guardarValoresTarifa` -----------------------------------------------------

const FUENTE_ACCION_TARIFAS = join(process.cwd(), "lib/actions/tarifas.ts");

/** El cuerpo de `guardarValoresTarifa`, sin comentarios: desde su `export` hasta el siguiente. */
function cuerpoDeGuardar(fuente: string): string {
  const codigo = quitarComentarios(fuente);
  const inicio = codigo.indexOf("export async function guardarValoresTarifa(");
  if (inicio === -1) return "";
  const fin = codigo.indexOf("\nexport ", inicio + 1);
  return codigo.slice(inicio, fin === -1 ? undefined : fin);
}

/**
 * Lo que §9 exige del fuente, como lista de faltas (vacia = bien cableado):
 * - el `serviciosDeTarifas(` de la accion recibe un segundo argumento;
 * - ese argumento sale de lo que devuelve `paisParaPantallasDelActor(`;
 * - esa lectura va antes del bucle de cambios, no dentro.
 */
function faltasDeCableado(fuente: string): string[] {
  const cuerpo = cuerpoDeGuardar(fuente);
  if (cuerpo === "") return ["no se encontro guardarValoresTarifa"];
  const faltas: string[] = [];
  const llamada = /serviciosDeTarifas\(\s*getPrismaClient\(\)\s*,\s*([A-Za-z_$][\w$]*)\s*\)/.exec(cuerpo);
  if (!llamada) return ["serviciosDeTarifas( no recibe el impuesto como segundo argumento"];
  const arg = llamada[1];
  const lectura = new RegExp(
    String.raw`const\s*\{[^}]*\b${arg}\b[^}]*\}\s*=\s*await\s+paisParaPantallasDelActor\(`,
  ).exec(cuerpo);
  if (!lectura) faltas.push(`«${arg}» no sale de paisParaPantallasDelActor(`);
  const bucle = cuerpo.indexOf("for (");
  if (bucle === -1) faltas.push("no se encontro el bucle de cambios");
  if (lectura && bucle !== -1 && lectura.index > bucle) faltas.push("la lectura del pais esta dentro del bucle");
  if (llamada.index > bucle && bucle !== -1) faltas.push("la fabrica se construye dentro del bucle");
  return faltas;
}

describe("SLT-241 §9 — el fuente de `guardarValoresTarifa` pasa el impuesto del pais a la fabrica", () => {
  const fuente = readFileSync(FUENTE_ACCION_TARIFAS, "utf8");

  it("§9/R7: `serviciosDeTarifas(getPrismaClient(), <impuesto>)` con el impuesto de `paisParaPantallasDelActor(`, fuera del bucle", () => {
    expect(faltasDeCableado(fuente)).toEqual([]);
  });

  it("contraprueba: sin el segundo argumento, la comprobacion falla", () => {
    const sinImpuesto = fuente.replace(
      /serviciosDeTarifas\(getPrismaClient\(\), impuestoNombre\)/,
      "serviciosDeTarifas(getPrismaClient())",
    );
    expect(sinImpuesto).not.toBe(fuente);
    expect(faltasDeCableado(sinImpuesto)).toEqual(["serviciosDeTarifas( no recibe el impuesto como segundo argumento"]);
  });

  it("contraprueba: con el impuesto de otro sitio (no del pais), la comprobacion falla", () => {
    const deOtroSitio = fuente.replace(/paisParaPantallasDelActor\(\s*await empresaDeLaPeticion/, "otraLectura(await empresaDeLaPeticion");
    expect(deOtroSitio).not.toBe(fuente);
    expect(faltasDeCableado(deOtroSitio)).toEqual(["«impuestoNombre» no sale de paisParaPantallasDelActor("]);
  });

  it("contraprueba: con la lectura dentro del bucle, la comprobacion falla", () => {
    const enElBucle = [
      "export async function guardarValoresTarifa(input: unknown) {",
      "  for (const cambio of cambios) {",
      "    const { impuestoNombre } = await paisParaPantallasDelActor(await empresaDeLaPeticion(), construirPaisService());",
      "    const servicio = serviciosDeTarifas(getPrismaClient(), impuestoNombre).tarifaValor;",
      "  }",
      "}",
    ].join("\n");
    expect(faltasDeCableado(enElBucle)).toEqual([
      "la lectura del pais esta dentro del bucle",
      "la fabrica se construye dentro del bucle",
    ]);
  });

  it("contraprueba: un comentario con la llamada buena no cuenta", () => {
    const soloComentario = fuente.replace(
      /serviciosDeTarifas\(getPrismaClient\(\), impuestoNombre\)/,
      "serviciosDeTarifas(getPrismaClient()) /* serviciosDeTarifas(getPrismaClient(), impuestoNombre) */",
    );
    expect(faltasDeCableado(soloComentario)).toEqual(["serviciosDeTarifas( no recibe el impuesto como segundo argumento"]);
  });
});
