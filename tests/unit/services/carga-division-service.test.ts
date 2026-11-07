import { describe, it, expect, vi } from "vitest";

import { CargaDivisionService, type CargaDivisionRepo } from "@/lib/services/CargaDivisionService";
import type { DivisionPorProfundidadDePais } from "@/lib/interfaces/repositories/IGeoRepository";
import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import {
  DIVISION_MAX_BYTES,
  DIVISION_MAX_ERRORES,
  DIVISION_TOPE_DE_FILAS_CSV,
  type ResumenCargaPorProfundidad,
} from "@/lib/types/division-csv";
import type { TipoNivelDTO } from "@/lib/types/geografia-nodo";

// SL-20 (design §6; R24–R28, R37) — la carga del CSV, con dobles del repositorio.
//
// Aqui se mide lo que es del SERVICIO: la puerta de rol, el rechazo del archivo entero (R28), que con
// un error no se llega a escribir (R25) y lo que viaja al repositorio. Lo que la transaccion escribe
// de verdad —y que con un error no queda nada— se mide contra Postgres en
// `tests/integration/db/carga-division.test.ts`. La validacion fila a fila es de
// `planificarDivision` (`tests/unit/utils/division-csv.test.ts`).
//
// SLT-46 (T4.2; R30–R34, R39): el doble es el contrato por profundidad (`{tipos, nodos}`) y el plan
// y el resumen van por profundidad (1 = provincia, 2 = canton, 3 = distrito en CR). Los casos de
// SL-20 conservan su desenlace y su mensaje; la cabecera, que ahora depende de los P tipos del pais,
// se revisa DESPUES de leer la division (design §4.3).

const SUPERADMIN: Actor = { usuarioId: "u-superadmin", rol: "superadmin" };
const ROLES_DE_EMPRESA: Actor[] = ["maestro", "admin", "adminTienda", "adminSatelite", "mensajero"].map(
  (rol) => ({ usuarioId: `u-${rol}`, rol }) as Actor,
);

const CABECERA = "nivel_1,codigo_nivel_1,nivel_2,codigo_nivel_2,nivel_3,codigo_nivel_3";
function tipo(k: number, digitosCodigo: number | null = null): TipoNivelDTO {
  return {
    id: `t${k}`,
    clave: `nivel_${k}`,
    profundidad: k,
    nombreSingular: `Nivel ${k}`,
    nombrePlural: `Niveles ${k}`,
    digitosCodigo,
    codigoHeredaPrefijo: digitosCodigo !== null && k > 1,
  };
}
const tiposDe = (p: number) => Array.from({ length: p }, (_, i) => tipo(i + 1));
/** Un pais de tres tipos sin regla de codigo y sin nodos: el `PAIS_VACIO` de SL-20. */
const PAIS_VACIO: DivisionPorProfundidadDePais = { tipos: tiposDe(3), nodos: [] };
const RESUMEN: ResumenCargaPorProfundidad = {
  creados: { 1: 1, 2: 1, 3: 1 },
  existentes: 0,
  codigosCompletados: 0,
};

function utf8(texto: string): Uint8Array {
  return new TextEncoder().encode(texto);
}

function csv(...lineas: string[]): Uint8Array {
  return utf8([CABECERA, ...lineas].join("\n"));
}

function build(division: DivisionPorProfundidadDePais | null = PAIS_VACIO) {
  const repo = {
    leerDivisionDePais: vi.fn<CargaDivisionRepo["leerDivisionDePais"]>(async () => division),
    importarDivision: vi.fn<CargaDivisionRepo["importarDivision"]>(async () => RESUMEN),
  } satisfies CargaDivisionRepo;
  return { service: new CargaDivisionService(repo), repo };
}

async function rechazoDe(nombre: string, bytes: Uint8Array) {
  const { service, repo } = build();
  const r = await service.cargar("XA", { nombre, bytes }, SUPERADMIN);
  // R28: el archivo entero se rechaza ANTES de leer la base, y por tanto sin escribir.
  expect(repo.leerDivisionDePais).not.toHaveBeenCalled();
  expect(repo.importarDivision).not.toHaveBeenCalled();
  expect(r.status).toBe("archivo_rechazado");
  if (r.status !== "archivo_rechazado") throw new Error("no fue archivo_rechazado");
  return r.motivo;
}

/**
 * SLT-46 (R30): el rechazo por CABECERA necesita los P tipos del pais, asi que llega despues de leer
 * la division; sigue sin escribir nada. Lo demas de `rechazoDe` no cambia.
 */
async function rechazoDeCabecera(bytes: Uint8Array, division: DivisionPorProfundidadDePais = PAIS_VACIO) {
  const { service, repo } = build(division);
  const r = await service.cargar("XA", { nombre: "d.csv", bytes }, SUPERADMIN);
  expect(repo.leerDivisionDePais).toHaveBeenCalledTimes(1);
  expect(repo.importarDivision).not.toHaveBeenCalled();
  expect(r.status).toBe("archivo_rechazado");
  if (r.status !== "archivo_rechazado") throw new Error("no fue archivo_rechazado");
  return r.motivo;
}

// =================================================================================================
// R37 — la puerta de rol
// =================================================================================================

describe("SL-20/R37 — un rol de empresa recibe `forbidden` sin tocar la base", () => {
  it.each(ROLES_DE_EMPRESA)("rol $rol", async (actor) => {
    const { service, repo } = build();
    const r = await service.cargar("XA", { nombre: "d.csv", bytes: csv("A1,,B1,,,") }, actor);
    expect(r).toEqual({ status: "forbidden" });
    expect(repo.leerDivisionDePais).not.toHaveBeenCalled();
    expect(repo.importarDivision).not.toHaveBeenCalled();
  });
});

// =================================================================================================
// R28 — el archivo entero no sirve
// =================================================================================================

describe("SL-20/R28 — el archivo se rechaza entero, sin leer ni escribir la base", () => {
  it("una extension que no es .csv (aunque el contenido sea CSV)", async () => {
    expect(await rechazoDe("division.xlsx", csv("A1,,B1,,,"))).toMatch(/\.csv/);
    expect(await rechazoDe("division.csv.txt", csv("A1,,B1,,,"))).toMatch(/\.csv/);
  });

  it("la extension no distingue mayusculas: «.CSV» se acepta", async () => {
    const { service } = build();
    const r = await service.cargar("XA", { nombre: "DIVISION.CSV", bytes: csv("Aa,,Bb,,,") }, SUPERADMIN);
    expect(r.status).toBe("ok");
  });

  it("mas de 5 MB", async () => {
    const relleno = new Uint8Array(DIVISION_MAX_BYTES + 1).fill(0x20);
    expect(await rechazoDe("d.csv", relleno)).toMatch(/5 MB/);
  });

  it("CONTRAPRUEBA: exactamente 5 MB no se rechaza por tamaño", async () => {
    const cuerpo = csv("Aa,,Bb,,,");
    const bytes = new Uint8Array(DIVISION_MAX_BYTES).fill(0x0a); // saltos de linea: filas vacias
    bytes.set(cuerpo, 0);
    const { service } = build();
    const r = await service.cargar("XA", { nombre: "d.csv", bytes }, SUPERADMIN);
    expect(r.status).toBe("ok");
  });

  it("UTF-8 invalido (un «ó» en Latin-1) se rechaza en vez de entrar como «�»", async () => {
    const latin1 = Uint8Array.from([...utf8(`${CABECERA}\nLim`), 0xf3, ...utf8("n,,Bb,,,")]);
    expect(await rechazoDe("d.csv", latin1)).toMatch(/UTF-8/);
  });

  it("CONTRAPRUEBA: con BOM se acepta y la primera columna se reconoce", async () => {
    const conBom = Uint8Array.from([0xef, 0xbb, 0xbf, ...csv("Limón,,Bb,,,")]);
    const { service, repo } = build();
    const r = await service.cargar("XA", { nombre: "d.csv", bytes: conBom }, SUPERADMIN);
    expect(r.status).toBe("ok");
    const plan = repo.importarDivision.mock.calls[0]![1];
    expect(plan.altas[1].map((a) => a.nombre)).toEqual(["Limón"]);
  });

  it.each(["nivel_1", "codigo_nivel_2", "nivel_3", "codigo_nivel_3"])(
    "falta la columna obligatoria «%s»",
    async (columna) => {
      const cabecera = CABECERA.split(",").filter((c) => c !== columna);
      const bytes = utf8([cabecera.join(","), cabecera.map(() => "Xx").join(",")].join("\n"));
      expect(await rechazoDeCabecera(bytes)).toContain(columna);
    },
  );

  it("un archivo vacio no tiene cabecera: le faltan todas", async () => {
    expect(await rechazoDeCabecera(new Uint8Array())).toMatch(/nivel_1.*codigo_nivel_3/);
  });

  it(`mas de ${DIVISION_TOPE_DE_FILAS_CSV} filas de datos`, async () => {
    const filas = Array.from({ length: DIVISION_TOPE_DE_FILAS_CSV + 1 }, (_, i) => `P${i},,C${i},,,`);
    expect(await rechazoDe("d.csv", csv(...filas))).toMatch(/10000 filas/);
  });

  it(`CONTRAPRUEBA: exactamente ${DIVISION_TOPE_DE_FILAS_CSV} filas pasan a planificarse`, async () => {
    const filas = Array.from({ length: DIVISION_TOPE_DE_FILAS_CSV }, () => `Pp,,Cc,,,`);
    const { service, repo } = build();
    const r = await service.cargar("XA", { nombre: "d.csv", bytes: csv(...filas) }, SUPERADMIN);
    expect(r.status).toBe("ok");
    expect(repo.importarDivision).toHaveBeenCalledTimes(1);
  });
});

// =================================================================================================
// Decision 4 de SL-20 — columnas de mas: se ignoran y se avisa
// =================================================================================================

describe("SL-20 (decision 4) — las columnas de mas se ignoran y se avisan en `avisos`", () => {
  it("cabecera en otro orden, con mayusculas, espacios y una columna de mas", async () => {
    const bytes = utf8(
      [
        " Nivel_3 ,NIVEL_1,codigo_nivel_1,poblacion,nivel_2,codigo_nivel_2,codigo_nivel_3",
        "Carmen,San José,1,350000,San José,101,10101",
      ].join("\n"),
    );
    const { service, repo } = build();
    const r = await service.cargar("XA", { nombre: "d.csv", bytes }, SUPERADMIN);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") throw new Error("no fue ok");
    expect(r.avisos).toEqual(["La columna «poblacion» no es del formato y se ignoró."]);

    const plan = repo.importarDivision.mock.calls[0]![1];
    expect(plan.altas[3]).toEqual([
      expect.objectContaining({ nombre: "Carmen", codigo: "10101" }),
    ]);
  });

  it("sin columnas de mas, `avisos` existe y va vacio", async () => {
    const { service } = build();
    const r = await service.cargar("XA", { nombre: "d.csv", bytes: csv("Aa,,Bb,,,") }, SUPERADMIN);
    expect(r).toMatchObject({ status: "ok", avisos: [] });
  });

  it("R48: con una columna de mas Y una fila invalida, el `invalido` tambien trae el aviso", async () => {
    const bytes = utf8([`${CABECERA},poblacion`, ",,Bb,,,,350000"].join("\n"));
    const { service, repo } = build();
    const r = await service.cargar("XA", { nombre: "d.csv", bytes }, SUPERADMIN);
    expect(repo.importarDivision).not.toHaveBeenCalled();
    expect(r).toEqual({
      status: "invalido",
      errores: [{ linea: 2, mensaje: "nivel_1: es obligatorio." }],
      total: 1,
      avisos: ["La columna «poblacion» no es del formato y se ignoró."],
    });
  });
});

// =================================================================================================
// R24, R25 — el plan y la escritura
// =================================================================================================

describe("SL-20/R24, R25 — del archivo al repositorio", () => {
  it("R24: un CSV valido se escribe UNA vez, con el pais y el actor, y devuelve el resumen", async () => {
    const { service, repo } = build();
    const r = await service.cargar(
      "XA",
      { nombre: "d.csv", bytes: csv("Región,R1,Comuna,C1,Barrio,B1") },
      SUPERADMIN,
    );
    expect(r).toEqual({ status: "ok", ...RESUMEN, avisos: [] });
    expect(repo.leerDivisionDePais).toHaveBeenCalledWith("XA");
    expect(repo.importarDivision).toHaveBeenCalledTimes(1);
    const [paisId, plan, actor] = repo.importarDivision.mock.calls[0]!;
    expect(paisId).toBe("XA");
    expect(actor).toBe("u-superadmin");
    expect(plan.resumen.creados).toEqual({ 1: 1, 2: 1, 3: 1 });
  });

  it("los codigos con cero inicial llegan como TEXTO al plan (riesgo §12)", async () => {
    const { service, repo } = build();
    await service.cargar("XA", { nombre: "d.csv", bytes: csv("Aa,01,Bb,0101,,") }, SUPERADMIN);
    const plan = repo.importarDivision.mock.calls[0]![1];
    expect(plan.altas[1][0]!.codigo).toBe("01");
    expect(plan.altas[2][0]!.codigo).toBe("0101");
  });

  it("R25: con UNA fila invalida no se escribe nada, y el error cita su linea del archivo", async () => {
    const { service, repo } = build();
    const r = await service.cargar(
      "XA",
      // La linea 3 queda vacia (se descarta) y la mala es la 4: el numero es el del archivo.
      { nombre: "d.csv", bytes: csv("Aa,,Bb,,,", "", ",,Cc,,,") },
      SUPERADMIN,
    );
    expect(repo.importarDivision).not.toHaveBeenCalled();
    expect(r).toEqual({
      status: "invalido",
      errores: [{ linea: 4, mensaje: "nivel_1: es obligatorio." }],
      total: 1,
      avisos: [],
    });
  });

  it(`R25: devuelve como mucho ${DIVISION_MAX_ERRORES} errores, y \`total\` dice cuantos hubo`, async () => {
    const malas = Array.from({ length: DIVISION_MAX_ERRORES + 50 }, () => ",,Bb,,,");
    const { service, repo } = build();
    const r = await service.cargar("XA", { nombre: "d.csv", bytes: csv(...malas) }, SUPERADMIN);
    expect(repo.importarDivision).not.toHaveBeenCalled();
    expect(r.status).toBe("invalido");
    if (r.status !== "invalido") throw new Error("no fue invalido");
    expect(r.errores).toHaveLength(DIVISION_MAX_ERRORES);
    expect(r.total).toBe(DIVISION_MAX_ERRORES + 50);
  });

  it("R17 en la carga: la regla sale del pais que devuelve el repositorio", async () => {
    // SLT-46: la regla de CR (1/3/5 y prefijo) leida de sus tipos.
    const { service, repo } = build({ tipos: [tipo(1, 1), tipo(2, 3), tipo(3, 5)], nodos: [] });
    const r = await service.cargar("CR", { nombre: "d.csv", bytes: csv("Aa,12,Bb,,,") }, SUPERADMIN);
    expect(r.status).toBe("invalido");
    expect(repo.importarDivision).not.toHaveBeenCalled();
  });

  it("un pais que no existe es `not_found` y no se escribe nada", async () => {
    const { service, repo } = build(null);
    const r = await service.cargar("XZ", { nombre: "d.csv", bytes: csv("Aa,,Bb,,,") }, SUPERADMIN);
    expect(r).toEqual({ status: "not_found" });
    expect(repo.importarDivision).not.toHaveBeenCalled();
  });

  it("un fallo de la base al escribir NO se traga: se propaga para que el borde responda `error`", async () => {
    const { service, repo } = build();
    repo.importarDivision.mockRejectedValueOnce(new Error("23505 carrera"));
    await expect(
      service.cargar("XA", { nombre: "d.csv", bytes: csv("Aa,,Bb,,,") }, SUPERADMIN),
    ).rejects.toThrow(/23505/);
  });
});

// =================================================================================================
// SLT-46 R39 — el rol antes de todo, con un repositorio que revienta si se le llama
// =================================================================================================

describe("SLT-46 R39 — `maestro` es `forbidden` sin leer el archivo ni la base", () => {
  const queFalla: CargaDivisionRepo = {
    leerDivisionDePais: () => {
      throw new Error("leerDivisionDePais no debia llamarse");
    },
    importarDivision: () => {
      throw new Error("importarDivision no debia llamarse");
    },
  };

  it.each([
    ["un CSV valido", { nombre: "d.csv", bytes: csv("Aa,,Bb,,,") }],
    ["un archivo que no es .csv", { nombre: "d.xlsx", bytes: csv("Aa,,Bb,,,") }],
    ["un archivo sin cabecera", { nombre: "d.csv", bytes: new Uint8Array() }],
  ])("%s → forbidden", async (_c, archivo) => {
    const r = await new CargaDivisionService(queFalla).cargar("CR", archivo, { usuarioId: "u-m", rol: "maestro" } as Actor);
    expect(r).toEqual({ status: "forbidden" });
  });

  it("CONTRAPRUEBA: con el superadmin el mismo doble SI revienta", async () => {
    await expect(
      new CargaDivisionService(queFalla).cargar("CR", { nombre: "d.csv", bytes: csv("Aa,,Bb,,,") }, SUPERADMIN),
    ).rejects.toThrow(/leerDivisionDePais no debia llamarse/);
  });
});

// =================================================================================================
// SLT-46 R30–R34 — P = 2, P = 3 y P = 4
// =================================================================================================

describe("SLT-46 R30 — las columnas obligatorias son las de los P tipos del pais", () => {
  const CABECERA_4 = `${CABECERA},nivel_4,codigo_nivel_4`;

  it("P = 3 (CR): las seis de SL-20, y `nivel_4` es un aviso que se ignora (R34)", async () => {
    const { service, repo } = build();
    const r = await service.cargar(
      "CR",
      { nombre: "d.csv", bytes: utf8([CABECERA_4, "Aa,,Bb,,Cc,,Dd,"].join("\n")) },
      SUPERADMIN,
    );
    expect(r).toMatchObject({ status: "ok", avisos: ["La columna «nivel_4» no es del formato y se ignoró.", "La columna «codigo_nivel_4» no es del formato y se ignoró."] });
    const plan = repo.importarDivision.mock.calls[0]![1];
    expect(Object.keys(plan.altas)).toEqual(["1", "2", "3"]);
  });

  it.each(["nivel_4", "codigo_nivel_4"])("P = 4: falta «%s» → archivo rechazado sin escribir", async (columna) => {
    const cabecera = CABECERA_4.split(",").filter((c) => c !== columna);
    const bytes = utf8([cabecera.join(","), cabecera.map(() => "Xx").join(",")].join("\n"));
    expect(await rechazoDeCabecera(bytes, { tipos: tiposDe(4), nodos: [] })).toBe(
      `Faltan columnas obligatorias: ${columna}.`,
    );
  });

  it("P = 4: el CSV de SL-20 (seis columnas) ya no basta", async () => {
    expect(await rechazoDeCabecera(csv("Aa,,Bb,,,"), { tipos: tiposDe(4), nodos: [] })).toBe(
      "Faltan columnas obligatorias: nivel_4, codigo_nivel_4.",
    );
  });

  it("P = 4: una fila de cuatro niveles planifica una alta por profundidad, con su codigo", async () => {
    const { service, repo } = build({ tipos: tiposDe(4), nodos: [] });
    const r = await service.cargar(
      "XA",
      { nombre: "d.csv", bytes: utf8([CABECERA_4, "Aa,A,Bb,B,Cc,C,Dd,D4", "Aa,A,Bb,B,Cc,C,,"].join("\n")) },
      SUPERADMIN,
    );
    expect(r).toMatchObject({ status: "ok", avisos: [] });
    const plan = repo.importarDivision.mock.calls[0]![1];
    expect(plan.resumen.creados).toEqual({ 1: 1, 2: 1, 3: 1, 4: 1 });
    expect(plan.altas[4]).toEqual([expect.objectContaining({ nombre: "Dd", codigo: "D4" })]);
  });

  it("P = 2: cuatro columnas bastan, y `nivel_3`/`codigo_nivel_3` son avisos", async () => {
    const { service, repo } = build({ tipos: tiposDe(2), nodos: [] });
    const r = await service.cargar("XA", { nombre: "d.csv", bytes: csv("Aa,,Bb,,Cc,") }, SUPERADMIN);
    expect(r).toMatchObject({
      status: "ok",
      avisos: ["La columna «nivel_3» no es del formato y se ignoró.", "La columna «codigo_nivel_3» no es del formato y se ignoró."],
    });
    expect(repo.importarDivision.mock.calls[0]![1].resumen.creados).toEqual({ 1: 1, 2: 1 });
  });

  it("P = 2: sin columnas de nivel 3 el archivo entra", async () => {
    const { service } = build({ tipos: tiposDe(2), nodos: [] });
    const bytes = utf8(["nivel_1,codigo_nivel_1,nivel_2,codigo_nivel_2", "Aa,,Bb,"].join("\n"));
    expect(await service.cargar("XA", { nombre: "d.csv", bytes }, SUPERADMIN)).toMatchObject({ status: "ok", avisos: [] });
  });
});

describe("SLT-46 R32, R33 — la fila a P niveles, por el servicio", () => {
  const CABECERA_4 = `${CABECERA},nivel_4,codigo_nivel_4`;

  it("R32: un hueco (nivel_3 vacio con nivel_4 lleno) es error de linea y no se escribe nada", async () => {
    const { service, repo } = build({ tipos: tiposDe(4), nodos: [] });
    const r = await service.cargar("XA", { nombre: "d.csv", bytes: utf8([CABECERA_4, "Aa,,Bb,,,,Dd,"].join("\n")) }, SUPERADMIN);
    expect(r).toEqual({
      status: "invalido",
      errores: [{ linea: 2, mensaje: "nivel_3: está vacío pero la fila sigue en nivel_4; no se puede saltar un nivel." }],
      total: 1,
      avisos: [],
    });
    expect(repo.importarDivision).not.toHaveBeenCalled();
  });

  it("R33: los nodos que ya estan (leidos con su profundidad) cuentan como existentes y completan codigo", async () => {
    const { service, repo } = build({
      tipos: tiposDe(4),
      nodos: [
        { id: "n1", nombre: "Aa", codigo: "A", activo: true, padreId: null, profundidad: 1 },
        { id: "n2", nombre: "Bb", codigo: null, activo: true, padreId: "n1", profundidad: 2 },
      ],
    });
    await service.cargar("XA", { nombre: "d.csv", bytes: utf8([CABECERA_4, "aa,A,BB,B,Cc,,Dd,"].join("\n")) }, SUPERADMIN);
    const plan = repo.importarDivision.mock.calls[0]![1];
    expect(plan.resumen).toEqual({ creados: { 1: 0, 2: 0, 3: 1, 4: 1 }, existentes: 2, codigosCompletados: 1 });
    expect(plan.codigosACompletar).toEqual([{ profundidad: 2, id: "n2", codigo: "B" }]);
    expect(plan.altas[3]).toEqual([expect.objectContaining({ padre: { tipo: "existente", id: "n2" } })]);
  });

  it("R34: las cotas siguen siendo las de SL-20 con P = 4 (mas de 10 000 filas, sin leer la base)", async () => {
    const filas = Array.from({ length: DIVISION_TOPE_DE_FILAS_CSV + 1 }, (_, i) => `P${i},,C${i},,,,,`);
    const { service, repo } = build({ tipos: tiposDe(4), nodos: [] });
    const r = await service.cargar("XA", { nombre: "d.csv", bytes: utf8([CABECERA_4, ...filas].join("\n")) }, SUPERADMIN);
    expect(r).toEqual({ status: "archivo_rechazado", motivo: `El archivo tiene más de ${DIVISION_TOPE_DE_FILAS_CSV} filas de datos.` });
    expect(repo.leerDivisionDePais).not.toHaveBeenCalled();
  });
});
