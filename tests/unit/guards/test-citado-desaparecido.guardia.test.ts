// GUARDIA DEL ARNÉS — UN TEST CITADO POR UNA FEATURE NO DESAPARECE EN SILENCIO.
//
// **El incidente que la motiva.** El 2026-08-07 el commit `da544b30` borró `ChatWhatsappPanel`
// (decisión humana correcta: lo sustituye el chat flotante). Ese panel era **uno de los dos
// consumidores** de `useTonoAlIncrementar`, el hook de la feature 161, y dentro de su archivo de
// test vivía el bloque «feature 161, R21–R23». Al borrarlo se fueron las dos cosas a la vez: el
// enganche y la prueba de que existía. El mensajero dejó de oír el tono del chat y llegó a
// producción (release #314); lo encontró una tarea de contabilidad horas después, no una alerta.
//
// **Por qué ninguna red lo vio, y por qué esta guardia no repite el error.** `superficie-de-uso`
// (PR #300) vigila que toda Server Action y todo componente tengan quien los monte. Ahí no quedó
// nada huérfano: quedó un hook **vivo** que pasó de 2 consumidores a 1. Lo que desapareció fue el
// test.
//
// **La señal NO es el número de consumidores, y esto se midió antes de dar nada por bueno.** Sobre
// el árbol del 2026-08-07 (949 módulos de producción; 1.047 exports de valor en `hooks/` + `lib/`;
// método y script en la bitácora, reproducible):
//
// | señal candidata | excepciones para arrancar en verde | ¿caza el incidente? |
// |---|---|---|
// | `in_degree == 0` (símbolo sin consumidores) | **166** | **NO** — tras el borrado el hook tenía 1 |
// | `in_degree <= 1` («bajó a 1») | **529** | sí, pero 529 excepciones no son una señal |
// | export de `hooks/`+`lib/` sin consumidor en `app/` ni `components/` | **610** (172 si se sigue la cadena) | **NO** — el consumidor que quedó era `components/shared/NotificationsBell.tsx` |
// | **test citado por una feature que EXISTIÓ y hoy no está** | **5 citas, 2 fichas** | **SÍ** |
//
// El detalle, con los censos completos, está en `progress/impl_guardia-citas-rotas.md`. La
// conclusión es la misma que en el PR #300: contar aristas es ruidoso Y ciego al caso que lo
// motiva. Aquí la primitiva correcta no está en el grafo de imports: está en el **mapa `R<n> →
// test`** que la regla nº 4 de `CLAUDE.md` exige y que `docs/specs.md` llama trazabilidad. Si el
// mapa de una feature apunta a un archivo que ya no existe, esa feature tiene requisitos sin
// prueba — que es exactamente lo que le pasó a la 161.
//
// **Réplica histórica, medida sobre los commits reales (sin checkout, con `git ls-tree`+`git
// show`).** El censo de `specs/*/tasks.md` daba **5** citas rotas en `da544b30^` y **8** en
// `da544b30`. Las tres nuevas: `specs/161-tono-notificacion/tasks.md`, R21/R22/R23 →
// `ChatWhatsappPanel.test.tsx`. La guardia se habría puesto roja **en el commit que causó el fallo**,
// nombrando la feature y los tres requisitos que se quedaron sin prueba. En `40f150a5` (cuatro días
// después, con el fallo ya en producción y reparado) seguían siendo 8: nadie las vio.
//
// **Alcance: `specs/*/tasks.md` + `specs/*/design.md`, y por qué no más.** El mapa `R → test`
// aparece en cuatro sitios distintos de este repo (22 features lo tienen en `tasks.md`, 32 en
// `requirements.md`, 9 en `design.md`, 116 en `progress/impl_*.md`). Esta guardia lee los dos
// primeros —534 citas entre ambos—:
//  - `design.md` entró **el 2026-08-07 y costó CERO anotaciones**: se midió antes (0 citas rotas
//    sobre 57) y se amplió el mismo día, que es la única ventana en que ampliar un alcance es
//    gratis. Un caso de anti-vacuidad afirma que las dos clases de documento siguen aportando
//    mapa, para que estrechar esto otra vez no pase en silencio.
//  - `progress/**` es una **bitácora**: un registro de lo que pasó en una tanda. Reescribirla para
//    que apunte a un archivo renombrado después falsifica el registro. (Censo medido si se
//    incluyera: 107 citas rotas en 24 archivos — impagable, y por el motivo equivocado.)
//  - `requirements.md` sí es contrato vivo, y AMPLIARLO AHÍ ES DEUDA ABIERTA con coste, no una
//    decisión de diseño: son 32 citas rotas más en 7 archivos (features 55, 59, 94, 114, 135, 160,
//    167), de UI retirada cuyo sustituto **no se pudo verificar sin inventar**. Está en la bitácora
//    con los números para que alguien lo cierre con datos.
//
// **La excepción va ANOTADA EN EL MISMO `tasks.md`**, no en una allowlist central: es la convención
// que este repo ya adoptó («el motivo junto al código», `fa60b0ce`) y sobre todo invierte la carga
// de la prueba en el momento correcto — quien borre el test se encuentra la suite roja y tiene que
// elegir entre reescribirlo, repuntar la cita al sustituto, o escribir por qué esa feature se queda
// sin prueba. Va en un comentario HTML propio —puede ocupar varias líneas— y no dentro de la fila,
// porque un comentario en medio de una tabla markdown la parte en dos. Por simetría **caduca**: si
// el archivo vuelve a existir, la anotación sobra, y una anotación que no corresponde a ninguna cita
// también es roja.
//
// **La única excepción fuera del documento es TEMPORAL** (`EXCEPCIONES_TEMPORALES`, SL-13 D4): para
// citas de specs que no se pueden editar y ya tienen ficha que los retira. Cada una nombra la ficha
// que la crea, la que la retira y su motivo, y caduca igual: archivo de vuelta, cita desaparecida o
// borrado fuera de la historia ponen la guardia en rojo.
//
// **Por qué el detector se auto-prueba.** Precedente de la casa: una guardia de este repo pasó VERDE
// con su detector roto —encontraba cero porque no encontraba NADA— y otra se tumbó sola por anclar
// en dos símbolos que había que borrar. Por eso aquí: (0) el lector se prueba contra respuestas
// conocidas en las dos direcciones sobre texto sintético, y el filtro, contra un mapa de borrados
// sintético; (1) se afirma el TAMAÑO de lo escaneado —docs, citas y archivos de test del árbol— y que
// el clon NO es superficial, de modo que un `specs/` que se mueva o un clon con `--depth` pongan la
// guardia roja en vez de muda; y (2) los controles positivos anclan en citas que RESUELVEN hoy
// (`useTonoAlIncrementar.test.tsx`, `CarruselCards.test.tsx`), que son código vivo y central. El
// ancla en la historia del producto de origen (`da544b30`) se retiró en SL-10: este repo nació sin ella.
//
// La lectura es ESTÁTICA sobre el árbol + una sola llamada a `git log`. La selecciona
// `pnpm exec vitest run guard` por el nombre del archivo, sin estar registrada en ninguna lista.
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, it, expect } from "vitest";

const RAIZ = path.resolve(__dirname, "../../..");

/** Dónde viven los tests. Ambos árboles cuentan: una feature puede citar un `.spec.ts` de e2e. */
const ARBOLES_DE_TEST = ["tests", "e2e"] as const;

const ES_ARCHIVO_DE_TEST = /\.(test|spec)\.[cm]?[jt]sx?$/;

/** Una fila de tabla markdown cuya primera celda es un requisito: `| R21 | … |`, `| **R3** | … |`. */
const FILA_DE_REQUISITO = /^\s*\|\s*\**R\s*-?\s*([0-9]+[a-z]?)\**\s*\|(.*)\|/i;

/** Solo se lee lo que va entre backticks: en estas tablas la prosa nombra archivos a propósito
 *  («`metrics-descripciones.test.ts` nunca existió», specs/173) y sin esto se leería como cita. */
const ENTRE_BACKTICKS = /`([^`\n]+)`/g;

/** Un nombre de test es una ruta sin espacios. Con esto, un trozo de frase con un punto no cuela. */
const CITA_PLAUSIBLE = /^[A-Za-z0-9_@./{},\-[\]]+\.(?:test|spec)\.[cm]?[jt]sx?$/;

/** La anotación de excepción, con su archivo y su motivo obligatorio. */
const ANOTACION = /<!--\s*@test-desaparecido\s+(\S+?)\s*:\s*([^]*?)-->/g;

/** Motivos que no son motivos. Una excepción sin razón escrita es la allowlist que no queríamos. */
const MOTIVO_VACIO = /^(todo|tbd|fixme|xxx|pendiente|por decidir|n\/a|-+)\b/i;
const MOTIVO_MINIMO = 30;

// ---------------------------------------------------------------------------
// El detector
// ---------------------------------------------------------------------------

function rutaRelativa(archivo: string): string {
  return path.relative(RAIZ, archivo).split(path.sep).join("/");
}

function nombreDe(ruta: string): string {
  return ruta.slice(ruta.lastIndexOf("/") + 1);
}

function listarArchivos(dir: string, acepta: (n: string) => boolean, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) listarArchivos(completo, acepta, acc);
    else if (acepta(entrada.name)) acc.push(completo);
  }
  return acc;
}

/** `tests/x/{A,B}.test.tsx` → `tests/x/A.test.tsx` y `tests/x/B.test.tsx`. La forma con llaves es
 *  la que usa `progress/impl_161` y alguna tabla; sin expandirla se perdería media cita. */
function expandirLlaves(cita: string): string[] {
  const m = /^(.*)\{([^}]*)\}(.*)$/.exec(cita);
  if (!m) return [cita];
  return m[2].split(",").flatMap((pieza) => expandirLlaves(`${m[1]}${pieza.trim()}${m[3]}`));
}

/** Una cita del mapa `R<n> → test` de una ficha. */
interface Cita {
  doc: string;
  linea: number; // 1-based, para que el mensaje se pueda pinchar
  requisito: string;
  archivo: string;
}

export function citasDe(doc: string, texto: string): Cita[] {
  const salida: Cita[] = [];
  texto.split(/\r?\n/).forEach((linea, i) => {
    const fila = FILA_DE_REQUISITO.exec(linea);
    if (!fila) return;
    for (const trozo of fila[2].matchAll(ENTRE_BACKTICKS)) {
      const bruto = trozo[1].trim();
      if (!CITA_PLAUSIBLE.test(bruto)) continue;
      for (const archivo of expandirLlaves(bruto))
        salida.push({ doc, linea: i + 1, requisito: `R${fila[1]}`, archivo });
    }
  });
  return salida;
}

interface Anotacion {
  doc: string;
  linea: number;
  archivo: string;
  motivo: string;
}

export function anotacionesDe(doc: string, texto: string): Anotacion[] {
  const salida: Anotacion[] = [];
  // Sobre el texto ENTERO, no línea a línea: un motivo que diga algo no cabe en una línea, y
  // obligar a ello produce o un renglón de 400 caracteres o una excusa de relleno —justo lo que
  // `MOTIVO_MINIMO` quiere evitar—. El número de línea sale del desplazamiento del match, así
  // que el mensaje de la guardia se sigue pudiendo pinchar.
  for (const m of texto.matchAll(ANOTACION)) {
    const motivo = m[2].trim().replace(/\s*\n\s*/g, " ");
    if (motivo.length < MOTIVO_MINIMO || MOTIVO_VACIO.test(motivo)) continue;
    const linea = texto.slice(0, m.index ?? 0).split(/\r?\n/).length;
    salida.push({ doc, linea, archivo: m[1], motivo });
  }
  return salida;
}

// ---------------------------------------------------------------------------
// El árbol de hoy y la historia, leídos una sola vez
// ---------------------------------------------------------------------------

const TESTS_DE_HOY = ARBOLES_DE_TEST.flatMap((arbol) =>
  listarArchivos(path.join(RAIZ, arbol), (n) => ES_ARCHIVO_DE_TEST.test(n)).map(rutaRelativa),
);
const NOMBRES_DE_HOY = new Set(TESTS_DE_HOY.map(nombreDe));

/**
 * ¿La cita resuelve a un archivo que existe?
 *
 * Se acepta por ruta exacta O por nombre de archivo. La segunda vía es una **lenidad deliberada**:
 * mover `tests/components/X.test.tsx` a `tests/unit/components/X.test.tsx` no pierde ni una prueba,
 * y marcarlo llenaría el censo de mudanzas de carpeta que no son el fallo que se vigila.
 */
function existeHoy(cita: string): boolean {
  if (cita.includes("/")) {
    const completo = path.join(RAIZ, cita);
    if (existsSync(completo) && statSync(completo).isFile()) return true;
  }
  return NOMBRES_DE_HOY.has(nombreDe(cita));
}

/** Un archivo de test que la historia de esta rama vio BORRARSE, con el commit que se lo llevó. */
interface Borrado {
  ruta: string;
  commit: string; // `<sha> <fecha> <asunto>`
}

/**
 * Los tests borrados en la historia de `HEAD`, por nombre de archivo. Una sola llamada a git.
 *
 * `HEAD` y no `--all`: el resultado es el mismo (medido, 43 en ambos) y depender de las ramas que
 * cada clon tenga a mano haría que la guardia dijera cosas distintas en dos máquinas.
 * `--no-renames` a propósito: un renombrado tiene que contar como «este nombre desapareció», que es
 * justo lo que le pasó a `MisAsignacionesModule.test.tsx`.
 * `execFileSync` con argumentos en array, no `execSync`: el formato lleva espacios y el shell lo
 * partiría (`fatal: bad revision '%ad'`).
 */
function leerBorradosDeLaHistoria(): Map<string, Borrado> {
  const salida = execFileSync(
    "git",
    [
      "log",
      "HEAD",
      "--no-renames",
      "--diff-filter=D",
      "--date=short",
      "--pretty=format:@@%h %ad %s",
      "--name-only",
      "--",
      ...ARBOLES_DE_TEST,
    ],
    { cwd: RAIZ, maxBuffer: 256 * 1024 * 1024 },
  ).toString();

  const porNombre = new Map<string, Borrado>();
  let commit = "";
  for (const cruda of salida.split(/\r?\n/)) {
    const linea = cruda.trim();
    if (!linea) continue;
    if (linea.startsWith("@@")) {
      commit = linea.slice(2);
      continue;
    }
    if (!ES_ARCHIVO_DE_TEST.test(linea)) continue;
    // `git log` va de lo nuevo a lo viejo: el primero que se ve es el borrado MÁS RECIENTE.
    if (!porNombre.has(nombreDe(linea))) porNombre.set(nombreDe(linea), { ruta: linea, commit });
  }
  return porNombre;
}

const BORRADOS = leerBorradosDeLaHistoria();

// ---------------------------------------------------------------------------
// El censo
// ---------------------------------------------------------------------------

/** Los documentos de una ficha que SÍ son contrato vivo y entran en el censo. */
const DOCS_DE_FICHA = ["tasks.md", "design.md"] as const;

const FICHAS = existsSync(path.join(RAIZ, "specs"))
  ? readdirSync(path.join(RAIZ, "specs"), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .flatMap((e) => DOCS_DE_FICHA.map((doc) => `specs/${e.name}/${doc}`))
      .filter((d) => existsSync(path.join(RAIZ, d)))
      .sort()
  : [];

interface Doc {
  ruta: string;
  texto: string;
  citas: Cita[];
  anotaciones: Anotacion[];
}

const DOCS: Doc[] = FICHAS.map((ruta) => {
  const texto = readFileSync(path.join(RAIZ, ruta), "utf8");
  return { ruta, texto, citas: citasDe(ruta, texto), anotaciones: anotacionesDe(ruta, texto) };
});

const CITAS = DOCS.flatMap((d) => d.citas);
const ANOTACIONES = DOCS.flatMap((d) => d.anotaciones);

/** Una cita que apunta a un test que EXISTIÓ y hoy no está. Ésta es la señal. */
interface Desaparecido extends Cita {
  borrado: Borrado;
}

/**
 * El filtro del detector: una cita que hoy NO resuelve y cuyo nombre SÍ está en el mapa de
 * borrados. Función pura sobre sus entradas —el mapa y el resolvedor llegan por parámetro— para
 * que el conocido-positivo la pruebe con un mapa sintético sin depender de la historia de este
 * clon (SL-10, D9).
 */
export function desaparecidas(
  citas: readonly Cita[],
  borrados: ReadonlyMap<string, Borrado>,
  existe: (archivo: string) => boolean,
): Desaparecido[] {
  return citas.flatMap((cita) => {
    if (existe(cita.archivo)) return [];
    const borrado = borrados.get(nombreDe(cita.archivo));
    // Sin entrada en la historia el archivo NUNCA existió: es una tabla que planificó un nombre y
    // nunca lo escribió (specs/109 dice literalmente «archivo de test esperado»). Es otro problema,
    // y meterlo aquí ahogaría esta señal en 11 hallazgos de otra especie (9 de la 109 y 2 de la 173,
    // medidos hoy). Deuda anotada en la bitácora, con su censo.
    return borrado ? [{ ...cita, borrado }] : [];
  });
}

const DESAPARECIDOS: Desaparecido[] = desaparecidas(CITAS, BORRADOS, existeHoy);

/**
 * La anti-vacuidad de la mitad que vive en git: recibe la respuesta de
 * `git rev-parse --is-shallow-repository` y devuelve la queja, o `null` si el clon tiene la
 * historia entera. Pura para poder alimentarla con `"true"` y ver el rojo.
 */
export function quejaDeClonSuperficial(respuesta: string): string | null {
  if (respuesta.trim() === "false") return null;
  return (
    `\`git rev-parse --is-shallow-repository\` respondió «${respuesta.trim()}»: en un clon ` +
    "superficial `git log --diff-filter=D` no ve los borrados, toda cita rota se clasificaría como " +
    "«nunca existió» y esta guardia se volvería un adorno verde. Clona con la historia entera " +
    "(en CI, `fetch-depth: 0`)."
  );
}

function respuestaDeGitSobreSuperficial(): string {
  return execFileSync("git", ["rev-parse", "--is-shallow-repository"], { cwd: RAIZ }).toString();
}

/**
 * Una excepción TEMPORAL: la cita no se puede anotar en su propio documento porque ese documento no
 * se toca, y alguien ya tiene la ficha que lo retira. Nombra la ficha que la crea, la que la retira
 * y su motivo. Caduca sola (ver `excepcionesCaducadas`).
 */
interface ExcepcionTemporal {
  doc: string;
  archivo: string;
  ficha: string;
  retira: string;
  motivo: string;
}

const MOTIVO_459 =
  "la migración 459 llevaba datos de producción del producto de origen y se retiró con sus tests en SL-13; " +
  "los specs heredados no se editan y los retira SL-27";

/**
 * SL-13 (D4, R12): las citas de los specs heredados a los dos tests que se fueron con la migración
 * 459. Son dos, las de `specs/461/design.md:827` (`| R61 |`). Las de `specs/459/design.md:1100-1101`
 * no entran: sus filas empiezan por `| R80, R88 |` y `| R81–R86 |`, que `FILA_DE_REQUISITO` no lee
 * como requisito, y una excepción para ellas caducaría en rojo desde el primer día («ya no lo cita»).
 * Se quitan cuando SL-27 retire esos specs; si antes se aplana la historia, el caso de caducidad lo
 * pide en rojo.
 */
const EXCEPCIONES_TEMPORALES: readonly ExcepcionTemporal[] = [
  {
    doc: "specs/461-cobro-a-tienda-y-nombres-claros/design.md",
    archivo: "reclasificacion-459-migration.test.ts",
    ficha: "SL-13",
    retira: "SL-27",
    motivo: MOTIVO_459,
  },
  {
    doc: "specs/461-cobro-a-tienda-y-nombres-claros/design.md",
    archivo: "reclasificacion-459-lista.guardia.test.ts",
    ficha: "SL-13",
    retira: "SL-27",
    motivo: MOTIVO_459,
  },
];

/**
 * Las quejas de las excepciones temporales que ya no hacen falta, o que no dicen lo que deben.
 * Pura sobre sus entradas, para probarla con datos sintéticos en las tres direcciones.
 */
export function excepcionesCaducadas(
  excepciones: readonly ExcepcionTemporal[],
  citas: readonly Cita[],
  borrados: ReadonlyMap<string, Borrado>,
  existe: (archivo: string) => boolean,
): string[] {
  return excepciones.flatMap((e) => {
    const quien = `${e.doc} ${e.archivo}`;
    const quejas: string[] = [];
    if (!/^SL-\d+$/.test(e.ficha) || !/^SL-\d+$/.test(e.retira))
      quejas.push(`${quien}: le falta la ficha que la crea o la que la retira`);
    if (e.motivo.trim().length < MOTIVO_MINIMO || MOTIVO_VACIO.test(e.motivo.trim()))
      quejas.push(`${quien}: su motivo no es un motivo`);
    if (existe(e.archivo)) quejas.push(`${quien}: el archivo vuelve a existir; quita la excepción`);
    if (!citas.some((c) => c.doc === e.doc && nombreDe(c.archivo) === nombreDe(e.archivo)))
      quejas.push(`${quien}: ese documento ya no lo cita; quita la excepción (la retira ${e.retira})`);
    if (!borrados.has(nombreDe(e.archivo)))
      quejas.push(`${quien}: su borrado ya no está en la historia de git; quita la excepción`);
    return quejas;
  });
}

function anotacionPara(
  d: Desaparecido,
  excepciones: readonly ExcepcionTemporal[] = EXCEPCIONES_TEMPORALES,
): Anotacion | ExcepcionTemporal | undefined {
  return (
    ANOTACIONES.find((a) => a.doc === d.doc && nombreDe(a.archivo) === nombreDe(d.archivo)) ??
    excepciones.find((e) => e.doc === d.doc && nombreDe(e.archivo) === nombreDe(d.archivo))
  );
}

function feature(doc: string): string {
  return doc.split("/")[1] ?? doc;
}

function describir(d: Desaparecido): string {
  return (
    `${d.doc}:${d.linea} — la feature «${feature(d.doc)}» mapea ${d.requisito} a ` +
    `\`${d.archivo}\`, que estaba en ${d.borrado.ruta} y lo borró ${d.borrado.commit}`
  );
}

// ---------------------------------------------------------------------------
// 0 — El detector, probado contra la respuesta conocida
// ---------------------------------------------------------------------------

describe("test citado desaparecido — el detector", () => {
  it("el lector de citas ve la fila de un requisito y NO lee la prosa que nombra archivos", () => {
    const doc = [
      "| R | Test |",
      "|---|---|",
      "| R21 | `ChatWhatsappPanel.test.tsx` › un entrante nuevo suena |",
      "| **R3** | `tests/unit/x.test.ts` + `tests/unit/y.spec.tsx` |",
      "| R7 | `tests/{a,b}.test.ts` |",
      "| R9 | idem → sin archivo citado |",
      "Aquí, fuera de la tabla, se nombra `tests/no-cuenta.test.ts` a propósito.",
      "| R53 | `metrics.test.ts` — corregido: metrics-sin-backticks.test.ts nunca existió |",
    ].join("\n");
    const citas = citasDe("specs/x/tasks.md", doc);
    expect(citas.map((c) => `${c.requisito}:${c.archivo}`)).toEqual([
      "R21:ChatWhatsappPanel.test.tsx",
      "R3:tests/unit/x.test.ts",
      "R3:tests/unit/y.spec.tsx",
      "R7:tests/a.test.ts",
      "R7:tests/b.test.ts",
      "R53:metrics.test.ts",
    ]);
    // Las dos mitades del falso positivo: fuera de la tabla no hay cita…
    expect(citas.some((c) => c.archivo.includes("no-cuenta"))).toBe(false);
    // …y dentro de una celda, lo que no va entre backticks tampoco. Esto no es teoría: la tabla de
    // `specs/173-caja-tesoreria` documenta en prosa dos nombres que «nunca existieron», y sin este
    // filtro la guardia arrancaría exigiendo anotar una corrección ya escrita.
    expect(citas.some((c) => c.archivo.includes("sin-backticks"))).toBe(false);
    // Y la línea se conserva, que es lo que hace el mensaje pinchable.
    expect(citas.find((c) => c.requisito === "R21")?.linea).toBe(3);
  });

  it("el lector de anotaciones exige archivo y motivo escrito, y descarta el relleno", () => {
    const buena =
      "<!-- @test-desaparecido X.test.tsx: la vista se retiró el 2026-08-07 y no hay sustituto -->";
    expect(anotacionesDe("d", buena)).toEqual([
      {
        doc: "d",
        linea: 1,
        archivo: "X.test.tsx",
        motivo: "la vista se retiró el 2026-08-07 y no hay sustituto",
      },
    ]);
    for (const relleno of ["TODO", "pendiente de decidir", "-", "corto"]) {
      expect(
        anotacionesDe("d", `<!-- @test-desaparecido X.test.tsx: ${relleno} -->`),
        `«${relleno}» pasó como motivo`,
      ).toEqual([]);
    }
    expect(anotacionesDe("d", "<!-- un comentario cualquiera -->")).toEqual([]);
  });

  it("el motivo puede ocupar varias líneas, y la anotación conserva la línea en que empieza", () => {
    // Los motivos reales de este repo ocupan un párrafo: cuándo desapareció, con qué commit, qué
    // cubre hoy la conducta y qué se quedó sin cubrir. Si el lector fuera línea a línea, escribir
    // eso obligaría a un renglón interminable, y lo que se escribiría en la práctica es «TODO».
    const doc = [
      "línea de relleno",
      "<!-- @test-desaparecido tests/x/Y.test.tsx: el módulo se partió en dos el 2026-08-03",
      "     (369ccc4c) y estos casos nunca llegaron a escribirse; la conducta hermana sí",
      "     está cubierta en Z.test.tsx -->",
    ].join("\n");
    const [anotacion] = anotacionesDe("d", doc);
    expect(anotacion.archivo).toBe("tests/x/Y.test.tsx");
    expect(anotacion.linea, "la anotación tiene que apuntar a donde EMPIEZA").toBe(2);
    // El motivo se lee como un párrafo, sin los saltos ni la sangría del markdown.
    expect(anotacion.motivo).toContain("el módulo se partió en dos el 2026-08-03 (369ccc4c)");
    expect(anotacion.motivo).not.toContain("\n");
    // Y el filtro de relleno sigue aplicando aunque el comentario ocupe varias líneas.
    expect(anotacionesDe("d", "<!-- @test-desaparecido X.test.tsx: TODO\n  ver luego -->")).toEqual(
      [],
    );
  });

  it("CONOCIDO-POSITIVO sintético: una cita a un test borrado se marca; una a uno vivo, no", () => {
    // El detector completo sobre datos fabricados, para que su lógica quede probada aunque el
    // censo real llegue algún día a cero. Un archivo VIVO del árbol y uno que la historia vio
    // borrarse: la respuesta tiene que ser distinta para cada uno.
    //
    // El mapa de borrados es SINTÉTICO desde SL-10 (D9): este repo nació sin la historia del
    // producto de origen, así que el borrado real de `ChatWhatsappPanel.test.tsx` no está en su `git log`.
    // Lo que se prueba aquí es el filtro; la lectura de la historia la vigila la anti-vacuidad.
    const vivo = "useTonoAlIncrementar.test.tsx";
    const muerto = "ChatWhatsappPanel.test.tsx";
    expect(existeHoy(vivo), "el ancla viva desapareció: cambia el ancla").toBe(true);
    expect(existeHoy(muerto)).toBe(false);

    const commitInventado = "0000000 2026-01-01 commit inventado para el conocido-positivo";
    const borradosSinteticos = new Map<string, Borrado>([
      [muerto, { ruta: `tests/components/${muerto}`, commit: commitInventado }],
      // El vivo también figura como borrado: que exista HOY tiene que ganar a la historia.
      [vivo, { ruta: `tests/viejo/${vivo}`, commit: commitInventado }],
    ]);
    const citas = citasDe(
      "specs/inventada/tasks.md",
      [`| R1 | \`${vivo}\` |`, `| R2 | \`${muerto}\` |`].join("\n"),
    );
    const marcadas = desaparecidas(citas, borradosSinteticos, existeHoy);
    expect(marcadas.map((c) => c.requisito)).toEqual(["R2"]);
    expect(marcadas[0].borrado.commit).toBe(commitInventado);
    // Y sin entrada en el mapa no hay marca: lo que nunca se borró no desapareció.
    expect(desaparecidas(citas, new Map(), existeHoy)).toEqual([]);
  });

  it("un nombre que NUNCA existió no entra en el censo — es otra especie de fallo", () => {
    const inventado = "este-test-jamas-existio-en-este-repo.test.ts";
    expect(existeHoy(inventado)).toBe(false);
    expect(BORRADOS.has(inventado)).toBe(false);
    // `specs/109-sin-gestionar-cierre-vencido/tasks.md` es el caso real: su tabla se titula
    // «archivo de test esperado» y nombra 6 archivos que nunca se escribieron con ese nombre.
    // Eso es un mapa aspiracional, no un test que desapareció, y va por otra vía.
    expect(DESAPARECIDOS.some((d) => d.archivo === inventado)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 1 — Anti-vacuidad: se leyó algo, y se leyó entero
// ---------------------------------------------------------------------------

describe("test citado desaparecido — anti-vacuidad", () => {
  it("hay fichas, hay mapas R→test y hay árbol de tests: ningún escaneo salió vacío", () => {
    // Sin esto, un `specs/` que se mueva o un `tasks.md` que cambie de formato dejan todos los
    // `toEqual([])` de abajo pasando sobre CERO datos, para siempre. Es el modo de fallo que este
    // repo ya se comió: la guardia verde porque no encontraba nada.
    expect(FICHAS.length, "no se encontró ningún `specs/*/{tasks,design}.md`").toBeGreaterThanOrEqual(
      250,
    );
    expect(
      DOCS.filter((d) => d.citas.length > 0).length,
      "ninguna ficha tiene mapa `R → test`: el lector de filas dejó de reconocer el formato",
    ).toBeGreaterThanOrEqual(25);
    expect(CITAS.length, "el lector de citas no encontró casi nada").toBeGreaterThanOrEqual(450);
    expect(new Set(CITAS.map((c) => c.archivo)).size).toBeGreaterThanOrEqual(180);
    expect(TESTS_DE_HOY.length, "no se encontró el árbol de tests").toBeGreaterThanOrEqual(800);
    expect(DOCS.every((d) => d.texto.trim().length > 0), "alguna ficha se leyó vacía").toBe(true);
  });

  it("el censo cubre LAS DOS clases de documento, y se nota si alguna se cae", () => {
    // Sin esto, estrechar el alcance a `tasks.md` otra vez —o que `DOCS_DE_FICHA` pierda una
    // entrada— dejaría la guardia verde y más ciega, que es el modo de fallo silencioso que
    // esta suite persigue. Los umbrales de arriba, agregados, no lo distinguirían.
    for (const doc of DOCS_DE_FICHA) {
      const conMapa = DOCS.filter((d) => d.ruta.endsWith(`/${doc}`) && d.citas.length > 0);
      expect(
        conMapa.length,
        `ninguna ficha aporta mapa \`R → test\` desde su \`${doc}\`: o el alcance se estrechó, ` +
          "o el lector dejó de reconocer ese documento",
      ).toBeGreaterThanOrEqual(5);
    }
  });

  it("git respondió con la historia de borrados: un clon superficial pone esto ROJO, no mudo", () => {
    // La mitad del detector vive en `git log`. En un clon superficial devuelve poco o nada, TODA
    // cita rota se clasificaría como «nunca existió» y la guardia callaría justo cuando más falta
    // hace. Aquí se queja. Si git no está, `execFileSync` lanza y el caso también sale rojo.
    //
    // Desde SL-10 (D9) se pregunta a git si el clon es superficial, que era el motivo declarado
    // de este caso, en vez de contar borrados (>= 20) y anclar en el commit `da544b30` del producto de origen:
    // este repo nació sin esa historia y hoy tiene pocos borrados. El CI clona con
    // `fetch-depth: 0`.
    expect(quejaDeClonSuperficial("true"), "la queja no muerde con un clon superficial").not.toBeNull();
    expect(quejaDeClonSuperficial("false\n")).toBeNull();
    const queja = quejaDeClonSuperficial(respuestaDeGitSobreSuperficial());
    expect(queja, queja ?? "").toBeNull();
    // Y toda entrada trae su commit: si el parseo del `--pretty` se rompiera, el mensaje de abajo
    // diría «lo borró » y nadie sabría dónde mirar.
    expect([...BORRADOS.values()].filter((b) => b.commit.length < 10)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2 — Control positivo: el detector NO marca lo que está vivo
// ---------------------------------------------------------------------------

describe("test citado desaparecido — control positivo", () => {
  it("CONTROL POSITIVO: las citas de la 161 y la 163 que sí resuelven salen limpias", () => {
    // Anclas vivas y centrales: `useTonoAlIncrementar.test.tsx` es el test del hook del incidente
    // (hook con dos consumidores hoy) y `CarruselCards.test.tsx` el del componente shared de la
    // 163. Si el detector se rompiera «hacia el rojo», estas dos caerían antes que nada.
    for (const [ficha, archivo] of [
      ["specs/161-tono-notificacion/tasks.md", "useTonoAlIncrementar.test.tsx"],
      ["specs/163-carrusel-en-reparto/tasks.md", "CarruselCards.test.tsx"],
    ] as const) {
      const citada = CITAS.filter((c) => c.doc === ficha && nombreDe(c.archivo) === archivo);
      expect(citada.length, `${ficha} dejó de citar ${archivo}`).toBeGreaterThan(0);
      expect(existeHoy(archivo), `${archivo} ya no está en el árbol`).toBe(true);
      expect(DESAPARECIDOS.filter((d) => nombreDe(d.archivo) === archivo)).toEqual([]);
    }
  });

  it("CONTROL POSITIVO: la inmensa mayoría de las citas resuelve — el detector no está en rojo permanente", () => {
    // La forma agregada: si el resolvedor se rompiera, esta proporción se desplomaría y se vería
    // aquí, en una línea, en vez de en un vertedero de cientos de hallazgos.
    const resuelven = CITAS.filter((c) => existeHoy(c.archivo)).length;
    expect(
      resuelven / CITAS.length,
      "más del 10% de las citas `R → test` no resuelve: antes de creerse el censo, revisa el " +
        "resolvedor",
    ).toBeGreaterThan(0.9);
  });
});

// ---------------------------------------------------------------------------
// R-1 — ninguna feature se queda sin su test en silencio
// ---------------------------------------------------------------------------

describe("R-1 — un test citado por una ficha no desaparece sin dejar constancia", () => {
  it("toda cita `R → test` a un archivo borrado está anotada con su motivo", () => {
    const sinAnotar = DESAPARECIDOS.filter((d) => !anotacionPara(d)).map(describir).sort();

    expect(
      sinAnotar,
      "estas fichas mapean un requisito a un test que EXISTIÓ y hoy no está: esos requisitos se " +
        "quedaron sin prueba y nadie lo dijo. Es lo que le pasó a la feature 161 el 2026-08-07 " +
        "—el bloque R21-R23 se fue dentro de `ChatWhatsappPanel.test.tsx` y el mensajero perdió " +
        "el tono del chat en producción—. Tres salidas, en este orden: (1) repuntar la cita al " +
        "test que hoy cubre ese requisito, (2) volver a escribir la prueba, o (3) anotar en el " +
        "mismo `tasks.md` `<!-- @test-desaparecido <archivo>: <motivo real> -->` diciendo por qué " +
        "esa feature se queda sin ella.",
    ).toEqual([]);
  });

  it("ninguna anotación `@test-desaparecido` sobrevive a su motivo", () => {
    // La otra mitad, y la que evita que en un año haya 40 anotaciones y ninguna señal.
    const caducadas = ANOTACIONES.filter((a) => existeHoy(a.archivo)).map(
      (a) => `${a.doc}:${a.linea} ${a.archivo}`,
    );
    expect(
      caducadas,
      "estas anotaciones dicen que el test desapareció, pero el archivo SÍ está en el árbol: la " +
        "excepción caducó y hay que quitarla, o la anotación deja de significar nada",
    ).toEqual([]);
  });

  it("ninguna anotación `@test-desaparecido` cuelga de una cita que ya no existe", () => {
    // Una anotación cuyo archivo ya nadie cita es basura que sobrevivió a la fila que excusaba.
    const huerfanas = ANOTACIONES.filter(
      (a) =>
        !CITAS.some((c) => c.doc === a.doc && nombreDe(c.archivo) === nombreDe(a.archivo)),
    ).map((a) => `${a.doc}:${a.linea} ${a.archivo}`);
    expect(
      huerfanas,
      "estas anotaciones no excusan ninguna cita de su propia ficha: o el mapa `R → test` cambió " +
        "y la anotación sobra, o el nombre del archivo está mal escrito y no está excusando nada",
    ).toEqual([]);
  });

  it("CONOCIDO-POSITIVO sintético: una excepción temporal caduca en cada una de sus tres condiciones", () => {
    const commit = "0000000 2026-01-01 commit inventado para la caducidad";
    const vivo = "useTonoAlIncrementar.test.tsx";
    const muerto = "ChatWhatsappPanel.test.tsx";
    const base = { ficha: "SL-13", retira: "SL-27", motivo: MOTIVO_459 };
    const citas = citasDe("specs/x/design.md", [`| R1 | \`${muerto}\` |`, `| R2 | \`${vivo}\` |`].join("\n"));
    const borrados = new Map<string, Borrado>([
      [muerto, { ruta: `tests/components/${muerto}`, commit }],
      [vivo, { ruta: `tests/viejo/${vivo}`, commit }],
    ]);
    // La que hace falta: citada, borrada en la historia y ausente del árbol.
    expect(excepcionesCaducadas([{ doc: "specs/x/design.md", archivo: muerto, ...base }], citas, borrados, existeHoy)).toEqual([]);
    // El archivo vuelve a existir.
    expect(
      excepcionesCaducadas([{ doc: "specs/x/design.md", archivo: vivo, ...base }], citas, borrados, existeHoy).join("\n"),
    ).toMatch(/vuelve a existir/);
    // El documento ya no lo cita.
    expect(
      excepcionesCaducadas([{ doc: "specs/otro/design.md", archivo: muerto, ...base }], citas, borrados, existeHoy).join("\n"),
    ).toMatch(/ya no lo cita/);
    // El borrado ya no está en la historia.
    expect(
      excepcionesCaducadas([{ doc: "specs/x/design.md", archivo: muerto, ...base }], citas, new Map(), existeHoy).join("\n"),
    ).toMatch(/ya no está en la historia/);
    // Y sin la ficha que la retira, tampoco vale.
    expect(
      excepcionesCaducadas([{ doc: "specs/x/design.md", archivo: muerto, ...base, retira: "" }], citas, borrados, existeHoy).join("\n"),
    ).toMatch(/la que la retira/);
  });

  it("ninguna excepción temporal sobrevive a su motivo (D4 de SL-13)", () => {
    const caducadas = excepcionesCaducadas(EXCEPCIONES_TEMPORALES, CITAS, BORRADOS, existeHoy);
    expect(
      caducadas,
      "estas excepciones temporales ya no hacen falta, o no dicen quién las retira: quítalas de " +
        "`EXCEPCIONES_TEMPORALES` (si SL-27 retiró los specs, o se aplanó la historia, es lo esperado)",
    ).toEqual([]);
  });
});
