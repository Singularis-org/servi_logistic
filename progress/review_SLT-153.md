# Review SLT-153 «Cabecera del detalle del cierre con rótulos y folio buscable» — vuelta 1

Ruta ligera, acotada a `git diff origin/dev...HEAD` (HEAD 56ff03ab). Revisor: reviewer (Opus).

## Checklist

- [x] Ruta: ligera aprobada por Carlos (un solo PR). Sin dinero, permisos, auth, integraciones ni
  migración; las consultas de servidor tocadas son lecturas de listados con test contra Postgres real.
- [x] Trazabilidad R450-R459: cada R con test real (literales de rótulos a mano en
  `DetalleCierre.test.tsx`, `CierreDiaPagina.test.tsx`, `detalle-cierre-vista.test.ts`; R456 en
  `FiltrosCierresBarraFolio.test.tsx`; R457 en `cierres-filtro-folio.test.ts` con contador de llamadas
  al repo y a la zona; R458/R459 en `cierres-filtro-folio-sql-real.test.ts`).
- [~] Tasks: T1-T5 `[x]`; T6 (cierre: gate + E2E) sigue `[ ]` aunque la bitácora y el leader dan
  INIT_EXIT=0 y E2E 2×54 passed. Ver menor 4.
- [x] Tamaño: `node scripts/tamano-pr.mjs` → aviso 32/40 archivos, 540/1000 prod, 1367/3000 tests. Bajo el máximo.
- [x] «Lo que ya existe»: reusa `normalizarFolio`, `BUSCA_POR_FOLIO`, `BuscadorFiltros`; no re-crea
  `idsDeCierresPorFolio` de `/cierre-dia` (ese filtra por mensajero; aquí es por empresa, sin él).
- [x] Typecheck `tsc --noEmit`: 0 errores.
- [x] Tests: los 6 archivos de la feature + `tests/unit/guards/` → 252/253 archivos verdes; el único
  rojo es `dependencias-declaradas-presentes.guardia.test.ts`, listado en `tests/baseline-rojos.json`
  (no es hallazgo). Integración: 19/19 passed, ninguno skipped (con base desechable `slt153_wt`).
- [x] No pisa a SLT-152 «Tablas de cierres legibles»: no toca `ColaCierres.tsx` ni la fila de gestión.
  Comparten 3 tests (`e2e/cierres-rediseno.spec.ts`, `CierreDiaPagina.test.tsx`,
  `CierresAdminDetalleUnico.test.tsx`); `git merge-tree` de las dos ramas sale limpio.

## Puntos pedidos por el leader

1. **Folio en servidor.** `{ id: { in: ids } }` entra en el `AND` de los recortes en los 6 `where`
   (`historicoWhere`, `colaWhere`, `historicoBodegaWhere`, `colaBodegaWhere`, `consolidablesWhere`,
   `cierresBodegaDeZonaWhere`); el alcance (`alcanceWhere`, `destinoZonaId: zonaId`, `zonaId`) queda
   como clave hermana intacta. El texto va como parámetro del tagged template, nunca interpolado, y ya
   normalizado (1-8 `0-9A-F`). Busca con `strpos(upper(right(id, 8)), $1)`: últimos 8, no el id entero
   (probado: «2A7E57» del primer bloque da 0). Folio imposible → `vacio` antes de leer zona o base, en
   los 12 caminos. Integración con dos empresas (DB1/BB1 con el mismo folio no salen) y dos zonas (Z1/Z2). OK.
2. **`_shared/folio-cierres-sql.ts`.** Las dos consultas filtran
   `organizacion_id = NULLIF(current_setting('app.organizacion_id', true), '')` por escrito (sin empresa,
   cero filas: falla cerrado), el mismo patrón que ya usa `CierresBodegaAdminRepository.idsRecibidosIncompletos`.
   `lib/db/excepciones-aislamiento.ts` no está en el diff: `EXCEPCIONES_SQL_A_MANO` no crece. OK.
3. **Cabecera.** `<dl>` con un `dt`/`dd` por par; literales a mano en los tests; variantes cubiertas:
   mensajero aprobado/rechazado (central), sin zona ni resolutor (R451, sin «—»), vencido, hoy sin
   solicitar, `/cierre-dia` pasado/rechazado/vencido, bodega sin y con marca. Un par vacío no se pinta
   (`conValor`). OK.
4. **Fuera de lo pedido.** (a) El buscador sin `disabled` mientras carga: correcto; `disabled` solo
   venía de los flags de carga, los selectores siguen deshabilitados y la clave de SWR lleva los filtros.
   Es lo mismo que ya hace `FiltrosColaPropiaBarra` en `/cierre-dia`. (b) Fila I1 de
   `cierres-trato-tu.guardia.test.ts` a «Busca por folio» en `cola-propia-vista.ts`: correcta, el texto
   viejo ya no existe y el nuevo es el que importa la barra.
5. **>20 caracteres.** Ver hallazgo 1 (mayor).
6. **SLT-152.** Ver checklist: no lo pisa.

## Hallazgos

1. **BLOQUEANTE (mayor, UX)** — Con 21+ caracteres en el buscador, el usuario ve un error genérico de
   carga. `BuscadorFiltros` no tiene `maxLength` (ni prop para ello) y `aFiltros` en
   `app/(app)/cierres-admin/_components/FiltrosCierresBarra.tsx` manda `termino.trim()` sin tope. El
   schema (`MAX_FOLIO_FILTRO = 20`) responde `validation_error`, el fetcher del módulo hace
   `throw new Error(res.status)` (`CierresAdminModule.tsx:409/420`) y las dos listas pintan, p. ej.,
   «No se pudo cargar el histórico de cierres.». Caso realista: pegar el id entero del cierre (36
   caracteres, el que va en `?cierre=`). Falta: que el campo no pueda emitir más de
   `MAX_FOLIO_FILTRO` (p. ej. recortar a 20 en `aFiltros`, o un `maxLength` que `BuscadorFiltros`
   reenvíe al `<Input>`), con un test en `FiltrosCierresBarraFolio.test.tsx` que escriba 36 caracteres
   y compruebe que la lista no queda en error. R457 sigue igual en el servidor. (La misma laguna existe
   ya en `/cierre-dia`, SLT-138; arreglarla en el componente compartido la cerraría en las dos.)
2. **menor** — Escalabilidad del `IN`: el SQL a mano lee los ids de TODA la empresa (sin zona ni
   lista) y un folio de 1 carácter casa ~40% de los cierres; esos ids viajan como parámetros del
   `id IN (...)`. Hoy el volumen es pequeño; con decenas de miles de cierres se acerca al tope de
   parámetros de Postgres (32767). No bloquea; anotar como deuda o exigir un mínimo de caracteres.
3. **menor** — `CierresBodegaAdminRepository.ts:~471-482`: `idsPorFolio` se insertó entre el JSDoc de
   `idsRecibidosIncompletos` y su función; ese bloque queda colgado sobre el método nuevo (dos JSDoc
   seguidos). Mover `idsPorFolio` encima del comentario.
4. **menor** — `requirements.md > T6` sigue `[ ]`; marcarla al cerrar (gate y E2E ya corridos según la bitácora).

## Veredicto

**RECHAZADO** (CAMBIOS): un bloqueante, el hallazgo 1. El resto del diff (servidor, aislamiento,
cabecera, trazabilidad) está correcto.
