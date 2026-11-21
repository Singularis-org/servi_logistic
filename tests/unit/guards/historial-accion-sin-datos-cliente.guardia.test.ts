import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { quitarComentarios } from "../../fixtures/sin-comentarios";
import { HISTORIAL_ACCION_TIPOS } from "@/lib/types/historial-accion";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// FICHA 362 / T7.4 (R5) — NI UN DATO DE CLIENTE, NI UN TEXTO LIBRE, EN LA FILA DEL REGISTRO.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// QUE PROTEGE. `historial_accion` se consulta desde una pantalla, se DESCARGA a un archivo y no
// tiene purga (R39): lo que entre ahi se queda para siempre y sale de la casa en un `.xlsx`. Por
// eso la fila no puede llevar el nombre, el telefono, la direccion ni el correo del destinatario
// de una orden, NI NINGUN TEXTO LIBRE escrito por una persona —el `motivo` de un rechazo es el
// vector canonico: «rechazado porque el cliente Juan Perez no estaba»—.
//
// Y TAMPOCO SECRETOS: ni `passwordHash`, ni `keyHash`, ni el prefijo de una API key.
//
// DONDE SE BARRE, y por que ahi:
//   - `etiquetaDeEntidad` (`lib/types/historial-accion-etiquetas.ts`): es la FUENTE UNICA de la
//     columna `entidad_etiqueta`. Si el vocabulario prohibido no aparece aqui, no puede llegar a
//     la columna por la via normal;
//   - los BLOQUES `appendAccion(...)` de los 43 puntos de escritura: es la via anormal — pasar la
//     etiqueta a mano, o meter la direccion en `valorNuevo`. Se recorta el bloque de la llamada,
//     no el metodo entero: el `data` del `UPDATE` de `corregirDatosCliente` SI escribe la
//     direccion, y eso es su trabajo.
//
// EL DETECTOR SE AUTO-PRUEBA (bloque 0), porque una guardia estatica rota no falla: CALLA.
//
// SLT-221 (D10) — UNA EXCEPCION DECLARADA, Y NINGUNA MAS SIN PASAR POR AQUI. Carlos pidio que el
// cambio de cedula y el de correo de un usuario queden en el Historico con el valor anterior y el
// nuevo («es importante»). CONSECUENCIA ACEPTADA (2026-11-19): el Historico se descarga y no se purga,
// asi que el correo y la cedula anteriores de un usuario quedan ahi PARA SIEMPRE. La excepcion es por
// archivo y por tipo (`EXCEPCIONES_DECLARADAS`): solo se salta la entrada cuyo `accion:` esta en la
// lista; el resto del archivo —incluidas las entradas hermanas del mismo lote— se sigue barriendo.
// Para eso el barrido mira, ademas de los bloques `appendAccion(...)`, cada OBJETO DE ENTRADA
// (`{ accion: "<tipo>", ... }`) aunque se arme fuera de la llamada (`entradas.push({...})`).
//
// SLT-121 (decision P5, 2026-11-20) — LA SEGUNDA EXCEPCION DECLARADA, y la primera de TEXTO LIBRE: el
// motivo con el que el superadmin descongela a mano una empresa congelada por mora va en `valor_nuevo`
// de `empresa_descongelada_a_mano` («hasta AAAA-MM-DD — <motivo>»), recortado a 200 caracteres. La base
// no lo guarda en otro sitio (design §2.4): sin esto, la fila no diria por que se descongelo. Solo ese
// tipo y solo en `MoraEmpresaRepository.ts`. CONDICION: Carlos Restrepo la acepta en la review del PR de
// SLT-121; si no la acepta, se quita de aqui y el motivo no entra en la fila.
//
// La selecciona `pnpm exec vitest run guard` por el nombre del archivo.

const RAIZ = path.resolve(__dirname, "../../..");

/**
 * ⚠️ EL VOCABULARIO PROHIBIDO. Cada nombre es una columna real de este esquema que contiene un
 * dato de una persona, un texto libre o un secreto.
 *
 * `concepto` NO esta, y es la unica excepcion, declarada y razonada: la etiqueta de un
 * `gasto_fijo_cobro` lo usa, y es una etiqueta de CATALOGO copiada de la plantilla de un gasto
 * recurrente de la casa —del mismo genero que el nombre de una zona—, no un texto por
 * transaccion. Su justificacion vive junto a su entrada del mapa de etiquetas.
 */
const PROHIBIDO = [
  "destinatario",
  "telefonoDest",
  "telefono_dest",
  "direccion",
  "email",
  "cedula",
  "notas",
  "motivoRechazo",
  "motivo_rechazo",
  "passwordHash",
  "password_hash",
  "keyHash",
  "key_hash",
  "keyPrefix",
  "key_prefix",
  "secret",
  "descripcion",
] as const;

/** `motivo` a secas, sin pegarse a `motivoRechazo` (que ya esta arriba). */
const MOTIVO_SUELTO = /\bmotivo\b/;

/** Los archivos con al menos un `appendAccion`, que son los 43 puntos de escritura. */
const PUNTOS_DE_ESCRITURA = [
  "lib/repositories/OrdenRepository.ts",
  // ⭑ FICHA 371. Su bloque `appendAccion` lleva las DOS fechas en `valorAnterior`/`valorNuevo`, y
  // ese es justo el sitio por el que un dia entraria el motivo escrito por una persona: el motivo
  // de esta correccion vive en su tabla propia (`gestion_fecha_reprogramacion_cambio`), que no se
  // descarga, y NO puede cruzarse a esta.
  "lib/repositories/CorreccionFechaReprogramacionRepository.ts",
  "lib/repositories/UserRepository.ts",
  "lib/repositories/TarifaRepository.ts",
  "lib/repositories/ZonaRepository.ts",
  // SL-42 (P1) — `VehiculoRepository` estuvo aqui hasta que se retiro el borrado: sus escrituras van
  // a `vehiculo_rastro` y ya no llama a `appendAccion` («sin escritor desde SL-42»).
  "lib/repositories/PlantillaMensajeRepository.ts",
  "lib/repositories/ApiKeyRepository.ts",
  "lib/repositories/AprobacionPostulacionRepository.ts",
  "lib/repositories/CierresAdminRepository.ts",
  "lib/repositories/CierresBodegaAdminRepository.ts",
  "lib/repositories/LiquidacionPagoRepository.ts",
  "lib/repositories/LiquidacionRepartoRepository.ts",
  "lib/repositories/WalletMovimientoRepository.ts",
  "lib/repositories/IncidenteAdminRepository.ts",
  "lib/repositories/GastoFijoCobroRepository.ts",
  "lib/repositories/RechazoTiendaCobroRepository.ts",
  "lib/repositories/RankingSnapshotRepository.ts",
  // FICHA 374 — `GeoRepository` estuvo aqui hasta SL-20, que mudo su registro al historial de
  // PLATAFORMA (`appendAccionPlataforma`, R35): ya no llama a `appendAccion`. Lo vigila
  // `historial-accion-escrituras-cubiertas` («sin escritor desde SL-20»).
  // SL-36 (R33). Sus cinco bloques llevan el NOMBRE del servicio y, en la prueba, el codigo del
  // catalogo: ni la credencial, ni su cifrado, ni el numero de WhatsApp, ni el texto del proveedor.
  "lib/repositories/IntegracionRepository.ts",
  // SLT-121 (R30). `MoraEmpresaRepository` lleva la excepcion P5 (el motivo del descongelamiento a mano); sus
  // otras dos filas y las de `mora-recalcular` no llevan texto libre, y se barren como las demas.
  "lib/repositories/MoraEmpresaRepository.ts",
  "lib/planes/mora-recalcular.ts",
] as const;

const FUENTE_ETIQUETAS = "lib/types/historial-accion-etiquetas.ts";

/**
 * El archivo de una excepcion cuyo escritor aun no existe. En cuanto exista, entra en
 * `PUNTOS_DE_ESCRITURA` y la excepcion pierde `escritorPendiente` (lo exige el ultimo test). Vacia desde
 * SLT-121 T2.4, que escribio `MoraEmpresaRepository.descongelarAMano`.
 */
const ARCHIVOS_CON_ESCRITOR_PENDIENTE: readonly string[] = [];

interface ExcepcionDeclarada {
  archivo: (typeof PUNTOS_DE_ESCRITURA)[number];
  accion: string;
  motivo: string;
  /** La tarea que escribira la entrada, mientras aun no exista. */
  escritorPendiente?: string;
}

/** SLT-221 (D10) y SLT-121 (P5): las unicas entradas que pueden llevar un dato de persona o texto libre. Ver la cabecera. */
const EXCEPCIONES_DECLARADAS: readonly ExcepcionDeclarada[] = [
  {
    archivo: "lib/repositories/UserRepository.ts",
    accion: "usuario_cedula_cambiada",
    motivo: "SLT-221 D4/D10: la cedula anterior y la nueva de un usuario de la empresa; descargable y sin purga, aceptado",
  },
  {
    archivo: "lib/repositories/UserRepository.ts",
    accion: "usuario_email_cambiado",
    motivo: "SLT-221 D4/D10: el correo anterior y el nuevo de un usuario de la empresa; descargable y sin purga, aceptado",
  },
  {
    archivo: "lib/repositories/MoraEmpresaRepository.ts",
    accion: "empresa_descongelada_a_mano",
    motivo:
      "SLT-121 P5: el motivo del descongelamiento a mano, recortado a 200; Carlos Restrepo la acepta en la review del PR",
  },
];

function fuente(rel: string): string {
  return quitarComentarios(readFileSync(path.join(RAIZ, rel), "utf8"));
}

/**
 * Los bloques `appendAccion(...)` de un archivo, recortados desde la llamada hasta el cierre de
 * su array de entradas. Uno por llamada.
 */
export function bloquesDeAppend(codigo: string): string[] {
  const salida: string[] = [];
  let desde = 0;
  for (;;) {
    const i = codigo.indexOf("appendAccion(", desde);
    if (i === -1) break;
    // El cierre es el `]);` o el `),` de la forma con `map(...)`: se toma el primero que aparezca
    // despues, y si no hay ninguno, un tope de caracteres para no arrastrar el archivo entero.
    const finArray = codigo.indexOf("]);", i);
    const finMap = codigo.indexOf("})),", i);
    const candidatos = [finArray, finMap].filter((n) => n !== -1);
    const fin = candidatos.length > 0 ? Math.min(...candidatos) + 3 : Math.min(i + 1200, codigo.length);
    salida.push(codigo.slice(i, fin));
    desde = fin;
  }
  return salida;
}

interface BloqueDeEntrada {
  accion: string;
  desde: number;
  hasta: number;
  texto: string;
}

/**
 * SLT-221 — los objetos de entrada del Historico de un archivo: el `{ ... }` que encierra cada
 * `accion: "<tipo del catalogo>"`, se arme dentro de `appendAccion(...)` o fuera (`entradas.push`).
 */
export function bloquesDeEntrada(codigo: string): BloqueDeEntrada[] {
  const tipos = new Set<string>(HISTORIAL_ACCION_TIPOS);
  const salida: BloqueDeEntrada[] = [];
  for (const m of codigo.matchAll(/\baccion:\s*"([a-z_]+)"/g)) {
    if (!tipos.has(m[1]) || m.index === undefined) continue;
    let desde = m.index;
    for (let prof = 0; desde > 0; desde--) {
      const ch = codigo[desde - 1];
      if (ch === "}") prof++;
      else if (ch === "{" && prof-- === 0) break;
    }
    desde--;
    let hasta = desde;
    for (let prof = 0; hasta < codigo.length; hasta++) {
      if (codigo[hasta] === "{") prof++;
      else if (codigo[hasta] === "}" && --prof === 0) break;
    }
    salida.push({ accion: m[1], desde, hasta: hasta + 1, texto: codigo.slice(desde, hasta + 1) });
  }
  return salida;
}

/** El codigo sin las entradas exceptuadas de ese archivo: lo demas se barre igual. */
export function sinExcepciones(codigo: string, exceptuadas: readonly string[]): string {
  const fuera = bloquesDeEntrada(codigo).filter((b) => exceptuadas.includes(b.accion));
  let salida = codigo;
  for (const b of [...fuera].sort((x, y) => y.desde - x.desde)) {
    salida = salida.slice(0, b.desde) + "{}" + salida.slice(b.hasta);
  }
  return salida;
}

/** Hallazgos de un archivo: bloques `appendAccion` y objetos de entrada, sin las excepciones dadas. */
export function hallazgosDe(rel: string, codigo: string, exceptuadas: readonly string[]): string[] {
  const limpio = sinExcepciones(codigo, exceptuadas);
  const deAppend = bloquesDeAppend(limpio).flatMap((bloque, i) =>
    prohibidosEn(bloque).map((nombre) => `${rel} (llamada ${i + 1}): ${nombre}`),
  );
  const deEntradas = bloquesDeEntrada(limpio).flatMap((b) =>
    prohibidosEn(b.texto).map((nombre) => `${rel} (entrada ${b.accion}): ${nombre}`),
  );
  return [...new Set([...deAppend, ...deEntradas])];
}

function exceptuadasDe(rel: string): string[] {
  return EXCEPCIONES_DECLARADAS.filter((e) => e.archivo === rel).map((e) => e.accion);
}

/** Los nombres prohibidos que aparecen en un texto. */
export function prohibidosEn(texto: string): string[] {
  const hallazgos = PROHIBIDO.filter((nombre) =>
    new RegExp(`\\b${nombre}\\b`).test(texto),
  ) as string[];
  if (MOTIVO_SUELTO.test(texto)) hallazgos.push("motivo");
  return hallazgos.sort();
}

// ---------------------------------------------------------------------------------------------
// 0 — El detector, probado contra respuestas conocidas
// ---------------------------------------------------------------------------------------------

describe("362/T7.4 — el detector se prueba a si mismo", () => {
  it("CONTRAPRUEBA: reconoce el vocabulario prohibido", () => {
    expect(prohibidosEn("entidadEtiqueta: orden.destinatario,")).toContain("destinatario");
    expect(prohibidosEn("valorNuevo: data.direccion,")).toContain("direccion");
    expect(prohibidosEn("valorAnterior: cierre.motivoRechazo,")).toContain("motivoRechazo");
    expect(prohibidosEn("entidadEtiqueta: input.motivo,")).toContain("motivo");
    expect(prohibidosEn("entidadEtiqueta: key.keyPrefix,")).toContain("keyPrefix");
    expect(prohibidosEn("entidadEtiqueta: mov.descripcion,")).toContain("descripcion");
  });

  it("CONTRAPRUEBA: NO se dispara con vocabulario inocente", () => {
    expect(prohibidosEn('entidadEtiqueta: etiquetaDeEntidad("orden", fila),')).toEqual([]);
    expect(prohibidosEn("monto: fila.totalGeneral,")).toEqual([]);
    // `motivacion` NO es `motivo`: el `\b` lo separa.
    expect(prohibidosEn("const motivacion = 1;")).toEqual([]);
  });

  it("CONTRAPRUEBA: el recortador encuentra los bloques y no el archivo entero", () => {
    // SL-42: era `VehiculoRepository`, que ya no llama a `appendAccion` (P1). Mismo molde: un solo bloque.
    const codigo = fuente("lib/repositories/PlantillaMensajeRepository.ts");
    const bloques = bloquesDeAppend(codigo);
    expect(bloques).toHaveLength(1);
    expect(bloques[0]).toContain("plantilla_eliminada");
    expect(bloques[0].length).toBeLessThan(codigo.length / 2);
  });

  it("anti-vacuidad: el censo de puntos de escritura no esta vacio y todos tienen `appendAccion`", () => {
    expect(PUNTOS_DE_ESCRITURA.length).toBeGreaterThan(15);
    for (const rel of PUNTOS_DE_ESCRITURA) {
      const bloques = bloquesDeAppend(fuente(rel));
      expect(bloques.length, `${rel} no llama a \`appendAccion\``).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// R5 — la fuente de la etiqueta
// ---------------------------------------------------------------------------------------------

describe("362/R5 — `etiquetaDeEntidad` no lee ni un dato de cliente", () => {
  it("la fuente unica de la etiqueta esta limpia de vocabulario prohibido", () => {
    const hallazgos = prohibidosEn(fuente(FUENTE_ETIQUETAS));
    expect(
      hallazgos,
      "la etiqueta CONGELADA se descarga a un archivo y no se purga nunca: lo que entre ahi sale " +
        "de la casa",
    ).toEqual([]);
  });

  it("CONTRAPRUEBA: inyectar `destinatario` en la fuente de la etiqueta se detecta", () => {
    const real = fuente(FUENTE_ETIQUETAS);
    expect(prohibidosEn(real)).toEqual([]);
    expect(prohibidosEn(`${real}\n  orden: (f) => f.destinatario,`)).toContain("destinatario");
  });

  it("control positivo: la etiqueta SI usa las fuentes admitidas", () => {
    // Si el barrido de arriba estuviera midiendo un archivo vacio, esto lo delataria.
    const real = fuente(FUENTE_ETIQUETAS);
    for (const admitido of ["numGuia", "numRemision", "mensajeroNombre", "identificador"]) {
      expect(real, `la etiqueta ya no usa \`${admitido}\``).toContain(admitido);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// R5 — las 43 llamadas al punto unico
// ---------------------------------------------------------------------------------------------

describe("362/R5 — ninguna llamada a `appendAccion` mete un dato de cliente en la fila", () => {
  it.each(PUNTOS_DE_ESCRITURA)("%s", (rel) => {
    const hallazgos = hallazgosDe(rel, fuente(rel), exceptuadasDe(rel));
    expect(
      hallazgos,
      "una columna del cliente en la fila del registro reabre D4 de la 312 de verdad, y esta vez " +
        "en una tabla que se descarga y no se purga",
    ).toEqual([]);
  });

  it("CONTRAPRUEBA: inyectar `entidadEtiqueta: orden.destinatario` en un bloque real se detecta", () => {
    const bloque = bloquesDeAppend(fuente("lib/repositories/OrdenRepository.ts"))[0];
    expect(prohibidosEn(bloque)).toEqual([]);
    const mutado = bloque.replace("entidadEtiqueta:", "entidadEtiqueta: orden.destinatario, //");
    expect(prohibidosEn(mutado)).toContain("destinatario");
  });

  it("CONTRAPRUEBA: inyectar `valorNuevo: cierre.motivoRechazo` en un bloque real se detecta", () => {
    const bloque = bloquesDeAppend(fuente("lib/repositories/CierresAdminRepository.ts"))[0];
    expect(prohibidosEn(bloque)).toEqual([]);
    const mutado = bloque.replace("monto:", "valorNuevo: cierre?.motivoRechazo, monto:");
    expect(prohibidosEn(mutado)).toContain("motivoRechazo");
  });
});

// ---------------------------------------------------------------------------------------------
// SLT-221 (D10) — la excepcion declarada para la cedula y el correo de un usuario
// ---------------------------------------------------------------------------------------------

describe("SLT-221/D10 — solo las entradas declaradas pueden llevar la cedula o el correo", () => {
  const USER_REPO = "lib/repositories/UserRepository.ts";

  it("CONTRAPRUEBA: el detector de entradas encuentra las del lote de `update`, armadas fuera de `appendAccion`", () => {
    const entradas = bloquesDeEntrada(fuente(USER_REPO));
    expect(entradas.map((b) => b.accion)).toEqual(
      expect.arrayContaining(["usuario_rol_cambiado", "usuario_zona_cambiada", "usuario_cedula_cambiada"]),
    );
    const rol = entradas.find((b) => b.accion === "usuario_rol_cambiado");
    expect(rol?.texto.startsWith("{")).toBe(true);
    expect(rol?.texto.endsWith("}")).toBe(true);
    expect(rol?.texto).not.toContain("usuario_zona_cambiada");
  });

  it("control positivo: las entradas exceptuadas SI llevan la cedula y el correo, y sin la excepcion el archivo sale en rojo", () => {
    const codigo = fuente(USER_REPO);
    const cedula = bloquesDeEntrada(codigo).find((b) => b.accion === "usuario_cedula_cambiada");
    expect(prohibidosEn(cedula?.texto ?? "")).toContain("cedula");
    const correo = bloquesDeEntrada(codigo).find((b) => b.accion === "usuario_email_cambiado");
    expect(prohibidosEn(correo?.texto ?? "")).toContain("email");
    // SLT-221 PR 2: el canje arma su entrada dentro de la llamada, asi que tambien la delata el bloque.
    expect(hallazgosDe(USER_REPO, codigo, [])).toEqual([
      `${USER_REPO} (llamada 4): email`,
      `${USER_REPO} (entrada usuario_cedula_cambiada): cedula`,
      `${USER_REPO} (entrada usuario_email_cambiado): email`,
    ]);
  });

  it("CONTRAPRUEBA: meter `email` en la entrada de `usuario_rol_cambiado` sigue en rojo aunque haya excepcion", () => {
    const codigo = fuente(USER_REPO);
    expect(hallazgosDe(USER_REPO, codigo, exceptuadasDe(USER_REPO))).toEqual([]);
    const mutado = codigo.replace(
      'accion: "usuario_rol_cambiado",',
      'accion: "usuario_rol_cambiado", valorNuevo: despues?.email,',
    );
    expect(mutado).not.toBe(codigo);
    expect(hallazgosDe(USER_REPO, mutado, exceptuadasDe(USER_REPO))).toEqual([
      `${USER_REPO} (entrada usuario_rol_cambiado): email`,
    ]);
  });

  it("cada excepcion nombra un tipo del catalogo y tiene su entrada en el archivo (o su escritor pendiente)", () => {
    const tipos = new Set<string>(HISTORIAL_ACCION_TIPOS);
    for (const e of EXCEPCIONES_DECLARADAS) {
      expect(tipos.has(e.accion), e.accion).toBe(true);
      expect(e.motivo.length).toBeGreaterThan(20);
      // SLT-121: el archivo de un escritor pendiente puede no existir todavia.
      const existe = existsSync(path.join(RAIZ, e.archivo));
      const tiene = existe && bloquesDeEntrada(fuente(e.archivo)).some((b) => b.accion === e.accion);
      expect(tiene || e.escritorPendiente !== undefined, `${e.archivo}: ${e.accion} sin entrada`).toBe(true);
      // Una excepcion «pendiente» cuyo escritor ya existe se queda vieja: quitar `escritorPendiente`.
      if (e.escritorPendiente !== undefined) expect(tiene, `${e.accion} ya tiene escritor`).toBe(false);
      // SLT-121: un archivo pendiente solo vale para una excepcion pendiente.
      if (ARCHIVOS_CON_ESCRITOR_PENDIENTE.includes(e.archivo)) {
        expect(e.escritorPendiente, `${e.archivo} ya existe: pasalo a PUNTOS_DE_ESCRITURA`).toBeDefined();
      }
      // SLT-121: una excepcion con escritor tiene que estar en el barrido; si no, no exceptua nada.
      if (e.escritorPendiente === undefined) {
        expect(PUNTOS_DE_ESCRITURA as readonly string[], `${e.archivo} fuera de PUNTOS_DE_ESCRITURA`).toContain(
          e.archivo,
        );
      }
    }
  });

  it("SLT-121 P5: la excepcion del motivo es la unica de texto libre, y solo para `empresa_descongelada_a_mano`", () => {
    const deMora = EXCEPCIONES_DECLARADAS.filter((e) => e.motivo.startsWith("SLT-121"));
    expect(deMora.map((e) => [e.archivo, e.accion])).toEqual([
      ["lib/repositories/MoraEmpresaRepository.ts", "empresa_descongelada_a_mano"],
    ]);
    // Las otras cuatro filas de la mora no llevan texto libre: si una entra aqui, rojo.
    const otrasDeMora = [
      "empresa_congelada",
      "empresa_descongelada_por_pago",
      "empresa_descongelada_por_gracia",
      "factura_dias_gracia_cambiada",
    ];
    expect(EXCEPCIONES_DECLARADAS.filter((e) => otrasDeMora.includes(e.accion))).toEqual([]);
    expect(deMora[0]?.motivo).toContain("Carlos Restrepo");
  });
});
