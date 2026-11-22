import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { RAIZ_DEL_REPO, archivosDeCodigoCensados } from "../../fixtures/raices-de-codigo";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SLT-227 (R11, R26; design §8.3, §12) — EL SECRETO DE COBRO SOLO LO LEE EL ADAPTADOR, Y NINGÚN
// TEST LLAMA A REBILL REAL.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// R11. `crearLectorCredencialesCobro` es la única salida del secreto descifrado, y no pide actor
// porque lo llama el adaptador en un job sin sesión. La puerta es estructural: el lector y
// `secretosDe` (lo cifrado que el lector descifra) solo se nombran en el servicio, el repositorio,
// su interfaz y `lib/clients/cobro/**`. Un nombre en `app/`, `lib/actions/` o cualquier otra raíz
// de código censada es rojo. Además, ninguno de esos archivos lleva `"use server"`: con esa
// directiva, el lector exportado sería una Server Action que un cliente podría invocar.
//
// R26. Ningún archivo de `tests/` ni de `e2e/` contiene el host de `URL_BASE_REBILL` ni nombra la
// constante (salvo esta guardia, que la importa para derivar el host): un test que la importara
// llamaría a Rebill real sin escribir el host. El host de checkout (`pay.` del mismo dominio) sí
// puede salir: el doble lo usa en las URLs que devuelve y nadie lo llama.
//
// CONTROL DE NO VACUIDAD: el lector está en su archivo, el detector lo ve en el registro, el
// censo tiene `app/` y `lib/actions/`, y `URL_BASE_REBILL` tiene host.

const NOMBRES_DEL_LECTOR = /\b(crearLectorCredencialesCobro|secretosDe)\b/;
const PERMITIDOS = new Set([
  "lib/services/CobroCredencialService.ts",
  "lib/repositories/CobroCredencialRepository.ts",
  "lib/interfaces/repositories/ICobroCredencialRepository.ts",
]);
const esPermitido = (ruta: string) => PERMITIDOS.has(ruta) || ruta.startsWith("lib/clients/cobro/");
const ESTA_GUARDIA = "tests/unit/guards/credenciales-cobro-solo-adaptador.guardia.test.ts";
const RUTA_CONFIG = "lib/config/cobro.ts";

const leer = (ruta: string) => fs.readFileSync(path.join(RAIZ_DEL_REPO, ruta), "utf8");

/** Las líneas de `texto` que nombran el lector o `secretosDe`, con su número de línea. */
function nombresDelLector(texto: string): string[] {
  return texto.split("\n").flatMap((linea, i) => (NOMBRES_DEL_LECTOR.test(linea) ? [`${i + 1}: ${linea.trim()}`] : []));
}

/** El host de `URL_BASE_REBILL`, leído del literal de la configuración (R3), sin importarlo. */
function hostDeRebill(): string {
  const literal = /export const URL_BASE_REBILL = "([^"]+)"/.exec(leer(RUTA_CONFIG))?.[1] ?? "";
  return literal === "" ? "" : new URL(literal).host;
}

function archivosDeTexto(raiz: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(path.join(RAIZ_DEL_REPO, raiz), { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const rel = `${raiz}/${e.name}`;
    if (e.isDirectory()) archivosDeTexto(rel, acc);
    else if (/\.(ts|tsx|js|jsx|mjs|cjs|json)$/.test(e.name)) acc.push(rel);
  }
  return acc;
}

const CODIGO = archivosDeCodigoCensados();
const PRUEBAS = [...archivosDeTexto("tests"), ...archivosDeTexto("e2e")];

describe("SLT-227 — contraprueba de los detectores", () => {
  it.each([
    'import { crearLectorCredencialesCobro } from "@/lib/services/CobroCredencialService";',
    "const leer = S.crearLectorCredencialesCobro({ repo, cifrador });",
    "await repo.secretosDe(trio)",
  ])("ve el lector en: %s", (linea) => {
    expect(nombresDelLector(`const x = 1;\n${linea}\n`)).toEqual([`2: ${linea}`]);
  });

  it.each(["const secretosDelFormulario = [];", "repo.estado(trio)", "crearLectorCredencialesCobroX()"])(
    "no confunde otro nombre con el lector: %s",
    (linea) => {
      expect(nombresDelLector(linea)).toEqual([]);
    },
  );

  it("control: el lector está en su archivo y el detector lo ve en el registro", () => {
    expect(leer("lib/services/CobroCredencialService.ts")).toMatch(/export function crearLectorCredencialesCobro\(/);
    expect(nombresDelLector(leer("lib/clients/cobro/registro-proveedores.ts"))).not.toEqual([]);
    expect(CODIGO.length).toBeGreaterThan(500);
    expect(CODIGO.filter((a) => a.startsWith("lib/actions/")).length).toBeGreaterThan(50);
    expect(CODIGO.filter((a) => a.startsWith("app/")).length).toBeGreaterThan(50);
  });

  it("control: URL_BASE_REBILL tiene host y las pruebas se leyeron", () => {
    expect(hostDeRebill()).toMatch(/\.rebill\.com$/);
    expect(PRUEBAS.length).toBeGreaterThan(1000);
    expect(PRUEBAS).toContain("e2e/_rebill-falso/servidor.mjs");
  });
});

describe("SLT-227 — R11: el lector de secretos descifrados no sale del adaptador", () => {
  it("R11: el lector de secretos descifrados solo aparece en el servicio, el repositorio y lib/clients/cobro", () => {
    const fallos = CODIGO.filter((a) => !esPermitido(a)).flatMap((a) =>
      nombresDelLector(leer(a)).map((h) => `${a}:${h}`),
    );
    expect(
      fallos,
      "El secreto descifrado solo lo lee el adaptador (R11, design §8.3). Ninguna página, Server Action ni route " +
        "handler nombra crearLectorCredencialesCobro ni secretosDe: piden el adaptador al registro de lib/clients/cobro.",
    ).toEqual([]);
  });

  it("R11: ningún archivo que nombra el lector es una Server Action ('use server')", () => {
    const conLector = CODIGO.filter((a) => esPermitido(a) && nombresDelLector(leer(a)).length > 0);
    expect(conLector).toContain("lib/services/CobroCredencialService.ts");
    const conDirectiva = conLector.filter((a) => /^\s*["']use server["']/m.test(leer(a)));
    expect(conDirectiva, "Con 'use server', el lector sería invocable desde el cliente (R11).").toEqual([]);
  });
});

describe("SLT-227 — R26: ninguna prueba llama a Rebill real", () => {
  it("R26: ningún archivo de tests/ ni e2e/ nombra los hosts reales de Rebill", () => {
    const host = hostDeRebill().toLowerCase();
    const fallos = PRUEBAS.filter((a) => leer(a).toLowerCase().includes(host));
    expect(fallos, `Las pruebas corren contra el doble de e2e/_rebill-falso (R26); ${host} no sale.`).toEqual([]);
  });

  it("R26: ninguna prueba importa URL_BASE_REBILL, y el adaptador se prueba contra el doble", () => {
    const fallos = PRUEBAS.filter((a) => a !== ESTA_GUARDIA && /\bURL_BASE_REBILL\b/.test(leer(a)));
    expect(fallos, "Con URL_BASE_REBILL, una prueba llamaría a Rebill real sin escribir el host (R26).").toEqual([]);
    expect(leer("tests/integration/cobro/rebill-proveedor.test.ts")).toMatch(
      /import \{[^}]*\barrancarRebillFalso\b[^}]*\} from "@\/e2e\/_rebill-falso\/servidor\.mjs"/,
    );
  });
});
