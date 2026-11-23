# Review — SLT-255 «Planes: prórroga del pago antes del congelamiento»

- **Fase:** F2.2 · **Ruta:** completa · **Rama:** `feature/SLT-255-planes-prorroga-pago` · **PR:** #279
- **Revisado:** 2026-11-23, sobre `dd0f9b0d` (diff `origin/dev...HEAD`, 47 rutas, 42 archivos contados por `tamano-pr`).
- **Base:** SLT-121 «Planes: plazo de pago de la factura y operación congelada por mora» (mergeada, #264).
- **Grafo:** sin índice de este worktree. Revisado con Grep y Read.

## Verificación ejecutada por el reviewer

- `pnpm exec vitest run` sobre 11 archivos: `mora`, `jobs-mora`, `mora-empresa-service`, `actions/mora-empresa`,
  `plantilla-mora-aviso`, `AvisoMora`, `MoraEmpresa`, `catalogo-y-choke-point` y las guardias
  `historial-accion-escrituras-cubiertas`, `historial-accion-sin-datos-cliente` y `superficie-de-uso`. Resultado:
  `Test Files 11 passed (11) · Tests 477 passed (477)`.
- `pnpm exec eslint` sobre los archivos TS/TSX añadidos o modificados del diff: exit 0, sin salida.
- `node scripts/tamano-pr.mjs`: 42/40 archivos, 971/1000 líneas de producción y 1849/3000 de tests. Lleva el marcador
  `tamano-pr-aceptado` en `progress/features/SLT-255.md`, así que no bloquea.
- `git merge-tree` contra `origin/dev`, que va 13 commits por delante con SLT-243: se mezcla limpio y no comparten
  archivos.
- No los corrí yo:
  - los tests de integración contra Postgres (`mora-empresa-repository`, `prorroga-migration`, los inventarios del
    enum), el typecheck completo y el E2E, por el límite de memoria que fijó el leader;
  - me apoyo en el CI `gate-completo`, verde sobre `7f0ca6c5` según la bitácora (vitest en 3 shards y e2e
    `dinero`/`aislamiento`/`reparto`), y en la constancia de los E2E locales de `progress/impl_SLT-255.md` (T5.1).

## Checklist

### Ruta y spec
- [x] Ruta completa. El diff toca permisos (superadmin), el cron de congelamiento, el historial y los correos, y esa
      ruta es la que les toca.
- [x] `requirements.md` con R1–R23 en EARS y la tabla «Decisiones cerradas», que incluye los textos de la T4.2.
- [x] `design.md` abre con `## Lo que ya existe`, que trae la búsqueda y la tabla de lo que se reutiliza. El diff
      reutiliza `descongelada_hasta`, `organizacion_mora_descongelar_a_mano`, `encolarAvisosDeMora` y
      `plantillaMoraAviso`, y no re-crea nada.
- [x] `design.md §9`: hay alternativas descartadas, cada una con su porqué.
- [x] `tasks.md`: T1.1–T5.3 están todas `[x]`. La T5.3 lleva la nota del cupo heredado que aceptó el humano.

### Tamaño
- [x] Pasa del tope (42/40) con la aceptación humana registrada. No es hallazgo.

### Trazabilidad (R → test que pasa)
| R | Test |
|---|---|
| R1 | `tests/unit/planes/mora.test.ts` › «SLT-255 R1 — plazoVigente» (3 casos); `mora-empresa-repository` › «R1: un plazo ya vencido no cuenta como anterior…» |
| R2 | `mora-empresa-repository` › «R2, R15, R21: con la empresa congelada, la descongela…»; `MoraEmpresa.test.tsx` › «SLT-121 R22, R32 (SLT-255 R2)…» |
| R3 | `mora-empresa-repository` › «R3, R15, R16: sin congelar…» y «R3: también a una empresa sin facturas»; E2E caso 1 |
| R4 | `mora-empresa-repository` › «R4, R15, R16: alargar y acortar…» y «R4: la misma fecha vigente responde sin_cambio…» |
| R5 | `mora-empresa-repository` › «SLT-255 quitarPlazo» (3 casos: ok, sin plazo o vencido, congelada) |
| R6 | `mora-empresa-service` › «darPlazo — R6» (extremos, hoy de la plataforma, error por campo, 200 caracteres) y «quitarPlazo» |
| R7 | `mora-empresa-service` › «R4 (SLT-255 R7)…» (`forbidden` sin leer), `not_found` sin escribir; `actions/mora-empresa` › empresa ligada y `forbidden` |
| R8 | `mora-empresa-repository` › «R8, R9: con la prórroga vigente no congela…»; E2E caso 2 |
| R9 | `mora-empresa-repository` › «R8, R9…» y «R9: la primera madrugada después de quitar…»; E2E caso 4 |
| R10 | `mora-empresa-repository` › «R10: si la corrida congeló primero…» y las dos pruebas en paralelo (`RONDAS` de `darPlazo`×`darPlazo` y de `darPlazo`×corrida) |
| R11 | `mora.test.ts` › «SLT-255 R11, R12 — estadoDeMora con plazo»; `AvisoMora.test.tsx` › `con_plazo` (maestro y admin); E2E caso 3 |
| R12 | `mora.test.ts` › «R12: si ninguna factura con saldo vence dentro del plazo, el banner es el de siempre» |
| R13 | `MoraEmpresa.test.tsx` › «SLT-255 R13 — dar, cambiar y quitar la prórroga de pago»; `mora-empresa-service` › «SLT-255 R13» (3 casos de `datos.plazo`) |
| R14 | `catalogo-y-choke-point.test.ts` › «SLT-255 R14…» (2 casos); E2E caso 1 (la fila en el historial de la mora) |
| R15 | `mora-empresa-repository` (filas exactas, motivo recortado a 200 y «R15: si el registro falla…»); las guardias del censo y de datos de cliente |
| R16 | `plantilla-mora-aviso` › «SLT-255/R16»; `jobs-mora` › «SLT-255/R16, R19, R20»; el encolado en `mora-empresa-repository` |
| R17 | `plantilla-mora-aviso` › «SLT-255/R17» (con y sin vencidas); `jobs-mora` › «SLT-255/R17, R19» |
| R18 | `mora-empresa-repository` › «R18: la víspera del plazo…» y «R18: sin vencidas, o congelada…»; `jobs-mora` › «SLT-255/R18, R19»; plantilla |
| R19 | `jobs-mora` cubre la fecha cambiada, el plazo quitado, el plazo vuelto a dar, la empresa congelada y la víspera sin vencidas |
| R20 | `jobs-mora` › «SLT-255/R20» (un envío fallido no frena a los demás y lanza); `mora-empresa-repository` › «R15: si el registro falla, la prórroga no queda ni el correo» |
| R21 | `mora-empresa-repository` › «R2, R15, R21…» (el aviso es `descongelada`/`a_mano`, no `prorroga`) |
| R22 | `plantilla-mora-aviso` › «SLT-255/R22» (2 casos); `jobs-mora` › «SLT-255/R22» |
| R23 | `e2e/mora-prorroga.spec.ts` (5 casos, proyecto `dinero`). En local, `mora-congelamiento` y `dos-empresas-humo` en verde (bitácora T5.1); en CI, `e2e (dinero)` verde sobre `7f0ca6c5` |

- [x] Los 23 requisitos tienen test concreto, y los tests no son vacíos: afirman filas, payloads, dedupes y textos
      exactos.
- [x] `progress/impl_SLT-255.md` trae el mapa R → test por tanda.

### Calidad de código
- [x] Typecheck: la bitácora y el CI (`estatico`) dicen verde. No lo corrí por la memoria.
- [x] Lint de los archivos del diff: verde, lo corrí yo.
- [x] `gate-completo` verde sobre `7f0ca6c5`. Hay una corrida nueva en curso sobre `dd0f9b0d` (ver m3).
- [x] El flujo crítico «aislamiento» se cubre con `dos-empresas-humo`, corrido en local y en CI. La mora tiene su
      propio E2E.
- [x] Sin dependencias nuevas.

### Datos y seguridad
- [x] No hay tabla nueva. La única migración es la de enums, con `down.sql` en `BEGIN … COMMIT` y la precondición
      ruidosa (`RAISE`) si algún valor está en uso. No edita ninguna migración ya aplicada.
- [x] Las escrituras van con `WHERE "id" = organizacionId` y en `comoPlataforma` con transacción. El historial lleva
      `organizacionId`.
- [x] No hay literales de país ni de moneda nuevos, ni `console.log` de secretos o PII, ni nada de Ordenex.
- [x] Sin secretos ni configuración hardcodeada.

### Arquitectura y permisos
- [x] Las capas se respetan:
  - la autorización y el rango de la fecha están en `MoraEmpresaService`;
  - las escrituras y el candado de la fila, en `MoraEmpresaRepository`;
  - las actions solo ligan la empresa de la URL;
  - el dominio puro (`plazoVigente`, `estadoDeMora`) vive en `lib/planes/mora.ts`.
- [x] La entrada se valida con zod en el borde: `darPlazoSchema`, `quitarPlazoSchema` y el payload del trabajo.
- [x] La autorización se decide en el servidor: el servicio responde `forbidden` antes de leer. No basta con ocultar
      el botón.

### No rompe SLT-121
- [x] La enmienda de R24 está aplicada:
  - `banner.descongeladaAMano` («habilitada hasta») pasa a `conPlazo`, con el mismo texto que la prórroga;
  - el test de `AvisoMora` comprueba que ya no sale «habilitada hasta» ni «esta madrugada».
- [x] `organizacion_mora_descongelar_a_mano` no se toca, y su test SQL (`tests/integration/db/mora-congelar.test.ts`,
      `no_congelada`) sigue siendo válido.
- [x] El descongelamiento a mano conserva su tipo de historial y su correo de SLT-121 R28.
- [x] No queda código vivo que nombre `descongelarAMano`, `descongelarEmpresaAction`, `descongeladaAMano` ni
      `noCongelada`.
- [x] `e2e/mora-congelamiento.spec.ts` no usaba el texto ni el botón viejos. Pasa en local (bitácora T5.1) y en CI.

### Reglas del perfil (reviewer)
- [x] La migración trae `down.sql`. No hay tabla sin RLS ni query de negocio sin empresa.
- [x] No hay dependencias nuevas.
- [x] Los comentarios explican el porqué: el candado `NO KEY` para no frenar las FK, el error 55P04 y el «a las
      08:00».
- [x] Hay constancia de los E2E afectados corridos en local: `mora-prorroga`, `--project=dinero` por lotes y
      `dos-empresas-humo`.
  - El único rojo, `ajuste-pago-mensajero-cierre`, sale de la cola de geocodificación acumulada en una base
    reutilizada.
  - No toca la mora, pasa al repetirlo solo y el CI está verde.

## Hallazgos

- **m1 — menor.** Queda un comentario viejo en `lib/types/historial-accion.ts:444`:
  `"empresa_descongelada_a_mano", // MoraEmpresaRepository.descongelarAMano (T2.4)`. Ese tipo ahora lo produce
  `MoraEmpresaRepository.darPlazo`. Es solo documentación: no lo lee ninguna guardia y no rompe nada.
- **m2 — menor.** R19 (la prórroga «se volvió a dar») tiene un caso borde: se da la prórroga hasta H, se quita y se
  vuelve a dar hasta la misma H antes de que salga el primer correo.
  - El aviso `prorroga` del primer «dar» sigue cumpliendo `plazo === aviso.hasta` y sale.
  - Sale también el del segundo, porque la dedupe lleva el `ahora`. El maestro recibe dos correos iguales.
  - Es lo que fija `design.md §4.2`, aprobado, y el contenido es cierto. Lo anoto por si se quiere afinar.
- **m3 — menor.** El CI de `dd0f9b0d` estaba `pending` en el momento de la revisión. Detrás de `7f0ca6c5` solo entraron
  commits de documentación, y el verde sobre `7f0ca6c5` ya está aceptado. Aun así, CHECKPOINTS pide `gate-completo`
  verde en el PR antes del aviso «listo para mergear», así que el leader tiene que esperar a que termine.
- **m4 — menor.** El checkpoint de dos empresas no tiene un caso explícito que compruebe que `darPlazo` o
  `quitarPlazo` no tocan otra empresa. Hoy lo cubre en parte el caso de `quitarPlazo` que usa dos empresas («nunca» y
  «vencido»). Las escrituras filtran por `id` de la propia fila `organizacion`, que es la tabla de la empresa misma,
  no una tabla de negocio. No bloquea.

Hallazgos de contexto ya aceptado por el humano, que no se cuentan: el tamaño de 42 archivos y el rojo local de
`./init.sh` por el cupo fullstack heredado.

## Veredicto

**OK.** 0 bloqueantes y 4 menores.
