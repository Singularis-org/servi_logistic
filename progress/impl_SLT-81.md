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
| `6cf38e05` | T1.1: migración `20261109130000_slt81_historial_datos_pais` + `down.sql` + schema |
| `6e55196a` | T1.2: schemas, `zonas-iana.ts`, `prefijo-oficial.ts` |
| `8453083e` | T1.3: `IPaisRepository` / `PaisRepository` + integración |
| `403a6417` | T1.4: `IPaisService` / `PaisService` + unit |
| `80412d5c` | T1.5: actions + `listarPaisesParaAlta` |
| `7d1a0f2d` | T1.6: R12 y R14 de punta a punta |
| `b66a7a47` | lint de los dobles de test |
| `fcf148c5` | `@sin-superficie` en las 5 actions nuevas hasta el Bloque 2 |

### Archivos
- Spec: `specs/SLT-81-*/requirements.md` (pregunta cerrada), `design.md` §5 (la frase que remitía a ella), `tasks.md` (T0.0–T1.6 marcadas).
- `db/migrations/20261109130000_slt81_historial_datos_pais/{migration,down}.sql`, `db/schema.prisma`.
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
  forma de la clave) y que la migración va en `20261108120000`, detrás de `20261107130100` que trae `dev` (renombrada a `20261109130000` en F2.3).

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

## Tanda 3 · bloque 3

Fecha: 2026-11-09. Rol: frontend_dev. Sin dependencias nuevas. El MCP del grafo no se usó (el
worktree no está indexado, como en las tandas 1 y 2): Grep/Read.

### Commits
| Commit | Task |
|---|---|
| `f06f2019` | T3.1: `paisDeLaEmpresaParaUi` (misma lectura del layout), `PaisDeLaEmpresaProvider`, `useTelefonoDelPais`, `PrefijoTelefonico` (+ la línea de Decisiones del leader en `progress/features/SLT-81.md`) |
| `257d410a` | T3.2: `UsuarioForm` (R16, R18, R23) |
| `17ec253a` | T3.3: alta de empresa (R20) |
| `f20e5ae0` | T3.4: corregir datos del cliente (R21) |
| `109c2e46` | T3.5: destinatarios de WhatsApp (R22) |
| `54c3d18c` | T3.6: postulación pública (R19, R27) |
| `30320012` | T3.7: guardias `formularios-pais-sin-literales` (R24) y `tipos-documento-sin-borrado` (R13) |

### Archivos
- Nuevos: `providers/PaisDeLaEmpresaProvider.tsx`, `hooks/use-telefono-del-pais.ts`, `components/shared/PrefijoTelefonico.tsx`.
- `lib/types/pais.ts` (`TelefonoDelPais`, `telefonoDelPais()`, `PaisDeLaEmpresaParaUi`), `lib/interfaces/services/IPaisService.ts` + `lib/services/PaisService.ts` (`paisDeLaEmpresaParaUi`).
- `app/(app)/layout.tsx`: `paisDelActor` sustituye a `etiquetasDelActor`; monta `PaisDeLaEmpresaProvider` alrededor de `EtiquetasGeograficasProvider` (que no cambia).
- `lib/interfaces/repositories/IUserRepository.ts` (`UsuarioPublico.tipoIdentificacionNombre?`, contrato de `listTiposIdentificacion()` sin país), `lib/services/UsuarioService.ts` (`obtener`).
- Formularios: `app/(app)/configuracion/_components/UsuarioForm.tsx`, `app/(app)/plataforma/empresas/{page.tsx,_components/EmpresasModule.tsx}`, `app/(app)/ordenes/_components/CorregirDatosClienteModal.tsx`, `app/(app)/configuracion/envios-whatsapp/_components/DestinatariosField.tsx`, `app/postulacion/{page.tsx,_components/PostulacionForm.tsx}`.
- Tests nuevos: `tests/components/PrefijoTelefonico.test.tsx`, `tests/components/DestinatariosField.test.tsx`, `tests/unit/guards/formularios-pais-sin-literales.guardia.test.ts`, `tests/unit/guards/tipos-documento-sin-borrado.guardia.test.ts`.
- Tests ampliados o ajustados: `tests/components/AppLayout.test.tsx`, `tests/unit/services/pais-service.test.ts`, `tests/unit/actions/geografia-plataforma-action.test.ts` (doble con el método nuevo), `tests/unit/components/usuario-form.test.tsx`, `tests/unit/services/usuario-service-superadmin.test.ts`, `tests/components/empresas-module.test.tsx`, `tests/components/EmpresasModule{Cobro,CobroPorcentual,Periodo,Plan}.test.tsx`, `tests/integration/empresas-page.test.tsx`, `tests/components/CorregirDatosCliente.ordenes.test.tsx`, `tests/components/PostulacionForm.test.tsx`, `tests/integration/postulacion-page.test.tsx`.

### Mapa R → test (los de esta tanda)
| R | Test |
|---|---|
| R13 (guardia) | `tipos-documento-sin-borrado.guardia.test.ts` «nada en lib/ ni app/ borra filas de tipo_identificacion» + contraprueba |
| R16 (UI) | `usuario-form.test.tsx` «R16: el tipo inactivo del usuario se muestra deshabilitado como su valor actual», «R16: el tipo inactivo no se ofrece a otro usuario ni en un alta»; `usuario-service-superadmin.test.ts` «SLT-81 R16: obtener trae el nombre de su tipo aunque esté inactivo» |
| R18 | `usuario-form.test.tsx` «R18: muestra +<prefijo> del proveedor y los tipos activos por nombre, en el orden recibido» |
| R19 | `postulacion-page.test.tsx` «R19: dentro de `conEmpresa` de una empresa de XA…», «R19/R23: un país sin prefijo cargado baja `null`…»; `PostulacionForm.test.tsx` «R19: pinta +<prefijo> junto al teléfono» |
| R20 | `empresas-module.test.tsx` «R20: al elegir Ecuador muestra +593 y solo sus tipos; al pasar a Costa Rica el tipo elegido se vacía», «R20: el alta envía el `value` del tipo del país elegido», «sin país elegido, el tipo está deshabilitado…»; `empresas-page.test.tsx` «SLT-81 R20: los tipos llegan con cada país…» |
| R21 | `CorregirDatosCliente.ordenes.test.tsx` «R21: muestra +<prefijo>…», «R21: no valida el teléfono con la regla del país…» |
| R22 | `DestinatariosField.test.tsx` «R22: con un teléfono que no sirve, el aviso dice +<prefijo> y <n> dígitos del país», «R22: con otro país, la regla es la de ese país» |
| R23 | `PrefijoTelefonico.test.tsx` «R23: sin prefijo, el teléfono va solo con el aviso…», «R23: sin proveedor es null…», `telefonoDelPais (R23)`; casos R23 en `usuario-form`, `empresas-module`, `CorregirDatosCliente.ordenes`, `DestinatariosField`, `PostulacionForm`; `AppLayout.test.tsx` «SLT-81 R23: el superadmin y una lectura rota bajan `telefono: null`…»; `pais-service.test.ts` «SLT-81 R23: país sin prefijo → telefono null…» |
| R24 | `formularios-pais-sin-literales.guardia.test.ts` (7 archivos + contraprueba) |
| R27 | `postulacion-page.test.tsx` «R27: sin empresa en el contexto dice «La postulación se abre desde la página de una empresa», sin formulario ni tipos» |

Pendientes del Bloque 4: R25 (E2E) y T4.2/T4.3.

### Desvíos del design
1. **`TelefonoDelPais` lleva `paisNombre`** además de `prefijo` y `digitosNacionales` (§7.1 da solo
   los dos): el texto de R22 que fija §7.6 es «En <país> el número es…». Sale de la misma lectura.
2. **R16: el nombre del tipo inactivo lo pone `UsuarioService.obtener`**, que llama a
   `listTiposIdentificacion()` sin país (trae también los inactivos; con empresa en el contexto la
   RLS `tipo_identificacion_del_pais` la acota a su país) y añade `tipoIdentificacionNombre` a
   `UsuarioPublico` (opcional). No se tocó `UserRepository.findById`: lo lee el layout en cada página
   y un `select` de la relación obligatoria rompería el portal si la RLS ocultara el tipo. Es una
   consulta más, solo al abrir la edición. El contrato de `listTiposIdentificacion()` sin país se
   reescribió: su único uso anterior (el alta de empresa) pasó a `listarPaisesParaAlta`.
3. **`PrefijoTelefonico` con `mostrarAviso`**: en el alta de empresa, antes de elegir país, no se
   pinta ni el prefijo ni el aviso de R23 (aún no hay país del que hablar). El árbol del componente
   no cambia de forma con o sin prefijo, para que el `Input` no se remonte y pierda el foco.
4. **El alta de empresa usa solo `prefijoTelefonico`** de `PaisParaAltaDTO` (no trae dígitos): un
   país con prefijo y sin dígitos pinta el prefijo. Los formularios del portal usan `telefono: null`
   si falta cualquiera de los dos (R23).
5. **Postulación sin empresa no consulta nada** (tampoco vehículos) y pinta el aviso con
   `role="note"`; el texto vive en `POSTULACION_SIN_EMPRESA` (exportado, listo para i18n).
6. **R24 y el campo `cedula`**: la guardia descuenta `"cedula"` cuando es el NOMBRE del campo del
   número (`id="cedula"`, `setField("cedula"`, `formData.set("cedula"`, la unión `| "cedula"` de un
   `Record`), que existe en `UsuarioForm` y `PostulacionForm` y no habla del país. La contraprueba
   fija que `{ value: "cedula", … }` sí la pone roja.
7. **`empresas-module.test.tsx` «R9: sin país, el alta queda bloqueada»** ya no elige tipo (sin país
   el `Select` está deshabilitado): sigue afirmando que el país queda marcado y que la action no se
   llama; el tipo también queda marcado.

8. **Commit extra `fd360b7e`** (`test(SLT-81)`): tres tests de Usuarios (`UsuariosTopePlan`,
   `usuarios-aviso-zona`, `usuarios-nombre-no-imprimible`) tenían dobles de
   `listarTiposIdentificacion` sin `nombre`; desde R18 la opción se rotula con él. Lo destapó
   `vitest related`.

### Verificación (salida real)
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck`: exit 0, 0 `error TS` (tras cada task y al final).
- `pnpm exec eslint` de los archivos de cada commit: exit 0, sin avisos.
- `pnpm test:guardias`: 334 archivos (330 pasan, 3 saltados, 1 falla) → 4 tests rojos, todos de
  `dependencias-declaradas-presentes` (baseline). Las dos guardias nuevas verdes; cada una se puso
  roja a mano una vez (`"506"` añadido a `PrefijoTelefonico.tsx`; un `tipoIdentificacion.delete` en
  `lib/types/pais.ts`) y se revirtió.
- Componentes y unit de cada R: `PrefijoTelefonico` 7/7; `AppLayout` + `asistente-panel-hermano` +
  `etiquetas-geograficas-sin-literal` + `pais-service` (95 + 2 nuevos); `usuario-form` 37/37;
  `usuario-service{,-superadmin}` 44/44; `empresas-module` + `empresas-page` 64/64 y los cuatro
  `EmpresasModule*` verdes; `CorregirDatosCliente.ordenes` + `corregir-datos-sin-rastro.guardia` 65/65;
  `DestinatariosField` 4/4; `postulacion-page` + `PostulacionForm` 25/25.
- `vitest related --run --pool=threads --exclude "tests/integration/**"`, en lotes ≤ 5:
  - lote 1 (`layout.tsx`, `PrefijoTelefonico.tsx`, `use-telefono-del-pais.ts`, `PaisDeLaEmpresaProvider.tsx`, `lib/types/pais.ts`): 235 archivos, 3863 tests, 1 fallo (`UsuariosTopePlan` «R28: crear con el tope…», el doble sin `nombre`) → arreglado en `fd360b7e`; los 3 archivos afectados, 25/25.
  - lote 2 (`UsuarioForm`, `DestinatariosField`, `CorregirDatosClienteModal`, `EmpresasModule`, `empresas/page.tsx`): 57 archivos, 826 tests, 0 fallos.
  - lote 3 (`PostulacionForm`, `postulacion/page.tsx`, `IPaisService`, `PaisService`, `UsuarioService`): 195 archivos, 2973 tests, 0 fallos.
  - lote 4 (`IUserRepository.ts`): 287 archivos, 4117 pasan, 26 saltados, 0 fallos.
  - Nota: dos lotes cortados por `timeout 590` (exit 124, carga de la máquina) se repitieron sin el corte, en segundo plano.
- `tests/integration/postulacion-page.test.tsx` y `empresas-page.test.tsx` son de jsdom (sin base): corren y pasan aquí.

**Veredicto:** T3.1–T3.7 hechas; typecheck, lint, guardias (salvo el baseline), tests de cada R y `vitest related` en verde.

### Preguntas abiertas
- Ninguna que bloquee. A revisar: desvío 2 (`obtener` lee la lista sin país para el nombre del tipo
  inactivo) y desvío 6 (la guardia de R24 descuenta `"cedula"` como nombre de campo).

## Tanda 4 · bloque 4

Fecha: 2026-11-09. Rol: implementer (directo, sin subagentes, por indicación del leader). Sin
dependencias nuevas. Grep/Read (worktree sin indexar).

### Commits
| Commit | Task |
|---|---|
| `c01b1bd0` | T4.1 (previo): `superadmin-empresas.spec.ts` y `altaDeEmpresaPorPantalla` (`_superadmin-fixture.ts`) eligen «Cédula física» y no «cedula» (+ la línea de Decisiones de la tanda 3 en `progress/features/SLT-81.md`) |
| `9f7adee1` | T4.1: `e2e/datos-pais-superadmin.spec.ts` + entrada en `playwright.config.ts` (proyecto `aislamiento`) |
| `0e8467f4` | T4.2: `docs/architecture.md > País por empresa` |
| (este) | T4.3: mapa R1–R28 y verificación |

### Archivos
- Nuevo: `e2e/datos-pais-superadmin.spec.ts` (2 casos, serial).
- `playwright.config.ts`: `datos-pais-superadmin` al final de `aislamiento`. La matriz de
  `.github/workflows/gate.yml` (`grupo: [aislamiento, reparto, dinero]`) y `docs/verification.md`
  no cambian: el spec cae en un grupo que ya existe.
- `e2e/_superadmin-fixture.ts`, `e2e/superadmin-empresas.spec.ts`: el nombre de la opción del tipo.
- `docs/architecture.md`: dos sub-bullets nuevos bajo «País por empresa» (datos del país; formularios
  del país) y la excepción de UI de `pais-sin-literales` pasa de «SLT-81» a «SLT-92».

### El E2E (R25)
- **País:** el primero de `PA, GT, HN, SV, NI, DO, PY, UY, BO, PE, CL, AR, VE, MX, ES, PT` que la
  base no tenga (lectura con `clienteDueno`); si se agotan, falla con un mensaje que lo dice.
- **Datos:** prefijo `getCountryCallingCode`; dígitos y teléfono del maestro de
  `getExampleNumber(pais, libphonenumber-js/mobile/examples)` (validados con `max` en local: PA 8,
  GT 8, HN 8, SV 8, NI 8, DO 10, PY 9…); zona, la primera que ofrece el selector al escribir
  «America»; tipo «Documento E2E <hex>», dígitos, 8–10; documento de 9 dígitos.
- **Caso 1:** «Nuevo país» → el prefijo llega cargado con el oficial (R26) → «Dar de alta» → en
  `?pais=<id>` la región «Datos del país» no dice «Datos incompletos», sus `dd` son `+<prefijo>`,
  los dígitos y la zona, y la tabla trae una fila con el tipo y su interruptor activo.
- **Caso 2:** `/plataforma/empresas`, se elige el país: `prefijo-telefonico` = `+<prefijo>`; el
  `listbox` del tipo tiene exactamente 1 opción, con el nombre del tipo; el alta sale
  (`AVISO_EMPRESA_CREADA`, la fila por slug con el país) y en la base la empresa es de ese país y el
  maestro tiene ese tipo y el teléfono nacional.
- Alta de empresa sin geografía: `OrganizacionService.validarConElPais` solo exige prefijo, dígitos,
  zona y un tipo activo (SLT-42 R6), y `PaisService.crear` deja el país `disponible`: no se carga CSV.
- **No corrido en local** (necesita base desechable y `.env`, por indicación del leader): queda para
  el check `e2e` de CI. Compila (`pnpm typecheck`, el `tsconfig` incluye `e2e/`) y Playwright lo lista.

### Desvíos
1. **Commit `c01b1bd0` fuera de las tasks.** Desde T3.3 el `Select` de tipo del alta de empresa rotula
   cada opción con su `nombre` («Cédula física»), no con el `value`. `superadmin-empresas.spec.ts`
   (grupo `plataforma-vacia`, del que depende `aislamiento`) y `altaDeEmpresaPorPantalla` seguían
   pulsando la opción «cedula» y habrían caído en CI. No hay otro E2E que pulse una opción de tipo.
2. **T4.1 y T4.3 quedan sin marcar:** T4.1 pide dos corridas locales y el check `e2e` de CI; T4.3 pide `./init.sh` verde y cada R pasando (R25 y la integración solo corren en CI).
3. **`./init.sh` rojo por algo ajeno** (ver Verificación): el validador del board corta antes de los
   tests. Los pasos que siguen se corrieron a mano, en el mismo orden.

### Mapa R1–R28 → test
| R | Test (archivo › caso) |
|---|---|
| R1 | `tests/unit/services/pais-service-datos.test.ts` › «SLT-81 R1 — solo el superadmin escribe los datos del país»; `tests/unit/actions/geografia-plataforma-action.test.ts` › «SLT-81 R1 — las actions de los datos del país: puerta antes de validar, sin tocar el servicio» |
| R2 | `tests/components/GeografiaDatosDelPais.test.tsx` › «R2 — la sección muestra los cuatro datos del país, también los tipos inactivos»; E2E caso 1 |
| R3 | `GeografiaDatosDelPais.test.tsx` › «R3 — un país incompleto nombra cada dato que falta» |
| R4 | `tests/integration/db/pais-datos-plataforma.test.ts` › «R4: CR llega completo de las migraciones de SLT-42: 506, 8, America/Costa_Rica y cinco tipos activos» |
| R5 | `pais-service-datos.test.ts` › «SLT-81 R5 — el alta exige prefijo, dígitos, zona y al menos un tipo»; `tests/components/GeografiaPlataformaAltaPais.test.tsx` › «R5: sin dígitos, sin zona y con el tipo vacío no envía y marca cada campo» |
| R6 | `pais-datos-plataforma.test.ts` › «R6: un tipo con clave repetida tumba el alta: ni país ni tipos ni historial» y «R6/R17: el alta crea el país, sus tipos en orden…» |
| R7 | `pais-service-datos.test.ts` › «SLT-81 R7 — formato del prefijo y de los dígitos» |
| R8 | `tests/unit/utils/zonas-iana.test.ts`; `pais-service-datos.test.ts` › «SLT-81 R8 — la zona está en la lista del servidor y la base la conoce»; `pais-datos-plataforma.test.ts` › «R8: zonaConocidaPorLaBase pregunta a pg_timezone_names»; `GeografiaDatosDelPais.test.tsx` › «R8 — el selector de zona busca por texto…» |
| R9 | `pais-service-datos.test.ts` › «R9: «cedula fisica» contra «Cédula  Física» en el mismo país → conflict en el nombre», «R9 en el alta: dos tipos con el mismo nombre plegado…» |
| R10 | `pais-service-datos.test.ts` › «R10: con 3 empresas y sin confirmar → requiere_confirmacion {empresas: 3} y no escribe», «R10: confirmando 2 cuando son 3…», «R10: confirmando 3 → guarda…»; `GeografiaDatosDelPais.test.tsx` › «R10: con empresas, un segundo paso dice «afecta a 3 empresas» y reenvía con 3» |
| R11 | `pais-service-datos.test.ts` › «R11: un país sin empresas guarda sin confirmación»; `GeografiaDatosDelPais.test.tsx` › «R11: sin empresas guarda a la primera, sin segundo paso» |
| R12 | `pais-datos-plataforma.test.ts` › «R12: tras cambiar la zona y los dígitos de PA, las reglas de una empresa de PA dan los nuevos y nada guardado cambia (ni en PA ni en CR)» |
| R13 | `pais-service-datos.test.ts` › «R13: alta de un tipo en un país existente con value PA_<clave>», «R13: el servicio no ofrece borrar un tipo»; `GeografiaDatosDelPais.test.tsx` › «R13 — alta, edición y activación de tipos; sin borrar»; `tests/unit/guards/tipos-documento-sin-borrado.guardia.test.ts` |
| R14 | `pais-datos-plataforma.test.ts` › «R14: tras cambiar el largo del tipo, el usuario guardado con el formato viejo sigue igual y se edita sin revalidar; un alta nueva exige el nuevo» |
| R15 | `pais-service-datos.test.ts` › «R15: desactivar el único activo → validation_error…»; `pais-datos-plataforma.test.ts` › «R15: dos desactivaciones a la vez de los dos últimos activos dejan uno activo» |
| R16 | `pais-datos-plataforma.test.ts` › «R16: desactivar un tipo no cambia el de los usuarios que ya lo tienen»; `tests/unit/components/usuario-form.test.tsx` › «R16: el tipo inactivo del usuario se muestra deshabilitado como su valor actual» |
| R17 | `pais-datos-plataforma.test.ts` › «R17: actualizarDatos deja una fila con antes, después y empresas…», «R13/R17: … guardar igual no deja ninguna», «R17: si el historial falla, el cambio no queda» |
| R18 | `usuario-form.test.tsx` › «R18: muestra +<prefijo> del proveedor y los tipos activos por nombre, en el orden recibido» |
| R19 | `tests/integration/postulacion-page.test.tsx` › «R19: dentro de `conEmpresa` de una empresa de XA…»; `tests/components/PostulacionForm.test.tsx` › «R19: pinta +<prefijo> junto al teléfono» |
| R20 | `tests/components/empresas-module.test.tsx` › «R20: al elegir Ecuador muestra +593 y solo sus tipos; al pasar a Costa Rica el tipo elegido se vacía»; E2E caso 2 |
| R21 | `tests/components/CorregirDatosCliente.ordenes.test.tsx` › «R21: muestra +<prefijo>…» |
| R22 | `tests/components/DestinatariosField.test.tsx` › «R22: con un teléfono que no sirve, el aviso dice +<prefijo> y <n> dígitos del país» |
| R23 | `tests/components/PrefijoTelefonico.test.tsx` › «R23: sin prefijo, el teléfono va solo con el aviso…»; casos R23 de `usuario-form.test.tsx` |
| R24 | `tests/unit/guards/formularios-pais-sin-literales.guardia.test.ts` › «%s no trae `506` ni una lista fija de tipos» (7 archivos) + «CONTRAPRUEBA» |
| R25 | `e2e/datos-pais-superadmin.spec.ts` (proyecto `aislamiento`) › «R25: «Nuevo país» con prefijo, dígitos, zona y un tipo deja el país completo», «R25: el alta de empresa de ese país muestra su prefijo y exactamente su tipo, y sale bien» |
| R26 | `tests/unit/utils/prefijo-oficial.test.ts` › «SLT-81 R26 — prefijo oficial»; `pais-service-datos.test.ts` › «SLT-81 R26 — solo el prefijo oficial según libphonenumber»; `GeografiaPlataformaAltaPais.test.tsx` › «R26: al elegir el país, el prefijo aparece cargado con el oficial»; `GeografiaDatosDelPais.test.tsx` › «R26 — el formulario trae cargado el prefijo oficial» |
| R27 | `postulacion-page.test.tsx` › «R27: sin empresa en el contexto dice «La postulación se abre desde la página de una empresa», sin formulario ni tipos» |
| R28 | `tests/unit/guards/pais-sin-literales.guardia.test.ts` › «SLT-81 R28: ninguna excepcion lleva SLT-81 y las cuatro de la UI llevan SLT-92» |

Todos los R tienen al menos un test que existe. Corren aquí los de unidad, componente y guardia; los
de `tests/integration/db/` (R4, R6, R12, R14, R17 y parte de R8, R15, R16) se saltan sin base y los
corre CI; R25 lo corre el check `e2e` de CI.

### Verificación (salida real)
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck`: exit 0 (incluye `e2e/`).
- `pnpm exec eslint` de los 4 archivos de `e2e/` y `playwright.config.ts`: «No issues found».
- `pnpm exec playwright test --list --project=aislamiento`: lista
  `[aislamiento] › datos-pais-superadmin.spec.ts:132:5 › R25: «Nuevo país»…` y `…:180:5 › R25: el
  alta de empresa…`; «Total: 88 tests in 18 files».
- `vitest run tests/unit/guards/e2e-sin-saltos.guardia.test.ts`: 38/38 (el spec está en exactamente
  un proyecto; sin `skip`/`only`).
- `NODE_OPTIONS=--max-old-space-size=8192 ./init.sh`: **exit 1** en el paso 3+4, antes de los tests:
  «✗ feature_list.json invalido: features en vuelo sin assignee en el tracker: SLT-85». Es la copia
  del board del worktree principal (otra ficha); no se tocó.
- Los pasos siguientes, a mano:
  - `node scripts/check-perfil.mjs`: exit 0, «6/6 docs revisados en los ultimos 60 dias».
  - `pnpm run lint`: exit 0, 0 errores (244 avisos del repo; `eslint --quiet` de los archivos de la
    rama contra `origin/dev`: 0 errores).
  - `pnpm run test:rapido` (related contra `origin/dev` + guardias): exit 0. Related: 846 archivos (762 pasan, 84 saltados), 12074 tests (11448 pasan, 626 saltados), 0 fallos. Guardias: 333 archivos (330 pasan, 3 saltados), 4664 tests (4639 pasan, 25 saltados), 0 fallos; «245 rojo(s) heredado(s) del baseline no cuentan en esta seleccion».

**Veredicto:** T4.2 hecha. T4.3: mapa y verificación hechos, sin marcar (su «Hecho» pide `./init.sh` verde y que R25 y la integración pasen, y eso es de CI). T4.1 escrita y listada, pendiente de su corrida en CI. Typecheck, lint, guardias y related en verde; `./init.sh` rojo solo por SLT-85 sin assignee (ajeno).

### Preguntas abiertas
- `./init.sh` no llega a verde mientras SLT-85 siga en vuelo sin assignee en el board (lo resuelve el leader/humano).
- El E2E no se corrió en local: su primera corrida será la de CI.


## Integración de dev (F2.3)
- `e69bfe9c` Merge `origin/dev`. Conflictos en `tests/unit/guards/_pais-sin-literales-excepciones.ts` y
  `pais-sin-literales.guardia.test.ts`: `FichaQueLoRetira = "SLT-92" | "SLT-90" | "SL-22"` (UI en SLT-92
  «Pantallas: fechas y teléfonos en la zona y el prefijo del país de la empresa», planes en SLT-90
  «Planes: ciclo y cobro en la zona de cada empresa», con el motivo de `dev`); la lista y el título del test, igual.
- Migración renombrada con `git mv` a `20261109130000_slt81_historial_datos_pais`, detrás de la mayor de
  `dev` (`20261109120000_cobro_plataforma_traza`). En el test de ida y vuelta, `M_ANTERIOR` =
  `20261109120000_cobro_plataforma_traza`. SQL sin cambios: ninguna migración de SLT-94 «Cobro de
  fulfillment por paquete y marca «se recoge en tienda»» ni de SLT-85 «Traza de facturación de los cobros
  por orden» toca `historial_plataforma_accion`/`_entidad`.
- Verificación: `prisma generate` (URL ficticia) ok; `pnpm typecheck` exit 0; eslint de los 3 archivos exit 0;
  `pnpm test:guardias` → 340 pasan, 1 falla (`dependencias-declaradas-presentes`, 4 tests, baseline);
  `vitest related` de los archivos con conflicto → 1 archivo, 36 tests verdes.
- `./init.sh` → rojo en el paso del validador: `specs/SLT-96-consolidacion-cero-recibida/` (llega con `dev`)
  no tiene ficha en `feature_list.json`. Ajeno a SLT-81: lo resuelve el leader reimportando el board (F0).
