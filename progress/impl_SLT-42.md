# impl SLT-42 «Teléfono, documento y hora por país» · tanda 1 (Bloques 0–3)

Fecha: 2026-11-04. Rama `feature/SLT-42-telefono-documento-hora-por-pais` (sin push).

## Estado de las tasks
- Hechas: T0.1, T1.1–T1.5, T2.1–T2.4, T3.1, T3.2.
- Pendiente de una persona: T1.0, las comprobaciones previas en producción en solo lectura (design §2.5),
  antes del deploy.
- Siguientes: Bloques 4–7 (T4.1 en adelante).

## Base de datos usada
- Solo `logistic_slt42_test` (local, desechable; las 292 migraciones aplicadas, incluidas las tres de SLT-42).
  El test de ida y vuelta crea y borra su propia base `slt42_iv_<uuid>`.
- La base de desarrollo `localhost:5432/logistic` se revisó en solo lectura: `_prisma_migrations` no tiene
  ninguna fila con `slt42`. Las migraciones de SLT-42 **no** se aplicaron ahí.
- Producción: no se tocó.

## Commits
| Commit | Contenido |
|---|---|
| `df3b5be5` | T0.1 `libphonenumber-js` |
| `26ebe61d` | Bloque 1 (T1.1–T1.5) |
| `744f648f` | Bloque 2 (T2.1–T2.4); se llevó `fecha-cr.ts` sin el cambio (ver incidencias) |
| `7641e3d7` | `fecha-cr.ts` como envoltorio (T2.1) |
| `5de17599` | Bloque 3 (T3.1–T3.2) |

## Archivos
**Bloque 1**
- Nuevas migraciones, cada una con su `down.sql`:
  - `db/migrations/20261103120000_slt42_pais_telefono_y_zona/{migration,down}.sql`
  - `db/migrations/20261103120100_slt42_tipo_documento_por_pais/{migration,down}.sql`
  - `db/migrations/20261103120200_slt42_usuario_documento_unico_por_tipo/{migration,down}.sql`
- Modificados: `db/schema.prisma`, `tests/fabricas/paises.ts`, `scripts/seed-catalogos.ts`.
- Tests: `tests/integration/db/migracion-slt42-ida-y-vuelta.test.ts`, `tests/integration/db/tipo-documento-por-pais.test.ts`.

**Bloque 2**
- Nuevos: `lib/utils/calendario-zona.ts`, `lib/utils/telefono-pais.ts`, `lib/utils/documento.ts`, `lib/validacion/telefono.ts`.
- Pasan a ser envoltorios de CR: `lib/utils/fecha-cr.ts`, `lib/utils/telefono-cr.ts`. `whatsapp-telefono.ts` no cambia:
  ya delegaba en `telefono-cr.ts`.
- Tests: `tests/unit/utils/{calendario-zona,telefono-pais,documento}.test.ts`, `tests/unit/validacion/telefono.test.ts`.

**Bloque 3**
- Nuevos: `lib/interfaces/services/IReglasPaisEmpresa.ts`, `lib/services/ReglasPaisEmpresaService.ts`, `tests/fabricas/reglas-pais.ts`.
- Modificados: `lib/types/pais.ts` (`PaisDTO` con los tres campos nuevos y el nuevo `TipoDocumentoDTO`),
  `lib/interfaces/repositories/IPaisRepository.ts`, `lib/repositories/PaisRepository.ts`, `lib/db/errores-pais.ts`,
  `lib/db/excepciones-aislamiento.ts` y `lib/db/contexto-empresa.ts` (`memoriaDelMarco()`).
- Tests: `tests/unit/services/reglas-pais-empresa-service.test.ts` (nuevo) y `tests/integration/db/pais-repositorio.test.ts`
  (ampliado).
- Tests ajenos que se ajustaron solo para añadir los campos y métodos nuevos del tipo:
  `tests/unit/services/pais-service.test.ts`, `tests/unit/actions/geografia-plataforma-action.test.ts`,
  `tests/unit/components/geografia-plataforma-page.test.tsx`, `tests/components/GeografiaPlataformaAltaPais.test.tsx`.

## Mapa R → test (lo cubierto hasta aquí)
| R | Test |
|---|---|
| R1, R3 | `migracion-slt42-ida-y-vuelta` (CR con 506 / 8 / `America/Costa_Rica` y 5 tipos) y `pais-repositorio` «SLT-42 (R1, R3)» |
| R2 | `tipo-documento-por-pais` «R2: la regla del tipo se valida en la base…» |
| R4 | `tipo-documento-por-pais` «R4: sin empresa…» y «R4: una empresa recibe 42501…» |
| R5 (red de RLS) | `tipo-documento-por-pais` «R4, R5, R11, R31…». El filtro del repositorio queda para T4.1 |
| R7, R8 | `migracion-slt42-ida-y-vuelta`: filas viejas idénticas; el down aborta con DIMEX y con un repetido; bajar y volver a subir da la misma foto |
| R11 (base y puerto) | `tipo-documento-por-pais`, y en `pais-repositorio` «SLT-42 (R11)» y «SLT-42 (R11, RLS)» |
| R13 | `tipo-documento-por-pais` «R13, R31: único por empresa y tipo…» y «R13: P2002 con usuario_cedula_key» |
| R14, R16 | `tests/unit/validacion/telefono.test.ts` |
| R18, R20, R21 | `tests/unit/utils/telefono-pais.test.ts` (la tabla de CR congelada con el código anterior) |
| R10 (regla P5) | `tests/unit/utils/documento.test.ts` |
| R22, R23 | `tests/unit/utils/calendario-zona.test.ts` (CR y una zona con horario de verano) |
| R28 | `reglas-pais-empresa-service` «zonaHoraria() lanza PaisSinZonaHoraria…» |
| R30 | `reglas-pais-empresa-service` «dos contextos seguidos…», «dos contextos a la vez…», «dentro de UN marco…» |
| R31 (parcial) | Los tests de integración de arriba con dos empresas (CR y `XA`) |

Sin test todavía, porque son de los Bloques 4–7: R5 (filtro del repositorio), R6, R9, R10/R12/R14–R16 en los
servicios, R15, R17, R19, R24–R27, R29.

## Salida de los tests
Todos se corrieron con `DATABASE_URL` apuntando a `logistic_slt42_test`.

**Bloque 1** (`vitest related --run`, los 2 de integración)
```
Test Files  2 passed (2)
     Tests  12 passed (12)      Duration 76.32s
```
Ninguno saltado: los tests de integración sí corrieron contra la base.

**Guardia `unicos-por-empresa`**
```
Test Files  1 passed (1)
     Tests  15 passed (15)
```

**Bloque 2** (`vitest related --run`: los 4 tests nuevos más los 7 de `fecha-cr*`, `telefono-cr` y `whatsapp-telefono`)
```
Test Files  11 passed (11)
     Tests  164 passed (164)
```

**`fecha-cr.ts` ya como envoltorio** (5 `fecha-cr*` + `calendario-zona`)
```
Test Files  6 passed (6)
     Tests  72 passed (72)
```

**Bloque 3** (`vitest run`: el unitario, el de integración, los 4 tests ajustados y la guardia `geografia-predicado-unico`)
```
Test Files  7 passed (7)
     Tests  174 passed (174)
```
Ninguno saltado.

backend_dev además corrió:
- `vitest run` sobre los 25 archivos que importan los módulos tocados: 437 passed, 0 skipped.
- `vitest related` del Bloque 3 no terminó en 590 s.

**Typecheck y lint**
- `pnpm run typecheck`, con `NODE_OPTIONS=--max-old-space-size=8192` porque con 4 GB se queda sin memoria:
  exit 0 tras los Bloques 1 y 2; backend_dev lo repitió tras el Bloque 3 y también dio exit 0.
- `eslint --max-warnings=0` sobre los archivos tocados: limpio. Los 2 warnings que aparecieron venían de
  `tests/unit/utils/capturar-ubicacion.test.ts`, un archivo ajeno que el glob arrastró.

## Desvíos e incidencias para el leader o el humano
1. **Migración 120100, precondición.** El design pide abortar si faltan `ruc` o `pasaporte`. Pero ninguna migración
   las inserta (las siembra `db:seed`, que corre después de `migrate deploy`), así que en una base nueva o en CI la
   migración abortaría. La implementación las inserta si faltan (`ON CONFLICT DO NOTHING`, filas nuevas y
   completas) y solo rellena columnas nuevas si ya existen. En producción el resultado es el mismo que el del
   design. Pide decisión humana.
2. **`scripts/seed-catalogos.ts`** no está en «Archivos esperados». Es forzoso: con las columnas nuevas NOT NULL,
   `create: { value }` no compila. Ahora crea la fila completa de CR y deja `update: {}` sin tocar. La alternativa
   es quitar los tipos del seed. Pide decisión humana.
3. **`NULLS NOT DISTINCT`** en el nuevo `usuario_cedula_key`: no está escrito en el design, pero se conserva de SL-18.
   El down vuelve a la forma exacta de SL-18.
4. **La ficha de la excepción de plataforma** dice `SL-20` en vez de `SLT-42`, porque `FichaJira` solo acepta
   `SL-<n>` (deuda D29; mismo criterio que SLT-58). El design pedía `SLT-42`.
5. **La guardia `geografia-predicado-unico`** prohíbe el literal `activo: true` en `lib/`. Pondrá en rojo el filtro de
   R5 en `UserRepository.listTiposIdentificacion` (T4.1). Hay que decidir antes del Bloque 4: o se estrecha la
   guardia, o se crea un predicado compartido.
6. **Tipos inactivos.** `tipoDocumentoDelPais` y `IReglasPaisEmpresa.tipoDocumento` devuelven el tipo con
   `activo: false` en vez de `null`, y el servicio de T4.1 tendrá que rechazarlo (R11). Pide confirmación.
7. **`withErrorHandler`** no cambia: `PaisSinZonaHoraria` y `PaisIncompleto` salen como `INTERNAL` con el mensaje
   genérico, igual que `PaisInmutable`.
8. **`test:guardias`, rojo heredado:** `dependencias-declaradas-presentes` (4 casos) espera en `init.sh` el marcador
   «(ficha 420)». `init.sh` es igual al de `dev`. No se miró `tests/baseline-rojos.json`.
9. **Agentes de la primera corrida:**
   - El de Bloque 2 escribió `fecha-cr.ts` 6 s después del commit `744f648f`, que por eso se llevó el archivo
     original. Se corrigió en `7641e3d7`, con los tests en verde.
   - Al revisar, aún había procesos vitest vivos en este worktree, lanzados a las 17:30, 17:54 y 17:56 por los
     agentes viejos. No pude matarlos (el clasificador de permisos lo negó), pero al cerrar la tanda ya no quedaba ninguno vivo.

## Fix-up tanda 1 (2026-11-04)
- `096f0216`: `calendario-zona.ts` guarda en memoria, por zona, las conversiones de instante a hora local y de vuelta (la caché se vacía al llegar a 20 000 entradas). Arregla los timeouts de cubo-temporal R19 (de 17-19 s a 0,33 s) y del barrido de 400 días de periodicidad (de ~10 s a 6,8 s). Causa: cada cálculo pasaba por `Intl.formatToParts` sin caché.
- DescargarDataset R22: sigue siendo intermitente. El `import("exceljs")` en frío tarda ~1,2 s y el `waitFor` (línea 375) espera 1000 ms. Con el `fecha-cr.ts` viejo también falla (2 de 4 corridas). El test no se tocó: queda para que decida el leader.
- `6a21aead`: la guardia `geografia-predicado-unico` se acota a geografía. `dcc85ca3`: `seed-catalogos.ts` ya no siembra tipos de documento.
- Desvíos aceptados por el humano (2026-11-04), también en `design.md`:
  - la migración 120100 inserta «ruc»/«pasaporte» si faltan;
  - un tipo inactivo se devuelve con `activo: false` y el servicio lo rechaza (R11).
- La corrida de `vitest related` dio 2 rojos. Uno es R22. El otro, `premio-ranking-devengo-migration`, ya está en `tests/baseline-rojos.json`.

## Rojos del gate rápido tras el fix-up de la tanda 1 (2026-11-04)
Método: cada archivo corrió solo (`pnpm exec vitest run <archivo>`) 3 veces en esta rama (HEAD `b4e70be2`) y 3 veces en un
worktree temporal de `origin/dev` (`42328714`), ya borrado. Resultado: **ningún rojo es de SLT-42**, todos son del grupo (b),
fallos por carga. Ninguno se reproduce aislado, ni aquí ni en `dev`.

| Archivo | Rama (aislado) | `dev` (aislado) | Grupo |
|---|---|---|---|
| `tests/components/CierresAdminFiltros.test.tsx` | 3/3 verde (13/13) | 3/3 verde | (b) |
| `tests/components/descarga/CierresDescargaColumnas.test.tsx` | 3/3 verde (8/8) | 3/3 verde | (b) |
| `tests/components/DescargarDataset.test.tsx` (R22) | 6/9 verde (ver abajo) | 6/6 verde | (b) |
| `tests/components/OrdenesPageFiltros.test.tsx` | 3/3 verde (8/8) | 3/3 verde | (b) |
| `tests/integration/wallet-page.test.tsx` | 3/3 verde (19/19) | 3/3 verde | (b) |
| `tests/unit/components/ordenes-listado-vistas.test.tsx` | 3/3 verde (10/10) | 3/3 verde | (b) |

Detalle de **R22**:
- Las 3 primeras corridas en la rama fallaron (`expected "vi.fn()" to be called 1 times, but got 0 times`, unos 1,3 s).
  Coincidieron con un `pnpm install` en paralelo del worktree de `dev`.
- Después, sin carga, `backend_dev` corrió el archivo 3 veces seguidas (verde) y 4 copias a la vez (verde). Yo lo corrí
  3 veces más alternando rama y `dev` (verde en las dos).
- Diagnóstico de `backend_dev`, con instrumentación temporal ya revertida:
  - Con la fecha falsa, `fechaCalendarioCR()` devuelve `"2026-10-02"` al instante.
  - `construirDescarga` no rechaza.
  - R22 tarda lo mismo con el `fecha-cr.ts` de la rama (612-712 ms) que con el de `dev` (651-728 ms).
- El costo es el `import("exceljs")` en frío, unos 620 ms (`lib/utils/xlsx-template.ts`), contra el `waitFor` de 1000 ms.
  Con carga se pasa. El fallo no lo causan la caché de `calendario-zona.ts` ni `telefono-cr.ts`.
- No hubo cambio de código de producción, así que no hay commit `fix`. Si el leader quiere quitar la fragilidad, hay que tocar
  el test (precalentar exceljs o subir el timeout de ese `waitFor`), y eso queda fuera de este encargo.
- Esto corrige la nota anterior («con el `fecha-cr.ts` viejo también falla 2 de 4»). La causa es la misma: carga, no SLT-42.

## Tanda 2 · Parte A (choque de migraciones) y T4.1 (2026-11-04)

### Parte A — renombre de las tres migraciones
- `git mv` a `20261104140000_slt42_pais_telefono_y_zona`, `20261104140100_slt42_tipo_documento_por_pais` y
  `20261104140200_slt42_usuario_documento_unico_por_tipo`, detrás de la última de `dev` (`20261104130100`). El SQL no cambió;
  sí las referencias a sus nombres en los `down.sql`, `db/schema.prisma`, `scripts/seed-catalogos.ts`, `tests/fabricas/reglas-pais.ts`,
  el test de ida y vuelta (también `ULTIMA_ANTERIOR`, que pasa a ser `20261104130100_historial_accion_plan_tipo_cobro_cambiado`),
  `design.md` y `tasks.md`.
- Dependencias cruzadas con SLT-52: ninguna. Sus ocho migraciones no tocan `pais`, `tipo_identificacion` ni `usuario_cedula_key`.
  Solo tienen FK a `usuario(id)`, y eso no lo cambia SLT-42.
- `logistic_slt42_test`: se renombraron las 3 filas de `_prisma_migrations`, y después `prisma migrate deploy` aplicó las 8 de SLT-52.
- `migracion-slt42-ida-y-vuelta` + `tipo-documento-por-pais`: `Test Files 2 passed (2) · Tests 12 passed (12)`, ninguno saltado.

### T4.1 — archivos
- Modificados en `lib/`: `services/UsuarioService.ts`, `repositories/UserRepository.ts`, `interfaces/repositories/IUserRepository.ts`,
  `interfaces/services/IUsuarioService.ts`, `types/usuario.ts` y `actions/usuarios.ts` (cablea `construirReglasPaisEmpresa`).
- Tests nuevos: `tests/unit/services/usuario-service-pais.test.ts` y `tests/integration/db/tipos-identificacion-por-pais.test.ts`.
- Tests ajustados:
  - inyectan `reglasPaisFijas(CR)` y usan datos válidos de CR: `usuario-service`, `-tope-plan`, `usuario-vehiculo`, `usuario-zona` y
    `nombres-que-imprime-la-etiqueta`;
  - `usuario-service-superadmin`: casos de R17;
  - `usuario-restablecer-contrasena`: el constructor pasa de 5 a 6 parámetros;
  - `user-repository.crud`, `usuarios-composition` (sexto cable), `aislamiento-usuarios` (reglas reales) y `historial-accion-atomicidad`.
- Fábricas: `empresa-y-usuarios.ts` pasa las reglas reales y saca la cédula por defecto del correo (9 dígitos). `e2e.ts` ya no manda
  `cedula: "e2e-…"`, que R10 rechazaría.

### Mapa R → test (T4.1)
| R | Test |
|---|---|
| R5 | `usuario-service-pais` «R5: pide al repositorio…»; `tipos-identificacion-por-pais` «R5: el WHERE…» y «R5, R31: por el servicio…»; `user-repository.crud` «SLT-42 R5…» |
| R9 | `usuario-service-pais`: los tres «R9: …» |
| R10 | `usuario-service-pais`: los cinco «R10: …» |
| R11 | `usuario-service-pais`: los cinco «R11: …» (inexistente, inactivo, de otro país, en alta y en edición) |
| R12 | `usuario-service-pais`: los dos «R12: …» |
| R14 | `usuario-service-pais`: los cuatro «R14…» |
| R15 | `usuario-service-pais`: los dos «R15: …» |
| R16 | `usuario-service-pais`: los dos «R16: …» |
| R17 | `usuario-service-superadmin`: los cuatro «R17: …» |
| R31 (R5) | `tipos-identificacion-por-pais` (CR y `XA`) |

### Salida
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: exit 0.
- `eslint --max-warnings=0` sobre los 24 archivos tocados: «No issues found».
- Unit (18 archivos: los de UsuarioService, actions, repositorio, `geografia-predicado-unico` y `empresas-page`): `Test Files 18 passed (18) · Tests 281 passed (281)`.
- Integración en `logistic_slt42_test`: el nuevo, `aislamiento-usuarios`, `usuarios-sin-superadmin` y `restablecer-contrasena-sql-real` dan
  `Test Files 4 passed (4) · Tests 24 passed (24)`.
- `historial-accion-atomicidad`: 17 fallos, por «referencia a otra empresa» en los datos de la base de pruebas. La versión de HEAD da
  los mismos 17, así que es del entorno y no del cambio. Los 3 casos de 379 que tocan el servicio no llegan a ejercitarlo.
- `test:guardias`: 7 rojos, ninguno de T4.1:
  - `dependencias-declaradas-presentes` (4), el heredado de la incidencia 8;
  - `catalogo-postgres-acota-esquema` (2), porque falta `telefono-cr-sql.ts` mientras T4.4 está en curso;
  - `rollup-guards` R47 (1), por una cifra en `lib/utils/calendario-zona.ts` (fix-up de la tanda 1).

### Desvíos / decisiones a confirmar
1. `listTiposIdentificacion(paisId?)`: el país es opcional porque `app/(app)/plataforma/empresas/page.tsx` (plataforma, sin empresa)
   lo llama sin argumento. Sin país devuelve el catálogo entero ordenado por `value`, como antes. Que esa pantalla filtre por el país
   elegido le toca a SLT-81/T4.3.
2. R17 en `UsuarioService`: «sin empresa» es que el puerto lance `EmpresaNoResuelta`. En ese caso teléfono y documento pasan por
   `numericIdentifierSchema`; cualquier otro error se propaga. En la práctica no se alcanza (`ALLOWED_ROLES` = maestro).
3. El tope de forma del borde es 30 caracteres para teléfono y documento (`USUARIO_*_MAX_CHARS`). El design no da la cifra: el 30 sale
   del CHECK de `largo_max`.
4. R12: el error va en `tipoIdentificacionId`, con el mensaje de la regla del documento («El documento guardado no cumple la regla de este tipo. …»).

Veredicto: Parte A y T4.1 terminadas. Typecheck y lint limpios, tests de T4.1 en verde; los rojos que quedan son del entorno o de otras tareas.

## Tanda 2 · T4.4 WhatsApp con el prefijo del país (2026-11-04)

**Archivos**
- Producción: `lib/repositories/ChatConversacionRepository.ts` (resolución D4 con `sqlNormalizarTelefono("o.telefono_dest", 1, 2)` vía `$queryRawUnsafe`, prefijo/dígitos/número como `$1/$2/$3`), `lib/interfaces/repositories/IChatConversacionRepository.ts` (`resolverOrdenActivaPorNumero`, `upsertParaOrden`, `migrarTelefono` reciben `ReglasTelefono`), `lib/services/ChatWhatsappService.ts` (dep `reglasPais: IReglasPaisEmpresa`; `PaisIncompleto` si el país no tiene prefijo/dígitos; la ingesta normaliza `from` y el cambio de número), `lib/services/whatsapp/enrutado-por-cita.ts` (recibe reglas), `lib/types/whatsapp-webhook.ts` (el parser ya no normaliza: entrega los números del cambio de número recortados; «utilizable» = tiene algún dígito), `lib/services/EjecucionEnvioService.ts` y `lib/services/WhatsappEnvioService.ts` (`telefonoSirveParaEnvio`/`normalizarTelefono` con reglas; `construirPreview(resueltos, reglas)`), `lib/whatsapp-envios/telefono.ts` (se retira `telefonoValido`), `lib/services/jobs/whatsapp-bienvenida-handler.ts` (guarda «sin teléfono» = sin dígitos), composición: `app/api/webhooks/whatsapp/route.ts`, `lib/actions/chat-whatsapp.ts`, `lib/services/jobs/whatsapp-chat-envio-handler.ts`, `lib/services/jobs/whatsapp-envio-deps.ts` (`construirReglasPaisEmpresa(prisma)`), `lib/utils/busqueda-texto-sql.ts` (comentario). **Borrado:** `lib/utils/telefono-cr-sql.ts`.
- Tests nuevos: `tests/unit/services/chat-whatsapp-telefono-por-pais.test.ts`. Ampliados/parametrizados: `tests/integration/db/chat-entrante-telefono-cr.test.ts`, `tests/unit/repositories/chat-conversacion-repository.test.ts`, `tests/unit/services/enrutado-por-cita.test.ts`, `tests/unit/services/previsualizar-destinatarios.test.ts`, `tests/unit/services/ejecucion-envio-prueba.test.ts`, `tests/unit/types/whatsapp-webhook.test.ts`, `tests/unit/whatsapp-envios/telefono.test.ts`, `tests/unit/utils/telefono-pais.test.ts`. Ajustados solo para inyectar `reglasPaisFijas()` o pasar `TEL_CR`: `chat-whatsapp-service`, `chat-whatsapp-respuesta-citada`, `whatsapp-fallo-saliente`, `ejecucion-envio-{service,informe-error,sin-pii}`, `whatsapp-envio-service{,-picking}`, `envios-whatsapp-actions`, y los de integración `chat-respuesta-citada`, `corregir-datos-cliente.chat`, `whatsapp-envio-ejecucion-admintienda`.
- `chat-entrante-telefono-cr` y `corregir-datos-cliente.chat` siembran ahora en la empresa de las FKs (`enTransaccionRevertida(..., { organizacionId })`): con la empresa nueva del fixture caían en «referencia a otra empresa» (están en `tests/baseline-rojos.json` por eso). Ahora pasan.

**R → test**
| R | Test |
|---|---|
| R18 | `chat-whatsapp-telefono-por-pais.test.ts` (ingesta, cambio de número, `enviarTexto`, `enviarPlantilla` con país `999`/7); `chat-conversacion-repository.test.ts` «SLT-42 R18/R19: el prefijo y los digitos del pais viajan como PARAMETROS…» y «SLT-42 R18: con otro pais…»; `enrutado-por-cita.test.ts` «SLT-42 R18…»; `chat-entrante-telefono-cr.test.ts` casos «local de otro pais…» y los dos «SLT-42 R18…» (Postgres real) |
| R19 | `chat-entrante-telefono-cr.test.ts` «R19: `sqlNormalizarTelefono` y `normalizarTelefono` producen EL MISMO texto (Costa Rica / un pais con otro prefijo y otro largo)» (Postgres real) |
| R20 | `ejecucion-envio-prueba.test.ts` «SLT-42 R18/R20…» (3 its); `previsualizar-destinatarios.test.ts` «SLT-42 R20…»; `whatsapp-envios/telefono.test.ts` |
| R21 | `chat-whatsapp-telefono-por-pais.test.ts` «R21: con Costa Rica…»; los casos CR de `chat-entrante-telefono-cr.test.ts`; todos los tests de chat y envíos previos, en verde con `reglasPaisFijas()` |

**Salida**
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: exit 0.
- `vitest run` (48 archivos unitarios que importan lo tocado + guardia `sql-a-mano-por-empresa`): `Test Files 48 passed (48) · Tests 708 passed (708)`.
- `vitest run` integración contra `logistic_slt42_test` (9 archivos: chat-entrante, corregir-datos chat, chat-respuesta-citada, admintienda, busqueda-texto paridad, webhook route y middleware, jobs bienvenida y chat-envio): `Test Files 9 passed (9) · Tests 53 passed (53)`, ninguno saltado. `historico-conversaciones.int.test.ts` sigue rojo en su `beforeAll` (mismo fixture, en el baseline; no lo toqué).
- `eslint --max-warnings=0` sobre los 36 archivos: 0 errores, 8 warnings `no-unused-vars` (`_d/_n/_i/_c`) en `ejecucion-envio-prueba.test.ts:22` y `ejecucion-envio-service.test.ts:25`, líneas previas a T4.4.

**Desvíos y preguntas**
1. Rastreo público (`RastreoPublicoService`) sigue con `normalizarTelefonoCR`: corre sin empresa en contexto (busca por guía) y el design no dice de dónde saca el país para el teléfono; T5.6 resuelve su zona. Solo compara los últimos `DIGITOS_SEGUNDO_FACTOR` dígitos, así que el prefijo no cambia el resultado mientras ese número ≤ dígitos nacionales. Pregunta abierta.
2. `CorregirDatosClienteService` sigue importando `normalizarTelefonoWa` (solo para «¿tiene dígitos?») porque `corregir-datos-sin-rastro.guardia.test.ts` exige ese import literal. Fuera del alcance de T4.4; lo verá la guardia de R29.
3. País sin prefijo o sin dígitos: chat y envíos lanzan `PaisIncompleto` antes de escribir. En el webhook eso hace fallar el lote de esa empresa (no es un 200). El design no fija este caso para WhatsApp.

Veredicto: T4.4 terminada; typecheck limpio, tests de chat y envíos en verde, R18–R21 con test.

## Tanda 2 · T4.2 y T4.3, y el módulo compartido (2026-11-04)

### Archivos
- Nuevo `lib/services/validacion-documento-telefono.ts`: un módulo puro con la validación de tipo, documento y teléfono que antes estaba dentro de `UsuarioService`. Lo usan `UsuarioService` (sin cambio de comportamiento), `PostulacionMensajeroService`, `AprobacionPostulacionService` y `OrganizacionService`.
- `lib/actions/{postulacion-mensajero,aprobacion-postulaciones,organizaciones}.ts` inyectan las reglas reales y `PaisRepository`.
- `PostulacionRepository.cedulaExiste(cedula, tipoId)` (ahora por empresa y tipo, R13), `AprobacionPostulacionRepository.personaPendiente(id)` y `PaisRepository.tieneTipoDocumentoActivo(paisId)` (R6). Las interfaces cambian en consecuencia, y `IAprobacionPostulacionService` admite `validation_error`.
- `lib/types/postulacion-mensajero.ts` valida solo la forma.
- Tests nuevos:
  - `tests/unit/services/postulacion-mensajero-service-pais.test.ts`
  - `tests/unit/services/organizacion-service-pais.test.ts`
  - `tests/unit/actions/postulacion-composition-pais.test.ts`
  - `tests/integration/db/postulacion-documento-por-tipo.test.ts`
- Tests ajustados:
  - Postulación, aprobación, notificaciones y organización inyectan `reglasPaisFijas()` y usan datos válidos de CR.
  - `postulacion-schemas` comprueba solo la forma.
  - `organizacion-alta` usa `PA` completo en lugar de `XA` (R16).
  - `pais-repositorio` tiene un caso nuevo.
- Fábricas: `reglas-pais.ts` (`paisDelAltaFijo`, `paisesDelAltaFijos`), `empresa-y-usuarios.ts` y `e2e.ts`.
- Fixtures E2E con documentos de 9 dígitos: `e2e/_dos-empresas-fixture.ts`, `dos-empresas-humo.spec.ts` y `superadmin-empresas.spec.ts`. El E2E no se corrió; corre en CI.

### Mapa R → test (T4.2, T4.3)
| R | Test |
|---|---|
| R6 | `organizacion-service-pais` «R6: un país %s rechaza…» (sin prefijo, sin dígitos, sin zona, sin tipos, solo con inactivos), «R6: un país que no existe…», «R6: el país incompleto se rechaza antes…»; `pais-repositorio` «SLT-42 (R6): tieneTipoDocumentoActivo…» |
| R10 | `postulacion-mensajero-service-pais` «R10: …» (recibir y aprobar); `organizacion-service-pais` «R10: …» |
| R11 | `postulacion-mensajero-service-pais` «R11: …» (no existe, inactivo, de otro país, por `value`; al aprobar); `organizacion-service-pais` «R11: …» |
| R13 (postulación) | `postulacion-mensajero-service-pais` «R13: el duplicado del documento se busca…»; `postulacion-documento-por-tipo` «R13: cedulaExiste choca solo con…» |
| R14 | `postulacion-mensajero-service-pais` «R14: …» (recibir y aprobar); `organizacion-service-pais` «R14: …» (incluye «un número válido de OTRO país» y «la región es la del país ELEGIDO») |
| R15 | `postulacion-mensajero-service-pais` «R15: el teléfono válido se guarda…»; `organizacion-service-pais` «R15: …» |
| R16 | Un «R16: …» por cada punto: recibir, aprobar y alta de empresa |

### Salida
- Typecheck (`NODE_OPTIONS=--max-old-space-size=8192`): exit 0. `eslint --max-warnings=0` sobre los 39 archivos: limpio.
- Unit y componentes, 30 archivos: `Test Files 30 passed (30) · Tests 501 passed (501)`.
- Integración en `logistic_slt42_test`, 9 archivos: `Test Files 9 passed (9) · Tests 92 passed (92)`, ninguno saltado.
- Guardias `geografia-predicado-unico`, `sql-a-mano-por-empresa`, `superadmin-fuera-de-empresa`, `plataforma-solo-en-lista`, `etiquetas-geograficas-sin-literal` y `historial-accion-*`: en verde.

### Desvíos y preguntas para el leader o el humano
1. **Aprobar solo valida (R15).** No reescribe el teléfono al formato nacional, porque la feature 22 dice que aprobar solo cambia `estado`. Las postulaciones nuevas ya se guardan en forma nacional. Falta confirmarlo.
2. **Aprobar tiene un desenlace nuevo: `validation_error`.** Una postulación vieja con datos fuera de regla no se puede aprobar, solo rechazar. El panel muestra el texto genérico; la UI no se tocó.
3. **Pregunta.** El alta de empresa valida R6 y los datos del maestro antes de comprobar si es una repetición. Repetir el alta en un país que quedó incompleto responde `invalida` en vez de `ya_existe`. ¿Hay que mover la comprobación de repetición antes, como en SL-20 §13?
4. **El alta de empresa señala un solo campo** (contrato `{ estado: "invalida", campo }`). Si fallan varios, el tipo o el documento ganan al teléfono.
5. **Fuera del design:** `IPaisRepository.tieneTipoDocumentoActivo`. Además, `cedulaExiste` pasa a buscar por empresa y tipo, e `IPostulacionRepository.tipoIdentificacionExiste` queda sin uso (no se borró).
6. **El tipo de la postulación llega como `id`, no como `value`.** Así lo manda `app/postulacion/page.tsx`. Se aceptan las dos formas, con un test para cada una.
7. **El navegador ya no comprueba que cédula y teléfono sean numéricos.** `postulacionSchema` lo comparte el cliente; esa comprobación queda solo en el servidor.

- **Decisión 2026-11-04, humano: opción A.** `TOPE_MEMO` de `lib/utils/calendario-zona.ts` pasa de `20_000` a `16_384`: la guardia R47 (`tests/unit/analytics/rollup-guards.test.ts`) exige que la cifra de volumen 20000 viva solo en `lib/config/analitica-rollup.ts`, y el tope de la caché coincidía por casualidad. La guardia no se toca.
