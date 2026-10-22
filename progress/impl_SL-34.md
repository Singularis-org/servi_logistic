# impl_SL-34 — bitácora (backend_dev)

> Ningún valor vigilado aparece en este archivo: se nombran por su clase y se ubican por
> `ruta:línea`. Los valores viven solo en el archivo de referencia local de R18, fuera del repo.

## T1 — Medición (2026-10-22, rama en `986e9ef`)

**Método.** Universo `git ls-files -z --cached --others --exclude-standard`, sin binarios (un `\0` en
los primeros 8 KB). Los 8 valores se leyeron por regex/posición de las líneas actuales del árbol
(`docs/perfil-agentes.md:10`, `specs/160-…/design.md:421` contrastado con `requirements.md:31`,
`specs/92-…/credenciales-google.md:85` contrastado con la l. 53, `specs/235-…/tasks.md:389`
contrastado con `specs/SL-13-…/design.md:116`, y la ruta de `specs/44-…/tasks.md:6` contrastada con
`specs/57-…/design.md:4`). El script de un solo uso emitió solo `(clase, largo, sha256)` y escribió el
archivo de referencia `clase=valor` en el scratchpad de la sesión; luego se borró.

**Tokens.** Tramos `[a-z0-9_-]` en minúsculas. El id GCP y la estación conservan su guion dentro del
token; el nombre corto GCP es el tramo anterior al primer guion del id.

### Los 8 vigilados

| Clase | Largo | sha256 |
|---|---|---|
| supabase-ref (uno de los dos) | 20 | `5a90bb618312dada235c0abc72c00d6df493b266880f9531c1688ea1d39f2d87` |
| supabase-ref (el otro) | 20 | `ff8fbc8104b321044f1c597d4cb267c53a9ee99aa68f6835dd04aaec24a75d82` |
| supabase-nombre | 10 | `c10a4ce318d936c397aa339b64e1c5c2fd642730344eefcaf32203a4ec652320` |
| gcp (id) | 21 | `9914bdb4789684b878b875c768c7c826fc61c10088c83371e8c4a92b2034ca6c` |
| gcp (nombre corto) | 10 | `0331c287532205424529f67ba5d706a0cd43d0eb2b9f90a894c56dac7d794e94` |
| github (cuenta) | 18 | `e9f9d3ae2e0390aa911fe890b34505016cb0387e75efe363f99b877d8cdecc2b` |
| persona | 7 | `65304dac3823069673aa9d3b90dcb9f44938e2d12f58509addc915d08922b64b` |
| estacion | 10 | `536387ebd4d8bc1c627584511decef2f5ea59aaf70740ce811889b5587e3c597` |

No se distingue cuál ref es la de producción y cuál la de preview: comparten clase y la guardia no lo
necesita.

### Suelo

- Universo: 6.179 rutas; 6.150 archivos de texto y 29 binarios. Cuenta ya la guardia nueva y esta
  bitácora.
- `MINIMO_ARCHIVOS = 6150`. SL-27, al retirar los `specs/` heredados, debe bajarlo en ese mismo cambio.

### Inventario: recursos reales de origen (39 apariciones en 25 archivos + 9 ocultas)

| Ubicación | Clase |
|---|---|
| `specs/172-liquidacion/tasks.md:102` | supabase-ref |
| `specs/215-reintento-en-cierre/tasks.md:54` | supabase-ref |
| `specs/215-reintento-en-cierre/design.md:621` | supabase-ref |
| `specs/215-reintento-en-cierre/requirements.md:444` | supabase-ref |
| `specs/484-puntero-gestion-colgado/tasks.md:79` | supabase-ref |
| `specs/SL-11-fuera-zonas-y-seeds-ordenex/design.md:267` | supabase-ref |
| `specs/SL-13-fuera-nuform/design.md:350` | supabase-ref |
| `specs/160-badge-intentos-entrega/requirements.md:31` | supabase-nombre |
| `specs/160-badge-intentos-entrega/design.md:421` | supabase-nombre |
| `specs/92-optimizacion-ruta-mensajero/credenciales-google.md:16, 53, 54, 85, 100, 121` | gcp |
| `specs/92-optimizacion-ruta-mensajero/credenciales-google.md:53` | service-account |
| `specs/235-ayuda-tienda-estatus/tasks.md:389` | github, github-url |
| `specs/SL-13-fuera-nuform/requirements.md:171` | github |
| `specs/SL-13-fuera-nuform/design.md:116` | github |
| `specs/284-pwa-correcta/requirements.md:47` | vercel |
| `specs/44-wallet-pago-mensajeros/tasks.md:6` | persona, estacion |
| `specs/57-logout/design.md:4` | persona, estacion |
| `docs/perfil-agentes.md:10` | supabase-ref |
| `docs/verification.md:36` | supabase-ref |
| `docs/plan-saas.md:44` | supabase-ref |
| `docs/limpieza-ordenex.md:740` | supabase-ref |
| `progress/impl_SL-11.md:13` | supabase-ref |
| `progress/impl_SL-13.md:169` | supabase-ref |
| `progress/review_SL-10.md:103` | dominio, email |
| `progress/review_SL-10.md:123` | dominio, email |
| `progress/review_SL-10.md:124` | dominio |
| `progress/impl_SL-14.md:1` | dominio |
| `progress/review_SL-14.md:1` | dominio |
| `tests/unit/guards/pwa-servida-sin-sesion.guardia.test.ts:10` | vercel |

Por clase: supabase-ref 13, supabase-nombre 2, gcp 6, service-account 1, github 3, github-url 1,
vercel 2, persona 2, estacion 2, dominio 5, email 2.

**Ocultas hoy por una excepción vigente de SL-14** (clase dominio; la guardia no las informa mientras
existan las 6 entradas de `specs/`; T3 las reescribe y poda esas entradas, R19):
`specs/86-landing-publica/requirements.md:25, 58, 157`,
`specs/288-variables-plantilla-desde-catalogo/design.md:138`,
`specs/404-mensajero-en-webhook-y-api/design.md:222`,
`specs/406-enlace-evidencias-webhook-identificador/design.md:280, 293`,
`specs/406-enlace-evidencias-webhook-identificador/tasks.md:122`,
`specs/426-api-401-json/requirements.md:6`.

Cuadra con `design.md > Inventario`: 31 archivos en total (21 de `specs/`, 4 de `docs/`, 5 de
`progress/`, 1 test). En `docs/limpieza-ordenex.md` §5 solo la l. 740 lleva un valor.

### Falsos positivos de forma y decisión

| # | Qué | Ubicaciones | Decisión |
|---|---|---|---|
| F1 | URL con credenciales (`esquema://u:p@host`) leída como email | `tests/unit/guards/jobs-recurrentes-con-siembra.guardia.test.ts:298`, `tests/unit/scripts/migrate-deploy-guardas.test.ts:11, 12, 101`, `tests/unit/services/analitica-rollup-handler.test.ts:310` | **Detector, ya aplicado en T2:** un match precedido de `:` o `/` (salvo `mailto:`) es la parte de credenciales de una URL, no un email. Contraprueba incluida. |
| F2 | URL de PR al repositorio de la plantilla del arnés | `arnes.lock.json:65` | **Detector, ya aplicado en T2:** R4 pide la URL «al repositorio de origen»; la forma `github-url` se limita a repos cuyo nombre contiene el nombre de la app de origen. La cuenta de origen sigue vigilada por hash. `arnes.lock.json` lo escribe `arnes-sync.sh` y no se edita a mano. Contraprueba incluida (otro repo da 0). |
| F3 | Emails inventados en dominios NO reservados (`ejemplo.com`, `ejemplo.cr`, `correo.com`, `x.com`, `x.co`, `persona.com`, `y.com`, `existe.com`) | 44 líneas en 24 archivos: 38 en `tests/`, 2 en `lib/types/plantilla-datos.ts:623, 812`, y 4 placeholders de UI: `app/_landing/PostularRecursoModal.tsx:316`, `app/login/_components/LoginForm.tsx:237`, `app/postulacion/_components/PostulacionForm.tsx:412`, `app/recuperar-contrasena/_components/RecuperarContrasenaForm.tsx:253` | **Arreglar el texto en la fase siguiente** (R7 no distingue inventado de real, y `x.com` o `correo.com` son dominios registrables): cambiar solo el dominio por uno reservado (`example.com`/`.net`/`.org` o el TLD `.test`), en la misma línea. Si un test compara ese email en otra línea, esa también sale en el barrido y se cambia igual. Los 4 de `app/` son texto visible (placeholder): es `frontend_dev`. Lista completa: salida de la guardia, clase `email`, fuera de `progress/`, `docs/` y `pnpm-lock.yaml`. |
| F4 | Placeholder de email en un archivo del arnés | `docs/jira.md:62, 68` (dominio `dominio.com`) | `docs/jira.md` está en `arnes.manifest` (R21 lo prohíbe aquí). **Decisión del leader, sin inventar ficha:** o se corrige en la plantilla (`/afinar-regla` + `arnes-sync.sh --subir`, regla 8) y llega con `--aplicar`, o entra una excepción temporal `docs/jira.md · email` con la ficha que haga ese arreglo. Hasta entonces la guardia lo informa. |
| F5 | Email público del autor de una dependencia transitiva, en su aviso `deprecated` | `pnpm-lock.yaml:3049` (`glob@7.2.3`) | Archivo generado; no se edita a mano. **Decisión del leader, sin inventar ficha:** excepción temporal `pnpm-lock.yaml · email` atada a la ficha que retire la dependencia deprecada (cae sola al actualizarla, y la poda de R16 pedirá borrarla). Hasta entonces la guardia lo informa. |
| F6 | Claves falsas de test con forma de secreto | `tests/unit/asistente/errores-no-filtran.test.ts:23` (sk-), `tests/unit/services/geocode-salud-service.test.ts:19` (AIza) | **Arreglar el texto en la fase siguiente** (lo prevé `design.md > Lo que no se marca`): armar la cadena por partes en la misma línea (`"sk-" + "…"`), que conserva el valor en ejecución y no casa la forma. |
| F7 | URL de base con contraseña falsa | `tests/integration/db/analytics-daily-migration.test.ts:610`, `tests/unit/scripts/migrate-deploy-guardas.test.ts:101` | Igual que F6: armar la URL por partes o usar un marcador `${…}`/`<…>`; misma línea. |

Los PEM de `tests/unit/auth/*`, `route-optimization-config.test.ts` y los hosts `x.supabase.co`,
`proyecto.supabase.co` y del pooler de los tests no casan: confirmado.


**Aviso: `dev` avanzó.** Esta medición es sobre la base `55f18ac`. `dev` está ya en `8cdbd44` (36
commits más, con SL-8), y su `e2e/marca.spec.ts` contiene 2 de los 8 valores (comprobado por script
contra el archivo de referencia, sin imprimirlos). Al traer `dev` a esta rama la guardia los informará;
el inventario se vuelve a medir entonces.

**Veredicto T1:** inventario medido (39 apariciones de origen + 9 ocultas por SL-14, 31 archivos), 8 hashes y suelo firmados, 7 grupos de falsos positivos con su decisión.

## T2 — La guardia, en rojo

`tests/unit/guards/recursos-origen-fuera.guardia.test.ts` (LF, 473 líneas). Importa
`lineasConDominio` y `EXCEPCIONES_DOMINIO` de la guardia de SL-14, que ya estaban exportados (no se
tocó). Efecto conocido: importar ese archivo registra también sus 9 casos dentro de esta corrida.

**Corrida sin `RECURSOS_ORIGEN_REF`** (`pnpm exec vitest run tests/unit/guards/recursos-origen-fuera.guardia.test.ts`):
- `Test Files 1 failed (1)`, `Tests 1 failed | 29 passed | 1 skipped (31)`. Falla solo el caso
  R1-R9, con `55 archivo(s), 90 aparicion(es)`; el skip es «R18 omitido: sin RECURSOS_ORIGEN_REF».
- Las 90 = las 39 del inventario + las 51 de F3-F7 (F1 y F2 ya no salen).
- Por clase: email 49, supabase-ref 13, gcp 6, dominio 5, github 3, supabase-nombre 2, persona 2,
  estacion 2, vercel 2, secreto-postgres-url 2, github-url 1, service-account 1, secreto-google 1,
  secreto-openai-anthropic 1.
- La salida se pasó por un script contra el archivo de referencia: 0 coincidencias con los valores.

**Corrida con `RECURSOS_ORIGEN_REF`** apuntando al archivo de referencia local:
`Test Files 1 failed (1)`, `Tests 1 failed | 30 passed (31)`. R18 pasa; sigue rojo solo R1-R9.
Con una letra cambiada en un valor del archivo de referencia, R18 sale en rojo (muerde), y su
mensaje compara claves `clase:largo:sha256`, nunca valores (0 coincidencias en la salida).

**Tiempo.** El barrido de todo el árbol tarda unos 6,5 s (el primer caso que lo pide); la corrida
entera, unos 8 s. Muy por debajo de los 20 s del diseño; la caché de hashes por token ya está puesta.

## Remedición tras traer `dev` (`3379ccb`)

Con `RECURSOS_ORIGEN_REF`: `Test Files 1 failed (1)`, `Tests 1 failed | 30 passed (31)`, con
`57 archivo(s), 94 aparicion(es)` (antes 55 y 90). Apariciones nuevas, todas de lo que trajo `dev`:
- `e2e/marca.spec.ts:35` · supabase-ref (la línea lleva los dos ids; el detector anota una por línea y clase);
- `progress/review_SL-8.md:47, 172, 200` · dominio.

Lo demás coincide con el inventario de T1.

## T3 — `specs/`

- 21 archivos de `specs/`, 30 líneas, cada una reescrita en su sitio con el marcador de
  `design.md > Marcadores` (prosa para Supabase, GitHub, despliegue y el dominio en prosa de `86`;
  `<GCP_PROJECT_ID>` / `<SA_EMAIL>` en `92`; `example.com` / `app.example.com` con su ruta en `288`,
  `404`, `406` y `426`; `<worktree-local>/<carpeta-de-la-feature>/` en `44` y `57`). En `SL-11` y
  `SL-13` la frase de la regla se reescribe sin ids, con la referencia a la memoria local del leader.
- `--numstat`: cada archivo `1 1`, `2 2`, `3 3` o `6 6`; ninguna cita `tests/…`/`e2e/…` ni `R<n>` cambia.
- Edición por un script del scratchpad que trabaja sobre la línea enmascarada (los valores pasan a
  `<<CLASE>>`) y rechaza escribir si queda alguno: ningún valor pasó por el texto de la edición.
- `tests/unit/guards/dominio-ordenex-fuera.guardia.test.ts`: fuera las 6 entradas de `specs/` y la
  constante `SL27`, que solo usaban ellas (R19). Quedan las 2 de SL-16.
- `pnpm exec vitest run tests/unit/guards/dominio-ordenex-fuera.guardia.test.ts`: `Test Files 1 passed (1)`, `Tests 9 passed (9)`.
- Guardia nueva: `42 archivo(s), 69 aparicion(es)`, ninguna bajo `specs/`.

## T4 — Docs del perfil y del plan (R12)

- `docs/perfil-agentes.md:10`, `docs/verification.md:36`, `docs/plan-saas.md:44` y
  `docs/limpieza-ordenex.md:738, 740`: la regla dice ahora «los proyectos Supabase de la app de
  origen; sus ids están en la memoria local del leader, fuera del repo; si un `.env` o un MCP apunta
  a uno de ellos, PARA», con la frase de cada doc. En `perfil-agentes` se añade, en la misma línea,
  que sin esa memoria se pregunta al leader (`design.md > Riesgos`). En `limpieza-ordenex` §5 el
  título no llevaba valor; la l. 740 lleva el marcador del diseño y la l. 738 suma el PARA, que §5
  no decía. `--numstat` `1 1` / `2 2`. Los marcadores `<!-- perfil: … -->` de `perfil-agentes` y
  `verification` no cambian; `plan-saas` y `limpieza-ordenex` no tienen.
- **Rojo heredado, arreglado aquí:** `no-embalaje` ya caía en la rama antes de T4 (comprobado con
  `git stash`), porque `specs/SL-34-…/requirements.md:102` y `tasks.md:50, 116` citan el nombre de
  archivo de ese guard. Opción mínima, la del precedente de SL-10 y de los specs 155/159/167: alta
  por archivo de esos dos en `WHITELIST_FILES` (+4 líneas en `tests/unit/guards/no-embalaje.test.ts`).
- `pnpm exec vitest run tests/unit/guards/no-embalaje.test.ts tests/unit/guards/sin-integrador-de-ordenex.guardia.test.ts`:
  `Test Files 2 passed (2)`, `Tests 7 passed (7)`.
- Guardia nueva en `docs/`: solo `docs/jira.md:62, 68` · email (F4, ver la excepción temporal).

## T5 — `progress/`, el comentario del test y `e2e/marca.spec.ts`

- `progress/impl_SL-11.md:13`, `impl_SL-13.md:169` → «los ids de proyecto Supabase de la app de
  origen»; `review_SL-10.md:103, 123, 124`, `impl_SL-14.md:1`, `review_SL-14.md:1` → «el email de
  soporte de origen» / «el dominio de origen». Además `progress/review_SL-8.md:47, 172, 200`, que
  trajo `dev` (mismo marcador). `tests/unit/guards/pwa-servida-sin-sesion.guardia.test.ts:10` →
  «el despliegue de producción de la app de origen».
- **`e2e/marca.spec.ts:35` y `:73`.** La lista de bases prohibidas comparaba la `DATABASE_URL` en
  minúsculas con `includes` contra los dos ids y `"supabase"`. Ahora la l. 35 guarda `"supabase"`
  en claro y los dos ids como su sha256 (los mismos de `VIGILADOS`), y la l. 73 prueba cada ventana
  de 20 caracteres de la URL contra esos hashes: es la misma semántica de subcadena. Equivalencia
  comprobada con un script del scratchpad contra el archivo de referencia (10 casos, incluidos
  mayúsculas, el id pegado a otras letras y el usuario del pooler: mismo resultado que la versión
  anterior). `--numstat` `2 2`; las dos líneas siguen siendo una cada una.
- `pnpm exec vitest run tests/unit/guards/pwa-servida-sin-sesion.guardia.test.ts`: `Test Files 1 passed (1)`, `Tests 11 passed (11)`.
- `pnpm exec eslint e2e/marca.spec.ts tests/unit/guards/pwa-servida-sin-sesion.guardia.test.ts`: sin
  avisos. `pnpm run typecheck` (incluye `e2e/`): `TC_EXIT=0`. El E2E no se corrió.
- Guardia nueva: `30 archivo(s), 51 aparicion(es)`; ninguna en `progress/`, `e2e/` ni en el test de PWA.

## F3, F6 y F7 — falsos positivos de forma, arreglados en su línea

- **F3.** 41 emails inventados en 40 líneas de 20 archivos (`lib/types/plantilla-datos.ts:623, 812`
  y 19 de `tests/`): solo cambia el dominio, por uno reservado, conservando mayúsculas.
  `ejemplo.com` → `example.com` (mismo largo); `ejemplo.cr`, `x.co`, `x.com`, `y.com`,
  `persona.com`, `existe.com` → el mismo nombre con TLD `.test`. Ningún archivo mezclaba dos de
  ellos, así que no hay colisiones. Las comparaciones entre líneas quedan coherentes porque todas
  las apariciones del dominio en esos archivos estaban en líneas marcadas (contado con `git grep`);
  la única fuera, `tests/unit/types/postulacion-recurso-schema.test.ts:136` (`"@…"` sin parte
  local, un tope de largo), no es un email para R7 y no se toca. `lib/types/plantilla-datos.ts` y
  `tests/fixtures/plantilla-datos.ts` cambian igual.
- **Los 4 de `app/` quedan para `frontend_dev`** (placeholders visibles): `app/_landing/PostularRecursoModal.tsx:316`,
  `app/login/_components/LoginForm.tsx:237`, `app/postulacion/_components/PostulacionForm.tsx:412`,
  `app/recuperar-contrasena/_components/RecuperarContrasenaForm.tsx:253`.
- **F6.** `tests/unit/asistente/errores-no-filtran.test.ts:23` y
  `tests/unit/services/geocode-salud-service.test.ts:19`: la cadena se arma por partes en la misma
  línea (`"sk-" + "…"`, `"AIza" + "…"`); el valor en ejecución no cambia.
- **F7.** `tests/integration/db/analytics-daily-migration.test.ts:610` y
  `tests/unit/scripts/migrate-deploy-guardas.test.ts:101`: igual, por partes. En la segunda el
  corte va justo antes de la `@`: cortado después de `u:`, la mitad derecha casaba como email.
- `tests/unit/auth/google-sa-token.test.ts` no se tocó y la guardia no lo marca.
- Corrida de los 22 tests tocados (`pnpm exec vitest run <los 22>`): `Test Files 22 passed (22)`,
  `Tests 358 passed | 15 skipped (373)`; los saltados son de integración, sin `DATABASE_URL` en la
  sesión (no cuentan como verde de SQL; este cambio no toca SQL).
- `pnpm exec vitest related --run lib/types/plantilla-datos.ts tests/fixtures/plantilla-datos.ts`:
  `Test Files 239 passed | 6 skipped (245)`, `Tests 3358 passed | 16 skipped (3374)`.
- `pnpm run typecheck`: `TC_EXIT=0`. `pnpm exec eslint <archivos tocados>`: `LINT_EXIT=0`.

## F4 y F5 — dos excepciones temporales, con la ficha pendiente del leader

- `EXCEPCIONES` de la guardia nueva deja de estar vacía:
  - `docs/jira.md` · email — ficha «pendiente (leader): corregir en la plantilla con /afinar-regla»;
  - `pnpm-lock.yaml` · email — ficha «pendiente (leader): retirar o actualizar glob@7».
  No se inventó número de ficha: **el leader tiene que crearlas o asignarlas** y poner aquí su `SL-<n>`.
- **Validador relajado, lo mínimo:** el caso «toda excepcion propia es temporal» pedía `^SL-\d+$`;
  ahora `FICHA_VALIDA = /^(?:SL-\d+|pendiente \(leader\): \S.*)$/`, que exige decir qué la retira.
  El caso lleva contrapruebas: `""`, `permanente`, `pendiente`, `pendiente (leader): ` y `SL-` no
  pasan. «ninguna excepcion propia sobra» sigue igual y las dos cubren algo hoy.

## Estado de la guardia al cerrar T3-T5 y F3-F7

Con `RECURSOS_ORIGEN_REF`: `Test Files 1 failed (1)`, `Tests 1 failed | 30 passed (31)`, con
`4 archivo(s), 4 aparicion(es)`, todas clase email y todas de `frontend_dev` (F3, `app/`):
`app/_landing/PostularRecursoModal.tsx:316`, `app/login/_components/LoginForm.tsx:237`,
`app/postulacion/_components/PostulacionForm.tsx:412`,
`app/recuperar-contrasena/_components/RecuperarContrasenaForm.tsx:253`.
Las clases `integrador` y `cliente` (R23) aún no existen en la guardia: son T5b, otra fase.

## Mapa R → test (parcial, T2-T5)

| R | Caso en `recursos-origen-fuera.guardia.test.ts` |
|---|---|
| R1-R9 | «R1-R9: ningun archivo del arbol nombra un recurso…» (rojo solo por las 4 líneas de `app/`) |
| R13 | «R13/R17: el universo no baja del suelo firmado» |
| R14 | «R14: el propio archivo de la guardia…» y las contrapruebas del detector |
| R15 | el mensaje del caso R1-R9 (`ruta:linea · clase`) |
| R16 | «toda excepcion propia es temporal: ficha SL-n (o pendiente del leader) y motivo», «ninguna excepcion propia sobra», «R16: una excepcion propia que no cubre nada sale nombrada» |
| R17 | «R17: cada vigilado tiene un sha256 de 64 hex», el suelo y las contrapruebas sintéticas |
| R18 | «R18: los valores de RECURSOS_ORIGEN_REF…» / «R18 omitido: sin RECURSOS_ORIGEN_REF» |
| R12 | la guardia (sin ids en los 4 docs) y el texto de la regla revisado en T4 |
| R19 | `tests/unit/guards/dominio-ordenex-fuera.guardia.test.ts` (verde tras la poda) |
| R20 | `test-citado-desaparecido`, `no-embalaje`, `sin-integrador-de-ordenex`, `pwa-servida-sin-sesion` |

## Verificación

- `pnpm run typecheck`: `TC_EXIT=0`.
- `pnpm exec eslint tests/unit/guards/recursos-origen-fuera.guardia.test.ts`: `LINT_EXIT=0`.

**Veredicto T1-T2:** guardia en rojo por las 39 apariciones de origen y 51 falsos positivos de forma
con su decisión; F4 y F5 necesitan una ficha del leader.

## Verificación T3-T5 y F3-F7 (2026-10-22)

- `pnpm exec vitest run tests/unit/guards/dominio-ordenex-fuera.guardia.test.ts tests/unit/guards/no-embalaje.test.ts tests/unit/guards/sin-integrador-de-ordenex.guardia.test.ts tests/unit/guards/pwa-servida-sin-sesion.guardia.test.ts tests/unit/guards/test-citado-desaparecido.guardia.test.ts`:
  `Test Files 5 passed (5)`, `Tests 42 passed (42)`.
- Guardia nueva con `RECURSOS_ORIGEN_REF`: `Tests 1 failed | 30 passed (31)`; sin ella:
  `Tests 1 failed | 29 passed | 1 skipped (31)`. El único rojo son las 4 líneas de `app/`.
- `pnpm run typecheck`: `TC_EXIT=0`. `pnpm exec eslint` de la guardia nueva: `LINT_EXIT=0`.
- Las salidas de las corridas y cada `git diff --cached` + mensaje de commit pasaron por un script
  contra el archivo de referencia: 0 coincidencias.
- No se corrió `./init.sh` ni el E2E (fuera del encargo de esta tanda).

**Veredicto T3-T5 y F3-F7:** hecho; la guardia solo informa las 4 líneas de `app/` (frontend_dev), y faltan T5b (R23), las dos fichas de F4/F5 (leader) y T6-T8.
- F3 (frontend_dev): placeholder de email en dominio reservado (`example.com`) en `app/_landing/PostularRecursoModal.tsx:316`, `app/login/_components/LoginForm.tsx:237`, `app/postulacion/_components/PostulacionForm.tsx:412` y `app/recuperar-contrasena/_components/RecuperarContrasenaForm.tsx:253`, misma línea (R7, R10); guardia 30 passed | 1 skipped, related 9 files / 102 tests verdes, typecheck y eslint limpios.

## T5b — El integrador y sus clientes (R23)

Ningún valor ni el mapa letra→cliente aparecen aquí. Los términos se leyeron por script de
`TERMINOS_PROHIBIDOS` de la guardia de SL-13; los scripts del scratchpad solo emitieron
`ruta:línea · clase`, conteos y hashes, y se borraron al terminar.

**Medición** (universo de la guardia nueva, sin distinguir mayúsculas):
- integrador y clientes, fuera del slug: 133 apariciones contando la guardia de SL-13; en `specs/`,
  91 líneas de 25 archivos. `progress/` y `docs/` no tenían ninguna fuera del slug.
- El slug de la ficha SL-13: 29 apariciones en contenido (12 sueltas, 17 como `SL-13-<slug>` en
  rutas y ramas) y 3 rutas. Se quedan: es la excepción temporal de R23.
- Formas pegadas: con guiones (`u-…`, `t-…`, `picking-…-2026`) y una pegada al principio de otra
  palabra (`…test`), solo en `specs/SL-13-…` y en la guardia de SL-13.

**Reescritura** (commit de líneas): 91 líneas en 25 archivos de `specs/`, `--numstat` igual en cada
archivo (92/92 con la de abajo), ninguna cita `tests/…`/`e2e/…` ni `R<n>` cambia (comprobado por
script por pares `-`/`+`). Marcadores «el integrador» (con «del/al integrador» donde la frase lo
pide) y «cliente A/B/C»; la misma letra para el mismo cliente en todo el árbol.
- Nombres de archivo e identificadores citados (no del slug): `picking-<cliente-a>-2026-10-05.pdf`
  en `specs/476-…/design.md:335` y `specs/SL-13-…/design.md:68`; las formas pegadas de los ejemplos
  de R3 de SL-13 pasan a `u-<integrador>`, `<INTEGRADOR>test`, `t-<CLIENTE-B>`; la consulta de
  `specs/457-…/design.md:673` pasa a `ILIKE '<integrador>%'`. Ningún test lee esos nombres.
- `progress/review_SL-13.md:31`: la muestra `Av- <calle>` sustituye a la calle de una de las otras
  cadenas. El detector por hash ya no distingue el signo entre palabras (ver abajo) y esa muestra,
  que la guardia vieja daba por limpia, la nueva la marca.

**Guardias** (commit de guardias):
- `tests/unit/guards/_terminos-por-hash.ts` (nuevo, no es un test): detector por SHA-256 de n-gramas
  de 1 a 3 palabras `[a-z0-9]+` en minúsculas unidas por un espacio, de la misma línea; un término de
  una palabra cuenta también pegado al principio o al final de otra. Una aparición dentro de un token
  `[a-z0-9_-]+` exceptuado (por hash) sale marcada. `SLUG_SL13` son los dos tokens del slug.
- `recursos-origen-fuera`: `VIGILADOS` pasa de 8 a 12 (1 `integrador`, 3 `cliente`; uno de dos
  palabras con `palabras: 2`). `EXCEPCIONES_TERMINO`: el slug, ficha «pendiente (leader): renombrar
  la ficha SL-13», con su poda (R16). Contrapruebas sintéticas nuevas con términos inventados
  (suelto, mayúsculas, guiones, pegado, n-grama con signos, n-grama partido, slug exceptuado en ruta,
  rama y suelto, excepción de otra clase, poda).
- `sin-integrador-de-ordenex` (SL-13): `TERMINOS_PROHIBIDOS` son 10 `{ largo, sha256 }` (los 4
  primeros, los mismos hashes de `VIGILADOS`). R1 reporta `ruta:línea (termino #k)`; R3 usa términos
  inventados; su única excepción es el slug (`SLUG_SL13`); se añade la autoprueba de que el propio
  archivo da cero; R4 y R15 no cambian; ruta y contenido se recorren una vez para R1 y la poda.
- Archivo de referencia de R18: +4 líneas (`integrador=` 1, `cliente=` 3) con la forma del hash.

**Decisiones mínimas**
1. **Quiénes son los tres clientes.** Las dos primeras cadenas de una palabra y la primera
   «Distribuidora …» (la de la tabla R6 original de SL-13; las otras tres son fixtures de la
   ampliación). Las otras seis cadenas de `TERMINOS_PROHIBIDOS` (tres fixtures «Distribuidora …» y
   tres de la dirección y el centro de Quito) **no se reescriben**: quedan en
   `specs/SL-13-…/{requirements,design}.md` y `specs/ordenes-carga-masiva-ui/design.md:98`. La guardia
   de SL-13 las sigue vetando por hash fuera de `specs/`. **Pendiente (leader):** decidir si también
   salen antes del push.
2. **Módulo compartido** en vez de importar de la guardia nueva: importar un `*.test.ts` registra sus
   casos en quien lo importa (el barrido de la guardia nueva y los 9 de SL-14 correrían dos veces).
3. **Campo `palabras`** (dato inocuo, como `largo`): sin él, cada par de palabras de largo 6 u 8 se
   hasheaba; el detector tardaba 8,6 s sobre el árbol. Con él y el barrido por caracteres, 1,7 s.
4. **SL-13 R2 pasa de dos excepciones a una:** la de ruta de la propia guardia ya no hace falta (no
   contiene los términos, y su poda lo habría exigido). La frase «exactamente dos» de
   `specs/SL-13-…/requirements.md` R2 no se editó (no nombra un término; R10/R21). **Para el leader.**
5. **El detector es más amplio que la regex de SL-13:** el signo entre las palabras de un término no
   importa (`.`, `-`, `~`). Marca de más, nunca de menos, salvo una aparición en medio de una palabra
   (no al principio ni al final), que ya no se marca.
6. Ningún archivo de `arnes.manifest` contenía los términos: no hace falta excepción F4.

**Comprobación de claro** (script del scratchpad): ningún archivo del universo contiene el
integrador ni los clientes fuera del slug (0 en 0 archivos); la guardia de SL-13 no contiene ninguna
de las diez cadenas; el slug solo sale suelto o como `SL-13-<slug>`.

**Mutación** (archivo sin versionar en `progress/`, una cadena por línea más una línea con dos formas
pegadas; borrado después, `git status` limpio): `Test Files 2 failed (2)`, `Tests 2 failed | 45 passed (47)`.
La guardia nueva marca las 4 líneas de integrador y clientes (`· integrador`, `· cliente`) y la de
las formas pegadas; la de SL-13 marca las 10 cadenas (`termino #0` a `#9`) y las dos pegadas. Su
salida pasada por script contra el archivo de referencia y las 10 cadenas: 0 coincidencias.

**Corridas**
- Con `RECURSOS_ORIGEN_REF`: `pnpm exec vitest run tests/unit/guards/recursos-origen-fuera.guardia.test.ts tests/unit/guards/sin-integrador-de-ordenex.guardia.test.ts`
  → `Test Files 2 passed (2)`, `Tests 47 passed (47)` (R18 pasa con el archivo ampliado).
- Sin `RECURSOS_ORIGEN_REF`: las dos anteriores más `test-citado-desaparecido`, `no-embalaje`,
  `dominio-ordenex-fuera` y `origenes-admitidos-en-cierre` (los que leen los specs editados) →
  `Test Files 6 passed (6)`, `Tests 79 passed | 1 skipped (80)`; el skip es «R18 omitido».
- `pnpm run typecheck`: `TC_EXIT=0`. `pnpm exec eslint` de las dos guardias y el módulo: `LINT_EXIT=0`.
- Cada `git diff --cached` (líneas `+`) y cada mensaje de commit, contra el archivo de referencia:
  0 coincidencias (el slug, solo en rutas). En las líneas `+` del commit de reescritura siguen 6
  apariciones de las otras cadenas de la decisión 1, que ya estaban en esas líneas.

| R | Test |
|---|---|
| R23 | `recursos-origen-fuera.guardia.test.ts`: «R1-R9, R23: ningun archivo del arbol…», «R23: los diez terminos de SL-13 estan vigilados: el integrador, sus clientes y la direccion», las contrapruebas «R23: terminos de 1 a 3 palabras…», «ninguna excepcion propia sobra» y R18; `sin-integrador-de-ordenex.guardia.test.ts`: R1 (los dos casos), R2 y R3 |

**Veredicto T5b:** hecho; integrador y clientes fuera del árbol salvo el slug, vigilados por hash en
las dos guardias; quedan para el leader las otras seis cadenas en `specs/` y la frase R2 de SL-13.

## Las seis cadenas restantes de SL-13 (R23, decisión del implementer)

La guardia de SL-13 las veta y el repo será público: entran en R23. Medidas por script con el
detector real (forma de n-gramas, sin el slug), sin imprimirlas: 40 apariciones en 25 líneas de 3
archivos, todas en `specs/`. Fuera de esas líneas, 0; el slug de SL-13 sigue solo en rutas y ramas.

| Archivo | Líneas |
|---|---|
| `specs/SL-13-fuera-nuform/design.md` | 110, 111, 112, 113, 115, 137, 138, 139, 169, 171, 245, 246, 247, 248 |
| `specs/SL-13-fuera-nuform/requirements.md` | 55, 56, 57, 70, 71, 95, 96, 97, 98, 174 |
| `specs/ordenes-carga-masiva-ui/design.md` | 98 |

- Marcadores: los tres fixtures «Distribuidora …» pasan a «cliente D», «cliente E» y «cliente F»
  (siguen a A-C de T5b; mayúscula inicial donde el original la llevaba); el centro del mapa, a
  `<centro del mapa de origen>`.
- **Opción mínima, la dirección:** son dos cadenas (el barrio entre paréntesis y la calle), así
  que llevan dos marcadores para que la dirección se siga leyendo en cuatro partes:
  `<barrio de origen>` y `<dirección de origen>`.
- `design.md:169` es la muestra de R3 con doble espacio: pasa a `<Cliente  D>`, con el doble
  espacio. `design.md:171` es la muestra «no se marca» con el signo cambiado: solo cambia su
  segunda palabra, a `<calle>`, como `progress/review_SL-13.md:31` en T5b.
- Ninguna de las seis es un término genérico: no hizo falta otra opción.
- `--numstat` `14 14`, `10 10`, `1 1`; las citas `tests/…`/`e2e/…` y los `R<n>` de cada par `-`/`+`
  no cambian (script de T6). Commit `200023d`.
- **Discrepancia histórica, para el leader:** el R2 de `specs/SL-13-…/requirements.md` dice
  «exactamente dos» excepciones y la guardia de SL-13 tiene hoy una (el slug; decisión 4 de T5b).
  No se editó: la frase no nombra ningún término (R10, R21).

**La guardia nueva las vigila** (commit `8bae382`). R23 pide que la guardia nueva incorpore los
términos de la guardia de SL-13; con solo cuatro, `specs/` quedaba sin vigilar para las otras seis.
`VIGILADOS` pasa de 12 a 18, con los mismos hashes de la lista de SL-13: tres más de `cliente` y
tres de una clase nueva, `direccion` (desviación del diseño, que nombra solo `integrador` y
`cliente`; el reporte diría «cliente» de una calle). El caso pasa a «R23: los diez terminos de SL-13
estan vigilados: el integrador, sus clientes y la direccion». El comentario de `TERMINOS_PROHIBIDOS`
de la guardia de SL-13 dice ahora que los diez son los mismos hashes. Archivo de referencia de R18:
+6 líneas (`cliente=` 3, `direccion=` 3) con la forma del término, que es lo que R18 hashea.

- `RECURSOS_ORIGEN_REF=… pnpm exec vitest run tests/unit/guards/recursos-origen-fuera.guardia.test.ts tests/unit/guards/sin-integrador-de-ordenex.guardia.test.ts`:
  `Test Files 2 passed (2)`, `Tests 47 passed (47)`. Sin la variable: `Tests 46 passed | 1 skipped (47)`.
- `pnpm exec vitest run tests/unit/guards/test-citado-desaparecido.guardia.test.ts tests/unit/guards/sin-integrador-de-ordenex.guardia.test.ts`
  (tras la reescritura): `Test Files 2 passed (2)`, `Tests 22 passed (22)`.
- `pnpm run typecheck`: `TC_EXIT=0`. `pnpm exec eslint` de las dos guardias: `LINT_EXIT=0`.

## T6 — La guardia en verde y las ediciones son de línea

- Guardia nueva, sin `RECURSOS_ORIGEN_REF`: `Test Files 1 passed (1)`, `Tests 39 passed | 1 skipped (40)`
  (el skip es «R18 omitido»). Con ella: `Tests 40 passed (40)`.
- Script de `design.md > Reglas de edición` sobre `git diff dev...HEAD` (93 archivos en el diff):
  - fuera del recuento: los 6 archivos nuevos (la guardia, el módulo `_terminos-por-hash.ts`, los 3
    del spec de SL-34 y esta bitácora) y las ediciones de guardia (`sin-integrador-de-ordenex`, la
    poda de `dominio-ordenex-fuera` y el alta de `no-embalaje`);
  - **84 archivos, 210 líneas, 210 pares `-`/`+`: `--numstat` igual en todos, ninguna cita
    `tests/…`/`e2e/…` ni `R<n>` cambia, 0 archivos borrados. 0 fallos.**
  - El script se probó primero contra sí mismo: una línea añadida, un `R<n>` cambiado y una cita
    `tests/…` añadida en el árbol de trabajo dan sus 3 fallos (revertido, `git status` limpio).
    Corrección del propio script en el camino: dentro de un hunk, una línea quitada que empieza por
    `--` (un comentario SQL de `specs/457-…/design.md`) no es una cabecera `---`.
- `pnpm exec vitest run tests/unit/guards/test-citado-desaparecido.guardia.test.ts`:
  `Test Files 1 passed (1)`, `Tests 15 passed (15)`.

**Veredicto T6:** guardia verde con y sin referencia; todas las ediciones son de línea (84 archivos, 0 fallos) y no hay borrados.

## T7 — Comprobar que muerde, y cuánto tarda

Mutaciones una a una, aplicadas por un script del scratchpad (los valores salen del archivo de
referencia o se arman por partes; nunca pasan por el texto de la edición). Cada corrida es
`RECURSOS_ORIGEN_REF=… pnpm exec vitest run tests/unit/guards/recursos-origen-fuera.guardia.test.ts --reporter=verbose`.
Las 1-5 van en un archivo sin versionar, primero `specs/zz-mutacion-t34-<n>.md` y otra vez
`docs/zz-mutacion-t34-<n>.md`, borrado después; las 6-8 van sobre la guardia y se revierten con
`git checkout`. Tras cada una, `git status --porcelain` vacío.

| # | Mutación | Caso en rojo | Lo que informa (en `specs/` y en `docs/`) |
|---|---|---|---|
| 1 | los 18 valores del archivo de referencia, uno por línea (R1-R4, R9, R23) | «R1-R9, R23: ningun archivo del arbol…» (`Tests 1 failed \| 39 passed (40)`) | las 18 líneas: `supabase-ref` 2, `supabase-nombre`, `gcp` 2, `github` (y `integrador` en la misma línea: la cuenta contiene el término), `persona`, `estacion`, `integrador`, `cliente` 6, `direccion` 3 |
| 2 | un subdominio inventado de vercel.app (R5) | el mismo | `:1 · vercel` |
| 3 | el dominio de origen en una URL, armado desde el `DOMINIO` de la guardia de SL-14 (R6) | el mismo | `:1 · dominio` (ni `specs/` ni `docs/zz-…` tienen excepción) |
| 4 | un email en un dominio no reservado (R7) | el mismo | `:1 · email` |
| 5 | un JWT inventado (R8) | el mismo | `:1 · secreto-jwt` |
| 6 | un valor real en un comentario de la propia guardia (R14) | «R14: el propio archivo de la guardia…» y «R1-R9, R23…» (`Tests 2 failed \| 38 passed (40)`) | `recursos-origen-fuera.guardia.test.ts:27 · supabase-ref` |
| 7 | una excepción propia (`EXCEPCIONES`) que no cubre nada (R16) | «ninguna excepcion propia sobra» (`Tests 1 failed \| 39 passed (40)`) | la excepción nombrada por ruta, clase y ficha |
| 8 | `MINIMO_ARCHIVOS` = lo medido + 1 (6.161 + 1) (R17) | «R13/R17: el universo no baja del suelo firmado» (`Tests 1 failed \| 39 passed (40)`) | — |

- **R15:** la salida completa de cada corrida, la 1 incluida, pasó por un script contra el archivo
  de referencia y las diez cadenas (forma de n-gramas, sin el slug): **0 coincidencias en las 13**.
- El universo mide hoy 6.161 archivos de texto (suelo firmado: 6.150).

**Tiempo.** Dos corridas limpias de la guardia sobre todo el árbol: el caso que hace el barrido
(«R13/R17: el universo no baja del suelo firmado») tarda 10,0 s y 9,8 s; la corrida entera,
`Duration 11.5s` / `11.2s` (12,9 s / 12,5 s de reloj con `pnpm`). Durante las mutaciones, con la
máquina más cargada, el barrido llegó a 17,7 s y la corrida a 21-23 s de reloj. Está por debajo
de los 20 s del diseño, y la caché de hashes por token y por palabra ya está puesta; **es más que
los 6,5 s de T2**, con 18 vigilados y los n-gramas. Si CI se acerca a 20 s, hay que perfilar el
barrido antes de subir el umbral (`design.md > La guardia > Coste`).

**Veredicto T7:** las 8 mutaciones salen en rojo en su caso, en `specs/` y en `docs/`, sin el valor en la salida; barrido de ~10 s.

**Timeout bajo carga:** el barrido pasa a un `beforeAll` con plazo de 120 s en las dos guardias que recorren el arbol; bajo `vitest run tests/unit/guards` (202 archivos, 46,5 s) los casos que lo leen tardan 0 ms y no hay timeouts.

## T0 y T8 — Gate (implementer)

- **T0.** La rama contenía `dev` (`55f18ac`). El primer `./init.sh` salió con `INIT_EXIT=1`, y solo
  por el validador del board: la copia local de `feature_list.json` no tenía la ficha SL-34. El
  leader la importó (F0) durante la sesión. No se tocó la copia del board desde la feature.
- **Merge de `dev` (`8cdbd44`) en `3379ccb`**, sin conflictos. Trajo `e2e/marca.spec.ts` y
  `progress/review_SL-8.md` con valores, que se limpiaron en T5.
- **Primera corrida de T8:** `INIT_EXIT=1` por timeout, no por un hallazgo. El caso «R13/R17: el
  universo no baja del suelo firmado» cargaba con el barrido de todo el árbol (unos 10 s solo, más
  de 20 s bajo la carga del gate). Lo arregla `36d3e08`: el barrido va a un `beforeAll` de 120 s en
  las dos guardias.
- **Segunda corrida de T8** (`touch -r node_modules pnpm-lock.yaml`, `TEST_RAPIDO_BASE=dev`, log con
  `INIT_EXIT=$?` dentro):
  - `Test Files 275 passed | 6 skipped (281)`, `Tests 3885 passed | 32 skipped (3917)`;
  - `Test Files 288 passed | 2 skipped (290)`, `Tests 3915 passed | 20 skipped (3935)`;
  - `[test:rapido] 1 rojo(s) heredado(s) del baseline no cuentan en esta seleccion`;
  - `== init OK ==`, `INIT_EXIT=0` (R22). No salió «Instalando dependencias» ni «will be removed».
- **R21** sobre `git diff --name-only dev...HEAD` (93 archivos):
  - 0 borrados y 0 archivos de `arnes.manifest`;
  - los añadidos son la guardia nueva, `tests/unit/guards/_terminos-por-hash.ts`, esta bitácora y
    el spec de SL-34.
  - Fuera de las líneas reescritas también cambian:
    - la poda de SL-14;
    - el paso a hashes de la guardia de SL-13;
    - el alta de `no-embalaje` (ver T4).
- **Valores:** un script comparó los 18 valores de `RECURSOS_ORIGEN_REF` con los mensajes de
  `dev..HEAD` y con las líneas `+` de `git diff dev...HEAD`. Resultado:
  - 0 en los mensajes;
  - en las líneas `+`, solo el término del integrador dentro del slug de SL-13 (10 líneas, 0 fuera
    del slug), que es la excepción temporal de R23.

## Mapa R → test (final)

| R | Test |
|---|---|
| R1–R4, R9 | `tests/unit/guards/recursos-origen-fuera.guardia.test.ts` › «R1-R9, R23» (hash) + mutación 1 de T7 |
| R5 | ídem, clase `vercel` / `supabase-host` + mutación 2 |
| R6 | ídem, clase `dominio` (detector de SL-14 importado) + mutación 3 |
| R7 | ídem, clase `email` + mutación 4 |
| R8 | ídem, clases `secreto-*` + mutación 5 |
| R10, R11 | script de reglas de edición de T6 (84 archivos, 210 pares, 0 fallos) y contrapruebas de marcadores de la guardia |
| R12 | la guardia (sin ids en los 4 docs) y la revisión del texto de T4 |
| R13, R17 | ídem › «R13/R17: el universo no baja del suelo firmado», hashes de 64 hex, contrapruebas + mutación 8 |
| R14 | ídem › «R14: el propio archivo…» + mutación 6 |
| R15 | ídem › reporte `ruta:línea · clase`; salida de las 13 corridas de T7 con 0 valores |
| R16 | ídem › «ninguna excepcion propia sobra» + mutación 7 |
| R18 | ídem › caso R18 con `RECURSOS_ORIGEN_REF` (omitido sin la variable) |
| R19 | `tests/unit/guards/dominio-ordenex-fuera.guardia.test.ts` › «ninguna entrada sobra» |
| R20 | `test-citado-desaparecido`, `no-embalaje`, `sin-integrador-de-ordenex`, `pwa-servida-sin-sesion`, `origenes-admitidos-en-cierre` y el gate de T8 |
| R21 | revisión del diff de T8 (arriba) |
| R22 | `./init.sh`, `INIT_EXIT=0` |
| R23 | `recursos-origen-fuera.guardia.test.ts` › «R23: los diez terminos de SL-13 estan vigilados…» y `sin-integrador-de-ordenex.guardia.test.ts` (hashes) + mutación de T5b |

## Pendiente para el leader

- Asignar ficha a las tres excepciones temporales marcadas «pendiente (leader)»: `docs/jira.md`
  (email, plantilla del arnés), `pnpm-lock.yaml` (email del aviso de `glob@7`) y el slug de SL-13.
- El R2 del spec de SL-13 dice «exactamente dos» excepciones, y hoy la guardia tiene una:
  discrepancia histórica, no se editó.
- Mirar las desviaciones del diseño: `github-url` restringido al repo de origen (F2), la clase
  `direccion` para tres de los diez términos, y el alta de `no-embalaje`.
- El barrido tarda unos 10 s sobre el árbol, frente a 6,5 s en T2.
- Esta rama tiene los valores en las líneas `-` de su historia. No se empuja a un remoto público:
  se publica la rama huérfana.

## Decisiones del leader (2026-10-22)

- **Fichas de las excepciones temporales** (`5cd632e`):
  - email de `docs/jira.md` → SL-16;
  - email del aviso de `glob@7` en `pnpm-lock.yaml` → SL-16;
  - slug de SL-13 en rutas y ramas → SL-27.

  El validador de `ficha` vuelve a `^SL-\d+$`, y ya no queda ninguna «pendiente (leader)» en el código.
- **Las diez cadenas de SL-13:** se quedan reescritas, con su guardia por hash.
- **R2 de SL-13:** no se edita su spec. SL-34 deja `sin-integrador-de-ordenex.guardia.test.ts` con
  una excepción en vez de dos. La excepción por ruta de su propio archivo sobraba: desde R23 la
  guardia guarda los términos como `{ largo, sha256 }`, y ya no hay términos en claro que exceptuar.
  En su lugar tiene una autoprueba sobre sí misma. La única excepción que queda es la del slug de la
  ficha SL-13.
- **El archivo de referencia de R18** se queda en el scratchpad de la sesión y no se versiona.
  `git grep` comprobó que ningún archivo versionado lo cita por su nombre ni por una ruta absoluta
  del scratchpad o del perfil de usuario. La única ruta absoluta de usuario del árbol es un ejemplo
  de `docs/api/guia-integracion/README.md`, que es de SL-16 y no marca la guardia.
