# SL-13 — Diseño

## Lo que ya existe

Se buscó en el board (`feature_list.json`, todas las fichas), en `specs/` y en el código. Términos:
«el integrador», «cliente A», «cliente B», `distribuidora`, `ecuador`, `integrador`, `reclasific`,
`reclasificar_cobros`, y los nombres inventados `mercadito`, `abarrotes`, `surtidora` y
`comercial luna` (para comprobar que no chocan con nada). El MCP del grafo no estaba disponible para
este agente: el código se buscó con Grep/Read.

| Dónde | Qué apareció | Qué se hace |
|---|---|---|
| Board | Solo SL-13 nombra al integrador | — |
| Board | SL-10 (gate verde) deja `reclasificacion-459-lista` en el baseline «hasta que SL-13 decida» y retoca `test-citado-desaparecido` (su R13) | SL-13 retira esa guardia y poda su entrada (D3), y toca `test-citado-desaparecido` (D4). Por eso depende de SL-10 y va después. |
| Board | SL-16 (`design-notificaciones/`, `design-whatsapp/`) | Se solapa en parte en los diseños. SL-13 solo sustituye la palabra; el destino de las carpetas lo decide SL-16 (decisión cerrada). |
| Board | SL-15 («Ordenex» en código y tests) | Toca algunos de los mismos tests, pero por otra palabra, y el dueño es el mismo. Aquí no se renombra «Ordenex» (por ejemplo, el pie `Ordenex · Picking …` conserva esa palabra). |
| Board | SL-27 «Retirar los specs/ heredados de Ordenex» | Es la ficha que retira la excepción temporal de D4. |
| Board | SL-11 (seeds) | Ningún seed nombra a estas tiendas (medido). |
| `specs/` | Varios specs de Ordenex nombran a estas tiendas (por ejemplo, 476) | No se tocan (R13) y quedan fuera del barrido de R1. |
| `specs/459/design.md:1100-1101`, `specs/461/design.md:827` | Filas `| R… |` que citan `reclasificacion-459-lista.guardia.test.ts` y `reclasificacion-459-migration.test.ts` | Al borrar esos tests, `test-citado-desaparecido` los marcaría. Se cubren con la excepción temporal de D4. |
| Código | Nada, salvo la 459, escribe filas con origen `cobro_manual_reclasificado` | El valor y sus lectores se quedan. Es deuda que el leader anota en `progress/deudas.md`. |
| Código | `tests/integration/db/_fixtures/reclasificacion-459-sql.ts` ejecuta el SQL real de la 459. Lo usan `reclasificacion-459-migration`, `caja-invariante-tiendas` y `cobro-tienda-461-completar-migration` | El primero se borra. Los otros dos pasan a sembrar la fila reclasificada directamente (D3). |
| Código | `orden-traspaso-migration.test.ts:162` lista la 459 en el orden de migraciones | Se quita esa entrada (D3). |
| Código | No hay ninguna guardia de «término prohibido» para nombres de cliente | Se crea (D1). El patrón con `git ls-files` ya lo usan `catalogo-postgres-acota-esquema.guardia.test.ts` y `caja-173-alcance.guardia.test.ts`. |
| Código | `Mercadito`, `Abarrotes`, `Surtidora`, `Comercial Luna`, `Abastos`, `Ejemplo SRL`, `País Ficticio`: 0 apariciones fuera de `specs/` | Libres para usarlos como fixtures. Se descartó «Brisa» porque casa con geografía real de Costa Rica (`20260713005000_seed_geografia_cr`). |
| `lib/config/` y `lib/geo/` | No hay ninguna configuración de país ni de centro de mapa. `lib/config/` tiene `ordenes.ts`, `rastreo-publico.ts` y otros de dominio, y `moneda.ts`, que configura el formato de la moneda (con override por variable de entorno) y no el país: SL-20 parte de los dos. `lib/geo/direccion-query.ts` fija `const PAIS = "Costa Rica"` («todas las ordenes son de Costa Rica») | No hay nada que reusar: se crea la mínima, `lib/config/pais.ts` (D7). `direccion-query.ts` no se toca (R13); su `PAIS` lo absorberá SL-20. |
| Board | SL-20 «pais-geografia-configurable» (fase 3) | Ampliará `ConfiguracionPais` (D7) a la configuración por empresa y país. SL-13 solo define el tipo y el campo que necesita. |

## Inventario clasificado (medido el 2026-10-21)

Medido con Grep sin distinguir mayúsculas y fuera de `specs/`:
- «el integrador»: 59 archivos.
- «cliente A» o «cliente B»: 13 archivos. De ellos, 6 no nombran al integrador: `design-whatsapp/canvas.json`,
  `lib/whatsapp-envios/informes/picking/informe.ts`, `picking-modelo.test.ts`,
  `whatsapp-envio-service-picking.test.ts`, `ejecucion-envio-informe-error.test.ts` y
  `picking-repository.test.ts`.
- «Distribuidora» y «Ecuador»: ver (f).
- Total: **65 archivos**. Con la ampliación de (f), **71**.

**(a) `app/` y `lib/`: 5 archivos.**
- Cuatro, con la mención solo en comentarios:
  - `app/(app)/ordenes/page.tsx:154` y `lib/services/EliminarOrdenService.ts:81`: la cita del reporte
    de la ficha 358.
  - `lib/analytics/alcance.ts:117`.
  - `app/(app)/analitica/_components/entregas/ProductosTabla.tsx`:
    - `:615`, el ejemplo de palabras partidas «medido en Chromium» con «el integrador», `Distribuidora` y
      `Ecuador`;
    - `:846`, la tabla de anchos con «`Distribuidora` (dato)».

  Se generalizan: «una tienda»; en `ProductosTabla.tsx`, «el nombre de tienda más largo».
- Uno con un literal de UI: `lib/whatsapp-envios/informes/picking/informe.ts:124`,
  `ejemplo: "<cliente A>"` en la variable `tienda`. Pasa a `"Abarrotes"`. Ningún test afirma ese valor
  (medido).

**(b) Datos del integrador: la migración 459 y lo que solo existía para ella.**
- La migración lleva 203 ids de la producción de Ordenex, con sus montos, la suma y la tienda.
- En servi_logistic su `DO` termina sin escribir nada (rama R83, `n_presentes = 0 → RETURN`).
- Con ella van:
  - su guardia `reclasificacion-459-lista`, que además exige un CSV que no se copió;
  - su test `reclasificacion-459-migration`;
  - el fixture `_fixtures/reclasificacion-459-sql.ts`.

**(c) `tests/`: 46 archivos.**
- **Dato de prueba** (nombre de tienda, `tiendaId`, `usuarioId`, email, cédula, slug o nombre de
  archivo):
  - Picking:
    - `abono-tienda-action`, `informe-picking-actions`, `informe-picking`, `picking-pdf`;
    - `picking-modelo` (`picking-<cliente-a>-2026-10-05.pdf` → `picking-abarrotes-…`);
    - `picking-repository`, `whatsapp-envio-service-picking` (`Picking <cliente A>`, `t-<cliente-a>`),
      `ejecucion-envio-informe-error`.
  - `catalogo-y-choke-point`, `vista-filtro-aplicabilidad`, `api-key-owner`.
  - `descripcion-abono`, `descripcion-cobro-tienda`, `descripcion-pago-por-cuenta`.
  - `abono-tienda-schema`, `pago-por-cuenta-tienda-schema`.
  - `abono-tienda-service`, `abono-tienda-anulacion`, `_abono-tienda-montar`, `caja-abono-tienda-feed`,
    `pago-por-cuenta-tienda-service`.
  - `api-key-auth-service`, `api-key-service.tienda-destino`, `api-key-repository`,
    `api-key-repository.list`, `api-key-repository.secreto`.
  - `cierre-dia-repository`, `cierre-dia-service`, `cierres-admin-repository`, `cierres-admin-service`.
  - `webhook-suscripcion-repository` y los dos `ordenes-api-key-tienda-destino*.route`.
  - Componentes:
    - `CierreRechazosDeTienda`, `WalletLedgerAcciones459`, `WalletLedgerAcciones461`;
    - `ParamsPicking` (las tres tiendas);
    - `ProductosTabla` y `ProductosTablaDinero` («el integrador» y «cliente C»).
- **Solo en un comentario o en el título de un caso:**
  - `api-key-service.listar`, `api-key-service.eliminar`, `api-key-motivo-no-eliminable`;
  - `caja-derivacion-457`, `ingreso-ordenex`;
  - `eliminar-orden-service`, `orden-remision-borrada-libera-numero`.

**(d) Diseños y docs.**
- Diseños:
  - `design-whatsapp/{PdfPicking,ParamsPicking,FormularioMovil}.dc.html` y `design-whatsapp/canvas.json`;
  - `design-notificaciones/Main.dc.html`;
  - `design-notificaciones/notificaciones-ordenex.html`, con la cadena JS escapada de la línea 1067.
- Docs:
  - `docs/plan-saas.md`: la línea 14 (la cuenta de GitHub) y la lista de la fase 1;
  - `docs/limpieza-ordenex.md`: la regla 2 y la §6.

**(e) Migraciones con el nombre en comentarios.**
- `20260827160000…/migration.sql:3` y `…/down.sql:22`.
- `20260828120000…/migration.sql:5,7`.

**(f) «Distribuidora» y «Ecuador»: salen todos** (ampliación del humano). Estas son todas sus
apariciones fuera de `specs/` (medido con Grep). La guardia veta sus cadenas exactas, no las palabras
sueltas (D1).

| Aparición | Se hace |
|---|---|
| `ProductosTabla.tsx:615` y `:846` (comentarios) | Se generalizan (R4) |
| «cliente C» en `ProductosTabla.test.tsx:342` y `ProductosTablaDinero.test.tsx:1006` | `Comercial Luna` (R6) |
| `Cliente D` en `partes-por-tienda.test.ts:221-223` (tres tiendas homónimas) | `Abastos Central`. El test prueba que dos tiendas con el mismo nombre no se funden; no hay orden alfabético en juego |
| `Cliente E` en `cierre-desglose-por-tienda-sql-real.test.ts:63` (`NOMBRE_COMPARTIDO`, el mismo caso de homónimas) | `Abastos del Valle` |
| `Cliente F SRL` en `AnaliticaPage.test.tsx:1034` (`TIENDA_AJENA`) | `Abastos Ejemplo SRL` |
| `UbicacionMapaInner.tsx:29-31`: el comentario «<centro del mapa de origen>» y `CENTRO_FALLBACK = [-0.1807, -78.4678]`. **No se usa**: es su única aparición en el archivo | Se borran la constante y su comentario (R15) |
| `RutaMapaInner.tsx:34-36`: el mismo comentario y la misma constante, usada en `center={puntosEncuadre[0] ?? CENTRO_FALLBACK}` (`:140`) | El respaldo pasa a `PAIS_DE_OPERACION.centroMapa` de `lib/config/pais.ts` (R15, D7) |
| `bulk-orden-service.test.ts:593`: `direccion_destinatario: "Ecuador / Pichincha / Quito (<barrio de origen>) / <dirección de origen>"` | `"País Ficticio / Región Norte / Ciudad Ejemplo (Barrio Uno) / Avenida Principal"`. Conserva las cuatro partes separadas por ` / `, que es lo que el caso R10 usa: comprueba que la geografía metida en esa columna se ignora |
| `docs/plan-saas.md:14` (la cuenta de GitHub de la app de origen) | Ya entra en R7 |

Las 6 apariciones nuevas suben el total a **71 archivos**.

## Decisiones técnicas

No hay modelo de datos, rutas, endpoints ni autorización nuevos. `organizacion_id`, RLS y módulos
no aplican. No hay datos por país: R13 prohíbe tocar los de Costa Rica. No se crea ninguna migración
ni se consolida ninguna (R9).

### D1 — Guardia `tests/unit/guards/sin-integrador-de-ordenex.guardia.test.ts` (R1, R2, R3, R4)

- **Nombre:** no lleva ningún término prohibido. Contiene «guard», así que `gate.siempre` la corre en
  cada gate.
- **Universo:** `git ls-files -z --cached --others --exclude-standard`.
  - Quedan fuera, porque están ignorados: `.worktrees/`, `feature_list.json` y
    `progress/sesion.local.md`.
  - Se saltan `specs/` y los binarios: un `\0` en los primeros 8 KB, el mismo criterio que
    `git grep -I`.
- **Términos prohibidos** (una constante): son las cadenas exactas que se retiran.
  - «el integrador», «cliente A», «cliente B»;
  - «cliente C», `cliente D`, `cliente E`,
    `cliente F`;
  - `<centro del mapa de origen>`, `<barrio de origen>`, `<dirección de origen>`.

  «Ecuador» y «distribuidora» como palabras sueltas **no** se vetan:
  - Ecuador puede ser un país legítimo de la fase 3 (`docs/plan-saas.md` decisión 2, SL-20);
  - «distribuidora» es un tipo de comercio corriente.
- **Detección:** una función pura `apariciones(texto, terminos, permitidas): {linea, termino}[]`.
  - Quita de cada línea las cadenas permitidas.
  - Busca cada término como subcadena literal, sin distinguir mayúsculas: el `.` y el `~` no son
    comodines.
  - En los términos de varias palabras, cualquier tramo de espacios entre ellas cuenta.
  - La ruta pasa por la misma función.
- **R4, un caso propio:** los comentarios de `ProductosTabla.tsx` no contienen `/distribuidora|ecuador/i`.
  Solo en ese archivo: así se veta la cita de datos reales sin vetar las palabras en el resto del
  repositorio.
- **R15, un caso propio:** ni `RutaMapaInner.tsx` ni `UbicacionMapaInner.tsx` contienen un par de
  coordenadas literal (`/-?\d{1,3}\.\d{3,}/`), y `RutaMapaInner.tsx` importa `@/lib/config/pais`.
- **Excepciones:** una constante `{ ruta | cadena, motivo }` con exactamente dos entradas.
  - **El propio archivo de la guardia**, que es el único que define los términos. Es de servi_logistic.
  - **La cadena `fuera-nuform`**, el slug de la ficha en el board: aparece en la rama, en la ruta del
    spec y en `progress/`. Vive mientras exista la ficha.
  - Ninguna migración es excepción: la decisión del humano permite editarlas (D2).
- **Poda (R2):**
  - la excepción por archivo existe y contiene un término;
  - la cadena permitida aparece en al menos un archivo del universo.

  Si no se cumple, la guardia se pone en rojo.
- **Mensaje:** `ruta:línea (término)` y la regla (`docs/limpieza-ordenex.md` regla 2;
  `docs/plan-saas.md` decisión 6).
- **Autocomprobación (R3):**
  - se marcan `u-<Integrador>`, `<INTEGRADOR>test`, `picking-<cliente-a>-2026`, `t-<CLIENTE-B>`,
    `<Cliente  D>`, `(<centro del mapa de origen>)` y `<dirección de origen>`;
  - no se marcan un texto limpio, `feature/SL-13-fuera-nuform`, `Distribuidora mayorista`,
    `Ecuador` ni `Av- <calle>` (el `.` es literal).

### D2 — Editar los comentarios de las dos migraciones que se quedan (R8, R10)

- **Por qué ahora sí.**
  - Prisma guarda el checksum de cada migración aplicada, y `migrate dev` pide un reset si una cambió.
    Eso solo importa donde hay una base que conservar.
  - Aquí no la hay, por decisión del humano: solo existen bases locales desechables y la historia se
    aplana antes del primer push. Quien tenga base local hace `prisma migrate reset`.
  - La regla «migración editada en sitio = drift» vuelve a valer cuando exista una base desplegada.
- **Qué cambia:** solo las líneas `--` que nombran al integrador, que pasan a «una tienda». El SQL no
  se toca.
- **Verificación de R8:** `git diff -U0 dev -- <los tres archivos>` solo muestra líneas `-`/`+` que,
  sin espacios iniciales, empiezan por `--`.

### D3 — Quitar la migración 459 y lo que solo existía para ella (R9, R10, R11)

- **Quitar, no vaciar.** Las dos opciones cambian el checksum y piden el mismo `migrate reset`.
  Vaciarla solo deja una carpeta con nombre de Ordenex y un no-op que mantener (alternativa B).
- **Se borran:**
  - `db/migrations/20260925120300_reclasificar_cobros_459/` (`migration.sql` y `down.sql`);
  - `tests/unit/guards/reclasificacion-459-lista.guardia.test.ts`;
  - `tests/integration/db/reclasificacion-459-migration.test.ts`;
  - `tests/integration/db/_fixtures/reclasificacion-459-sql.ts`;
  - la entrada de esa guardia en `tests/baseline-rojos.json`. La guardia `gate-cableado-arnes-v2` de
    SL-10 exige que exista la ruta de cada entrada.
- **Se adaptan:**
  - **`caja-invariante-tiendas.test.ts` y `cobro-tienda-461-completar-migration.test.ts`.**
    - Ya no ejecutan la 459 para obtener una fila reclasificada. La siembran directamente con Prisma:
      `wallet_movimiento` con tipo `egreso`, categoría `egreso_pago_por_cuenta_tienda`, origen
      `cobro_manual_reclasificado` → id del cobro, y el mismo monto y `fecha_movimiento`.
    - Se queda lo que miden de la caja y de la 461.
    - Se van las aserciones sobre lo que escribía la 459 (número de salidas, mismo monto, mismo
      instante, descripción compuesta). Cada una se nombra en `progress/impl_SL-13.md`.
  - **`orden-traspaso-migration.test.ts`:** se quita la entrada de la 459 de la lista y se corrige su
    comentario.
- **No se tocan:**
  - el comentario de `20260925130000_…/migration.sql:26`, que cita la 459 pero no al integrador;
  - el valor `cobro_manual_reclasificado` y sus lectores, que quedan como deuda.
- **Verificación de R10:**
  - con la base local verificada como no-Ordenex, se corre
    `pnpm exec prisma migrate reset --force --skip-seed`;
  - después, los cinco tests de R10 contra esa base;
  - sin base no se da por cumplido: se dice, y lo cubre la suite completa de CI.

### D4 — Excepción temporal en `test-citado-desaparecido` (R12)

- **El problema:**
  - `specs/459/design.md:1100-1101` y `specs/461/design.md:827` mapean requisitos a los dos tests
    borrados.
  - Mientras la historia contenga el commit del borrado, la guardia los marcaría.
  - La anotación en el mismo spec no se puede usar, porque los specs heredados no se tocan.
- **La solución:**
  - En la guardia, `EXCEPCIONES_TEMPORALES` con dos entradas
    `{ doc, archivo, ficha: "SL-13", retira: "SL-27", motivo }`: las dos citas del spec 461. Las dos filas del 459 (`:1100-1101`, `| R80, R88 |` y `| R81–R86 |`) la guardia no las lee como citas, y una excepción sobre ellas pondría en rojo su propio caso de caducidad.
  - `anotacionPara` también las consulta.
  - Motivo: la migración 459 llevaba datos de producción de Ordenex y se retiró con sus tests.
- **Caduca sola:** un caso nuevo pone la guardia en rojo si se cumple cualquiera de estas condiciones:
  - el archivo vuelve a existir;
  - ya no hay cita en ese `doc` (lo que pasa cuando SL-27 retira los specs);
  - el archivo ya no está en `BORRADOS` (lo que pasa al aplanar la historia).

  SL-27 la quita al retirar los specs. Si la historia se aplana antes, la guardia avisa en rojo.
- **Mordida:** quitar una de las dos entradas pone en rojo el caso R-1 nombrando esa cita. Después
  se restaura.

### D5 — Nombres inventados para los fixtures (R6)

| Antes | Después | Derivados |
|---|---|---|
| cliente A | `Abarrotes` | `t-abarrotes`, `Picking Abarrotes`, `picking-abarrotes-2026-10-05.pdf` |
| el integrador | `Mercadito` | `u-mercadito`, `t-mercadito`, `MERCADITO` / `UUID_MERCADITO`, `Mercadito ERP`, `apikey+mercadito-erp@apikey.invalid`, `APIKEY-mercadito-erp`, `Mercadito Rev`, `mercadito@example.com` |
| cliente B | `Surtidora` | `t-surtidora` |
| cliente C | `Comercial Luna` | — |
| `Cliente D` | `Abastos Central` | — |
| `Cliente E` | `Abastos del Valle` | — |
| `Cliente F SRL` | `Abastos Ejemplo SRL` | — |
| `Ecuador / Pichincha / Quito (<barrio de origen>) / <dirección de origen>` | `País Ficticio / Región Norte / Ciudad Ejemplo (Barrio Uno) / Avenida Principal` | — |

- **Por qué estos nombres:**
  - Conservan el orden alfabético que prueban los tests:
    - `informe-picking.test.ts` (476/R3) ordena por nombre `cliente A < el integrador < cliente B`, y pasa a
      `Abarrotes < Mercadito < Surtidora`;
    - `ParamsPicking.test.tsx` pinta las tiendas en ese orden;
    - en las tablas de productos, `cliente C < el integrador` pasa a `Comercial Luna < Mercadito`.
  - Son sustantivos comunes y no tienen tilde, así que el slug del nombre de archivo del picking no
    cambia de forma (`picking-<nombre>-<fecha>.pdf`).
  - Cada uno conserva el número de palabras del original, así que no cambian los casos de «nombre ·
    descripción» ni de «nombre + apellido».
- **Expectativas derivadas que hay que mover a la vez:**
  - el email y la cédula sintéticos;
  - los textos concatenados de `ParamsPicking` (`"Abarrotes25 órdenes · 2 atrasadas"`, …);
  - las regex de `getByRole` (`/Abarrotes/`, `/Mercadito/`, `/Surtidora/`), cada una distinta de las
    otras dos;
  - los motivos «La tienda «Abarrotes» …»;
  - el pie `Ordenex · Picking Abarrotes · …`, donde «Ordenex» se queda porque es de SL-15.
- **No se tocan:** las remisiones `NUF-API-1` / `NUF-WEB-1`, que no contienen ningún término.

### D6 — Diseños y docs (R1, R7)

- **Diseños** (los cinco HTML y `canvas.json`): se sustituyen los nombres por los de D5 y nada más.
- **`docs/plan-saas.md`** (sobre `dev` con `60befb1`):
  - la línea 14 pasa a «Copia del árbol del repo de Ordenex, rama `dev`, en el commit `f34f0f6d…`»;
  - se quita el paréntesis con el nombre del integrador de la fase 1.
- **`docs/limpieza-ordenex.md`:**
  - la regla 2 pasa a «el integrador de Ordenex y sus clientes»;
  - la §6, «Integradores y clientes de Ordenex», pasa a «Hecho por SL-13»: cita la guardia de D1 y
    sus términos como la medida, y nombra las dos excepciones;
  - se quita la lista de 58 archivos.

### D7 — Configuración mínima del país para el centro del mapa (R15, R16) — ampliación

- **Archivo nuevo: `lib/config/pais.ts`.** Lleva solo constantes y tipos: sin `process.env`, sin
  Prisma y sin `server-only`. Así lo puede importar `RutaMapaInner.tsx`, que es un componente de
  cliente (Leaflet).
  ```ts
  /** Mínimo de la fase 1. La fase 3 (SL-20) lo amplía y lo resuelve por empresa. */
  export interface ConfiguracionPais {
    /** ISO 3166-1 alfa-2. */
    codigo: string;
    /** Centro del mapa cuando no hay ningún punto que encuadrar: [lat, lng]. */
    centroMapa: readonly [number, number];
  }
  export const PAIS_DE_OPERACION: ConfiguracionPais = { codigo: "CR", centroMapa: [9.9281, -84.0907] };
  ```
- **El valor.**
  - Costa Rica, porque es el país de operación que el código ya fija (`lib/geo/direccion-query.ts`:
    «todas las ordenes son de Costa Rica»).
  - El centro es San José (9.9281, -84.0907), un dato geográfico público, no un dato de cliente.
  - Corrige además un defecto heredado: el respaldo apuntaba a Quito en una app que solo opera en
    Costa Rica.
- **Cambio visible.** Solo en el caso degenerado (una ruta sin ningún punto), que ahora abre en San
  José y no en Quito. Con un punto o más, `AjustarEncuadre`/`FitBounds` re-encuadra igual que hoy.
- **`RutaMapaInner.tsx`:** `center={puntosEncuadre[0] ?? PAIS_DE_OPERACION.centroMapa}`. El tipo
  `LatLngTuple` acepta la tupla; si `readonly` choca con el tipo de Leaflet, se copia con
  `[...centroMapa]` y no se toca el tipo de la config.
- **`UbicacionMapaInner.tsx`:** se borran `CENTRO_FALLBACK` y su comentario, porque no se usan.
- **Test nuevo, `tests/unit/config/pais.test.ts`.**
  - Comprueba el código ISO de dos letras y los rangos de `lat`/`lng`.
  - Afirma el literal `{ codigo: "CR", centroMapa: [9.9281, -84.0907] }` como contrato, no contra su
    propia fuente.
- **Sin dependencias nuevas.**

## Alternativas descartadas

- **A. Dejar las migraciones intactas, fijadas por hash** (era la versión anterior del spec). Solo se
  justificaba si había que conservar una base, y no la hay. Con la decisión 6 sería herencia sin fecha
  de retirada.
- **B. Vaciar la 459 en vez de quitarla.** Pide el mismo reset y deja una carpeta con nombre de
  Ordenex que no hace nada. Su fixture perdería las marcas igual, así que sus dependientes cambian de
  todas formas.
- **C. Una migración nueva que «anule» la 459.** No hay nada que anular, y sería una migración más.
- **D. Meter `test-citado-desaparecido` en el baseline.** La guardia quedaría ciega para todas las
  fichas por dos citas conocidas.
- **E. Anotar `@test-desaparecido` en `specs/459` y `specs/461`.** Esos specs heredados no se tocan
  (R13).
- **F. Vetar «Ecuador» y «distribuidora» como palabras enteras.** Pondría en rojo un país legítimo de
  la fase 3 (el plan exige varios países, decisión 2) y un tipo de comercio corriente. Se vetan solo
  las cadenas exactas que se retiran (D1) y la cita del único archivo con datos reales (R4).
- **J. Centro del mapa en una variable de entorno (`NEXT_PUBLIC_…`).** Pasa el dato a la infraestructura
  y no a la configuración del país que la fase 3 va a ampliar por empresa. Además, un `.env` sin la
  variable deja el mapa sin centro.
- **K. Sacar el centro de la geografía en base de datos** (`GeografiaService`). El componente de
  cliente necesitaría una llamada al servidor para un caso degenerado, y la tabla de geografía no
  tiene centroides. Es diseño de la fase 3, no un arreglo mínimo.
- **G. Borrar también `cobro_manual_reclasificado` y sus lectores.** Va más allá del arreglo mínimo:
  es deuda (decisión cerrada).
- **H. Excluir `progress/` del barrido.** Abre un hueco donde Ordenex guardaba datos del integrador
  (el CSV de la 459 vivía ahí). La cadena `fuera-nuform` ya cubre el único uso legítimo.
- **I. Nombres como «Tienda Demo 1/2/3».** Rompen el orden alfabético que prueban los tests y el
  número de palabras.

## Trampas para el implementer

- **SL-10 primero.** `tests/baseline-rojos.json` y la versión de `test-citado-desaparecido` que se
  toca vienen de SL-10. Rebasa sobre un `dev` que la tenga y que incluya `60befb1`.
- **En `progress/impl_SL-13.md` y en los commits**, los nombres prohibidos solo pueden ir dentro del
  slug `fuera-nuform`. Escribe «el integrador» y «sus clientes».
- **Reset solo en local.** Antes de `migrate reset`, confirma que `DATABASE_URL` no apunta a
  un proyecto Supabase de la app de origen (ids en la memoria local del leader). Si apunta, para.
- **Un test de integración saltado no cuenta como verde.** R10 exige verlos ejecutados y anotar
  cuántos casos corrieron.
- **Rompe las guardias antes de creerlas.** Cada prueba, con su salida anotada y restaurando desde
  copia:
  - un archivo nuevo sin versionar con «cliente B» pone en rojo la de D1;
  - devolver `Distribuidora` al comentario de `ProductosTabla.tsx` la pone en rojo;
  - devolver `[-0.1807, -78.4678]` a `RutaMapaInner.tsx` pone en rojo el caso de R15;
  - quitar una excepción de D4 pone en rojo `test-citado-desaparecido`.
- **R6 se mide:** casos por archivo antes y después con
  `pnpm exec vitest related --run --reporter=json <archivos>`.
- **Log del gate** a archivo, con `INIT_EXIT=$?` escrito dentro.

## Dependencias de terceros

Ninguna nueva (`node:fs` y `node:child_process` vienen con Node).
