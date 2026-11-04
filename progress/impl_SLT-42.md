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
