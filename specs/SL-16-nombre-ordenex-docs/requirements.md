# SL-16 — Nombre «Ordenex» en docs, API y diseños

> Zona: fullstack · Complejidad: low · depends_on: SL-10, SL-15 (hereda su término de transición) ·
> Rama: `feature/SL-16-nombre-ordenex-docs`
>
> **Alcance.** Para cada artefacto de `docs/limpieza-ordenex.md` §3 que lleva el nombre de Ordenex,
> decidir con evidencia si se renombra, se retira o se deja. Los artefactos son `docs/api/` (con la
> colección de Postman), `docs/ayuda/`, `design-notificaciones/`, `design-whatsapp/`, `DESIGN.md` y
> además `.design-work/`. En lo que se queda, cambiar cada «Ordenex» por lo que corresponda:
> - «Servi Logistic» donde el texto habla de la plataforma;
> - el término de transición de SL-15 para `EMPRESA.nombre` donde habla de quien cobra, paga,
>   factura, debe o gana.
>
> Una guardia deja el resultado en **Ordenex cero**: toda aparición que quede es una excepción
> temporal que nombra la ficha que la retira. Como el contrato de la API vive en dos archivos que
> deben decir lo mismo, el alcance incluye también:
> - `lib/api/openapi-spec.ts` y `app/api-docs/route.ts`;
> - los tests de OpenAPI que leen estos artefactos (`design.md > Por qué el alcance toca código`).
>
> **Lo que NO entra.**
> - El dominio de la marca anterior: lo cambia SL-14 (variable de entorno). Aquí es una excepción temporal
>   que retira SL-14.
> - Renombrar en el código las cabeceras `X-Ordenex-Signature` / `X-Ordenex-Timestamp` y los
>   prefijos `ordx_` / `ordx_whsec_`: lo hizo SL-15, integrada antes que SL-16, que los dejó en
>   `X-Servi-Logistic-*` y `svl_` / `svl_whsec_`. **Corregido el 2026-10-22:** los docs los citan con
>   el nombre nuevo, igual que el código, y no hay excepción de identificador.
> - Las citas de `docs/ayuda/**` que reproducen un rótulo de la interfaz con «Ordenex»: SL-15 ya
>   cambió los rótulos en el código. **Corregido el 2026-10-22:** la ayuda pasa a decir el rótulo
>   nuevo y no hay excepción de cita; si T1 mide una cita cuyo rótulo sigue en el código, se anota y
>   se trata como hallazgo, no como excepción.
> - Las referencias al integrador de `design-notificaciones/` y `design-whatsapp/`: SL-13.
> - Los `specs/` heredados de Ordenex, aunque citen la ruta vieja de la colección o las maquetas: se
>   retiran más adelante (`docs/plan-saas.md`, decisión 6).
> - Costa Rica (provincias, SINPE, colones): fase 3.
> - Cualquier archivo listado en `arnes.manifest`.
> - Que la ayuda muestre el nombre real de cada empresa en lugar del término de transición: es de la
>   fase 2, junto a SL-17. Aquí los docs estáticos llevan el término como literal.
> - Retirar de `docs/limpieza-ordenex.md`, `docs/plan-saas.md` y `docs/marca.md` la historia del
>   origen del repo: lo hace SL-27, con los specs heredados. Aquí entran en el recorrido de la
>   guardia como excepción temporal.
> - Los datos de operación de Ordenex que no son el nombre (p. ej. «18 de los 37 usuarios activos»
>   en `docs/ayuda/README.md`): regla 3 de `docs/limpieza-ordenex.md`, otra ficha.

## Decisión por artefacto

Medido con Grep sobre el worktree el 2026-10-21. El detalle está en `design.md > Evidencia`.

| Artefacto | ¿Quién lo lee? | Decisión |
|---|---|---|
| `docs/ayuda/**` (12 archivos con el nombre) | **La app en producción**: `lib/ayuda/catalogo.ts`, `next.config.ts` (`outputFileTracingIncludes`) y el asistente. También 11 archivos de test por ruta, y más a través de `leerCatalogoAyuda` | **Renombrar** el texto |
| `docs/api/api-key-openapi.yaml` | 18 tests de `tests/unit/api/openapi-*` y la guardia `openapi-canal-rutas-reales` | **Renombrar**, a la vez que `lib/api/openapi-spec.ts` |
| `docs/api/CHANGELOG.md` | al menos 6 tests de `tests/unit/api/` | **Renombrar**; las entradas se conservan |
| `docs/api/ordenex-api-key.postman_collection.json` | `openapi-266-habilitar` y `openapi-320-eliminar` la parsean | **Renombrar el archivo** a `servi-logistic-api-key.postman_collection.json`, y su `info.name` |
| `docs/api/guia-integracion/` | `openapi-466-descripciones` lee el HTML | **Renombrar** |
| `docs/api/manual-metricas-por-mensajero.md` | `changelog-455`, `openapi-466`, `censo-order-status-rename` | **Dejar el archivo**; su dominio y su `ordx_` se cambian aquí (ajuste del 2026-10-22, R22) |
| `design-notificaciones/*.dc.html`, `design-whatsapp/**` | Nadie; los citan comentarios de código y de tests como contrato visual | **Renombrar** |
| `design-notificaciones/notificaciones-ordenex.html` | Nadie | **Retirar**: es una exportación duplicada del lienzo |
| `.design-work/` (16 archivos) | Nadie; solo lo citan dos specs heredados (283) | **Retirar** la carpeta entera (decisión del humano) |
| `DESIGN.md` | Nadie; lo citan en comentarios 48 archivos de código y de test | **Renombrar** el título y remitir a `docs/marca.md` |

## Requisitos (EARS)

### Destino de cada artefacto

- **R1.** El repositorio DEBE conservar en su ruta actual:
  - `docs/ayuda/`;
  - `docs/api/api-key-openapi.yaml`, `docs/api/CHANGELOG.md`,
    `docs/api/guia-integracion/guia-integracion.html` y `docs/api/manual-metricas-por-mensajero.md`;
  - `DESIGN.md`, `design-notificaciones/` y `design-whatsapp/`.
- **R2.** La colección de Postman DEBE estar en `docs/api/servi-logistic-api-key.postman_collection.json`,
  DEBE seguir siendo JSON válido y su `info.name` DEBE nombrar a «Servi Logistic».
  `docs/api/ordenex-api-key.postman_collection.json` NO DEBE existir.
- **R3.** `design-notificaciones/notificaciones-ordenex.html` NO DEBE existir.
- **R4.** `.design-work/` NO DEBE existir.
- **R5.** Ningún archivo del alcance DEBE tener «ordenex» en su ruta, en cualquier capitalización,
  salvo `docs/limpieza-ordenex.md`, que es una excepción temporal de la clase «historia» que retira
  SL-27. El alcance es la lista cerrada de `design.md > Alcance de la guardia`.

### El nombre

- **R6.** DONDE «Ordenex» designa el software, la aplicación, la API o la plataforma, el texto DEBE
  decir «Servi Logistic».
- **R7.** DONDE «Ordenex» designa a quien cobra, paga, factura, debe o gana, el texto DEBE decir el
  término de transición que fija SL-15 para `EMPRESA.nombre`, escrito como literal, y NO DEBE decir
  «Servi Logistic». Ese literal DEBE ser igual al valor de `EMPRESA.nombre` en el código.
  **Corregido el 2026-10-22:** SL-15 dejó `EMPRESA` en `lib/config/marca.ts` sin campo `nombre`, con
  dos formas: `EMPRESA.enFrase` = «la empresa» y `EMPRESA.alInicio` = «La empresa». El literal DEBE
  ser igual a `EMPRESA.enFrase`, o a `EMPRESA.alInicio` al inicio de frase.
- **R8.** Los archivos del alcance NO DEBEN contener «Ordenex» (en cualquier capitalización) ni
  `ordx_`, salvo las excepciones temporales de R9.
- **R9.** Cada excepción DEBE ser temporal y estar registrada con su clase y con la ficha que la
  retira. **Corregido el 2026-10-22** con lo que dejaron integrado SL-14 y SL-15:
  - el dominio de la marca anterior: SL-14 lo dejó como excepción de `docs/api/` con `ficha: "SL-16"` en
    `EXCEPCIONES_DOMINIO` (`tests/unit/guards/_dominio-heredado.ts`). Lo retira **SL-16** (R22): no
    queda excepción de dominio;
  - un identificador de plataforma (`X-Ordenex-*`, `ordx_`): SL-15 ya los renombró. No hay
    excepción; los docs citan `X-Servi-Logistic-*` y `svl_` / `svl_whsec_`;
  - una cita de un rótulo de la interfaz en `docs/ayuda/**`: SL-15 ya cambió los rótulos. No hay
    excepción; la ayuda cita el rótulo nuevo;
  - la historia del origen, que cubre el archivo entero en `docs/limpieza-ordenex.md`,
    `docs/plan-saas.md` y `docs/marca.md`, y que retira SL-27. Es la única clase que queda.
    (Medido en T1: `docs/marca.md` ya no tiene la palabra —la quitó SL-8—, así que su excepción
    nacería caducada por R12. Quedan dos: `docs/limpieza-ordenex.md` y `docs/plan-saas.md`;
    `docs/marca.md` se recorre sin excepción.)

  R10 y R11 se conservan como comprobaciones de que no vuelve una excepción de identificador o de
  cita sin su fuente: con la lista vacía de esas clases, la guardia las ejerce solo en sus
  contrapruebas sintéticas.

  SI una excepción no tiene ficha, ENTONCES la guardia DEBE fallar.
- **R10.** SI un identificador exceptuado ya no existe literalmente en el código (`lib/crypto/webhook-firma.ts`,
  `lib/utils/api-key-generator.ts`, `lib/utils/webhook-secret-generator.ts`), ENTONCES la guardia
  DEBE fallar nombrando el identificador y los archivos que todavía lo citan.
- **R11.** SI el fragmento de una cita exceptuada ya no existe literalmente en el código de `app/`,
  `components/` o `lib/` (espacios colapsados y sin comentarios), ENTONCES la guardia DEBE fallar
  nombrando el fragmento y los documentos de ayuda que lo citan.
- **R12.** SI una excepción registrada ya no aparece en ningún archivo del alcance, ENTONCES la guardia
  DEBE fallar pidiendo retirarla.
- **R13.** CUANDO la guardia encuentra una aparición no exceptuada, DEBE fallar nombrando el archivo,
  la línea y el texto que la rodea.
- **R14.** La guardia DEBE fallar en estos casos:
  - SI alguna raíz del alcance no existe;
  - SI recorre menos archivos que el suelo firmado.

  Además, su detector DEBE probarse con textos sintéticos para cada clase (nombre suelto, dominio,
  identificador, cita registrada, cita alterada y archivo de historia), cada uno con su resultado
  esperado.

### El contrato de la API

- **R15.** El título del contrato DEBE ser el mismo, y contener «Servi Logistic», en
  `openApiSpec.info.title`, en `info.title` de `docs/api/api-key-openapi.yaml` y en el `<title>` de la
  página que sirve `GET /api-docs`.
- **R16.** Toda descripción que esta feature cambie en `lib/api/openapi-spec.ts` DEBE aparecer igual,
  con los espacios colapsados, en `docs/api/api-key-openapi.yaml`.
- **R17.** Los tests que leen la colección de Postman DEBEN leerla en su ruta nueva y seguir afirmando
  lo mismo que hoy.

### La ayuda y el diseño

- **R18.** CUANDO se lee el catálogo de ayuda, el documento índice (`docs/ayuda/README.md`) DEBE
  tener el título «Ayuda de Servi Logistic».
- **R19.** `DESIGN.md` DEBE titularse con «Servi Logistic» y DEBE remitir a `docs/marca.md` como la
  fuente de la paleta, la tipografía y el logo. También DEBE aclarar que sus tokens de color
  describen `app/globals.css` hasta que SL-8 los migre.

### Cierre

- **R20.** El cambio NO DEBE modificar:
  - ningún archivo bajo `specs/` salvo `specs/SL-16-nombre-ordenex-docs/`;
  - ningún archivo listado en `arnes.manifest`, salvo `docs/jira.md` (R25, ampliación del leader
    del 2026-10-22);
  - el contenido que nombra al integrador (SL-13) ni los literales de geografía de Costa Rica, SINPE
    o colones. Una línea que los contiene puede cambiar solo para sustituir el nombre heredado; ese
    contenido no se toca (corregido tras la review del 2026-10-22, H5).
    (El dominio de la marca anterior sí se cambia en `docs/api/`: R22.)
- **R21.** CUANDO se corre `./init.sh` en el worktree de la feature, el gate DEBE terminar con código 0.

### Ajustes de la review de SL-15 y de SL-34 (leader, 2026-10-22)

- **R22.** Los archivos de `docs/api/` y `tests/unit/api/openapi-406-evidencias-url.test.ts` NO DEBEN
  contener el dominio de la marca anterior. Donde un ejemplo necesite un dominio, DEBE usar `example.com`,
  como hizo SL-14 con `evidenciasUrl`. `EXCEPCIONES_DOMINIO` de `tests/unit/guards/_dominio-heredado.ts`
  NO DEBE tener ninguna entrada con `ficha: "SL-16"`.
- **R23.** La descripción de `evidenciasUrl` (el `Bearer` con el prefijo de llave) DEBE decir lo
  mismo, con el prefijo `svl_`, en `lib/api/openapi-spec.ts`, en `docs/api/api-key-openapi.yaml` y en
  el test que la fija. Las excepciones con `retira: "SL-16"` de
  `tests/unit/guards/sin-nombre-heredado.guardia.test.ts` (diseños, `DESIGN.md`, `.design-work/`,
  rutas de `docs/` con la palabra, tests de `docs/` y esa línea del `Bearer`) NO DEBEN quedar: se
  retiran cuando su sujeto queda limpio.
- **R24.** En `pnpm-lock.yaml`, el email del aviso `deprecated` de `glob@7.2.3` viene del registro de
  npm (lo publica el autor del paquete) y el lockfile no se edita a mano. Su excepción en
  `tests/unit/guards/recursos-origen-fuera.guardia.test.ts` DEBE quedar como **permanente**,
  documentada con ese origen, y no atada a SL-16.
- **R25.** `docs/jira.md` NO DEBE contener un email real: el ejemplo pasa a `<tu-email>@example.com`.
  La excepción de ese archivo en `recursos-origen-fuera.guardia.test.ts` NO DEBE quedar. Como es un
  archivo del arnés, el cambio se anota en `progress/impl_SL-16.md` para subirlo a la plantilla con
  `./scripts/arnes-sync.sh --subir`.

## Preguntas abiertas

Ninguna. Las tres que quedaban las respondió el humano el 2026-10-21 (filas Q1–Q3 de la tabla).

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-21 | ¿Se tocan los `specs/` de Ordenex? | No: se retiran más adelante, cuando sea seguro (humano; `docs/plan-saas.md` dec. 6). → R20 |
| 2026-10-21 | ¿Se toca lo de Costa Rica? | No: es la fase 3 (humano, vía leader). → R20 |
| 2026-10-21 | ¿Quién cambia el dominio de la marca anterior en estos docs? | SL-14, como variable de entorno (humano, vía leader). → R9, R12, R20 |
| 2026-10-21 | ¿Cuál es la marca? | «Servi Logistic», `docs/marca.md` (humano). → R2, R6, R15, R18, R19 |
| 2026-10-21 | ¿Renombrar, retirar o dejar? | Por artefacto, con evidencia de quién lo lee (humano, vía leader). → R1–R5 |
| 2026-10-21 | «Ordenex» como operador (P1) | Servi Logistic es solo la plataforma. Quien cobra, paga, factura o debe es la empresa usuaria: el término de transición de SL-15 para `EMPRESA.nombre`, nunca «Servi Logistic». El software, la API y la plataforma son «Servi Logistic» (humano; `docs/plan-saas.md` dec. 4). → R6, R7 |
| 2026-10-21 | Citas de rótulos en la ayuda (P2) | Cambian con SL-15, en el mismo commit que el rótulo (humano). → R9, R11, R12 |
| 2026-10-21 | Archivos de OpenAPI en el inventario de SL-15 (P3) | Pasan a SL-16: `lib/api/openapi-spec.ts`, `app/api-docs/route.ts`, `tests/unit/api/openapi-{266-habilitar,320-eliminar,405-gestiones,webhook-estado-actualizado}.test.ts` (humano). → R15, R16, R17 |
| 2026-10-21 | Cabeceras `X-Ordenex-*` y prefijo `ordx_` (P4) | SL-15 los renombra con un nombre de plataforma. En SL-16 son una excepción temporal atada a SL-15 (humano). → R9, R10, R12 |
| 2026-10-21 | `.design-work/` (P5) | SL-16 lo absorbe y lo retira (humano). → R4 |
| 2026-10-21 | ¿De dónde sale el término de operador? (Q1) | SL-16 depende de SL-15 y hereda su término de transición; el enlace queda en Jira (humano). → R7 |
| 2026-10-21 | ¿Un literal en los docs estáticos? (Q2) | Sí, y la guardia lo compara con `EMPRESA.nombre`. El nombre real de cada empresa en la ayuda va a la fase 2, junto a SL-17 (humano). → R7 |
| 2026-10-21 | `docs/limpieza-ordenex.md`, `docs/plan-saas.md` y `docs/marca.md` (Q3) | Entran en el recorrido de la guardia como excepción temporal de la clase «historia» que retira SL-27, que retira los `specs/` heredados (humano). → R5, R9, R12 |
| 2026-10-21 | ¿Puede quedar algo de Ordenex? | No: cero en docs y diseños. Toda excepción es temporal y lleva la ficha que la retira (humano; `docs/plan-saas.md` dec. 6). → R8, R9, R12 |
