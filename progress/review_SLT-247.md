# Review SLT-247 «Cierre rechazado: el mensajero gestiona las órdenes que pasaron a Novedad interna antes de reenviarlo»

Revisor: reviewer (vuelta 1, 2026-11-20). Diff: `git diff origin/dev...HEAD` (9 commits, 71 archivos, hasta `c12aa49a`).
Ruta completa (toca dinero): correcto.

## Veredicto: APROBADA (OK)

Ningún bloqueante. Cuatro menores y tres notas, abajo. Los menores 1 y 2 hay que resolverlos antes de abrir el PR,
y son del leader: merge de `dev` y marcar las tasks.

## Checklist

- [x] **Ruta.** Completa, con requirements, design y tasks. Toca dinero, estados de orden y el reenvío del cierre.
- [x] **Lo que ya existe** (`design.md`). Está la tabla con 7 filas. El diff reutiliza el predicado de la 477, el corte
  gemelo, `resolverCierre` y `CorregirCierre`/`DetalleCierre`. No vuelve a crear nada de esa lista.
- [x] **Trazabilidad.** Cada R1770–R1800 tiene su test en `progress/impl_SLT-247.md` (tres mapas, uno por tanda).
  Los he contrastado con los archivos. R1786 y R1787 van a tests de 477/454 que no cambian. Lo acepto: «idéntico a
  hoy» se prueba justo así.
- [~] **Tasks.** T1–T3 marcadas `[x]`. Quedan sin marcar T0.1 (hecha: el resultado está en
  `progress/features/SLT-247.md > Producción`), T4.1 (hecha: el mapa está en el impl), y T4.2 y T4.3, que van
  después del PR (Preview y prod). Es el menor 2.
- [x] **Tamaño.** `node scripts/tamano-pr.mjs` da 66/40 archivos, 958/1000 de producción y 1863/3000 de tests. Está
  aceptado con la línea `tamano-pr-aceptado` en `progress/features/SLT-247.md` (OK escrito de Carlos).
- [x] **Typecheck.** `pnpm run typecheck`: exit 0.
- [x] **Lint.** `pnpm run lint`: exit 0, 0 errores.
- [x] **Guardias.** `pnpm run test:guardias` con base desechable: 360/360 archivos, 5432 passed y 1 skipped.
- [x] **Tests del diff.** Corrí los 47 archivos de test que toca el diff más `tests/integration/db/454`: 91/91
  archivos, 1425 passed. Los de 247/477/cierre-sin-gestion y los de servicio y componente: 16/16 archivos, 347 passed
  y 0 skipped. Corte, cierre y 264/271/451/477 de integración: 17/17 archivos, 126 passed. Todo sobre una base
  desechable NUEVA (`servi_rev247`, con `migrate deploy` y `db:seed`). No usé la base del `.env`.
- [x] **Migración.** `20261124130000_…` trae `down.sql`. El down retipa las dos columnas que usan el enum y
  recrea el CHECK de `orden_evento`. El orden es correcto respecto a la `20261124120000` de SL-21 que trae dev. No se
  editó ninguna migración ya aplicada.
- [x] **Multi-empresa.** No hay tablas nuevas. Las consultas Prisma nuevas corren dentro de la tx con la extensión,
  con `servi_app` y RLS. El SQL a mano nuevo vive en `correccion-cierre.ts`, que ya está en `EXCEPCIONES_SQL_A_MANO`,
  y la lista no crece. R1777 está probado con dos empresas contra Postgres (`247-sin-gestion-rechazado` › R1777).
- [x] **País y moneda.** Sin literales de país, moneda ni Ordenex. No hay `console.log` nuevos.
- [x] **Dependencias.** No entra ninguna.
- [x] **Comentarios.** Explican el porqué: la regla, la carrera, por qué falla cerrado.
- [x] **E2E en local.** Hay constancia en el impl: `e2e/cierre-rechazado-sin-gestion.spec.ts` 5/5 y grupo `dinero`
  137/137 sin reintentos. No lo he vuelto a correr: lo corre el CI.
- [ ] **`gate-completo` en CI.** Pendiente: todavía no hay PR. Además la rama está en conflicto con `origin/dev` (menor 1).

## Verificación específica (lo que pidió el leader)

**SQL probado contra Postgres y matado por mutación.** Repetí 9 mutaciones yo mismo sobre la base desechable. Todas
salieron rojas y todas se restauraron (`git diff --quiet` comprobado tras cada una):

| Mutación | Resultado |
|---|---|
| predicado: sin la condición de R1790 (`g.cierre_id IS NOT NULL AND g.created_at > csg.created_at`) | 2 failed |
| predicado: sin `g.cierre_id = csg.cierre_id` (solo queda R1790) | 1 failed |
| predicado: rama `sin_gestion` sin `c.estado = 'rechazado'` | 1 failed |
| corte: sin el fragmento en el barrido de `crearCierre` | 2 failed |
| corte: sin el fragmento en la selección (`CorteDiarioRepository`) | 1 failed |
| confirmación física: `findBarridasDelCierre` sin `novedad_interna` | 2 failed |
| rechazo: sin `mensajeroAsignadoId` en la guarda del retorno | 1 failed |
| reenvío: sin `congelarDetalleDeOrdenes` | 2 failed |
| reenvío: sin el bloqueo de pendientes | 9 failed |

**El rechazo devuelve las barridas.** Está en `CierresAdminRepository.resolverCierre`, dentro de la misma
`$transaction`, y solo corre si se cumplen `res.count === 1 && nuevoEstado === "rechazado"`. Solo toca la barrida que
cumple tres cosas: es de ESE cierre (`cierre_sin_gestion.cierre_id`), sigue `novedad_interna` y es del mensajero del
cierre (`deletedAt: null`). La guarda es la misma en el `findMany` y en el `updateMany`. Solo cambia `estatusId`. Cada
orden movida deja su fila en el historial por `appendCambioEstado`, con `retorno_por_rechazo_cierre`, el actor que
rechazó y sin gestión. Hay arista #74 en el grafo. Un `vencido` que se reenvía sin rechazo sigue por
`transicionarASolicitado`, que no se toca (R1787).

**El reenvío.** El bloqueo va tras el `FOR UPDATE` del cierre y antes de escribir nada: lanza una excepción y la tx
revierte. Después se crea `cierre_detail` solo para las vinculadas que no tienen detalle en ESE cierre, se congela el
pago (después del detalle) y se recalculan los seis totales sobre las gestiones vigentes vinculadas. No hay doble
conteo: el detalle tiene un grano único por `(cierre, orden)` y los totales salen de las gestiones vinculadas, no del
detalle. `congelarDetalleDeOrdenes` está movida tal cual. Lo comparé con `git diff -w` contra
`origin/dev:lib/repositories/CierreDiaRepository.ts` (L1555-1672) y solo cambian tres cosas: `this.tarifaRepo` pasa a
ser un parámetro, `cierre.id` pasa a ser `cierreId`, y el `return`. Además, `origin/dev` no ha tocado ese archivo desde
el merge-base.

**El desvío de R1790.** No abre un hueco de dinero ni deja órdenes huérfanas. Si el corte se lleva la gestión a un
cierre posterior Y, la orden sale del predicado. Así no se vincula a X, no tiene detalle en X y X no cuenta su dinero.
Y la cuenta una vez, porque `crearCierre` le crea su detalle. Recorrí los casos borde:
- **La gestión se anula después en Y.** La orden vuelve a ser obligatoria de X y queda «en corrección» de Y por la
  rama `detalle`. La siguiente gestión sin cierre la vincula quien se reenvíe primero. Si es X, Y poda su detalle al
  reenviarse (477/R18). Si es Y, X la excluye por la regla de R1790.
- **Gestión vigente anterior al barrido** (de un cierre W ya aprobado). No la excluye: el ancla `csg.created_at`
  separa ese caso, y la mutación lo mata.

Lo que sí deja es el limbo operativo del menor 3, que no es de dinero.

**El arreglo fuera del design (`detalle-cierre-vista.ts`, `paquetesVuelven`).** Es correcto y necesario para cumplir
R1791: «la pantalla pide exactamente lo que exige el servidor». `paquetesVuelven` solo se lee en modo `decidir` (el
pie «Revisar paquetes y aprobar» y la franja «Por revisar»), así que no cambia nada en los cierres históricos ya
aprobados. En `vistaMensajeroDesdeCierreDia` el filtro no tiene efecto: la audiencia mensajero no consume ese conteo.
Es inocuo. La orden obligatoria gestionada con devolución cuenta una sola vez por la vía `gestion`. Lo cubren
`detalle-cierre-vista.test.ts` (SLT-247/R1791) y el paso 5 del E2E.

## Hallazgos

1. **m — La rama está en conflicto con `origin/dev`.** `git merge-tree` da CONFLICT en
   `tests/integration/db/orden-traspaso-migration.test.ts`: SL-21 añadió su migración a la misma lista. Un PR en
   conflicto no corre el CI. Antes del PR: merge de `dev`, resolver la lista (las dos migraciones) y volver a correr el
   disparador `migration`. `origin/dev` no tocó ningún archivo de producción de esta ficha.
2. **m — Tasks sin marcar.** T0.1 y T4.1 están hechas pero siguen `[ ]`: hay que marcarlas. T4.2 (Preview con
   Carlos) y T4.3 (volver a medir la T0 antes del PR a `prod`) son de después del merge. Conviene dejarlas anotadas
   como tales en `## Cierre`.
3. **m — Limbo entre el fragmento del corte y el predicado.** `whereOrdenNoRetenidaPorRechazado` excluye del barrido
   toda orden con una barrida de un cierre `rechazado`. El predicado, en cambio, deja de exigir la orden cuya gestión se
   llevó un cierre posterior (R1790). Si esa gestión se aprueba y la orden vuelve a `en_reparto` sin gestión pendiente
   (un resultado que devuelva la orden a reparto), mientras X siga `rechazado` la orden queda sin barrer y sin exigir.
   No se pierde dinero: se barre en cuanto X se reenvía (R1789), y el mensajero sigue bloqueado por X. Es el mismo tipo
   de hueco que el design §5 ya acepta para la orden reasignada. Pide una línea en el design §5, o en `## Cierre` como
   deuda.
4. **m — El test de R1790 no afirma la mitad «cuenta una sola vez» en Y.** Hoy comprueba tres cosas: la gestión de A
   está en Y, hay 1 vigente y `detalleX = [b]`. No comprueba que `cierre_detail` de Y tenga A, ni que el `general` de X
   excluya los 1000 de A. Lo implican el recálculo por gestiones vinculadas y el `crearCierre` de siempre, pero R1790
   es un requisito de dinero y merece la aserción explícita.

## Notas

- **n1.** En `resolicitarCierreRechazado`, el `modeloCobro` que devuelve `congelarDetalleDeOrdenes` se descarta. No se
  le aplica `asegurarMismoModelo(modeloCobro, pagos)` como en `crearCierre`. Si el cobro de la tienda y el pago del
  mensajero resolvieran modelos distintos en el momento del reenvío, el reenvío no lo rechazaría como sí lo rechaza
  `crearCierre`. El design acepta la tarifa del día del reenvío, pero no habla de esta guarda. No lo pongo como
  bloqueante: no hay caso real y la 477 tampoco la aplicaba. Vale una ficha de deuda o una línea en `## Cierre`.
- **n2.** El retorno escribe el historial para `aMover`, que sale del `findMany`, sin comprobar que el `count` del
  `updateMany` coincida. Hoy es inalcanzable: la única salida de `novedad_interna` es la aprobación de ese mismo cierre,
  y el `updateMany` del cierre la serializa. Con `updateManyAndReturn` o comprobando el `count` quedaría blindado.
- **n3.** Durante la revisión, un error de `new URL` de mi script imprimió en mi propia salida de herramienta la URL
  de la base LOCAL de desarrollo del `.env` del worktree. Corregí el script, que desde entonces solo imprime booleanos.
  No sale de esta sesión ni está en ningún archivo commiteado. Lo dejo dicho por transparencia: si esa contraseña local
  se usa en algún otro sitio, conviene rotarla.
