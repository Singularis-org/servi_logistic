# SL-15 — Diseño

## Lo que ya existe

Busqué en `feature_list.json`, en `specs/` y en el código con estos términos: «Ordenex», `ordx_`,
«marca», «nombre de la empresa», `APP_NAME`, `NOMBRE_APP`, `BRAND`, `NEXT_PUBLIC_APP` y
«Servi Logistic». El MCP `codebase-memory-mcp` no está entre las herramientas de este agente, así
que el código lo recorrí con Grep.

- **Board.** Hay fichas vecinas, pero ninguna es esta misma:
  - SL-8: texto visible de login, layout y landing. Además crea `lib/config/marca.ts` (decisión P5).
  - SL-9: capturas de la PWA.
  - SL-11 y SL-12: seeds y backfills.
  - SL-13: el integrador.
  - SL-14: el dominio de Ordenex.
  - SL-16: `docs/` y diseños; va justo después de SL-15.
  - SL-17: crea `organizacion`.

  El reparto entre ellas está en la tabla de decisiones de `requirements.md`.
- **Specs.** El de SL-10 fija los valores actuales de `public/manifest.json` en
  `pwa-manifiesto-atajos` (su R10). El de SL-8 todavía no está escrito, pero crea el módulo con la
  forma de §3. Los `specs/` de Ordenex son historia: no se reutilizan como backlog.
- **Código.** Hoy no hay módulo de marca: en `lib/config/` y `lib/constants/` no hay nada parecido.
  Estos puntos ya concentran textos, y se reutilizan tal cual, cambiando por dentro sin crear
  diccionarios nuevos:
  - `lib/constants/wallet-rotulos.ts`: los rótulos que leen la pantalla, la descarga y el servidor;
  - `lib/types/historial-accion.ts`;
  - `app/(app)/cierres-admin/_components/cierre-labels.ts`;
  - `lib/config/email.ts` (`DEFAULT_FROM_NAME`);
  - `lib/pdf/etiquetas-dibujo.ts` (`ROTULO_GUIA`);
  - `lib/utils/api-key-generator.ts` (`API_KEY_PREFIX`);
  - `lib/utils/webhook-secret-generator.ts` (`WEBHOOK_SECRET_PREFIX`).

## 1. Medición (2026-10-21)

Grep con mayúsculas exactas. Primer patrón: `Ordenex|ordenex|ORDENEX`.

| Carpeta | Archivos | Apariciones | Notas |
|---|---|---|---|
| `app/` | 67 | 437 | 8 son de SL-8: `_landing/*` (5), `page.tsx`, `layout.tsx` y `globals.css`. SL-15 barre lo que quede tras SL-8 |
| `lib/` | 155 | 552 | 3 solo tienen el dominio de Ordenex (SL-14): `config/push.ts`, `whatsapp-envios/informes/aviso-interno.ts` y `utils/linkificar.ts` |
| `components/` | 16 | 49 | `shared/Logo.tsx` es de SL-8 |
| `hooks/` | 2 | 3 | |
| `public/` | 3 | 10 | `sw.js`, `offline.html` y las etiquetas de capturas de `manifest.json` |
| `scripts/` | 6 | 21 | `seed-*` son de SL-11; `backfill-analitica.ts` es de SL-12 |
| `db/schema.prisma` | 1 | 46 (+1 `ordx_`) | Las 47 están en comentarios: ningún modelo, columna, enum ni `@map` lleva la palabra (§4) |
| `db/migrations/` | 25 (22 carpetas) | — | 19 son de SL-15. Quedan fuera los 4 del usuario maestro, que son de SL-11, y 2 de SL-13: `459`, que borra entera, y `20260827160000_orden_num_remision_unico_parcial`. Ver §2 G |
| `.github/workflows/gate.yml` | 1 | 1 | Un comentario |
| `tests/` | 336 | 1.932 | |
| `e2e/` | 3 | 5 | Solo en comentarios |

Segundo patrón: `ordx_`, en 81 archivos sin contar `docs/`:
- de producción: `lib/utils/api-key-generator.ts`, `lib/utils/webhook-secret-generator.ts`,
  `lib/api/openapi-spec.ts`, `lib/services/ApiKeyService.ts`,
  `lib/services/WebhookEstadoService.ts`, `lib/types/api-key.ts`,
  `lib/interfaces/repositories/IApiKeyRepository.ts`, `db/schema.prisma`, `middleware.ts` y tres
  rutas de `app/api/ordenes/api-key/`;
- el resto son tests.

Ninguna tabla ni migración lo fija: `key_prefix` es `TEXT`.

**Falsos positivos de la búsqueda sin mayúsculas.** Son `OrdenExistente`, `ordenExacta` y
`ordenExigido`. Por eso el 241 de `docs/limpieza-ordenex.md` incluía, por ejemplo,
`OrdenesExistentesTabla.tsx`. La guardia (§7) distingue mayúsculas.

## 2. Qué es cada uso y cómo se resuelve

| Clase | Ejemplos medidos | Se resuelve con | Coste |
|---|---|---|---|
| **A. Plataforma** | `AvisoVersionNueva` («Hay una versión nueva de Ordenex»); `PushOptIn`; `AsistentePanel`; el «asistente de ayuda de…» de `lib/asistente/instrucciones.ts`; `otp-codigo.ts`; `DEFAULT_FROM_NAME`; los títulos de `openapi-spec.ts` y `app/api-docs/route.ts`; `aviso-ubicacion-denegada.ts` («Aplicaciones → Ordenex» es el nombre de la PWA instalada); `TITULO_RESERVA` de `public/sw.js`; `public/offline.html`; las etiquetas de capturas de `public/manifest.json` | `MARCA.nombre`, o un literal vigilado (R6) en `public/` | Bajo |
| **B. Empresa usuaria** | `CATEGORIA_LABEL` y `ORIGEN_LABEL` («Ordenex le paga a una tienda»); `estado-cuenta-labels.ts` («Ordenex te debe ₡…»); el neto y el facturado de `cierre-labels.ts`; «Ganancia de Ordenex» en `metrics.ts`; `historial-accion.ts`; las descripciones de `plantilla-datos.ts`; los roles de `instrucciones.ts` («trabaja en la oficina de Ordenex»); `ROTULO_GUIA`; los PDF de tránsito y picking | `EMPRESA` (§3) | Medio: la mayor parte de `app/(app)/`, `components/shared/` y `lib/{constants,types,utils}/` |
| **B'. Ejemplos** | `sinpe-textos.ts` («Ej: Ordenex CR S.A.»); `ejemplo: "Ordenex S.A."` y `sinpeNombre` en `plantilla-datos.ts` | Un nombre de ejemplo ficticio y literal, «Mensajería Ejemplo»: «Ej: Mensajería Ejemplo CR S.A.». No es `EMPRESA`, porque un ejemplo no es el nombre de nadie | Bajo |
| **C. Lo técnico de la plataforma** | localStorage `ordenex:*` (5 claves) y eventos `ordenex:*` (2); los mensajes del service worker `ordenex:relevo-ahora`, `ordenex:pagina-lista` y `ordenex:push-recibido`, y el `tag` de las notificaciones; la cookie `ordenex_tema`; `X-Ordenex-Signature` y `-Timestamp`; `ordx_` y `ordx_whsec_` | Los nombres fijos de §5 | Nada que migrar: no hay nada desplegado, ni usuarios, ni llaves emitidas, ni integradores (P2). Los dos extremos de cada contrato cambian a la vez |
| **C'. Base local** | `esDestinoLocalOrdenex` y `localhost:5432/ordenex` en tres scripts; `/^ordenex(_…)?$/` en `contraste-454.ts` | `servi_logistic`, la base de `.github/workflows/gate.yml` | Hoy esos scripts abortan contra la base de este repo, así que el cambio también los **arregla** |
| **D. Identificadores** | `IngresoOrdenexDTO`, `TotalesIngresoOrdenex`, `DesgloseIngresoOrdenex`, `ingresoOrdenex`, `netoOrdenex`, `gananciaOrdenex`, `pagoTiendaOrdenex`, `toIngresoOrdenex`, `deOrdenex`, `esOrdenex`, `ordenexCobra`, `ordenexPaga`, `ordenexPista`, `gastoDeOrdenex`, `NETO_ORDENEX_LABEL`, `FACTURADO_ORDENEX_LABEL`, `NETO_ORDENEX_NOTA`, `NETO_ORDENEX_NEGATIVO_NOTA`, `CASCADA_NETO_ORDENEX_TITULO`, `ORDENEX_NEUTRO`, `BOLSILLO_ORDENEX`, `SuperficieOrdenex`; las uniones `"solo_ordenex"`, `"ordenex_debe"`, `"gasto_ordenex"`, `"tienda_paga_a_ordenex"`, `"concepto_ordenex"` y `"ordenex"`; la métrica `"ganancia_ordenex"`; `lib/utils/ingreso-ordenex.ts`. En los tests hay además nombres locales: `TARIFA_ORDENEX`, `OTROS_EGRESOS_DE_ORDENEX`, `SOLO_ORDENEX`, `ORDENEX_PAGA` | Glosario (§3) | Alto en volumen, pero mecánico: el typecheck lo guía, porque las uniones son tipos literales. Ninguno está en la base, así que no hace falta ninguna migración |
| **E. Comentarios** | En producción, `db/schema.prisma`, `gate.yml`, `tests/` y `e2e/`: «la caja de Ordenex», «el pago de una tienda a Ordenex» | El mismo criterio que A y B, sin interpolar: «la empresa» o «la plataforma» | Bajo. Los `//` y `///` de Prisma no generan migración |
| **F. Datos de prueba** | `bienvenida_ordenex`, `ordenex_prod`, `ordenex_459` y `ordenex_461` (clones), `https://ordenex.app/x` en `quitador-comentarios`, y `admin@ordenex.test` en los tests (en las migraciones es de SL-11) | Valores neutros, como `bienvenida`, `servi_logistic_prod`, `servi_logistic_459` y `https://ejemplo.app/x` | Bajo |
| **G. Migraciones** | La palabra está en 25 archivos de 22 carpetas. SL-15 se queda con **19 archivos en 18 carpetas**. Quedan fuera los 4 del usuario maestro, que son de SL-11, y 2 de SL-13: la `459`, que SL-13 borra entera, y `20260827160000_orden_num_remision_unico_parcial`. En las de SL-15 casi todo son comentarios. Hay una excepción: un literal de texto dentro de SQL, el mensaje de `RAISE EXCEPTION` en `20260927120100_abono_tienda_457_tablas_y_checks/down.sql` | Edición en sitio, con el criterio de E. El mensaje del `RAISE` cambia de texto pero no de comportamiento. | Las bases locales que ya las aplicaron se rehacen con `prisma migrate reset` (§10). El CI parte de una base vacía. No se consolida nada: eso es SL-28 |

## 3. El módulo de marca, el valor de transición y el glosario

`lib/config/marca.ts` (lo crea SL-8, P5; si al llegar no existe, lo crea la tanda 1):

```ts
/** La plataforma: lo que se instala, el remitente del correo, el asistente, la doc de la API. */
export const MARCA = { nombre: "Servi Logistic" } as const;

/**
 * La empresa usuaria: la que cobra, paga, debe, gana y reparte. Nunca es la plataforma.
 * TRANSICIÓN: hasta SL-17 no hay `organizacion`, así que se usa un término neutro y no hay
 * membrete. SL-17 sustituye las tres formas por el nombre de la organización de la sesión.
 */
export const EMPRESA = {
  enFrase: "la empresa",     // «Ganancia de ${EMPRESA.enFrase}»
  alInicio: "La empresa",    // «${EMPRESA.alInicio} te debe ₡9.000»
  membrete: null as string | null, // rótulo de la etiqueta y encabezado de los informes
} as const;
```

**Por qué «la empresa» y no una variable de configuración.** La decisión del humano (P1) obliga a
que el valor no sea «Servi Logistic». Quedaban dos opciones. Elegí el término neutro por cuatro
razones:
1. **Es verdad para cualquier empresa.** Un nombre configurado es un solo valor por despliegue. En
   cuanto la plataforma tenga dos empresas usuarias, diría el nombre equivocado a una de ellas, que
   es justo el problema que se quiere quitar.
2. **No hay nada que olvidar.** Una variable obliga a darle valor en local, en CI y en Vercel. Si
   falta, haría falta igualmente un valor neutro de reserva.
3. **SL-17 necesita otra fuente de todas formas.** Necesita el nombre por sesión, no por entorno, así
   que una variable sería código que tira dos fichas después.
4. **Se ve y se prueba igual que un nombre.** Por eso hay tres formas. La frase lleva el artículo en
   minúscula («de la empresa», «a la empresa»). El inicio de frase lo lleva en mayúscula. Y el
   membrete se omite, porque «LA EMPRESA · GUÍA» en una etiqueta impresa no dice nada. Cuando SL-17
   ponga un nombre propio, las tres formas pasan a valer lo mismo.

Hay dos reglas de uso:
- **Los rótulos siguen siendo literales con plantilla, en el mismo `Record`.** Por ejemplo,
  `ingreso_cobro_tienda: \`${EMPRESA.alInicio} le cobra a una tienda\``. Así siguen siendo el
  mismo objeto que leen la pantalla, la descarga y el servidor. SL-17 tendrá que convertirlos en
  funciones del nombre de la sesión: ese cambio es suyo (§9, alternativa 2).
- **Cómo decidir entre `MARCA` y `EMPRESA`.** Si el sujeto es lo que se instala, se abre o responde
  (la app, el asistente, el correo de acceso, la doc de la API), es `MARCA`. Si mueve dinero o
  mercadería, o tiene oficina, empleados o cuenta SINPE, es `EMPRESA`. En los textos mixtos, cada
  mención va con lo suyo. Por ejemplo: «Sos el asistente de ayuda de ${MARCA.nombre}. Te pregunta
  alguien de una empresa de mensajería de Costa Rica que la usa.» «Costa Rica» se queda (R18).

**Glosario de identificadores (P3: «empresa»).** La palabra se sustituye en la misma posición:
`Ordenex` → `Empresa`, `ordenex` → `empresa`, `ORDENEX` → `EMPRESA`. Por ejemplo:
- `IngresoOrdenexDTO` → `IngresoEmpresaDTO`;
- `netoOrdenex` → `netoEmpresa`;
- `"ordenex_debe"` → `"empresa_debe"`;
- `"solo_ordenex"` → `"solo_empresa"`;
- `"ganancia_ordenex"` → `"ganancia_empresa"`;
- `NETO_ORDENEX_LABEL` → `NETO_EMPRESA_LABEL`;
- `lib/utils/ingreso-ordenex.ts` → `lib/utils/ingreso-empresa.ts`.

Hay una excepción: `esDestinoLocalOrdenex` → `esDestinoLocal`, porque la base local no lleva marca.

Comprobé dos cosas antes de fijar el glosario:
- **No choca con nada:** hoy ningún identificador contiene `Empresa`, `empresa_` ni `_empresa`.
- **La métrica no cambia de número:** sigue habiendo 25. Es un renombre y no se quita ninguna, así
  que no aplica la regla «añadir o quitar una métrica exige decisión». Además,
  `catalogo-produccion.guardia` no congela la lista de ids.

**El archivo que conserva el nombre (P4).** `tests/unit/utils/ingreso-ordenex.test.ts` lo citan
`specs/240-…/tasks.md` y `specs/274-…/tasks.md`. Si se renombra, `test-citado-desaparecido`
pasa a rojo, y la anotación que lo evitaría solo puede ir en esos `tasks.md`. Por eso queda como
excepción de **ruta**, y la retira SL-27 «Retirar los specs/ heredados de Ordenex». Su
contenido sí se limpia.

## 4. Modelo de datos, multi-empresa y país

- **`db/schema.prisma`: no hay que renombrar nada en el SQL.** El archivo tiene 47 apariciones
  (46 de «Ordenex» y 1 de `ordx_`). Ninguna línea con la palabra la lleva antes del primer `/`,
  así que las 47 están en comentarios `//` o `///`, y ningún modelo, campo, enum, `@map` ni
  `@@map` la usa. Prisma ignora los comentarios al calcular diferencias, así que editarlos no
  genera migración. Si un nombre fuera de tabla o de columna, el cambio pediría una migración
  `ALTER … RENAME` con su `down.sql`. Lo comprobé y no es el caso.
- **No hay tablas ni columnas nuevas.** Ningún identificador de la clase D vive en la base. Las
  migraciones se editan en sitio (R14): no se crea ninguna, así que no hay `down.sql` nuevo. Los
  `down.sql` que ya existen se editan con el mismo criterio.
- **Comprobación de esquema.** Tras la tanda de migraciones, `prisma migrate reset` sobre una base
  local vacía y después `prisma migrate diff --from-migrations db/migrations --to-schema-datamodel
  db/schema.prisma` deben dar un diff vacío. Eso demuestra que solo cambiaron comentarios y datos
  que se borran solos.
- **Multi-empresa.** No hay datos ni queries nuevas. El nombre de la empresa es neutro hasta SL-17,
  y queda anotado como pendiente de la fase 2: la fuente pasa a ser la organización de la sesión.
  Aquí no se inventa ningún aislamiento.
- **Autorización y módulos.** No cambian. La autenticación por API key compara el hash de la key
  entera, y ninguna regla de acceso depende del prefijo `ordx_`.
- **País.** No se toca ningún dato de Costa Rica. Donde la palabra comparte una cadena con datos de
  Costa Rica, solo cambia la palabra (R18).

## 5. Contratos que cambian a la vez

| Contrato | Extremos | Nombre nuevo |
|---|---|---|
| Mensajes del service worker | `public/sw.js` ↔ `lib/pwa/actualizacion.ts` | `servi-logistic:relevo-ahora`, `servi-logistic:pagina-lista`, `servi-logistic:push-recibido`; el `tag` pasa a `servi-logistic:<evento>` |
| localStorage y eventos | `lib/audio/preferencia-sonido.ts`, `lib/manifiesto/preferencia-columnas.ts`, `lib/columnas/preferencia-columnas.ts`, `lib/utils/preferencia-navegacion.ts`, `components/shared/RevisionSinpeBodega.tsx`, `hooks/usePreferenciaSonido.ts`, `hooks/usePreferenciaColumnas.ts` | El prefijo pasa a `servi-logistic:` |
| Cookie de tema | `lib/tema/tema.ts` (`COOKIE_TEMA`) | `servi_logistic_tema` |
| Firma del webhook | `lib/crypto/webhook-firma.ts` ↔ `lib/api/openapi-spec.ts` ↔ integradores (hoy no hay ninguno) | `X-Servi-Logistic-Signature`, `X-Servi-Logistic-Timestamp` |
| API key | `lib/utils/api-key-generator.ts` ↔ `lib/api/openapi-spec.ts` ↔ la UI que la muestra | `svl_`. `PREFIX_VISIBLE_CHARS` pasa de 12 a `API_KEY_PREFIX.length + 7` = 11, para conservar la regla «prefijo + 7» de la feature 81 (R17 de aquella ficha) |
| Secreto de webhook | `lib/utils/webhook-secret-generator.ts` | `svl_whsec_` |

**Por qué `svl_`.** Son las iniciales de **S**er**v**i **L**ogistic, con el mismo largo y la misma
forma que `sk_` o `ghp_`. Además es corto, así que la parte visible de la key sigue siendo casi
toda aleatoria.

**Llaves ya emitidas: no hay ninguna.** No existe ninguna base de servi_logistic desplegada (P2).
Por eso una key `ordx_` recibe el 401 genérico de una key desconocida. No se acepta el prefijo
viejo ni se lee una clave vieja como respaldo.

**Por qué estos nombres no salen de `MARCA`.** Un cambio de marca no debe cambiar en silencio una
clave ni un contrato. Por eso están fijos en su propio módulo, y un test afirma cada uno como
literal.

## 6. Tests

Con «Ordenex cero» (decisión 2026-10-21), todos los tests y e2e cambian (R20). Hay dos casos:
- **Si el valor es contrato** (R19), el test afirma el valor nuevo como **literal**. Por ejemplo:
  «La empresa te debe ₡9.000», `servi-logistic:push-recibido`, `X-Servi-Logistic-Signature`,
  `"svl_"`, `"Servi Logistic"` como remitente o la regex de la cookie en `tema-encendido`. No se
  escribe `` `${EMPRESA.alInicio} …` ``: comparar un texto contra la función que lo genera da verde
  siempre.
- **Si no es contrato** (un comentario, el nombre de un caso o un dato de entrada), se reescribe con
  la clase que le toque, sin cambiar lo que el test comprueba.

Pruebas nuevas:
- `tests/unit/config/marca.test.ts` (R1).
- Para R4, un caso por grupo con `vi.mock("@/lib/config/marca")`. El mock pone el nombre «Acme
  Envíos» en las tres formas y el test comprueba que el texto lo usa. Así detecta que alguien haya
  vuelto a escribir el nombre a mano. Los grupos son:
  - los rótulos de la wallet;
  - el estado de cuenta;
  - los cierres;
  - la analítica;
  - el historial;
  - las plantillas;
  - la etiqueta PDF, que con membrete muestra «ACME ENVÍOS · GUÍA»;
  - los informes PDF.
- `tests/unit/guards/marca-estaticos.guardia.test.ts` (R5, R6).
- `tests/fixtures/nombre-heredado.ts`: el patrón, armado por partes para que la palabra no
  aparezca literal (R17). Lo importan la guardia de §7 y las aserciones de ausencia (R21).
- La guardia de §7 (R15, R16).
- R21 se comprueba en `tests/integration/wallet-page.test.tsx` y
  `tests/integration/mi-wallet-page.test.tsx`, que renderizan la página entera. El E2E no corre
  todavía, porque su receta de siembra sigue ABIERTA (`gate.yml`, línea 349). La comprobación
  visual va en `progress/impl_SL-15.md`.

## 7. La guardia `tests/unit/guards/sin-nombre-heredado.guardia.test.ts`

**Qué lee.** Todo lo que devuelve `git ls-files`, salvo tres carpetas: `specs/`, que retira SL-27;
`docs/`, que es de SL-16 y la vigila esa ficha; y `progress/`, que es el estado del arnés.
Partir de `git ls-files` deja fuera `.worktrees/`, `node_modules/` y `.next/`. Mira el contenido y
la ruta de cada archivo, con el patrón de `tests/fixtures/nombre-heredado.ts`, que cubre
`Ordenex|ordenex|ORDENEX|ordx_` distinguiendo mayúsculas.

**Excepciones.** Viven en el propio archivo como `{ alcance, motivo, retira }`. El alcance es una
ruta, un prefijo de carpeta o un patrón de línea. Todas son temporales. Una excepción que ya no
cubre ninguna aparición pone la guardia en rojo, así que la lista solo puede encoger. Al integrar
SL-15 quedan estas, si su ficha no se ha integrado antes:

| Alcance | Motivo | Retira |
|---|---|---|
| Líneas con el dominio de Ordenex | Dominio | SL-14 |
| `design-notificaciones/`, `design-whatsapp/`, `DESIGN.md`, `.design-work/` | Diseños (la guardia no lee `docs/`) | SL-16 |
| Líneas de `tests/` que nombran un archivo de `docs/` (`openapi-266`, `openapi-320`, `openapi-canal-rutas-reales`, la guardia de palabra prohibida de SL-10 R11) y `tests/unit/asistente/contexto-4*.test.ts` | Afirman documentos que cambia SL-16 | SL-16 |
| `scripts/seed-maestro.ts`, `scripts/seed-usuarios-qa.ts`, `db/migrations/20260709120000_seed_maestro_user/`, `db/migrations/20260720150000_drop_default_maestro_user/` | Seeds y el usuario maestro | SL-11 |
| `scripts/backfill-*.ts`, `tests/unit/scripts/backfill-*.test.ts` | Backfills de Ordenex | SL-12 |
| `db/migrations/20260925120300_reclasificar_cobros_459/`, que SL-13 borra entera, y `db/migrations/20260827160000_orden_num_remision_unico_parcial/` | Migraciones de SL-13 | SL-13 |
| La ruta `tests/unit/utils/ingreso-ordenex.test.ts`, y cualquier literal de test que tenga que coincidir con un `specs/` heredado | Lo cita un spec de Ordenex | SL-27 |

**Trinquete de las tandas.** Al empezar, cada archivo pendiente entra con `retira: "SL-15"`. Cada
tanda borra sus entradas. Al cerrar no queda ninguna con `retira: "SL-15"` (R16).

**Autocomprobación** sobre texto sintético:
- `OrdenExistente` no salta;
- la palabra seguida de « le paga» salta;
- `ordx_abc` salta;
- una URL del dominio de Ordenex, con la excepción de SL-14 vigente, no salta;
- una excepción sin apariciones salta.

## 8. Tandas

Cada tanda deja el gate en verde y termina con commit y `git push`:

1. Módulo de marca (comprobar o crear), patrón, guardia con todo pendiente y `marca-estaticos`.
2. Plataforma (A) y `public/`.
3. Lo técnico (C, C'): almacenamiento, service worker, cookie, cabeceras, API keys y secretos, y
   base local.
4. Empresa en la wallet (B y B').
5. Empresa en cierres y analítica (B).
6. Empresa en el resto, más los PDF (R7 y R8).
7. Identificadores (D).
8. Comentarios (E) y `db/schema.prisma`.
9. Migraciones (G), con la comprobación de esquema de §4.
10. Barrido de `tests/`, `e2e/` y fixtures (F), más lo que SL-8 haya dejado.
11. Cierre.

Las tandas comparten la lista de excepciones, así que van seguidas, no en paralelo. Los tests de
contrato de cada superficie cambian en la misma tanda que su código. La tanda 10 solo barre lo que
no es contrato.

## 9. Alternativas descartadas

1. **Variable de configuración con el nombre de la empresa.** Es un solo valor por despliegue: falla
   en cuanto la plataforma tenga dos empresas, obliga a configurarla en tres entornos y SL-17 la
   tira (§3).
2. **Rótulos como funciones que reciben el nombre de la organización.** Es lo que pedirá SL-17, pero
   hoy sería un rediseño. Cambiaría la firma de diccionarios que comparten la pantalla, la descarga
   y el servidor, cuando todavía no existe una organización de la que leer el nombre.
3. **Un solo nombre, `MARCA`, para todo.** Contradice la decisión 4 de `docs/plan-saas.md`: la
   plataforma nunca es quien cobra ni quien debe.
4. **Reescribir los textos de dinero sin sujeto** («Te debemos ₡9.000»). Cambia una redacción ya
   aprobada, que fijan `nombres-wallet-461` y `caja-textos-459`, y abre una decisión de UX por cada
   texto. La interpolación conserva la frase.
5. **Migración nueva o consolidación en vez de editar en sitio.** Un `UPDATE` posterior no quita la
   palabra de las migraciones antiguas, y consolidarlas está prohibido. No hay ninguna base
   desplegada, así que editar en sitio no produce drift en ningún sitio que importe.
6. **Aceptar el prefijo viejo `ordx_` por compatibilidad.** No hay ninguna llave emitida: sería
   código muerto desde el primer día.

## 10. Riesgos

- **Bases locales ya migradas.** Tras integrar, `prisma migrate dev` avisará de que hay migraciones
  modificadas, y la base local se rehace con `prisma migrate reset`. El aviso se deja en el PR y en
  `progress/impl_SL-15.md`.
- **Choques de merge.** Las tandas 4 a 10 tocan casi toda la wallet, los cierres y la analítica, y
  sus tests. Son las mismas carpetas que tocarán SL-20, SL-21 y SL-22, así que conviene integrar
  SL-15 antes de que empiecen.
- **Guardias que fijan textos aprobados**: `nombres-wallet-461`, `caja-textos-459`,
  `cierre-bodega-vocabulario` y `wallet-textos-458`. Su literal cambia en la misma tanda que el
  texto que fijan, y siempre como literal (R19).

## Dependencias

Ninguna librería nueva.
