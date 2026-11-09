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

## Tanda 2b · decisiones del humano tras la tanda 2 (2026-11-04)

Commits: `a35d50f6` (decisiones en la ficha), `13757c87` (código y tests) y el de esta bitácora.

### Archivos
- Producción:
  - `lib/services/WebhookWhatsappService.ts`
  - `lib/services/CorregirDatosClienteService.ts`
  - `lib/actions/corregir-datos-cliente.ts` (cablea `construirReglasPaisEmpresa(prisma)`)
  - `lib/config/aprobacion-postulaciones.ts` (constante nueva)
  - `lib/interfaces/repositories/IAprobacionPostulacionRepository.ts` y `lib/repositories/AprobacionPostulacionRepository.ts` (`createdAt` en `personaPendiente`)
  - `lib/services/AprobacionPostulacionService.ts`
  - `lib/types/organizacion.ts` (`AltaEmpresaRepeticion`)
  - `lib/interfaces/repositories/IOrganizacionRepository.ts` y `lib/repositories/OrganizacionRepository.ts` (`repeticion`: solo lectura, reutiliza `decidirSobreExistente`)
  - `lib/services/OrganizacionService.ts`
- Test nuevo: `tests/unit/services/webhook-whatsapp-pais-incompleto.test.ts`.
- Casos nuevos en `corregir-datos-cliente-service`, `postulacion-mensajero-service-pais`, `organizacion-service-pais` y `tests/integration/db/organizacion-alta`.
- Guardia `corregir-datos-sin-rastro`: el control positivo exige `normalizarTelefono(` y el import de `@/lib/utils/telefono-pais`, en lugar de `normalizarTelefonoWa` y `whatsapp-telefono`. No cambia nada más.
- Ajustados solo para inyectar `reglasPaisFijas()` o para dar `createdAt` o `repeticion` a los dobles:
  - unitarios: `corregir-datos-cliente-{bodega-satelite,geo-retirada,texto-etiqueta}`, `corregir-ubicacion-importes`, `aprobacion-postulacion-{service,tope-plan}` y `organizacion-service`;
  - integración: `corregir-datos-cliente.{chat,repo}` y `postulacion-documento-por-tipo`.

### Decisión → test
| Decisión | Test |
|---|---|
| 2 (webhook, R18) | `webhook-whatsapp-pais-incompleto`: «lote con dos empresas, una con país incompleto: la otra se procesa, responde 200 y queda en el log sin PII», «si la única empresa del lote tiene el país incompleto, igual responde 200 (Meta no reintenta)» y «un error que NO es de país incompleto no se traga: sigue propagándose» |
| 4 (corregir datos, R18) | `corregir-datos-cliente-service`, bloque «SLT-42 (punto 4 tras la tanda 2)»: el prefijo de OTRO país; un teléfono sin dígitos; si el teléfono no cambia, no se lee el país; un país sin prefijo o sin dígitos da `PaisIncompleto` y no escribe |
| 6 (postulación previa, R10/R14) | `postulacion-mensajero-service-pais`: «una postulación PREVIA a SLT-42 … se aprueba igual», «una postulación NUEVA … es `validation_error`» y «la frontera es exacta …» |
| 7 (alta repetida, R6) | `organizacion-service-pais`, bloque «la repetición se decide antes que el país…» (4 its); `organizacion-alta`: «SLT-42 R6: repetir un alta en un país que quedó incompleto da `ya_existe`; un alta nueva allí es `invalida` `paisId`» |

### Decisión del implementer: qué es una postulación «previa» (punto 6)
- Una postulación es previa si `usuario.createdAt < POSTULACION_VALIDADA_POR_PAIS_DESDE`. La constante está en `lib/config/aprobacion-postulaciones.ts` y vale `2026-11-04T14:00:00.000Z`, el instante del nombre de la migración `20261104140000_slt42_pais_telefono_y_zona`.
- Por qué: la postulación es una fila de `usuario` pendiente, y `created_at` es el único dato del modelo que separa las viejas de las nuevas. No hace falta migración ni leer `_prisma_migrations`, que no consta que el rol de la app pueda leer.
- Riesgo: la constante tiene que ser **igual o posterior al deploy de SLT-42 en producción**.
  - Si queda antes, las postulaciones que entraron entre esa fecha y el deploy, con las reglas viejas, darían `validation_error` al aprobarlas.
  - Si queda después, no rompe nada: desde el deploy, la recepción ya valida (T4.2).
  - Hay que revisarla junto con T1.0, antes del deploy.

### Punto 9 · `historial-accion-atomicidad` con la base recreada
- `logistic_slt42_test` se recreó como indica `docs/verification.md`:
  - `DROP` y `CREATE`;
  - `prisma migrate deploy`: 300 migraciones, 3 de ellas de slt42;
  - `pnpm run db:seed`: «Seed de catalogos completado (rol, order_status, vehiculos)».
- La base de desarrollo sigue intacta: 307 migraciones, ninguna de slt42.
- Resultado: sigue rojo, ahora en el `beforeAll`: «hay DATABASE_URL pero la tabla `orden` esta vacia: sin FKs no se puede sembrar». Da `Test Files 1 failed · Tests 44 skipped`. El mensaje pide correr `scripts/seed-zonas.ts`, que no existe.
- Causa:
  - El test toma sus FKs de **cualquier** orden que ya exista (`fksDeOrden`, en `tests/integration/db/_postgres-real.ts:495`, no filtra por empresa).
  - Cada caso corre en una empresa NUEVA, porque `enTransaccionRevertida` sin `organizacionId` crea una.
  - Con la base vacía no hay ninguna orden. Con órdenes en la base, las FKs son de otra empresa y todo cae en «referencia a otra empresa»: eran los 17 rojos de antes.
  - Es el motivo del baseline («la suite asume órdenes, usuarios y zonas sembrados … la retira SL-31»), anterior a SLT-42.
- Ningún caso llega a ejercitar el ajuste de T4.1, tampoco los 3 de la ficha 379 que usan `UsuarioService`: todos dependen de `FKS`.
- El ajuste de T4.1 en este archivo es solo el sexto argumento del constructor (`reglasPaisFijas(CR)`), y lo cubre el typecheck. Para ejercitarlo de verdad habría que sembrar las FKs en la empresa del test, como se hizo en T4.4 con `chat-entrante-telefono-cr` (pregunta 5).
- `corregir-datos-cliente.repo.test.ts` da el mismo mensaje con la base recreada. También está en el baseline, por el mismo motivo.

### Guardia `descargas-por-registro`
- No es de SLT-42. Corriendo sola, con un timeout amplio, la rama tarda 17,1 s en frío y después 7,9 s; `dev` tarda 9,6 s y 8,8 s. La rama no es más lenta.
- Solo recorre `app/`, `components/` y el registro de descargas. Ahí SLT-42 solo toca `app/api/webhooks/whatsapp/route.ts`, con 3 líneas.
- El costo está en la guardia: `usosDe` vuelve a limpiar el archivo entero por cada símbolo. Con 33 símbolos y 722 archivos son unas 24.000 pasadas de regex sobre unos 6,3 MB, y con la CPU cargada pasa de 20 s.
- No está en el baseline. Se podría arreglar fuera de SLT-42 limpiando cada archivo una sola vez al cargarlo.

### Salida
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: exit 0.
- `eslint --max-warnings=0` sobre los 27 archivos tocados: 0 errores y 12 warnings `no-unused-vars`, en dobles que ya estaban en los tests de corregir datos.
- Unit (servicios tocados, sus actions, `webhook-whatsapp-*` y la guardia `corregir-datos-sin-rastro`): `Test Files 21 passed (21) · Tests 313 passed (313)`.
- Unit, componentes y guardias relacionadas: `Test Files 9 passed (9) · Tests 203 passed (203)`.
- Integración en `logistic_slt42_test`, antes de recrearla:
  - en verde: `corregir-datos-cliente.chat`, `organizacion-alta`, `postulacion-documento-por-tipo` y `webhook-whatsapp.route`;
  - en rojo en el `beforeAll`: `corregir-datos-cliente.repo` (en el baseline).
- `pnpm run test:guardias` completo: `Test Files 1 failed | 324 passed | 3 skipped (328) · Tests 4 failed | 4550 passed | 24 skipped`.
  - Los 4 rojos son de `dependencias-declaradas-presentes`, en el baseline.
  - `rollup-guards` y `descargas-por-registro` salieron en verde en esta corrida.

### Preguntas para el leader o el humano
1. Fecha de corte de «previa» (`POSTULACION_VALIDADA_POR_PAIS_DESDE`): ¿se fija al instante real del deploy de SLT-42 o se confirma `2026-11-04T14:00Z`?
2. Corregir datos con el país incompleto lanza `PaisIncompleto`, como el chat, y la Server Action lo devuelve como error genérico. ¿Vale así, o se prefiere un `fieldErrors.telefonoDest` con un texto propio?
3. Webhook con el país incompleto: se saltan los mensajes, pero se siguen aplicando los estados de entrega de esa empresa y el «último contacto», que no dependen del teléfono. ¿Se deja así?
4. Log del webhook: `ChatLogger` solo tiene `warn`, así que va por `console.warn` con el texto «ERROR: mensajes saltados…». ¿Vale?
5. `historial-accion-atomicidad`: ¿se arregla dentro de SLT-42 (sembrar las FKs en la empresa del test, como en `chat-entrante-telefono-cr`) o se deja para SL-31?
6. Ningún test recorre `construirReglasPaisEmpresa` dentro de `buildService()` de corregir datos: el composition root solo prueba el distrito. Lo cubre el typecheck.

Veredicto: decisiones 2, 4, 6 y 7 implementadas con test. El punto 9 queda aclarado: es un rojo del fixture, está en el baseline y no es de SLT-42. Typecheck limpio; en las guardias solo queda el rojo del baseline.

## Tanda 2c · decisiones 2, 4 y 6 tras la tanda 2b (2026-11-04)

### Archivos
- Producción:
  - `lib/services/CorregirDatosClienteService.ts`: con el país sin prefijo o sin dígitos devuelve `validation_error` con `fieldErrors.telefonoDest = [MENSAJE_PAIS_SIN_TELEFONO]` («El pais de la empresa no tiene configurado el telefono; avisa a soporte») en vez de lanzar `PaisIncompleto`. La constante se exporta para los tests. No se escribe nada.
  - `lib/services/ChatWhatsappService.ts`: `ChatLogger` gana `error(message)`.
  - `lib/services/whatsapp/chat-logger.ts`: `consoleLogger.error` → `console.error`.
  - `lib/services/WebhookWhatsappService.ts`: el aviso de mensajes saltados por `PaisIncompleto` sale por `logger.error` (sin el prefijo «ERROR:», sin PII: empresa y país).
- Tests:
  - Nuevo `tests/integration/db/corregir-datos-cliente.pais-real.test.ts`: la Server Action `corregirDatosCliente` sin `deps.service`, o sea `buildService()` real con `construirReglasPaisEmpresa(prisma)`; `getPrismaClient` apunta a la tx del test (patrón de `picking-ordenes-en-preparacion`). Siembra su propio país de prueba (`XS` con `599`/7, `XT` incompleto), una empresa en ese país, su geografía, zona, tienda y orden. No lee filas de otra empresa.
  - `tests/unit/services/corregir-datos-cliente-service.test.ts`: el caso de país incompleto ahora espera `fieldErrors.telefonoDest` con el texto propio.
  - `tests/unit/services/webhook-whatsapp-pais-incompleto.test.ts`: comprueba que el aviso sale por `error`.
  - Dobles de `ChatLogger` que pidió el typecheck (se añade `error`): `procesar-jobs-whatsapp-bienvenida`, `webhook-whatsapp.route`, `webhook-whatsapp-entregas`, `webhook-whatsapp-por-empresa`, `chat-whatsapp-respuesta-citada`, `chat-whatsapp-service`, `webhook-whatsapp-service` y `whatsapp-fallo-saliente`.

### R → test
| Decisión / R | Test |
|---|---|
| 2 (corregir con país incompleto, R6) | `corregir-datos-cliente-service`: «un pais sin prefijo o sin digitos devuelve fieldErrors.telefonoDest con texto propio y no escribe»; `corregir-datos-cliente.pais-real`: «R6: con el pais sin prefijo ni digitos devuelve fieldErrors.telefonoDest y no escribe» |
| 4 (log en `error`, R18) | `webhook-whatsapp-pais-incompleto`: «lote con dos empresas, una con país incompleto…» (el aviso está en `errores`, sin PII) |
| 6 (ruta real, R18) | `corregir-datos-cliente.pais-real`: «R18: corrige el telefono y queda resoluble con el prefijo del pais de la empresa» (se guarda tal cual, 312/R17, y el entrante `599`+local resuelve a la orden con las reglas leídas de la base) |

Mutación comprobada: con `buildService()` cableado a unas reglas fijas de CR en vez de `construirReglasPaisEmpresa(prisma)`, el caso R6 de `pais-real` se pone rojo («expected { status: 'ok' } to deeply equal { status: 'validation_error' }»). Se revirtió.

### Salida
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p .`: exit 0.
- `eslint --max-warnings=0` sobre los 15 archivos tocados: 0 errores, 3 warnings `no-unused-vars` (`_ordenId`, `_data`, `_estadosBloqueados`) en `corregir-datos-cliente-service.test.ts:124-126`, ya en HEAD.
- `vitest run` de los 11 archivos de test tocados, con `DATABASE_URL` a `logistic_slt42_test`: `Test Files 11 passed (11) · Tests 186 passed (186)`; `pais-real` con sus 2 casos ejecutados, ninguno saltado.
- `vitest related --run` de los 4 archivos de producción: `Test Files 2 failed | 245 passed (247) · Tests 3338 passed | 24 skipped`. Los 2 rojos son `corregir-datos-cliente.{chat,repo}` y fallan en el `beforeAll`: «la tabla `orden` esta vacia». `logistic_slt42_test` tiene hoy 0 filas en `orden`, `organizacion`, `usuario` y `zona` (contado en solo lectura). Es el fixture de la base, no el cambio: esas suites toman FKs de una orden existente y en la tanda 2b la base sí tenía datos.
- `pnpm run test:guardias`: `Tests 4 failed | 4550 passed | 24 skipped`; los 4 son `dependencias-declaradas-presentes`, en el baseline.

### Preguntas
1. `logistic_slt42_test` está vacía de datos de negocio (0 empresas, órdenes, usuarios y zonas). ¿Se volvió a crear entre la tanda 2b y esta? Las suites que toman FKs de una orden existente (`corregir-datos-cliente.{chat,repo}` y otras) no pueden correr hasta que se siembre (`pnpm run db:seed` + zonas) o se pasen a sembrar sus datos, como `pais-real`.

Veredicto: decisiones 2, 4 y 6 implementadas con test. Typecheck limpio; en las guardias solo queda el rojo del baseline.

## Tanda 3 · T5.1 y T5.2: la zona como parámetro en utilidades y schemas (2026-11-04)

### Archivos de producción
- `lib/utils/calendario-zona.ts`: + `sumarDiasCalendario`, `diferenciaEnDiasCalendario`, `diaDeLaSemana` (aritmética de fechas calendario, sin zona). `lib/utils/fecha-cr.ts`: `ZONA_CR` pasa a `export`.
- T5.1 (zona IANA obligatoria, sin default de CR; calculan con `calendario-zona.ts`):
  - `dia-reparto.ts`: `resolverFechaReparto(dia, zona, now = new Date())` («mañana» = fecha calendario siguiente, no +24 h).
  - `ventana-dia-cr.ts` (nombre conservado): `ventanaDelDiaEnCursoCR(now, zona)`, `horaDeParedCR(ventana, instante, zona)` (lee la pared; antes restaba horas desde `desde`, que se corre el día del cambio de hora).
  - `filtros-listado-ordenes.ts`: `rangoCreacion(filtro, ahora, zona)`.
  - `fecha-dia-iso.ts`: `fechaDiaMovimientoCR(valor, zona)`, `fechaDiaInstanteCR(valor, zona)` (`fechaDiaISO` sin cambios).
  - `fecha-movimiento-manual.ts`: `instanteDelMovimientoManual(fecha, zona, now = new Date())`.
  - `periodicidad.ts`: `aplicaHoy(p, now, zona)`, `periodoDe(p, now, zona)`, `proximoCobro(p, now, zona)`.
  - `descarga-dataset.ts`: `nombreArchivoDescarga(titulo, tipo, fecha, zona)`, `construirDescarga(config, zona, fecha = new Date())`.
  - `lib/analytics/ranges.ts`: `resolverRango(entrada, zona, now = new Date())`; sin `UN_DIA_MS` derivado: suma días de calendario.
  - `lib/analytics/cubo-temporal.ts`: `trocear(rango, zona)`; `granularidadDe(rango)` sin cambios (cuenta fechas, no depende de la zona).
  - `lib/analytics/rollup-dia.ts`: `fechaObjetivo(now, zona)` (fecha anterior, no `now - 24 h`), `ventanaDelDia(fecha, zona)`, `validarFechaInvocacionManual(fecha, now, zona)`.
  - `lib/analytics/backfill-rango.ts`: `RangoPedido` gana `zona`; los motivos dicen «dia en curso» / «ayer» sin «CR».
- T5.2 (fábricas `(zona) => schema`; forma con `esFechaCalendarioValida`, mensajes y contrato `validation_error` iguales):
  - `filtro-dias-cr.ts`: `desdeDiaSchema(zona)`, `hastaDiaSchema(zona)` (antes `desdeDiaCRSchema`/`hastaDiaCRSchema`); `diaCalendarioSchema` sigue estático.
  - `gestion-orden.ts`: `esFechaFutura(value, zona, now?)`, `esFechaCorreccionValida(value, zona, now?)`, `fechaFuturaSchema(zona)`, `fechaCorreccionSchema(zona)`, `gestionarSchema(zona)`. `gestion-desde-ayuda.ts`: `gestionarDesdeAyudaSchema(zona)`.
  - `liquidacion.ts`: `esFechaPagoValida(value, zona, now?)`, `fechaPagoSchema(zona)`, `camposComunesDelPago(zona)`, `registrarPagoMensajeroSchema(zona)`, `registrarPagoTiendaSchema(zona)`; `liquidacion-reparto.ts`: `registrarRepartoMensajeroSchema(zona)`; `abono-tienda.ts`: `registrarAbonoTiendaSchema(zona)`.
  - `aporte-capital.ts`: `fechaAporteCapitalSchema(zona)`, `registrarAporteCapitalSchema(zona)`. `gasto-fijo-plantilla.ts`: `crearGastoFijoPlantillaSchema(zona)` (default de `fechaCobro` = hoy en la zona); `actualizarGastoFijoPlantillaSchema` sigue estático (deriva de la parte sin zona). `premio-ranking-devengo.ts`: `listarPremiosDelDiaSchema(zona)`.
  - `wallet.ts`: `primerDiaMovimientoAdmisible(zona, now?)`, `problemaDeFechaMovimiento(value, zona, now?)`, `esFechaMovimientoValida(value, zona, now?)` y fábricas `fechaMovimientoSchema`, `registrarMovimientoManualSchema`, `listarMovimientosSchema`, `listarMovimientosCompletoSchema`, `listarLibroCajaSchema`, `listarLibroCajaCompletoSchema`, `listarMovimientosDeFilaSchema`, `registrarEgresoAdministrativoSchema`. `wallet-tienda.ts`: `listarMovimientosTiendaSchema`, `…CompletoSchema`, `listarMovimientosDeTiendaSchema`, `…CompletoSchema`, `registrarCobroTiendaSchema`. `wallet-mensajero.ts`: `listarPagosMensajeroSchema`, `listarPagosDeMensajeroSchema`, `…CompletoSchema`. `wallet-filtros.ts`: `conceptosConMovimientosSchema`, `quienesDelLibroCajaSchema`. `wallet-laterales.ts`: `registrarEgresoConLateralesSchema`, `registrarMovimientoManualConLateralesSchema`. `incentivo-mensajero.ts`: `registrarIncentivoMensajeroSchema`. `pago-por-cuenta-tienda.ts`: `registrarPagoPorCuentaTiendaSchema`. Todas `(zona: string) => schema`; los tipos `…Input` pasan a `z.infer<ReturnType<typeof …>>`.
- Llamadores (65 archivos): los de servidor pasan `ZONA_CR` con `// SLT-42 pendiente T5.<n>: zona de la empresa` justo encima (T5.3: 10, T5.4: 36, T5.5: 14, T6: 9; `grep -rn "SLT-42 pendiente T"`). Los de UI (`app/(app)/**/_components`, `components/shared/**`) pasan `ZONA_CR` con `// SLT-81: la UI sigue en la zona de CR`.

### Tests
- Nuevo `tests/unit/utils/utilidades-por-zona.test.ts` (R22, R23): Bogotá (UTC-5, sin horario de verano) frente a CR, y Nueva York / Madrid en sus días de cambio, para `dia-reparto`, `fecha-dia-iso`, `ranges`, `cubo-temporal`, `rollup-dia`, `ventana-dia-cr`, `periodicidad` y las fábricas `fechaFuturaSchema`, `fechaPagoSchema`, `desdeDiaSchema`/`hastaDiaSchema`.
- ~100 tests existentes pasan `ZONA_CR` (mismo resultado que antes). Guardias de fuente adaptadas a la forma nueva: `ranges-reuso`, `rollup-guards`, `backfill-guards` (piden `calendario-zona` y las gemelas sin `CR`), `dia-reparto` (la trampa nombrada es `inicioDelDiaEnUtc`), aridades de `ventanaDelDiaEnCursoCR` (2) y `trocear` (2), `rutas-336-retiradas` y `GestionarOrdenPanelIncidente` (la fábrica se invoca antes de `.parse`).

### Mapa R → test
| R | Test |
|---|---|
| R22 | `utilidades-por-zona.test.ts`: «a la misma hora, Bogota ya esta en el 21…» (dia-reparto), «el mismo instante es del 21 en Bogota…» (fecha-dia-iso), «el preset `dia` de Bogota empieza a las 05:00Z…» (ranges), «el ancla del 21 ya cobra en Bogota…» (periodicidad), «fechaFuturaSchema: el 21 ya es «hoy» en Bogota…» (schema fábrica) |
| R23 | `utilidades-por-zona.test.ts`: «R23: el dia del cambio de hora el limite sigue a la pared» (dia-reparto), «R23: alrededor del cambio de hora de Madrid…» (fecha-dia-iso), «R23: el dia que se adelanta el reloj dura 23 h y el que se atrasa 25 h» y «`semana` y `mes` cuentan dias de calendario…» (ranges), «trocear deja cubos contiguos y el del 8 de marzo mide 23 h», «fechaObjetivo es la fecha calendario anterior…», «horaDeParedCR lee la pared…», «R23: alrededor del cambio de hora el dia de cobro…» (periodicidad), «fechaPagoSchema: el 30 de marzo… (R23)», «desdeDiaSchema/hastaDiaSchema… dia de 23 h» |

### Desvíos y notas
- `fecha-dia-iso`, `ventana-dia-cr` y `dia-reparto` conservan los nombres de función con sufijo `CR` (`fechaDiaMovimientoCR`, `ventanaDelDiaEnCursoCR`, …) aunque ya reciben la zona: renombrar tocaba aún más llamadores de UI. Se documenta en cada archivo. Los dos schemas de `filtro-dias-cr` sí se renombran (solo los usaba `lib/types`).
- `lib/types/historial-accion-etiquetas.ts` usa `fechaCalendarioCR` para una etiqueta (no es un schema con «hoy») y lo consumen repositorios: queda para la tanda que cablee esos repositorios.
- `lib/analytics/consulta.ts`, `entregas-conteo.ts` y `productos-consulta.ts` llaman a `resolverRango`: pasan `ZONA_CR` con el marcador T5.5.
- `filtros-cierres.ts`, `historial-accion.ts` y `historico-conversaciones.ts` solo usaban `esFechaCalendarioValida` (sin zona): importan de `calendario-zona` en vez de `fecha-cr`. `estado-cuenta.ts`: solo comentarios.

### Salida
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: exit 0.
- `eslint` sobre los 193 archivos tocados (en 4 tandas): 0 errores; 1 warning previo (`EnviarPlantillaWhatsappButton` sin usar en `GestionarOrdenPanel.tsx`, ya en HEAD).
- `vitest run` de los 75 tests unitarios/componentes tocados: verde tras los ajustes (la primera corrida dio 5 rojos de aridad/fuente, corregidos y re-corridos: 76/76 y 83/83).
- `vitest related --run` de los 16 archivos de `lib/utils` y `lib/analytics` (cubre los de `lib/types`, que importan `calendario-zona`): `Test Files 4 failed | 1297 passed | 358 skipped (1659) · Tests 4 failed | 20113 passed`. `DescargarDataset` y `GestionarOrdenPanelIncidente` eran míos y se corrigieron (re-corridos: 35/35 junto al siguiente). `premio-ranking-devengo-migration` está en el baseline. `organizaciones-action.composition-root` («$transaction 2 veces, se esperaba 1») no está en el baseline y no es de esta tanda: no toco organización, país ni sus repos; viene de la tanda 2b (13757c87).
- `pnpm run test:guardias`: `Tests 4 failed | 4550 passed | 24 skipped`; los 4 son `dependencias-declaradas-presentes`, en el baseline.

Veredicto: T5.1 y T5.2 hechas; zona obligatoria en utilidades y schemas, CR idéntico, R22/R23 con test; typecheck y guardias en verde salvo baseline.

## Tanda 3 · T5.3: zona de la empresa en órdenes, reparto, cierres, corte y reprogramadas (2026-11-05)

### Archivos de producción (67)
- Nuevos: `lib/services/zona-de-la-empresa.ts` (`zonaDeLaEmpresa(reglasPais, operacion)`; `zonaPerezosa(reglasPais, operacion)` → `ZonaDeLaOperacion`, que lee la zona una vez y solo si hace falta; `filtrosParaRepo(filtros, zona)`, que pasa `desde`/`hasta` de fecha calendario a instantes) y `lib/actions/_shared/zona-del-borde.ts` (`zonaDelBorde(reglasPais?)`, para las actions de lectura).
- Servicios: `ApiOrdenLecturaService`, `AsignacionSateliteService`, `AvisosDiariosService`, `CierreBodegaService`, `CierreDiaService`, `CierresAdminService`, `CierresBodegaAdminService`, `CorreccionDiaRepartoService`, `CorreccionFechaReprogramacionService`, `CorteDiarioService`, `EtiquetaGuiaService`, `GestionDesdeAyudaService`, `GuiaAsignacionService`, `ManifiestoService`, `MisAsignacionesService`, `OptimizacionRutaService`, `OrdenService`, `RecepcionSateliteService`, `RechazoTiendaService`, `RecoleccionTiendaService`, `ReprogramadasRetenidasService`, `TraspasoMensajeroService`, `jobs/optimizacion-ruta-encolado`, `liberacion-al-aprobar-cierre`, `liberacion-tras-corregir-fecha`, `mensajes-correccion-fecha-reprogramacion`.
- Repositorios e interfaces: `CierreBodega`, `CierreDia`, `CierresAdmin`, `CierresBodegaAdmin`, `GestionOrden`, `LiberacionReprogramada`, `Orden` (y sus `I…Repository`), `IReprogramadasRetenidasService`; `lib/types/filtros-cierres.ts` (`FiltrosEnRepositorio<F>`, `FiltrosCierresRepo`, `FiltrosCierresBodegaRepo`, `FiltrosDescargaGestionesRepo`).
- Bordes (composition roots): 17 actions de `lib/actions/` (cierre-bodega, cierre-dia, cierres-admin, corregir-dia-reparto, corregir-fecha-reprogramacion, etiquetas-guia, gestion-desde-ayuda, liberacion-reprogramada, manifiesto, mis-asignaciones, ordenes, ordenes-guia, recepcion-satelite, recoleccion-tienda, reprogramadas-retenidas, resolver-novedad, traspasar-mensajero), `app/api/cron/corte-diario/route.ts` y las 3 rutas de `app/api/ordenes/api-key/`; `scripts/bench-busqueda-ordenes.ts`, `scripts/demo-qa/receta.ts`.
- Los 10 marcadores `SLT-42 pendiente T5.3` de la tanda anterior quedan resueltos.

### Firmas nuevas (las que cambian contrato)
- Servicios: `reglasPais?: Pick<IReglasPaisEmpresa, "zonaHoraria">` como último parámetro del constructor (desvío 1).
- `ICierreDiaRepository`: `findGestionesPendientes(mensajeroId, zona)`, `findBloqueoDetalle(mensajeroId, zona)`, `findJornadaDeCierre(cierreId, zona)`. `ICierresAdminRepository` / `ICierresBodegaAdminRepository`: listados con `filtros?: Filtros…Repo` (instantes); detalle y descarga con `zona`. `ICierreBodegaRepository`: `filtros?: FiltrosCierresBodegaRepo`.
- `IOrdenRepository`: `findEtiquetasByIds(ids, tiendaId, zona)`, `findEtiquetaByNumGuia(numGuia, tiendaId, zona)`; `GenerarGuiaDecisionData` exige `fechaReparto` cuando hay `mensajeroAsignadoId`.
- `IGestionOrdenRepository` recibe `inicioDelDia: Date` calculado por el servicio; `ILiberacionReprogramadaRepository.findLiberadasHoy(filter, dia: { desde, hasta })`.
- `IReprogramadasRetenidasService`: `resumen(hoyCR, zona)`, `contarPorCierre(hoyCR, zona, cierreIds)`.

### Tests
- Nuevo `tests/unit/services/hora-por-pais-servicios.test.ts`. ~180 tests existentes adaptados a las firmas (dobles con `reglasPaisFijas()` de CR: mismo resultado que antes). `tests/fabricas/reglas-pais.ts`: + `inicioDelDiaCR(now)` y `ventanaDelDiaCR(hoy)` para los tests de repositorio; las fábricas `escenarios/{reparto,cierres}.ts` pasan `reglasPaisFijas()`.

### Mapa R → test (T5.3)
| R | Test (`tests/unit/services/hora-por-pais-servicios.test.ts`) |
|---|---|
| R22 | «R22: el mismo instante cierra el 19 en Costa Rica y el 20 en Bogota» (CorteDiario); «R22: a las 04:30Z del 21, el dia de los KPIs…» y «R22: la jornada que nombra el bloqueo…» (MisAsignaciones); «R22: «el 20» empieza a las 06:00Z en Costa Rica y a las 05:00Z en Bogota» (OrdenService) |
| R23 | «R23: la noche del cambio de hora de Nueva York el ancla sigue a la pared…» (CorteDiario); «R23: el dia que Madrid adelanta el reloj, la ventana de los KPIs dura 23 h» (MisAsignaciones) |
| R28 | «R28: sin zona en el pais, la corrida falla con PaisSinZonaHoraria…» (CorteDiario); «R28: sin zona, recoger falla…»; «R28: con filtro de fecha y sin zona…» (OrdenService); bloque «SLT-42 (R28) — sin zona en el pais, las escrituras fallan sin escribir nada» (CierreDia.solicitarCierre, CorreccionDiaReparto.corregir) |
| R30 | «R30: la misma instancia atiende a dos empresas seguidas sin recordar la zona de la primera» (CorteDiario) |

### Desvíos y notas
1. `reglasPais` es **opcional** en los constructores de servicio (obligatoria solo en `GestionDesdeAyudaService`); la real la pone cada composition root (`construirReglasPaisEmpresa`). Sin ella el servicio falla al primer uso que necesita la zona (`zonaDeLaEmpresa`), no al construirse.
2. Los repositorios `CierreDia`, `CierresAdmin`, `CierresBodegaAdmin` y `Orden` reciben `zona` para **formatear** fechas (jornada, fecha de gestión, `fechaCreacion` de la etiqueta).
3. Los filtros de cierres llegan al repositorio como **instantes** (`filtrosParaRepo`), no como fechas calendario; lo arrastran `CierreBodegaService` y `CierresBodegaAdminService`.
4. También se tocaron `EtiquetaGuiaService`, `TraspasoMensajeroService` y `OptimizacionRutaService`. En `OptimizacionRutaService` quedan **2 marcadores** `SLT-42 pendiente (rutas; fuera de T5.3, sin task asignada)` (líneas 275 y 618): las rutas siguen en CR y falta asignarles task.
5. `generarGuiaLote` exige `fechaReparto` cuando la guía lleva mensajero (`GenerarGuiaDecisionData` es una unión); antes el repositorio la derivaba en CR.
6. Las actions de **lectura** leen la zona en el borde (`zonaDelBorde`) y la pasan hacia dentro.
7. `lib/utils/jornada-cierre.ts` **sin cambios** (solo se adaptó su test).
8. `lib/types/historial-accion-etiquetas.ts` **sigue en CR** (`fechaCalendarioCR`); queda para la tanda que cablee los repositorios del historial.

### Salida
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: exit 0 (corrido antes de esta verificación).
- `eslint` de los 67 archivos de producción, el test nuevo y `tests/fabricas/reglas-pais.ts`: 0 errores, 3 warnings (`no-unused-vars` en parámetros con `_`).
- Integración, los 57 archivos de `tests/integration` tocados, contra `logistic_slt42_test` (solo catálogos): `Test Files 34 failed | 20 passed (54) · Tests 34 failed | 176 passed | 241 skipped (451)`. **Los 34 archivos rojos están en `tests/baseline-rojos.json`** y caen en el `beforeAll` por la base vacía («tabla `orden` vacía», «el catálogo local no tiene el estatus ayuda_tienda», FK de zona de otra empresa en `cierre-descarga-fechas`, `conCorpus` sin crear en `busqueda-comportamiento`). Ninguno nuevo. En verde, entre otros: `liberadas-hoy-ventana-cr-sl44`, `ruta-primera-pendiente-dos-empresas-sql-real` y `optimizacion-ruta-enqueue`. `cierres-filtro-estado-sql-real`, `traspaso-mensajero.int` y `484-puntero-traspaso` no llegan a ejecutarse: el fixture falla y están en el baseline.
- `vitest related --run` sobre los 67 de producción, en lotes de 10, `NODE_OPTIONS=--max-old-space-size=8192`, misma base:
  - lote 1: `Test Files 2 failed | 241 passed (243) · Tests 28 failed | 3457 passed`
  - lote 2: `Test Files 235 passed (235) · Tests 3426 passed`
  - lote 3: `Test Files 140 failed | 557 passed (697) · Tests 118 failed | 7504 passed | 872 skipped`
  - lote 4: `Test Files 167 failed | 596 passed (763) · Tests 168 failed | 8171 passed | 995 skipped`
  - lote 5: `Test Files 111 failed | 316 passed (427) · Tests 58 failed | 4556 passed | 641 skipped`
  - lotes 6 y 7 (17 archivos: de `jobs/optimizacion-ruta-encolado` a `TraspasoMensajeroService`, `zona-de-la-empresa`, `filtros-cierres` y los 2 scripts): **no terminaron**; Claude Code paró la corrida en el lote 6 por falta de memoria del sistema. Para cubrirlos se corrieron aparte los 29 tests tocados que ningún lote había ejecutado: `Test Files 29 passed (29) · Tests 691 passed (691)`.
  - Rojos fuera del baseline, solo 2 archivos. `carga-division.test.ts`: 1 caso («expected 5 to be 4» al contar `historial_accion`); rojo solo en el lote 4, verde en los lotes 3 y 5 y verde aislado, así que es carga. `demo-qa.test.ts`: 11 casos, **rojo real, pero no de T5.3**. El alta de la empresa demo falla con `{"estado":"invalida","campo":"maestro.documento"}`: la receta usa `documentoMaestro: "demo-qa-a-maestro"`, que la validación de documento por país de T4.2/T4.3 (070e6e96) ya no acepta. Se reprodujo aislado y no se tocó (fuera del alcance de T5.3).
- `pnpm run test:guardias`: `Test Files 1 failed | 324 passed | 3 skipped · Tests 4 failed | 4550 passed | 24 skipped`; los 4 son `dependencias-declaradas-presentes`, en el baseline.

Veredicto: T5.3 hecha; zona de la empresa en órdenes, reparto, cierres, corte y reprogramadas, con R22/R23/R28/R30 cubiertos por test. Sin rojos nuevos de T5.3; quedan `demo-qa` (rojo de T4.2/T4.3) y 17 archivos sin `vitest related` por memoria.

## Tanda 4a · T5.4: zona de la empresa en wallet, liquidación, caja e historial (2026-11-05)

Un agente anterior dejó el trabajo sin commitear porque murió antes del commit. En esta tanda se revisó, se verificó y se cerró en el commit `a6109cff`.

### Qué cambió (53 archivos de producción, 141 de test)
- **Servicios.** Reciben `reglasPais?: Pick<IReglasPaisEmpresa, "zonaHoraria">` como último parámetro del constructor, con el patrón de T5.3: `AbonoTienda`, `AporteCapital`, `CobroTienda`, `ComoQuedo`, `ConciliacionSatelites`, `EstadoCuenta`, `FiltrosWallet`, `GeneracionGastosFijos`, `HistorialAccion`, `IncentivoMensajero`, `LibroCajaAutoria`, `Liquidacion`, `OrigenLegible`, `PagoPorCuentaTienda`, `PrevisualizarMovimiento`, `WalletComprobante`, `WalletEgreso` y `Wallet`. `CierresAdminService` y `CierresBodegaAdminService` solo pasan la zona a sus repositorios.
- **Composition roots.** Son 20 actions de `lib/actions/`: wallet*, liquidación, estado de cuenta, gastos fijos, aportes, abono, pago por cuenta, cómo quedó, conciliación, efecto-movimiento, historial, incentivo, libro-caja-autoría y `_shared/comprobante-lateral`. Se suman `app/api/cron/generar-gastos-fijos/route.ts`, que la pone por empresa dentro de `paraCadaEmpresa`, y `scripts/demo-qa/receta.ts`.
  - Todas inyectan `construirReglasPaisEmpresa(prisma)`.
  - Las actions de lectura usan `zonaDelBorde`, y los schemas con «hoy» se construyen por zona.
  - Un script recorrió todo `lib/`, `app/` y `scripts/`: ninguna construcción de esos 18 servicios queda sin reglas.
- **Etiquetas del historial** (`lib/types/historial-accion-etiquetas.ts`). `cierre_dia` y `cierre_bodega` llevan `zonaHoraria`, y la ponen `CierresAdminRepository` y `CierresBodegaAdminRepository` (decisión 3 de «tras T5.3»).
- **Contratos.**
  - `ISaldosSatelitesRepository`: `findSaldosPaginado`, `findSaldosCompleto` y `findResumen` reciben `zonaHoraria`.
  - `IWalletMovimientoRepository.primerDiaDeLaCaja({ zonaHoraria, excluirCapital? })`: las opciones dejan de ser opcionales.
  - `ICajaBackfillTesoreriaService`: sus deps llevan `reglasPais?`.
  - `IGeneracionGastosFijosService.fecha` es el día de la corrida en la zona del país.
- **Lo que queda en CR en este alcance.** Nada: no hay `ZONA_CR`, `fechaCalendarioCR` ni `hoyCR` en servicios, repositorios, actions ni tipos de wallet, liquidación, caja, gastos fijos, aportes, estado de cuenta e historial. Tampoco quedan marcadores `SLT-42 pendiente T5.4`.

### Mapa R → test (T5.4, `tests/unit/services/hora-por-pais-wallet.test.ts`)
| R | Test |
|---|---|
| R22 | «el dia del cierre es el del calendario del pais de la empresa» (etiqueta del historial); «el dia del cierre en el origen sale de la zona del pais» (OrigenLegible); «el dia y la hora de cada cierre son los de la zona del pais» (FiltrosWallet); ««desde el 20» empieza a las 06:00Z en Costa Rica y a las 05:00Z en Bogota» (HistorialAccion); «el mismo instante es la corrida del 20 en Costa Rica y la del 21 en Bogota» (GeneracionGastosFijos); «a las 05:30Z del 21, «el 21» es futuro en Costa Rica y es hoy en Bogota» (AporteCapital) |
| R23 | «buscar el dia del cambio de hora de Madrid da una franja de 23 h, de pared a pared» (FiltrosWallet) |
| R28 | «buscar un dia sin zona en el pais falla con PaisSinZonaHoraria y no consulta» (FiltrosWallet); «con rango y sin zona falla sin consultar; sin rango no la necesita» (HistorialAccion); «sin zona en el pais, la corrida falla … antes de leer o escribir» (GeneracionGastosFijos); «sin zona falla … antes de subir el comprobante o escribir» y «en el borde, sin zona la accion falla y no llega al servicio» (AporteCapital); «con fecha elegida y sin zona en el pais, falla sin escribir; sin fecha no la necesita» (WalletService) |

### Desvíos del design
1. **`CajaBackfillTesoreriaService` recibe la zona por otro lado y nadie se la inyecta en producción.**
   - Recibe `reglasPais` dentro de su objeto `deps`, porque su constructor ya era un objeto. No la recibe como último parámetro posicional.
   - Lee la zona de forma perezosa (`zonaPerezosa`): solo si hay pagos o anulaciones que fechar.
   - No tiene composition root de producción en `lib/`, `app/` ni `scripts/`: solo lo construyen los tests.
2. **`WalletService.registrarMovimientoManual` lee la zona antes de escribir.** La lee antes de guardar el comprobante, y solo si hay fecha elegida. Sin fecha manda el `DEFAULT` de la columna, como antes.
3. **Los repositorios reciben la zona, como en T5.3.** Los de saldos de satélites y de la caja la usan para contar días y formatear fechas; la calcula el servicio.

### Salida
- **Typecheck.** `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck`: exit 0.
- **Lint.** `eslint` sobre los 53 archivos de producción, el test nuevo y `tests/fabricas/reglas-pais.ts`: sin salida (0 errores, 0 warnings).
- **Guardias.** `pnpm test:guardias`: `Test Files 1 failed | 324 passed | 3 skipped (328) · Tests 4 failed | 4550 passed | 24 skipped (4578)`. Los 4 rojos son de `dependencias-declaradas-presentes`, en el baseline.
- **Tests unitarios tocados.** El test nuevo y los 57 tocados: `Test Files 58 passed (58) · Tests 1293 passed (1293)`.
- **`vitest related --run`.** Se corrió en 11 lotes de 5 archivos, con `NODE_OPTIONS=--max-old-space-size=8192` y **sin `DATABASE_URL`** (ver abajo).
  - Lote 1: `Test Files 2 failed | 206 passed | 31 skipped (239) · Tests 3 failed | 3042 passed | 222 skipped`.
  - Lote 2: `Test Files 1 failed | 185 passed | 6 skipped (192) · Tests 1 failed | 2605 passed | 46 skipped`.
  - Todos los rojos de los lotes 1 y 2 son de UI:
    - `tests/components/WalletCaja463.test.tsx`: 2 casos.
    - `tests/components/WalletCajaBarra467.test.tsx`: 1 caso.
    - Los fallos fueron un timeout de 20 s, un `listbox` que no aparece y una llamada de más.
  - Corridos aislados, los dos archivos pasan: `Test Files 2 passed (2) · Tests 52 passed (52)`. Es carga: en la misma máquina corrían a la vez vitest y tsc de otros proyectos, y cada lote tardaba 25–40 min.
  - Los lotes 3–11 se corrieron con `--exclude 'tests/components/**'`: la UI no es del alcance de backend y era casi todo el tiempo. Ninguno dio rojo:

    | Lote | Resultado |
    |---|---|
    | 3 | `20 passed \| 16 skipped (36)` |
    | 4 | `63 passed \| 27 skipped (90)` |
    | 5 | sin tests (solo interfaces) |
    | 6 | `143 passed \| 175 skipped (318)` |
    | 7 | `92 passed \| 135 skipped (227)` |
    | 8 | `68 passed \| 51 skipped (119)` |
    | 9 | `65 passed \| 54 skipped (119)` |
    | 10 | `79 passed \| 58 skipped (137)` |
    | 11 | `416 passed \| 315 skipped (731)`; `Tests 6190 passed \| 2316 skipped` |
- **Integración contra base: no se corrió.**
  - El clasificador de permisos negó armar la `DATABASE_URL` de `logistic_slt42_test` con las credenciales del `.env`.
  - Sin ella, los ~100 tests tocados de `tests/integration/db` se saltan; son los "skipped" de los lotes.
  - Queda para CI, o para una corrida con la URL que ponga el humano.

### Preguntas abiertas
1. **¿Quién corre `CajaBackfillTesoreriaService`?** No tiene composition root de producción. Puede que se corra desde un script fuera del repo, o que sea código muerto.
   - Si se usa, su llamador tiene que pasar `construirReglasPaisEmpresa(prisma)`.
   - Si no la pasa, falla con `PaisSinZonaHoraria` en cuanto haya pagos que fechar.
2. **Falta la integración de T5.4 contra `logistic_slt42_test`.** Hay que correrla con `DATABASE_URL`, que no pude armar sin leer credenciales.
3. **Quedan en CR, fuera de T5.4:**
   - `PlanesService`: usa `fechaCalendarioCR` para el ciclo. El design §0 dice que el ciclo de planes es UTC y no se toca, pero la fecha que se muestra sigue en CR.
   - `FinanzasDiarioService` y `premio-ranking-devengo`: son de T5.5.
   - La UI de wallet (`WalletLedger`, `GastoFijoPlantillaDialog`, las columnas de descarga): no es de backend.

Veredicto: T5.4 hecha. Wallet, liquidación, caja, gastos fijos, aportes, estado de cuenta e historial usan la zona de la empresa, con R22/R23/R28 cubiertos. Typecheck, lint, guardias y `vitest related` (sin UI) en verde; falta la integración con base.

## Tanda 4b · T5.5: zona de la empresa en analítica, tablero, ranking, notificaciones, avisos, informes de WhatsApp, rutas y fecha de planes (2026-11-05)

Alcance: T5.5 más dos agregados del humano: las rutas (`OptimizacionRutaService`) y la fecha que **muestra** `PlanesService` (el ciclo de cobro sigue en UTC, sin tocar).

### Qué cambió (78 archivos de producción, ~135 de test)
- **Servicios con `reglasPais?: Pick<IReglasPaisEmpresa, "zonaHoraria">` como último parámetro** (patrón de T5.3): `AnaliticaFinanciera`, `AnaliticaOperativa`, `AnaliticaRollup`, `AvisosDiarios`, `ConteoHoyGestion`, `FinanzasDiario`, `GeocodeSalud`, `Notificacion`, `OptimizacionRuta`, `PremioRankingDevengo`, `Ranking`, `RankingSnapshot`, `RepartoMananaAviso`, `TableroDia` y `VigenciaAvisoAgregado`. `EjecucionEnvioService` y `WhatsappEnvioService` ya tenían `reglasPais` en `deps`: ahora también leen la zona.
- **Composition roots** con `construirReglasPaisEmpresa(prisma)`: las actions de analítica (11), `tablero-dia`, `finanzas-diario`, `ranking`, `ranking-historico`, `premio-ranking-devengo`, `notificaciones`, `planes` y `_shared/planes-plataforma`; los crons `avisos-diarios`, `aviso-reparto-manana` y `snapshot-ranking` (dentro de `paraCadaEmpresa`: cada empresa con su zona, R24); los jobs `analitica-rollup-diario`, `geocodificacion`, `optimizacion-ruta`, `push-web` y los de envíos de WhatsApp (`whatsapp-envio-deps` expone `reglasPais`); `lib/api/analitica-integrador.ts` y `lib/notificaciones/notificadores.ts` (`repoReal` y el aviso de webhook pausado).
- **Analítica.** `prepararConsultaAnalitica(raw, actor, metricaId, zona, now?, canal?)`, `prepararConteoEntregas(raw, actor, zona, now?)` y `prepararConsultaProductos(raw, actor, zona, now?)`. Los bordes leen la zona con `zonaDelBordeConActor` (nuevo en `_shared/zona-del-borde.ts`). La semana y las fechas del rango de `AnaliticaOperativaService` pasan a aritmética de calendario sin zona.
- **Funciones puras que ahora reciben `zona`:** `snapshot-dia` (`fechaObjetivo`, `ventanaDelDia`), `tiempoRelativo`, `textoWebhookSuscripcionPausada`/`emitirWebhookSuscripcionPausada`, `proximaOcurrencia`/`instanteDe`/`encolarProximaOcurrencia`, `primeraRutaPendiente`/`decidirGuardaRuta`, picking (`nombreArchivoPicking`, `diasEnPreparacion`, `contarPorTienda`, `resumenTiendasPicking`, `construirModeloPicking`) y tránsito (`cortesPorZona`, `clasificar`, `seleccionarTransito`, `nombreArchivoTransito`). `ContextoInforme` gana `zona` y los modelos de picking y tránsito la llevan. El formato de los informes se renombra: `fechaLegibleEnZona`, `horaLegibleEnZona`, `fechaLargaEnZona` y `fechaCortaEnZona`.
- **`lib/config/aviso-reparto-manana.ts`.** Se retira `OFFSET_CR_HORAS`. `horaUtcDeHoraCR` pasa a `horaUtcDeHoraLocal(hora, zona, instante)`, con `desfaseEnMs` (design §4.3).
- **`calendario-zona.ts`** gana `instanteDeParedEnUtc(fecha, hh, mm, zona)`. **`zona-de-la-empresa.ts`** gana `zonaDeOrganizacionCon(repoPais)`, para el superadmin, que corre en plataforma sin empresa en el contexto.
- **Marcadores.** No quedan `SLT-42 pendiente T5.5` ni los dos de rutas. Nuevos: `SLT-42 pendiente T5.7` en `analitica-integrador.ts` (rango de la API por key) y en `app/(app)/wallet/mensajeros/page.tsx`; `SLT-42 pendiente T7.1` en el catálogo de planes (`vigenteDesdePendiente`) y en `email/plantillas/cambio-plan.ts`.

### Desvíos del design
1. **`zonaDelBordeConActor`.** Los bordes de analítica preparan la consulta (con su rango) antes de saber si hay actor. Sin actor no hay empresa de la que leer la zona, así que la preparación usa una zona neutra (`"UTC"`) que nunca llega a un repositorio. Así, sin sesión, la respuesta sigue siendo `validation_error` o `unauthenticated`. Con actor y sin zona en el país, el borde falla con `PaisSinZonaHoraria` (R28) antes de parsear.
2. **Los servicios de analítica leen la zona dos veces por petición** (el borde, para el rango, y el servicio, para los cubos o el día en curso). Las dos lecturas van a la misma memoria del marco (`memoriaDelMarco`), así que dan la misma zona sin otra consulta.
3. **`PlanesService` no recibe `IReglasPaisEmpresa`, sino `zonaDeOrganizacion(organizacionId)`.** El superadmin corre en plataforma y la empresa llega como parámetro. Solo `siguienteCiclo` de las vistas previas usa la zona de la empresa. `vigenteDesdePendiente` del catálogo sigue en CR (`ZONA_CR`, marcador T7.1), porque un plan del catálogo no es de una sola empresa (pregunta 1).
4. **Textos de PDF.** «· hora de Costa Rica» pasa a «· hora local» en los PDF de picking, tránsito y prueba. Las descripciones de las variables de los informes («hora de Costa Rica») no se tocaron, porque son textos del catálogo que ve la UI (pregunta 2).
5. **El ejemplo del aviso de webhook pausado** (`lib/whatsapp-envios/eventos.ts`) se formatea en `"UTC"`. Es un texto de catálogo sin empresa, y a las 14:00Z es el mismo día en cualquier zona de América.
6. **`app/(app)/ranking/historico/page.tsx`** lee la zona con `zonaDelBorde` para el D−1 por defecto (es del ranking). `wallet/mensajeros/page.tsx` queda para T5.7.
7. **Fuera de T5.5 y sin cambios:** `lib/actions/chat-whatsapp.ts` (corte de «hoy» del chat), `HistoricoConversacionesRepository`, `AsistenteService` (tope diario), `lib/types/plantilla-datos.ts` (lo comparte la UI), los handlers `liberar-reprogramadas` y `analitica-rollup-diario` (fecha objetivo, T6), `scripts/rollup-analitica-manual.ts` y `lib/planes/{ciclo,cobro,consumo}.ts` (UTC, SL-24).

### Tests
- Nuevo: `tests/unit/services/hora-por-pais-analitica-avisos.test.ts` (18 casos). En `planes-service-inicio-ciclo.test.ts`, 2 casos nuevos.
- Adaptados a las firmas, con dos codemods de AST sobre ~130 archivos (de `tests/unit` y `tests/integration`). Uno añade `ZONA_DE_CR` donde ahora se pide la zona. El otro añade `reglasPaisFijas()` a las construcciones de servicio y `reglasPais: reglasPaisFijas()` a los `deps` de las actions. Con CR, el resultado es el de antes.
- Guardias actualizadas a los nombres nuevos:
  - `ranking-ventana-dia`: `inicioDelDiaEnUtc`, `fechaComoDate(hoy)`.
  - `tablero-dia/frontera`: el consumidor real de `startOfDayCR` que queda es `liberar-reprogramadas-handler`.
  - `cron-hora-cr`: `horaUtcDeHoraLocal`, con un caso nuevo de horario de verano.
  - `snapshot-dia`: importa `calendario-zona`.

### Mapa R → test (T5.5)
| R | Test |
|---|---|
| R22 | `hora-por-pais-analitica-avisos.test.ts`: «el preset «dia» es el 20 en Costa Rica y el 21 en Bogota…» (analítica); «el mismo instante es el tablero del 20 en Costa Rica y el del 21 en Bogota»; «el reparto de mañana anuncia el dia siguiente al de la pared de la empresa»; «un aviso de las 23:50 del 20 leido a las 00:10 es de «ayer» en Bogota…» (campana); «el corte del transito es el comienzo del dia local…»; «una ruta calculada a las 23:40 del 20 en CR ya es «de ayer»…»; «la zona sale del pais de la empresa nombrada…» (planes). `planes-service-inicio-ciclo.test.ts`: «SLT-42 R22: el siguiente ciclo se muestra en la zona del pais de la empresa nombrada» |
| R23 | «el dia que Madrid adelanta el reloj, la ventana del ranking dura 23 h…»; «la hora UTC del aviso sigue al desfase del instante…»; «el envio de las 05:00 cae a las 05:00 de pared en Madrid, en verano y en invierno»; `cron-hora-cr.guardia.test.ts`: «SLT-42 (R23): con horario de verano la hora UTC sigue al desfase del instante» |
| R24 | «el dia de la corrida y el de las retenidas salen de la zona del pais de la empresa» (avisos diarios); «la corrida del snapshot … congela …» (ranking) |
| R28 | «en el borde, con actor y sin zona en el pais, falla con PaisSinZonaHoraria»; «sin zona en el pais, falla … y no consulta el repositorio» (tablero); «sin zona, el ranking falla sin contar nada»; «sin zona la corrida de esa empresa falla antes de leer o emitir nada» (avisos); «la zona sale del pais… sin zona, PaisSinZonaHoraria» (planes); `planes-service-inicio-ciclo.test.ts`: «SLT-42 R28: sin zona en el pais de la empresa, la vista previa falla…» |
| R30 | «la misma instancia atiende a dos empresas seguidas sin recordar la zona de la primera» (tablero) |

### Salida
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck`: exit 0, 0 errores.
- `eslint` de los archivos tocados (en 4 trozos, por el largo de la línea de comandos de Windows): 0 errores y 33 warnings, todos `no-unused-vars` en parámetros con `_` de dobles y `_job`, como en las tandas anteriores.
- `pnpm test:guardias`: `Test Files 2 failed | 323 passed | 3 skipped · Tests 6 failed | 4549 passed | 24 skipped`.
  - Los 4 de `dependencias-declaradas-presentes` están en el baseline.
  - Los otros 2 eran de `ranking-ventana-dia`, por los nombres viejos. Se actualizó la guardia y, corrida aislada, da `12 passed`.
- Tests directos:
  - `tests/unit/analytics`: `175 passed (2262 tests)`, tras adaptar.
  - `whatsapp-envios`, `ranking`, `notificaciones`, `tablero-dia`, `pdf`, `utils` y `api`: `229 passed`.
  - 62 archivos de servicios y jobs del alcance: `60 passed`, y los 9 que fallaron, adaptados: `9 passed`.
  - 12 de actions: en verde.
  - El test nuevo: `18 passed`.
- `vitest related --run --exclude 'tests/components/**' --exclude 'tests/integration/**'` sobre los 78 de producción, en 16 lotes de 5:
  - lotes 0–5 y 7–12 y 15: en verde (de `4 passed` a `842 passed / 14174 tests`);
  - lote 6: `integraciones-consumidores-composition-root` en rojo (2 casos). Corre la fábrica real de rutas sin base y ahora se le inyectan las reglas reales. Se le añadió el mismo `vi.mock` de `ReglasPaisEmpresaService` que usa T5.4, y pasa: `14 passed`;
  - lotes 13 y 14: `tests/unit/components/ordenes-listado-vistas.test.tsx` en rojo (1 caso, UI). Aislado da `10 passed`: es carga, no de T5.5.
- Integración contra base: no se corre en local; la corre CI (decisión del humano tras T5.4).

### Preguntas abiertas
1. **Catálogo de planes (`vigenteDesdePendiente`).** Un plan del catálogo puede ser de varias empresas, de países distintos. ¿En qué zona se muestra la fecha del cambio pendiente? Hoy sigue en CR (marcador T7.1). Lo mismo pasa con la fecha del correo de cambio de plan (`email/plantillas/cambio-plan.ts`).
2. **Textos «(hora de Costa Rica)».** Siguen en las descripciones de las variables de los informes de WhatsApp (`picking/informe.ts`, `transito/informe.ts`, `prueba-envio.ts`, `aviso-interno.ts`) y en `plantilla-datos.ts`. ¿Pasan a «hora local» aquí, o con la UI de SLT-81?
3. **`scripts/rollup-analitica-manual.ts`** corre `AnaliticaRollupService` fuera de `conEmpresa`. Sin empresa en el contexto, la zona falla con `EmpresaNoResuelta`. Hay que ver si el script ya necesitaba contexto de empresa para el repositorio; si no lo necesitaba, toca abrirlo por empresa (T6).
4. **El chat de WhatsApp** (`lib/actions/chat-whatsapp.ts`, corte de «hoy») y `AsistenteService` (tope diario) siguen en CR, y ninguna task los nombra. ¿Van en T7.1 o en una task propia?

Veredicto: T5.5 hecha, con rutas y la fecha de planes. Analítica, tablero, ranking, notificaciones, avisos, informes y envíos de WhatsApp usan la zona de la empresa, con R22/R23/R24/R28/R30 cubiertos por test. Typecheck y guardias en verde (salvo el baseline); `vitest related` sin rojos de T5.5.

## Tanda 4c · T5.6: rastreo público con el país de la empresa dueña de la orden (2026-11-05)

Decisión del humano («tras tanda 2», punto 3): el rastreo usa el país de la empresa dueña de la orden para el teléfono y la zona horaria. Se deja `normalizarTelefonoCR` y se retira `RASTREO_PUBLICO_ZONA_HORARIA`. No había marcadores `SLT-42 pendiente T5.6` en el código.

### Archivos
- **Producción (4).**
  - `lib/services/RastreoPublicoService.ts`: gana `reglasPais?: Pick<IReglasPaisEmpresa, "deLaEmpresa" | "zonaHoraria">` como último parámetro.
    - Lee el país una vez, siempre, después de `buscarPorGuia` y antes de comparar.
    - Normaliza los dos lados del factor con `normalizarTelefono(raw, pais.telefono)`.
    - Con el factor ya aceptado, lee la zona con `zonaHoraria()`. Es la misma memoria del marco, sin otra consulta.
    - Fecha las transiciones y la entrada pendiente en esa zona. El formato del desfase de SL-37 no cambia.
    - No importa `lib/db`, porque R33 de la 229 lo prohíbe: `PaisSinZonaHoraria` lo lanza el puerto.
  - `lib/actions/rastreo-publico.ts`: el composition root inyecta `construirReglasPaisEmpresa(prisma)`. El puerto lee la empresa del `conEmpresa(orden.organizacionId)` que ya abría SL-17.
  - `lib/config/rastreo-publico.ts`: sale `ZONA_HORARIA` (y `readNonEmpty`, que quedaba sin uso).
  - `app/(app)/analitica/_components/entregas/ActualizarAnalitica.tsx`: solo un comentario que nombraba la variable retirada.
  - `.env.example` y `docs/` no nombraban la variable: no hubo que tocarlos.
- **Tests.**
  - Nuevo: `tests/unit/services/rastreo-publico-zona-pais.test.ts` (13 casos).
  - Adaptados al contrato: sin `ZONA_HORARIA` y con `reglasPaisFijas()`, que con CR da el resultado de antes.
    - `rastreo-publico-service.test.ts`: el caso «la zona sale de la configuración» pasa a «la zona sale del país».
    - `rastreo-publico.nombre-resultado.test.ts`.
    - Las guardias `rastreo-dto-lista-blanca` y `rastreo-sin-estatus-crudo`.
    - `tests/components/RastreoDialog.pendiente.test.tsx` (zona `UTC`, como antes).
    - 5 de integración: 454/455 y `rastreo-publico.int`.

### Mapa R → test
| R | Test (`tests/unit/services/rastreo-publico-zona-pais.test.ts`) |
|---|---|
| R27 | «el mismo instante se publica a las 21:30 -06:00 en Costa Rica y a las 22:30 -05:00 en Bogota»; «la entrada pendiente de confirmar tambien se fecha en la zona del pais»; «la misma instancia atiende dos ordenes de paises distintos sin recordar la zona de la primera»; «en Colombia, el factor tecleado con el prefijo 57 identifica el envio»; «guia existente: el pais se lee dentro de la empresa DUEÑA de la orden» (composition root); «el servicio ya no lee la zona de la configuracion ni de RASTREO_PUBLICO_ZONA_HORARIA»; «el servicio ya no usa el normalizador de Costa Rica» |
| R28 | «sin zona en el pais y con el factor correcto, falla con PaisSinZonaHoraria antes de leer el historial» |
| R7/R8 de la 229 (no regresión) | «guia inexistente: no_encontrado, como hoy, sin abrir empresa ni leer pais»; «sin zona en el pais y con el factor ERRADO, responde no_encontrado»; «pais sin reglas de telefono: no_encontrado, con el mismo trabajo que un factor errado»; «R8 intacto: orden no visible y factor errado leen el pais igual y responden igual» |

### Desvíos y decisiones mías (a confirmar)
1. **País sin prefijo o sin dígitos nacionales (`telefono: null`).** La orden queda no consultable: responde `no_encontrado`, igual que un teléfono corto (G2). No lanza `PaisIncompleto`, porque un error distinto de `no_encontrado` delataría que la guía existe.
2. **País sin zona.** Lanza `PaisSinZonaHoraria` (R28), pero solo después de aceptar el factor. Con un factor errado responde `no_encontrado`, así que no filtra si la guía existe. La action no lo captura: es una configuración rota del país, y sale como cualquier error de servidor.
3. **Guía inexistente.** La respuesta es la misma de hoy. El composition root corta antes del servicio (SL-17), así que no abre empresa ni lee el país. El test lo fija.

### Salida
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck`: exit 0.
- `eslint` de los 15 archivos tocados y del test nuevo: 0 errores. Hay 3 warnings `no-unused-vars` (`_numGuia`, `_ordenId`) que ya estaban en `rastreo-publico-service.test.ts`.
- `pnpm test:guardias`: `Test Files 2 failed | 323 passed | 3 skipped (328) · Tests 5 failed | 4550 passed | 24 skipped (4579)`.
  - 4 son de `dependencias-declaradas-presentes`, en el baseline.
  - 1 es de `sin-estados-retirados`, por carga. Corrida aislada: `Tests 6 passed (6)`. No toca nada de T5.6.
- Tests del rastreo: los 4 unitarios, las 5 guardias `rastreo-*`, `RastreoDialog.pendiente` y `rastreo-publico.int`. Resultado: `Test Files 12 passed (12) · Tests 150 passed (150)`.
- `vitest related --run` sobre los 4 de producción (un lote, sin `tests/components` ni `tests/integration`): `Test Files 9 passed (9) · Tests 113 passed (113)`.
- Integración 454/455 contra base: la corre CI. Su typecheck pasa.

### Preguntas abiertas
1. ¿Se acepta que un país sin reglas de teléfono deje sus órdenes no consultables (`no_encontrado`) en el rastreo, en vez de usar otro país o lanzar?
2. ¿Se acepta que un país sin zona dé un error de servidor a quien ya acertó el factor? La otra opción es responder `no_encontrado` también ahí, y la falta de zona no se vería.

Veredicto: T5.6 hecha. El rastreo público toma el teléfono y la zona del país de la empresa dueña de la orden, y R27 está cubierto. Typecheck, lint, guardias (salvo el baseline) y tests del rastreo en verde.

## Tanda 4d · T5.7: API por key, páginas de servidor y los agregados del humano (2026-11-05/06)

Alcance: T5.7 (API por key y OpenAPI; páginas `ordenes`, `wallet/mensajeros` y `recepcion-satelite/en-bodega`) más las decisiones de la ficha «tras T5.5» (puntos 1, 2 y 4) y «tras T5.6» (puntos 1 y 2). Fuera: bloques 6–7 (jobs, crons, `scripts/rollup-analitica-manual.ts`, guardia de T7.1). Commit: `ac5a2eb4`.

### Qué cambió (25 de producción, 30 de test, 3 de docs)
- **API por key.**
  - `ApiOrdenLecturaService` gana `reglasPais?` como último parámetro. `listar` mide `desde`/`hasta` con `inicioDelDiaEnUtc`/`inicioDelDiaSiguienteEnUtc` en la zona de la empresa de la key. Sin rango no lee la zona. Los dos composition roots (`app/api/ordenes/api-key/route.ts` y `orden/[id]/route.ts`) inyectan `construirReglasPaisEmpresa(prisma)`.
  - Analítica: `lib/api/analitica-integrador.ts` gana `reglasPais` en sus deps y exporta `zonaDelIntegrador(deps)`. La usan el borde (para cada `prepararConsultaAnalitica`) y el cascarón HTTP (para el «hoy» de `resolverRangoApiKey(pedido, ahora, zona)`). Las dos lecturas van a la memoria del marco de `conEmpresa`.
  - OpenAPI (`lib/api/openapi-spec.ts` y su espejo `docs/api/api-key-openapi.yaml`): «hora de Costa Rica (UTC-6)» pasa a «en la zona horaria del país de la empresa de la key», en los 5 textos. Entrada nueva en `docs/api/CHANGELOG.md` (2026-11-05, sin ruptura).
  - Las dos rutas importan `esFechaCalendarioValida` de `calendario-zona` en vez de `fecha-cr`.
- **Páginas de servidor.** `ordenes/page.tsx`, `recepcion-satelite/en-bodega/page.tsx` y `wallet/mensajeros/page.tsx` leen la zona con `zonaDelBorde()` y calculan ahí las fechas que bajan por props. Los componentes cliente no cambian. Para SLT-81 no falta nada del lado servidor de estas tres páginas.
- **Planes (decisión 1 tras T5.5).**
  - `plantillaCambioPlan` recibe `zona` (obligatoria) y pinta las tres fechas del correo en ella.
  - `crearPlanAvisoCorreoHandler` lee la zona de la empresa destino (`DepsAvisoCorreo.reglasPais`; `buildDepsAvisoCorreo` inyecta la real). La lee antes de enviar: sin zona, el trabajo falla sin mandar nada (R28).
  - `PlanesService.catalogo`: `vigenteDesdePendiente` en UTC con la etiqueta, `"AAAA-MM-DD UTC"`. No lee la zona de ninguna empresa.
  - Salen los dos marcadores `SLT-42 pendiente T7.1`.
- **Textos (decisión 2 tras T5.5).** «(hora de Costa Rica).» pasa a «(hora local).» en `aviso-interno`, `picking/informe`, `prueba-envio` y `transito/informe`. En `plantilla-datos.ts` («en hora de Costa Rica.» → «en hora local.»), en `fecha_asignacion` y `fecha_creacion`.
- **Chat y asistente (decisión 4 tras T5.5).**
  - `listarHiloChat` corta «hoy» con la zona de la empresa (`ChatWhatsappDeps.reglasPais`; sin él, la real). Solo la lee si hay hilo.
  - `AsistenteService` gana `reglasPais` en sus deps y cuenta el tope por el día de esa zona. Sin el puerto, o sin zona, falla antes de contar. `app/api/asistente/route.ts` inyecta la real (`AsistenteRouteDeps.reglasPais` para los tests).
- **Rastreo público (decisiones 1 y 2 tras T5.6).** El composition root (`lib/actions/rastreo-publico.ts`) construye el servicio por consulta, con el puerto vigilado.
  - Si `deLaEmpresa()` trae `telefono: null`, el servicio sigue respondiendo `no_encontrado`, y la action deja el aviso.
  - Si el servicio lanza `PaisSinZonaHoraria` (factor ya correcto), la action responde `no_encontrado`, igual que una guía inexistente, y deja el aviso.
  - El aviso va por `ErrorLogger` (por defecto `console.error`): `{ evento: "rastreo_publico_pais_incompleto", organizacionId, paisId, falta }`. No lleva guía, factor ni teléfono.
  - Cualquier otro error se relanza. `RastreoPublicoDeps.logger` es inyectable.
- **Marcadores.** Salen todos los `SLT-42 pendiente T5.7`: `analitica-integrador.ts`, `ApiOrdenLecturaService.ts` y `wallet/mensajeros/page.tsx`. Salen también los dos `T7.1`. Quedan 9, todos `T6`: `analitica-rollup-diario-handler.ts` (2), `scripts/demo-qa/receta.ts` (4), `scripts/rollup-analitica-manual.ts` (2) y `scripts/seed-jobs-analitica-rollup-diario.ts` (1).

### Desvíos y decisiones mías (a confirmar)
1. **Etiqueta «UTC» del catálogo dentro del valor.** `vigenteDesdePendiente` pasa de `AAAA-MM-DD` a `AAAA-MM-DD UTC`, así la UI la muestra («Desde 2026-11-15 UTC») sin tocar `PlanesModule.tsx`. El campo solo se pinta: nadie lo compara ni lo ordena.
2. **Guardia `asistente-sin-datos` (436/R3), lista blanca del borde.** Se añade `@/lib/services/ReglasPaisEmpresaService`, con su motivo. Del país solo sale una zona IANA, y nada viaja al proveedor. Por la misma guardia, `AsistenteService` no importa `zonaDeLaEmpresa` y repite su comprobación en línea.
3. **El aviso del rastreo es un objeto, no un texto.** La guardia `rastreo-frontera` prohíbe `console.*` en los módulos del rastreo, así que se usa `ErrorLogger`. `ConsoleErrorLogger` lo escribe con `console.error("[AppError:INTERNAL]", objeto)`.
4. **El servicio del rastreo sigue lanzando `PaisSinZonaHoraria`.** La traducción a `no_encontrado` vive en el composition root, que conoce la empresa.

### Tests
- Nuevos:
  - `tests/unit/api/hora-por-pais-api-key.test.ts` (6).
  - `tests/unit/whatsapp-envios/descripciones-hora-local.test.ts` (5).
- Casos nuevos:
  - `rastreo-publico-zona-pais.test.ts` (4, composition root).
  - `procesar-jobs-plan-cambio.test.ts` (3), `plantilla-cambio-plan.test.ts` (1), `planes-service-lecturas.test.ts` (1).
  - `chat-whatsapp-actions.test.ts` (2), `tope-diario.test.ts` (2), `analitica-api-key-rango.test.ts` (1).
- Adaptados al contrato (`reglasPaisFijas()`/`ZONA_DE_CR`, que con CR dan lo de antes):
  - Unitarios: `analitica-api-key-route`, `analitica-integrador-borde`, `api-orden-lectura-service.filtros-257`, `openapi-257-filtros-listado` (el texto nuevo), `plantilla-datos`, `acotamiento-por-rol`.
  - 8 de `tests/components` de las páginas de órdenes y bodega satélite (`vi.mock` de `zona-del-borde`).
  - Integración: `asistente-route`, `asistente-imagenes` y `planes-cambio-correos`.
- La guardia `asistente-sin-datos` cambia (desvío 2).

### Mapa R → test (T5.7)
| R | Test |
|---|---|
| R22 | `hora-por-pais-api-key.test.ts`: «el mismo `desde=hasta=2026-08-10` empieza a las 06:00Z en Costa Rica y a las 05:00Z en Bogota»; «el limite inferior del dia pedido es las 00:00 de Bogota…»; «por HTTP, sin `hasta`, «hoy» es el 3 en Costa Rica y el 4 en Bogota…». `analitica-api-key-rango.test.ts`: «el mismo instante es el 3 en Costa Rica y el 4 en Bogota». `plantilla-cambio-plan.test.ts`: «SLT-42 R22: la fecha se pinta en la zona del país de la empresa que cambia de plan». `procesar-jobs-plan-cambio.test.ts`: «SLT-42 R22: la fecha del correo sale en la zona del país de la empresa destino». `chat-whatsapp-actions.test.ts`: «SLT-42 R22: «hoy» es el de la zona del pais de la empresa (CR: ayer; Bogota: hoy)». `tope-diario.test.ts`: «el mismo instante cuenta en el día 3 en Costa Rica y en el día 4 en Bogotá». `planes-service-lecturas.test.ts`: «un instante que en Costa Rica aún es el 14 sale como el 15 UTC…» (catálogo). `descripciones-hora-local.test.ts` (textos) |
| R27 | `rastreo-publico-zona-pais.test.ts`: «pais sin prefijo o digitos de telefono: no_encontrado, como una guia inexistente, y console.error con la empresa»; «pais completo y factor errado: no_encontrado SIN aviso»; «otro error del servicio no se disfraza de no_encontrado» |
| R28 | `hora-por-pais-api-key.test.ts`: «R28: con rango y sin zona en el pais, falla con PaisSinZonaHoraria sin consultar el repositorio»; «R28: sin zona en el pais de la key, el borde falla…»; «sin rango de fechas no se lee la zona…». `procesar-jobs-plan-cambio.test.ts`: «SLT-42 R28: sin zona … el trabajo falla sin enviar ningún correo». `chat-whatsapp-actions.test.ts`: «SLT-42 R28: sin zona … el hilo falla con PaisSinZonaHoraria». `tope-diario.test.ts`: «sin zona en el país, falla … sin contar la consulta ni llamar al proveedor». Rastreo (decisión tras T5.6, en lugar del error de servidor): «pais sin zona horaria y factor correcto: no_encontrado (no un error de servidor) y console.error con la empresa» |

### Salida
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck`: exit 0, también tras el último arreglo.
- `eslint` de los 51 `.ts/.tsx` tocados (un lote): exit 0, 0 errores y 0 warnings.
- `pnpm test:guardias`: `Test Files 3 failed | 322 passed | 3 skipped (328) · Tests 6 failed | 4549 passed | 24 skipped (4579)`.
  - 4 son de `dependencias-declaradas-presentes`, en el baseline.
  - 1 es de `sin-estados-retirados`, por carga: aislada, en verde.
  - 1 era REAL: `asistente-sin-datos`, por el import nuevo de `AsistenteService` y del borde. Se arregló (desvío 2) y, aislada, da verde, junto con `sin-estados-retirados` y `tope-diario`: `3 passed (36 tests)`.
- Tests directos:
  - `tests/unit/api` + `api-orden-lectura-service*`: `43 passed (526)`.
  - Planes y correo: `4 passed (108)`.
  - Asistente, chat, plantillas y composition root de integraciones: `17 passed (360)`.
  - Rastreo y sus guardias: `9 passed (132)`.
  - Las 8 de `tests/components` de las páginas y `wallet-mensajeros-page`: `9 passed (101)`.
- `vitest related --run` sin `tests/components` ni `tests/integration`, en 5 lotes de 5:
  - lote 0: `4 passed (67)`;
  - lote 1: `11 passed (213)`;
  - lote 2: `46 passed (636)`;
  - lote 3: `115 passed (2052)`;
  - lote 4: `94 passed (1329)`.
- Integración contra base: la corre CI. Su typecheck pasa.
- Grafo MCP: no se usó; bastaron Grep y Read.

### Preguntas abiertas
1. **`plantilla-datos.ts` sigue formateando los instantes en CR.** `fechaHora` resta `CR_OFFSET_MS`, aunque la descripción ya dice «hora local». Pasarle la zona toca `resolverValoresPlantilla`, que también usa la vista previa del cliente (SLT-81). ¿Va a la lista de excepciones de T7.1 o a una task propia?
2. **Guía de integración** (`docs/api/guia-integracion/guia-integracion.html` §5, «hora de Costa Rica (UTC-6)») y la fila de 2026-08-31 del CHANGELOG: no se tocaron. La entrada nueva del CHANGELOG avisa de que la guía se actualiza con la release. ¿Quién la edita?
3. **¿Se acepta la etiqueta «UTC» dentro de `vigenteDesdePendiente`** (desvío 1), o se prefiere un campo aparte y el texto en la UI (SLT-81)?

Veredicto: T5.7 hecha, con los agregados a–e. La API por key, las páginas de servidor, los planes, el chat, el asistente y el rastreo usan la zona del país de la empresa, y R22, R27 y R28 tienen test. Typecheck, lint, guardias (salvo el baseline) y `vitest related` en verde.

## Tanda 5 · bloque 6: jobs y crons por zona (T6.1, T6.2, T6.3) y agregados del humano (2026-11-06)

Alcance: T6.1–T6.3 más las decisiones de la ficha «tras T5.7» (puntos 2 y 3) y los 9 marcadores `SLT-42 pendiente T6`. Fuera: bloque 7 (guardias T7.x) y «Pendiente para el cierre». Commits: 8bc4aca5 (T6.1, T6.2), 31ac7e78 (T6.3), 27b0388e (agregado b), 19f8f5bd (agregado c).

### Qué cambió
- **T6.1 · la cola agenda con las zonas.**
  - `RecurrenciaSpec.siguiente(now, zonas: readonly string[])` (`IJobQueueService`).
  - `JobQueueService` gana un último parámetro opcional, `zonasConEmpresas: () => Promise<readonly string[]>`. Lo lee como mucho una vez por `drenar`, y solo si algo se re-agenda. Sin él, `[]`.
  - Los composition roots (`procesar-jobs/route.ts > buildService` y `scripts/drenar-jobs.ts`) pasan `new PaisRepository(prisma).zonasConEmpresas()`.
  - `whatsapp_envio_mantenimiento` y `plan_cambios_vencidos` ignoran `zonas`, con un comentario.
- **T6.2 · series diarias por zona.** Módulo puro nuevo: `lib/services/jobs/serie-diaria-por-zona.ts`.
  - `proximaCorridaPorZona(now, zonas, {hora, minuto})` da el mínimo de `proximaHoraLocal` entre las zonas. Con empate gana la primera por orden alfabético.
  - Clave `<prefijo>:<zona>:<fecha>`, con `claveConZona` y `leerClaveConZona` (`null` = clave vieja).
  - `zonaLlegaALaHora(zona, instante, hora)` decide qué empresas entran en la corrida.
  - `liberar-reprogramadas-handler.ts`:
    - `HORA_LIBERAR` 00:00 y `proximaCorridaLiberar(now, zonas)` (sustituye a `proximaCorridaLiberarCR`).
    - `dedupeKeyLiberar(instante, zona)`.
    - El handler recibe `reglasPais?` como último parámetro. Lee la zona de la empresa y, si la corrida es de otra zona, no hace nada. Libera con `inicioDelDiaComoFecha(now, zona)`.
  - `analitica-rollup-diario-handler.ts`:
    - `HORA_ROLLUP` 00:30 y `proximaCorridaRollup(now, zonas)` (sustituye a `proximaCorridaRollupCR`).
    - El handler recibe `reglasPais?` como 5.º parámetro. `fechaObjetivo(now, zona)` usa la zona de la empresa. La clave lleva la fecha OBJETIVO, y el instante de la corrida es el día siguiente a las 00:30.
  - `analitica-rollup-diario-encolado.ts`: `dedupeKeyRollup(fecha, zona)`.
  - `procesar-jobs/route.ts` inyecta `construirReglasPaisEmpresa(getPrismaClient())` a los dos handlers.
  - Siembras:
    - `seedJobLiberarReprogramadas` y `seedJobAnaliticaRollupDiario` piden `(repo, now, zonas)` y encolan con la recurrencia: misma clave y mismo instante, sin duplicar la fórmula.
    - `Sembrador` gana `zonas`.
    - `sembrarJobsRecurrentesEnBase` y los `main` de los seeds leen `zonasConEmpresas()`.
- **T6.3 · crons.** De los crons de `vercel.json`, solo `liberar-reprogramadas` calculaba «hoy» fuera de la empresa (`startOfDayCR` una vez para todas). Ahora lo calcula dentro de `paraCadaEmpresa`, con la zona de cada una:
  - `LiberarReprogramadasDeps.reglasPais`; sin él, el real.
  - Sin zona, `PaisSinZonaHoraria` antes de liberar: esa empresa falla sola.
  - `corte-diario`, `generar-gastos-fijos`, `avisos-diarios`, `aviso-reparto-manana` y `snapshot-ranking` ya lo hacían desde T5.3–T5.5.
  - `procesar-devueltas-sla` y las purgas usan ventanas en ms, no días.
- **Marcadores (los 9).**
  - `analitica-rollup-diario-handler.ts` (2) y `seed-jobs-analitica-rollup-diario.ts` (1): arriba.
  - `scripts/demo-qa/receta.ts` (4): lee una vez la zona de la empresa de la demo (`conEmpresa(org, …zonaHoraria())`) y la usa para «hoy» y las cuatro fábricas de schema.
  - `scripts/rollup-analitica-manual.ts` (2): recorre las empresas con `paraCadaEmpresa`, como el job diario. Cada una usa la zona de su país. La lógica, `correrRollupManual(deps)`, se exporta y es inyectable.
- **Agregado b (`plantilla-datos.ts`).**
  - `fechaHora(v, zona)` usa `fechaCalendario` + `horaDePared` de `calendario-zona` (sin dependencias, vale en el navegador). Sale `CR_OFFSET_MS`.
  - `CampoPlantilla` gana `usaZona?` (en `fecha_asignacion` y `fecha_creacion`) y `transform(valor, zona?)`.
  - `valorDeCampo(clave, datos, zona?)` y `resolverValoresPlantilla(variables, datos, zona?)`.
  - `necesitaZona(variables)` nuevo: la zona solo se lee si la plantilla pinta una fecha con hora. Si hace falta y no llega, lanza; sin instante devuelve `""`.
  - Los llamadores:
    - `enviarPlantillaChat` (`deps.reglasPais` o el real) y el reintento de plantilla de `ChatWhatsappService` (`deps.reglasPais`).
    - `whatsapp-bienvenida-handler` (`WhatsappBienvenidaDeps.reglasPais`, real en `buildWhatsappBienvenidaDeps`).
    - La vista previa «así lo verá el cliente»: `previewConEjemplos(cuerpo, zona?)` y `PlantillaMensajeService.preview`, con `PlantillaInformeDeps.reglasPais`; `lib/actions/plantillas.ts` inyecta el real.
  - El composer del chat en el dispositivo (`ChatConversacion` → `datosPlantillaDesdeAsignacion`) no cambia: el DTO no trae fechas, así que no hay nada que pintar con hora.
- **Agregado c.** En `guia-integracion.html` §4.5 «Fechas y horas» (la cita era «§5»; la línea está en §4.5), «hora de Costa Rica (UTC-6)» pasa a «zona horaria del país de la empresa (hoy Costa Rica, UTC-6)». La advertencia de abajo y la lista de comprobación (§4.5, «UTC-6») no se tocaron (pregunta 4).

### Desvíos y decisiones mías (a confirmar)
1. **Empate de zonas** (dos zonas que llegan a la hora en el mismo instante, p. ej. CR y Guatemala). El design dice que el handler compara la zona de la empresa con la de la corrida. Si fuera igualdad literal, la segunda zona no correría nunca: la siguiente corrida ya es la de mañana. La regla queda así: entra la empresa cuya zona marca la hora objetivo en el instante de la corrida (`zonaLlegaALaHora`). Una zona igual siempre cumple. Test «empate…».
2. **Sin zonas** (ningún país con empresas tiene zona). El design no lo cubre. La serie no puede morir (nadie la re-sembraría hasta el siguiente despliegue), así que se agenda en `"UTC"` (`ZONA_SIN_EMPRESAS`): esa corrida no procesa ninguna empresa con zona, y una sin zona falla sola (R28).
3. **Rollup sembrado entre las 00:00 y las 00:30 CR.** La fórmula vieja saltaba a la corrida de mañana, y el D−1 de ese día no se agregaba. `proximaHoraLocal` da la de hoy. Con la serie en marcha nada cambia: re-agenda siempre después de las 00:30. Test «rollup entre las 00:00 y las 00:30 CR…».
4. **`rollup-analitica-manual.ts`.** El tope de R39 depende de la zona, así que ahora se comprueba dentro de cada empresa, antes de escribir. Antes de conectar solo se rechaza una fecha mal formada. Una empresa rechazada o fallida no frena a las demás, y el script sale con código 1.
5. **Plantillas: zona perezosa.** Solo se lee si una variable la usa (`necesitaZona`). Así un país sin zona no rompe el envío de plantillas sin fechas (R28: «la operación que la necesite»).

### Tests
- Nuevos:
  - `tests/unit/services/jobs/recurrencia-por-zona.test.ts` (31 casos).
  - `tests/unit/plantillas/preview-fecha-hora-zona.test.ts` (3).
  - `tests/integration/db/hora-por-pais-dos-empresas.test.ts` (2; lo corre CI).
- Casos nuevos: `plantilla-datos.test.ts` (4) y `chat-whatsapp-actions.test.ts` (2).
- Adaptados a la firma o a la clave con zona (con CR dan los mismos instantes):
  - Unitarios: `liberar-reprogramadas-handler`, `analitica-rollup-handler`, `cache-invalidacion-job`, `procesar-jobs-registro(-envios)`, `procesar-jobs-plan-cambio`, `crons-sin-empresas` (`reglasPais` en los deps), `campos-ocultos-siguen-resolviendo`, `preview-mismo-motor` y las guardias `jobs-recurrentes-con-siembra` y `tablero-dia/frontera` (ver Salida).
  - Integración: `liberar-reprogramadas-route`, `job-tipo-analitica-rollup-migration`, `siembra-liberar-reprogramadas-idempotente`, `siembra-whatsapp-envio-mantenimiento-idempotente` y `planes-cambio-programado`.

### Mapa R → test (bloque 6 y agregados)
| R | Test |
|---|---|
| R22 | `plantilla-datos.test.ts`: «SLT-42 R22: el `timestamp` se pinta en la zona del pais de la empresa…», «…con horario de verano… (Madrid)». `chat-whatsapp-actions.test.ts`: «SLT-42 R22: la fecha con hora sale en la zona del pais de la empresa (CR: el 25; Bogota: el 26)». `preview-fecha-hora-zona.test.ts`: «R22: el mismo ejemplo (14:15 UTC) es 08:15 en Costa Rica y 09:15 en Bogota» |
| R23 | `recurrencia-por-zona.test.ts`: «con horario de verano (Madrid), la corrida es a las 00:00 locales reales en invierno y en verano» |
| R24 | `hora-por-pais-dos-empresas.test.ts` (integración): «R24/R28: el cron calcula «hoy» con la zona del pais de cada empresa; la que no tiene zona falla sola». `recurrencia-por-zona.test.ts`: «la clave vieja corre para TODAS las empresas, cada una con su «hoy» local» |
| R25 | `recurrencia-por-zona.test.ts`: «la serie alterna Bogota (05:00 UTC) y CR (06:00 UTC), cada dia»; «la corrida de Bogota no toca la empresa de CR…»; «rollup: la corrida de Bogota agrega el D-1 de Bogota y no toca CR»; «empate (CR y Guatemala…)»; «sin zonas…»; los 4 de «T6.1 — la cola lee las zonas…». Integración: «R25: las zonas con empresas salen de la base, la serie agenda Bogota primero…» |
| R26 | `recurrencia-por-zona.test.ts`: «liberar desde %s: las 00:00 CR de antes (06:00 UTC)» (7 instantes), «rollup desde %s: las 00:30 CR de antes» (5), «la clave nueva lleva la zona…», «cada empresa se procesa una sola vez por dia local: tres dias…», «la vieja y la nueva en el mismo instante…», «rollup con la clave vieja…» |
| R28 | `recurrencia-por-zona.test.ts`: «el handler falla con PaisSinZonaHoraria antes de llamar al servicio»; «dentro de la serie (conSuEmpresa), la empresa sin zona falla y las demas corren; el job falla despues». `plantilla-datos.test.ts`: «SLT-42 R28: una fecha con hora sin zona lanza…». `chat-whatsapp-actions.test.ts`: «SLT-42 R28: sin zona en el pais y con una fecha con hora, falla sin enviar; sin fechas, no lee la zona». `preview-fecha-hora-zona.test.ts`: «R28: sin zona en el pais…». Integración (R24/R28, arriba) |
| R31 | `hora-por-pais-dos-empresas.test.ts`: dos empresas en dos países (XA Bogotá y CR) y una tercera sin zona, con `PaisRepository` y `ReglasPaisEmpresaService` reales |

### Salida
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck`: exit 0, también tras el último cambio.
- `eslint` de los 43 `.ts` tocados (un lote): 0 errores. Queda 1 warning `no-unused-vars` (`_job`) que ya estaba en `whatsapp-envio-mantenimiento-handler.ts`.
- `pnpm test:guardias`, primera corrida: `Test Files 3 failed | 322 passed | 3 skipped · Tests 6 failed | 4549 passed`.
  - 4 son de `dependencias-declaradas-presentes`, en el baseline.
  - 2 eran REALES:
    - `tablero-dia/frontera` (a): su comprobación de que el detector no es vacío apuntaba a `startOfDayCR` en `liberar-reprogramadas-handler.ts`, el último consumidor, que T6.2 retira. Ahora apunta a la declaración de `fecha-cr.ts` y afirma que el handler ya no la usa.
    - `impresion-flujo` R32: el helper `reglasDe` del test de integración nuevo coincidía con la firma del parser CSS. Se renombró a `reglasDelPaisEn`.
- `pnpm test:guardias`, corrida final: `Test Files 1 failed | 324 passed | 3 skipped (328) · Tests 4 failed | 4551 passed | 24 skipped (4579)`. Solo quedan los 4 del baseline.
- Tests directos:
  - Nuevo y tocados de jobs: `recurrencia-por-zona` + `procesar-jobs-registro(-envios)` + `crons-sin-empresas` + `procesar-jobs-plan-cambio` + `jobs-recurrentes-con-siembra` + los 3 de `job-queue-service*` + `jobs-registro`: `10 passed (168)`.
  - Handlers y plantillas: `liberar-reprogramadas-handler`, `analitica-rollup-handler`, `cache-invalidacion-job`, `plantilla-datos`, `tests/unit/plantillas`: `17 passed (384)`.
  - Chat y vista previa: `chat-whatsapp-actions` + `preview-fecha-hora-zona`: `2 passed (58)`.
- `vitest related --run` sin `tests/components` ni `tests/integration`, en 5 lotes de ≤5 archivos de producción:
  - lote 1 (`serie-diaria-por-zona`, `IJobQueueService`, `JobQueueService`, `jobs-cambio-plan`, mantenimiento): `59 passed (895)`;
  - lote 2 (encolado y handlers del rollup y de liberar, `procesar-jobs/route`, `liberar-reprogramadas/route`): `51 passed (773)`;
  - lote 3 (`plantilla-datos`, `plantilla-mensaje`, `PlantillaMensajeService`, `actions/plantillas`, `actions/chat-whatsapp`): `90 passed (1330)`;
  - lote 4 (`ChatWhatsappService`, bienvenida, rollup manual, los dos seeds): `20 passed (344)`;
  - lote 5 (`siembra-jobs-recurrentes`, `drenar-jobs`, `demo-qa/receta`): `4 passed (108)`.
- Integración contra base: la corre CI. Su typecheck pasa, también la del test nuevo y las 5 adaptadas.
- Grafo MCP: no se usó; bastaron Grep y Read.

### Marcadores
Quedan 0 `SLT-42 pendiente` en `lib/`, `app/` y `scripts/` (T6: 0; T5.x: 0; T7.x: 0).

### Preguntas abiertas
1. **Corrida retrasada con varias zonas.** `siguiente(now, zonas)` cuenta desde el `now` del drenado, no desde el instante de la corrida. Si la corrida de una zona se retrasa por backoff hasta pasar la hora de la siguiente zona, esa zona se salta un día. Con una sola zona no pasa. ¿Se acepta mientras haya un solo país, o se pasa el `runAfter` original a `siguiente` (cambio de firma respecto del design)?
2. **¿Se acepta el empate por «hora de pared en el instante»** (desvío 1) y la serie en `"UTC"` sin zonas (desvío 2)?
3. **`rollup-analitica-manual.ts`.** ¿Se acepta que el tope de R39 se compruebe por empresa, después de conectar (desvío 4)?
4. **Guía de integración.** Quedan dos menciones a «UTC-6» en §4.5 (la advertencia sobre mezclar sistemas y la fila de la lista de comprobación). ¿Pasan también a «la zona del país de la empresa»?

Veredicto: bloque 6 hecho (T6.1–T6.3) con los agregados b y c y sin marcadores `SLT-42 pendiente`. Los jobs diarios se agendan por zona y procesan solo las empresas de su zona; con CR, en los mismos instantes. Los crons y las plantillas usan la zona del país de cada empresa. R22–R26, R28 y R31 tienen test. Typecheck, lint, guardias (salvo el baseline) y `vitest related` en verde; la integración la corre CI.

## Mapa R → test completo (T7.3, 2026-11-06)

Las 31 R de `requirements.md`. Rutas bajo `tests/`. «(int)» = integración contra Postgres, la corre CI. El detalle de cada caso está en el mapa de su tanda (arriba).

| R | Test |
|---|---|
| R1 | `integration/db/migracion-slt42-ida-y-vuelta.test.ts` (CR con 506 / 8 / `America/Costa_Rica`) (int); `integration/db/pais-repositorio.test.ts` «SLT-42 (R1, R3)» (int) |
| R2 | `integration/db/tipo-documento-por-pais.test.ts` «R2: la regla del tipo se valida en la base…» (int) |
| R3 | `integration/db/migracion-slt42-ida-y-vuelta.test.ts` (5 tipos de CR) (int); `pais-repositorio.test.ts` «SLT-42 (R1, R3)» (int) |
| R4 | `integration/db/tipo-documento-por-pais.test.ts` «R4: sin empresa…», «R4: una empresa recibe 42501…» (int) |
| R5 | `unit/services/usuario-service-pais.test.ts` «R5: …»; `integration/db/tipos-identificacion-por-pais.test.ts` «R5: el WHERE…», «R5, R31: por el servicio…» (int) |
| R6 | `unit/services/organizacion-service-pais.test.ts` «R6: un país %s rechaza…», «R6: un país que no existe…», «R6: el país incompleto se rechaza antes…» |
| R7 | `integration/db/migracion-slt42-ida-y-vuelta.test.ts`: filas viejas idénticas; el down aborta con DIMEX y con un repetido (int) |
| R8 | `integration/db/migracion-slt42-ida-y-vuelta.test.ts`: foto de `usuario` antes y después idéntica; bajar y volver a subir da la misma foto (int) |
| R9 | `unit/services/usuario-service-pais.test.ts`: los tres «R9: …» |
| R10 | `unit/utils/documento.test.ts`; `unit/services/usuario-service-pais.test.ts` «R10: …» (5); `unit/services/postulacion-mensajero-service-pais.test.ts` «R10: …»; `unit/services/organizacion-service-pais.test.ts` «R10: …» |
| R11 | `unit/services/usuario-service-pais.test.ts` «R11: …» (5); `postulacion-mensajero-service-pais.test.ts` «R11: …»; `organizacion-service-pais.test.ts` «R11: …»; `integration/db/tipo-documento-por-pais.test.ts` (int) |
| R12 | `unit/services/usuario-service-pais.test.ts`: los dos «R12: …» |
| R13 | `integration/db/tipo-documento-por-pais.test.ts` «R13, R31: único por empresa y tipo…» (int); `integration/db/postulacion-documento-por-tipo.test.ts` «R13: …» (int); `postulacion-mensajero-service-pais.test.ts` «R13: …» |
| R14 | `unit/validacion/telefono.test.ts`; `usuario-service-pais.test.ts` «R14…» (4); `postulacion-mensajero-service-pais.test.ts` y `organizacion-service-pais.test.ts` «R14: …» |
| R15 | `usuario-service-pais.test.ts` «R15: …» (2); `postulacion-mensajero-service-pais.test.ts` y `organizacion-service-pais.test.ts` «R15: …» |
| R16 | `unit/validacion/telefono.test.ts` (`XA` → `pais_sin_reglas`); un «R16: …» en usuario, postulación (recibir y aprobar) y alta de empresa |
| R17 | `unit/services/usuario-service-superadmin.test.ts`: los cuatro «R17: …» |
| R18 | `unit/utils/telefono-pais.test.ts` (tabla de CR congelada); `unit/services/chat-whatsapp-telefono-por-pais.test.ts` (país `999`/7) |
| R19 | `integration/db/chat-entrante-telefono-cr.test.ts` «R19: `sqlNormalizarTelefono` y `normalizarTelefono` producen EL MISMO texto…» (int) |
| R20 | `unit/utils/telefono-pais.test.ts`; `unit/services/ejecucion-envio-prueba.test.ts` «SLT-42 R18/R20…»; `unit/whatsapp-envios/telefono.test.ts` |
| R21 | `unit/utils/telefono-pais.test.ts`; `chat-whatsapp-telefono-por-pais.test.ts` «R21: con Costa Rica…» |
| R22 | `unit/utils/calendario-zona.test.ts`; `unit/utils/utilidades-por-zona.test.ts`; `unit/services/hora-por-pais-analitica-avisos.test.ts`; `unit/api/hora-por-pais-api-key.test.ts`; `unit/services/historico-conversaciones-service.test.ts` «R22: con fechas, la zona del pais llega al repositorio…» (tanda 6) |
| R23 | `unit/utils/calendario-zona.test.ts` (Madrid en sus dos cambios); `utilidades-por-zona.test.ts` «R23: …»; `recurrencia-por-zona.test.ts` «con horario de verano (Madrid)…»; `historico-conversaciones-service.test.ts` «R22/R23: las cotas del SQL…» |
| R24 | `integration/db/hora-por-pais-dos-empresas.test.ts` «R24/R28: el cron calcula «hoy» con la zona del pais de cada empresa…» (int); `hora-por-pais-analitica-avisos.test.ts` (avisos diarios, snapshot del ranking) |
| R25 | `unit/services/jobs/recurrencia-por-zona.test.ts` «la serie alterna Bogota y CR…», «la corrida de Bogota no toca la empresa de CR…», «corrida retrasada por reintentos: cuenta desde su instante original…» (tanda 6) |
| R26 | `recurrencia-por-zona.test.ts` «liberar desde %s: las 00:00 CR de antes» (7), «rollup desde %s…» (5), «la clave vieja corre para TODAS las empresas…» |
| R27 | `unit/services/rastreo-publico-zona-pais.test.ts` «el mismo instante se publica a las 21:30 -06:00 en Costa Rica y a las 22:30 -05:00 en Bogota» |
| R28 | `reglas-pais-empresa-service.test.ts` «zonaHoraria() lanza PaisSinZonaHoraria…»; `recurrencia-por-zona.test.ts` «el handler falla con PaisSinZonaHoraria…»; `historico-conversaciones-service.test.ts` «R28: sin zona en el pais…»; los «R28» de T5.3–T5.7 |
| R29 | `unit/guards/pais-sin-literales.guardia.test.ts` «ningun archivo de servidor fuera de la lista tiene un literal del pais» y su autocomprobación (11 casos que fallan, 6 que no) |
| R30 | `unit/services/reglas-pais-empresa-service.test.ts` «dos contextos seguidos…», «dos contextos a la vez…»; «R30: la misma instancia atiende a dos empresas seguidas…» (CorteDiario, tablero) |
| R31 | `integration/db/tipo-documento-por-pais.test.ts`, `tipos-identificacion-por-pais.test.ts` y `hora-por-pais-dos-empresas.test.ts` (CR y `XA`, con `PaisRepository` y `ReglasPaisEmpresaService` reales) (int) |

Ninguna R sin test. Las de integración están escritas y compilan; las corre CI (`gate-completo`).

## Tanda 6 · ajustes + bloque 7 (2026-11-06)

Alcance: los tres ajustes pendientes de la ficha «tras bloque 6» (puntos 2, 3 y 6) y el bloque 7 (T7.1–T7.3), con el agregado de T7.1 de la ficha «tras T5.3» (punto 1). Fuera: «Pendiente para el cierre». Commits: 34c92716 (ajustes), c851c550 (T7.1), 71ec7844 (T7.2), ac7fb762 (T7.3).

### Archivos
- Ajustes: `lib/services/jobs/serie-diaria-por-zona.ts` (`AVISO_SIN_ZONAS`, `corridaOriginalDeLaClave`), `lib/interfaces/services/IJobQueueService.ts` (`RecurrenciaSpec.corridaOriginal?`, `siguiente(desde, zonas)`), `lib/services/JobQueueService.ts` (`JobsLogger.error?`), los dos handlers diarios, `scripts/siembra-jobs-recurrentes.ts`, `docs/api/guia-integracion/guia-integracion.html` (§4.5), `tests/unit/services/jobs/recurrencia-por-zona.test.ts`.
- T7.1: `tests/unit/guards/pais-sin-literales.guardia.test.ts` y `_pais-sin-literales-excepciones.ts` (nuevos); `lib/services/HistoricoConversacionesService.ts`, `lib/repositories/HistoricoConversacionesRepository.ts`, `lib/interfaces/repositories/IHistoricoConversacionesRepository.ts`, `lib/actions/historico-conversaciones.ts`, `lib/actions/ranking-historico.ts`; tests `unit/services/historico-conversaciones-service.test.ts` y `integration/repositories/historico-conversaciones.int.test.ts`.
- T7.2: `docs/architecture.md` (País por empresa, sub-bullet «Teléfono, documento y hora (SLT-42)»). `.env.example` ya no tenía `RASTREO_PUBLICO_ZONA_HORARIA`.
- T7.3: mapa completo (sección anterior) y `tasks.md` (T5.7, T6.1–T6.3 y T7.1–T7.3 marcadas).

### Qué cambió
- **Sin zonas (punto 2).** Las series diarias siguen en `"UTC"`. La cola deja `AVISO_SIN_ZONAS` por `JobsLogger.error` (por defecto `console.error`), una vez por `drenar` y solo si se re-agenda una serie por zona. La siembra del build (`sembrarJobsRecurrentesEnBase`) deja el mismo texto. Sin datos de clientes: ni empresa ni país.
- **Corrida retrasada (punto 3).** `RecurrenciaSpec` gana `corridaOriginal?(job)`, que solo implementan las dos series diarias. Sale de la clave con zona (`<prefijo>:<zona>:<fecha>`), no de `job.runAfter`, porque un reintento con backoff pisa `run_after`. En el rollup la clave lleva el objetivo D−1, así que la corrida es D a las 00:30. La cola llama a `siguiente(corridaOriginal ?? now, zonas)`. Con una clave vieja o sin clave se usa `job.runAfter`. Las recurrencias que no son por zona siguen contando desde el drenado.
- **Guía §4.5 (punto 6).** La advertencia y la fila de la lista de comprobación dicen «zona horaria del país de la empresa (hoy Costa Rica, UTC-6)».
- **T7.1 · R29.** La guardia recorre `lib/**`, `app/api/**` y `page`/`layout` de `app/`, sin comentarios. Busca la zona de CR, `CR_OFFSET*`/`OFFSET_CR*`, `6*60*60*1000` junto a `CR`, `T06:00:00`, el `506` como literal y los imports de los envoltorios `*-cr`. Hay 6 excepciones (tope 6): `fecha-cr`, `hora-cr`, `separador-dia-cr`, `telefono-cr` y `whatsapp-telefono` (SLT-81), y `sinpe-cr` (SL-22). Comprobado: un literal nuevo en `lib/` la pone en rojo (revertido).
- **T7.1 · composition roots (agregado).** Con el AST de TypeScript, la guardia busca dos cosas en `lib/`:
  - las clases con `reglasPais` opcional en el constructor (más de 50);
  - las funciones exportadas con `reglasPais` opcional posicional que no construyen el real (los dos `crear*Handler` diarios y `notificarWebhookSuscripcionPausadaCon`).

  En `lib/`, `app/` y `scripts/`, cada `new`/llamada de producción tiene que pasar el argumento, sin `undefined`, y su archivo tiene que llamar a `construirReglasPaisEmpresa(`. `zonaDelBordeConActor` queda declarada como «delega en el real». Comprobado: un `new HistoricoConversacionesService(repo)` de prueba la pone en rojo (revertido).
  - `CajaBackfillTesoreriaService` lleva `reglasPais` en `deps`, no en el constructor, y `PlanesService` usa `zonaDeOrganizacionCon`: ninguno entra en el censo, como decidió el humano.
  - Los `deps.reglasPais?` de actions y handlers (con el real por defecto dentro) no entran.
- **Huecos que la guardia destapó.** Arreglados porque el design §4.3 ya lo decide:
  - `HistoricoConversacionesRepository` calculaba el rango de fechas con `inicioDelDiaCREnUtc`. Ahora `ListarHilosQuery.zona?` lleva la zona, que el servicio lee solo si hay rango (`zonaDeLaEmpresa`, R28). El action inyecta el real. Sin zona y con rango, el repositorio lanza.
  - `ranking-historico.ts` importaba `esFechaCalendarioValida` de `fecha-cr`; ahora la importa de `calendario-zona` (es la misma función).

### Desvíos y decisiones mías (a confirmar)
1. **`PENDIENTES_DE_DECISION_SLT42` (5 archivos, tope 5).** Son archivos de servidor con CR fijo que el spec no resuelve sin decidir (preguntas 1 y 2). Para no dejar el gate en rojo, la guardia los deja pasar en una lista aparte, que no es de excepciones de R29 y solo puede bajar. Si el humano prefiere la guardia en rojo hasta decidir, basta con vaciar esa lista.
2. **`corridaOriginal` como método opcional de `RecurrenciaSpec`**, en vez de cambiar la firma de `siguiente` para todas las recurrencias. Así `whatsapp_envio_mantenimiento` y `plan_cambios_vencidos` no cambian de comportamiento.
3. **Recuperación tras una caída larga.** Como `siguiente` cuenta desde la corrida original, tras días sin drenar la serie recorre una corrida por zona y día hasta ponerse al día. Cada una es idempotente por empresa y día, y el `rollup` agrega la fecha objetivo de `now`, así que repite el mismo día. Con el tope de backoff de hoy, un reintento no retrasa más de horas.

### Tests
- Nuevos en `recurrencia-por-zona.test.ts` (5): «corrida retrasada por reintentos: cuenta desde su instante original y no salta la zona siguiente», «rollup retrasado: la corrida original sale de la clave…», «clave vieja, sin zona: la corrida original es `runAfter`…», «sin zonas con empresas: … deja UN error en el log por corrida…», «con zonas, la cola no deja error…».
- Adaptado: «con las zonas reales en la cola…» (el job sin clave lleva `runAfter` = el `now` de antes).
- Nuevos en `historico-conversaciones-service.test.ts` (4): R22, R22/R23 (CR, Bogotá y Madrid), R28 y «un rango sin zona en el repositorio falla…».
- Nueva: `pais-sin-literales.guardia.test.ts` (35 casos).

### Salida
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck`: exit 0, tras los ajustes y tras T7.1. T7.2 y T7.3 solo tocan docs.
- `eslint` de los `.ts` tocados (2 lotes): sin salida (0 errores, 0 warnings).
- `pnpm test:guardias` entera: `Test Files 1 failed | 325 passed | 3 skipped (329) · Tests 4 failed | 4586 passed | 24 skipped (4614)`. Los 4 son de `dependencias-declaradas-presentes`, en el baseline.
- Tests de las R (unitarios): 10 archivos de teléfono y documento, `195 passed`; 9 de hora, rastreo, reglas, histórico y la guardia, `173 passed`.
- Jobs: `tests/unit/services/jobs` + `job-queue-service*` + `procesar-jobs-registro` + `cron/` + handlers + `analytics/backfill-guards` y `cache-invalidacion-backfill`: `155 passed`.
- `vitest related --run` sin `tests/components` ni `tests/integration`:
  - lote 1 (serie, cola, interfaz y los dos handlers): `58 passed (885)`;
  - lote 2 (siembra y los 4 del histórico): `2 passed (43)`;
  - lote 3 (`ranking-historico`): `1 passed (17)`.
- `node scripts/check-perfil.mjs`: «6/6 docs revisados en los ultimos 60 dias».
- No corridos: `./init.sh` (el leader pidió la lista de arriba) y la integración, que corre CI (`historico-conversaciones.int` cambia: pasa `zona`).
- Grafo MCP: no se usó; bastaron Grep, Read y dos censos con el AST.

### Preguntas abiertas
1. **Planes (`lib/planes/ciclo.ts`, `cobro.ts` y `consumo.ts`).** Usan la «hora de la plataforma» fija en CR (P8 de SL-24) para:
   - el rango y la fecha por defecto del inicio del ciclo;
   - el ancla de una fecha elegida;
   - el siguiente cobro;
   - la fecha del reinicio y del cambio pendiente.

   El design (§0) dice «SL-24 ciclo en UTC: no se toca», pero R29 no los deja en el servidor y su lista de excepciones solo admite SLT-81 y SL-22. ¿Pasan a la zona de la empresa en SLT-42, van a la lista con otra ficha (¿SL-21?) o se cambia R29?
2. **`ConteoCargadasPorDiaRepository` y `FinanzasDiarioRepository`** (y `CohorteCargaRepository`, que importa `DIA_CR`). Agrupan por día en SQL con un desfase fijo de CR que pasa como parámetro, y la regla de esos archivos prohíbe `AT TIME ZONE`. Un desfase calculado con la zona de la empresa vale para países sin horario de verano, pero en uno con horario de verano un rango que cruce el cambio agrupa mal una hora (R23). ¿Desfase de la zona leído en un instante dado (¿cuál?), `AT TIME ZONE` con la zona como parámetro (se rompe la regla de la 180), o se queda en CR con ficha propia?
3. **`lib/utils/whatsapp-telefono.ts`** no tiene consumidores de producción, solo sus tests. ¿Se borra (y sale de la lista) o se deja como envoltorio para SLT-81?
4. ¿Se aceptan los desvíos 1–3?

Veredicto: los ajustes del bloque 6 y el bloque 7 (T7.1–T7.3) están hechos. La guardia R29 y la de los composition roots están en verde y se ponen en rojo con un caso real. Las 31 R tienen test. Quedan sin marcar solo T1.0 (la hace una persona) y 5 archivos pendientes de decisión (preguntas 1 y 2).

## Tanda 7 · decisiones bloque 7 (2026-11-06)

Alcance: las decisiones del humano «tras bloque 7» (`progress/features/SLT-42.md > Decisiones`, puntos 1–4) y la sección «Errores nuevos y prevención» de «Pendiente para el cierre». Commits: 94f8a5dc (`AT TIME ZONE` parametrizado, incluye las decisiones en la ficha), b06000e7 (planes a SLT-86, hoy SLT-90, borra `whatsapp-telefono`, retira los pendientes) y el de registro.

### Archivos
- `AT TIME ZONE`: `lib/analytics/entregas-conteo.ts` (`ConsultaConteoEntregas.zona`), `lib/repositories/ConteoCargadasPorDiaRepository.ts` (`DIA_CR` → `diaDeCargaEnZona(zona)`), `lib/repositories/CohorteCargaRepository.ts`, `lib/repositories/FinanzasDiarioRepository.ts` (`diaDelMovimientoEnZona(zona)`; `sumarPorDia(desde, hasta, zona)`), `lib/interfaces/repositories/IFinanzasDiarioRepository.ts`, `lib/services/FinanzasDiarioService.ts`, `docs/architecture.md`. Tests: `tests/unit/analytics/conteo-cargadas-servicio.test.ts`, `tests/unit/analytics/finanzas-diario.test.ts`, `tests/integration/db/dia-en-zona-sql.test.ts` (nuevo), `tests/integration/db/liquidacion-fechas-cr-461.test.ts` y `wallet-fecha-elegida.test.ts` (pasan `ZONA_DE_CR`).
- Planes, `whatsapp-telefono` y pendientes: `tests/unit/guards/_pais-sin-literales-excepciones.ts`, `tests/unit/guards/pais-sin-literales.guardia.test.ts`, `tests/unit/utils/telefono-pais.test.ts`; borrados `lib/utils/whatsapp-telefono.ts` y `tests/unit/utils/whatsapp-telefono.test.ts`; `specs/SLT-42-…/requirements.md` (R29), `design.md` (§8 y desvíos 5–7), `tasks.md` (nota de la tanda 7 en T7.1).

### Qué cambió
- **a · Planes.** `lib/planes/ciclo.ts`, `cobro.ts` y `consumo.ts` pasan a `EXCEPCIONES_PAIS_SIN_LITERALES` con la ficha `SLT-86` (al cierre, `SLT-90`) y su motivo; su código no cambia. `FichaQueLoRetira` y la guardia admiten esa ficha. R29 los nombra con la fecha y «decisión del humano».
- **b · Día por zona en SQL.** Los tres repositorios agrupan con `to_char(((col AT TIME ZONE 'UTC') AT TIME ZONE $n::text)::date, 'YYYY-MM-DD')`. `$n` es la zona del país de la empresa, como parámetro y nunca interpolada. La columna es `timestamp` sin zona con el reloj de pared UTC: el primer `AT TIME ZONE` la vuelve instante y el segundo da la hora local con su horario de verano (R23). La zona llega en `ConsultaConteoEntregas.zona` (la misma con la que `prepararConteoEntregas` resuelve el rango) y como tercer argumento de `sumarPorDia`. La cache no cambia: ya es por empresa. La regla de esos archivos ahora dice «no se escribe ninguna zona ni desfase» en vez de «no hay `AT TIME ZONE`», y los tests que la vigilan exigen `AT TIME ZONE $n::text` con la zona entre los valores, sin `America|Costa_Rica` ni `interval` en el texto.
- **c · `whatsapp-telefono.ts` borrado.** Grep sobre `lib`, `app`, `components`, `scripts`, `e2e` y `tests`: solo lo importaban su test y `telefono-pais.test.ts` (quitado de ahí). Sale de la lista de excepciones.
- **d · `PENDIENTES_DE_DECISION_SLT42` retirada.** Quedó vacía tras a–c; se borraron la lista, su tope y sus aserciones en la guardia.

### Desvíos y decisiones mías (a confirmar)
1. **El tope de excepciones sube de 6 a 8.** «La lista solo baja», pero la decisión del humano mete 3 archivos y saca 1. Queda anotado en la cabecera del archivo de excepciones.
2. **La zona viaja dentro de `ConsultaConteoEntregas`**, no como argumento aparte de `contarCargadasPorDia`/`contarCohortes`: es la zona con la que ya se resolvió el rango de la misma consulta, y así las dos lecturas no pueden recibir zonas distintas.
3. **`'UTC'` escrito en el SQL.** Es el reloj de pared guardado, no la zona de un país (como `now() AT TIME ZONE 'UTC'` en `docs/architecture.md`).

### Tests
- `conteo-cargadas-servicio.test.ts`: «el SQL agrupa con `AT TIME ZONE` parametrizado y no escribe ninguna zona ni desfase» (sustituye al de «no nombra ninguna zona») y «con una empresa en otra zona, la zona que viaja es la suya (R22)».
- `finanzas-diario.test.ts`: «agrupa por día con `AT TIME ZONE` parametrizado, sin escribir ninguna zona», la zona en «pide los últimos 30 días de Costa Rica» y «con una empresa en otra zona, la ventana y la zona del agrupamiento son las suyas (R22, R23)» (Nueva York el 2026-03-08, día de 23 h).
- `dia-en-zona-sql.test.ts` (integración, Postgres real): los dos fragmentos sobre filas `VALUES` en Nueva York los días de 23 h (2026-03-08) y 25 h (2026-11-01) y en CR; coincide con `fechaCalendario`; el día de 25 h agrupa en una fila; una zona inventada con comilla la rechaza Postgres. Un caso sin base comprueba que los casos marcados fallan con un desfase fijo.

### Mapa R → test (esta tanda)
| R | Test |
|---|---|
| R22 | `conteo-cargadas-servicio.test.ts` «con una empresa en otra zona, la zona que viaja es la suya (R22)»; `finanzas-diario.test.ts` «con una empresa en otra zona…» |
| R23 | `dia-en-zona-sql.test.ts` (días de 23 y 25 h de Nueva York); `finanzas-diario.test.ts` «… (R22, R23)» |
| R29 | `pais-sin-literales.guardia.test.ts` (excepciones con SLT-90, sin pendientes) |
| R18, R21 | `telefono-pais.test.ts` «el envoltorio de la UI sigue dando la tabla congelada» |

### Salida
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck`: exit 0 (no hizo falta regenerar Prisma).
- `eslint` de los 14 archivos tocados: sin salida, exit 0.
- Tests tocados (5 archivos): `Test Files 5 passed (5) · Tests 153 passed | 22 skipped (175)`. Los 22 omitidos son los de `dia-en-zona-sql.test.ts` con base: sin `DATABASE_URL` local, los corre CI.
- `pnpm test:guardias` entera: `Test Files 1 failed | 325 passed | 3 skipped (329) · Tests 4 failed | 4586 passed | 24 skipped (4614)`. Los 4 son de `dependencias-declaradas-presentes`, en el baseline.
- `vitest related --run` sin `tests/components` ni `tests/integration`:
  - lote 1 (`entregas-conteo`, `ConteoCargadasPorDiaRepository`, `CohorteCargaRepository`): `33 passed (616)`;
  - lote 2 (`FinanzasDiarioRepository`, su interfaz y servicio, `telefono-pais`, `telefono-cr`): `61 passed (1001)`.
- Grafo MCP: no se usó; bastaron Grep y Read.

### Preguntas abiertas
1. ¿Se acepta subir `TOPE_EXCEPCIONES` de 6 a 8 (desvío 1)?

## Errores nuevos y prevención (cierre, 2026-11-06)

Fuente: `git diff origin/dev...HEAD` y el spec. «Qué ve» es lo que devuelve el borde. `withErrorHandler` no mapea `PaisSinZonaHoraria`, `PaisIncompleto` ni `EmpresaNoResuelta` (`lib/errors/normalize.ts`): salen como `{ status: "error", code: "INTERNAL", message: "Error interno del servidor." }`, HTTP 500 en las rutas, y el error real queda en el log (`logger.logError`).

| Error / código | Dónde se dispara | Qué ve el usuario o la API | ¿Log? | Qué completar o configurar para que no salga |
|---|---|---|---|---|
| `PaisSinZonaHoraria` (R28) | `lib/services/ReglasPaisEmpresaService.ts > zonaHoraria`, `lib/services/zona-de-la-empresa.ts > zonaDeOrganizacionCon`; lo propagan `zonaDelBorde`, `zonaDeLaEmpresa` y cada servicio con `reglasPais` | En una acción o API: `INTERNAL`, «Error interno del servidor.» (500). En un cron: la empresa entra en `empresas.fallidas` y las demás siguen. En un job recurrente: `procesar-jobs` lanza «fallo en N empresa(s)» y la cola reintenta con backoff hasta dead-letter | Sí: `normalizeError` y `[paraCadaEmpresa] fallo en la empresa <id>` | `pais.zona_horaria` con una zona IANA válida para el país de la empresa |
| `PaisIncompleto` (R6, R18) | `ChatWhatsappService`, `EjecucionEnvioService`, `WhatsappEnvioService` (`reglasTelefono`) | Chat de WhatsApp: `INTERNAL`. Envío por job: el job falla y se reintenta (backoff y dead-letter). Webhook: ver la fila del webhook | Sí | `pais.prefijo_telefonico` (CHECK `^[1-9][0-9]{0,2}$`) y `pais.telefono_digitos_nacionales` (CHECK 4–14) |
| Webhook de WhatsApp con país incompleto (se traga el error) | `lib/services/WebhookWhatsappService.ts` (captura `PaisIncompleto`) | Meta recibe 200; los mensajes entrantes de esa empresa se saltan y no se guardan; el lote sigue con las demás | Sí, nivel `error`: «[webhook-whatsapp] mensajes saltados, la empresa X tiene el pais Y incompleto…» | Igual que `PaisIncompleto`. Los mensajes saltados no se recuperan solos (a confirmar si Meta permite reenviarlos) |
| Rastreo público con país incompleto (se traga el error) | `lib/actions/rastreo-publico.ts > buildService` | `{ estado: "no_encontrado" }`, igual que una guía inexistente | Sí: `{ evento: "rastreo_publico_pais_incompleto", organizacionId, paisId, falta: "telefono" \| "zona_horaria" }` | Prefijo, dígitos y zona del país de la empresa dueña de la orden |
| `EmpresaNoResuelta("Pais", <operación>)` | `ReglasPaisEmpresaService.empresaEnCurso` / `paisDeLaEmpresa` (contexto de plataforma, sin sesión de empresa, o la empresa no es visible) | `INTERNAL` | Sí | Llamar desde el contexto de una empresa (`conEmpresa`, sesión con empresa). En plataforma, usar `zonaDeOrganizacionCon` con el id de la empresa. No es un dato del catálogo |
| `Error` «zonaDeOrganizacion: la empresa X no existe» | `zona-de-la-empresa.ts > zonaDeOrganizacionCon` (planes del superadmin) | `INTERNAL` | Sí | Que la empresa exista; ninguna configuración |
| `Error` «… requiere las reglas del pais de la empresa…» | `zonaDeLaEmpresa` sin `reglasPais`, `AprobacionPostulacionService` sin `reglasPais`, `HistoricoConversacionesRepository` con rango y sin zona | `INTERNAL` | Sí | Error de programación: pasar `construirReglasPaisEmpresa(prisma)` en el composition root. Lo vigila `pais-sin-literales.guardia` |
| Alta de empresa con país incompleto (R6) | `lib/services/OrganizacionService.ts > validarConElPais` | `{ estado: "invalida", campo: "paisId" }`, sin escribir nada | No | Prefijo, dígitos, zona y al menos un tipo de documento activo del país elegido |
| Tipo de documento inexistente o de otro país (R11) | `lib/services/validacion-documento-telefono.ts > rechazoDeTipo` (alta de usuario, postulación, aprobación, maestro del alta) | `validation_error` en el campo del tipo: «El tipo de documento indicado no existe». En el alta de empresa, `invalida` con ese campo | No | Filas en `tipo_identificacion` del país de la empresa; el formulario debe mandar un tipo de ese país |
| Tipo de documento inactivo (R11, desvío 2) | `rechazoDeTipo` | `validation_error` en el tipo: «El tipo de documento indicado ya no está activo» | No | `tipo_identificacion.activo = true` en los tipos que se ofrecen; la lista de R5 ya solo trae los activos |
| Documento inválido para su tipo (R10, R12) | `lib/utils/documento.ts > validarDocumento`, vía `validarTipoYDocumento` | `validation_error` en el documento (o en el tipo, si cambió el tipo, R12): «Solo se admiten dígitos, sin espacios ni guiones.», «Solo se admiten letras y dígitos…», «Debe tener N dígitos.» o «Debe tener entre N y M …» | No | `caracteres`, `largo_min` y `largo_max` correctos en el tipo |
| Teléfono inválido para el país (R14) | `lib/validacion/telefono.ts > validarTelefonoDelPais`, vía `validarTelefonoDePersona` | `validation_error` en el teléfono: «El teléfono no es válido para el país de la empresa» (también si es válido pero de otro país) | No | Nada del catálogo: es el dato del usuario. Ojo: valida con `pais.id` como región ISO de libphonenumber, no con el prefijo del catálogo |
| País sin reglas de teléfono (R16) | `validarTelefonoDelPais` (`isSupportedCountry(paisId)` falso) | `validation_error` en el teléfono: «El país de la empresa no tiene reglas de teléfono» | No | Que `pais.id` sea un código ISO alfa-2 que libphonenumber conozca. No se arregla con prefijo ni dígitos |
| Documento duplicado por empresa y tipo (R13) | `UsuarioService` (`UsuarioDuplicadoError("cedula")` → `{ status: "conflict", campo: "cedula" }`), `PostulacionMensajeroService` (`cedulaExiste(cedula, tipo.id)` → `{ status: "conflict", field: "cedula" }`); en carrera, el índice `usuario_cedula_key` | `conflict` en el documento. Mismo documento con otro tipo, o en otra empresa: se acepta | No | Nada que configurar: es una regla. La migración `20261107120200` debe estar aplicada (índice sobre `(organizacion_id, tipo_identificacion_id, cedula)`) |
| Escritura de una empresa en `pais` o `tipo_identificacion` (R4) | RLS y permisos de la base | `42501` (permiso denegado) → `INTERNAL` en el borde | Sí | Solo el superadmin escribe el catálogo (pantalla de SLT-81) |
| Postulación previa al corte `POSTULACION_VALIDADA_POR_PAIS_DESDE` | `lib/services/AprobacionPostulacionService.ts > rechazoDeLaPersona`, `lib/config/aprobacion-postulaciones.ts` | No es error: las creadas antes del corte se aprueban sin validar con el país. Las de después pueden dar `validation_error` (filas de tipo, documento y teléfono) al aprobarlas | No | Fijar el valor IGUAL O POSTERIOR al deploy de SLT-42 en producción (hoy `2026-11-07T12:00:00Z`, ABIERTO con T1.0). Si es anterior, las postulaciones entre ese valor y el deploy no se pueden aprobar |
| Jobs diarios sin zonas → UTC (`ZONA_SIN_EMPRESAS`) | `lib/services/jobs/serie-diaria-por-zona.ts`; aviso en `JobQueueService` y `scripts/siembra-jobs-recurrentes.ts` | Nadie lo ve: la serie se agenda a la hora objetivo en UTC y no procesa empresas con zona; una empresa sin zona falla sola (R28) | Sí, `error`: «[jobs diarios] ningun pais con empresas tiene zona horaria: las series diarias se agendan en UTC. Completar la zona horaria en el catalogo de paises.» | `pais.zona_horaria` en al menos un país con empresas |
| Zona IANA mal escrita | `Intl` en `lib/utils/calendario-zona.ts` (`RangeError`) y, desde esta tanda, Postgres en `AT TIME ZONE` (zona no reconocida) | `INTERNAL` en la operación | Sí | `pais.zona_horaria` válida. La columna no tiene CHECK a propósito (tzdata distinta en Postgres y Node, migración `20261107120000`): se valida a mano. Qué códigos exactos dan `Intl` y Postgres: a confirmar |
| Migración `20261107120100` abortada | `RAISE EXCEPTION` de la migración | El deploy (`migrate deploy`) falla sin cambiar nada: «no existe el país CR» o «tipo_identificacion tiene filas que no son cedula, ruc ni pasaporte» | Sí (salida de la migración) | Pasos 1 y 2 de T1.0 (design §2.5) antes del deploy |

### Checklist para dar de alta un país sin errores
1. `pais.id` = código ISO alfa-2 que libphonenumber conozca (si no, R16 rechaza todo teléfono).
2. `pais.prefijo_telefonico` (1 a 3 cifras, sin `+`) y `pais.telefono_digitos_nacionales` (4–14).
3. `pais.zona_horaria` = zona IANA válida (sin CHECK en la base: revisarla a mano, p. ej. con `SELECT now() AT TIME ZONE '<zona>'` y con `Intl`).
4. Al menos un `tipo_identificacion` del país con `activo = true`, `clave` única en el país, `nombre`, `caracteres` (`digitos` o `alfanumerico`), `largo_min`/`largo_max` y `orden`.
5. Lo carga el superadmin (SLT-81). Hasta que exista esa pantalla, por migración: una empresa no puede escribir el catálogo (42501).
6. Con el país completo, el alta de empresa deja de dar `invalida` en `paisId`; los crons y jobs de sus empresas dejan de fallar con `PaisSinZonaHoraria`.

### Checklist antes del deploy
1. T1.0 (persona, solo lectura en producción; design §2.5): `organizacion` fuera de CR = 0; `tipo_identificacion` solo `cedula`, `ruc` y `pasaporte`; `count(*)` de `usuario` (si pasa de 100 000, el índice va `CONCURRENTLY`). Anotar el resultado en la ficha.
2. Ensayar las tres migraciones `20261107120000`–`120200` y sus `down.sql` sobre una copia de producción.
3. Fijar `POSTULACION_VALIDADA_POR_PAIS_DESDE` igual o posterior al instante del deploy en producción, en un commit antes del deploy.
4. Tras migrar: CR con `506` / 8 / `America/Costa_Rica` y sus cinco tipos activos (R3).
5. Variables de entorno: SLT-42 no agrega ninguna. `RASTREO_PUBLICO_ZONA_HORARIA` ya no se lee y puede salir del entorno (a confirmar si sigue cargada en Vercel).
6. Horario de los crons de Vercel: sigue a hora fija UTC (P6, deuda para cuando entre un país con otra zona).

Veredicto: las decisiones del bloque 7 están aplicadas: los planes pasan a SLT-86 (al cierre, SLT-90), el día se agrupa con `AT TIME ZONE` parametrizado y `whatsapp-telefono` se borró. La lista de pendientes quedó vacía y se retiró. Los errores nuevos están documentados con su prevención. Solo queda T1.0, que la hace una persona.

- 2026-11-06 · Correcciones m1–m3 del review: m3 `ON CONFLICT ("value") DO NOTHING` en el INSERT de dimex/nite (la rama no llegó a dev; solo bases locales/de prueba la tienen aplicada) · bf5a0a82; m1 desvío (no se añade `server-only`: el paquete no es dependencia del proyecto y ningún archivo lo importa; solo lo importa `lib/services/validacion-documento-telefono.ts`, nada del cliente) → `design.md > Desvíos` 8 y T2.4; m2 T1.0 ampliado con índice `CONCURRENTLY`, ensayo en copia y corte de postulaciones. typecheck exit 0; telefono.test 5/5; migracion-slt42 1 passed, 5 skipped (sin base); test:guardias solo los 4 rojos del baseline. Ojo: `origin/dev` ya tiene otra migración con el mismo prefijo `20261104140100_tarifa_activacion`: revisar el orden al integrar dev.

## Integración de dev (F2.3)

- 2026-11-06 · `git merge origin/dev` (175 commits) · merge bf4ddb54 + `chore(SLT-42): migraciones renombradas tras dev`.
- Conflictos: `WalletLedger.tsx` (concepto `conceptoDeMovimientoCaja` de dev + `fechaDiaMovimientoCR(..., ZONA_CR)` de SLT-42); `WalletService.verResumenCaja` y `WalletMovimientoRepository` (`categoriasConModeloNuevo` de dev + `primerDiaDeLaCaja({ zonaHoraria })` y `calendario-zona`); `SaldosSatelitesRepository` (import de dev + `calendario-zona`); `excepciones-aislamiento.ts` y `docs/architecture.md` (las dos entradas); guardia `geografia-predicado-unico` (fuente de vehículos de dev + barrido acotado a geografía); `busqueda-por-guia-469-servicios` (stub de dev + `reglasPaisFijas()`); `progress/deudas.md` (la D36 de SLT-42, crons, pasa a **D57**: dev ya usó D36); `arnes.config.json` (cupo backend 5, de dev).
- Tests de dev adaptados al patrón (reglas del país inyectadas / zona como parámetro): `usuario-vehiculo`, `postulacion-mensajero-service`, `deshacer-gestion-invalida-analitica`, `cierres-admin-repository`, `tarifa-empresa-nueva` (+ `PaisRepository` en `OrganizacionService`), `tarifas-valor-propio-caminos`, `ciclo-vida-gestion-final`, `WalletConceptoModeloNuevo`.
- Migraciones: `20261106120000_slt42_pais_telefono_y_zona`, `20261106120100_slt42_tipo_documento_por_pais`, `20261106120200_slt42_usuario_documento_unico_por_tipo` (detrás de `20261104150200`). SQL sin cambios: ninguna migración de dev toca `pais`, `tipo_identificacion` ni el índice de cédula de `usuario`. Referencias actualizadas en `down.sql`, `schema.prisma`, `seed-catalogos.ts`, `tests/fabricas/reglas-pais.ts`, `migracion-slt42-ida-y-vuelta` (`ULTIMA_ANTERIOR` = `20261104150200_cobro_plataforma_porcentual_funciones`), design y tasks. `POSTULACION_VALIDADA_POR_PAIS_DESDE` sigue al nombre de la primera migración: pasa a `2026-11-06T12:00:00.000Z` (sigue abierto con T1.0: ajustar al deploy).
- Verificación: `pnpm typecheck` exit 0; eslint de los archivos con conflicto y los tests adaptados, 0 errores (3 warnings previos en `busqueda-por-guia-469`); `pnpm test:guardias` 4 rojos, todos `dependencias-declaradas-presentes` (baseline), 4638 verdes; `vitest related` (sin components/integration) de los archivos con conflicto: 125 archivos/2244 verdes y 377 archivos/6947 tras arreglar 3 tests de dev; los 120 tests unitarios que trajo dev, 2731 verdes tras arreglar `deshacer-gestion-invalida-analitica`.
- 2026-11-06 · segunda integración: `git merge origin/dev` (44 commits, SLT-86 período de facturación) · commit `Merge origin/dev en SLT-42 (SLT-86)`.
  - Conflictos: `planes-plataforma.ts` (import de `PreciosQueRigenResult` de dev + `PaisRepository`/`zonaDeOrganizacionCon` de SLT-42); `PlanesService.previsualizarAsignacion`/`previsualizarCustom` (gana dev: SLT-86 R8 retiró `siguienteCiclo`, así que `fechaDeLaEmpresa` quedó sin uso y se borró; el parámetro `zonaDeOrganizacion` sigue cableado en los dos composition roots, sin lector: pregunta abierta; al cierre el humano decidió borrarlo); `planes-cambiar-tipo-cobro.test.ts` (firma nueva de dev con `vigenteDesde`/`EFECTO_HOY` + `zonaDeCR`).
  - Tests retirados: en `planes-service-inicio-ciclo.test.ts`, «SLT-42 R22: el siguiente ciclo se muestra en la zona…» y «SLT-42 R28: sin zona … la vista previa falla…» (su sujeto, `siguienteCiclo`, ya no existe). R22 y R28 siguen cubiertas por el resto del mapa (`hora-por-pais-analitica-avisos`, `plantilla-cambio-plan`, `procesar-jobs-plan-cambio`, `planes-service-lecturas`…).
  - R29: dev trajo 3 imports nuevos del envoltorio `fecha-cr` (`PlanesRepository`, `_shared/precio-del-periodo.ts`, la página `plataforma/planes/[planId]`) y `PlanesService` volvió a usar `fechaCalendarioCR` para el «hoy» de la plataforma. Arreglo sin cambio de comportamiento: `fechaCalendarioPlataforma` y `mananaCalendarioPlataforma` en `lib/planes/ciclo.ts`, junto a `inicioDelDiaPlataforma` (su inversa), y los cuatro archivos las importan de ahí. `ciclo.ts`, `cobro.ts` y `consumo.ts` siguen con la fecha de CR tras SLT-86: sus excepciones y el tope 8 se quedan (al cierre pasan a SLT-90).
  - Migraciones renombradas detrás de `20261106150000_historial_accion_plan_cambio_empresa_cancelado` (la mayor de dev; SLT-86 ocupó `20261106120000`): `20261107120000_slt42_pais_telefono_y_zona`, `20261107120100_slt42_tipo_documento_por_pais`, `20261107120200_slt42_usuario_documento_unico_por_tipo`. SQL sin cambios: las de SLT-86 tocan planes, `organizacion` (columnas de plan) y el enum de historial, no `pais`, `tipo_identificacion` ni el índice de cédula de `usuario`; la política de `tipo_identificacion` solo lee `organizacion.pais_id`, que SLT-86 no toca. Referencias actualizadas en `down.sql`, `schema.prisma` (solo las 3 de SLT-42; las de `20261106120000` restantes son de SLT-86), `seed-catalogos.ts`, `tests/fabricas/reglas-pais.ts`, `migracion-slt42-ida-y-vuelta` (`ULTIMA_ANTERIOR` = `20261106150000_historial_accion_plan_cambio_empresa_cancelado`), `usuario-unico-por-empresa`, design, tasks y «Errores nuevos y prevención». `POSTULACION_VALIDADA_POR_PAIS_DESDE` pasa a `2026-11-07T12:00:00.000Z` (sigue abierto con T1.0).
  - Verificación: `prisma validate`/`generate` (URL ficticia) ok; `pnpm typecheck` exit 0; eslint de los 10 archivos tocados, 0; `pnpm test:guardias` 4 rojos, todos `dependencias-declaradas-presentes` (baseline), 4639 verdes; unitarios de planes de dev (37 archivos) 1016 verdes; `vitest related` (sin components/integration) en 2 lotes: 30 archivos/826 y 4/48, verdes. La integración la corre CI.

## CI PR #90: rojos y arreglo

- 2026-11-06 · run 42268450022: 13 archivos fuera del baseline, todos tests de dev que SLT-42 no había adaptado (ninguno es comportamiento roto de SLT-42; nada al baseline). (a) 10 archivos construían servicios / `conPushWeb` / la página del ranking sin la zona del país → `reglasPaisFijas()` / `zonaDeCR` / mock de `zonaDelBorde` (0cd91c28). (b) `tarifa-empresa-nueva`: cédula `doc-<uuid>` inválida por R11 → 9 dígitos; `unicos-por-empresa` y `usuario-unico-por-empresa`: `usuario_cedula_key` ya es (org, tipo, cédula) por R13 → tipo fijo en el caso; el control mide el índice de hoy y la ida y vuelta de SL-18 pasa por el down/migration de SLT-42 (8a8b9405). Verificación local (sin base): typecheck exit 0; eslint 0 errores (1 warning previo); `RankingHistoricoPage` 12/12; `test:guardias` solo los 4 del baseline. Las integraciones se confirman en CI.

## Cierre (2026-11-06, rama chore/cierre-SLT-42)

- Las 3 excepciones de R29 de `lib/planes/` (`ciclo.ts`, `cobro.ts`, `consumo.ts`) pasan de `SLT-86` a `SLT-90` («Planes: ciclo y cobro en la zona de cada empresa»), decisión del humano. `FichaQueLoRetira`, motivos, cabecera, la guardia, R29, design, tasks y el comentario de `fechaCalendarioPlataforma` en `ciclo.ts`. Tope sigue en 8.
- `PlanesService` sin el parámetro `zonaDeOrganizacion` (sin lector desde SLT-86); fuera su cableado en `lib/actions/planes.ts` y `lib/actions/_shared/planes-plataforma.ts` y el 3.er argumento en 6 unitarios y 2 de integración de planes. El correo de cambio de plan (`p.zona`) y el catálogo en UTC no cambian. `zonaDeOrganizacionCon` queda sin uso de producción (solo su unitario en `hora-por-pais-analitica-avisos.test.ts`); no se borra.
- «Errores nuevos y prevención»: migraciones `20261107120000`–`120200` y corte `2026-11-07T12:00:00Z`.
