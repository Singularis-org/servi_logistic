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
import { MONEDA_CR, MONEDA_DE_PRUEBA } from "@/tests/fabricas/reglas-pais";
import { quitarComentarios } from "@/tests/fixtures/sin-comentarios";
// Bloque 3 (R10, R11)
import { createRef, type ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
import { UsuariosModule } from "@/app/(app)/configuracion/_components/UsuariosModule";
import { PremioInputRow } from "@/app/(app)/ranking/_components/PremioInputRow";
import { RankingPodio } from "@/app/(app)/ranking/_components/RankingPodio";
import { PREMIOS_LABELS } from "@/app/(app)/ranking/_components/ranking-labels";
import { RankingHistoricoModule } from "@/app/(app)/ranking/historico/_components/RankingHistoricoModule";
import { MONEDA_PLATAFORMA, SIN_MONTO_RAYA, formatearMontoEn } from "@/lib/config/moneda";
import type { ImpactoSalidaAdminSatelite } from "@/lib/interfaces/services/IUsuarioService";
import type { PremioRankingDTO, RankingRowDTO } from "@/lib/types/ranking";
import type { RankingSnapshotData, RankingSnapshotFilaDTO } from "@/lib/types/ranking-snapshot";
import type { UsuarioListItemDTO } from "@/lib/types/usuario";
import { MonedaDelPaisProvider } from "@/providers/MonedaDelPaisProvider";
import { ToastProvider } from "@/providers/ToastProvider";
// Bloque 4 (R12, R13)
import type { IPlantillaMensajeRepository } from "@/lib/interfaces/repositories/IPlantillaMensajeRepository";
import type { Actor as ActorPlantillas } from "@/lib/interfaces/services/IPlantillaMensajeService";
import { PlantillaMensajeService } from "@/lib/services/PlantillaMensajeService";
import { DATOS_PLANTILLA_EJEMPLO, EJEMPLOS_POR_CLAVE, resolverValoresPlantilla } from "@/lib/types/plantilla-datos";
import { extraerVariables, previewConEjemplos, renderPlantilla } from "@/lib/utils/plantilla-mensaje";
import { componerVistaPrevia } from "@/lib/utils/vista-previa-informe";
import { catalogoDeVariables, ejemploDeVariableInforme } from "@/lib/whatsapp-envios/informes/catalogo";
import { VistaPreviaMensaje } from "@/app/(app)/configuracion/envios-whatsapp/_components/VistaPreviaMensaje";
import { VariablesInsert } from "@/app/(app)/configuracion/plantillas/_components/VariablesInsert";
// Bloque 2 (R1-R4)
import { planDeGuardado, type CeldaEditada } from "@/app/(app)/configuracion/tarifas/_components/tarifas-borrador";
import {
  etiquetaModo,
  porcentajeParaVer,
  porcentajeParaVerEnLaPlataforma,
  textoReferencia,
  textosDelImpuesto,
  textoValor,
  textoValorSinIva,
} from "@/app/(app)/configuracion/tarifas/_components/tarifas-textos";
import { TarifaMensajeroDialogo } from "@/app/(app)/configuracion/tarifas/_components/TarifaMensajeroDialogo";
import { TarifasGrupos } from "@/app/(app)/configuracion/tarifas/_components/TarifasGrupos";
import { TarifasMensajeros, type FilaMensajero } from "@/app/(app)/configuracion/tarifas/_components/TarifasMensajeros";
import { TarifasTiendas, type FilaPrecioTienda } from "@/app/(app)/configuracion/tarifas/_components/TarifasTiendas";
import { TarifasValores, type TarifasValoresProps } from "@/app/(app)/configuracion/tarifas/_components/TarifasValores";
import type { FormatoMoneda } from "@/lib/config/moneda";
import { mensajeroPantalla, referenciaUniforme, valor, valorPropio } from "@/tests/fixtures/tarifas-pantalla";

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

// ---------------------------------------------------------------------------------------------
// Bloque 3 — Configuracion > Usuarios y ranking (R10, R11, design §7)
// ---------------------------------------------------------------------------------------------
//
// Cada pantalla se pinta tres veces: con el pais de prueba (`MONEDA_DE_PRUEBA` + «IGV»), con Costa
// Rica (`MONEDA_CR` + «IVA») y sin proveedor. Con el de prueba sale el importe en su moneda y no el
// de la plataforma (R10, R11); con CR, el texto es el mismo que sin proveedor (R16), y sin proveedor,
// el de la plataforma (R17).
//
// Dobles de este bloque (los `vi.mock` se elevan al principio del archivo, pero ningun otro bloque
// importa estos modulos): las acciones de usuarios y de ranking, que son de servidor, y el router de
// Next, que `PremioInputRow` y `RankingHistoricoModule` leen al montarse.

const { dobleUsuarios } = vi.hoisted(() => ({
  dobleUsuarios: {
    listarUsuarios: vi.fn(),
    cambiarEstadoUsuario: vi.fn(),
    consultarImpactoCambioUsuario: vi.fn(),
    obtenerUsuario: vi.fn(),
    restablecerContrasenaUsuario: vi.fn(),
  },
}));

vi.mock("@/lib/actions/usuarios", () => ({
  listarUsuarios: (...a: unknown[]) => dobleUsuarios.listarUsuarios(...a),
  listarUsuariosCompleto: vi.fn(),
  cambiarEstadoUsuario: (...a: unknown[]) => dobleUsuarios.cambiarEstadoUsuario(...a),
  consultarImpactoCambioUsuario: (...a: unknown[]) => dobleUsuarios.consultarImpactoCambioUsuario(...a),
  obtenerUsuario: (...a: unknown[]) => dobleUsuarios.obtenerUsuario(...a),
  crearUsuario: vi.fn(),
  actualizarUsuario: vi.fn(),
  listarTiposIdentificacion: vi.fn(),
  listarRoles: vi.fn(),
  restablecerContrasenaUsuario: (...a: unknown[]) => dobleUsuarios.restablecerContrasenaUsuario(...a),
}));

vi.mock("@/lib/actions/ranking", () => ({
  editarPremioAction: vi.fn(),
  obtenerRankingAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const IMPUESTO_DE_PRUEBA = "IGV";
const IMPUESTO_CR = "IVA";

/** Los tres montajes de cada caso: el pais de prueba, Costa Rica y sin proveedor. */
type Montaje = "prueba" | "cr" | "sin proveedor";

/** Envuelve `ui` con el proveedor del montaje (ninguno para «sin proveedor»). */
function conMontaje(montaje: Montaje, ui: ReactNode): ReactNode {
  if (montaje === "sin proveedor") return ui;
  const [moneda, impuesto] =
    montaje === "prueba" ? [MONEDA_DE_PRUEBA, IMPUESTO_DE_PRUEBA] : [MONEDA_CR, IMPUESTO_CR];
  return (
    <MonedaDelPaisProvider moneda={moneda} impuestoNombre={impuesto}>
      {ui}
    </MonedaDelPaisProvider>
  );
}

/** Lo que pinta `ui` (su texto entero) en el montaje dado. */
function textoEn(montaje: Montaje, ui: ReactNode): string {
  const { container, unmount } = render(<ToastProvider>{conMontaje(montaje, ui)}</ToastProvider>);
  const texto = container.textContent ?? "";
  unmount();
  return texto;
}

/**
 * Las tres comprobaciones de un importe pintado: con el pais de prueba, su moneda y no la de la
 * plataforma (R10/R11); sin proveedor, la de la plataforma (R17); con CR, byte a byte lo de sin
 * proveedor (R16).
 */
function compruebaLosTresMontajes(texto: (montaje: Montaje) => string, importe: string) {
  const conPrueba = texto("prueba");
  expect(conPrueba).toContain(formatearMontoEn(MONEDA_DE_PRUEBA, importe));
  expect(conPrueba).not.toContain(formatearMontoEn(MONEDA_PLATAFORMA, importe));

  const sinProveedor = texto("sin proveedor");
  expect(sinProveedor).toContain(formatearMontoEn(MONEDA_PLATAFORMA, importe));
  expect(texto("cr")).toBe(sinProveedor);
}

/** `useIsMobile` lee `matchMedia`: con 360 px es telefono (la tarjeta), con 1280 escritorio (la tabla). */
function simularAncho(ancho: number) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: (() => {
          const max = /max-width:\s*(\d+)px/.exec(query);
          return max ? ancho <= Number(max[1]) : false;
        })(),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
}

// --- R10: Configuracion > Usuarios ------------------------------------------------------------

/** El unico Admin satelite activo de su zona: inactivarlo abre el aviso de impacto. */
const SATELITE: UsuarioListItemDTO = {
  id: "u-sat",
  nombre: "Rosa Vargas",
  email: "rosa@example.com",
  rolValue: "adminSatelite",
  estado: "activo",
  zonaNombre: "Puntarenas",
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

/** Con cola y miles: con la moneda de prueba (0 decimales, espacio de miles) se pinta distinto. */
const TOTAL_SIN_CONSOLIDAR = "1234567.89";

const IMPACTO_ZONA: ImpactoSalidaAdminSatelite = {
  zonaNombre: "Puntarenas",
  cierresSinConsolidar: 4,
  totalSinConsolidar: TOTAL_SIN_CONSOLIDAR,
  adminSatelitesActivosRestantes: 0,
};

/** Monta `UsuariosModule`, pulsa «Inactivar» y devuelve el texto del aviso de impacto. */
async function textoDelAvisoDeZona(montaje: Montaje): Promise<string> {
  dobleUsuarios.listarUsuarios.mockResolvedValue({ status: "ok", items: [SATELITE], page: 1, pageSize: 25, total: 1 });
  dobleUsuarios.consultarImpactoCambioUsuario.mockResolvedValue({ status: "ok", impacto: IMPACTO_ZONA });

  const user = userEvent.setup();
  const { unmount } = render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ToastProvider>
        {conMontaje(montaje, <UsuariosModule initialData={{ items: [SATELITE], total: 1, pageSize: 25 }} />)}
      </ToastProvider>
    </SWRConfig>,
  );
  await user.click(await screen.findByRole("button", { name: "Inactivar" }));
  const continuar = await screen.findByRole("button", { name: "Continuar" });
  const texto = continuar.closest('[role="dialog"]')?.textContent ?? "";
  unmount();
  return texto;
}

describe("SLT-241 R10 — el aviso de impacto de Configuracion > Usuarios pinta el total en la moneda del pais", () => {
  it("R10/R16/R17: con el pais de prueba «€»; con CR, lo mismo que sin proveedor (la moneda de la plataforma)", async () => {
    const textos: Record<Montaje, string> = {
      prueba: await textoDelAvisoDeZona("prueba"),
      cr: await textoDelAvisoDeZona("cr"),
      "sin proveedor": await textoDelAvisoDeZona("sin proveedor"),
    };

    expect(textos.prueba).toContain(`por ${formatearMontoEn(MONEDA_DE_PRUEBA, TOTAL_SIN_CONSOLIDAR)}.`);
    expect(textos.prueba).toContain("€1 234 568");
    compruebaLosTresMontajes((montaje) => textos[montaje], TOTAL_SIN_CONSOLIDAR);
  }, 30000);
});

// --- R11: ranking -------------------------------------------------------------------------------

/** El premio de los casos de ranking: con cola y miles, como `TOTAL_SIN_CONSOLIDAR`. */
const PREMIO = "12500.50";

function filaRanking(over: Partial<RankingRowDTO> = {}): RankingRowDTO {
  return {
    posicion: 1,
    mensajeroId: "m1",
    nombre: "Ana Mensajera",
    entregadasHoy: 5,
    asignadasHoy: 5,
    pct: "100.0",
    premio: PREMIO,
    ...over,
  };
}

function filaHistorico(over: Partial<RankingSnapshotFilaDTO> = {}): RankingSnapshotFilaDTO {
  return {
    puesto: 1,
    posicion: 1,
    mensajeroId: "m1",
    nombre: "Ana Mensajera",
    entregadas: 5,
    asignadas: 5,
    pct: "100.0",
    premioMonto: PREMIO,
    premioDescripcion: "Bono oro",
    ...over,
  };
}

function snapshotCon(filas: RankingSnapshotFilaDTO[]): RankingSnapshotData {
  return { fecha: "2026-08-09", generadoAt: "2026-08-10T06:00:00.000Z", minAsignadasPodio: 1, filas };
}

/** `PremioInputRow` es una fila: va dentro de su tabla. */
function filaDePremio(premio: PremioRankingDTO) {
  return (
    <table>
      <tbody>
        <PremioInputRow premio={premio} ocupanteNombre="Ana Mensajera" esEditable={false} />
      </tbody>
    </table>
  );
}

describe("SLT-241 R11 — el ranking pinta el premio en la moneda del pais", () => {
  it("R11/R16/R17: `RankingPodio`, el premio del escalon", () => {
    const ui = <RankingPodio ranking={[filaRanking()]} />;
    compruebaLosTresMontajes((montaje) => textoEn(montaje, ui), PREMIO);
  });

  it("R11: `RankingPodio` sin premio no pinta importe (lo de hoy)", () => {
    const ui = <RankingPodio ranking={[filaRanking({ premio: null })]} />;
    expect(textoEn("prueba", ui)).toBe(textoEn("sin proveedor", ui));
    expect(textoEn("prueba", ui)).not.toContain("€");
  });

  it("R11/R16/R17: `PremioInputRow`, el monto del premio en solo lectura", () => {
    const ui = filaDePremio({ posicion: 1, monto: PREMIO, descripcion: "Bono oro" });
    compruebaLosTresMontajes((montaje) => textoEn(montaje, ui), PREMIO);
  });

  it("R11: `PremioInputRow` sin monto pinta «Sin premio asignado», como hoy", () => {
    const ui = filaDePremio({ posicion: 1, monto: null, descripcion: null });
    expect(textoEn("prueba", ui)).toContain(PREMIOS_LABELS.sinMonto);
    expect(textoEn("prueba", ui)).toBe(textoEn("sin proveedor", ui));
  });

  it("R11/R16/R17: `RankingHistoricoModule` en escritorio, la celda del premio de la tabla", () => {
    simularAncho(1280);
    const ui = <RankingHistoricoModule fecha="2026-08-09" snapshot={snapshotCon([filaHistorico()])} />;
    compruebaLosTresMontajes((montaje) => textoEn(montaje, ui), PREMIO);
  });

  it("R11: `RankingHistoricoModule` en escritorio, sin premio la celda pinta la raya larga, como hoy", () => {
    simularAncho(1280);
    const ui = (
      <RankingHistoricoModule
        fecha="2026-08-09"
        snapshot={snapshotCon([filaHistorico({ premioMonto: null, premioDescripcion: null })])}
      />
    );
    const { unmount } = render(<ToastProvider>{conMontaje("prueba", ui)}</ToastProvider>);
    expect(screen.getAllByRole("cell").some((celda) => celda.textContent === SIN_MONTO_RAYA)).toBe(true);
    unmount();
    expect(textoEn("prueba", ui)).toBe(textoEn("sin proveedor", ui));
  });

  it("R11/R16/R17: `RankingHistoricoModule` en el telefono, el premio de la tarjeta", () => {
    simularAncho(360);
    const ui = <RankingHistoricoModule fecha="2026-08-09" snapshot={snapshotCon([filaHistorico()])} />;
    expect(textoEn("prueba", ui)).toContain(`${formatearMontoEn(MONEDA_DE_PRUEBA, PREMIO)} · Bono oro`);
    compruebaLosTresMontajes((montaje) => textoEn(montaje, ui), PREMIO);
  });

  it("R11: `RankingHistoricoModule` en el telefono, sin premio la tarjeta dice «Sin premio asignado», como hoy", () => {
    simularAncho(360);
    const ui = (
      <RankingHistoricoModule
        fecha="2026-08-09"
        snapshot={snapshotCon([filaHistorico({ premioMonto: null, premioDescripcion: null })])}
      />
    );
    expect(textoEn("prueba", ui)).toContain(PREMIOS_LABELS.sinMonto);
    expect(textoEn("prueba", ui)).toBe(textoEn("sin proveedor", ui));
  });
});

// ---------------------------------------------------------------------------------------------
// Bloque 4 — ejemplos de plantillas e informes (R12, R13, design §8, §9)
// ---------------------------------------------------------------------------------------------
//
// Funciones puras y el servicio, sin pantalla: cada caso se mira con el pais de prueba
// (`MONEDA_DE_PRUEBA`), con Costa Rica (`MONEDA_CR`) y sin moneda. Con CR el texto es el de siempre,
// el mismo que sin moneda (R16, R17). Los casos montados de R13 (`VistaPreviaMensaje`,
// `VariablesInsert`) van al final del bloque.

const MAESTRO_PLANTILLAS: ActorPlantillas = { usuarioId: "u-maestro", rol: "maestro" };

/** `preview` no toca el repositorio: un doble vacio basta. */
const REPO_PLANTILLAS = {} as unknown as IPlantillaMensajeRepository;

const IMPORTE_DEL_FIXTURE = DATOS_PLANTILLA_EJEMPLO.orden.montoCobrar;

/** El texto que el envio real daria para ese cuerpo con el fixture y esa moneda (R12). */
function envioReal(cuerpo: string, moneda?: typeof MONEDA_DE_PRUEBA): string {
  return renderPlantilla(
    cuerpo,
    resolverValoresPlantilla(extraerVariables(cuerpo), DATOS_PLANTILLA_EJEMPLO, undefined, moneda),
  );
}

/** `preview` con `monedaDeVistaPrevia` → `moneda`; sin `moneda`, el servicio sin la dependencia. */
async function previewCon(cuerpo: string, moneda?: typeof MONEDA_DE_PRUEBA) {
  const monedaDeVistaPrevia = vi.fn(async () => moneda ?? MONEDA_PLATAFORMA);
  const servicio =
    moneda === undefined
      ? new PlantillaMensajeService(REPO_PLANTILLAS)
      : new PlantillaMensajeService(REPO_PLANTILLAS, undefined, { monedaDeVistaPrevia });
  const r = await servicio.preview(cuerpo, MAESTRO_PLANTILLAS);
  if (r.status !== "ok") throw new Error(`preview no ok: ${r.status}`);
  return { texto: r.texto, monedaDeVistaPrevia };
}

describe("SLT-241 R12 — la vista previa de una plantilla de orden pinta el importe en la moneda del pais", () => {
  it("R12: con el pais de prueba, `Total {{monto}}` sale en «€», igual que el envio real con esa moneda", async () => {
    const { texto, monedaDeVistaPrevia } = await previewCon("Total {{monto}}", MONEDA_DE_PRUEBA);
    expect(texto).toBe("Total €12 500");
    expect(texto).toBe(envioReal("Total {{monto}}", MONEDA_DE_PRUEBA));
    expect(monedaDeVistaPrevia).toHaveBeenCalledTimes(1);
  });

  it("R12/R16/R17: con CR, el mismo texto que sin la dependencia (la moneda de la plataforma)", async () => {
    const conCr = (await previewCon("Total {{monto}}", MONEDA_CR)).texto;
    const sinMoneda = (await previewCon("Total {{monto}}")).texto;
    expect(conCr).toBe(sinMoneda);
    expect(sinMoneda).toBe(`Total ${formatearMontoEn(MONEDA_PLATAFORMA, IMPORTE_DEL_FIXTURE)}`);
    expect(sinMoneda).not.toContain("€");
  });

  it("R12: un cuerpo sin importe no pide la moneda", async () => {
    const cuerpo = "Hola {{cliente}}, guia {{num_guia}}";
    const { texto, monedaDeVistaPrevia } = await previewCon(cuerpo, MONEDA_DE_PRUEBA);
    expect(texto).toBe(envioReal(cuerpo));
    expect(monedaDeVistaPrevia).not.toHaveBeenCalled();
  });

  it("R12: el alias `{{total}}` tambien pinta el importe en la moneda del pais", async () => {
    const { texto } = await previewCon("{{total}}", MONEDA_DE_PRUEBA);
    expect(texto).toBe(formatearMontoEn(MONEDA_DE_PRUEBA, IMPORTE_DEL_FIXTURE));
  });

  it("R12/R16/R17: `previewConEjemplos(cuerpo, zona, moneda)`; con CR, lo mismo que sin moneda", () => {
    expect(previewConEjemplos("Total {{monto}}", undefined, MONEDA_DE_PRUEBA)).toBe("Total €12 500");
    expect(previewConEjemplos("Total {{monto}}", undefined, MONEDA_CR)).toBe(previewConEjemplos("Total {{monto}}"));
  });

  it("R14/R15: el ejemplo de `{{monto}}` del catalogo (el que va a Meta) sigue en la moneda de la plataforma", () => {
    expect(EJEMPLOS_POR_CLAVE.monto).toBe(formatearMontoEn(MONEDA_PLATAFORMA, IMPORTE_DEL_FIXTURE));
    expect(EJEMPLOS_POR_CLAVE.monto).toBe(previewConEjemplos("{{monto}}"));
  });
});

const FUENTE_ACCION_PLANTILLAS = join(process.cwd(), "lib/actions/plantillas.ts");

/** El cuerpo de `buildPlantillaService`, sin comentarios: de su firma a la llave que la cierra. */
function cuerpoDeBuildPlantillas(fuente: string): string {
  const codigo = quitarComentarios(fuente);
  const inicio = codigo.indexOf("async function buildPlantillaService(");
  if (inicio === -1) return "";
  const abre = codigo.indexOf("{", codigo.indexOf(")", inicio));
  let nivel = 0;
  for (let j = abre; j < codigo.length; j++) {
    if (codigo[j] === "{") nivel += 1;
    if (codigo[j] === "}") {
      nivel -= 1;
      if (nivel === 0) return codigo.slice(abre, j + 1);
    }
  }
  return "";
}

const MONEDA_DEL_PAIS_RE =
  /monedaDeVistaPrevia:\s*async\s*\(\)\s*=>\s*\(?\s*await\s+paisParaPantallasDelActor\(\s*await\s+empresaDeLaPeticion\(\)\s*,\s*construirPaisService\(\)\s*,?\s*\)\s*\)?\s*\.moneda/;

/**
 * Lo que §9 exige del fuente, como lista de faltas (vacia = bien cableado): el
 * `new PlantillaMensajeService(` de `buildPlantillaService` recibe `monedaDeVistaPrevia`, y esa moneda
 * sale de `paisParaPantallasDelActor(` con la empresa de la sesion.
 */
function faltasDeCableadoPlantillas(fuente: string): string[] {
  const cuerpo = cuerpoDeBuildPlantillas(fuente);
  if (cuerpo === "") return ["no se encontro buildPlantillaService"];
  const i = cuerpo.indexOf("new PlantillaMensajeService(");
  if (i === -1) return ["no se construye PlantillaMensajeService"];
  const llamada = cuerpo.slice(i);
  if (!/monedaDeVistaPrevia\s*:/.test(llamada)) return ["new PlantillaMensajeService( no recibe monedaDeVistaPrevia"];
  if (!MONEDA_DEL_PAIS_RE.test(llamada)) return ["monedaDeVistaPrevia no sale de paisParaPantallasDelActor("];
  return [];
}

describe("SLT-241 §9 — `buildPlantillaService` pasa la moneda del pais a la vista previa", () => {
  const fuente = readFileSync(FUENTE_ACCION_PLANTILLAS, "utf8");

  it("§9/R12: `monedaDeVistaPrevia` sale de `paisParaPantallasDelActor(await empresaDeLaPeticion(), construirPaisService())`", () => {
    expect(faltasDeCableadoPlantillas(fuente)).toEqual([]);
  });

  it("contraprueba: sin la dependencia, la comprobacion falla", () => {
    const sinDep = fuente.replace(/monedaDeVistaPrevia:/, "otraCosa:");
    expect(sinDep).not.toBe(fuente);
    expect(faltasDeCableadoPlantillas(sinDep)).toEqual(["new PlantillaMensajeService( no recibe monedaDeVistaPrevia"]);
  });

  it("contraprueba: con la moneda de otro sitio, la comprobacion falla", () => {
    const deOtroSitio = fuente.replace(/paisParaPantallasDelActor\(\s*await empresaDeLaPeticion/, "otraLectura(await empresaDeLaPeticion");
    expect(deOtroSitio).not.toBe(fuente);
    expect(faltasDeCableadoPlantillas(deOtroSitio)).toEqual(["monedaDeVistaPrevia no sale de paisParaPantallasDelActor("]);
  });

  it("contraprueba: un comentario con la dependencia no cuenta", () => {
    const soloComentario = fuente.replace(/monedaDeVistaPrevia:/, "/* monedaDeVistaPrevia: */ otraCosa:");
    expect(faltasDeCableadoPlantillas(soloComentario)).toEqual(["new PlantillaMensajeService( no recibe monedaDeVistaPrevia"]);
  });
});

describe("SLT-241 R13 — la vista previa de un informe pinta el ejemplo de un importe en la moneda del pais", () => {
  const CUERPO = "Por cobrar {{por_cobrar}}, vencidos {{vencidos}}";
  const variables = catalogoDeVariables("transito");

  it("R13: con el pais de prueba, `{{por_cobrar}}` sale «€322 900» y `{{vencidos}}` sigue «7»", () => {
    const { texto, datos } = componerVistaPrevia(CUERPO, variables, {}, MONEDA_DE_PRUEBA);
    expect(texto).toBe("Por cobrar €322 900, vencidos 7");
    expect(datos.map((d) => d.valor)).toEqual(["€322 900", "7"]);
  });

  it("R13/R16/R17: con CR, el texto de siempre (el `ejemplo` del catalogo), igual que con la moneda de la plataforma", () => {
    const conCr = componerVistaPrevia(CUERPO, variables, {}, MONEDA_CR).texto;
    expect(conCr).toBe(componerVistaPrevia(CUERPO, variables, {}, MONEDA_PLATAFORMA).texto);
    const porCobrar = variables.find((v) => v.clave === "por_cobrar");
    expect(conCr).toBe(`Por cobrar ${porCobrar?.ejemplo}, vencidos 7`);
  });

  it("R13: un valor dado gana al ejemplo, tambien en un importe", () => {
    const { texto } = componerVistaPrevia(CUERPO, variables, { por_cobrar: "X" }, MONEDA_DE_PRUEBA);
    expect(texto).toBe("Por cobrar X, vencidos 7");
  });

  it("R13: solo `por_cobrar` lleva `importeEjemplo`; los ejemplos que no son importes no cambian con la moneda", () => {
    expect(variables.filter((v) => v.importeEjemplo !== undefined).map((v) => v.clave)).toEqual(["por_cobrar"]);
    for (const v of variables.filter((x) => x.importeEjemplo === undefined)) {
      expect(componerVistaPrevia(`{{${v.clave}}}`, variables, {}, MONEDA_DE_PRUEBA).texto).toBe(v.ejemplo);
    }
  });

  it("R14/R15: el `ejemplo` de `por_cobrar` (lo que viaja a Meta) sale del formateador en la moneda de la plataforma", () => {
    expect(ejemploDeVariableInforme("transito")("por_cobrar")).toBe(formatearMontoEn(MONEDA_PLATAFORMA, "322900.00"));
  });
});

// Casos montados de R13 (parte de pantalla de T4.2): las dos pantallas que pintan la vista previa de
// un informe leen `useMonedaDelPais()` y se la pasan a `componerVistaPrevia`. Cada una se monta con el
// pais de prueba, con CR y sin proveedor; con CR, el texto es el mismo que sin proveedor (R16, R17).
describe("SLT-241 R13 — montado: `VistaPreviaMensaje` y `VariablesInsert` pintan el importe en la moneda del pais", () => {
  const CUERPO = "Por cobrar {{por_cobrar}}, vencidos {{vencidos}}";
  const variables = catalogoDeVariables("transito");
  const IMPORTE = "322900.00";

  /** El texto de la vista previa de Envios automaticos en ese montaje. */
  function textoEnvios(montaje: Montaje): string {
    const { unmount } = render(
      <>{conMontaje(montaje, <VistaPreviaMensaje cuerpo={CUERPO} variables={variables} conDocumento={false} lector={null} />)}</>,
    );
    const texto = screen.getByTestId("vista-previa-texto").textContent ?? "";
    unmount();
    return texto;
  }

  /** El panel «Así lo verá el cliente» de Plantillas (rama de informe) en ese montaje. */
  function textoPlantillas(montaje: Montaje): string {
    const ref = createRef<HTMLTextAreaElement>();
    const { unmount } = render(
      <>
        {conMontaje(
          montaje,
          <VariablesInsert textareaRef={ref} value={CUERPO} onInsert={() => {}} variablesInforme={variables} />,
        )}
      </>,
    );
    const texto = (screen.getByTestId("plantilla-preview") as HTMLTextAreaElement).value;
    unmount();
    return texto;
  }

  it.each([
    ["VistaPreviaMensaje (Envios automaticos)", textoEnvios],
    ["VariablesInsert (Plantillas, rama de informe)", textoPlantillas],
  ])("R13/R16/R17: %s — con el pais de prueba su moneda; con CR, lo mismo que sin proveedor", (_nombre, texto) => {
    expect(texto("prueba")).toBe(`Por cobrar ${formatearMontoEn(MONEDA_DE_PRUEBA, IMPORTE)}, vencidos 7`);
    compruebaLosTresMontajes(texto, IMPORTE);
    expect(texto("sin proveedor")).toBe(`Por cobrar ${formatearMontoEn(MONEDA_PLATAFORMA, IMPORTE)}, vencidos 7`);
  });
});

// ---------------------------------------------------------------------------------------------
// Bloque 2 — pantalla de Tarifas (R1-R4, design §4, §9)
// ---------------------------------------------------------------------------------------------
//
// Primero los formatos puros de `tarifas-textos.ts` y `planDeGuardado` (T2.1): con la moneda de prueba,
// con CR y con la de la plataforma, que es la que la pantalla usa sin proveedor. Despues, los componentes
// montados (T2.2) con los tres montajes de `conMontaje`, y el censo «sin IVA» de los 8 archivos.
//
// Los textos con «IVA» van escritos a mano: son los de antes de esta ficha, y con CR deben salir iguales
// caracter a caracter (R16).

/** Un importe con cola y miles: con la moneda de prueba (0 decimales, espacio de miles) sale `€1 801`. */
const IMPORTE_TARIFA = "1800.50";
const IMPORTE_HOY = "2800.00";

/** Las dos monedas cuyo texto debe ser el mismo: Costa Rica y la de la plataforma (sin proveedor). */
const MONEDAS_DE_SIEMPRE: readonly [string, FormatoMoneda][] = [
  ["CR", MONEDA_CR],
  ["la plataforma", MONEDA_PLATAFORMA],
];

describe("SLT-241 R1 — `tarifas-textos`: los importes de la pantalla de Tarifas, en la moneda dada", () => {
  it("R1: un valor en monto, con la moneda de prueba, sale «€1 801» (sus reglas de formato)", () => {
    expect(textoValorSinIva({ modo: "monto", valor: IMPORTE_TARIFA }, MONEDA_DE_PRUEBA)).toBe("€1 801");
    expect(textoValor({ modo: "monto", valor: IMPORTE_TARIFA, ivaPct: null }, MONEDA_DE_PRUEBA, "IGV")).toBe("€1 801");
  });

  it("R1: «Hoy rige» en monto y «Varía: … a …» con la moneda de prueba", () => {
    expect(textoReferencia({ tipo: "monto", valor: IMPORTE_HOY, ivaPct: null }, MONEDA_DE_PRUEBA, "IGV")).toBe("€2 800");
    expect(textoReferencia({ tipo: "varia", desde: "1000.00", hasta: "12500.00" }, MONEDA_DE_PRUEBA, "IGV")).toBe(
      "Varía: €1 000 a €12 500",
    );
  });

  it("R1: sin importe pinta la raya larga de hoy", () => {
    expect(textoValorSinIva({ modo: "monto", valor: "" }, MONEDA_DE_PRUEBA)).toBe(SIN_MONTO_RAYA);
  });

  it.each(MONEDAS_DE_SIEMPRE)("R1/R16/R17: con %s, el importe de siempre (el de la plataforma)", (_n, moneda) => {
    const deSiempre = formatearMontoEn(MONEDA_PLATAFORMA, IMPORTE_TARIFA, SIN_MONTO_RAYA);
    expect(textoValorSinIva({ modo: "monto", valor: IMPORTE_TARIFA }, moneda)).toBe(deSiempre);
    expect(textoReferencia({ tipo: "varia", desde: IMPORTE_TARIFA, hasta: IMPORTE_HOY }, moneda, "IVA")).toBe(
      `Varía: ${deSiempre} a ${formatearMontoEn(MONEDA_PLATAFORMA, IMPORTE_HOY, SIN_MONTO_RAYA)}`,
    );
  });
});

describe("SLT-241 R2 — `etiquetaModo`: el rotulo del modo monto lleva el simbolo de la moneda dada", () => {
  it("R2: «Monto €» con la moneda de prueba; el porcentaje sigue «%»", () => {
    expect(etiquetaModo("monto", MONEDA_DE_PRUEBA)).toBe("Monto €");
    expect(etiquetaModo("porcentaje", MONEDA_DE_PRUEBA)).toBe("%");
  });

  it("R2/R16/R17: con CR, lo mismo que con la moneda de la plataforma", () => {
    expect(etiquetaModo("monto", MONEDA_CR)).toBe(etiquetaModo("monto", MONEDA_PLATAFORMA));
    expect(etiquetaModo("monto", MONEDA_PLATAFORMA)).toBe(`Monto ${MONEDA_PLATAFORMA.simbolo}`);
  });
});

describe("SLT-241 R3 — `porcentajeParaVer`: el separador decimal es el de la moneda dada", () => {
  it("R3: «3.50» sale «3.5» con la moneda de prueba (punto) y «3,5» con CR (coma); sin ceros de cola", () => {
    expect(porcentajeParaVer("3.50", MONEDA_DE_PRUEBA)).toBe("3.5");
    expect(porcentajeParaVer("3.50", MONEDA_CR)).toBe("3,5");
    expect(porcentajeParaVer("13.00", MONEDA_DE_PRUEBA)).toBe("13");
  });

  it("R3: un valor en % y el % del impuesto usan el separador de la moneda", () => {
    expect(textoValorSinIva({ modo: "porcentaje", valor: "3.50" }, MONEDA_DE_PRUEBA)).toBe("3.5 %");
    expect(textoValor({ modo: "monto", valor: IMPORTE_TARIFA, ivaPct: "13.50" }, MONEDA_DE_PRUEBA, "IGV")).toBe(
      "€1 801 + 13.5 % IGV",
    );
  });

  it("R3/R16/R17: con CR, lo mismo que con la moneda de la plataforma", () => {
    expect(porcentajeParaVer("3.50", MONEDA_CR)).toBe(porcentajeParaVer("3.50", MONEDA_PLATAFORMA));
  });

  it("R18: `porcentajeParaVerEnLaPlataforma` (la fila de gestion de cierres) sigue con la moneda de la plataforma", () => {
    expect(porcentajeParaVerEnLaPlataforma("3.50")).toBe(porcentajeParaVer("3.50", MONEDA_PLATAFORMA));
  });
});

describe("SLT-241 R4 — `textosDelImpuesto` y `planDeGuardado` nombran el impuesto dado", () => {
  it("R4: con «IGV», las 7 entradas dicen «IGV»", () => {
    const ti = textosDelImpuesto("IGV");
    expect(ti.colImpuesto).toBe("IGV");
    expect(ti.impuestoDe("Flete por entregado")).toBe("IGV de Flete por entregado");
    expect(ti.notaMensajero).toBe("Sin IGV. Por defecto vale para todos los vehículos; se puede fijar un valor por vehículo.");
    expect(ti.notaSatelite).toBe("Sin IGV. Pagas a la satélite solo por los resultados que definas.");
    expect(ti.impuestoObligatorio).toBe("Digita el IGV de este cobro. Si no lleva, escribe 0.");
    expect(ti.mensajerosBase).toBe("En % se calcula sobre el flete sin IGV que se le cobra a la tienda por esa gestión.");
    expect(ti.sinImpuesto).toBe("Sin IGV.");
  });

  it("R4/R16/R17: con «IVA» (CR y el rotulo de la plataforma), los textos de antes de la ficha", () => {
    const ti = textosDelImpuesto(IMPUESTO_ROTULO);
    expect(ti.colImpuesto).toBe("IVA");
    expect(ti.impuestoDe("Flete por entregado")).toBe("IVA de Flete por entregado");
    expect(ti.notaMensajero).toBe("Sin IVA. Por defecto vale para todos los vehículos; se puede fijar un valor por vehículo.");
    expect(ti.notaSatelite).toBe("Sin IVA. Pagas a la satélite solo por los resultados que definas.");
    expect(ti.impuestoObligatorio).toBe("Digita el IVA de este cobro. Si no lleva, escribe 0.");
    expect(ti.mensajerosBase).toBe("En % se calcula sobre el flete sin IVA que se le cobra a la tienda por esa gestión.");
    expect(ti.sinImpuesto).toBe("Sin IVA.");
  });

  it("R4: «+ <n> % <impuesto>» en el valor y en «Hoy rige»", () => {
    expect(textoValor({ modo: "monto", valor: IMPORTE_TARIFA, ivaPct: "13.00" }, MONEDA_DE_PRUEBA, "IGV")).toBe("€1 801 + 13 % IGV");
    expect(textoReferencia({ tipo: "porcentaje", valor: "2.00", ivaPct: "13.00" }, MONEDA_DE_PRUEBA, "IGV")).toBe(
      "2 % + 13 % IGV",
    );
  });

  it("R4: el aviso de impuesto obligatorio de `planDeGuardado` nombra el impuesto dado", () => {
    const sinImpuesto: CeldaEditada = {
      clave: "tienda_flete_entregado:todos",
      concepto: "tienda_flete_entregado",
      vehiculoId: null,
      guardado: undefined,
      celda: { valor: "3000", modo: "monto", ivaPct: "" },
    };
    const columnas = { zonaId: "z1", grupoId: null, tiendaId: null };
    expect(planDeGuardado([sinImpuesto], columnas, "IGV").errores).toEqual({
      "tienda_flete_entregado:todos": ["Digita el IGV de este cobro. Si no lleva, escribe 0."],
    });
    expect(planDeGuardado([sinImpuesto], columnas, IMPUESTO_ROTULO).errores).toEqual({
      "tienda_flete_entregado:todos": ["Digita el IVA de este cobro. Si no lleva, escribe 0."],
    });
  });
});

// --- T2.2: los componentes montados --------------------------------------------------------------

/** El texto de todo el documento (los dialogos van en un portal, fuera del `container`). */
function textoDelDocumento(montaje: Montaje, ui: ReactNode): string {
  const { unmount } = render(<ToastProvider>{conMontaje(montaje, ui)}</ToastProvider>);
  const texto = document.body.textContent ?? "";
  unmount();
  return texto;
}

/**
 * R4/R16/R17 sobre un texto pintado: con el pais de prueba nombra «IGV» y nunca «IVA»; sin proveedor,
 * el mismo texto con «IVA»; con CR, byte a byte lo de sin proveedor.
 */
function compruebaElImpuesto(texto: (montaje: Montaje) => string, esperadoConPrueba: string, esperadoSinProveedor: string) {
  const conPrueba = texto("prueba");
  expect(conPrueba).toContain(esperadoConPrueba);
  expect(conPrueba).not.toMatch(/\bIVA\b/);
  const sinProveedor = texto("sin proveedor");
  expect(sinProveedor).toContain(esperadoSinProveedor);
  expect(texto("cr")).toBe(sinProveedor);
}

function propsValores(extra: Partial<TarifasValoresProps> = {}): TarifasValoresProps {
  return {
    zonaId: "z1",
    nivel: { tipo: "zona" },
    valores: [],
    referencia: referenciaUniforme({ tipo: "monto", valor: IMPORTE_HOY, ivaPct: "13.00" }),
    vehiculos: [{ id: "v1", nombre: "Moto", activo: true }],
    activada: false,
    puedeEscribir: false,
    actor: "tienda",
    onActor: () => {},
    onGuardado: () => {},
    onSucioChange: () => {},
    ...extra,
  };
}

/** Con la moneda de la plataforma, como se pinta sin proveedor. */
const dePlataforma = (importe: string) => formatearMontoEn(MONEDA_PLATAFORMA, importe, SIN_MONTO_RAYA);

describe("SLT-241 R1/R2/R4 — montado: `TarifasValores`", () => {
  const conValor = propsValores({
    valores: [valor("tienda_flete_entregado", { valor: IMPORTE_TARIFA, ivaPct: "13.00" })],
  });

  it("R1/R16/R17: el valor guardado en monto sale en la moneda del pais; con CR, lo de sin proveedor", () => {
    const ui = <TarifasValores {...conValor} />;
    expect(textoEn("prueba", ui)).toContain("€1 801");
    compruebaLosTresMontajes((montaje) => textoEn(montaje, ui), IMPORTE_TARIFA);
  });

  it("R1/R4: «Hoy rige» en monto con «+ 13 % IGV»; con CR, lo de sin proveedor", () => {
    const ui = <TarifasValores {...conValor} />;
    compruebaElImpuesto((montaje) => textoEn(montaje, ui), "€2 800 + 13 % IGV", `${dePlataforma(IMPORTE_HOY)} + 13 % IVA`);
    compruebaLosTresMontajes((montaje) => textoEn(montaje, ui), IMPORTE_HOY);
  });

  it("R2: la columna Modo de un valor guardado dice «Monto €»", () => {
    const ui = <TarifasValores {...conValor} />;
    expect(textoEn("prueba", ui)).toContain("Monto €");
    expect(textoEn("sin proveedor", ui)).toContain(`Monto ${MONEDA_PLATAFORMA.simbolo}`);
    expect(textoEn("cr", ui)).toBe(textoEn("sin proveedor", ui));
  });

  it("R4: el encabezado de la columna del impuesto dice «IGV»", () => {
    const { unmount } = render(<ToastProvider>{conMontaje("prueba", <TarifasValores {...conValor} />)}</ToastProvider>);
    expect(screen.getByRole("columnheader", { name: "IGV" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "IVA" })).toBeNull();
    unmount();
  });

  it("R4: la etiqueta accesible del campo del impuesto dice «IGV de …»; sin proveedor, «IVA de …»", () => {
    const editable = <TarifasValores {...propsValores({ puedeEscribir: true })} />;
    const conPrueba = render(<ToastProvider>{conMontaje("prueba", editable)}</ToastProvider>);
    expect(screen.getByRole("textbox", { name: "IGV de Flete por entregado" })).toBeInTheDocument();
    conPrueba.unmount();
    const sinProveedor = render(<ToastProvider>{conMontaje("sin proveedor", editable)}</ToastProvider>);
    expect(screen.getByRole("textbox", { name: "IVA de Flete por entregado" })).toBeInTheDocument();
    sinProveedor.unmount();
  });

  it.each([
    ["mensajero", "Por defecto vale para todos los vehículos"],
    ["satelite", "Pagas a la satélite solo por los resultados que definas."],
  ] as const)("R4: la nota «Sin <impuesto>» de la pestaña %s", (actor, cola) => {
    const ui = <TarifasValores {...propsValores({ actor, referencia: null })} />;
    compruebaElImpuesto((montaje) => textoEn(montaje, ui), `Sin IGV. ${cola}`, `Sin IVA. ${cola}`);
  });
});

describe("SLT-241 R1/R2 — montado: `TarifasVehiculo` (pago por vehiculo, dentro de `TarifasValores`)", () => {
  it("R1/R16/R17: el valor de un vehiculo en solo lectura sale en la moneda del pais", () => {
    const ui = (
      <TarifasValores
        {...propsValores({
          actor: "mensajero",
          referencia: null,
          valores: [valor("mensajero_entregado", { vehiculoId: "v1", valor: IMPORTE_TARIFA })],
        })}
      />
    );
    expect(textoEn("prueba", ui)).toContain("€1 801");
    compruebaLosTresMontajes((montaje) => textoEn(montaje, ui), IMPORTE_TARIFA);
  });

  it("R1: «Hoy rige» de la celda «Todos los vehiculos» en la moneda del pais", () => {
    const ui = (
      <TarifasValores
        {...propsValores({
          actor: "mensajero",
          referencia: referenciaUniforme({ tipo: "monto", valor: IMPORTE_HOY, ivaPct: null }),
          valores: [valor("mensajero_entregado", { vehiculoId: "v1", valor: IMPORTE_TARIFA })],
        })}
      />
    );
    expect(textoEn("prueba", ui)).toContain(`Hoy rige: ${formatearMontoEn(MONEDA_DE_PRUEBA, IMPORTE_HOY)}`);
    compruebaLosTresMontajes((montaje) => textoEn(montaje, ui), IMPORTE_HOY);
  });

  it("R2: «En €» bajo una celda en monto cuando la fila va en %", () => {
    const ui = (
      <TarifasValores
        {...propsValores({
          actor: "mensajero",
          referencia: null,
          puedeEscribir: true,
          valores: [
            valor("mensajero_entregado", { modo: "porcentaje", valor: "10.00" }),
            valor("mensajero_entregado", { vehiculoId: "v1", valor: IMPORTE_TARIFA }),
          ],
        })}
      />
    );
    expect(textoEn("prueba", ui)).toContain("En €");
    expect(textoEn("sin proveedor", ui)).toContain(`En ${MONEDA_PLATAFORMA.simbolo}`);
    expect(textoEn("cr", ui)).toBe(textoEn("sin proveedor", ui));
  });
});

describe("SLT-241 R1/R4 — montado: `TarifasGrupos`", () => {
  const ui = (
    <TarifasGrupos
      zona={{ id: "z1", nombre: "Norte" }}
      grupos={[{ id: "g1", zonaId: "z1", nombre: "Centro", distritos: [{ id: "d1", nombre: "Uno" }] }]}
      distritos={[]}
      valores={[
        valor("tienda_flete_entregado", { grupoId: "g1", valor: IMPORTE_TARIFA, ivaPct: "13.00" }),
        valor("mensajero_entregado", { grupoId: "g1", valor: IMPORTE_HOY }),
      ]}
      activada={false}
      puedeEscribir={false}
      onCambio={() => {}}
    />
  );

  it("R1/R4/R16/R17: el flete del grupo con «+ 13 % IGV»; con CR, lo de sin proveedor", () => {
    compruebaElImpuesto((montaje) => textoEn(montaje, ui), "€1 801 + 13 % IGV", `${dePlataforma(IMPORTE_TARIFA)} + 13 % IVA`);
    compruebaLosTresMontajes((montaje) => textoEn(montaje, ui), IMPORTE_TARIFA);
  });

  it("R1: el resumen del pago al mensajero del grupo en la moneda del pais", () => {
    compruebaLosTresMontajes((montaje) => textoEn(montaje, ui), IMPORTE_HOY);
  });
});

describe("SLT-241 R1 — montado: `TarifasTiendas`", () => {
  const FILA: FilaPrecioTienda = {
    id: "t1:todas",
    tiendaId: "t1",
    tiendaNombre: "Tienda Uno",
    zonaId: null,
    grupoId: null,
    aplica: "Todas sus zonas",
    valores: [valor("tienda_flete_entregado", { tiendaId: "t1", zonaId: null, valor: IMPORTE_TARIFA })],
  };

  it("R1/R16/R17: el flete de la tienda en la moneda del pais; con CR, lo de sin proveedor", () => {
    const ui = <TarifasTiendas filas={[FILA]} puedeEscribir={false} onAnadir={() => {}} onEditar={() => {}} onCambio={() => {}} />;
    expect(textoEn("prueba", ui)).toContain("€1 801");
    compruebaLosTresMontajes((montaje) => textoEn(montaje, ui), IMPORTE_TARIFA);
  });
});

describe("SLT-241 R1/R2/R4 — montado: `TarifasMensajeros` y `TarifaMensajeroDialogo`", () => {
  const FILA: FilaMensajero = {
    mensajeroId: "m1",
    nombre: "Ana Torres",
    inactivo: false,
    valores: [valorPropio("mensajero_entregado", "m1", { valor: IMPORTE_TARIFA })],
  };
  const lista = (
    <TarifasMensajeros filas={[FILA]} mensajeros={[mensajeroPantalla()]} activada={false} puedeEscribir={false} onCambio={() => {}} />
  );
  const dialogo = (
    <TarifaMensajeroDialogo filas={[FILA]} disponibles={[]} mensajeroInicialId="m1" activada={false} onCerrar={() => {}} onCambio={() => {}} />
  );

  it("R1/R16/R17: el valor propio del mensajero en la moneda del pais", () => {
    expect(textoEn("prueba", lista)).toContain("€1 801");
    compruebaLosTresMontajes((montaje) => textoEn(montaje, lista), IMPORTE_TARIFA);
  });

  it("R4: la base del % del mensajero dice «sin IGV»", () => {
    const base = (impuesto: string) => `En % se calcula sobre el flete sin ${impuesto} que se le cobra a la tienda por esa gestión.`;
    compruebaElImpuesto((montaje) => textoEn(montaje, lista), base("IGV"), base("IVA"));
  });

  it("R4/R16/R17: la nota del dialogo dice «Sin IGV.» y la base «sin IGV»", () => {
    const texto = (montaje: Montaje) => textoDelDocumento(montaje, dialogo);
    compruebaElImpuesto(texto, "Sin IGV. ", "Sin IVA. ");
    compruebaElImpuesto(texto, "flete sin IGV que se le cobra", "flete sin IVA que se le cobra");
  });

  it("R2: el selector de modo del dialogo ofrece «Monto €»", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ToastProvider>{conMontaje("prueba", dialogo)}</ToastProvider>);
    await user.click(screen.getByRole("combobox", { name: "Modo de Por entregado" }));
    expect(await screen.findByRole("option", { name: "Monto €" })).toBeInTheDocument();
    unmount();
  });
});

// --- R4: censo «sin IVA» de los 8 archivos de la pantalla de Tarifas --------------------------

const ARCHIVOS_DE_TARIFAS = [
  "tarifas-textos.ts",
  "tarifas-borrador.ts",
  "TarifasValores.tsx",
  "TarifasVehiculo.tsx",
  "TarifasGrupos.tsx",
  "TarifasMensajeros.tsx",
  "TarifasTiendas.tsx",
  "TarifaMensajeroDialogo.tsx",
].map((archivo) => `app/(app)/configuracion/tarifas/_components/${archivo}`);

/** Las lineas de codigo (sin comentarios) que dicen «IVA» como palabra. Vacio = bien. */
function ivaEnElCodigo(fuente: string): string[] {
  return quitarComentarios(fuente)
    .split("\n")
    .filter((linea) => /\bIVA\b/.test(linea))
    .map((linea) => linea.trim());
}

describe("SLT-241 R4 — censo: los archivos de la pantalla de Tarifas no dicen «IVA» fuera de los comentarios", () => {
  it.each(ARCHIVOS_DE_TARIFAS)("R4: %s", (archivo) => {
    expect(ivaEnElCodigo(readFileSync(join(process.cwd(), archivo), "utf8"))).toEqual([]);
  });

  it("contraprueba: un texto con «IVA» en el codigo se detecta; en un comentario, no", () => {
    expect(ivaEnElCodigo('const x = "Sin IVA.";')).toEqual(['const x = "Sin IVA.";']);
    expect(ivaEnElCodigo("// Sin IVA.\n/** el IVA */\nconst conIva = 1;")).toEqual([]);
  });

  it("contraprueba: el archivo real de textos, con una entrada «IVA» de vuelta, se detecta", () => {
    const real = readFileSync(join(process.cwd(), ARCHIVOS_DE_TARIFAS[0]), "utf8");
    const conIva = real.replace("export const TEXTOS = {", 'export const TEXTOS = {\n  colIva: "IVA",');
    expect(conIva).not.toBe(real);
    expect(ivaEnElCodigo(conIva)).toEqual(['colIva: "IVA",']);
  });
});
