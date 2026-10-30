import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { quitarComentarios } from "../../fixtures/sin-comentarios";
import { ROLES_PLATAFORMA } from "@/lib/auth/plataforma";
import { ROLES_ACCESO_TOTAL, ROLES_DECIDEN_COBRO_GASTO_FIJO } from "@/lib/auth/acceso-total";
import {
  ROLES_HISTORIAL_ACCIONES,
  ROLES_HISTORICO_CONVERSACIONES,
  ROLES_MI_BODEGA,
  ROLES_MI_WALLET,
  SIDEBAR_ITEMS,
  type MenuItem,
} from "@/lib/auth/menu-visibility";
import { ROLES_AYUDA } from "@/lib/ayuda/documento";
import { ROLES_ANALITICA } from "@/lib/analytics/types";
import { ROLES_ANALITICA_INTEGRACION } from "@/lib/analytics/alcance";

// SL-32 (R3, R4, R5, R36) — GUARDIA «el superadmin fuera de empresa».
//
// El superadmin no pertenece a ninguna empresa. La protección de fondo es que todas las listas
// blancas de roles lo dejan fuera por defecto; esta guardia vigila que nadie lo meta en una por
// descuido, y que quien lo nombre lo haga leyendo la fuente única (`ROLES_PLATAFORMA`), no con
// un literal propio que divergiría en el primer cambio.
//
// Tres partes:
//   (a) las listas de roles de EMPRESA (constantes exportadas y el menú) no contienen un rol de
//       plataforma, salvo las excepciones declaradas abajo;
//   (b) en el fuente de `lib/` y `app/`, toda constante `*ROLES*` que nombre la plataforma es una
//       excepción declarada y la lee por import;
//   (c) el literal `superadmin` solo aparece en `plataforma.ts` y en las tablas exhaustivas que
//       el tipo `Record<RolValue, …>` obliga a completar.

const RAIZ = path.resolve(__dirname, "../../..");
const PLATAFORMA = new Set<string>(ROLES_PLATAFORMA);

/* -------------------------------------------------------------------------- */
/* Excepciones declaradas                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Las ÚNICAS constantes `*ROLES*` de `lib/` y `app/` que pueden nombrar la plataforma, y por qué.
 * `soloPlataforma`: la lista no puede llevar ningún otro rol (gestión de geografía, R24).
 */
const EXCEPCIONES_DE_LISTA: readonly {
  archivo: string;
  constante: string;
  soloPlataforma: boolean;
  motivo: string;
}[] = [
  { archivo: "lib/auth/plataforma.ts", constante: "ROLES_PLATAFORMA", soloPlataforma: true, motivo: "la fuente única (R4)" },
  {
    archivo: "lib/analytics/alcance.ts",
    constante: "ROLES_SIN_ANALITICA",
    soloPlataforma: true,
    motivo: "lista de DENEGACIÓN de la analítica (R7)",
  },
  // T11 (R24, R25): `GESTION_ROLES` es solo plataforma (devolverle el `maestro` pone esto en rojo) y
  // `READ_ROLES` la suma al `maestro` por import, para la lectura de Tarifas.
  {
    archivo: "lib/services/GeografiaService.ts",
    constante: "GESTION_ROLES",
    soloPlataforma: true,
    motivo: "la gestión de la geografía es de la plataforma (R24)",
  },
  {
    archivo: "lib/services/GeografiaService.ts",
    constante: "READ_ROLES",
    soloPlataforma: false,
    motivo: "`listarArbol`: la plataforma y la lectura operativa de Tarifas del maestro (R25)",
  },
  // SL-20 (design §4; R23, R37): los países son de la plataforma; ningún rol de empresa los gestiona.
  {
    archivo: "lib/services/PaisService.ts",
    constante: "GESTION_ROLES",
    soloPlataforma: true,
    motivo: "el alta y el listado de países son de la plataforma (SL-20, R37)",
  },
  // SL-20 (design §4; R24, R37): la carga de la división por CSV es gestión de geografía.
  {
    archivo: "lib/services/CargaDivisionService.ts",
    constante: "GESTION_ROLES",
    soloPlataforma: true,
    motivo: "la carga de la división de un país es de la plataforma (SL-20, R37)",
  },
];

/** El ítem «Empresas» del menú (R36), que llega con T16. */
const HREF_ITEM_PLATAFORMA = "/plataforma/empresas";

/**
 * Los ÚNICOS ítems de plataforma del menú: «Empresas» (SL-32, R36) y «Geografía» (SL-20, R21).
 * Los dos leen `ROLES_PLATAFORMA` por identidad y no llevan subítems.
 */
// SLT-58 R23: «Planes» entra como tercer ítem de plataforma, con la misma regla (identidad, sin subítems).
const HREFS_ITEMS_PLATAFORMA = new Set<string>([HREF_ITEM_PLATAFORMA, "/plataforma/geografia", "/plataforma/planes"]);

/**
 * Los archivos de `lib/` y `app/` donde el literal `superadmin` es legítimo: la fuente única y las
 * tablas `Record<RolValue, …>` que la compilación obliga a completar (`design.md > Fuente única`).
 */
const ARCHIVOS_CON_LITERAL = new Set([
  "lib/auth/plataforma.ts",
  "lib/auth/rol-label.ts", // ROL_LABELS
  "lib/asistente/instrucciones.ts", // QUIEN_PREGUNTA
]);

/* -------------------------------------------------------------------------- */
/* (a) Listas de empresa y menú                                                */
/* -------------------------------------------------------------------------- */

const LISTAS_DE_EMPRESA: Record<string, readonly string[]> = {
  ROLES_ACCESO_TOTAL,
  ROLES_DECIDEN_COBRO_GASTO_FIJO,
  ROLES_AYUDA,
  ROLES_ANALITICA,
  ROLES_ANALITICA_INTEGRACION,
  ROLES_HISTORICO_CONVERSACIONES,
  ROLES_HISTORIAL_ACCIONES,
  ROLES_MI_WALLET,
  ROLES_MI_BODEGA,
};

function listasConPlataforma(listas: Record<string, readonly string[]>): string[] {
  return Object.entries(listas)
    .filter(([, roles]) => roles.some((r) => PLATAFORMA.has(r)))
    .map(([nombre]) => nombre);
}

/** Lo que el menú incumple: ítems o subítems de empresa con la plataforma, o un «Empresas» mal hecho. */
function faltasDelMenu(items: readonly MenuItem[], fuente: readonly string[] = ROLES_PLATAFORMA): string[] {
  const faltas: string[] = [];
  for (const item of items) {
    if (HREFS_ITEMS_PLATAFORMA.has(item.href)) {
      // Por identidad: un literal `["superadmin"]` o el ítem compartido con un rol de empresa no
      // son la fuente única.
      if (item.roles !== fuente) faltas.push(`${item.label}: sus roles no son ROLES_PLATAFORMA por import`);
      if (item.children?.length) faltas.push(`${item.label}: el ítem de plataforma no lleva subítems`);
      continue;
    }
    if (item.roles.some((r) => PLATAFORMA.has(r))) faltas.push(`${item.label}: ítem de empresa con plataforma`);
    for (const hijo of item.children ?? []) {
      if (hijo.roles?.some((r) => PLATAFORMA.has(r))) {
        faltas.push(`${item.label} › ${hijo.label}: subítem de empresa con plataforma`);
      }
    }
  }
  return faltas;
}

describe("(a) R3, R5 — las listas de roles de empresa no contienen la plataforma", () => {
  it("ninguna constante de empresa contiene un rol de plataforma", () => {
    expect(Object.keys(LISTAS_DE_EMPRESA)).toHaveLength(9);
    expect(listasConPlataforma(LISTAS_DE_EMPRESA)).toEqual([]);
  });

  it("el menú: ningún ítem ni subítem de empresa lo lleva, y «Empresas» lee ROLES_PLATAFORMA", () => {
    expect(SIDEBAR_ITEMS.length).toBeGreaterThan(5);
    expect(faltasDelMenu(SIDEBAR_ITEMS)).toEqual([]);
  });

  it("contraprueba: superadmin en ROLES_ACCESO_TOTAL sale rojo", () => {
    const contaminadas = { ...LISTAS_DE_EMPRESA, ROLES_ACCESO_TOTAL: [...ROLES_ACCESO_TOTAL, "superadmin"] };
    expect(listasConPlataforma(contaminadas)).toEqual(["ROLES_ACCESO_TOTAL"]);
  });

  it("contraprueba: el menú detecta un subítem de empresa con plataforma y un «Empresas» con literal o con maestro", () => {
    const base = SIDEBAR_ITEMS[0];
    const conHijo: MenuItem = {
      ...base,
      label: "Config",
      children: [{ label: "Usuarios", href: "/x", roles: ["maestro", "superadmin"] }],
    };
    const empresasLiteral: MenuItem = { ...base, label: "Empresas", href: HREF_ITEM_PLATAFORMA, roles: ["superadmin"] };
    const empresasConMaestro: MenuItem = {
      ...base,
      label: "Empresas",
      href: HREF_ITEM_PLATAFORMA,
      roles: [...ROLES_PLATAFORMA, "maestro"],
    };
    const empresasBien: MenuItem = { ...base, label: "Empresas", href: HREF_ITEM_PLATAFORMA, roles: ROLES_PLATAFORMA, children: undefined };
    const itemDeEmpresa: MenuItem = { ...base, label: "Órdenes", roles: ["maestro", "superadmin"] };

    expect(faltasDelMenu([conHijo])).toHaveLength(1);
    expect(faltasDelMenu([empresasLiteral])).toHaveLength(1);
    expect(faltasDelMenu([empresasConMaestro])).toHaveLength(1);
    expect(faltasDelMenu([itemDeEmpresa])).toHaveLength(1);
    expect(faltasDelMenu([empresasBien])).toEqual([]);
  });

  it("contraprueba SL-20 (R21): «Geografía» con literal o con maestro sale rojo, y bien hecho no", () => {
    const base = SIDEBAR_ITEMS[0];
    const href = "/plataforma/geografia";
    const literal: MenuItem = { ...base, label: "Geografía", href, roles: ["superadmin"], children: undefined };
    const conMaestro: MenuItem = { ...base, label: "Geografía", href, roles: [...ROLES_PLATAFORMA, "maestro"], children: undefined };
    const bien: MenuItem = { ...base, label: "Geografía", href, roles: ROLES_PLATAFORMA, children: undefined };
    expect(faltasDelMenu([literal])).toHaveLength(1);
    expect(faltasDelMenu([conMaestro])).toHaveLength(1);
    expect(faltasDelMenu([bien])).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* (b) y (c) El fuente de lib/ y app/                                          */
/* -------------------------------------------------------------------------- */

const DIRS_IGNORADOS = new Set(["node_modules", ".next", "dist", "coverage"]);

function archivosDe(dir: string): string[] {
  const absoluto = path.join(RAIZ, dir);
  if (!fs.existsSync(absoluto)) return [];
  const fuera: string[] = [];
  for (const e of fs.readdirSync(absoluto, { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (!DIRS_IGNORADOS.has(e.name)) fuera.push(...archivosDe(rel));
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      fuera.push(rel);
    }
  }
  return fuera;
}

interface Fuente {
  archivo: string;
  codigo: string;
}

function fuentesDelArbol(): Fuente[] {
  return ["lib", "app"].flatMap(archivosDe).map((archivo) => ({
    archivo,
    codigo: quitarComentarios(fs.readFileSync(path.join(RAIZ, archivo), "utf8")),
  }));
}

// La clave de objeto se reconoce por su posición (inicio de línea, `{` o `,`), para no confundirla
// con prosa dentro de una cadena («… por el superadmin: …»). Sin `g`: `test` no guarda estado.
const RE_LITERAL = /(["'`])superadmin\1|\bRolValue\.superadmin\b|(?:^|[{,])\s*superadmin\s*:/m;
const RE_IMPORT_PLATAFORMA = /import\s*\{[^}]*\bROLES_PLATAFORMA\b[^}]*\}\s*from\s*["']@\/lib\/auth\/plataforma["']/;

/** Las declaraciones `const *ROLES* = …;` de un fuente, con su inicializador. */
function listasDeRoles(codigo: string): { constante: string; init: string }[] {
  const fuera: { constante: string; init: string }[] = [];
  const re = /\bconst\s+([A-Z][A-Z0-9_]*ROLES[A-Z0-9_]*)\b[^=;]*=\s*([\s\S]*?);/g;
  for (const m of codigo.matchAll(re)) fuera.push({ constante: m[1], init: m[2] });
  return fuera;
}

/** (b) Las constantes de roles que nombran la plataforma sin ser excepción, o sin leerla por import. */
function faltasDeListas(fuentes: readonly Fuente[]): string[] {
  const faltas: string[] = [];
  for (const { archivo, codigo } of fuentes) {
    for (const { constante, init } of listasDeRoles(codigo)) {
      const nombraPlataforma = /\bROLES_PLATAFORMA\b|\besPlataforma\b/.test(init) || RE_LITERAL.test(init);
      if (!nombraPlataforma) continue;
      const exc = EXCEPCIONES_DE_LISTA.find((e) => e.archivo === archivo && e.constante === constante);
      if (!exc) {
        faltas.push(`${archivo}: ${constante} nombra la plataforma y no es una excepción declarada`);
        continue;
      }
      if (archivo === "lib/auth/plataforma.ts") continue; // la fuente se declara a sí misma
      if (RE_LITERAL.test(init)) faltas.push(`${archivo}: ${constante} escribe el literal`);
      if (!RE_IMPORT_PLATAFORMA.test(codigo)) faltas.push(`${archivo}: ${constante} no importa ROLES_PLATAFORMA`);
      if (exc.soloPlataforma && /["'`][A-Za-z ]+["'`]/.test(init)) {
        faltas.push(`${archivo}: ${constante} es solo de plataforma y lleva otro rol`);
      }
    }
  }
  return faltas;
}

/** (c) Archivos fuera de la lista declarada que escriben el literal. */
function faltasDeLiteral(fuentes: readonly Fuente[]): string[] {
  return fuentes
    .filter(({ archivo, codigo }) => !ARCHIVOS_CON_LITERAL.has(archivo) && RE_LITERAL.test(codigo))
    .map(({ archivo }) => archivo);
}

describe("(b) R4 — las constantes de roles nombran la plataforma solo por excepción y por import", () => {
  const fuentes = fuentesDelArbol();

  it("el censo mira donde debe: cientos de archivos y las listas de los servicios", () => {
    expect(fuentes.length).toBeGreaterThan(300);
    const servicios = fuentes.filter((f) => f.archivo.startsWith("lib/services/"));
    const listas = servicios.flatMap((f) => listasDeRoles(f.codigo).map((l) => `${f.archivo}:${l.constante}`));
    expect(listas).toContain("lib/services/UsuarioService.ts:ALLOWED_ROLES");
    expect(listas).toContain("lib/services/TarifaService.ts:READ_ROLES");
  });

  it("en el árbol real no hay ninguna falta", () => {
    expect(faltasDeListas(fuentes)).toEqual([]);
  });

  it("las excepciones declaradas apuntan a archivos que existen", () => {
    for (const e of EXCEPCIONES_DE_LISTA) expect(fs.existsSync(path.join(RAIZ, e.archivo)), e.archivo).toBe(true);
  });

  it("contraprueba: superadmin en el ALLOWED_ROLES de un servicio, literal o por import", () => {
    const literal = { archivo: "lib/services/X.ts", codigo: `const ALLOWED_ROLES = new Set<string>(["maestro", "superadmin"]);` };
    const porImport = {
      archivo: "lib/services/X.ts",
      codigo: `import { ROLES_PLATAFORMA } from "@/lib/auth/plataforma";\nconst WRITE_ROLES = new Set<string>(["maestro", ...ROLES_PLATAFORMA]);`,
    };
    expect(faltasDeListas([literal])).toHaveLength(1);
    expect(faltasDeListas([porImport])).toHaveLength(1);
  });

  it("contraprueba: GESTION_ROLES de geografía con el maestro, o con el literal, sale rojo; bien hecho, verde", () => {
    const archivo = "lib/services/GeografiaService.ts";
    const imp = `import { ROLES_PLATAFORMA } from "@/lib/auth/plataforma";\n`;
    const conMaestro = { archivo, codigo: `${imp}const GESTION_ROLES = new Set<string>(["maestro", ...ROLES_PLATAFORMA]);` };
    const conLiteral = { archivo, codigo: `${imp}const GESTION_ROLES = new Set<string>(["superadmin"]);` };
    const sinImport = { archivo, codigo: `const GESTION_ROLES = new Set<string>(ROLES_PLATAFORMA);` };
    const bien = {
      archivo,
      codigo: `${imp}const READ_ROLES = new Set<string>(["maestro", ...ROLES_PLATAFORMA]);\nconst GESTION_ROLES = new Set<string>(ROLES_PLATAFORMA);`,
    };
    expect(faltasDeListas([conMaestro])).toEqual([`${archivo}: GESTION_ROLES es solo de plataforma y lleva otro rol`]);
    expect(faltasDeListas([conLiteral]).length).toBeGreaterThan(0);
    expect(faltasDeListas([sinImport])).toEqual([`${archivo}: GESTION_ROLES no importa ROLES_PLATAFORMA`]);
    expect(faltasDeListas([bien])).toEqual([]);
  });
});

describe("(c) R4 — el literal `superadmin` solo vive en la fuente y en las tablas exhaustivas", () => {
  const fuentes = fuentesDelArbol();

  it("en el árbol real, solo en los archivos declarados", () => {
    expect(faltasDeLiteral(fuentes)).toEqual([]);
  });

  it("los archivos declarados existen y de verdad lo escriben (la lista no se queda vieja)", () => {
    for (const archivo of ARCHIVOS_CON_LITERAL) {
      const f = fuentes.find((x) => x.archivo === archivo);
      expect(f, archivo).toBeDefined();
      expect(RE_LITERAL.test(f!.codigo), archivo).toBe(true);
    }
  });

  it("contraprueba: el literal en el roles de un ítem, como RolValue.superadmin o como clave, sale rojo", () => {
    const menu = { archivo: "lib/auth/menu-visibility.ts", codigo: `const X = { label: "E", roles: ["superadmin"] };` };
    const enum_ = { archivo: "lib/auth/acceso-total.ts", codigo: `export const ROLES_ACCESO_TOTAL = [RolValue.maestro, RolValue.superadmin];` };
    const clave = { archivo: "lib/x.ts", codigo: `const T = { maestro: 1, superadmin: 2 };` };
    expect(faltasDeLiteral([menu, enum_, clave])).toEqual([menu.archivo, enum_.archivo, clave.archivo]);
  });

  it("contraprueba: la prosa y los identificadores no cuentan", () => {
    const prosa = {
      archivo: "lib/x.ts",
      codigo: `const m = "alta de empresa por el superadmin: crea"; exigirSuperadmin(a); arranqueSuperadmin();`,
    };
    expect(faltasDeLiteral([prosa])).toEqual([]);
  });
});
