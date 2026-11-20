# SLT-248 «Actualizar zonas: también las reprogramadas y en novedad pasan a la zona nueva» — Requirements

> Ruta **ligera** (`feature_list.json > ruta`): este archivo es el spec entero (alcance, EARS, tasks y
> archivos esperados). Zona backend, complexity low. Requisitos **R1801–R1806** (el más alto en uso
> era R1800, de SLT-247 «cierre rechazado gestiona sin gestión»).

## Alcance

Revierte la **P4** de SLT-224 «Retiro a central: recalcular la zona de la orden»
(`specs/SLT-224-zona-al-retirar-a-central/requirements.md > P4`, R1723 y R1726): las órdenes en
`reprogramado` y en `novedad` dejan de quedar fuera de la re-derivación de zona. Con zona errada y
sin cobro en curso pasan a la zona de su distrito, por los mismos caminos que ya usan la regla de
SLT-224 (todos llaman al helper compartido `reconciliarZonaDeOrdenes`):

- el botón **«Actualizar zonas»** de `/ordenes` (vista previa y confirmación);
- el **guardado de una zona** con distritos nuevos (`ZonaRepository.update`);
- la recepción en la central también usa el helper, pero solo re-deriva la orden que llega a
  `en_bodega_central`, que nunca está en `reprogramado` ni `novedad`: no cambia nada ahí.

Como la liberación (cron de reprogramadas y cron SLA de novedades) decide la bodega con
`orden.zonaId` (`resolverDestinoCierre`), una orden corregida se libera a la bodega de su zona nueva.
Es lo que pide Carlos.

**Lo que NO entra** (sigue igual que en SLT-224):
- `en_bodega_satelite` (estante de una satélite), las finalizadas (`entregado`, `devuelta_a_tienda`,
  `incidente`) y los cinco estados de devolución que quedan (`por_devolver_a_bodega_central`,
  `devolviendo_a_bodega_central`, `devolucion_a_origen_por_rechazo`, `por_devolver_a_tienda`,
  `devolviendo_a_tienda`): no se mueven.
- El corte de dinero (R1722, «cobro en curso»): protege también a las `reprogramado` / `novedad`.
- El cobro: el próximo cierre de una orden movida usa la tarifa de la zona nueva por la regla R1707 de
  SLT-224, ya en producción. Esta feature no toca código de dinero ni de tarifas.
- La corrección única de SLT-224 (migración de datos ya aplicada): no se repite. Las `por_liberar`
  que hoy están desalineadas se corrigen cuando alguien pulse «Actualizar zonas» (el T0 dice cuántas).
- Las pantallas de bodega no cambian de código. Su comportamiento se deriva de `orden.zonaId` y queda
  aceptado por la decisión de Carlos: una orden movida deja de verse en «Órdenes de la bodega» de la
  satélite vieja, y su recuperación manual (`RecuperacionBodegaService`) la autoriza la bodega de la
  zona nueva. «Reprogramadas retenidas» sigue agrupando por el destino del cierre cuando lo hay
  (`ReprogramadasRetenidasService`).

## Lo que ya existe

Buscado `por_liberar`, `reprogramad.*zona`, `novedad`, `CLASE_RECONCILIACION_ZONA`, «esperando
liberación» en `feature_list.json`, `specs/` y el código (Grep/Read: el grafo no tiene índice de este
worktree, `index_status` dio «project not found»).

- **Board:** solo esta ficha. Ninguna otra ficha toca la clase `por_liberar`.
- **Spec:** SLT-224 (P4, R1723, R1725, R1726; design §2.4 y §3b.5). Esta ficha la enmienda, no la
  duplica.
- **Código que se reutiliza sin cambios:** `reconciliarZonaDeOrdenes`
  (`lib/repositories/_shared/reconciliar-zona-ordenes.ts`), que excluye por
  `ESTADOS_QUE_NO_SE_MUEVEN`, una lista que se deriva del mapa; `motivoDeSaltada`
  (`lib/services/ActualizacionZonasService.ts`), que devuelve la clase del mapa; `resolverDestinoCierre`
  en `LiberacionReprogramadaService` y `DevolucionSlaService`.
- **Punto de cambio, verificado:** `CLASE_RECONCILIACION_ZONA` en `lib/utils/estados-bodega-satelite.ts`
  (`Record<OrderStatusValue, …>` exhaustivo). Hoy `reprogramado: "por_liberar"` y
  `novedad: "devolucion"`. Ojo: `novedad` **no** está en la clase `por_liberar` sino en `devolucion`,
  aunque la P4 la trataba como «por liberar». `novedad` es la `devuelta` del cron SLA
  (`DevolucionSlaService`, `ESTATUS_DEVUELTA = "novedad"`), que reintenta a `en_bodega_central` o
  `en_bodega_satelite` según `orden.zonaId` o escala a `devolucion_a_origen_por_rechazo`.
- **Quién consume la clase `por_liberar`:** `MotivoSaltada` (`lib/types/actualizacion-zonas.ts`),
  `TEXTO_MOTIVO_SALTADA` (`app/(app)/ordenes/_components/ActualizarZonasButton.tsx`, texto «esperando
  liberación en bodega»), la ayuda `docs/ayuda/oficina/ordenes.md` (línea de ese motivo) y cinco tests
  (ver `## Tasks`). No hay E2E que lo nombre.

## Decisiones cerradas (no reabrir)

| # | Decisión | Quién / cuándo | Cubierta por |
|---|---|---|---|
| D1 | Las `reprogramado` y `novedad` con zona errada pasan a la zona de su distrito: «si el cliente decide modificar las zonas es porque ya está moviendo también sus paquetes». A «¿Quieres que también las reprogramadas y en novedad pasen a la zona nueva?»: «Sí». | Carlos, 2026-11-20 (`progress/features/SLT-248.md`) | R1801, R1803, R1806 |
| D2 | Al liberarse, una orden corregida va a la bodega de su zona nueva (la regla de liberación por `orden.zonaId` no cambia). | Consecuencia de D1, pedida en la ficha | R1806 |
| D3 | Las demás exclusiones de SLT-224 no cambian: estante satélite, finalizadas, los cinco estados de devolución que quedan y el cobro en curso. | Encargo del leader | R1802, R1805 |
| D4 | La clase y el motivo `por_liberar` **se eliminan** (el tipo, el texto de la pantalla y la ayuda). No se dejan vacíos. `novedad` pasa de `devolucion` a `se_mueve`. | spec_author (técnica; ver «Alternativa descartada») | R1804 |

**Alternativa descartada (D4):** dejar `por_liberar` en `ClaseReconciliacionZona` y en `MotivoSaltada`
sin ningún estado que la use. Es el diff más corto, pero deja un motivo que la pantalla y la ayuda
siguen documentando y que nunca aparece. Los `Record` exhaustivos dejarían de avisar de verdad,
porque exigirían texto para un motivo muerto. Quitarlo hace que el typecheck señale cada sitio que lo
nombraba.

## Requisitos (EARS)

Términos: «zona errada», «cobro en curso», «finalizada» y «re-derivar la zona» tal como los define
SLT-224 (`requirements.md`, bloques «El botón» y «PR 2»). Estos requisitos **sustituyen** a R1723 y
R1726 de SLT-224 en lo que toca a `reprogramado` y `novedad`; el resto de esos requisitos sigue vigente.

- **R1801** — CUANDO se guarda una zona o se confirma «Actualizar zonas», SI una orden de la empresa
  de quien actúa está en `reprogramado` o en `novedad`, tiene la zona errada y no tiene cobro en curso,
  ENTONCES el sistema DEBE cambiarla a la zona de su distrito y registrar su acción
  `orden_zona_reconciliada`, igual que a cualquier otra orden que se mueve.
- **R1802** — SI una orden en `reprogramado` o en `novedad` con la zona errada tiene un cobro en
  curso, ENTONCES el sistema NO DEBE cambiar su zona, y «Actualizar zonas» DEBE listarla como saltada
  con el motivo «cobro en curso».
- **R1803** — CUANDO el maestro o el admin pide la vista previa de «Actualizar zonas», el sistema DEBE
  contar las órdenes de R1801 dentro de su grupo zona actual → zona nueva y NO DEBE listarlas como
  saltadas.
- **R1804** — CUANDO «Actualizar zonas» lista una orden saltada, el sistema DEBE darle uno de estos
  cuatro motivos, en este orden de precedencia: «en el estante de una satélite», «finalizada», «en
  devolución» y «cobro en curso». NO DEBE existir el motivo «esperando liberación en bodega».
- **R1805** — SI una orden con la zona errada está en `en_bodega_satelite`, finalizada, o en
  `por_devolver_a_bodega_central`, `devolviendo_a_bodega_central`, `devolucion_a_origen_por_rechazo`,
  `por_devolver_a_tienda` o `devolviendo_a_tienda`, ENTONCES el sistema NO DEBE cambiar su zona, igual
  que antes de esta feature.
- **R1806** — CUANDO el cron libera una orden `reprogramado`, o reintenta una `novedad`, el sistema
  DEBE mandarla a `en_bodega_central` si su zona actual es la central y a `en_bodega_satelite` si es
  otra. Una orden corregida por R1801 se libera, por tanto, a la bodega de su zona nueva.

## Trazabilidad prevista

| R | Test | Tipo |
|---|---|---|
| R1801 | `tests/integration/db/reconciliar-zona-corte-vivas.int.test.ts`: matriz por el guardado de zona, donde `estado-reprogramado` y `estado-novedad` (solo cierre aprobado) pasan a `SE_MUEVEN`, con su acción y lote. `tests/integration/db/actualizacion-zonas.int.test.ts`: confirmación, donde `reprogramado` y `novedad` se actualizan. `tests/unit/utils/clase-reconciliacion-zona.test.ts`: «se mueve» literal con los dos. | integración (Postgres) + unit |
| R1802 | `reconciliar-zona-corte-vivas.int.test.ts`: caso nuevo en la matriz, `reprogramado` y `novedad` con un `cierre_detail` de un cierre `solicitado`, que no se mueven. `tests/unit/services/actualizacion-zonas-action.test.ts`: `reprogramado`/`novedad` con `cobroEnCurso: true` da `cobro_en_curso`. | integración + unit |
| R1803 | `actualizacion-zonas.int.test.ts`: vista previa con `total` 6, un grupo de 6, y sin `reprogramado`/`novedad` en `SALTADAS_ESPERADAS`. `actualizacion-zonas-action.test.ts`: `motivoDeSaltada` da `null` para los dos sin cobro. | integración + unit |
| R1804 | `tests/components/ActualizarZonasButton.test.tsx`: claves de `TEXTO_MOTIVO_SALTADA` escritas literal (4), el listado sin G-4, y el texto «esperando liberación en bodega» ausente. Typecheck: `MotivoSaltada` sin `por_liberar`. | componente + typecheck |
| R1805 | `clase-reconciliacion-zona.test.ts`: `devolucion` literal con 5 estados, `ESTADOS_QUE_NO_SE_MUEVEN` literal con 9. `tests/unit/repositories/zona-repository.test.ts`: `NO_SE_MUEVEN` literal con 9 en el `notIn`. `reconciliar-zona-corte-vivas.int.test.ts`: `ESTADOS_R1723` con los 6 que quedan, que siguen en `NO_SE_MUEVEN`. | unit + integración |
| R1806 | Sin cambios, ya existentes: `tests/unit/services/liberacion-reprogramada-service.test.ts` («R12: orden de la zona central -> destino en_bodega_central» y «… satelite -> en_bodega_satelite»), `tests/unit/services/devolucion-sla-service.test.ts` («R15: zona CENTRAL -> reintento a en_bodega_central»). | unit (regla vigente) |

## T0 — solo lectura, lo corre el leader contra producción

Cuántas órdenes `reprogramado` / `novedad` tienen hoy la zona distinta de la de su distrito, por
estado, y cuántas movería el botón (sin cobro en curso). URL en `.env.prod` (`DIRECT_URL`). Antes de
la consulta, `SET default_transaction_read_only = on;` (o `BEGIN READ ONLY;`). Tablas y columnas
verificadas en `db/schema.prisma`: `orden`, `order_status(value)`, `zona_distrito`, `cierre_detail`,
`cierre_dia(estado)` y `gestion_orden(resultado, anulada_at, cierre_id)`.

```sql
SET default_transaction_read_only = on;

WITH errada AS (
  SELECT o.id, o.organizacion_id, os.value AS estado, o.zona_id AS zona_actual, zd.zona_id AS zona_nueva,
    ( EXISTS (SELECT 1 FROM cierre_detail cd JOIN cierre_dia c ON c.id = cd.cierre_id
              WHERE cd.orden_id = o.id AND c.estado <> 'aprobado')
      OR EXISTS (SELECT 1 FROM gestion_orden g LEFT JOIN cierre_dia c2 ON c2.id = g.cierre_id
              WHERE g.orden_id = o.id AND g.anulada_at IS NULL
                AND g.resultado IN ('entregado','devolucion_a_origen_por_rechazo','incidente')
                AND (g.cierre_id IS NULL OR c2.estado <> 'aprobado')) ) AS cobro_en_curso
  FROM orden o
  JOIN order_status os ON os.id = o.estatus_id
  JOIN zona_distrito zd ON zd.distrito_id = o.distrito_id AND zd.organizacion_id = o.organizacion_id
  WHERE o.deleted_at IS NULL
    AND o.zona_id <> zd.zona_id
    AND os.value IN ('reprogramado', 'novedad')
)
SELECT estado,
       count(*)                                  AS con_zona_errada,
       count(*) FILTER (WHERE NOT cobro_en_curso) AS se_moverian,
       count(*) FILTER (WHERE cobro_en_curso)     AS siguen_saltadas_cobro
FROM errada
GROUP BY estado
ORDER BY estado;

-- Detalle por empresa y zona actual -> zona nueva (solo nombres; nada del destinatario):
-- SELECT e.organizacion_id, za.nombre AS zona_actual, zn.nombre AS zona_nueva, e.estado, count(*)
-- FROM errada e JOIN zona za ON za.id = e.zona_actual JOIN zona zn ON zn.id = e.zona_nueva
-- WHERE NOT e.cobro_en_curso GROUP BY 1,2,3,4 ORDER BY 1,2,3,4;
```

`zona.nombre` está verificado (`model Zona`). El detalle va comentado: se pega dentro del mismo `WITH`. El
resultado se anota en `progress/features/SLT-248.md` y no bloquea el PR: el cambio no migra datos.

## Tasks

- [ ] **T0 (leader, solo lectura):** correr la consulta de arriba en prod y anotar el resultado en
  `progress/features/SLT-248.md`. *Hecho:* números por estado anotados, con fecha.
- [ ] **T1 — clasificación:** en `lib/utils/estados-bodega-satelite.ts`, `reprogramado: "se_mueve"` y
  `novedad: "se_mueve"`. Quitar `"por_liberar"` de `ClaseReconciliacionZona` y actualizar el docstring
  (la viñeta de `por_liberar` sale, se cita SLT-248 y `novedad` deja de figurar entre las devoluciones).
  *Hecho:* `pnpm run typecheck` señala los consumidores de T2 y nada más.
- [ ] **T2 — motivo y pantalla** (depende de T1): quitar `"por_liberar"` de `MotivoSaltada` y de su
  docstring (`lib/types/actualizacion-zonas.ts`), y la entrada de `TEXTO_MOTIVO_SALTADA` en
  `app/(app)/ordenes/_components/ActualizarZonasButton.tsx`. Revisar el comentario de
  `motivoDeSaltada` (`lib/services/ActualizacionZonasService.ts`) y tocarlo solo si nombra la clase.
  *Hecho:* typecheck y lint verdes.
- [ ] **T3 [P] — ayuda:** en `docs/ayuda/oficina/ordenes.md > Actualizar zonas`, quitar la viñeta
  «esperando liberación en bodega». En `docs/ayuda/oficina/configuracion-zonas.md > Editar y eliminar`,
  cambiar «Las que ya tienen el paquete en una bodega» por «Las que tienen el paquete en el estante de
  una bodega satélite», porque una reprogramada en bodega ahora sí cambia de zona. *Hecho:* ninguna
  ayuda nombra «esperando liberación» y `pnpm run test:guardias` sigue verde.
- [ ] **T4 — tests de SLT-224 que fijan la exclusión** (depende de T1-T2). Se actualizan:
  - `tests/unit/utils/clase-reconciliacion-zona.test.ts`: «se mueve» literal con `reprogramado` y
    `novedad`; `devolucion` literal sin `novedad` (5); quitar `deClase("por_liberar")`;
    `ESTADOS_QUE_NO_SE_MUEVEN` literal con 9 estados (título «(9 estados)»).
  - `tests/unit/repositories/zona-repository.test.ts` (≈ línea 769): `NO_SE_MUEVEN` literal con 9,
    sin `novedad` ni `reprogramado`, y su comentario.
  - `tests/unit/services/actualizacion-zonas-action.test.ts`: la precedencia con `reprogramado` y
    `cobroEnCurso: true` pasa a `cobro_en_curso` (R1802); los estados de devolución son cinco, sin
    `novedad`; el `it` de «`reprogramado` … por_liberar» pasa a «`reprogramado` y `novedad` sin cobro
    no se saltan» (`null`, R1803).
  - `tests/components/ActualizarZonasButton.test.tsx`: quitar G-4 `por_liberar`; añadir las claves
    literales de `TEXTO_MOTIVO_SALTADA` (`cobro_en_curso`, `devolucion`, `estante_satelite`,
    `finalizada`) y la ausencia del texto «esperando liberación en bodega» en el diálogo (R1804).
  - `tests/integration/db/reconciliar-zona-corte-vivas.int.test.ts`: `ESTADOS_R1723` con 6 estados;
    `estado-novedad` y `estado-reprogramado` pasan a `SE_MUEVEN`; casos nuevos
    `reprogramado`/`novedad` con un `cierre_detail` de un cierre `solicitado` en `NO_SE_MUEVEN` (R1802);
    `reconciliadas` y `acciones` de 3 a 5; título del `it` y mutación n.º 5 del docstring
    (`reprogramado: "por_liberar"` → rojo).
  - `tests/integration/db/actualizacion-zonas.int.test.ts`: `SALTADAS_ESPERADAS` sin
    `novedad:devolucion` ni `reprogramado:por_liberar`; `total`, `cantidad` y `actualizadas` de 4 a 6
    (líneas ≈ 293, 295, 325, 352, 356, 382 y 396); comentario de la línea 33.

  *Hecho:* `pnpm exec vitest related --run` sobre los archivos de T1-T2 en verde, **con la base
  desechable exportada**, porque los dos `.int.test.ts` sin base salen `skipped` y no `passed`. Cada
  integración se mata con una mutación: devolver `reprogramado: "por_liberar"` (o `novedad:
  "devolucion"`) pone rojo la matriz y la vista previa.
- [ ] **T5 — gate:** `./init.sh` en verde con `.env` copiado al worktree. *Hecho:* exit 0 anotado en el
  log.

## Archivos esperados

- `lib/utils/estados-bodega-satelite.ts`
- `lib/types/actualizacion-zonas.ts`
- `lib/services/ActualizacionZonasService.ts`
- `app/(app)/ordenes/_components/ActualizarZonasButton.tsx`
- `docs/ayuda/oficina/ordenes.md`
- `docs/ayuda/oficina/configuracion-zonas.md`
- `tests/unit/utils/clase-reconciliacion-zona.test.ts`
- `tests/unit/repositories/zona-repository.test.ts`
- `tests/unit/services/actualizacion-zonas-action.test.ts`
- `tests/components/ActualizarZonasButton.test.tsx`
- `tests/integration/db/reconciliar-zona-corte-vivas.int.test.ts`
- `tests/integration/db/actualizacion-zonas.int.test.ts`
- `progress/features/SLT-248.md`

## Tamaño

13 archivos (tope 40; 80 % = 32). Producción: unas 15-25 líneas en 4 archivos, la mayoría docstring y
borrado de la clase. Docs de ayuda: unas 4 líneas. Tests: unas 60-90 líneas en 6 archivos.

## Preguntas abiertas

Ninguna que bloquee. Una nota para Carlos en Preview: una `reprogramado` que se mueve de una satélite
a la central se libera como `en_bodega_central` aunque el paquete siga en el estante de la satélite.
Es lo que aceptó en D1 («el cliente ya está moviendo sus paquetes»), y es el atasco que la P4 de
SLT-224 quería evitar. Si en Preview prefiere otra cosa, se abre ficha aparte.
