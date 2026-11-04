import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

import { quitarComentarios } from "@/tests/fixtures/sin-comentarios";

// =================================================================================================
// GUARDIA — SLT-52 (R38, T7.1) — LAS RAICES DE COMPOSICION PASAN EL REPOSITORIO DE TARIFAS
// =================================================================================================
//
// El cobro y el pago salen del resolver unico (design §1, §5): `TarifaVigenteRepository` (cobro a
// la tienda, que `CierreDiaRepository` congela en la tx de `crearCierre`) y
// `TarifaZonaMensajeroRepository` (pago al mensajero). Si una raiz de composicion construye el
// cierre sin ellos, el cierre deja de calcular con el mismo resolver que el listado y la API, y
// R38 se rompe sin que ningun test de servicio lo vea (usan dobles).
//
// Regla, en el codigo de `app/` y `lib/` (sin comentarios, CRLF-tolerante):
//   · cada `new CierreDiaRepository(` lleva `new TarifaVigenteRepository(` entre sus argumentos;
//   · cada `new CierreDiaService(` y `new CorteDiarioService(` lleva, entre sus argumentos, un
//     `new CierreDiaRepository(` y un `new TarifaZonaMensajeroRepository(`.
// Con suelo: si no encuentra al menos las raices conocidas, sale ROJA (no verde por vacio).

const RAIZ = path.resolve(__dirname, "../../..");
const CARPETAS = ["app", "lib"];

/** Raices conocidas a 2026-11-03: cron del corte diario y acciones del cierre del dia. */
const MINIMO_POR_CONSTRUCTOR: Record<string, number> = {
  CierreDiaRepository: 2,
  CierreDiaService: 1,
  CorteDiarioService: 1,
};

/** Lo que cada constructor debe recibir entre sus argumentos. */
const EXIGIDOS: Record<string, readonly string[]> = {
  CierreDiaRepository: ["TarifaVigenteRepository"],
  CierreDiaService: ["CierreDiaRepository", "TarifaZonaMensajeroRepository"],
  CorteDiarioService: ["CierreDiaRepository", "TarifaZonaMensajeroRepository"],
};

function archivosDe(dir: string): string[] {
  const salida: string[] = [];
  for (const nombre of readdirSync(dir)) {
    if (nombre === "node_modules" || nombre.startsWith(".")) continue;
    const ruta = path.join(dir, nombre);
    if (statSync(ruta).isDirectory()) salida.push(...archivosDe(ruta));
    else if (/\.(ts|tsx)$/.test(nombre) && !/\.(test|spec)\.tsx?$/.test(nombre)) salida.push(ruta);
  }
  return salida;
}

/** Texto entre el `(` de `inicio` y su `)` de cierre (parentesis balanceados). */
function argumentosDesde(codigo: string, inicio: number): string {
  let profundidad = 0;
  for (let i = inicio; i < codigo.length; i += 1) {
    const c = codigo[i];
    if (c === "(") profundidad += 1;
    else if (c === ")") {
      profundidad -= 1;
      if (profundidad === 0) return codigo.slice(inicio + 1, i);
    }
  }
  return codigo.slice(inicio + 1);
}

interface Llamada {
  clase: string;
  argumentos: string;
}

/** Cada `new <Clase>(` vigilado, con sus argumentos. */
function llamadasEn(fuente: string): Llamada[] {
  const codigo = quitarComentarios(fuente.replace(/\r\n/g, "\n"));
  const salida: Llamada[] = [];
  const re = new RegExp(`\\bnew\\s+(${Object.keys(EXIGIDOS).join("|")})\\s*\\(`, "g");
  for (let m = re.exec(codigo); m !== null; m = re.exec(codigo)) {
    const parentesis = m.index + m[0].length - 1;
    salida.push({ clase: m[1], argumentos: argumentosDesde(codigo, parentesis) });
  }
  return salida;
}

/** Lo exigido que falta en una llamada. */
function faltantes(llamada: Llamada): string[] {
  return EXIGIDOS[llamada.clase].filter(
    (dep) => !new RegExp(`\\bnew\\s+${dep}\\s*\\(`).test(llamada.argumentos),
  );
}

describe("GUARDIA SLT-52/R38 — las raices de composicion pasan el repositorio de tarifas", () => {
  it("contraprueba: el detector distingue la llamada completa de la que olvida la tarifa", () => {
    const completa = llamadasEn(
      "x = new CierreDiaRepository(prisma, new TarifaVigenteRepository(prisma));",
    );
    expect(completa).toHaveLength(1);
    expect(faltantes(completa[0])).toEqual([]);

    const sinTarifa = llamadasEn("x = new CierreDiaRepository(prisma);\r\n");
    expect(sinTarifa).toHaveLength(1);
    expect(faltantes(sinTarifa[0])).toEqual(["TarifaVigenteRepository"]);

    // El repo anidado en el service se cuenta aparte: el service sin pago al mensajero falla.
    const servicio = llamadasEn(
      "new CierreDiaService(\n  new CierreDiaRepository(prisma, new TarifaVigenteRepository(prisma)),\n  new ZonaRepository(prisma),\n)",
    );
    expect(servicio.map((l) => l.clase)).toEqual(["CierreDiaService", "CierreDiaRepository"]);
    expect(faltantes(servicio[0])).toEqual(["TarifaZonaMensajeroRepository"]);
    expect(faltantes(servicio[1])).toEqual([]);

    // Nombrada solo en un comentario no cuenta.
    const comentada = llamadasEn("new CierreDiaRepository(prisma /* new TarifaVigenteRepository(p) */)");
    expect(faltantes(comentada[0])).toEqual(["TarifaVigenteRepository"]);
  });

  it("cada new CierreDiaRepository/CierreDiaService/CorteDiarioService de app/ y lib/ lleva la tarifa", () => {
    const hallazgos: string[] = [];
    const encontradas: Record<string, string[]> = {};
    let revisados = 0;
    for (const carpeta of CARPETAS) {
      for (const ruta of archivosDe(path.join(RAIZ, carpeta))) {
        revisados += 1;
        const relativa = path.relative(RAIZ, ruta).split(path.sep).join("/");
        for (const llamada of llamadasEn(readFileSync(ruta, "utf8"))) {
          (encontradas[llamada.clase] ??= []).push(relativa);
          const falta = faltantes(llamada);
          if (falta.length > 0) hallazgos.push(`${relativa}: new ${llamada.clase}( sin ${falta.join(", ")}`);
        }
      }
    }

    // Suelo: el barrido vio el arbol y encontro las raices conocidas (nunca verde por vacio).
    expect(revisados).toBeGreaterThan(100);
    for (const [clase, minimo] of Object.entries(MINIMO_POR_CONSTRUCTOR)) {
      expect(encontradas[clase]?.length ?? 0, `apariciones de new ${clase}(`).toBeGreaterThanOrEqual(minimo);
    }
    expect(hallazgos).toEqual([]);
  });
});
