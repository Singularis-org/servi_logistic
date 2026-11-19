# SLT-213 «Mensajes de validación en inglés en prod: la config de zod en español se pisa entre chunks»

**Ruta: ligera.** Se cambia una línea de configuración y sus comentarios, sin tocar esquema,
migraciones, dinero, permisos ni autenticación. La ficha llega sin `ruta` en `feature_list.json`, así
que el leader tiene que poner el label `ruta:ligera` antes de aprobar el spec, o subirla a la completa.

## Alcance

Los mensajes **por defecto** de zod, es decir, los de los esquemas que no traen mensaje propio,
tienen que salir siempre en español, en cualquier orden de carga de los chunks y en cualquier
instancia del servidor. Eso abarca los 422 de `/api/ordenes/api-key/*`, los errores de campo de las
server actions (`normalizeError`) y la validación de cliente de los formularios.

**Lo que NO entra:**
- Redactar mensajes propios campo por campo. El mapa genérico de `lib/validacion/zod-es.ts` no cambia
  de texto.
- La copia de zod 3.25.76, que solo usan `@modelcontextprotocol/sdk` y `zod-to-json-schema`, guarda su
  configuración en una variable del módulo y no la importa nada de `app/` ni de `lib/`
  (`progress/review_SLT-208.md > V4-1`).
- Cambiar cómo empaqueta Next (`next.config.ts`).

## Lo que ya existe

Se buscó `zod`, `localeError`, `customError`, `zod-es` y «en inglés» en `feature_list.json`, en
`specs/` y en el código (Grep: el grafo no tiene indexado este worktree).
- No hay otra ficha sobre esto. SLT-40 nombra zod por otro motivo, el strip del webhook.
- `specs/`: solo `SL-8-marca-logo-paleta-fuente/tasks.md` cita el test `zod-es.test.tsx`.
- Código que se reutiliza, sin re-crear nada:
  - `lib/validacion/zod-es.ts`: el mapa `mensajeZodEs` y `configurarZodEnEspanol()`.
  - Los dos puntos de entrada que lo cargan: `instrumentation.ts` en el servidor y
    `components/shared/ZodEnEspanol.tsx` en el cliente.
  - Los tests `tests/unit/validacion/zod-es.test.tsx` y
    `tests/unit/types/carga-fila-clave-ausente-slt208.test.ts`.
  - El E2E `e2e/guia-api-ejemplos-ejecutables.spec.ts`, que ya monta claves de API contra `next start`.

## Causa (confirmada en el código de zod 4.4.3, en `node_modules`, solo lectura)

- `zod/v4/core/core.js:72-77`: `globalConfig` es `globalThis.__zod_globalConfig`, un único objeto que
  comparten todas las copias del proceso o de la pestaña. `config(x)` hace `Object.assign(globalConfig, x)`.
- `zod/v4/classic/external.js:10` ejecuta `config(en())` **cada vez que se evalúa** una copia del
  módulo, y `en()` devuelve `{ localeError: … }` (`zod/v4/locales/en.js:111`). Por eso cualquier chunk
  con su propia copia de zod que se evalúe después de `register()` deja `localeError` en inglés en todo
  el proceso.
- `zod/v4/core/util.js:558-564` (`finalizeIssue`) decide el mensaje en este orden:
  `iss.message` → `error` del esquema → `error` del `parse` → **`config.customError`** →
  `config.localeError` → `"Invalid input"`.
- Hoy `configurarZodEnEspanol()` escribe `localeError` (`lib/validacion/zod-es.ts:101`), que es
  justo la clave que cada copia nueva sobrescribe.
- Ningún archivo de zod escribe `customError`. Solo lo escribe `setErrorMap` (`classic/compat.js:20`),
  que está deprecado y no se usa en `app/`, `lib/`, `components/` ni `tests/`.

El build tiene al menos tres chunks de zod en el servidor (`progress/review_SLT-208.md > V4-1`). El
síntoma ya se vio en CI con SLT-208, donde la clave ausente salía en inglés. El mecanismo está
probado en el código; el orden exacto de carga en `next start` lo tiene que reproducir T0.

## Arreglo propuesto (mínimo y determinista)

`configurarZodEnEspanol()` registra `mensajeZodEs` como **`customError`** en lugar de `localeError`.
Como ninguna copia de zod toca `customError` al evaluarse, el ajuste sobrevive a cualquier orden de
carga. El cambio no altera la precedencia que importa: el mensaje propio del esquema y el `error` del
`parse` siguen mandando, porque en `finalizeIssue` van antes que `customError`. Los dos puntos de
entrada y el mapa no cambian. Solo cambian esa línea y los comentarios que afirman que fijar la
configuración una vez basta para todas las copias (`zod-es.ts:14-19` e `instrumentation.ts:5-6`).

### Alternativas descartadas

1. **`serverExternalPackages: ["zod"]` en `next.config.ts`**, para tener una sola instancia en el
   servidor. Se descarta por cuatro motivos:
   - no cubre el navegador, donde también puede haber varios chunks de zod;
   - cambia el empaquetado de toda la app para arreglar una sola clave de configuración;
   - el resultado depende de cómo trate Next (Turbopack o Vercel) un paquete externo, no de nuestro
     código;
   - para comprobarlo hace falta un build, no basta un test unitario.
2. **Volver a llamar a `configurarZodEnEspanol()` justo antes de validar** (en `normalizeError`, en
   cada route handler o en los módulos de esquemas). Se descarta por tres motivos:
   - hay muchos puntos de uso, y cada ruta nueva tendría que acordarse de hacerlo;
   - sigue dependiendo del orden, porque un `import()` diferido entre la llamada y el `parse` lo vuelve
     a pisar;
   - la llamada en el módulo de esquemas corre una sola vez, al evaluarse, que es exactamente el
     problema que hay que resolver.
3. **Pasar `{ error: mensajeZodEs }` en cada `safeParse`/`parse`.** Es determinista, pero toca todas
   las llamadas de la app, y cualquier `parse` nuevo que lo olvide vuelve a salir en inglés.
4. **Interceptar `globalThis.__zod_globalConfig`** con un `Proxy` o `defineProperty` que ignore el
   `localeError` en inglés. Depende de detalles internos de zod, no de su API pública. En cambio,
   `customError` es una opción documentada en `core.d.ts:62` («Overrides `config().localeError`»).

**Riesgo del arreglo elegido:** si una versión futura de zod empezara a escribir `customError` al
evaluarse, el problema volvería. El test de R1 lo detecta: se pondría en rojo al subir zod.

## Requisitos (EARS)

- **R1.** CUANDO se evalúa otra copia del módulo de zod (`zod/v4/classic/external.js`) después de
  cargar `lib/validacion/zod-es.ts`, el sistema DEBE seguir dando, en los esquemas sin mensaje propio,
  los mensajes en español de `mensajeZodEs`. Ejemplos: «Este campo es obligatorio» para una clave
  ausente, «Debe tener al menos 3 caracteres», «Escribe un correo válido», «Elige una opción válida» y
  «Debe ser un número».
- **R2.** CUANDO esa otra copia de zod se evalúa ANTES de cargar `lib/validacion/zod-es.ts`, el sistema
  DEBE dar los mismos mensajes en español que en R1.
- **R3.** SI un esquema trae su propio mensaje, o el `parse` recibe un `error`, ENTONCES el sistema DEBE
  usar ese mensaje y no el genérico en español, también después de evaluar otra copia de zod.
- **R4.** CUANDO un integrador con una clave de API válida envía `POST /api/ordenes/api-key/cotizacion`
  con el cuerpo `{}` a un servidor `next start`, después de que ese mismo proceso ya atendió peticiones a
  otras rutas de la API y a una página, el sistema DEBE responder 422 con
  `fieldErrors.ordenes = ["Este campo es obligatorio"]`.
- **R5.** CUANDO `instrumentation.ts > register()` o `components/shared/ZodEnEspanol.tsx` cargan la
  configuración y después se evalúa otra copia de zod, el sistema DEBE dar los mensajes en español de R1.
  Esto protege los dos puntos de entrada, servidor y cliente.

### Trazabilidad prevista

| R | Test |
|---|---|
| R1, R2, R3 | `tests/unit/validacion/zod-es-copias.test.ts` (nuevo) |
| R4 | `e2e/guia-api-ejemplos-ejecutables.spec.ts`: caso nuevo, cotización con `{}` |
| R5 | `tests/unit/validacion/zod-es.test.tsx`, bloque «los puntos de entrada de la app LO CARGAN», con otra copia de zod evaluada después |

## Tasks

- [ ] **T0. Reproducir antes de arreglar** (`next start`, base desechable nueva, `.env` copiado al
  worktree sin imprimirlo).
  - Pasos: `next build`, `next start`, una petición a una página y a otra ruta de `/api/ordenes/api-key/*`,
    y luego `POST /api/ordenes/api-key/cotizacion` con `{}` y una clave válida.
  - Se anota en `progress/impl_SLT-213.md` el status y el `fieldErrors.ordenes` literal, sin la clave ni
    URLs.
  - **Hecho:** queda escrito el mensaje en inglés y el orden de peticiones que lo produce. Si en ningún
    orden sale en inglés, PARA y avisa al leader con lo que probaste: la hipótesis del orden no queda
    confirmada en `next start`, y el leader decide si se sigue solo con el test de mecanismo.
- [ ] **T1. Test rojo de R1–R3** en `tests/unit/validacion/zod-es-copias.test.ts`.
  - La «otra copia» tiene que ser el código real de zod: un `import()` del archivo resuelto
    `zod/v4/classic/external.js` con un query string que obligue a evaluarlo de nuevo, con lo que vuelve
    a correr la línea 10. Si vitest no permite evaluarlo dos veces, se ejecuta lo mismo que esa línea,
    `z.config(z.locales.en())`, y el test lo explica en un comentario.
  - Cubre los dos órdenes (R1 y R2) y un caso con mensaje propio del esquema y con `error` del `parse`
    (R3).
  - **Hecho:** con el código actual, que escribe `localeError`, el test de R1 sale **rojo**. Se anotan el
    número de casos rojos y la salida en `progress/impl_SLT-213.md`.
- [ ] **T2. Arreglo** en `lib/validacion/zod-es.ts`: `configurarZodEnEspanol()` registra el mapa como
  `customError`. Se reescriben los comentarios de `zod-es.ts:14-19` e `instrumentation.ts:5-6` para
  explicar por qué es `customError` (cada copia pisa `localeError`).
  - **Hecho:** T1 en verde. Mutación: con `localeError` en lugar de `customError`, T1 vuelve a rojo, y se
    anota.
- [ ] **T3. Ajustar los tests que apagan el mapa global** (dependen de T2):
  - En `tests/unit/validacion/zod-es.test.tsx`, `zodEnIngles()` también limpia `customError`. Su
    `expect(... /Too small/)` lo comprueba.
  - En los casos de R5, después del punto de entrada se evalúa otra copia de zod antes de comprobar el
    español.
  - En `tests/unit/types/carga-fila-clave-ausente-slt208.test.ts`, cada `z.config({ localeError:
    undefined })` también pone `customError: undefined`. Si no, el test pasaría con el mapa global y
    dejaría de medir el arreglo de SLT-208.
  - **Hecho:**
    - la mutación de SLT-208 (volver a `.string()` sin `error` en `lib/types/carga-masiva.ts`) da otra vez
      **4 failed**, y se restaura;
    - una mutación de R5 (quitar el `import` de `instrumentation.ts`) pone en rojo su caso.
- [ ] **T4. E2E de R4** en `e2e/guia-api-ejemplos-ejecutables.spec.ts`: un caso que, con la clave del
  escenario que ya monta el archivo, envía `{}` a la cotización y espera `422` con
  `fieldErrors.ordenes == ["Este campo es obligatorio"]`. El caso corre después de los casos que ya
  llaman a otras rutas.
  - **Hecho:** verde en local tras `next build` (base desechable, `E2E_PUERTO` si hay otro servidor).
    Con el arreglo de T2 retirado, sale **rojo** en el orden de T0, o se explica por qué el orden de
    Playwright no lo reproduce.
- [ ] **T5. Comprobación con `next start` después del arreglo:** se repite la secuencia de T0 y se anota
  el 422 en español en `progress/impl_SLT-213.md`.
  - **Hecho:** el mensaje literal «Este campo es obligatorio» queda anotado junto al de T0.
- [ ] **T6. Gate:** `./init.sh` en verde, con la base desechable exportada antes de cualquier vitest.
  - **Hecho:** `INIT_EXIT=0` escrito en el log.

Dependencias: T0 → T1 → T2 → T3 → T4 → T5 → T6. T4 se puede escribir en paralelo a T3 [P], pero se
valida después de T2.

## Archivos esperados

- `lib/validacion/zod-es.ts`
- `instrumentation.ts`
- `tests/unit/validacion/zod-es-copias.test.ts`
- `tests/unit/validacion/zod-es.test.tsx`
- `tests/unit/types/carga-fila-clave-ausente-slt208.test.ts`
- `e2e/guia-api-ejemplos-ejecutables.spec.ts`
- `progress/impl_SLT-213.md`

## Tamaño

Son 7 archivos de 40. Unas 15 líneas de producción, casi todas comentario, y unas 150 de tests.

## Preguntas abiertas

1. **CHANGELOG de la API.** Para el integrador, varios 422 que hoy pueden salir en inglés pasarán a
   salir siempre en español. ¿Va una entrada en el CHANGELOG público de la API, como las de SLT-203, o
   no, porque la guía ya documenta los mensajes en español y esto solo corrige un fallo? Si no se
   responde, el spec no la incluye.
2. **Ruta.** La ficha no tiene `ruta` en el board. Este spec está escrito para la ligera; si Carlos
   prefiere la completa, hay que añadir `design.md` y `tasks.md`.
