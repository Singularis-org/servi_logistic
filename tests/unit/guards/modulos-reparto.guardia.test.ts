import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  CALCULO_CONTINUO,
  CONSUMOS_ENTRE_MODULOS,
  MODULO_POR_ACTION,
  MODULO_POR_CRON,
  MODULO_POR_RUTA,
  modulosDe,
} from "@/lib/modulos/reparto";

import {
  actionsImportadas,
  archivoDeAction,
  archivoDeCron,
  archivoDeRuta,
  archivosDeApp,
  destinoDeArchivoDeApp,
  diferenciasDeReparto,
  funcionesSinPuerta,
  GrafoDeConsumos,
  leer,
  llamaAItemsVisibles,
  modulosPasadosAParaCadaEmpresa,
  type PiezaAnunciada,
  piezasCompartidas,
  piezasDelDisco,
  problemaDeCron,
  puertaDePagina,
  RAIZ,
} from "./_modulos-reparto";

/**
 * SL-23 · T4 (design §8; R3, R15, R16, R17, R21, R30, R33) — GUARDIA DEL REPARTO DE MÓDULOS.
 *
 * Un módulo apagado solo está apagado si TODAS sus piezas tienen puerta. Una puerta olvidada no falla:
 * deja pasar en silencio. Esta guardia es la red (design §13):
 *
 *  (a) cada página de `app/(app)/`, archivo de `lib/actions/`, cron y endpoint de `app/api/` tiene
 *      entrada en `lib/modulos/reparto.ts`, y cada entrada tiene archivo (R3); solo las piezas de §3.7
 *      tienen dos módulos;
 *  (b) cada página de un módulo abre con `await exigirModuloEnRuta(<sus claves>)` (R16);
 *  (c) cada función exportada de una action de un módulo abre con `await exigirModuloActivo(<sus
 *      claves>)`, directa o como primera sentencia de su `withErrorHandler` (R17, R33);
 *  (d) un cron de un módulo pasa `modulo: "<su clave>"` a `paraCadaEmpresa` (R21), y uno de cálculo
 *      continuo NO lo pasa (R30);
 *  (e) un archivo de `app/` solo alcanza actions de su módulo o del núcleo, directo o a través de
 *      `components/**` y `hooks/**` (un componente compartido toma el módulo de la ruta que lo monta,
 *      §3.9), salvo lo declarado en `CONSUMOS_ENTRE_MODULOS` (§6.3); el fallo nombra la cadena;
 *  (f) nadie en `app/` llama a `itemsVisibles(`: el menú pasa por `menuDeLaEmpresa` (R15).
 *
 * ESTADO EN LA TANDA 2 (tasks.md > T4). (b), (c), la mitad «de un módulo» de (d) y (f) describen
 * puertas que todavía no existen: las ponen T8–T11. Van con `it.fails`, que está VERDE mientras el
 * árbol incumple y se pone ROJO en cuanto lo cumple. Ese rojo es el aviso para quitar el `.fails`: no
 * se puede olvidar. Lo que ya se cumple hoy va con `it` normal. Las autocomprobaciones de cada caso
 * (una fuente buena que pasa y su mutación que falla) son `it` normales desde ya.
 */

/**
 * Entradas de `reparto.ts` cuyo archivo crea una task posterior de esta misma ficha. El caso (a) no
 * les exige archivo todavía; el cable de abajo falla en cuanto el archivo aparece, para que la
 * excepción se borre en la misma task que lo crea.
 */
const ANUNCIADAS: readonly PiezaAnunciada[] = [
  { tabla: "ruta", clave: "/plataforma/empresas/[organizacionId]", task: "T7" },
];

const disco = piezasDelDisco();

const PAGINAS_DE_MODULO = Object.entries(MODULO_POR_RUTA).filter(([, d]) => d !== "nucleo");
const ACTIONS_DE_MODULO = Object.entries(MODULO_POR_ACTION).filter(([, d]) => d !== "nucleo");
const CRONS_DE_MODULO = Object.entries(MODULO_POR_CRON).filter(([, d]) => d !== "nucleo");
const CRONS_CONTINUOS = new Set<string>(CALCULO_CONTINUO.crons);

function paginasSinPuerta(): string[] {
  return PAGINAS_DE_MODULO.flatMap(([ruta, destino]) => {
    const archivo = archivoDeRuta(ruta);
    if (!existsSync(path.join(RAIZ, archivo))) return [];
    const claves = puertaDePagina(leer(archivo));
    const esperado = modulosDe(destino);
    if (!claves) return [`${ruta}: sin exigirModuloEnRuta(${esperado.join(", ")}) como primera sentencia`];
    return JSON.stringify(claves) === JSON.stringify(esperado)
      ? []
      : [`${ruta}: exige (${claves.join(", ")}) y le toca (${esperado.join(", ")})`];
  });
}

function actionsSinPuerta(): string[] {
  return ACTIONS_DE_MODULO.flatMap(([nombre, destino]) => {
    const archivo = archivoDeAction(nombre);
    if (!existsSync(path.join(RAIZ, archivo))) return [];
    return funcionesSinPuerta(leer(archivo), modulosDe(destino), archivo).map((f) => `${archivo} › ${f}`);
  });
}

function problemasDeCrons(continuos: boolean): string[] {
  return CRONS_DE_MODULO.filter(([nombre]) => CRONS_CONTINUOS.has(nombre) === continuos).flatMap(([nombre, destino]) => {
    const [clave] = modulosDe(destino);
    const problema = problemaDeCron(modulosPasadosAParaCadaEmpresa(leer(archivoDeCron(nombre))), clave, continuos);
    return problema ? [`${nombre}: ${problema}`] : [];
  });
}

function consumosCruzados(): string[] {
  const grafo = new GrafoDeConsumos();
  return archivosDeApp().flatMap((rel) => grafo.cruces(rel));
}

function llamadasAItemsVisibles(): string[] {
  return archivosDeApp().filter((rel) => llamaAItemsVisibles(leer(rel)));
}

describe("SL-23 · guardia del reparto de módulos (design §8)", () => {
  describe("(a) cada pieza está en el reparto, y cada entrada tiene su pieza (R3)", () => {
    it("no-vacuidad: el barrido ve las páginas, actions, crons y endpoints del árbol", () => {
      expect(disco.ruta.length).toBeGreaterThanOrEqual(43);
      expect(disco.action.length).toBeGreaterThanOrEqual(108);
      expect(disco.cron.length).toBeGreaterThanOrEqual(12);
      expect(disco.api.length).toBeGreaterThanOrEqual(14);
      expect(disco.ruta).toContain("/wallet/tiendas/[tiendaId]");
      expect(disco.action).toContain("premio-ranking-devengo");
      expect(disco.cron).toContain("snapshot-ranking");
      expect(disco.api).toContain("ordenes/api-key/analitica");
    });

    it("ninguna pieza del disco sin entrada en reparto.ts", () => {
      expect(diferenciasDeReparto(disco, undefined, ANUNCIADAS).sinEntrada).toEqual([]);
    });

    it("ninguna entrada de reparto.ts sin su archivo", () => {
      expect(diferenciasDeReparto(disco, undefined, ANUNCIADAS).sinArchivo).toEqual([]);
    });

    it.each(ANUNCIADAS)("cable: $tabla $clave aún no existe (al crearlo en $task, se borra de ANUNCIADAS)", (a) => {
      expect(disco[a.tabla]).not.toContain(a.clave);
    });

    it("R33: solo las piezas de §3.7 tienen dos módulos, y son los suyos", () => {
      expect(piezasCompartidas()).toEqual({
        "action premio-ranking-devengo": ["wallet", "ranking"],
        "api ordenes/api-key/analitica": ["api_integraciones", "analitica"],
      });
    });

    it("§3.1/§3.2: el reparto tiene 24 páginas y 48 archivos de actions de un módulo", () => {
      expect(PAGINAS_DE_MODULO).toHaveLength(24);
      expect(ACTIONS_DE_MODULO).toHaveLength(48);
    });
  });

  describe("(b) cada página de un módulo abre con su puerta (R16)", () => {
    // T9 la pone en verde: entonces se quita el `.fails`.
    it.fails("toda página de un módulo abre con exigirModuloEnRuta(<sus claves>)", () => {
      expect(paginasSinPuerta()).toEqual([]);
    });
  });

  describe("(c) cada action exportada de un módulo abre con su puerta (R17, R33)", () => {
    // T10 la pone en verde: entonces se quita el `.fails`.
    it.fails("toda función exportada de una action de un módulo abre con exigirModuloActivo(<sus claves>)", () => {
      expect(actionsSinPuerta()).toEqual([]);
    });
  });

  describe("(d) los crons de un módulo se saltan empresas; los de cálculo continuo no (R21, R30)", () => {
    // T11 la pone en verde: entonces se quita el `.fails`.
    it.fails("un cron de un módulo (no continuo) pasa modulo: <su clave> a paraCadaEmpresa", () => {
      expect(problemasDeCrons(false)).toEqual([]);
    });

    it("un cron de cálculo continuo no pasa modulo a paraCadaEmpresa", () => {
      expect([...CRONS_CONTINUOS].every((c) => Object.hasOwn(MODULO_POR_CRON, c))).toBe(true);
      expect(problemasDeCrons(true)).toEqual([]);
    });
  });

  describe("(e) consumos entre módulos declarados (§6.3)", () => {
    it("cada consumo declarado apunta a un archivo (de app/ o de components/) y a rutas que existen", () => {
      for (const c of CONSUMOS_ENTRE_MODULOS) {
        expect(existsSync(path.join(RAIZ, c.pieza)), c.pieza).toBe(true);
        for (const ruta of c.anfitrionas) expect(disco.ruta, `${c.pieza} › ${ruta}`).toContain(ruta);
      }
    });

    it("no-vacuidad: el barrido transitivo llega a actions a través de components/", () => {
      // `RepartoModule` → `GestionarOrdenPanel` → `components/shared/EnviarPlantillaWhatsappButton` →
      // `whatsapp-envio`: sin la entrada de §6.3 sería un cruce. Si el grafo no lo viera, (e) estaría ciego.
      const sinDeclarar = new GrafoDeConsumos(RAIZ, []);
      const cruces = archivosDeApp()
        .filter((r) => r.startsWith("app/(app)/mis-asignaciones/"))
        .flatMap((r) => sinDeclarar.cruces(r));
      expect(
        cruces.some((c) => c.includes("components/shared/EnviarPlantillaWhatsappButton.tsx → lib/actions/whatsapp-envio")),
      ).toBe(true);
    });

    it("ningún archivo de app/ alcanza (directo o por components/ y hooks/) una action de otro módulo sin declararlo", () => {
      expect(consumosCruzados()).toEqual([]);
    });
  });

  describe("(f) el menú de app/ pasa por menuDeLaEmpresa (R15)", () => {
    // T8 la pone en verde: entonces se quita el `.fails`.
    it.fails("ningún archivo de app/ llama a itemsVisibles(", () => {
      expect(llamadasAItemsVisibles()).toEqual([]);
    });
  });

  it("los barridos marcados con `.fails` corren sin lanzar: su verde es «el árbol incumple», no un error", () => {
    // Sin esto, un `it.fails` también estaría verde si el detector reventara al leer el árbol.
    expect(() => paginasSinPuerta()).not.toThrow();
    expect(() => actionsSinPuerta()).not.toThrow();
    expect(() => problemasDeCrons(false)).not.toThrow();
    expect(() => consumosCruzados()).not.toThrow();
    expect(() => llamadasAItemsVisibles()).not.toThrow();
  });

  describe("autocomprobación: cada caso con una fuente buena y su mutación", () => {
    describe("(a) sobre un árbol inventado", () => {
      const raiz = mkdtempSync(path.join(tmpdir(), "sl23-reparto-"));
      afterAll(() => rmSync(raiz, { recursive: true, force: true }));
      const escribir = (rel: string, texto = "export {};\n") => {
        mkdirSync(path.dirname(path.join(raiz, rel)), { recursive: true });
        writeFileSync(path.join(raiz, rel), texto);
      };
      escribir("app/(app)/wallet/page.tsx");
      escribir("app/(app)/wallet/(grupo)/tiendas/[tiendaId]/page.tsx");
      escribir("app/(app)/wallet/_components/Tabla.tsx");
      escribir("lib/actions/wallet.ts");
      escribir("lib/actions/wallet.test.ts");
      escribir("lib/actions/_shared/ayuda.ts");
      escribir("app/api/cron/generar-gastos-fijos/route.ts");
      escribir("app/api/ordenes/api-key/route.ts");
      escribir("app/api/ordenes/api-key/orden/[id]/route.ts");
      const tablas = {
        ruta: { "/wallet": "wallet", "/wallet/tiendas/[tiendaId]": "wallet" },
        action: { wallet: "wallet" },
        cron: { "generar-gastos-fijos": "wallet" },
        api: { "ordenes/api-key": "api_integraciones", "ordenes/api-key/orden/[id]": "api_integraciones" },
      } as const;

      it("lee el disco con la forma de clave del reparto (sin grupos, sin tests ni _shared)", () => {
        expect(piezasDelDisco(raiz)).toEqual({
          ruta: ["/wallet", "/wallet/tiendas/[tiendaId]"],
          action: ["wallet"],
          cron: ["generar-gastos-fijos"],
          api: ["ordenes/api-key", "ordenes/api-key/orden/[id]"],
        });
        expect(diferenciasDeReparto(piezasDelDisco(raiz), tablas)).toEqual({ sinEntrada: [], sinArchivo: [] });
      });

      it("mutación: una página nueva sin entrada, y una entrada sin archivo, salen nombradas", () => {
        const conPaginaNueva = { ...piezasDelDisco(raiz), ruta: [...piezasDelDisco(raiz).ruta, "/premios"] };
        const conEntradaHuerfana = { ...tablas, action: { ...tablas.action, borrada: "wallet" } } as const;
        expect(diferenciasDeReparto(conPaginaNueva, tablas).sinEntrada).toEqual(["ruta /premios"]);
        expect(diferenciasDeReparto(piezasDelDisco(raiz), conEntradaHuerfana).sinArchivo).toEqual(["action borrada"]);
        // Una anunciada no cuenta como huérfana; otra que no lo está, sí.
        expect(
          diferenciasDeReparto(piezasDelDisco(raiz), conEntradaHuerfana, [{ tabla: "action", clave: "borrada", task: "Tx" }])
            .sinArchivo,
        ).toEqual([]);
      });

      it("mutación: una tercera pieza con dos módulos sale en piezasCompartidas", () => {
        const conTupla = { ...tablas, cron: { "generar-gastos-fijos": ["wallet", "ranking"] } } as const;
        expect(piezasCompartidas(conTupla)).toEqual({ "cron generar-gastos-fijos": ["wallet", "ranking"] });
      });
    });

    describe("(b) puerta de página", () => {
      const buena = `
        import { exigirModuloEnRuta } from "@/lib/modulos/exigir-modulo";
        export default async function WalletPage() {
          await exigirModuloEnRuta("wallet");
          const actor = await resolveActorFromSession();
          return null;
        }`;
      it("la encuentra en `export default function` y en `export default X`", () => {
        expect(puertaDePagina(buena)).toEqual(["wallet"]);
        expect(
          puertaDePagina(`async function P() { await exigirModuloEnRuta("wallet", "ranking"); }\nexport default P;`),
        ).toEqual(["wallet", "ranking"]);
        expect(puertaDePagina(`const P = async () => { await exigirModuloEnRuta("ranking"); };\nexport default P;`)).toEqual([
          "ranking",
        ]);
      });
      it("mutación: sin puerta, o no como primera sentencia → null", () => {
        expect(puertaDePagina(buena.replace(`await exigirModuloEnRuta("wallet");`, ""))).toBeNull();
        expect(
          puertaDePagina(`export default async function P() { const a = await leer(); await exigirModuloEnRuta("wallet"); }`),
        ).toBeNull();
        // Sin `await` la puerta no frena nada: notFound() saldría tarde o nunca.
        expect(puertaDePagina(`export default async function P() { exigirModuloEnRuta("wallet"); }`)).toBeNull();
        // Citada en un comentario no cuenta.
        expect(puertaDePagina(`export default async function P() { // await exigirModuloEnRuta("wallet");\n return 1; }`)).toBeNull();
      });
      it("mutación: otras claves se leen tal cual (el barrido las compara con las suyas)", () => {
        expect(puertaDePagina(buena.replace(`("wallet")`, `("ranking")`))).toEqual(["ranking"]);
      });
    });

    describe("(c) puerta de action", () => {
      const buena = `
        "use server";
        export type R = { ok: true };
        export interface Deps { x?: number }
        export async function listar(input: unknown, deps: Deps = {}) {
          const r = await withErrorHandler(async () => {
            await exigirModuloActivo("wallet", "ranking");
            const actor = await resolveActorFromSession();
            return actor;
          });
          return r;
        }
        export async function anular(input: unknown) {
          await exigirModuloActivo("wallet", "ranking");
          return input;
        }`;
      it("la acepta directa o como primera sentencia de su withErrorHandler; ignora tipos", () => {
        expect(funcionesSinPuerta(buena, ["wallet", "ranking"])).toEqual([]);
      });
      it("mutación: una función sin puerta sale nombrada", () => {
        const sinPuerta = buena.replace(
          `await exigirModuloActivo("wallet", "ranking");\n          return input;`,
          "return input;",
        );
        expect(funcionesSinPuerta(sinPuerta, ["wallet", "ranking"])).toEqual([
          "anular: sin exigirModuloActivo(wallet, ranking) como primera sentencia",
        ]);
      });
      it("mutación: la puerta después de leer la sesión no cuenta", () => {
        const tarde = `export async function f() {
          return withErrorHandler(async () => {
            const actor = await resolveActorFromSession();
            await exigirModuloActivo("wallet");
          });
        }`;
        expect(funcionesSinPuerta(tarde, ["wallet"])).toHaveLength(1);
      });
      it("mutación: una sola clave en una pieza compartida (R33) sale nombrada", () => {
        const unaClave = buena.replaceAll(`("wallet", "ranking")`, `("wallet")`);
        expect(funcionesSinPuerta(unaClave, ["wallet", "ranking"])).toEqual([
          "listar: exige (wallet) y le toca (wallet, ranking)",
          "anular: exige (wallet) y le toca (wallet, ranking)",
        ]);
      });
      it("también ve `export const f = async () => {}`", () => {
        expect(funcionesSinPuerta(`export const f = async () => { return 1; };`, ["wallet"])).toHaveLength(1);
      });
    });

    describe("(d) crons", () => {
      const conModulo = `const e = await paraCadaEmpresa(async () => {}, { cliente: deps.empresas, modulo: "wallet" });`;
      const sinModulo = `const e = await paraCadaEmpresa(async () => {}, { cliente: deps.empresas });`;
      it("lee el modulo de cada llamada", () => {
        expect(modulosPasadosAParaCadaEmpresa(conModulo)).toEqual(["wallet"]);
        expect(modulosPasadosAParaCadaEmpresa(sinModulo)).toEqual([null]);
        expect(modulosPasadosAParaCadaEmpresa(`paraCadaEmpresa(fn, opciones);`)).toEqual(["?"]);
        expect(modulosPasadosAParaCadaEmpresa(`paraCadaEmpresa(fn);`)).toEqual([null]);
      });
      it("cron de un módulo: con su clave pasa; sin ella, con otra o sin llamada, falla", () => {
        expect(problemaDeCron(modulosPasadosAParaCadaEmpresa(conModulo), "wallet", false)).toBeNull();
        expect(problemaDeCron(modulosPasadosAParaCadaEmpresa(sinModulo), "wallet", false)).not.toBeNull();
        expect(problemaDeCron(["ranking"], "wallet", false)).not.toBeNull();
        expect(problemaDeCron([], "wallet", false)).not.toBeNull();
      });
      it("cron de cálculo continuo: sin modulo pasa; con modulo falla (R30)", () => {
        expect(problemaDeCron([null], "ranking", true)).toBeNull();
        expect(problemaDeCron(["ranking"], "ranking", true)).not.toBeNull();
      });
    });

    describe("(e) consumos cruzados", () => {
      it("ubica cada archivo de app/ en su ruta, cron o endpoint más cercano", () => {
        expect(destinoDeArchivoDeApp("app/(app)/wallet/mensajeros/_components/PremiosRankingPanel.tsx")).toBe("wallet");
        expect(destinoDeArchivoDeApp("app/(app)/configuracion/api/_components/X.tsx")).toBe("api_integraciones");
        expect(destinoDeArchivoDeApp("app/(app)/configuracion/_components/X.tsx")).toBe("nucleo");
        expect(destinoDeArchivoDeApp("app/(app)/layout.tsx")).toBe("nucleo");
        expect(destinoDeArchivoDeApp("app/api/ordenes/api-key/analitica/route.ts")).toEqual(["api_integraciones", "analitica"]);
        expect(destinoDeArchivoDeApp("app/api/cron/snapshot-ranking/route.ts")).toBe("ranking");
      });
      it("lee imports estáticos y dinámicos; no los de tipo ni los citados en comentarios", () => {
        const fuente = `
          import { a } from "@/lib/actions/ranking";
          import type { T } from "@/lib/actions/wallet";
          // import { b } from "@/lib/actions/incidentes";
          const m = await import("@/lib/actions/plantillas");
          import { c } from "@/lib/actions/_shared/algo";`;
        expect(actionsImportadas(fuente).sort()).toEqual(["plantillas", "ranking"]);
      });

      describe("sobre un árbol inventado (transitivo por components/ y hooks/)", () => {
        const raiz = mkdtempSync(path.join(tmpdir(), "sl23-consumos-"));
        afterAll(() => rmSync(raiz, { recursive: true, force: true }));
        const escribir = (rel: string, texto: string) => {
          mkdirSync(path.dirname(path.join(raiz, rel)), { recursive: true });
          writeFileSync(path.join(raiz, rel), texto);
        };
        const usa = (desde: string) => `import { x } from "${desde}";\n`;
        // Ruta del núcleo (`/ordenes`) que monta un componente compartido.
        escribir("app/(app)/ordenes/_components/Tabla.tsx", usa("@/components/shared/Boton"));
        // El componente llega a una action de wallet por un hook, y a una del núcleo directamente.
        escribir("components/shared/Boton.tsx", usa("./interno/Pieza") + usa("@/lib/actions/liquidacion"));
        escribir("components/shared/interno/Pieza.tsx", usa("@/hooks/useSaldo"));
        escribir("hooks/useSaldo.ts", usa("@/lib/actions/wallet"));
        // El mismo componente montado solo en una ruta de wallet: sin cruce.
        escribir("app/(app)/wallet/_components/Panel.tsx", usa("@/components/shared/Boton"));
        // Ciclo entre componentes: no cuelga.
        escribir("components/a.tsx", usa("@/components/b") + usa("@/lib/actions/ranking"));
        escribir("components/b.tsx", usa("@/components/a"));
        escribir("app/(app)/ranking/_components/R.tsx", usa("@/components/a"));

        it("mutación: un componente de components/ montado en una ruta del núcleo que llega a una action de wallet → rojo, con la cadena", () => {
          expect(new GrafoDeConsumos(raiz, []).cruces("app/(app)/ordenes/_components/Tabla.tsx")).toEqual([
            "app/(app)/ordenes/_components/Tabla.tsx → components/shared/Boton.tsx → components/shared/interno/Pieza.tsx → hooks/useSaldo.ts → lib/actions/wallet (wallet)",
          ]);
        });

        it("montado en una ruta de su mismo módulo, o con la action del núcleo, no es cruce", () => {
          expect(new GrafoDeConsumos(raiz, []).cruces("app/(app)/wallet/_components/Panel.tsx")).toEqual([]);
        });

        it("declarar el componente en CONSUMOS_ENTRE_MODULOS lo pone verde; declararlo con otro módulo, no", () => {
          const declarado = { pieza: "components/shared/Boton.tsx", anfitrionas: ["/ordenes"], modulo: "wallet" } as const;
          expect(new GrafoDeConsumos(raiz, [declarado]).cruces("app/(app)/ordenes/_components/Tabla.tsx")).toEqual([]);
          expect(
            new GrafoDeConsumos(raiz, [{ ...declarado, modulo: "ranking" }]).cruces("app/(app)/ordenes/_components/Tabla.tsx"),
          ).toHaveLength(1);
        });

        it("un ciclo entre componentes no cuelga", () => {
          expect(new GrafoDeConsumos(raiz, []).cruces("app/(app)/ranking/_components/R.tsx")).toEqual([]);
        });
      });

      it("directo desde app/: propio módulo o núcleo pasa; otro módulo falla; pieza compartida exige las dos", () => {
        const raiz = mkdtempSync(path.join(tmpdir(), "sl23-directo-"));
        try {
          const deWallet = "app/(app)/wallet/_components/X.tsx";
          const probar = (accion: string, consumos: ConstructorParameters<typeof GrafoDeConsumos>[1] = []) => {
            mkdirSync(path.dirname(path.join(raiz, deWallet)), { recursive: true });
            writeFileSync(path.join(raiz, deWallet), `import { a } from "@/lib/actions/${accion}";\n`);
            return new GrafoDeConsumos(raiz, consumos).cruces(deWallet);
          };
          expect(probar("wallet")).toEqual([]);
          expect(probar("liquidacion")).toEqual([]);
          expect(probar("ranking")).toEqual(["app/(app)/wallet/_components/X.tsx → lib/actions/ranking (ranking)"]);
          expect(probar("premio-ranking-devengo")).toHaveLength(1);
          expect(
            probar("premio-ranking-devengo", [{ pieza: deWallet, anfitrionas: ["/wallet"], modulo: ["wallet", "ranking"] }]),
          ).toEqual([]);
        } finally {
          rmSync(raiz, { recursive: true, force: true });
        }
      });
    });

    describe("(f) itemsVisibles en app/", () => {
      it("la llamada falla; la cita en un comentario o el import no", () => {
        expect(llamaAItemsVisibles(`const items = itemsVisibles(SIDEBAR_ITEMS, actor);`)).toBe(true);
        expect(llamaAItemsVisibles(`const d = primerDestino(itemsVisibles (SIDEBAR_ITEMS, a));`)).toBe(true);
        expect(llamaAItemsVisibles(`// antes: itemsVisibles(SIDEBAR_ITEMS, actor)\nconst i = menuDeLaEmpresa(a, m);`)).toBe(false);
        expect(llamaAItemsVisibles(`import { itemsVisibles } from "@/lib/auth/menu-visibility";`)).toBe(false);
      });
    });
  });
});
