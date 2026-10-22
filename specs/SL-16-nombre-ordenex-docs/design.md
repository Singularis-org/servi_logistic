# SL-16 — Diseño

## Lo que ya existe

Busqué en el board (`feature_list.json`, todos los estados), en `specs/` y en el código. El MCP del
grafo no estaba entre mis herramientas, así que el código lo busqué con Grep. Términos buscados:
`Ordenex`, `ordx_`, `docs/api`, `docs/ayuda`, `postman`, `DESIGN.md`, `design-whatsapp`,
`design-notificaciones`, `.design-work`, `marca`, `Servi Logistic`, `NOMBRE_MARCA` y `EMPRESA`.

| Dónde | Qué apareció | Relación con SL-16 |
|---|---|---|
| Board | **SL-15** `nombre-ordenex-codigo` | Repartido por el humano (decisiones P2, P3 y P4). SL-15 fija el término de `EMPRESA.nombre`, renombra los rótulos con sus citas de ayuda y renombra las cabeceras y los prefijos. SL-16 se queda con los 6 archivos de OpenAPI. |
| Board | **SL-14** `dominio-a-configuracion` | Tocan los mismos archivos de `docs/api/`. SL-16 no toca el dominio, que queda como excepción temporal de SL-14. |
| Board | **SL-13** `fuera-nuform` | Hay referencias al integrador en `design-notificaciones/` y `design-whatsapp/`. SL-16 no toca esas líneas. Al retirar `notificaciones-ordenex.html` y `.design-work/`, a SL-13 le quedan menos archivos. |
| Board | **SL-27** «Retirar los specs/ heredados de Ordenex» | Retira también la historia del origen que cuentan `docs/limpieza-ordenex.md`, `docs/plan-saas.md` y `docs/marca.md`. Aquí son una excepción temporal de la clase «historia». |
| Board | **SL-8** | Fija «Servi Logistic» en login, layout y landing, y los tokens de color. Los tokens de `DESIGN.md` cambian con SL-8. |
| `specs/` | Ningún spec `SL-*` toca estos artefactos. Los heredados (266, 257, 455, 283, 409, 410 y 474–476) citan la colección, las maquetas o `.design-work/` | No se editan: son historia. |
| Código | `leerCatalogoAyuda` (`lib/ayuda/catalogo.ts`), `quitarComentarios` (`tests/fixtures/sin-comentarios.ts`) y el patrón de excepciones con caducidad de `tests/unit/guards/nombres-wallet-461.guardia.test.ts` | Se reutilizan. No hay ninguna constante de marca ni `EMPRESA.nombre` en el código: 0 resultados. Esa constante la crea SL-15. |

## Evidencia: quién lee cada artefacto

Medido con Grep el 2026-10-21, sin contar `specs/`, `node_modules/` ni `.next/`.

**`docs/ayuda/**`: la app lo lee en producción.** Sale de cuatro sitios:
- `lib/ayuda/catalogo.ts:40` (`path.join(process.cwd(), "docs", "ayuda")`);
- `next.config.ts:59-60` (`outputFileTracingIncludes: { "/**": ["./docs/ayuda/**/*.md"] }`);
- `app/(app)/layout.tsx:209`, el módulo `/ayuda`;
- el asistente.

Además lo leen por ruta estos tests:
- `tests/unit/asistente/{contexto-documental,contexto-457,contexto-458,contexto-461,acotamiento-por-rol}.test.ts`;
- `tests/unit/guards/{asistente-sin-frontmatter,ayuda-render-sin-filtracion,ayuda-pantalla-ruta-existe,nombres-estado-retirados,nombres-wallet-461}.guardia.test.ts`;
- `tests/unit/api/changelog-455.test.ts`.

Hay 164 apariciones del nombre en 12 archivos, la mayoría en `oficina/wallet-caja.md` (93),
`tienda/mi-wallet.md` (36) y `oficina/wallet-tiendas.md` (21). Casi todas son de operador («lo que
Ordenex les debe a las tiendas», «la ganancia de Ordenex»), o citas de rótulos con «Ordenex».

**`docs/api/api-key-openapi.yaml`: espejo textual de `lib/api/openapi-spec.ts`.**
- Lo leen 18 archivos de `tests/unit/api/openapi-*.test.ts` y `tests/unit/guards/openapi-canal-rutas-reales.guardia.test.ts`.
  `openapi-406-evidencias-url.test.ts:116` compara una descripción palabra por palabra.
- Apariciones en el YAML (con su línea en TS):

  | Qué | YAML | TS | Clase prevista |
  |---|---|---|---|
  | `title` | l. 6 | l. 117 | plataforma |
  | Comentario de cabecera | l. 1 | — | plataforma |
  | «lo que Ordenex ENVÍA al callback» | l. 719 | l. 899, 955 | plataforma: el webhook lo emite el sistema |
  | «Los CINCO conceptos que Ordenex factura» | l. 1322 | l. 1478 | operador |
  | «Ordenex puede retirar una provincia» | l. 1944 | l. 1998 | plataforma: la geografía del país la dispone la plataforma (`docs/plan-saas.md` dec. 5) |
  | Dominio | l. 961 | l. 1165 | SL-14 |
  | `ordx_` | 2 | 2 | SL-15 |

**`docs/api/CHANGELOG.md`.** Lo leen `openapi-266`, `openapi-320`, `openapi-374`, `openapi-405`,
`openapi-406` y `openapi-454`. Tiene 12 líneas con el nombre:
- dominio: l. 360, 368 y 1319;
- cabeceras: l. 387, 668, 690 y 1326;
- nombre: l. 572, 685, 1093 y 1108;
- ruta de la colección: l. 710.

Además tiene 5 líneas con `ordx_`.

**Colección de Postman.** `openapi-266-habilitar.test.ts:158-166` y `openapi-320-eliminar.test.ts:241-249`
la parsean por su nombre de archivo. Dentro lleva «Ordenex» en `info.name` y `ordx_` en 2 sitios.

**`docs/api/guia-integracion/`.** `openapi-466-descripciones.test.ts:82` lee el HTML. Tiene 47 líneas
con el nombre, de las que 13 llevan dominio o cabecera, y 10 líneas con `ordx_`. El `README.md`
tiene 3 apariciones.

**`docs/api/manual-metricas-por-mensajero.md`.** Solo tiene el dominio (l. 208) y `ordx_` (2). No se
edita: sus dos excepciones las retiran SL-14 y SL-15.

**`design-notificaciones/` y `design-whatsapp/`.** Ningún test, script ni página los lee. Los citan
como «contrato visual» comentarios de unos 20 archivos (`components/shared/NotificationsBell.tsx`,
`app/(app)/configuracion/envios-whatsapp/_components/*`, `tests/unit/guards/notifications-bell-*.guardia.test.ts`…).
Tienen 19 apariciones:
- la cabecera de la app en las maquetas y «ORDENEX» como nombre de la app en `Push.dc.html`:
  plataforma;
- «Mensajes de WhatsApp que Ordenex manda solo» y el pie de los PDF de picking y tránsito: operador,
  porque los manda la empresa a sus tiendas.

`notificaciones-ordenex.html` es una exportación publicada del lienzo, con el estado embebido en una
sola línea de JSON. No la cita nadie.

**`.design-work/`.** 16 archivos: lienzos `.dc.html`, `canvas.json`, dos `.jpg` y la exportación
`landing-ordenex-direcciones.html`. No los cita ningún archivo fuera de `specs/283-quitador-comentarios/`,
que es historia. Se retira por decisión del humano (P5).

**`DESIGN.md`.** Ningún test lo lee, y 48 archivos de código y de test lo citan como la fuente de las
reglas de diseño. Solo nombra a Ordenex en el título.

## Por qué el alcance toca código

`docs/api/api-key-openapi.yaml` se presenta como generado, pero nada lo regenera: lo mantienen en
sincronía los tests (`openapi-canal-rutas-reales.guardia.test.ts:8-9`). Si cambia solo uno de los
dos archivos, el Swagger de `/api-docs` y el YAML dicen cosas distintas. Por eso cambian en el mismo
commit, junto con el `<title>` de `app/api-docs/route.ts:12` (R15, R16). Los tests que vigilan ese
contrato van con él (decisión P3).

## Regla de sustitución

Cada aparición de «ordenex» (en cualquier capitalización) dentro del alcance cae en una sola clase:

| Clase | Cuándo | Pasa a | Quién |
|---|---|---|---|
| **plataforma** | el software, la aplicación, la API, lo que el sistema emite o dispone | «Servi Logistic» (`SERVI LOGISTIC` en mayúsculas; `servi-logistic` en una ruta) | SL-16 |
| **operador** | quien cobra, paga, factura, debe, gana o le manda algo a una tienda o a un cliente | el término de transición de SL-15 para `EMPRESA.nombre`, escrito a mano | SL-16 |
| **dominio** | el dominio de la marca anterior | **corregido el 2026-10-22:** SL-14 se lo dejó a SL-16 en `docs/api/` → pasa a `example.com` (R22); sin excepción | SL-16 |
| **identificador** | `X-Ordenex-Signature`, `X-Ordenex-Timestamp`, `ordx_` | **corregido el 2026-10-22:** SL-15 ya los renombró → los docs dicen `X-Servi-Logistic-*` y `svl_` / `svl_whsec_`, como el código; sin excepción | SL-16 |
| **cita** | solo en `docs/ayuda/**`: el fragmento entre `«»`, `**`, comillas, backticks o título existe literalmente en el código de `app/`, `components/` o `lib/` (sin comentarios y con los espacios colapsados) | **corregido el 2026-10-22:** SL-15 ya cambió los rótulos → la ayuda cita el rótulo nuevo; sin excepción. Una cita cuyo rótulo siga en el código con la palabra es un hallazgo, no una excepción | SL-16 |
| **historia** | cualquier aparición en `docs/limpieza-ordenex.md`, `docs/plan-saas.md` o `docs/marca.md` (el archivo entero), y la ruta de `docs/limpieza-ordenex.md` | queda; excepción temporal | SL-27 |

Cómo aplicarla:
- El implementer clasifica midiendo. Cada fragmento que proponga como «cita» lo busca en el código, y
  si no está, no es cita. Cuando la frase no deja claro si es «plataforma» u «operador», lo anota en
  `progress/impl_SL-16.md` con la frase entera para que el reviewer lo vea. No lo decide en silencio.
- Si SL-15 ya cambió un rótulo o un identificador cuando se implemente SL-16, el doc pasa a decir lo
  que dice el código, y esa excepción no se escribe.
- La concordancia se ajusta a mano: el término de la empresa puede llevar artículo («la empresa») y
  «Ordenex» no.
- Los literales de los tests se cambian a mano, nunca derivándolos de su fuente
  (`.claude/memory/asercion-contra-su-propia-fuente.md`).
- En un documento de `docs/ayuda/**` que cambie, el campo `actualizado` del frontmatter pasa a la
  fecha del cambio.
- `CHANGELOG.md` no recibe ninguna entrada nueva. Su convención deja fuera los cambios que el
  integrador no puede observar, y el texto de una descripción no lo es.

## Alcance de la guardia

`tests/unit/guards/docs-marca-heredada.guardia.test.ts` recorre esta lista cerrada:
- Carpetas, de forma recursiva: `docs/api/`, `docs/ayuda/`, `design-notificaciones/` y
  `design-whatsapp/`.
- Archivos:
  - `DESIGN.md`;
  - `lib/api/openapi-spec.ts`;
  - `app/api-docs/route.ts`;
  - `tests/unit/guards/openapi-canal-rutas-reales.guardia.test.ts`;
  - cada `tests/unit/api/openapi-*.test.ts`;
  - `docs/limpieza-ordenex.md`, `docs/plan-saas.md` y `docs/marca.md`, que se recorren con una
    excepción de la clase «historia» por archivo, temporal y atada a SL-27 (decisión Q3).

En esos tres documentos se recorre todo el archivo, pero ninguna aparición cuenta mientras su
excepción siga viva. Caducan igual que las demás (R12):
- cuando SL-27 retire la historia del origen y el archivo ya no tenga la palabra, su excepción
  sobra;
- si el archivo se borra, también.

En los dos casos la guardia se pone roja y pide quitar la excepción. La ruta de
`docs/limpieza-ordenex.md` (R5) cae bajo la misma excepción.

## La guardia

Es una lectura estática. `pnpm exec vitest run guard` la selecciona por su ruta.

```ts
/** La palabra se arma por partes, para que la guardia no sea ella misma una aparición. */
const PALABRA = ["orden", "ex"].join("");
const PREFIJO_LLAVE = ["ord", "x_"].join("");

type Clase = "dominio" | "identificador" | "cita" | "historia";
/** `texto` para dominio, identificador y cita; `archivo` para historia (cubre el archivo entero). */
interface Excepcion { clase: Clase; texto?: string; archivo?: string; retira: `SL-${number}`; fuente?: string }

/** Cada excepción es temporal y lleva la ficha que la retira (R9). Se miden al implementar. */
// Corregido el 2026-10-22: SL-14 y SL-15 están integradas. No quedan excepciones de dominio,
// identificador ni cita; las tres clases se ejercen solo en las contrapruebas sintéticas.
// La palabra puede tomarse de `tests/fixtures/nombre-heredado.ts` (`NOMBRE_HEREDADO`), que dejó SL-15.
const EXCEPCIONES: readonly Excepcion[] = [
  { clase: "historia", archivo: "docs/limpieza-….md", retira: "SL-27" },
  { clase: "historia", archivo: "docs/plan-saas.md", retira: "SL-27" },
  { clase: "historia", archivo: "docs/marca.md", retira: "SL-27" },
  /* … */
];

/** El término de transición que hereda de SL-15, escrito a mano (R7). */
const TERMINO_EMPRESA = "/* el de specs/SL-15-*/requirements.md */";

export function apariciones(texto: string, archivo: string): Hallazgo[];
```

1. **Detector (R8, R13).** En cada archivo se tapan las excepciones con un relleno de la misma
   longitud, para que no se muevan las líneas. Las citas se tapan solo en `docs/ayuda/**`, y se
   buscan con una regex en la que cada espacio vale `\s+`, porque el Markdown parte las líneas.
   Después se buscan `PALABRA` (sin distinguir mayúsculas) y `PREFIJO_LLAVE`. Cada hallazgo se
   informa con su archivo, su línea y unos 40 caracteres de contexto.
2. **Rutas (R5).** Ninguna ruta relativa de un archivo recorrido contiene `PALABRA`.
3. **Toda excepción tiene dueño (R9).** `retira` tiene la forma `SL-<n>` y `clase` es una de las tres.
   Una excepción sin ficha no compila (es el tipo) y, además, se afirma en ejecución.
4. **Identificadores en lockstep (R10).** Cada identificador exceptuado existe en su `fuente`. El día
   que SL-15 lo renombre, la guardia se pone roja hasta que los docs citan el nombre nuevo y la
   excepción se retira.
5. **Citas en lockstep (R11).** Cada cita exceptuada existe en algún `.ts` o `.tsx` de `app/`,
   `components/` o `lib/`, leído con `quitarComentarios` y con los espacios colapsados.
6. **Caducidad (R12).** Una excepción que ya no aparece en ningún archivo del alcance pone la guardia
   en rojo y pide retirarla. Así, cuando SL-14 y SL-15 terminen, la lista queda vacía y no puede
   quedarse nada permanente.
7. **Operador (R7).** Una tabla escrita a mano, `FRASES_OPERADOR`, tiene la forma final de cada frase
   de operador que cambió (medida en T1) con el archivo donde está. Para cada una se afirma lo
   siguiente:
   - el archivo la contiene;
   - la frase contiene `TERMINO_EMPRESA`;
   - la frase no contiene «Servi Logistic».

   Además se importa `EMPRESA` del módulo donde lo deja SL-15 y se afirma que
   `EMPRESA.nombre === TERMINO_EMPRESA` (decisión Q2; **corregido el 2026-10-22:** el módulo es
   `lib/config/marca.ts` y el campo es `EMPRESA.enFrase` = «la empresa», con `EMPRESA.alInicio` para
   el inicio de frase). Si SL-15 cambia el término, los docs tienen
   que cambiar en el mismo commit. Que la ayuda muestre el nombre real de cada empresa queda para la
   fase 2, con SL-17.
8. **Anti-vacuidad (R14).** Cada raíz del alcance existe, y el número de archivos recorridos es mayor
   o igual que un suelo firmado con el número medido. Si se baja, se baja a mano y con el motivo,
   como `MINIMO_RUTAS` en `openapi-canal-rutas-reales.guardia.test.ts`.
9. **Contrapruebas (R14).** `apariciones()` se prueba sobre textos sintéticos escritos a mano:

   | Texto | Resultado |
   |---|---|
   | «Ayuda de » + PALABRA | 1 |
   | el dominio en una URL | 0 |
   | una cabecera exceptuada | 0 |
   | `PREFIJO_LLAVE` sin exceptuar | 1 |
   | una cita registrada partida en dos líneas | 0 |
   | la misma cita con una palabra cambiada | 1 |
   | la palabra en mayúsculas | 1 |
   | la palabra en un archivo con excepción de historia | 0 |
   | la misma palabra en otro archivo | 1 |

Además, con literales escritos a mano:
- **R1, R3, R4:** `existsSync` de cada ruta, que debe existir (R1) o no existir (R3, R4).
- **R2:** la colección en la ruta nueva parsea, su `info.name` contiene «Servi Logistic» y la ruta
  vieja no existe.
- **R15:** los tres títulos son iguales y contienen «Servi Logistic». El del YAML se lee de la línea
  `title:` del bloque `info:`; el de la página, del `<title>` que devuelve el `GET` de
  `app/api-docs/route.ts`.
- **R16:** en cada descripción que cambia, el YAML (con los espacios colapsados) contiene la cadena
  TS de `openApiSpec` (con los espacios colapsados).
- **R18:** `leerCatalogoAyuda()` devuelve el documento índice con título «Ayuda de Servi Logistic».
- **R19:** el título de `DESIGN.md` contiene «Servi Logistic», y el archivo contiene `docs/marca.md`
  y `SL-8`.

Lo que no prueba la guardia:
- **R17:** lo prueban `openapi-266-habilitar.test.ts` y `openapi-320-eliminar.test.ts` con la ruta
  nueva.
- **R20:** lo verifica el reviewer sobre el diff.
- **R21:** es `./init.sh`.

## Cambios por archivo

| Archivo | Cambio |
|---|---|
| `docs/ayuda/**` (12) | Plataforma → «Servi Logistic»; operador → el término. Las citas quedan como excepción. Se actualiza `actualizado`. |
| `docs/api/api-key-openapi.yaml` y `lib/api/openapi-spec.ts` | Las mismas frases en los dos, según la tabla de Evidencia. |
| `app/api-docs/route.ts` | `<title>`. |
| `docs/api/CHANGELOG.md` | Las clases plataforma y operador, y la ruta de la colección (l. 710). |
| `docs/api/ordenex-api-key.postman_collection.json` → `servi-logistic-api-key.postman_collection.json` | `git mv` y `info.name`. |
| `docs/api/guia-integracion/README.md` y `guia-integracion.html` | Plataforma y operador. |
| `design-notificaciones/Push.dc.html` y los 8 `.dc.html` de `design-whatsapp/` con apariciones | Plataforma y operador, sin tocar las líneas que nombran al integrador. |
| `design-notificaciones/notificaciones-ordenex.html` | Se borra. |
| `.design-work/` | Se borra la carpeta. |
| `DESIGN.md` | Título `# DESIGN.md — Servi Logistic` y una nota que remite a `docs/marca.md` y a SL-8. |
| `tests/unit/api/openapi-266-habilitar.test.ts` y `openapi-320-eliminar.test.ts` | La ruta de la colección. |
| `tests/unit/api/openapi-405-gestiones.test.ts` y `openapi-webhook-estado-actualizado.test.ts` | El nombre del test (c), que es de operador, y los comentarios. Los identificadores quedan. |
| `tests/unit/guards/openapi-canal-rutas-reales.guardia.test.ts` | Comentarios: la ruta de la colección (l. 10 y 52) y «SALIENTE de Ordenex» (l. 58, plataforma). |
| `tests/unit/asistente/contexto-*.test.ts` | Solo los literales de texto que cambió SL-16. Los de las citas de SL-15 quedan. |
| `tests/unit/guards/docs-marca-heredada.guardia.test.ts` | Nuevo. |

## Modelo de datos, autorización y país

No aplica:
- No se crean tablas, columnas ni RLS, y no hay migraciones ni `down.sql`.
- `/api-docs` y `/api/docs/openapi` conservan su control de acceso de `middleware.ts`; solo cambia
  el texto.
- Ningún dato depende del país: lo que estos docs dicen de Costa Rica no se toca (R20).

## Dependencias

Ninguna librería nueva: `node:fs`, `node:path`, `vitest` y `tests/fixtures/`.

## Alternativas descartadas

1. **Retirar `docs/api/` entero, porque todavía no hay integradores.** Pondría en rojo 18 archivos de
   `tests/unit/api/openapi-*` y la guardia del canal, y dejaría `lib/api/openapi-spec.ts` y
   `/api-docs` sin su espejo. El canal sigue existiendo en el código, así que también su
   documentación.
2. **Retirar `design-notificaciones/` y `design-whatsapp/`.** Dejaría colgando los comentarios de unos
   20 archivos que los citan como contrato visual (por ejemplo, el ancho de 400 px de
   `notifications-bell-ancho.guardia.test.ts`), y esos comentarios son código de SL-15. Renombrar son
   19 palabras. `.design-work/` sí se retira: nadie fuera de `specs/` lo cita.
3. **Retirar `DESIGN.md`.** `docs/marca.md` no tiene las reglas que cita el código (anillo de foco,
   tokens que giran, prosa de 65–75ch), y quedarían 48 citas colgando.
4. **Poner «Servi Logistic» también donde habla el operador.** Era la propuesta de la primera versión
   de este spec, y el humano la descartó (P1). En el SaaS, quien cobra es cada empresa: la ayuda le
   diría a una tienda que le debe dinero a la plataforma.
5. **Un marcador `{{empresa}}` en la ayuda, que se resuelva al pintar con el nombre real de cada
   empresa.** Es lo correcto en la fase 2, pero obliga a tocar `lib/ayuda/`, el render y el asistente,
   y depende de `organizacion` (SL-17), que todavía no existe. Aquí basta el término de transición
   como literal; el nombre real de cada empresa va a la fase 2, junto a SL-17 (decisión Q2).
8. **Dejar `docs/limpieza-ordenex.md`, `docs/plan-saas.md` y `docs/marca.md` fuera del recorrido.**
   Era la propuesta anterior. El humano la descartó (Q3): un archivo que la guardia no recorre puede
   acumular el nombre sin que nadie lo vea. Con la excepción de historia, que caduca, esos docs
   quedan vigilados hasta que SL-27 los limpie.
6. **Excepciones permanentes para el dominio y los identificadores.** Las prohíbe el humano. Además
   dejarían «Ordenex» para siempre en cuanto SL-14 o SL-15 olvidaran tocar los docs. La caducidad de
   R12 obliga a cerrarlas.
7. **Sin guardia, con un `git grep` en el informe.** Dejaría R5–R14 sin test, que la trazabilidad
   exige. Tampoco protegería del rótulo que cambia sin su cita, ni del nombre que vuelve con un port
   desde Ordenex.

## Riesgos

- **Ports desde Ordenex.** Un `git apply` que toque la colección o una línea renombrada fallará y
  habrá que resolverlo a mano. Si el parche trae el nombre de vuelta, la guardia lo detecta.
- **Orden respecto de SL-15.** Si SL-16 se integra primero, nacen las excepciones de identificador y
  de cita, y SL-15 tendrá que retirarlas: la guardia se lo pide. Si SL-15 se integra primero, esas
  excepciones no se escriben. El implementer mide antes de escribirlas.
- **Clasificación plataforma u operador.** Hay frases que admiten las dos lecturas. Se anotan una a
  una en el impl para que el reviewer las vea, en vez de decidirlas en silencio.
- **Specs heredados con la ruta vieja de la colección o de `.design-work/`.**
  `test-citado-desaparecido` solo mira tests, así que no se pone rojo.
