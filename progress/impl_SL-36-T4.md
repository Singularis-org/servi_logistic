# SL-36 · T4 (probadores) — bitácora de backend_dev

> Parcial de T4. El implementer la funde en `impl_SL-36.md`. Sin commit (lo hace el implementer).

## Archivos creados
- `lib/interfaces/external/IProbadorIntegracion.ts`: contrato y tipos mínimos por servicio (credencial, datos de prueba, datos públicos, motivos).
- `lib/clients/probadores/comun.ts`: timeout de 10 s, `llamar` (convierte la excepción de red en un valor), `fetchObservado`, log saneado.
- `lib/clients/probadores/whatsapp-probador.ts`: GET del número y GET de la WABA a Graph, con `Authorization: Bearer`.
- `lib/clients/probadores/google-maps-probador.ts`: reutiliza `GoogleGeocodeClient` sobre una dirección fija.
- `lib/clients/probadores/optimizacion-rutas-probador.ts`: zod del JSON de la clave y JWT-bearer con `GoogleServiceAccountToken`.
- `lib/clients/probadores/asistente-probador.ts`: `GET https://api.anthropic.com/v1/models`.
- `lib/clients/probadores/probador-doble.ts`: secretos `valido-…` y `usarProbadorDoble(env)`.
- `lib/clients/probadores/probadores.ts`: `crearProbadores(env)`, el único punto donde se elige entre real y doble.
- `tests/unit/clients/probadores/{whatsapp,google-maps,optimizacion-rutas,asistente}-probador.test.ts`, `probador-doble.test.ts` y `ayuda-probadores.ts`.

No se modificó ningún consumidor existente.

## R → test
- R17: en cada `*-probador.test.ts`, el bloque «SL-36/R17 — …» afirma la URL, el método y que hay una sola llamada (dos en WhatsApp).
- R12 (datos públicos de una prueba buena): los bloques «SL-36/R12…» de cada probador.
- R13 (motivo del catálogo; el detalle va al log sin credenciales): los bloques «SL-36/R13…», con `afirmarSinSecretos` sobre el resultado y sobre el log (logger inyectado + espías de `console.*`). En Maps, además, sin `maps.googleapis.com` ni `key=` en el log.
- R30 (señales de rechazo): WhatsApp, «HTTP 401…» y «`error.code` 190…»; rutas, «HTTP 400/401…»; asistente, «HTTP 401…»; Maps, «REQUEST_DENIED…».
- Doble (design §15): `probador-doble.test.ts`, con un test para cada mitad de la condición.

## Salida real
- `pnpm exec vitest run tests/unit/clients/probadores`: `Test Files 5 passed (5)` · `Tests 54 passed (54)`.
- `pnpm run typecheck`: exit 2, con 1 error, en `tests/unit/crypto/boveda-integraciones.test.ts:163` (T2, en paralelo). Mis archivos no dan ningún error.
- `pnpm run lint`: exit 0 (0 errores; 232 avisos heredados, ninguno en mis archivos). `eslint` sobre mis archivos: exit 0.
- `pnpm run test:guardias`: `7 failed | 4171 passed | 20 skipped`. Ninguno de los fallos es mío:
  - `dependencias-declaradas-presentes`: falta en `init.sh` el marcador del paso 2;
  - `historial-accion-escrituras-cubiertas` y `rls-por-empresa` (77 frente a 75): vienen de T1, que está a medio hacer.
  - Dos guardias que sí me tocaban (`censo-order-status-rename` y `recursos-origen-fuera`) ya están en verde: el motivo pasó a `credencial_rechazada` y los datos de ejemplo usan valores que no parecen secretos.

## Mutaciones (todas revertidas; la suite volvió a 54/54)
- Clave en el log: asistente (1 rojo), WhatsApp (5), rutas (5), URL de Maps con `key=` en el log (5). Clave en el motivo: asistente (5 rojos).
- R17:
  - asistente a `/v1/messages`: rojo;
  - asistente con POST: rojo;
  - WABA por `/phone_numbers`: rojo;
  - WhatsApp sin probar la WABA: 3 rojos;
  - dirección de Maps cambiada: **sobrevivió**. El test comparaba contra su propia constante; se cambió a un literal y la mutación quedó en rojo.
- Selección del doble con `||` en lugar de `&&`: 3 rojos.

Veredicto: T4 hecho; probadores y doble en verde, con las mutaciones de fuga y de R17 en rojo.
