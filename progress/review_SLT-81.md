# Revisión SLT-81 «Datos del país: pantalla del superadmin y formularios»

- Fecha: 2026-11-09 · Reviewer · Ruta completa (fullstack, complexity high).
- Rama `feature/SLT-81-datos-pais-pantalla-y-formularios`, HEAD `98047834`; diff `origin/dev...HEAD`
  (72 archivos). `origin/dev` = `8ed0a403`.
- Grafo: no usado (worktree sin indexar, como dice `design.md`); revisión con Grep/Read.
- Decisiones y desvíos aceptados por el humano (`progress/features/SLT-81.md > Decisiones`): no se
  reportan; se comprobó que el código los cumple.

## Veredicto: RECHAZADO (cambios requeridos)

El código cumple el spec, la trazabilidad está completa y la verificación local da verde. Hay dos
hallazgos mayores, los dos de integración con `dev`: la rama no mergea limpia (choca en los archivos de
R28) y la migración ya no va detrás de la última de `dev`. Los dos tienen arreglo mecánico.

## Checklist

| # | Punto | Estado |
|---|---|---|
| 1 | Trazabilidad R1–R28 → test concreto | OK: los 28 tienen test. Comprobé que existen y qué afirman. |
| 2 | Tasks `[x]` | Pendiente: T4.1 y T4.3 sin marcar porque esperan a CI (menor m1) |
| 2b | Tamaño del PR | N/A: este repo no tiene `scripts/tamano-pr.mjs` ni `docs/gate.md > Tamaño del PR` |
| 3 | `design.md > ## Lo que ya existe` presente y respetado | OK: reutiliza SLT-42, `Combobox`, la lectura del layout y `historial_plataforma`. No re-crea nada. |
| 3 | CHECKPOINTS: requirements EARS, design con alternativas (§9), mapa en `impl_SLT-81.md` | OK |
| 3 | Typecheck | OK: `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck` termina con exit 0 |
| 3 | Lint | OK: `eslint --quiet` sobre los .ts/.tsx del diff da 0 errores |
| 3 | `gate-completo` en CI / `./init.sh` verde | Pendiente: CI todavía no corre; `./init.sh` cae por SLT-85, que es ajena (menor m2) |
| 3 | Dependencias nuevas | OK: no hay (`package.json` y el lock sin cambios; libphonenumber-js ya estaba aprobada) |
| 3 | Secretos / configuración hardcodeada / webhooks | OK / OK / N/A |
| 3 | Migración con `down.sql`, sin editar una ya aplicada | OK: el down es reversible y aborta (P0001) si hay rastro. Hay test de ida y vuelta. |
| 3 | Orden de la migración tras la última de `dev` | **FALLA** (mayor M2) |
| 3 | Tabla nueva sin RLS / `organizacion_id` | N/A: no hay tablas nuevas; `pais` y `tipo_identificacion` son de plataforma |
| 3 | Flujo crítico con E2E | No toca ninguno de la lista. R25 tiene su E2E en `aislamiento`. |
| 3 | Ninguna referencia a Ordenex; ningún literal de país nuevo | OK: la guardia R24 y `pais-sin-literales` están en verde |
| 4 | Verificación ejecutable | OK: 144 archivos de unit, componente y guardias relacionados pasan (2333 tests, `--pool=threads`). En `pnpm test:guardias` fallan 4 tests, todos de `dependencias-declaradas-presentes`, que está en el baseline. |
| 5 | `perfil-agentes > reviewer` | OK: no hay queries de negocio nuevas sin filtro (la única lectura de `organizacion` es el `count` de la plataforma dentro de `comoPlataforma`). Los comentarios explican el porqué. |
| — | Rama mergea limpia con `dev` | **FALLA** (mayor M1) |

### Lo que pidió el leader

3. **Seguridad.**
   - Hay dos puertas: `puerta()` en cada action nueva (`lib/actions/geografia-plataforma.ts:196-282`) y `GESTION_ROLES` al inicio de cada método nuevo de `PaisService` (`lib/services/PaisService.ts:177-262`).
   - Las dos tienen test. Servicio: `pais-service-datos.test.ts` › «SLT-81 R1», que recorre todos los roles de empresa sin que se llame al repositorio. Action: `geografia-plataforma-action.test.ts` › «SLT-81 R1», sin sesión y con maestro.
   - La empresa no puede escribir el catálogo: en la base sigue el `REVOKE` de SLT-42, y el servicio responde `forbidden`.
   - Zona: hace falta que `esZonaIana` y `zonaConocidaPorLaBase` den las dos `true` (`PaisService.ts:274-277`). La consulta es parametrizada.
   - Prefijo: solo el oficial (`PaisService.ts:265-271`). Se comprueba también cuando no cambia.
   - Logs: `registrarFallo` registra solo `error.name`. El `detalle` del historial no lleva PII.
   - Postulación sin empresa: devuelve `null` sin consultar país, tipos ni vehículos (`app/postulacion/page.tsx:52-54`).
4. **Transacciones.**
   - R6: `PaisRepository.crear` hace país, `createManyAndReturn` de los tipos e historial en una sola `$transaction`.
   - R17: cada escritura deja su historial en la misma transacción. Si nada cambió, no deja fila (`updateMany` con «alguno distinto»).
   - R15: hay `FOR UPDATE` sobre la fila del país.
5. **Migración.** El contenido y el down son correctos. El orden falla (M2).
6. **Formularios.**
   - La guardia `formularios-pais-sin-literales` cubre los 7 archivos y tiene contraprueba.
   - Los tipos salen del país (EmpresasModule, UsuarioForm y la postulación).
   - `DatosDelPais` recibe por props el país, los tipos, las zonas y los prefijos, y solo llama a actions para escribir.
7. **E2E.**
   - `datos-pais-superadmin` está en el proyecto `aislamiento` (`playwright.config.ts`), dentro del grupo `aislamiento` de la matriz de `.github/workflows/gate.yml:313`.
   - No tiene `skip`, `only` ni `fixme`; `e2e-sin-saltos` lo da por bueno.
   - Cubre R25: alta de país con un tipo, alta de empresa de ese país, el `+prefijo` y exactamente 1 opción con el tipo creado, y comprobación en la base.
   - Aún no se ha corrido (primera corrida en CI).
8. **Convenciones.** Las capas están bien: action → service → repository, con interfaces. zod en el borde (los schemas del servicio, como SL-20). Los comentarios explican el porqué.

## Tabla R → test

| R | Test (archivo › caso) |
|---|---|
| R1 | `tests/unit/services/pais-service-datos.test.ts` › «SLT-81 R1 — solo el superadmin escribe…»; `tests/unit/actions/geografia-plataforma-action.test.ts` › «SLT-81 R1 — las actions de los datos del país…» |
| R2 | `tests/components/GeografiaDatosDelPais.test.tsx` › «R2 — la sección muestra los cuatro datos…»; `pais-service-datos.test.ts` › «listarTiposDocumento da todos…, también los inactivos» |
| R3 | `GeografiaDatosDelPais.test.tsx` › «R3 — un país incompleto nombra cada dato que falta» |
| R4 | `tests/integration/db/pais-datos-plataforma.test.ts` › «R4: CR llega completo…» (CI) |
| R5 | `pais-service-datos.test.ts` › «SLT-81 R5 — el alta exige…» (cada campo y `[]`); `tests/components/GeografiaPlataformaAltaPais.test.tsx` › «R5: …» |
| R6 | `pais-datos-plataforma.test.ts` › «R6: un tipo con clave repetida tumba el alta…», «R6/R17: el alta crea…» (CI) |
| R7 | `pais-service-datos.test.ts` › «SLT-81 R7 — formato del prefijo y de los dígitos» (0507, +507, 5077, '', 3, 15, 8.5; bordes 4 y 14) |
| R8 | `tests/unit/utils/zonas-iana.test.ts`; `pais-service-datos.test.ts` › «SLT-81 R8 …» (dos casos); `pais-datos-plataforma.test.ts` › «R8: zonaConocidaPorLaBase…»; `GeografiaDatosDelPais.test.tsx` › «R8 — el selector…» |
| R9 | `pais-service-datos.test.ts` › «R9: %s → validation_error…» (sin nombre, caracteres, min>max, 31, 0), «R9: «cedula fisica» contra «Cédula  Física»…», «R9 en el alta…» |
| R10 | `pais-service-datos.test.ts` › «R10: con 3 empresas…», «confirmando 2…», «confirmando 3…»; `GeografiaDatosDelPais.test.tsx` › «R10: …afecta a 3 empresas…» |
| R11 | `pais-service-datos.test.ts` › «R11: un país sin empresas…»; `GeografiaDatosDelPais.test.tsx` › «R11: …» |
| R12 | `pais-datos-plataforma.test.ts` › «R12: tras cambiar la zona y los dígitos de PA…» (CI) |
| R13 | `pais-service-datos.test.ts` › «R13: …» (alta, edición, activar, sin borrar); `GeografiaDatosDelPais.test.tsx` › «R13 — …sin borrar»; `tests/unit/guards/tipos-documento-sin-borrado.guardia.test.ts` |
| R14 | `pais-datos-plataforma.test.ts` › «R14: tras cambiar el largo del tipo…» (CI) |
| R15 | `pais-service-datos.test.ts` › «R15: desactivar el único activo…»; `pais-datos-plataforma.test.ts` › «R15: …» (dos casos, CI); `GeografiaDatosDelPais.test.tsx` › «R15 — …» |
| R16 | `pais-datos-plataforma.test.ts` › «R16: desactivar un tipo no cambia…» (CI); `tests/unit/components/usuario-form.test.tsx` › «R16: …» |
| R17 | `pais-datos-plataforma.test.ts` › «R17: actualizarDatos deja una fila…», «R13/R17: …guardar igual no deja ninguna», «R17: si el historial falla…» (CI); `tests/integration/db/migracion-slt81-ida-y-vuelta.test.ts` |
| R18 | `usuario-form.test.tsx` › «R18: …» |
| R19 | `tests/integration/postulacion-page.test.tsx` › «R19: dentro de `conEmpresa`…»; `tests/components/PostulacionForm.test.tsx` › «R19: …» |
| R20 | `tests/components/empresas-module.test.tsx` › «R20: al elegir Ecuador…»; `pais-datos-plataforma.test.ts` › «R20: listarDisponiblesParaAlta…»; E2E caso 2 |
| R21 | `tests/components/CorregirDatosCliente.ordenes.test.tsx` › «R21: …» |
| R22 | `tests/components/DestinatariosField.test.tsx` › «R22: …» |
| R23 | `tests/components/PrefijoTelefonico.test.tsx` › «R23: …»; casos R23 de `usuario-form.test.tsx` |
| R24 | `tests/unit/guards/formularios-pais-sin-literales.guardia.test.ts` (7 archivos + contraprueba) |
| R25 | `e2e/datos-pais-superadmin.spec.ts` (proyecto `aislamiento`, 2 casos en serie) (CI) |
| R26 | `tests/unit/utils/prefijo-oficial.test.ts`; `pais-service-datos.test.ts` › «SLT-81 R26 …»; `GeografiaPlataformaAltaPais.test.tsx` › «R26: …»; `GeografiaDatosDelPais.test.tsx` › «R26 — …» |
| R27 | `postulacion-page.test.tsx` › «R27: sin empresa en el contexto…» |
| R28 | `tests/unit/guards/pais-sin-literales.guardia.test.ts` › «SLT-81 R28: …» (hay que revisarlo tras resolver M1) |

No hay ningún R sin test. Los marcados (CI) necesitan base o navegador y no se corrieron aquí.

## Hallazgos

### M1 — mayor: la rama no mergea con `dev` y choca justo en los archivos de R28
`git merge-tree HEAD origin/dev` da `CONFLICT (content)` en
`tests/unit/guards/_pais-sin-literales-excepciones.ts` y en
`tests/unit/guards/pais-sin-literales.guardia.test.ts`. Después de la base, `dev` pasó las tres
excepciones de planes de `SLT-86` a `SLT-90` y dejó `FichaQueLoRetira = "SLT-81" | "SLT-90" | "SL-22"`.
La rama cambió esa misma línea a `SLT-92`. Si el conflicto se resuelve mal, o vuelve `SLT-81` (lo que
rompe R28) o se pierde `SLT-90` (lo que rompe las excepciones de planes).

**Arreglo:** integrar `origin/dev` en la rama. El tipo debe quedar en `"SLT-92" | "SLT-90" | "SL-22"`,
con las cuatro entradas de UI en `SLT-92` y las tres de planes en `SLT-90` (con el motivo de `dev`).
En el test, la lista de fichas aceptadas y el título deben quedar en `SLT-92, SLT-90 o SL-22`. Después,
volver a correr `pais-sin-literales.guardia`, typecheck y `vitest related`.

### M2 — mayor: la migración no va detrás de la última de `dev`
`db/migrations/20261108120000_slt81_historial_datos_pais` tiene la misma marca que
`20261108120000_slt94_fulfillment_enums`, que ya está en `dev`. Además queda delante de
`20261108120100_slt94_se_recoge_en_tienda`, `…120200_slt94_fulfillment_movimiento` y
`…120300_slt94_fulfillment_triggers`, también en `dev`. `design.md §2.1` pide ponerla detrás de la
mayor de `dev`. En una base donde ya se aplicaron las de SLT-94, quedaría como migración «del pasado»:
Prisma `migrate dev` la marca como fuera de orden, y el historial de esquema no refleja el orden real.
`tests/integration/db/migracion-slt81-ida-y-vuelta.test.ts:37-38` fija también
`M_ANTERIOR = "20261107120200_…"`.

**Arreglo:** al integrar `dev` (M1), renombrar la carpeta a una marca posterior a `20261108120300`,
por ejemplo `20261109120000_slt81_historial_datos_pais`. Actualizar `M` y `M_ANTERIOR` del test de ida
y vuelta (`M_ANTERIOR` = la última de `dev`) y las referencias en `design.md §2.1`,
`progress/impl_SLT-81.md` y `docs/architecture.md`, si la nombran. El contenido no cambia: los enums
de `historial_plataforma` no los toca ninguna de las migraciones de `dev`.

### m1 — menor: T4.1 y T4.3 sin `[x]`
Esperan a CI: la corrida del E2E y `gate-completo` en verde. No bloquean abrir el PR, pero sí el
cierre: marcarlas cuando el check `e2e` y `gate-completo` estén en verde, y anotar su salida en
`progress/impl_SLT-81.md`.

### m2 — menor: `./init.sh` no llega a verde
Corta en el validador del board porque SLT-85 está en vuelo sin assignee. Es ajeno a esta rama, pero el
checkpoint «`./init.sh` verde en el worktree» sigue pendiente. Lo resuelve el leader en el tracker.
Después, volver a correr `./init.sh` sobre la rama ya integrada (M1/M2).

### m3 — menor: el E2E nunca corrió
`datos-pais-superadmin` solo se listó y compiló; su primera corrida será la de CI. Si falla, vuelve al
implementer. Va anotado para que nadie dé R25 por verificado antes del check `e2e`.

## Verificación corrida por el reviewer (salida real)
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck` → exit 0.
- `pnpm exec eslint --quiet <archivos .ts/.tsx del diff>` → exit 0, sin salida.
- `pnpm exec vitest run --pool=threads <19 rutas de unit, componente, integración sin base y guardias del diff>` → 144 archivos y 2333 tests, todos pasan.
- `pnpm test:guardias` → 330 archivos pasan, 3 saltados y 1 que falla: `dependencias-declaradas-presentes`, con 4 tests en rojo, todos del baseline (`tests/baseline-rojos.json`).
- `git merge-tree --write-tree HEAD origin/dev` → 2 conflictos (M1).
- Integración contra Postgres y E2E: no se corrieron. Los corre CI.

## Correcciones
- **M1** — `e69bfe9c` (Merge origin/dev en SLT-81): `FichaQueLoRetira = "SLT-92" | "SLT-90" | "SL-22"`;
  UI en SLT-92, planes en SLT-90 con el motivo de `dev`; título y lista del test con las mismas fichas.
  `pais-sin-literales.guardia` 36/36 verde, typecheck exit 0.
- **M2** — `407700f3` (chore(SLT-81): migracion renombrada tras dev): `20261109130000_slt81_historial_datos_pais`,
  detrás de `20261109120000_cobro_plataforma_traza`; `M`/`M_ANTERIOR`, `down.sql`, schema, design, tasks y
  bitácora actualizados. SQL igual: ninguna migración de `dev` toca los enums de `historial_plataforma`.
