// GUARDIA — SLT-52 (R16, R18): EL DISTRITO DE LA ORDEN LLEGA AL RESOLVER DE TARIFAS DE VERDAD.
//
// ## El defecto que evita
//
// En el modelo nuevo el distrito de la orden elige el grupo de distritos, y el grupo cambia el
// precio (R16) y el pago (R19). `ParTarifa.distritoId` es obligatorio (`string | null`) para que un
// llamador que lo olvide no compile. Pero el compilador acepta `distritoId: null`, y `null` es un
// valor legitimo («la orden no tiene distrito», R18): un llamador que lo escribiera A MANO para
// salir del paso se saltaria los grupos en silencio, cobrando el precio de la zona a una orden que
// esta en un grupo con otro precio. Compila, pasa los tipos y los tests con dobles; solo se veria
// en una factura.
//
// ## Que exige
//
// En `app/` y `lib/` (codigo de producto, no tests):
//   1. Ninguna llamada a `resolveTarifa(...)` pasa un `null` literal como distrito (3.er argumento),
//      ni lo omite.
//   2. Ningun objeto con forma de par o de contexto de pago (`tiendaId` y `zonaId`) escribe
//      `distritoId: null` literal.
//   3. Todo par construido donde el resolver lo consume —argumento de `clavePar(...)`, elemento de
//      un array literal pasado a `resolveTarifas(...)`/`resolvePagos(...)`, u objeto anotado como
//      `ParTarifa` o `ContextoPagoGestion`— LLEVA `distritoId` (o viene de un spread).
// El distrito tiene que salir de la orden o de la geografia resuelta (`orden.distritoId`,
// `geo.distritoId`, `row.distritoId`...). Si una superficie de verdad no lo conoce, eso se decide
// y se explica en ESA superficie (p. ej. `orden.distritoId ?? null` cuando la fila no lo trae).
//
// ## Como esta hecha
//
// Con el AST de TypeScript (`createSourceFile`, sin programa ni tipos: rapido), no con un barrido
// de texto, para no confundir un comentario o una cadena con codigo. Lleva control de no-vacuidad:
// el censo de archivos que construyen pares es un LITERAL; si el barrido deja de encontrarlos (una
// ruta cambiada, un parser roto), la guardia se pone roja en vez de pasar sin mirar nada.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const CARPETAS = ["app", "lib"];

function archivos(dir: string): string[] {
  const out: string[] = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) {
      if (nombre === "node_modules" || nombre.startsWith(".")) continue;
      out.push(...archivos(ruta));
    } else if (/\.tsx?$/.test(nombre) && !nombre.endsWith(".d.ts")) {
      out.push(ruta);
    }
  }
  return out;
}

interface Hallazgo {
  archivo: string;
  linea: number;
  motivo: string;
}

interface Barrido {
  hallazgos: Hallazgo[];
  /** Archivos donde se construye al menos un par o contexto vigilado (control de no-vacuidad). */
  conPares: Set<string>;
  llamadasResolveTarifa: number;
}

const TIPOS_VIGILADOS = new Set(["ParTarifa", "ContextoPagoGestion"]);
const METODOS_LOTE = new Set(["resolveTarifas", "resolvePagos"]);

function nombreDePropiedad(p: ts.ObjectLiteralElementLike): string | null {
  if (
    (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) &&
    (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))
  ) {
    return p.name.text;
  }
  return null;
}

function propiedades(o: ts.ObjectLiteralExpression): Map<string, ts.ObjectLiteralElementLike> {
  const m = new Map<string, ts.ObjectLiteralElementLike>();
  for (const p of o.properties) {
    const n = nombreDePropiedad(p);
    if (n !== null) m.set(n, p);
  }
  return m;
}

function tieneSpread(o: ts.ObjectLiteralExpression): boolean {
  return o.properties.some((p) => ts.isSpreadAssignment(p));
}

function nombreDeLlamada(c: ts.CallExpression): string | null {
  const e = c.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return null;
}

function anotadoComoVigilado(t: ts.TypeNode | undefined): boolean {
  return t !== undefined && ts.isTypeReferenceNode(t) && ts.isIdentifier(t.typeName) && TIPOS_VIGILADOS.has(t.typeName.text);
}

/** ¿Este objeto literal es un par/contexto que el resolver consume? */
function esParVigilado(o: ts.ObjectLiteralExpression): boolean {
  let p: ts.Node = o.parent;
  while (ts.isParenthesizedExpression(p)) p = p.parent;
  // clavePar({ ... })
  if (ts.isCallExpression(p) && nombreDeLlamada(p) === "clavePar") return true;
  // resolveTarifas([{ ... }]) / resolvePagos([{ ... }])
  if (ts.isArrayLiteralExpression(p) && ts.isCallExpression(p.parent) && METODOS_LOTE.has(nombreDeLlamada(p.parent) ?? "")) {
    return true;
  }
  // const par: ParTarifa = { ... }
  if (ts.isVariableDeclaration(p) && anotadoComoVigilado(p.type)) return true;
  // { ... } satisfies / as ParTarifa
  if ((ts.isAsExpression(p) || ts.isSatisfiesExpression(p)) && anotadoComoVigilado(p.type)) return true;
  // (x): ParTarifa => ({ ... })
  if (ts.isArrowFunction(p) && anotadoComoVigilado(p.type)) return true;
  // function f(): ParTarifa { return { ... } }
  if (ts.isReturnStatement(p)) {
    let f: ts.Node | undefined = p.parent;
    while (f !== undefined && !ts.isFunctionLike(f)) f = f.parent;
    if (f !== undefined && ts.isFunctionLike(f) && anotadoComoVigilado(f.type)) return true;
  }
  return false;
}

export function barrer(fuentes: ReadonlyArray<{ archivo: string; texto: string }>): Barrido {
  const hallazgos: Hallazgo[] = [];
  const conPares = new Set<string>();
  let llamadasResolveTarifa = 0;

  for (const { archivo, texto } of fuentes) {
    const sf = ts.createSourceFile(archivo, texto, ts.ScriptTarget.Latest, true, archivo.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const linea = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

    const visitar = (n: ts.Node): void => {
      if (ts.isCallExpression(n) && nombreDeLlamada(n) === "resolveTarifa" && ts.isPropertyAccessExpression(n.expression)) {
        llamadasResolveTarifa += 1;
        conPares.add(archivo);
        const distrito = n.arguments[2];
        if (distrito === undefined) {
          hallazgos.push({ archivo, linea: linea(n), motivo: "resolveTarifa(...) sin el distrito (3.er argumento)" });
        } else if (distrito.kind === ts.SyntaxKind.NullKeyword) {
          hallazgos.push({ archivo, linea: linea(n), motivo: "resolveTarifa(...) con `null` literal como distrito" });
        }
      }

      if (ts.isObjectLiteralExpression(n)) {
        const props = propiedades(n);
        const distrito = props.get("distritoId");
        const conFormaDePar = props.has("tiendaId") && props.has("zonaId");
        if (
          conFormaDePar &&
          distrito !== undefined &&
          ts.isPropertyAssignment(distrito) &&
          distrito.initializer.kind === ts.SyntaxKind.NullKeyword
        ) {
          hallazgos.push({ archivo, linea: linea(n), motivo: "par con `distritoId: null` literal" });
        }
        if (esParVigilado(n)) {
          conPares.add(archivo);
          if (distrito === undefined && !tieneSpread(n)) {
            hallazgos.push({ archivo, linea: linea(n), motivo: "par sin `distritoId`" });
          }
        }
      }
      ts.forEachChild(n, visitar);
    };
    visitar(sf);
  }
  return { hallazgos, conPares, llamadasResolveTarifa };
}

function fuentesDelProducto() {
  return CARPETAS.flatMap((c) => archivos(join(RAIZ, c))).map((ruta) => ({
    archivo: relative(RAIZ, ruta).split(sep).join("/"),
    texto: readFileSync(ruta, "utf8"),
  }));
}

describe("SLT-52 — guardia: el distrito de la orden llega al resolver de tarifas (R16, R18)", () => {
  const barrido = barrer(fuentesDelProducto());

  it("ningun llamador de app/ o lib/ pasa `null` literal ni olvida el distrito", () => {
    const texto = barrido.hallazgos.map((h) => `${h.archivo}:${h.linea} — ${h.motivo}`);
    expect(texto).toEqual([]);
  });

  it("no-vacuidad: el censo de archivos que construyen pares es el esperado", () => {
    // LITERAL a proposito: es el contrato de quien construye pares hoy. Si una superficie nueva
    // empieza a hacerlo (o una deja de hacerlo, p. ej. el listado en T4.3), se actualiza aqui con
    // su motivo; si el barrido dejara de encontrarlos, esta prueba lo dice en vez de pasar vacia.
    expect([...barrido.conPares].sort()).toEqual([
      "lib/repositories/CierreDiaRepository.ts",
      "lib/repositories/OrdenRepository.ts",
      "lib/repositories/TarifaVigenteRepository.ts",
      "lib/services/ApiOrdenLecturaService.ts",
      "lib/services/BulkOrdenService.ts",
      "lib/services/CorregirDatosClienteService.ts",
      "lib/services/CotizacionOrdenService.ts",
      "lib/services/RechazoTiendaService.ts",
    ]);
    expect(barrido.llamadasResolveTarifa).toBe(1);
  });

  it("autocomprobacion: la guardia ve un `null` literal, un distrito omitido y un par sin distrito", () => {
    const malo = barrer([
      {
        archivo: "lib/falso.ts",
        texto: [
          "const a = repo.resolveTarifa(t, z, null);",
          "const b = repo.resolveTarifa(t, z);",
          "const c = clavePar({ tiendaId: t, zonaId: z, distritoId: null });",
          "const d = repo.resolveTarifas([{ tiendaId: t, zonaId: z }]);",
          "const e: ParTarifa = { tiendaId: t, zonaId: z };",
          "const f = (o: O): ParTarifa => ({ tiendaId: t, zonaId: z });",
          "const g = svc.resolvePagos([{ gestionId, tiendaId, zonaId, distritoId: null }]);",
        ].join("\n"),
      },
    ]);
    expect(malo.hallazgos.map((h) => `${h.linea} ${h.motivo}`)).toEqual([
      "1 resolveTarifa(...) con `null` literal como distrito",
      "2 resolveTarifa(...) sin el distrito (3.er argumento)",
      "3 par con `distritoId: null` literal",
      "4 par sin `distritoId`",
      "5 par sin `distritoId`",
      "6 par sin `distritoId`",
      "7 par con `distritoId: null` literal",
    ]);
    const bueno = barrer([
      {
        archivo: "lib/falso.ts",
        texto: [
          "const a = repo.resolveTarifa(t, z, orden.distritoId);",
          "const c = clavePar({ tiendaId: t, zonaId: z, distritoId: geo.distritoId });",
          "const d = repo.resolveTarifas([{ ...par }]);",
          "const e: ParTarifa = { tiendaId, zonaId, distritoId: fila.distritoId ?? null };",
        ].join("\n"),
      },
    ]);
    expect(bueno.hallazgos).toEqual([]);
  });
});
