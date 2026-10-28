# SL-36 — tanda 1 (T1 datos, T2 bóveda) · backend_dev

> Worktree `.worktrees/SL-36-integraciones-por-empresa`, sin commit (lo hace el implementer).
> Base local propia de la feature (`DATABASE_URL` del scratchpad, nunca impresa).

## Archivos

Creados:
- `db/migrations/20261025120000_integracion/{migration.sql,down.sql}`: dos enums, `integracion` e
  `integracion_prueba_minuto`, CHECK, únicos, RLS, grants y triggers.
- `db/migrations/20261025120100_historial_accion_integraciones/{migration.sql,down.sql}`: 5 tipos y la
  entidad `integracion`. El down usa la función dinámica de la 458-B (`_sl36`).
- `lib/config/integraciones.ts`: el anillo, la activa y las pruebas por minuto, leídos en cada llamada.
- `lib/crypto/boveda-integraciones.ts`: `BovedaIntegraciones`, `ResumenSecretoSha256`,
  `FuenteAleatoriaCripto`, `CredencialIlegibleError` y `EntradaDeBovedaInvalidaError`.
- `lib/interfaces/external/{ICifradorSecretos,IResumenSecreto,IFuenteAleatoria}.ts`.
- `tests/integration/db/integracion-migracion.test.ts` (T1.3).
- `tests/unit/config/integraciones-config.test.ts` (R4).
- `tests/unit/crypto/boveda-integraciones.test.ts` (R1-R4, R38; QC §10 Cifrador/Resumen).

Modificados:
- `db/schema.prisma`: modelos `Integracion` e `IntegracionPruebaMinuto`, sus enums, las relaciones de
  `Organizacion` y los valores nuevos de los dos enums del historial.
- `lib/db/modelos-de-negocio.ts`: los dos modelos, de negocio (75 → 77).
- `lib/types/historial-accion.ts`: 5 tipos, la entidad, la categoría `cambia_integraciones` y sus
  etiquetas.
- `lib/types/historial-accion-etiquetas.ts`: constructor de etiqueta de `integracion` (el nombre del
  servicio). Lo exige el tipo exhaustivo de `CONSTRUCTORES`.
- `tests/unit/historial-accion/catalogo-y-choke-point.test.ts`: totales 65→70 tipos, 24→25
  entidades, 3→4 categorías, y un caso SL-36.
- `tests/unit/guards/rls-por-empresa.guardia.test.ts` y
  `tests/unit/scripts/verificar-rls-despliegue.test.ts`: 75 → 77 tablas de negocio.

## Mapa R<n> → test (esta tanda)

| R | Test | Estado |
|---|---|---|
| R1 | `tests/unit/crypto/boveda-integraciones.test.ts` › «SL-36 R1 — forma v<n>:iv12:tag16 y contexto JSON» | verde |
| R2 | ídem › «SL-36 R2 — dos cifrados difieren y no contienen el texto ni su base64» | verde |
| R3 | ídem › «SL-36 R3 — alterado, mal formado, versión ausente u otro contexto dan credencial ilegible sin cause» | verde |
| R4 | `tests/unit/config/integraciones-config.test.ts` › «SL-36 R4 — ausente, mal formada o repetida nombran variable y posición; se lee por llamada» + bóveda › «SL-36 R4 — sin configuracion valida…» | verde |
| R5 (base) | `tests/integration/db/integracion-migracion.test.ts` › «R5: el CHECK de secretos…», «R5: un UPDATE…», «R5: el resumen del token…» | verde, base real |
| R8 (base) | ídem › «R8: las dos tablas tienen RLS…», «R8: con comoApp(B)…» (×2) | verde, base real |
| R10/R11 (base) | ídem › «R10/R11: una por empresa y servicio; el numero… unico entre empresas» | verde, base real |
| R38 | bóveda › «SL-36 R38 — v1 sigue legible tras activar v2; lo nuevo sale en v2» | verde |
| historial (R33, catálogo) | `tests/unit/historial-accion/catalogo-y-choke-point.test.ts` › «son 61 tipos…» (70/25/4) y «⭑ SL-36 (design §13, R33)…» | verde |

R5 de servicio (vista sin secretos), R8 por repositorio, R9-R11 por repositorio y R33 en transacción
son de T3/T5.

## Mutaciones

| Mutación | Resultado | Revertida |
|---|---|---|
| AAD con `[…].join(":")` en vez de `JSON.stringify` | ROJO: «los contextos ambiguos con `:` no se cruzan» | verde 41/41 |
| `leerAnilloDeClaves()` cacheado en el módulo | ROJO 6: «se lee por llamada…», R38 «rotar la activa…», R4 «sin anillo…» y 3 más | verde 61/61 |
| `BovedaIntegraciones` memoiza el anillo en la instancia | ROJO 4: R38 «rotar la activa…», R4 «sin anillo…», «version_ausente», «la version va en los datos asociados» | verde 41/41 |
| `DROP CONSTRAINT integracion_secretos_cifrados` en la base | ROJO 2: «R5: el CHECK de secretos…», «R5: un UPDATE…» | base restaurada con down+deploy, verde 9/9 ×3 |
| Política `integracion_por_empresa` con `USING (true)` | ROJO: «R8: con comoApp(B), la integracion de A…» | ídem |

## Ida-vuelta-ida (T1.1)

Foto del catálogo (tablas, columnas, constraints, índices, políticas, triggers, RLS, enums, grants,
migraciones aplicadas): con = `e24dfd284724563c` (4329 líneas), sin = `542e2ac11ca61107` (4249).
deploy → con; `db:rollback` (M2) + down de M1 → sin; deploy → con; rollback → sin; deploy → con.
Las cinco fotos coinciden con su par. Tras el down, `historial_accion_tipo` vuelve a 65 valores y
`historial_accion_entidad` a 24. `prisma migrate diff --from-config-datasource --to-schema` da
«empty migration» antes y después.

Tests que el cambio rompía y se actualizaron (listas «este valor y los posteriores» de migraciones
viejas del historial, que deben nombrar los 5 tipos y la entidad nuevos):
`tests/integration/db/{caja-459,correccion-resultado-gestion,historial-accion-cobro-tienda,
historial-accion-conciliacion-bodega,historial-accion-orden-zona-reconciliada,
historial-accion-zona-pago-mensajero,historial-accion-zona-sinpe}-migration.test.ts`.

## Salida de verificación

- `pnpm run typecheck`: exit 0.
- `pnpm run lint`: exit 0, `0 errors, 232 warnings` (ninguno en archivos de esta tanda).
- Archivos de la tanda (bóveda, config, migración, catálogo, filtros, RLS, organizacion-en-modelos,
  fk-misma-empresa, sql-a-mano y los 7 de migraciones del historial), con base real:
  `Test Files 18 passed (18) · Tests 323 passed (323)`, 0 skipped.
  `integracion-migracion.test.ts`: `Tests 9 passed (9)`, no skipped, tres corridas seguidas.
- `pnpm run test:guardias`: `Test Files 2 failed | 303 passed | 2 skipped (307) · Tests 6 failed`.
  - `dependencias-declaradas-presentes` (4): en `tests/baseline-rojos.json`, no lo toca esta tanda.
  - `historial-accion-escrituras-cubiertas` (2): **rojo esperado hasta T3.1.** El censo exige un
    productor real (método de `IntegracionRepository` con `appendAccion` en su `$transaction`)
    para cada tipo del enum, y el repositorio es de T3.1. Añadir el censo ahora apuntaría a métodos
    que no existen (también rojo). T3.1 lo cierra: añade las 5 entradas del censo y sube el número
    duro de 65 a 70.
- `pnpm exec vitest related --run` sobre los archivos tocados: arrastró casi toda la suite (1247
  archivos, porque `modelos-de-negocio` y el catálogo del historial los importa medio repo):
  `254 failed`. 246 están en `tests/baseline-rojos.json` (base sin datos sembrados, SL-31). Los 8
  de fuera eran los 7 de migraciones del historial (arreglados arriba) y la guardia del censo.
  Revisados a mano los de baseline que tocan el historial (`wallet-458`, `wallet-461`,
  `abono-tienda-457`): fallan por valores de SL-45/458-B en sus `slice(-2)`, no por SL-36.

## Desviaciones del spec

1. CHECK de `secretos` más estricto que el del design §2.1: exige la forma ENTERA
   `v<n>:<iv 16 chars>:<tag 22+==>:<base64>` y que cada valor sea texto. El del design (solo el
   prefijo `^v[1-9][0-9]*:`) deja pasar `v1:token-en-claro`, y `like_regex` sobre un número da
   «desconocido» y tampoco lo filtra. Lo prueba el test (casos `prefijoYClaro` y `numero`).
2. CHECK extra `integracion_datos_publicos_objeto` (`jsonb_typeof = 'object'`). No está en el design.
3. `organizacionId` va con `@default(dbgenerated())` y `onUpdate: Cascade`, como `DistritoZonaEspecial`,
   y no sin default como en el design: el SQL lleva el DEFAULT de SL-17 y, sin él, Prisma ve deriva.
   `migrate diff` da vacío.
4. `CredencialIlegibleError.diagnostico` tiene un tercer valor, `no_autentica` (tag o contexto que no
   cuadran), además de `forma_invalida` y `version_ausente`. La bóveda exige además base64 CANÓNICA:
   sin eso, un tag con el último carácter cambiado solo en los bits de relleno se daba por bueno.
5. `pruebasPorMinuto` no lanza: si el valor es inválido usa el defecto (5). Sigue el patrón de
   `lib/config/asistente.ts`. El design no dice qué hacer con un valor inválido.
6. Etiqueta de la entidad `integracion` en el historial: `{ servicioNombre }`, en
   `lib/types/historial-accion-etiquetas.ts`. Lo exige el mapa exhaustivo, y el design §13 lo pide
   («entidadEtiqueta es el nombre del servicio»).
7. Textos propuestos para el catálogo, sin literal en el design: «Conectó una integración»,
   «Actualizó una integración», «Probó la conexión de una integración», «Regeneró el token del
   webhook de WhatsApp», «Desconectó una integración», la categoría «Cambia integraciones» y la
   entidad «Integración».

## Veredicto

T1 y T2 están hechas y verificadas contra la base real. La guardia del censo del historial queda en
rojo, como estaba previsto, hasta que T3.1 añada los productores.
