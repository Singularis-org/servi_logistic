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
