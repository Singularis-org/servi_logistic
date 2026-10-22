# 486 — Evidencias con varias fotos en los cierres · design

Arreglo mínimo de lo evidenciado: las dos proyecciones de cierre pasan a leer el conjunto
`gestion_orden_evidencia` que ya existe, la fila y el DTO ganan una LISTA, y la UI pinta un botón
por foto. Sin migración, sin tocar el visor, sin tocar las descargas de admin.

## 1. Lo que hay hoy (verificado en el archivo, no solo en el grafo)

| Pieza | Dónde | Qué hace hoy |
| --- | --- | --- |
| Tabla 1:N | `db/migrations/20260723130000_gestion_orden_evidencia/migration.sql` | `gestion_orden_evidencia(gestion_id, storage_path, content_type, indice)`, `UNIQUE(gestion_id, indice)`, índice `gestion_id`, RLS sin policies (service role). Backfill: una fila `indice 0` por gestión con `evidencia_storage_path` no nulo. |
| Relación Prisma | `db/schema.prisma:1250` | `GestionOrden.evidencias GestionOrdenEvidencia[]` |
| Escritor | `GestionOrdenRepository.insertarGestionConHijas` (`:181-258`) | Dual-write: portada (indice 0) en la columna + N hijas en la misma tx. Rama retro-compat: portada suelta SIN hijas si el caller no pasa la lista (`:192`). |
| Proyección admin | `GESTION_ADMIN_SELECT` (`CierresAdminRepository.ts:262-306`) | `evidenciaStoragePath: true`. La usan `findCierreByIdEnAlcance` (`:1294`) y `CierresBodegaAdminRepository.findCierreBodegaConDetalle` (`:358`). Mapper `toPendienteRowDesdeSnapshot` (`:421-479`). |
| Proyección mensajero | `WITH_DETALLE` (`CierreDiaRepository.ts:420-468`) | `evidenciaStoragePath: true`. La usan `findGestionesPendientes` (`:811`) y `findCierrePropioConGestiones` (`:1418`; también la corrección 477). Mapper `toPendienteRow` (`:479`). |
| Fila de dominio | `CierreGestionPendienteRow` (`ICierreDiaRepository.ts:124`) | `evidenciaStoragePath: string \| null` |
| Firma | `ISignedUrlProvider.createSignedUrls(paths, ttl)` → `SupabaseSignedUrlProvider` (`:57-81`) | UNA llamada `storage.from(bucket).createSignedUrls(paths, ttl)`; resultado PARCIAL (omite lo que no firma). TTL `cierreConfig.SIGNED_URL_TTL_SECONDS`. |
| Servicios | `CierresAdminService.verCierreDetalle` (`:790-810`, best-effort), `CierresBodegaAdminService.verCierreBodegaDetalle` (`:277-285`, propaga), `CierreDiaService.listarCierreDia` (`:318-325`, propaga), `correccionesDe` (`:405-418`, best-effort), `verCierrePasado` (`:458-471`, best-effort) | Recogen `g.evidenciaStoragePath`, firman en lote, `toDetalleDTO(g, urlByPath)`. |
| DTO | `CierreDetalleGestion.evidenciaUrl` (`ICierreDiaService.ts:67`), `toDetalleDTO` (`CierreDiaService.ts:1016`) | una URL o null |
| UI | `cierre-factura.tsx` `FilaGestion` (`:1909-1920`); `CierreDiaModule.tsx` `columnaEvidencia` (`:1489-1508`) | un botón «Ver evidencia» → `onVerEvidencia(url)` |
| Descarga admin | `GESTION_DESCARGA_SELECT` (`CierresAdminRepository.ts:711-760`) | NO lee evidencia (R22/R41 de la 230). Atornillado por `cierres-admin-gestiones-where.test.ts:162-171` (no contiene «evidencia») y `:192-199` (diferencia de claves con el detalle = `["evidenciaStoragePath"]`), y `cierres-bodega-gestiones-where.test.ts:100-107`. |
| Descarga mensajero | `cierre-dia-descarga-columnas.ts:127-129` | «Sí/No» a partir de `evidenciaUrl`. |

## 2. Decisiones

### 2.1 Modelo de datos — sin cambios

Ni tabla, ni columna, ni migración, ni RLS. La tabla, su índice por `gestion_id` y el backfill ya
existen. La columna se conserva tal cual (sigue siendo la portada que leen la API 106 y otros).

### 2.2 Lectura: la relación anidada en las DOS proyecciones de cierre

En `GESTION_ADMIN_SELECT` y en `WITH_DETALLE.select` se añade:

```ts
evidencias: { select: { storagePath: true }, orderBy: { indice: "asc" } },
```

- **Sin N+1:** Prisma resuelve una relación anidada de un `findMany` con UNA consulta adicional
  `WHERE gestion_id IN (...) ORDER BY indice` por nivel, no una por gestión (mismo mecanismo que ya
  usan `pagos` e `historialEstados` en la misma proyección). En bodega, donde la proyección va
  anidada dentro de `cierresDia`, sigue siendo una consulta por nivel. El `IN` usa
  `gestion_orden_evidencia_gestion_id_idx`.
- **Orden (R4):** lo fija el `orderBy: { indice: "asc" }` en la consulta; el mapper no reordena (el
  test de integración inserta 2,0,1 para que quitar el `orderBy` se note).
- `evidenciaStoragePath: true` **se mantiene** en las dos proyecciones: es el fallback (R5).
- `GESTION_DESCARGA_SELECT` **no cambia** (R17). El literal de `cierres-admin-gestiones-where.test.ts:199`
  pasa a `["evidenciaStoragePath", "evidencias"]`: ese literal ES el contrato («la descarga es el
  detalle menos la evidencia»), y se actualiza a sabiendas, no por su propia fuente.

### 2.3 Fila de dominio y fallback (R5/R6)

`CierreGestionPendienteRow` gana `evidenciaStoragePaths: string[]` (**obligatorio**) y conserva
`evidenciaStoragePath` (portada). Un campo opcional dejaría a un productor olvidarlo y volver a una
foto en silencio, que es exactamente el defecto de esta ficha.

Función pura nueva `lib/utils/evidencias-gestion.ts`:

```ts
/** Rutas de evidencia de UNA gestión, en orden de indice. Hijas mandan; sin hijas, la portada. */
export function rutasEvidenciaGestion(
  hijas: ReadonlyArray<{ storagePath: string }>,
  portada: string | null,
): string[];
/** URLs firmadas en el orden de `rutas`, omitiendo las que el firmador no devolvió (R9). */
export function urlsEvidenciaFirmadas(
  rutas: readonly string[],
  urlByPath: Record<string, string>,
): string[];
```

Regla de `rutasEvidenciaGestion`: si `hijas.length > 0` → sus rutas en el orden recibido; si no y
`portada !== null` → `[portada]`; si no → `[]`. No se mezclan hijas y portada: tras la 119 la
portada ES la hija `indice 0`, y mezclar duplicaría la foto.

Los dos mappers (`toPendienteRowDesdeSnapshot`, `toPendienteRow`) la llaman con `g.evidencias` y
`g.evidenciaStoragePath`.

### 2.4 Firma (R7/R8/R9/R10/R11)

En los cinco puntos de firma la recogida pasa de `.map((g) => g.evidenciaStoragePath).filter(...)`
a `.flatMap((g) => g.evidenciaStoragePaths)`. Sigue siendo **una** llamada a `createSignedUrls` por
detalle (en la corrección 477, una por cierre rechazado, como hoy). El resultado parcial del
provider ya da R9; los `try/catch` best-effort existentes dan R10 sin cambios. Las guardias de
alcance (`forbidden`/`no_encontrada`) ya cortan antes de firmar (R11). El comportamiento de
propagación de bodega y vista en vivo NO se toca (fuera de alcance).

Para no repetir el `flatMap` cinco veces se puede exportar un helper `rutasAFirmar(gestiones)` en el
mismo util; es opcional.

### 2.5 DTO (contrato al cliente)

`CierreDetalleGestion` gana:

```ts
evidenciaUrls: string[]; // URLs FIRMADAS en orden de indice (R4/R7); [] si no hay
```

y `evidenciaUrl` se conserva, **derivado** en `toDetalleDTO` como `evidenciaUrls[0] ?? null`
(una sola fuente). Así siguen intactos sus consumidores que no son el botón: la descarga del
mensajero («Sí/No», R18) y la de admin, que no lo emite. `toDetalleDTO`:

```ts
const evidenciaUrls = urlsEvidenciaFirmadas(g.evidenciaStoragePaths, urlByPath);
// ...
evidenciaUrl: evidenciaUrls[0] ?? null,
evidenciaUrls,
```

Ninguna ruta cruda cruza al cliente: el DTO no lleva `evidenciaStoragePaths` (R7).

### 2.6 UI (R12-R16)

Componente pequeño compartido por las dos superficies, junto a `cierre-factura.tsx`
(`app/(app)/cierres-admin/_components/botones-evidencia.tsx`), porque lo usan `FilaGestion` y
`CierreDiaModule.columnaEvidencia` con la misma API:

```tsx
<BotonesEvidencia urls={g.evidenciaUrls} onVer={(url) => ...} ariaSufijo={...} />
```

- 0 URLs → nada (en la columna de la tabla, «—» como hoy).
- 1 URL → «Ver evidencia» (texto y `aria-label` actuales, para no romper los tests existentes).
- N>1 → «Ver evidencia 1» … «Ver evidencia N»; `aria-label` «Ver evidencia k de N de la orden
  <remisión> · <destinatario>» en `FilaGestion`.
- Cada botón llama al `onVerEvidencia(url)` que ya existe; el visor (`Modal`/`VisorEvidencia`) no
  cambia.

`FilaGestion` y `columnaEvidencia` dejan de leer `g.evidenciaUrl` y leen `g.evidenciaUrls`.

### 2.7 Rutas, acciones, permisos, integraciones

Sin cambios: mismas server actions, mismo alcance, mismo bucket privado y mismo TTL.

## 3. Alternativas descartadas

1. **Firmar en el servicio con una consulta aparte a `gestion_orden_evidencia`** (un método de
   repo `findEvidenciasDeGestiones(ids)` llamado tras el detalle). Descartada: añade un método a
   tres interfaces de repositorio y una consulta que el servicio tiene que acordarse de hacer en
   cinco sitios; olvidarla en uno deja esa superficie con una foto sin que nada falle. Con la
   relación en la proyección, la fila no compila sin la lista.
2. **Reemplazar `evidenciaUrl` por `evidenciaUrls` en el DTO.** Descartada: arrastra la descarga
   del mensajero y ~28 fixtures de componente sin ganancia; derivar la portada de la lista mantiene
   una sola fuente.
3. **Miniaturas en la fila (como incidentes).** Descartada por defecto (P2): carga hasta 3
   imágenes por fila desplegada en una pantalla que lista decenas, y cambia la composición de la
   fila; los botones numerados son el cambio mínimo. Queda como pregunta al humano.
4. **Leer solo la tabla, sin fallback a la columna.** Descartada: el escritor conserva una rama que
   escribe la columna sin hijas (`GestionOrdenRepository.ts:192`); esa gestión se quedaría sin
   ninguna foto.
5. **Migración de saneo** (rellenar hijas faltantes desde la columna). Descartada: el backfill ya se
   hizo en `20260723130000` y el fallback de lectura cubre el resto sin tocar datos.

## 4. Riesgos y cómo se cubren

- **Guardias por literal.** `cierres-admin-gestiones-where.test.ts:199` se pondrá rojo al añadir
  `evidencias` al detalle: es lo esperado y se actualiza con el motivo. `:171` y el de bodega
  (`:107`) deben seguir en verde sin tocarse: si se ponen rojos, la descarga empezó a leer evidencia.
- **Fixtures.** El campo obligatorio de la fila toca ~20 fixtures de `CierreGestionPendienteRow` en
  tests de servicio/repositorio, y el del DTO ~28 de componente. Cambio mecánico y coherente:
  `evidenciaStoragePaths: path ? [path] : []` y `evidenciaUrls: url ? [url] : []`.
- **El WHERE/select vive en Prisma.** Los dobles de servicio no ven la relación: el orden y el
  fallback se prueban contra Postgres (`tests/integration/db`), y el test debe fallar si no hay
  datos sembrados (nada de `if (!x) return`).
- **Gate.** No toca dinero ni `db/schema.prisma` ni migraciones: `./init.sh --rapido`. Las guardias
  de repositorio que leen archivos con `fs` pueden no salir por el grafo: correr a mano los dos
  `*-gestiones-where.test.ts` y `cierre-detalle-superficies.guardia.test.ts`.
