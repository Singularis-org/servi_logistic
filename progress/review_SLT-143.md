# Review SLT-143 «El superadmin registra un pago hecho por fuera y anula un pago confirmado»

PR #250 · rama `feature/SLT-143-pago-plataforma-por-fuera` · ruta **completa** (dinero, migración) · vuelta 1
(2026-11-19, `dev...383ed771`).

## Verificación ejecutada por el reviewer

| Qué | Resultado |
|---|---|
| `pnpm exec tsc --noEmit` (NODE_OPTIONS 8 GB) | exit 0 |
| `eslint --max-warnings=0` sobre los `.ts/.tsx` añadidos o cambiados del diff | exit 0 |
| `vitest` unit + componentes + página + guardia RLS (12 archivos: servicio, actions, autoría, monto, labels, descarga, ayuda R35, `PagosConfirmados`, `RegistrarPagoPorFuera`, `PagosPorConfirmar`, `plataforma-empresa-detalle-page`, `rls-por-empresa.guardia`) | 12/12 archivos, 299/299 |
| `vitest` integración con base: `pago-plataforma-por-fuera`, `migracion-slt143-ida-y-vuelta`, `pago-plataforma-confirmacion` (SLT-60 sin tocar), `empresas-plataforma-deuda-sl45` | 4/4 archivos, 56/56, 0 skipped |
| `node scripts/tamano-pr.mjs` | 48/40 archivos, 2110/1000 prod, 3341/3000 tests: **aceptado** por el humano (marcador en `progress/features/SLT-143.md`). No es hallazgo |
| CI del PR #250 | en curso al revisar (vitest, estático, e2e dinero/aislamiento/reparto: pending) |
| E2E | no corrido (instrucción del leader y memoria del humano: el E2E se valida en CI) |

Grafo: no consultado (el leader confirmó que el worktree no estaba indexado); se exploró con Grep/Read.

## Checklist

### Ruta y especificación
- [x] Ruta completa: correcta para dinero + migración.
- [x] `requirements.md` con R1–R36 en EARS.
- [x] `design.md` con alternativas descartadas (§10) y `## Lo que ya existe` al principio, con búsqueda y tabla.
      El diff reutiliza lo listado (`factura_plataforma_saldos`, `proponerReparto`, `registrarConComprobante`,
      `instanteDelMovimientoManual`/`fechaMovimientoSchema`, `verComprobantePagoPlataformaAction`); el reparto de
      `pago_plataforma_confirmar` se extrae a `_pago_plataforma_aplicar` en vez de copiarse. No se re-crea nada.
- [x] `tasks.md`: 32 tasks, todas `[x]` (T5.2 marcada como delegada al CI, ver menor 2).

### Tamaño
- [x] Sobre el tope y aceptado por el humano (marcador vigente).

### Trazabilidad
- [x] Mapa `R → test` en `progress/impl_SLT-143.md` (R1–R36). Revisé los tests clave: no están vacíos y la
      integración tiene las 5 mutaciones de design §8 medidas (todas matan).
- [~] **R13 y R36: la parte «ni el id del superadmin llega a la empresa» no está cubierta y no se cumple**
      (hallazgo B1).

### Dinero
- [x] Céntimos `bigint` en cliente y servicio (`aCentimos`/`aTexto`, `money()`), sin `Number(`/`parseFloat`.
- [x] Tope del monto 9 999 999 999,99 (`montoPagoPorFueraSchema`, con test de borde) antes del `DECIMAL(12,2)`.
- [x] Reparto de SLT-60 reusado en la base (`_pago_plataforma_aplicar`, mismos códigos `SL060`) y en el cliente
      (`proponerReparto`, `resumenDelReparto`, `RepartoEntreFacturas` sacado de `PagosPorConfirmar`). SLT-60
      sigue verde sin tocar sus tests.
- [x] Tope de lo disponible: el trigger de SLT-60 en el INSERT, traducido a `validation_error` en `monto` (R6);
      candado `pago_plataforma:<org>` común a registro, confirmación, anulación y wallet (R11, R24).
- [x] Anulación: constancia + contra-asiento `ingreso_ajuste`/`gasto` idéntico a `EgresoCajaAnulacionService`;
      no toca facturas ni aplicaciones (R30); deuda y «Pagado» filtran anulados (R26).

### Autorización
- [x] Solo superadmin: `esSuperadmin` antes de zod y de la base en `registrarPorFuera` y `anularConfirmado`
      (R31, tests con cada rol); la página da `notFound()` a otro rol antes de leer; las funciones son del dueño
      con `REVOKE EXECUTE … FROM PUBLIC`.
- [x] La action del comprobante no filtra información a un no-superadmin (devuelve `forbidden` antes del error
      del archivo).
- [x] R15/R29: la empresa sigue bloqueada en la base; el trigger solo cede si existe la fila de
      `pago_plataforma_anulacion`, que `servi_app` no puede escribir.

### Datos y seguridad
- [x] Tabla nueva `pago_plataforma_anulacion` con `organizacion_id`, FK CASCADE, índice, RLS
      `…_por_empresa`, `REVOKE INSERT, UPDATE, DELETE … FROM servi_app`, inmutable, misma empresa (generados) y
      sin cambio de empresa. Guardia RLS a 93 tablas, `TRIGGERS_MISMA_EMPRESA` a 181. Test de dos empresas (R32).
- [x] Migración con `down.sql`: aborta si hay anulaciones, repone literales los cuerpos de SLT-60 y quita lo
      nuevo; test de ida y vuelta con `pg_get_functiondef` (R33). No edita migraciones aplicadas.
- [x] Sin literales nuevos de país/moneda ni recursos de Ordenex (las apariciones de «Costa Rica»/«SINPE» en el
      diff son líneas de contexto, no añadidas). `ZONA_CR` en las fechas de la pantalla de plataforma, como SLT-60
      (decisión vigente hasta SLT-90).
- [ ] **Ningún dato del superadmin a la empresa (R13, R36): falla** (B1).

### Marca en la wallet
- [x] «Registrado por la plataforma» y «Anulado por la plataforma» en «Registró» (tabla, detalle, descarga) vía
      `LibroCajaAutoriaService` + `textoRegistro`, sin «Automático · »; la línea de anulación dice «por la
      plataforma». Una anulación de la empresa conserva el nombre. Tests unitarios, integración y E2E.

### Calidad
- [x] Typecheck y lint verdes (los corrí).
- [ ] `gate-completo` y `e2e` del CI: en curso al revisar.
- [x] Sin dependencias nuevas.
- [x] Comentarios explican el porqué.

## Hallazgos

### B1 — BLOQUEANTE · R13/R36: el id del superadmin llega al navegador de la empresa

R13: «Ni el nombre ni el id del superadmin DEBEN llegar a la empresa». R36 lo repite para la anulación.

El pago por fuera y su contra-asiento se guardan con `registrado_por = <id del superadmin>`
(`pago_plataforma_registrar_por_fuera` y `pago_plataforma_anular_confirmado`). El libro de la wallet de la
empresa los lee con `WalletMovimientoRepository.listar` (`w."registrado_por" AS "registradoPor"`), y `toDTO`
(`lib/repositories/WalletMovimientoRepository.ts:77`) lo copia a `WalletMovimientoDTO.registradoPor`. Ese DTO es
la respuesta de `listarMovimientosAction`, que llama el componente cliente `WalletModule.tsx`: el uuid del
superadmin viaja en la respuesta de la Server Action al navegador del maestro/admin. No se pinta, pero «llega a la
empresa». El `marcasDeLaPlataforma` arregla solo la `RegistroDTO` de la autoría.

Los tests que citan R13/R36 miran solo la autoría (`libro-caja-autoria-plataforma.test.ts`,
`pago-plataforma-por-fuera.test.ts` «sin nombre ni id» sobre `registro`), no el DTO del libro.

**Qué falta:**
- que ninguna respuesta de la wallet a la empresa lleve el id del superadmin en las filas del pago por fuera
  ni del contra-asiento de la plataforma. Hay que cubrir `listar`, la descarga/kardex y el detalle de una fila. El
  campo no tiene lector en `app/` ni en `components/`, y la descarga ya lo excluye (R23 de la feature 170). Así que
  basta con no enviarlo, o con enviarlo nulo cuando el usuario no es de la empresa. La forma la elige el
  implementer;
- un test que lo pruebe, de integración sobre la action/servicio del libro con el pago por fuera y su
  contra-asiento: `registradoPor` no es el id del superadmin.

### m1 — menor · E2E sin corrida local
`docs/perfil-agentes.md > reviewer` pide constancia de los E2E afectados corridos en local en un PR que toca
`db/`, pantallas y dinero. La bitácora deja constancia de que **no** se corrieron (T5.2 delegado al CI). La
decisión del humano (gate y E2E en CI por memoria de la máquina) lo cubre. Por eso no lo marco bloqueante, pero
es **condición de merge**: `e2e (dinero)` en verde en el CI del PR #250. Ese grupo incluye
`pago-plataforma-por-fuera`, `pago-plataforma-confirmacion`, `pago-plataforma-sl45` y `wallet*`.

### m2 — menor · bitácora desactualizada
`progress/impl_SLT-143.md`, veredicto T6.3: «R34 depende del E2E… R35 no tiene test». Las secciones de después
(T5 y el commit `4479afde`) lo resuelven. Conviene corregir esa línea para que el mapa no se contradiga.

### m3 — menor · desvío de forma del design
Design §1.1 y §4.5 dicen `anulacion PagoPlataformaAnulacion?` y `confirmacion: { anulacion: null }`. Lo
implementado es la lista `anulaciones` con `none: {}` y `some: {}`, porque el único es compuesto. El comentario de
`schema.prisma` lo justifica y no cambia el comportamiento. Conviene anotarlo en el design para que coincida.

## Veredicto

**RECHAZADO**: un bloqueante, B1 (R13/R36: el id del superadmin llega a la empresa en `WalletMovimientoDTO.registradoPor`).
Lo demás (SQL, dinero, reparto, autorización, RLS, down, marca y tests) está bien y verificado. Tras arreglar B1,
la vuelta 2 puede acotarse a ese diff. El merge queda condicionado además a `gate-completo` y `e2e (dinero)` en
verde (m1).
