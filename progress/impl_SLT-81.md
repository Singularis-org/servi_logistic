# impl SLT-81 «Datos del país: pantalla del superadmin y formularios»

## Tanda 1 · T0 + bloque 1

Fecha: 2026-11-06. Rama `feature/SLT-81-datos-pais-pantalla-y-formularios`, worktree propio.
Rol: backend_dev. Sin dependencias nuevas. Sin base de datos local: los tests de integración se
cargan (vitest los salta sin `HAY_BASE_DE_DATOS`) y los corre CI.
El MCP del grafo no se usó: el índice del worktree no está (design, «Lo que ya existe»); Grep/Read.

### Commits
| Commit | Task |
|---|---|
| `3f3b5a75` | T0.0: la pregunta del país sin prefijo oficial pasa a «Decisiones cerradas» (+ línea de Decisiones de `progress/features/SLT-81.md`) |
| `002d1f22` | T0.1: excepciones de `pais-sin-literales` a SLT-92 (R28) |
| `6cf38e05` | T1.1: migración `20261108120000_slt81_historial_datos_pais` + `down.sql` + schema |
| `6e55196a` | T1.2: schemas, `zonas-iana.ts`, `prefijo-oficial.ts` |
| `8453083e` | T1.3: `IPaisRepository` / `PaisRepository` + integración |
| `403a6417` | T1.4: `IPaisService` / `PaisService` + unit |
| `80412d5c` | T1.5: actions + `listarPaisesParaAlta` |
| `7d1a0f2d` | T1.6: R12 y R14 de punta a punta |
| `b66a7a47` | lint de los dobles de test |
| `fcf148c5` | `@sin-superficie` en las 5 actions nuevas hasta el Bloque 2 |

### Archivos
- Spec: `specs/SLT-81-*/requirements.md` (pregunta cerrada), `design.md` §5 (la frase que remitía a ella), `tasks.md` (T0.0–T1.6 marcadas).
- `db/migrations/20261108120000_slt81_historial_datos_pais/{migration,down}.sql`, `db/schema.prisma`.
- `lib/types/pais.ts`, `lib/utils/zonas-iana.ts` (nuevo), `lib/utils/prefijo-oficial.ts` (nuevo), `lib/validacion/telefono.ts` (solo el comentario de «único módulo»).
- `lib/interfaces/repositories/IPaisRepository.ts`, `lib/repositories/PaisRepository.ts`.
- `lib/interfaces/services/IPaisService.ts`, `lib/services/PaisService.ts`.
- `lib/actions/geografia-plataforma.ts`, `lib/actions/_shared/paises-plataforma.ts`.
- Tests nuevos: `tests/integration/db/migracion-slt81-ida-y-vuelta.test.ts`, `tests/integration/db/pais-datos-plataforma.test.ts`, `tests/unit/services/pais-service-datos.test.ts`, `tests/unit/utils/{zonas-iana,prefijo-oficial}.test.ts`.
- Tests ajustados: `tests/unit/guards/{_pais-sin-literales-excepciones.ts,pais-sin-literales.guardia.test.ts}`, `tests/unit/services/pais-service.test.ts`, `tests/unit/actions/geografia-plataforma-action.test.ts`, `tests/integration/db/{pais-repositorio,geografia-superadmin-sin-empresa}.test.ts`.

### Mapa R → test (los de esta tanda)
| R | Test |
|---|---|
| R1 | `pais-service-datos.test.ts` «SLT-81 R1 — … recibe forbidden en cada método nuevo y el repositorio no se llama» (todos los roles de empresa); `geografia-plataforma-action.test.ts` «SLT-81 R1 — …» (sin sesión → `unauthenticated`, maestro y cada rol de empresa → `forbidden`, sin tocar el servicio) |
| R4 | `pais-datos-plataforma.test.ts` «R4: CR llega completo…» |
| R5 | `pais-service-datos.test.ts` «SLT-81 R5 — …» (falta cada campo; lista vacía) |
| R6 | `pais-datos-plataforma.test.ts` «R6/R17: el alta crea el país, sus tipos…» y «R6: un tipo con clave repetida tumba el alta…» |
| R7 | `pais-service-datos.test.ts` «SLT-81 R7 — …» (0507, +507, 5077, '', 3, 15, 8.5; bordes 4 y 14) |
| R8 | `zonas-iana.test.ts`; `pais-service-datos.test.ts` «SLT-81 R8 — …» (fuera de la lista; la base no la conoce); `pais-datos-plataforma.test.ts` «R8: zonaConocidaPorLaBase…» |
| R9 | `pais-service-datos.test.ts` «SLT-81 R9/R13 — …» (sin nombre, caracteres, mín > máx, máx 31, mín 0; «cedula fisica» vs «Cédula  Física» → conflict; renombre; mismo nombre en otro país) y «R9 en el alta…» |
| R10, R11 | `pais-service-datos.test.ts` «SLT-81 R10/R11 — …»; `pais-datos-plataforma.test.ts` «R12…» (pide confirmación con 1 empresa sobre la base) |
| R12 | `pais-datos-plataforma.test.ts` «R12: tras cambiar la zona y los dígitos de PA…» |
| R13 | `pais-service-datos.test.ts` «SLT-81 R9/R13», «SLT-81 R13/R15» (incl. «el servicio no ofrece borrar»); `pais-datos-plataforma.test.ts` «R13/R17: alta, edición, desactivación y activación…» |
| R14 | `pais-datos-plataforma.test.ts` «R14: tras cambiar el largo del tipo…» |
| R15 | `pais-service-datos.test.ts` «R15: desactivar el único activo…»; `pais-datos-plataforma.test.ts` «R15: desactivar el único tipo activo…» y «R15: dos desactivaciones a la vez…» |
| R16 | `pais-datos-plataforma.test.ts` «R16: desactivar un tipo no cambia el de los usuarios…» (la parte de UI es del Bloque 3) |
| R17 | `migracion-slt81-ida-y-vuelta.test.ts`; `pais-datos-plataforma.test.ts` (R6/R17, R13/R17, «R17: actualizarDatos deja una fila…», «R17: si el historial falla…») |
| R20 (datos) | `pais-datos-plataforma.test.ts` «R20: listarDisponiblesParaAlta…» (la UI es T3.3) |
| R26 | `prefijo-oficial.test.ts`; `pais-service-datos.test.ts` «SLT-81 R26 — …» |
| R28 | `pais-sin-literales.guardia.test.ts` «SLT-81 R28: ninguna excepcion lleva SLT-81…» |

Pendientes de bloques siguientes: R2, R3, R18, R19, R21–R25, R27 (UI, guardias de R24 y de borrado, E2E).

### Desvíos del design
1. **`IPaisRepository.tipoDocumentoPorId(id)`** (no está en §4.3). `editarTipoDocumento` necesita el
   país del tipo para R9 (nombre repetido en el país) y para `not_found`; no hay otra forma sin
   inventar un parámetro en la entrada.
2. **`actualizarDatos(id, datos, empresas, actor)`** recibe el número de empresas: §2.2 pide
   `empresas: N` en el `detalle` y el número lo calcula el servicio.
3. **Schemas de tipo con una función `conLargosEnOrden`** en vez de `tipoDocumentoNuevoSchema.and(…)`:
   en zod 4 un `.and` de dos objetos `.strict()` rechaza los campos del otro lado. Misma forma de
   entrada y mismo error en `largoMax`.
4. **Todas las entradas nuevas las valida el servicio** (también `actualizarDatos`, `crearTipo…`,
   `editarTipo…`, `cambiarActivo…`), como `crear` de SL-20: §11 pone los casos de R7/R9 en el test de
   servicio. Las actions solo pasan la entrada; `listarTiposDocumentoAction` valida `paisId`.
5. **Errores con ruta completa** (`tiposDocumento.0.nombre`) por `issue.path.join(".")`, como pide §6;
   un campo de más sigue llegando como `entrada`.
6. **`conflict {campo: "tiposDocumento"}`** en `crear` si la base rechaza la clave o el `value` de un
   tipo en carrera (§4.3 lo pide al repositorio; el servicio lo pasa tal cual).
7. **Nombre sin letras ni dígitos** (p. ej. «--», que pasa las cotas 2..40) da una clave vacía:
   `validation_error` en el nombre. El design no lo trata; es la única salida que no inventa una clave.
8. **Clave**: cada carácter fuera de `[a-z0-9]` pasa a `_` (lectura literal de §4.2; «N.I.T.» → `n_i_t`).
9. **`geografia-superadmin-sin-empresa.test.ts` pasa de `BV` a `TV` (Tuvalu, +688)**: por la decisión
   del 2026-11-07, R26 ya no deja dar de alta `BV`. Limpia también `tipo_identificacion`.
10. **`@sin-superficie`** en las 5 actions nuevas: la guardia `superficie-de-uso` las marca porque la
    pantalla llega en el Bloque 2. La anotación caduca sola al montarla (la guardia exige quitarla).
11. `libphonenumber-js/min` en `prefijo-oficial.ts` (solo el prefijo; `max` sigue en `telefono.ts`).

### Verificación (salida real)
- `pnpm prisma validate`: `The schema at db\schema.prisma is valid`.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck`: exit 0, 0 `error TS`.
- `pnpm exec eslint <21 archivos tocados>`: 0 errores (2 avisos de variables sin usar, corregidos en `b66a7a47`; re-lint limpio).
- `pnpm test:guardias`: 327 archivos pasan, 2 fallan → 5 tests rojos: los 4 del baseline de
  `dependencias-declaradas-presentes` + `superficie-de-uso` (R-A, las 5 actions nuevas). Corrido solo,
  `superficie-de-uso` falló igual (no era la carga); arreglado con la anotación de `fcf148c5`:
  `superficie-de-uso.guardia.test.ts` 18/18. `sql-a-mano-por-empresa` verde (sin excepción nueva).
- Tests de los R tocados: `pais-service-datos` + `pais-service` 102/102; `geografia-plataforma-action` +
  `composition-root` 93/93; `zonas-iana` + `prefijo-oficial` 12/12; `pais-sin-literales.guardia` 36/36
  (+1 de R28); la probeta de T0.1 (una entrada con `ficha: "SLT-81"`) dio `TS2820` y se revirtió.
- `vitest related` sin `tests/components` ni `tests/integration`, en lotes de 5:
  - lote 1 (`lib/types/pais.ts`, `zonas-iana.ts`, `prefijo-oficial.ts`, `telefono.ts`, `IPaisRepository.ts`): 98 archivos, 1652 tests, 0 fallos.
  - lote 2 (`PaisRepository.ts`, `PaisService.ts`, `IPaisService.ts`, `geografia-plataforma.ts`, `paises-plataforma.ts`): 289 archivos, 4746 tests, 0 fallos.

**Veredicto:** T0.0–T1.6 hechas; typecheck, lint, guardias (salvo el baseline) y los tests de unidad relacionados en verde; la integración la corre CI.
- Integración (`migracion-slt81-ida-y-vuelta`, `pais-datos-plataforma`, `pais-repositorio`,
  `geografia-superadmin-sin-empresa`): cargan y se saltan sin base; los corre CI.

### Preguntas abiertas
- Ninguna que bloquee. A revisar por el leader: los desvíos 1, 7 y 8 (contrato del repositorio y la
  forma de la clave) y que la migración va en `20261108120000`, detrás de `20261107130100` que trae `dev`.

## Tanda 2 · bloque 2

Fecha: 2026-11-09. Rol: frontend_dev. Sin dependencias nuevas. El MCP del grafo no se usó (el
worktree no está indexado, como en la tanda 1): Grep/Read.

### Commits
| Commit | Task |
|---|---|
| `2c850b81` | T2.1: sección «Datos del país» + retirada de las 5 `@sin-superficie` (+ la línea de Decisiones del leader en `progress/features/SLT-81.md`) |
| `db9979c2` | T2.2: «Nuevo país» con prefijo, dígitos, zona y tipos |

### Archivos
- Nuevo: `app/(app)/plataforma/geografia/_components/DatosDelPais.tsx` (sección, modal de teléfono y hora con su segundo paso, modal de tipo, interruptor «Activo», `ZonaHorariaCombobox` y `CamposDeTipo`, que reutiliza el alta de país).
- `app/(app)/plataforma/geografia/page.tsx`: lee `listarTiposDocumentoAction` junto al árbol (`Promise.all`), calcula `zonasIana()` y el mapa ISO → `prefijoOficial`; bandera `tiposError`.
- `app/(app)/plataforma/geografia/_components/GeografiaPlataformaModule.tsx`: props `tiposDocumento`, `tiposError`, `zonas`, `prefijosOficiales`; monta `DatosDelPais` entre «País» y el CSV; `NuevoPaisDialog` con los campos nuevos.
- `lib/actions/geografia-plataforma.ts`: solo se quitan las 5 anotaciones `@sin-superficie`.
- Tests: nuevo `tests/components/GeografiaDatosDelPais.test.tsx` (19); ampliado `tests/components/GeografiaPlataformaAltaPais.test.tsx` (+5); ajustado `tests/unit/components/geografia-plataforma-page.test.tsx` (mocks de las actions nuevas; el alta llena los datos nuevos y espera el envío completo).

### Mapa R → test (los de esta tanda)
| R | Test |
|---|---|
| R2 | `GeografiaDatosDelPais.test.tsx` «R2 — … prefijo, dígitos, zona y cada tipo con sus caracteres, su largo y su estado» (incl. el inactivo) |
| R3 | `GeografiaDatosDelPais.test.tsx` «R3 — sin zona y sin tipos activos → …», «… nombra los cuatro…», «si la lista de tipos falla…» |
| R5 | `GeografiaPlataformaAltaPais.test.tsx` «muestra los campos nuevos…», «R5: sin dígitos, sin zona y con el tipo vacío no envía…», «R5, R26: los errores del servidor…»; `geografia-plataforma-page.test.tsx` «el envío lleva el id elegido, los seis nombres y los datos del país…» |
| R8 (selector) | `GeografiaDatosDelPais.test.tsx` «R8 — filtra por texto sin `_` ni mayúsculas y no ofrece una zona fuera de la lista», «sin zona elegida no envía» |
| R10 | `GeografiaDatosDelPais.test.tsx` «R10: … «afecta a 3 empresas» y reenvía con 3», «R10: si al confirmar ya son más, vuelve a preguntar» |
| R11 | `GeografiaDatosDelPais.test.tsx` «R11: sin empresas guarda a la primera, sin segundo paso» |
| R13 | `GeografiaDatosDelPais.test.tsx` «no ofrece ninguna acción de borrar», «Nuevo tipo…», «Editar…», «nombre repetido…», «activar un tipo inactivo…» |
| R15 | `GeografiaDatosDelPais.test.tsx` «R15 — … el interruptor vuelve a activo y se muestra el mensaje» |
| R26 | `GeografiaDatosDelPais.test.tsx` «R26 — … carga el oficial y explica el cambio», «… sin prefijo todavía…»; `GeografiaPlataformaAltaPais.test.tsx` «R26: al elegir el país, el prefijo aparece cargado…», «R26: no ofrece un país sin prefijo oficial conocido (AQ, BV)» |

R16 queda para T3.2 (la parte de UI es el formulario de usuario).

### Desvíos del design
1. **El aviso «Datos incompletos» lleva `role="note"`, no `alert`.** Es el estado de lo cargado, no
   algo que interrumpe; con `alert` chocaba además con el `role="alert"` del resultado del CSV en la
   misma pantalla.
2. **Si la lista de tipos falla, R3 no dice «falta tipo de documento activo»**: lo que se pinta es el
   error («No se pudieron cargar los tipos de documento del país.»), igual que la decisión 13 de SL-20.
3. **El campo del nombre del tipo se rotula «Documento»** (no «Nombre»): el test de SL-20 exige que
   «Nuevo país» no tenga un textbox «Nombre…» (el nombre del país sale del catálogo).
4. **El rechazo de R15 se muestra en la sección** (`Alert` destructivo bajo la tabla), no en un toast.
5. **«Nuevo país» deja quitar filas de tipo mientras haya más de una** («Quitar el tipo N») y agregar
   hasta `TIPOS_EN_ALTA_MAX`. Es un borrador del alta, no un borrado del catálogo (R13).

### Verificación (salida real)
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck`: exit 0, 0 `error TS` (tras T2.1 y tras T2.2).
- `pnpm exec eslint` de los 7 archivos tocados: exit 0, sin avisos.
- `pnpm test:guardias`: 332 archivos (328 pasan, 3 saltados, 1 falla) → 4 tests rojos, todos de
  `dependencias-declaradas-presentes` (baseline). `superficie-de-uso` verde sin las anotaciones.
- Componentes: `GeografiaDatosDelPais` 19/19; `GeografiaPlataformaAltaPais` 9/9; `geografia-plataforma-page` 26/26.
- `vitest related --run --exclude "tests/integration/**"` (lote: `page.tsx`, `DatosDelPais.tsx`,
  `GeografiaPlataformaModule.tsx`, `geografia-plataforma.ts`): 5 archivos, 147 tests, 0 fallos.
- Nota: la primera corrida de vitest falló al arrancar el worker (`Timeout waiting for worker to
  respond`, carga de la máquina); con `--pool=threads` corrió bien. No es un fallo de los tests.

**Veredicto:** T2.1 y T2.2 hechas; typecheck, lint, guardias (salvo el baseline) y tests de componente en verde.

### Preguntas abiertas
- Ninguna que bloquee. A revisar: los desvíos 1 y 3 (rol del aviso y rótulo «Documento»).
