import { describe, it, expect, vi } from "vitest";

import { CargaDivisionService, type CargaDivisionRepo } from "@/lib/services/CargaDivisionService";
import type { DivisionDePais } from "@/lib/interfaces/repositories/IGeoRepository";
import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import {
  DIVISION_MAX_BYTES,
  DIVISION_MAX_ERRORES,
  DIVISION_TOPE_DE_FILAS_CSV,
  type ResumenCarga,
} from "@/lib/types/division-csv";

// SL-20 (design §6; R24–R28, R37) — la carga del CSV, con dobles del repositorio.
//
// Aqui se mide lo que es del SERVICIO: la puerta de rol, el rechazo del archivo entero (R28), que con
// un error no se llega a escribir (R25) y lo que viaja al repositorio. Lo que la transaccion escribe
// de verdad —y que con un error no queda nada— se mide contra Postgres en
// `tests/integration/db/carga-division.test.ts`. La validacion fila a fila es de
// `planificarDivision` (`tests/unit/utils/division-csv.test.ts`).

const SUPERADMIN: Actor = { usuarioId: "u-superadmin", rol: "superadmin" };
const ROLES_DE_EMPRESA: Actor[] = ["maestro", "admin", "adminTienda", "adminSatelite", "mensajero"].map(
  (rol) => ({ usuarioId: `u-${rol}`, rol }) as Actor,
);

const CABECERA = "nivel_1,codigo_nivel_1,nivel_2,codigo_nivel_2,nivel_3,codigo_nivel_3";
const SIN_REGLA = { digitosCodigoNivel1: null, digitosCodigoNivel2: null, digitosCodigoNivel3: null };
const PAIS_VACIO: DivisionDePais = {
  regla: SIN_REGLA,
  arbol: { provincia: [], canton: [], distrito: [] },
};
const RESUMEN: ResumenCarga = {
  creados: { provincia: 1, canton: 1, distrito: 1 },
  existentes: 0,
  codigosCompletados: 0,
};

function utf8(texto: string): Uint8Array {
  return new TextEncoder().encode(texto);
}

function csv(...lineas: string[]): Uint8Array {
  return utf8([CABECERA, ...lineas].join("\n"));
}

function build(division: DivisionDePais | null = PAIS_VACIO) {
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
    expect(plan.altas.provincia.map((a) => a.nombre)).toEqual(["Limón"]);
  });

  it.each(["nivel_1", "codigo_nivel_2", "nivel_3", "codigo_nivel_3"])(
    "falta la columna obligatoria «%s»",
    async (columna) => {
      const cabecera = CABECERA.split(",").filter((c) => c !== columna);
      const bytes = utf8([cabecera.join(","), cabecera.map(() => "Xx").join(",")].join("\n"));
      expect(await rechazoDe("d.csv", bytes)).toContain(columna);
    },
  );

  it("un archivo vacio no tiene cabecera: le faltan todas", async () => {
    expect(await rechazoDe("d.csv", new Uint8Array())).toMatch(/nivel_1.*codigo_nivel_3/);
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
    expect(plan.altas.distrito).toEqual([
      expect.objectContaining({ nombre: "Carmen", codigo: "10101" }),
    ]);
  });

  it("sin columnas de mas, `avisos` existe y va vacio", async () => {
    const { service } = build();
    const r = await service.cargar("XA", { nombre: "d.csv", bytes: csv("Aa,,Bb,,,") }, SUPERADMIN);
    expect(r).toMatchObject({ status: "ok", avisos: [] });
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
    expect(plan.resumen.creados).toEqual({ provincia: 1, canton: 1, distrito: 1 });
  });

  it("los codigos con cero inicial llegan como TEXTO al plan (riesgo §12)", async () => {
    const { service, repo } = build();
    await service.cargar("XA", { nombre: "d.csv", bytes: csv("Aa,01,Bb,0101,,") }, SUPERADMIN);
    const plan = repo.importarDivision.mock.calls[0]![1];
    expect(plan.altas.provincia[0]!.codigo).toBe("01");
    expect(plan.altas.canton[0]!.codigo).toBe("0101");
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
    const { service, repo } = build({
      regla: { digitosCodigoNivel1: 1, digitosCodigoNivel2: 3, digitosCodigoNivel3: 5 },
      arbol: { provincia: [], canton: [], distrito: [] },
    });
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
