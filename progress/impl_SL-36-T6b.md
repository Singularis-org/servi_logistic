# SL-36 · T6.3 (Maps), T6.4 (rutas) y T6.5 (asistente) — bitácora de backend_dev

Fecha: 2026-10-25. Rama `feature/SL-36-integraciones-por-empresa`. Sin commit (lo hace el leader).
Las cuatro bajas de archivo (wif/adc y sus tests) quedan **en el índice** (`git rm --cached`): la guardia
`catalogo-postgres-acota-esquema` lista con `git ls-files` y se ponía roja con un archivo borrado sin indexar.
MCP del grafo no consultado: todo se leyó con Grep/Read.

## Archivos

Creados:
- `lib/services/integraciones/credencial-de-la-empresa.ts`: piezas comunes. `credencialesIntegracionReales()`,
  `empresaEnCurso(servicio, empresaDeLaSesion?)` y `fetchQueAvisaRechazo(base, esRechazo, alRechazar, etiqueta)` (R30).
- `lib/services/integraciones/rutas-de-la-empresa.ts`: `RutasPorEmpresa.deLaEmpresa()`.
  - Devuelve `{ organizacionId, projectId, getToken, fetchOptimizacion }`.
  - La caché del token va en un `Map<organizacionId, {huella, proveedor}>` (R28). La huella se saca de la
    integración y de la clave: si cambia una de las dos, el token se rehace.
  - Sin empresa, sin integración, credencial ilegible o clave mal formada → `RutaNoConfiguradoError(motivo)`,
    sin llamar a la red.
  - Rechazos (R30): un 400/401 en el intercambio marca `credencial_rechazada`; un 403 en `optimizeTours` marca `permiso`.
- `lib/services/integraciones/asistente-de-la-empresa.ts`: `asistenteDeLaEmpresa()`.
  - Devuelve `{ organizacionId, claveApi, fetchImpl }`.
  - Devuelve `null` sin empresa, sin integración o con credencial ilegible.
  - Un 401 marca `asistente.credencial_rechazada`.
- Tests nuevos:
  - `tests/unit/services/optimizacion-ruta-token-por-empresa.test.ts`: R28, R26, R29 y R30 de rutas (18 casos).
  - `tests/unit/services/integraciones-consumidores-composition-root.test.ts`: composition root estático y dinámico de los tres servicios.

Modificados (producción):
- `lib/config/geocode.ts`: solo `GEOCODE_TIMEOUT_MS`.
- `lib/services/GeocodificacionService.ts`:
  - el constructor pasa a ser `(ordenes, cache, credenciales: ICredencialesIntegracion, crearCliente: FabricaClienteGeocode, now, logger, salud)`;
  - la credencial se lee después de la caché;
  - si no está `lista`, lanza `GeocodeNoConfiguradoError`, marcado y con el texto «Google Maps no está configurado en la empresa»;
  - con `REQUEST_DENIED` llama a `marcarRechazo` con trato *best-effort* (`anotarRechazo`).
- `lib/services/jobs/geocodificacion-handler.ts`:
  - `buildGeocodificacionService(now, deps?)` pasa `credencialesIntegracionReales()` y una fábrica del cliente con `claveApi`;
  - no lee ninguna clave al construir.
- `lib/config/route-optimization.ts`: fuera las piezas de SA, WIF y ADC, el alias y el flag. Quedan `ROUTE_OPT_TIMEOUT_MS`, `RUTA_*` y `ROUTES_ROUTING_PREFERENCE`.
- `lib/auth/google-sa-token.ts`:
  - fuera el selector y los imports de WIF y ADC;
  - `construirTokenProvider(credencial: {email, privateKey}, opts)` pasa a ser el único modo.
- `lib/auth/google-token-shared.ts`:
  - `RutaNoConfiguradoError(motivo)` recibe una lista cerrada: `sin_configurar | ilegible | clave_mal_formada | sin_empresa`;
  - ya no nombra variables de entorno.
- **Borrados**: `lib/auth/google-wif-token.ts`, `lib/auth/google-adc-token.ts`, `tests/unit/auth/google-wif-token.test.ts` y `tests/unit/auth/google-adc-token.test.ts`.
- `lib/services/jobs/optimizacion-ruta-handler.ts`:
  - fuera el `tokenProvider ??=` de proceso;
  - una sola instancia de `RutasPorEmpresa` alimenta a los dos clientes;
  - `GoogleRouteOptimizationClient` se arma por llamada con el `projectId`, el `getToken` y el `fetchOptimizacion` de la empresa;
  - `GoogleRoutesClient` resuelve el token de forma perezosa en la empresa en curso;
  - deps opcionales `{credenciales, fetchImpl, empresaDeLaSesion}`.
- `lib/config/asistente.ts`: fuera `ANTHROPIC_API_KEY`.
- `lib/services/AsistenteService.ts`: `proveedor: IAsistenteProvider | null`. Con `null` responde `sin_credencial` **después del rol y antes del tope** (R27).
- `app/api/asistente/route.ts`:
  - `construirServicio(deps)` es asíncrono y toma la clave de `asistenteDeLaEmpresa`;
  - deps nuevas: `credenciales`, `empresaDeLaSesion`, `fetchImpl` y `usoRepo`;
  - texto nuevo de R27.
- `lib/services/whatsapp/whatsapp-de-la-empresa.ts`:
  - importa las piezas comunes;
  - `credencialesIntegracionReales` se re-exporta;
  - `empresaEnCurso(sesion?)` sigue con la misma firma.
- `app/api/cron/procesar-jobs/route.ts`: solo un comentario. Los builders compilan igual y leen la credencial
  en el job, dentro de `conSuEmpresa`.
- Comentarios que se habían quedado viejos:
  - `lib/config/analitica-cache.ts`, porque citaba `google-adc-token.ts`;
  - `lib/services/GeocodeSaludService.ts` y `lib/interfaces/external/IRouteOptimizationClient.ts`.
- `.env.example`:
  - fuera la línea `ANTHROPIC_API_KEY=` y su texto;
  - la nota sobre `GOOGLE_ROUTE_OPT_*` se reescribió.

Tests existentes actualizados (no se borró ninguno, salvo los de WIF y ADC que manda el design):
- `tests/unit/config/geocode-config.test.ts`: «ausente → null / presente → valor» se invierte. Ahora el entorno no presta la clave.
- `tests/unit/config/route-optimization-config.test.ts`: los bloques de SA y WIF se sustituyen por dos casos:
  - las variables retiradas no llegan a la config;
  - las claves de la config, en literal.
- `tests/unit/auth/google-sa-token.test.ts`: el bloque R12 pasa a la credencial de la empresa.
- `tests/unit/auth/google-token-selector.test.ts`: **perdió su sentido original** (la precedencia ADC > WIF > JWT).
  Se reescribió para fijar lo contrario: aunque el entorno traiga las variables ADC/WIF, el token se firma con la
  cuenta de la empresa.
- `tests/unit/clients/fallback-route-optimization.test.ts`: el caso de identidad de clase de WIF pasa a ser el error real de `RutasPorEmpresa`.
- `tests/unit/clients/google-routes.test.ts`, y `optimizacion-ruta-{origen,service,tramo-vivo,trazado,degradacion}.test.ts`:
  los `CONFIG` pierden las piezas de la credencial. En `optimizacion-ruta-service` el motivo ya no nombra una variable.
  `optimizacion-ruta-degradacion` añade el caso de R26.
- `tests/unit/services/geocodificacion-service.test.ts`: los dobles ahora llevan credencial y fábrica. Se añaden 11 casos de SL-36.
- `tests/unit/services/geocodificacion-marcador-contrato.test.ts`.
- `tests/unit/asistente/sin-credencial.test.ts`, en la parte de config.
- `tests/integration/asistente-route.test.ts`: el texto nuevo, y 9 casos de SL-36 corridos sobre el composition root real del borde.
- `tests/unit/api/procesar-jobs-registro.test.ts`: ya no toca variables retiradas.
- `tests/unit/guards/asistente-sin-datos.guardia.test.ts`: la lista blanca del borde suma
  `@/lib/services/integraciones/asistente-de-la-empresa`, con su motivo.
- `tests/unit/analytics/cache-config.guardia.test.ts`: fuera `google-adc-token.ts` de los `3600` ajenos.

`asignabilidad-coordenadas.test.ts` sigue verde y **sin cambio**.

## Composition root: consumidor → quién construye → qué le pasa → test

| Consumidor | Quién construye | Qué le pasa | Test |
|---|---|---|---|
| Job `geocodificacion` (cron y `scripts/drenar-jobs.ts` vía `buildHandlers`) | `buildGeocodificacionService(now)`, una vez por corrida | `credencialesIntegracionReales()` y `crearCliente = claveApi => new GoogleGeocodeClient({apiKey: claveApi, timeoutMs})`. El service lee `google_maps` en la empresa del job (`conSuEmpresa`) y arma el cliente por job | composition root, dinámico: «dos jobs de dos empresas con el MISMO service: cada uno sale con SU clave», «REQUEST_DENIED: la integración de ESA empresa queda marcada», «sin Google Maps: ninguna llamada». Estático: `GoogleGeocodeClient` y `GeocodificacionService` |
| Otros constructores del geocoder | Grep: `new GoogleGeocodeClient(` solo en el handler y en el probador (`lib/clients/probadores`). `new GeocodificacionService(` solo en el handler. Ni actions ni asignaciones lo construyen | — | estático: «solo en los sitios revisados» |
| Job `optimizacion_ruta` y action `sincronizarRuta`/tramo vivo (`lib/actions/ruta-mensajero.ts` usa la misma fábrica) | `buildOptimizacionRutaService(now)` | Un `RutasPorEmpresa({credenciales: credencialesIntegracionReales()})`. La optimización se arma por llamada con `projectId`, `getToken` y `fetchOptimizacion` de la empresa; el trazado, con `getToken` perezoso de la empresa en curso. Sin contexto (action), la empresa sale de la sesión | dinámico: «dos jobs de dos empresas con el MISMO service: cada uno con SU cuenta y SU proyecto, y el 403 marca ESA empresa», «invalid_grant…». Estático: `RutasPorEmpresa`, `GoogleRouteOptimizationClient`, `GoogleRoutesClient`. `optimizacion-ruta-degradacion` › R26 |
| `tokenProvider` (R28) | `RutasPorEmpresa.proveedorDe` | `Map` por `organizacionId` y huella. `construirTokenProvider(` fuera de `lib/auth/` solo aquí | `optimizacion-ruta-token-por-empresa` › «⭑ el token de A no se usa para B». Estático: «el token de rutas solo se arma en rutas-de-la-empresa.ts» |
| `app/api/asistente/route.ts` | `construirServicio(deps)` por petición | `asistenteDeLaEmpresa()` (empresa de la sesión, lectura en `conEmpresa`) → `AnthropicAsistenteClient({apiKey: asistente.claveApi, fetchImpl: asistente.fetchImpl})`. Con `null`, el servicio recibe `proveedor: null` | dinámico, sin inyectar credenciales: «la clave sale de la integración de la empresa, y un 401 la marca ahí». `asistente-route` › SL-36 (9 casos). Estático: `AnthropicAsistenteClient` |

Cachés de módulo revisadas (R28):
- Geocodificación: ninguna. El cliente se arma por job y la config solo trae el timeout.
- Asistente: ninguna. El cliente se arma por petición.
- Rutas: el único estado vive en la instancia de `RutasPorEmpresa`, por empresa.
- `GoogleServiceAccountToken` cachea en su propia instancia, que es una por empresa.

## R<n> → test

| R | Test | Estado |
|---|---|---|
| R23 (Maps) | composition root › «⭑ dos jobs de dos empresas con el MISMO service: cada uno sale con SU clave» + `geocodificacion-service` › «⭑ el cliente se construye con la clave que devolvió la empresa» + `geocode-config` › «la config no lleva credencial» | verde |
| R23 (rutas) | composition root › «⭑ dos jobs… SU cuenta y SU proyecto» + token-por-empresa › «el proyecto de la URL sale de la clave de CADA empresa», «sin contexto, la empresa sale de la sesión…» + `google-token-selector` + `route-optimization-config` › SL-36/R23 | verde |
| R23 (asistente) | `asistente-route` › «⭑ la llamada a Anthropic lleva la clave de la empresa de la sesión» + composition root (asistente) + `sin-credencial` › SL-36/R23 | verde |
| R25 | `geocodificacion-service` › «⭑ sin integración y sin caché: fallo marcado, sin red» (+ «con la dirección en caché: se ubica igual…»). `asignabilidad-coordenadas.test.ts` sigue verde sin cambio. `geocodificacion-marcador-contrato` › «falta la credencial (la empresa sin Google Maps)… -> asignable_sin_ubicacion» | verde |
| R26 | `optimizacion-ruta-degradacion` › «⭑ sin integración: orden local, sin red, job no muere» (composition root de producción) + token-por-empresa › R26/R29 (4) + `fallback-route-optimization` › «el error REAL de la empresa sin integración cae al fallback» | verde |
| R27 | `tests/integration/asistente-route.test.ts` › «⭑ sin integración: texto de R27, sin red, sin contar uso» (+ ilegible y sin empresa; el rol sigue primero) | verde |
| R28 | `optimizacion-ruta-token-por-empresa` › «⭑ el token de A no se usa para B» (+ reutiliza para A, se rehace si cambia la clave) + `geocodificacion-service` › «⭑ dos jobs de dos empresas: cada uno con SU clave, ningún cliente reutilizado» | verde |
| R29 (uso) | `geocodificacion-service` › «R29: credencial ilegible…», token-por-empresa › «credencial ilegible (R29)», `asistente-route` › «credencial ilegible (R29)…» | verde |
| R30 Maps | `geocodificacion-service` › «⭑ REQUEST_DENIED: marcarRechazo('google_maps', 'google_maps.credencial_rechazada')…» (+ otros desenlaces no marcan; un fallo al marcar no cambia el job) + composition root | verde |
| R30 rutas (token) | token-por-empresa › «⭑ HTTP 400/401 en el intercambio (invalid_grant): marca optimizacion_rutas.credencial_rechazada en ESA empresa» + composition root › «invalid_grant…» | verde |
| R30 rutas (403) | token-por-empresa › «⭑ 403 en optimizeTours: marca optimizacion_rutas.permiso en ESA empresa» + composition root | verde |
| R30 asistente | `asistente-route` › «⭑ Anthropic responde 401: marcarRechazo('asistente.credencial_rechazada')…» (+ 403/429/500 no marcan) + composition root | verde |

## Mutaciones

Script: `C:/Users/ArqDev/AppData/Local/Temp/claude/R--job-singularis-projects-servi-logistic/c52bf68b-05f6-4568-a87b-f276a3215e5b/scratchpad/mutar.mjs`.
Aplica cada mutación, corre sus tests, restaura y compara byte a byte. Resultado: 21 de 21 en rojo, con
`restaurado=true` en todas.

| Mutación | Resultado |
|---|---|
| R28 rutas: caché de proceso sin empresa ni huella (el `??=` de antes) | ROJO 4 («⭑ el token de A no se usa para B», …) |
| R28 rutas: clave de caché constante, conservando la huella | ROJO 1 («y el de A sí se reutiliza para A»). R28 sigue a salvo por la huella; lo que se pierde es la caché |
| R28 rutas: caché sin huella | ROJO 1 («si la empresa cambia su clave…») |
| R30 rutas: el permiso sale con 401 en vez de 403 | ROJO 3 |
| R30 rutas: el intercambio solo marca el 401 | ROJO 2 |
| R30 rutas: la marca fuera de `conEmpresa` | ROJO 1 |
| R23 rutas: la lectura fuera de `conEmpresa` | ROJO 1 |
| R26 rutas: sin integración lanza un error que no es `RutaNoConfiguradoError` | ROJO 3 (incluido «⭑ sin integración: orden local…») |
| Handler de rutas: `optimizeTours` con el `fetch` por defecto | ROJO 2 (estático + dinámico) |
| Handler de rutas: proyecto vacío | ROJO 2 |
| Handler de rutas: sin el lector real (credencial fija) | ROJO 3 |
| Handler de geo: cliente con clave vacía | ROJO 2 |
| Handler de geo: sin el lector real | ROJO 3 |
| R25 geo: sin el corte de «sin integración» | ROJO 7 |
| R25 geo: la credencial se lee antes de la caché | ROJO 2 |
| R28 geo: un cliente para todos los jobs | ROJO 2 |
| R30 geo: no anota el `REQUEST_DENIED` | ROJO 3 |
| R27 asistente: cliente siempre (sin el corte antes del tope) | ROJO 3 |
| R30 asistente: el cliente con el `fetch` sin vigilar | ROJO 3 |
| R30 asistente: la señal es 403 en vez de 401 | ROJO 3 |
| R23 asistente: la lectura fuera de `conEmpresa` | ROJO 4 |

## Grep de `process.env` (design §9.3, Maps/rutas/asistente)

Se buscaron en `app/`, `lib/` y `scripts/` (`*.ts`, `*.tsx`, `*.js`, `*.mjs`) las variables `GOOGLE_MAPS_API_KEY`,
`GOOGLE_ROUTE_OPT_PROJECT_ID`, `GOOGLE_CLOUD_PROJECT_ID`, `GOOGLE_ROUTE_OPT_SA_EMAIL`, `GOOGLE_ROUTE_OPT_SA_PRIVATE_KEY`,
`GOOGLE_ROUTE_OPT_USE_ADC`, `GOOGLE_WIF_PROJECT_NUMBER`, `GOOGLE_CLOUD_PROJECT_NUMBER`, `GOOGLE_WIF_POOL_ID`,
`GOOGLE_CLOUD_WORKLOAD_IDENTITY_POOL_ID`, `GOOGLE_WIF_PROVIDER_ID`, `GOOGLE_CLOUD_WORKLOAD_IDENTITY_POOL_PROVIDER_ID` y
`ANTHROPIC_API_KEY`:
- lecturas: 0;
- menciones de cualquier tipo, comentarios incluidos: 0;
- en `.env.example`: 0 de las 13.

## Comandos (salida real resumida)

- `pnpm run typecheck`: `tsc --noEmit`, exit 0.
- `pnpm run lint`: exit 0, `231 problems (0 errors, 231 warnings)`. Antes eran 232; ninguno es un error.
- `pnpm run test:guardias`: `Test Files 1 failed | 304 passed | 2 skipped (307)`, `Tests 4 failed | 4181 passed | 20 skipped`.
  - El único rojo es `dependencias-declaradas-presentes` (4), que es la baseline.
  - `ayuda-pantalla-ruta-existe` ya está verde, porque T7.2 entró en `a22cf3a`.
  - Por el camino destapé y arreglé dos rojos propios:
    - `catalogo-postgres-acota-esquema`: usa `git ls-files` y se quejaba del borrado sin indexar;
    - `recursos-origen-fuera`: un correo de cuenta de servicio con forma de real en `google-token-selector.test.ts`.
- Tests tocados y vecinos, con la base de la feature: `Test Files 42 passed (42)`, `Tests 715 passed (715)`, 0 skipped.
  En una corrida anterior, con `tests/unit/clients/probadores` y los guards vecinos: 47 archivos y 781 tests verdes.
- `pnpm exec vitest related --run <16 archivos de producción>` con la base:
  - `Tests 72 failed | 7669 passed | 923 skipped (8664)`;
  - los 142 archivos rojos o saltados están **todos** en `tests/baseline-rojos.json` (comprobado por script: 0 nuevos). Son los `*-sql-real`, 454 y otros de la app vacía;
  - ninguno de los míos está rojo ni saltado;
  - esa corrida fue antes de los últimos retoques: dos comentarios, `.env.example`, los correos de un test y el `git rm --cached`.
- LF: los 37 archivos tocados, 0 `\r`.

## Desviaciones y decisiones

1. **403 en `optimizeTours`: se marca `permiso`, pero no se cae al orden local.** Design §5 dice «la ruta cae
   al orden aproximado». El código de hoy trata el 403 como `config_invalida`: conserva el orden previo, marca la
   ruta desactualizada y el job reintenta. Ningún requisito pide cambiarlo (R26 habla solo de «sin integración»
   y R30 solo de la marca), así que lo dejé como está. Si se quiere el fallback, es un cambio acotado en
   `FallbackRouteOptimizationClient`; lo decide el leader.
2. **El 401/403 del trazado (Routes API) no marca.** Design §5 solo nombra la optimización. Además, un trazado
   caído no tumba nada: cae al trazado local.
3. **`AsistenteService` cambia** aunque no está en «Archivos esperados». Es la forma de que R27 corte antes del
   tope sin perder la precedencia del rol (R13): un rol sin ayuda sigue siendo 403. El route decide si la empresa
   tiene asistente; el service recibe `null`.
4. **Texto de R27**: «Tu empresa todavía no configuró el asistente. Avisá a la oficina; mientras tanto podés abrir
   la ayuda de la pantalla.». El requirements no da un literal: dice «que la empresa no lo configuró». Usé el voseo
   de los otros textos del borde. El estado HTTP sigue siendo 500 `INTERNAL`, como antes.
5. **La guardia `asistente-sin-datos` suma una entrada a su lista blanca**: la puerta de la clave de la empresa.
   Lee la credencial para llamar al proveedor; no le pasa ningún dato al modelo.
6. **`RutaNoConfiguradoError(motivo)`** recibe una lista cerrada en vez de un nombre de variable (design §9.1:
   «deja de nombrar variables»).
7. **Piezas comunes en `credencial-de-la-empresa.ts`**, sacadas de `whatsapp-de-la-empresa.ts`, que las re-exporta.
   No cambia ninguna firma de WhatsApp, y `whatsapp-composition-root` y `whatsapp-sin-integracion` siguen verdes.
8. **Jobs sin empresa** (filas previas a M4, que corren en plataforma):
   - en rutas, `sin_empresa` → Haversine: se degrada;
   - en geocodificación, `EmpresaNoResuelta` se propaga y el job falla sin el marcador. Una orden siempre es de una
     empresa y la credencial no se presta, así que falla cerrado. Lo señalo por si se prefiere degradar.
9. **Cada job de rutas lee la credencial dos veces**, una para optimizar y otra para trazar. Es a propósito: no se
   cachea la credencial, solo el token por empresa.
10. **`google-auth-library` y `@vercel/oidc` ya no los usa el código de la app** (solo los usaban WIF y ADC). No
    toqué `package.json`: quitarlos lo decide un humano.
11. **Lo que queda para T6.6, sin tocar**:
    - `README.md`;
    - `e2e/_escenarios/crons.ts`: su mensaje todavía cita `GOOGLE_MAPS_API_KEY`, pero espera el marcador, que se conserva;
    - los builders de `procesar-jobs`: compilan y reciben la credencial de su empresa sin cambios.

## Veredicto

T6.3, T6.4 y T6.5 hechas:
- Maps, rutas y el asistente leen la credencial de la empresa en curso;
- el token de rutas se cachea por empresa;
- R25, R26 y R27 se degradan sin red;
- R30 marca la integración en cada consumidor;
- hay 0 menciones de las variables retiradas y las 21 mutaciones salen en rojo.
