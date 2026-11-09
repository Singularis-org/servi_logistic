# Review — chore/ci-menos-rondas (2 commits sobre origin/dev)

Commits: b6e2159d (regla en `docs/perfil-agentes.md`) y 3a67fe06 (`e2e/tope-intentos-por-empresa.spec.ts`).
Rama `chore/`, sin spec SDD: no aplican trazabilidad R<n> ni tasks.

## Checklist
- [x] Typecheck (`NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit`): exit 0.
- [x] ESLint del spec: exit 0.
- [x] Aserciones del spec no se debilitan:
  - `leer()` ahora lanza si un cuerpo no se pudo leer (antes `.catch(() => "")` dejaba vacía en
    silencio la búsqueda en negativo). Ese era el hueco real; ahora el negativo
    `not.toMatch(/"umbral"|"tope"|topeIntentos|tope_intentos/)` puede fallar.
  - Control positivo intacto: `toContain('"enElTope":true')` / `'"enElTope":false'` (prueba que el
    lector ve las respuestas) y `toContain(MOTIVO_TOPE_EN_LA_RESPUESTA)` en el paso 4.
  - `leer()` se llama siempre antes de `context().close()` (líneas 436, 444, 532): ningún fetch
    queda pendiente al cerrar.
- [x] `route.fulfill` no altera lo que ve la página de forma relevante para el test:
  - `maxRedirects: 0`: el 3xx llega tal cual con su `location` y lo sigue el navegador.
  - Cabeceras: se copian todas menos `content-encoding`/`content-length`/`transfer-encoding`
    (correcto, el cuerpo de `route.fetch` ya viene descomprimido). `content-type` se mantiene, así
    que las Server Actions (`text/x-component`) llegan igual. `set-cookie` se conserva (Playwright
    parte los valores múltiples al cumplir) y además el `APIRequestContext` del contexto ya los
    guarda en el jar.
  - POST de Server Actions: `route.fetch` reenvía método, cabeceras y cuerpo del pedido original.
  - Solo `document`/`fetch`/`xhr` y fuera de `/_next/static/`; lo demás va por `route.fallback()`.
- [x] Las rutas viven en la `page` (`page.route`), y cada página sale de su propio contexto que se
  cierra en el mismo test: no se filtran a otros tests.
- [x] Ningún otro e2e lee cuerpos en `page.on("response")`: los tres que quedan
  (`dos-empresas-humo.spec.ts:201,482`, `planes-superadmin.spec.ts:163`) solo miran `status()`.
  `tarifas-valor-propio-mensajero.spec.ts:412` lee dentro de `page.evaluate` (fetch del navegador)
  y `planes-costeo.spec.ts:437` es un `APIResponse`: no usan CDP, no tienen el problema.
- [x] Regla del perfil coherente con `docs/gate.md` (E2E en CI solo en PR a producción; local
  para lo tocado), `AGENTS.md > F2.4` (amplía «los E2E que escribió o tocó» a «los que cubren lo
  tocado») y `CHECKPOINTS.md` (flujo crítico con salida local en `impl_<key>.md`). No contradice
  ni copia texto; `failOnFlakyTests` existe (`playwright.config.ts:61`), el proyecto `dinero`
  existe (`playwright.config.ts:124`) y `NEXT_PUBLIC_APP_URL` está en `gate.yml:372`.
- [x] Marcador `<!-- perfil: revisado=2026-11-08 por=Carlos -->` con la fecha de hoy.
- [x] Bloqueante nuevo del reviewer, en su sección y con «Por qué» fechado y con la ficha nombrada
  con título.

## Hallazgos
1. menor — `docs/perfil-agentes.md:1`: `por=Carlos`; los demás docs del perfil usan
   `por=Carlos Restrepo`. Cosmético.
2. menor — `docs/perfil-agentes.md` (final del archivo): el diff añade una línea vacía extra al
   final (termina en `\n\n`).
3. menor — `docs/perfil-agentes.md:28-30`: «El CI corre con `failOnFlakyTests`…» repite un dato
   que ya está en `docs/verification.md:60`. Es una cláusula de contexto, no un bloque duplicado;
   podría citar `docs/verification.md > El E2E` en su lugar.
4. menor — `e2e/tope-intentos-por-empresa.spec.ts:256-279`: `route.fetch` espera la respuesta
   entera antes de `fulfill`, así que en estas páginas se pierde el streaming progresivo de RSC
   (la página recibe todo de una vez). No afecta a lo que asierta el test (estado final), pero el
   comentario podría decirlo para quien copie el helper a un test que mire estados intermedios.

Sin bloqueantes. No corrí el E2E (el implementer informa 10/10; el leader no lo pidió).

## Veredicto
OK
