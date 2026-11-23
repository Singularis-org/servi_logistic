# Review SLT-136 «Planes: aviso, correo y descarga de la factura» · vuelta 1

Rama `feature/SLT-136-planes-aviso-descarga-factura`, HEAD `b6c47c4e`, diff contra `origin/dev`. PR #202.
Ruta completa (complexity `high`, dinero): correcta.

## Veredicto: RECHAZADO

1 mayor (BLOQUEANTE), 4 menores. El código y la trazabilidad están bien; lo que falta es la constancia de los
E2E afectados corridos en local.

## Checklist

- [x] Ruta: completa, como pide el suelo (dinero, permisos, complexity high).
- [x] Spec: `requirements.md` (R1–R33 EARS), `design.md` con `## Lo que ya existe` y 8 alternativas descartadas,
      `tasks.md` con todas las tasks `[x]` (56 `[x]`, 0 `[ ]`).
- [x] Lo que ya existe: el diff reutiliza `deLaEmpresa`/`conEmpresa`, `encolarEnEmpresas` (movido, no duplicado),
      `JobRepository.enqueue` con `dedupeKey`, `destinatariosDelAviso`, `componerCorreo`, `buildXlsxLibro`,
      `comprobarLimiteExcel`, `descargarBlob`, `sumaDeCuotas`, `aCentimos`/`aTexto`, `imprimible` (movida a
      `lib/pdf/imprimible.ts`). No re-crea nada de la lista.
- [x] Tamaño: `node scripts/tamano-pr.mjs` → 72/40 archivos, 1619/1000 líneas de producción, con el marcador
      `tamano-pr-aceptado` en `progress/features/SLT-136.md`.
- [x] Trazabilidad: mapa R1–R33 → test en `progress/impl_SLT-136.md`; revisé los tests de cada grupo y no hay
      ninguno vacío (detalle abajo).
- [x] Typecheck: `pnpm run typecheck` exit 0 (corrido por el reviewer).
- [~] Lint: `eslint` sobre `lib/facturas-plataforma`, `components/shared/facturas`, `jobs-factura-aviso.ts`,
      `FacturaPlataformaRepository.ts`, `emitir.ts`, `factura-emitida.ts` y el E2E: limpio. El lint completo queda
      para el CI.
- [x] Tests de la feature (base `servi_logistic_slt136`, corridos por el reviewer): 16 archivos y 216 tests verdes
      (migración, cierre-aviso, descarga, job de aviso, emitir, plantilla, resumen/pdf/excel, componentes, guardia
      de SLT-91, service, actions, jobs de cierre y registro). Otros 28 archivos y 448 tests verdes (notificaciones,
      inventarios de enums, WhatsApp, notificadores, MiPlanModule, FacturasDeLaEmpresa y la página de empresa).
      Guardias relacionadas (`pais`, `nombre-heredado`, `superficie`, `jobs-handler`, `push`, `notificacion`,
      `cobro-plataforma`…): 15 archivos y 291 tests verdes.
- [x] Autorización en el servidor: `descargaDeMiEmpresa` exige `ROLES_MI_PLAN` (solo `maestro`);
      `descargaDeEmpresa` exige `esPlataforma`; el rol se mira antes que la entrada y antes de leer la base. El
      admin, una petición sin sesión y el rol cruzado reciben `forbidden` (`factura-plataforma-service.test.ts:244-268`).
- [x] Aislamiento entre empresas: la empresa del maestro sale de la sesión (RLS + `WHERE` de `CERRADAS_JSON`); la
      del superadmin la liga la página con `.bind` y un `organizacionId` del `input` se pisa
      (`lib/actions/facturas-plataforma.ts:65-73`). Probado con dos empresas reales en
      `factura-plataforma-descarga.test.ts:234` (A no ve la cerrada de B) y `:342` (el superadmin que nombra B no
      descarga la de A).
- [x] Solo cerradas: `datosDescargaDeLaEmpresa` devuelve `null` si `estado !== "cerrada"`; los botones solo se pintan
      con `!esNoCerrada(factura)`.
- [x] Montos sin recalcular: el resumen usa `cargos`, `reversos`, `total_ordenes` y `total` de la base. Solo suma en
      céntimos exactos el importe por día y lo contrasta con la base (R15). El Excel usa `formato: "monto"`.
- [x] Migración: solo tres `ADD VALUE IF NOT EXISTS`, sin backfill. El `down.sql` es la función de la 462 con el
      sufijo `_136`, dentro de `BEGIN`; aborta con `RAISE` si una fila usa el valor y probado con un aviso y con un
      trabajo (`factura-plataforma-aviso-migration.test.ts:198`, `:222`) y es idempotente (`:248`).
- [x] Outbox en el cierre: `cerrar` corre `factura_plataforma_cerrar` y el encolado en la misma `$transaction`;
      `dedupe_key = factura_plataforma_aviso:<id>`. Probado: dos facturas, dos trabajos; repetir no añade nada; un
      aborto no deja trabajos, y un encolado que falla deshace el cierre (`factura-plataforma-cierre-aviso.test.ts:76-144`).
- [x] Aviso: una fila `alert` al rol `maestro`, entidad = la factura (dedupe estructural), sin montos; no es
      best-effort y va antes de los correos. Push `{ push: "si", roles: ["maestro"] }`. WhatsApp `disponible: false`.
- [x] Correo: uno por maestro activo; si uno falla, sigue con los demás y lanza sin correos en el motivo; sin
      adjuntos; sin URL de la app → nota en lugar del botón.
- [x] Job: en `buildHandlers`, `MODULO_POR_JOB = "nucleo"`, no recurrente.
- [x] Enmiendas: SLT-118 R25 (test renombrado y comentario de `jobs-factura-plataforma.ts`; `docs/architecture.md`);
      guardia de SLT-91 R10 con la lista ampliada a exactamente los dos archivos y la autocomprobación que los exige.
- [x] E2E de la ficha: `e2e/facturas-plataforma.spec.ts` ampliado (en curso sin botones, PDF `%PDF`, Excel releído
      con exceljs, superadmin descarga el PDF), 2 corridas verdes y el proyecto `dinero` entero en verde (126) según
      la bitácora.
- [ ] **E2E afectados fuera de `dinero`: sin constancia** (mayor 1).
- [x] País y moneda: `money()`/`monedaConfig`; la hora por `fechaCalendarioPlataforma`/`horaDeParedPlataforma` de
      `ciclo.ts`; ningún literal de país en código nuevo (guardia `pais-sin-literales` verde).
- [x] Ningún recurso de Ordenex en las líneas añadidas. Ningún secreto. Ninguna dependencia nueva (jsPDF y exceljs
      ya aprobadas).
- [x] Capas: lectura en el repositorio, reglas en el servicio, borde en las actions con zod; el job valida su
      payload con zod.
- [x] Docs: `docs/architecture.md > Facturas de la plataforma` describe la descarga, el aviso, las enmiendas y el
      logo provisional.

## Hallazgos

### Mayores

1. **BLOQUEANTE — E2E afectados sin constancia de corrida local** (`docs/perfil-agentes.md > reviewer`: «PR que toca
   `db/`, pantallas o dinero sin constancia de los E2E afectados corridos en local»; `> Todos los agentes > E2E en
   local antes del PR`; `docs/checkpoints-proyecto.md > Flujos críticos > Aislamiento entre empresas`).
   - El diff toca `db/` (migración de enums), dos pantallas (`app/(app)/mi-plan/page.tsx`,
     `app/(app)/plataforma/empresas/[organizacionId]/page.tsx`) y añade un job con empresa
     (`factura_plataforma_aviso`).
   - `progress/impl_SLT-136.md` (Tanda 8) solo registra `e2e/facturas-plataforma.spec.ts` y el proyecto `dinero`.
   - `grep -rl` en `e2e/` por `mi-plan`, `plataforma/empresas` y `factura_plataforma` da además specs del proyecto
     `aislamiento` (`playwright.config.ts:88-110`) que no están en `dinero` y no se corrieron:
     - `mi-plan-cambiar-plan`
     - `planes-superadmin`
     - `pago-plataforma-sl45`
     - `cobro-plataforma-sl40`
     - `planes-costeo`
     - `superadmin-empresas`
   - Falta en particular `dos-empresas-humo`, que el checkpoint exige a toda feature que toque datos de negocio o un
     job.
   - Para cumplir: correr en una base desechable nueva, con `NEXT_PUBLIC_APP_URL` como en `gate.yml`, al menos
     `dos-empresas-humo`, `mi-plan-cambiar-plan` y `planes-superadmin`, o el proyecto `aislamiento` entero, que
     arrastra `plataforma-vacia`. Después, pegar la salida real en la bitácora.

### Menores

1. **Texto del aviso y período duplicados en tres sitios, sin test que los ate.**
   - `lib/notificaciones/emitir.ts:1627` (`periodoDeFactura`) repite `periodoNumerico` de
     `lib/facturas-plataforma/resumen.ts:125`.
   - `lib/services/email/plantillas/factura-emitida.ts:20` (`FACTURA_EMITIDA_TEXTOS.periodo`) repite a mano la frase
     de `textoFacturaEmitida` (`emitir.ts:1631`).
   - La decisión «la frase del período es la misma de la campanita» no contradice el spec, pero hoy puede divergir
     en silencio. Sugerencia: que el correo use `textoFacturaEmitida`/`periodoDeFactura`, o un test que compare las
     dos salidas.
2. **Importes del correo como párrafos «Concepto: importe»** (`factura-emitida.ts:56-62`).
   - El design §7.4 dice «una lista». No contradice R26: los cinco datos van, con `money()` sobre la base.
   - Es un desvío de diseño, justificado (`componerCorreo` no tiene bloque de lista), pero solo consta en la
     bitácora. Basta con anotarlo en el design o dejarlo dicho en el PR.
3. **`datosDescargaDeLaEmpresa` lee la cabecera fuera de la foto `RepeatableRead`**
   (`lib/repositories/FacturaPlataformaRepository.ts:360-368`).
   - `deLaEmpresa()` va antes del `$transaction`; la traza y el nombre, dentro.
   - En una factura cerrada es inocuo: la factura y su traza en `[desde, hasta)` ya no cambian, y R15 lo detectaría.
   - El comentario «de la misma foto» sobrevende un poco. Solo hay que ajustar el comentario.
4. **Lint completo no corrido en local.** Los subconjuntos están limpios (implementer y reviewer). Queda condicionado
   a `gate-completo` en verde en el CI antes del merge.

## Decisiones menores del implementer (sin spec)

| Decisión | ¿Contradice spec o docs? |
|---|---|
| Nota del desglose: «Cada cargo y cada reverso, con su guía y su remisión, va en el Excel de esta factura.» | No. R11 pide «una nota que remite al Excel para ver cada movimiento»; la cumple. |
| Importes del correo como párrafos «Concepto: importe» | No contradice R26. Se desvía del «una lista» del design §7.4 (menor 2). |
| Frase del período del correo igual a la de la campanita | No. R26 pide número y período, y la frase los lleva. Riesgo de divergencia (menor 1). |
| Botones bajo el encabezado del panel, antes de las cuotas | No. Es el «bajo la cabecera» del design §6. Que se vean aunque falle la lectura del detalle no choca con R19: dependen del estado de la fila, que ya es cerrada. |
| `horaDeParedPlataforma` nueva en `lib/planes/ciclo.ts` | No. El design §5 nombra `horaDePared(…, ZONA_CR)`; la puerta de `ciclo.ts` es la misma que `fechaCalendarioPlataforma`, la exige la guardia `pais-sin-literales` y deja un solo punto para SLT-90. Coherente con `docs/architecture.md`. |
| Seis inventarios de enums más, ampliados | No. El design §9 lo prevé («si el gate pone en rojo algún otro inventario… se amplía igual»). Cada cambio añade solo el valor nuevo. |

## Trazabilidad verificada (muestreo de contenido)

- R1/R2/R4/R6: `factura-plataforma-descarga.test.ts:141, 181, 219, 234, 321, 342`, con base real, dos empresas,
  230 movimientos sin paginar y una orden eliminada.
- R3/R5: `factura-plataforma-service.test.ts:244-309` y `facturas-plataforma.test.ts`.
- R7–R18: `tests/unit/facturas-plataforma/{resumen,pdf,excel}.test.ts`; los textos se extraen del PDF real.
- R14, R15, R20: `DescargarFactura.test.tsx:70-207`.
- R19: `DetalleDeFactura.test.tsx:229-247`, `MiPlanModule.test.tsx`, `plataforma-empresa-detalle-page.test.tsx`.
- R21, R25: `factura-plataforma-cierre-aviso.test.ts:76-144`.
- R22–R30: `jobs-factura-aviso.test.ts`, `emitir-factura-emitida.test.ts`, `catalogo-avisos.test.ts`,
  `push-elegibles.test.ts`, `eventos-envio.test.ts`, `plantilla-factura-emitida.test.ts`,
  `procesar-jobs-registro.test.ts`.
- R31: `factura-plataforma-aviso-migration.test.ts` y los inventarios. R32: `mi-plan-solo-maestro.guardia.test.ts`.
  R33: `e2e/facturas-plataforma.spec.ts`.

## Para la vuelta 2

Solo el mayor 1: la salida real de los E2E afectados en la bitácora. Los menores no bloquean.

## Vuelta 2 (acotada a 84f5b210..cf0b79dd)

### Veredicto: OK

El mayor de la vuelta 1 está resuelto y los menores 1 a 3 también. No hay regresiones en f5982fc8. Queda un hallazgo
de proceso: el PR se mergeó antes de esta vuelta.

### Checklist

- [x] **Mayor 1 (E2E afectados).** `progress/impl_SLT-136.md > Mayor 1` registra cuatro corridas del proyecto
      `aislamiento` entero, que incluye `plataforma-vacia`, `dos-empresas-humo`, `mi-plan-cambiar-plan`,
      `planes-superadmin` y las otras specs pedidas. Se corrieron sobre una base desechable nueva, con `next build` y
      `NEXT_PUBLIC_APP_URL` como en `gate.yml` y con `CI=1`. Las corridas 3 y 4, seguidas, dan `102 passed`.
- [x] **Rojos de las corridas 1-2 (`marca`, `rastreo-publico`, flaky `superadmin-arranque`): no son de esta ficha.**
      Lo verifiqué yo; no tomé la afirmación de la bitácora.
  - `git diff --name-only a9471ed9 f5982fc8` (`a9471ed9` es ancestro de HEAD) no toca `app/_landing`,
    `app/page.tsx`, `public/landing`, `next.config.*`, `package.json`, `pnpm-lock`, `playwright.config.ts`, el
    middleware ni esas specs.
  - En esa zona solo tocan `e2e/facturas-plataforma.spec.ts` (propia), `lib/config/marca.ts` (solo se añade
    `MARCA_FACTURA`, un export nuevo) y `public/brand/logo-singularis.png` (nuevo, no es de la landing).
  - El síntoma descrito no sale de este diff: timeout de `load` en `/` por `/_next/image?url=/landing/*.jpg`.
  - El CI lo confirma: el run 44164952802 sobre `f5982fc8` da `success` en `e2e (aislamiento)`, `e2e (dinero)`,
    `e2e (reparto)`, los tres shards de vitest, `estatico` y `gate-completo` (`gh run view`).
- [x] **Menor 1.**
  - `FACTURA_EMITIDA_TEXTOS.periodo` es ahora `textoFacturaEmitida` (la misma función, no una copia).
  - La plantilla usa `periodoDeFactura`.
  - `periodoNumerico` (PDF, navegador) sigue siendo una segunda implementación. Está justificado: importar
    `emitir.ts` arrastra `NotificacionRepository`/Prisma al cliente.
  - El test nuevo las ata con 6 pares de bordes (medianoche CR, `hasta − 1 ms`, fin de mes, cambio de año, febrero,
    un intervalo de 1 ms) y tiene controles con valor esperado escrito a mano.
  - No es un test vacío: comprueba la igualdad de funciones y la frase dentro de `correo.text`.
- [x] **Menor 2.** Nota en design §7.4 con el motivo: `componerCorreo` no tiene bloque de lista, y siguen los mismos
      conceptos en el mismo orden.
- [x] **Menor 3.** El comentario de `datosDescargaDeLaEmpresa` ya dice que la cabecera se lee fuera de la foto y por
      qué es inocuo. No cambia código.
- [x] **Menor 4 (lint completo).** Cubierto por `gate-completo` en verde en CI sobre `f5982fc8`.
- [x] **Regresiones de f5982fc8.**
  - El import nuevo `factura-emitida.ts → lib/notificaciones/emitir.ts` no crea ciclo: `emitir.ts` no importa
    plantillas ni jobs.
  - La plantilla solo la importa `lib/planes/jobs-factura-aviso.ts`, que es servidor. Ningún componente cliente la
    importa.
  - `tsc --noEmit` limpio. `eslint` sobre los tres archivos de código tocados, limpio.
  - `vitest run` de `emitir-factura-emitida`, `plantilla-factura-emitida`, `jobs-factura-aviso` y `pdf` (4 archivos,
    57 tests): verde.
- [x] **Trazabilidad.** El mapa R1–R33 de la bitácora sigue completo; f5982fc8 solo añade tests (R8/R22/R26 quedan
      reforzados). `tasks.md` no tiene ninguna casilla sin marcar.

### Hallazgos nuevos

1. **menor (proceso, no de código) — PR #202 mergeado a `dev` antes del OK del reviewer.**
   - `gh pr view 202`: `MERGED` el 2026-11-17T20:55:58Z, con head `f5982fc8`. Fue antes de `cf0b79dd` (bitácora con
     la salida E2E) y antes de esta vuelta 2.
   - El código mergeado es el mismo que reviso aquí y el gate de CI estaba en verde, así que no hay daño en el
     producto.
   - Choca con `CLAUDE.md > regla 5`: nadie mergea antes del aviso «#n listo para mergear».
   - `cf0b79dd` (bitácora) y este review quedan en la rama, no en `dev`. El leader decide si los lleva a `dev` y
     anota el desvío.
