# Review SLT-103 «Diálogos del módulo de cierres y trato tú» — rebanada 1

Reviewer, 2026-11-11. Rama `feature/SLT-103-dialogos-trato-tu`, HEAD revisado 984801fc, diff
`origin/dev...HEAD`. Ruta completa (`complexity: high`); la rebanada solo toca pantalla y tests.
Lo de `## Fuera de alcance` (SLT-133 «Mensajes del servidor de cierres en tú y con tildes», SLT-134
«Textos de pantalla de cierres en tú, con guardia») no se revisa aquí. Grafo: no usado (el índice de
este worktree no existe, como anotan el design y la bitácora); todo con Grep/Read.

## Checklist

- [x] **Ruta:** completa; el diff no toca dinero calculado, permisos, auth, integraciones ni
  webhooks (solo textos, visor y un resumen que pinta valores del servidor con `money()`).
- [x] **Spec:** requirements, design y tasks presentes; `design.md > ## Lo que ya existe` lleno y el
  diff no re-crea nada: al contrario, quita dos visores duplicados (`cierre-detalle-shared.tsx` y el
  `Modal` en línea de `CierresAdminModule.tsx`/`CierreDiaModule.tsx`) y reutiliza `Modal`,
  `Button`, `money()` y la prop `mensajeSinSaldo` existente.
- [~] **Tasks:** todas `[x]` salvo dos de T6: «tamaño < 80 %» (no se cumple, anotado; ver menor m5) y
  «Preview con Carlos» (tarea del leader tras el merge, no del implementer).
- [x] **Tamaño:** `node scripts/tamano-pr.mjs` → 22/40 archivos, 897/1000 líneas: aviso, no pasa
  del máximo.
- [x] **Trazabilidad** (cada R con test que de verdad lo verifica):
  - R53 → `tests/unit/guards/cierres-dialogos-modal.guardia.test.ts` (sin `ui/dialog` fuera del
    marco del detalle; la excepción sigue existiendo).
  - R54 → `CierreEvidenciasVarias486.test.tsx` (un botón «Ver evidencia (3)», todas las URL en
    orden) + `VisorEvidencia.test.tsx` (Anterior/Siguiente, «foto i de n»).
  - R55, R140 → `CierreDiaModule.test.tsx` (pares del `<dl>` en orden: «Gestiones» «4»,
    «Recaudado» «₡285.275», «Tu ganancia» «₡45.000,55»; `efectivo ≠ general` a propósito).
  - R57, R141 (1.ª frase) → `CierresAdminPagoMensajero.test.tsx` (`sin_saldo`, texto literal, sin
    «tienda»). La 2.ª frase va a SLT-133 por spec.
  - R137 → guardia (título y declaración únicos) + `VisorEvidencia.test.tsx` (título, alt, Cerrar,
    Escape) + `CierreBodegaDetalleGestiones.test.tsx` (bodega) + `CierreEvidenciasVarias486`
    (cierre-dia, descripción con contexto) + `FilaGestion`/`CierreDetalleIncidente` (contexto).
  - R138 → 486 (1, n y 0 fotos, nombre accesible de hoy con 1), `FilaGestion` («Ver evidencia (2) …»),
    `VisorEvidencia` (sin «foto 1 de 1», sin botones).
  - R139 → `VisorEvidencia.test.tsx` (foto 1, Siguiente ×2 con disabled, Anterior, reabrir, sin
    contexto).
- [x] **Mapa R → test** en `progress/impl_SLT-103.md`.
- [x] **Typecheck:** `pnpm run typecheck` → `TC_EXIT=0` (corrido por mí).
- [x] **Lint** de los archivos tocados: `LINT_EXIT=0` (corrido por mí).
- [x] **Tests del diff:** los 10 archivos de test tocados, base `slt103_t0` → 10/10 archivos,
  244/244 tests (corrido por mí).
- [x] **Guardias:** la nueva y `liquidacion-money-safe` verdes. `pnpm run test:guardias` completo dio
  rojo solo en archivos ajenos al diff: `dependencias-declaradas-presentes.guardia.test.ts` (está en
  `tests/baseline-rojos.json`; el marcador de `init.sh` difiere ya en `origin/dev`) y tres
  `tests/integration/db/zona-*` que el patrón `guard` arrastra por «guarda/guardado» y que fallan
  con «Can't reach database server» (entorno). No son hallazgos.
- [x] **E2E en local** (pantallas de `app/`): constancia en la bitácora — `dinero` 95/0 (incluye
  `cierres-admin`, `cierre-bodega-satelite`, `cierre-dia`) y `aislamiento` 18/0, con `E2E_EXIT`
  dentro del log. Los dos E2E que nombran el visor (`cierres-admin.spec.ts:109`,
  `cierre-bodega-satelite.spec.ts:189`) usan una sola foto: el texto no cambia (R138).
- [x] **Sin dependencias nuevas, sin `db/`, sin migraciones, sin `lib/`.**
- [x] **Perfil (reviewer 5+):** sin literal de país o moneda en código nuevo (el «₡» solo en tests,
  como literal de contrato), sin Ordenex, sin `console.*`, comentarios explican el porqué.
- [x] **Trato «tú»** en los textos que crea la rebanada; ningún voseo añadido.

## Comprobaciones pedidas por el leader

**Mutaciones reaplicadas por mí (árbol restaurado, `git status` limpio tras cada una):**

| # | Mutación | Test | Resultado |
|---|---|---|---|
| M5 | `<Modal … title="Evidencia de la gestión" />` en `CierreDiaModule.tsx` | guardia | ROJO: «R137: … solo vive en dialogos-labels.ts», `expected [Array(1)] to deeply equal []` |
| M8 (nueva) | visor sin reset: `const i = Math.min(navegacion.indice, …)` sin comparar el objeto | `VisorEvidencia` | ROJO: «R139: cerrar y reabrir con otro objeto vuelve a la foto 1» (descripción) |
| M5b (sonda de falso negativo) | el mismo `Modal` con `title={"Evidencia de la " + "gestión"}` | guardia | VERDE: la guardia no lo ve (menor m1) |

**Guardia nueva `cierres-dialogos-modal.guardia.test.ts`.** Censo: los seis árboles de pantalla que
fija el design (`cierres-admin`, `cierre-dia`, `wallet/satelites`, `private/cierres`,
`shared/conciliacion`, `shared/liquidacion`); quita comentarios con el escáner de
`tests/fixtures/sin-comentarios.ts` (respeta cadenas y plantillas, así que una URL `//` no tapa
código). Control positivo (> 40 archivos y cinco rutas fijas) y contraprueba (muestra en claro y
comentada) correctos. Cubre lo que el design le pide; tiene falsos negativos posibles fuera de ese
contrato (m1-m3). Hoy, con Grep, ningún archivo del censo ni `DesglosePagoField`/`EscanerGuiaCard`
importa `ui/dialog`, `ui/sheet` ni `@radix-ui/react-dialog` salvo `DetalleCierre.tsx`.

**Desviación del visor (índice junto al objeto, sin `useEffect`).** Correcta: es el patrón de React
de «guardar información de renders previos», evita el `set-state-in-effect` que el lint rechaza y
da la misma conducta. Depende de que cada apertura sea un objeto nuevo: las tres pantallas guardan
en estado el objeto que crean `FilaGestion`, la `FilaGestion` de `cierre-factura.tsx` y
`columnaEvidencia` en cada clic, y la JSDoc de la prop lo dice. El test «cerrar y reabrir con otro
objeto» lo cubre de verdad (M8 lo pone en rojo; el visor sigue montado entre aperturas, así que el
estado sí sobreviviría sin el reset).

**Literales cambiados en tests existentes.** «Ver evidencia (3)» (`CierresDescarga.test.tsx`,
486, `FilaGestion`) y «₡285.275» están escritos a mano; ningún test tocado importa
`dialogos-labels.ts`, `etiquetaVerEvidencia`, `contextoEvidencia` ni `PAGO_MENSAJERO_TEXTO.sinSaldo`.
«₡285.275» sin «,00» es la salida real de `money("285275.00")` (el test pasa) y es coherente con
«₡45.000,55» en el mismo `toEqual`: es contrato, no derivado de su fuente.

**Censo de `liquidacion-money-safe`.** Solo añade `VisorEvidencia.tsx` y `dialogos-labels.ts` a
`ARCHIVOS_DE_LA_FEATURE`; no quita nada ni añade excepciones. La guardia queda más estricta (más
archivos barridos), no más floja.

## Hallazgos

Bloqueantes: ninguno.

Menores:

- **m1 (menor)** — La parte R137 de la guardia solo ve el literal exacto «Evidencia de la gestión» y
  `function VisorEvidencia`. Un cuarto visor con `title={VISOR_EVIDENCIA_TEXTO.titulo}`, con el
  literal partido (M5b, verde), o declarado como `const VisorX = () =>` pasa. Cubre lo que pide el
  design; para endurecerla, buscar `VISOR_EVIDENCIA_TEXTO.titulo` fuera de `VisorEvidencia.tsx` y
  `alt="Evidencia fotográfica…"`/`VISOR_EVIDENCIA_TEXTO.alt` fuera del dueño.
- **m2 (menor)** — La parte R53 solo detecta el alias `@/components/ui/(alert-)?dialog`. No ve
  `@/components/ui/sheet` (también es un diálogo), `@radix-ui/react-dialog` directo ni una ruta
  relativa. Además el censo deja fuera `components/shared/DesglosePagoField.tsx` y
  `EscanerGuiaCard.tsx`, que `## Definiciones` incluye. Hoy ninguno lo usa (Grep).
- **m3 (menor)** — El control positivo no fija ningún archivo de `app/(app)/wallet/satelites` ni de
  `components/shared/liquidacion`: si se renombra uno de esos árboles, `listar` lo salta en silencio
  y el censo sigue > 40.
- **m4 (menor)** — R137 dice «Cerrar, Escape o fuera del visor»; hay test de «Cerrar» y Escape, no
  del clic fuera. Va por el mismo `onOpenChange(false)` de `Modal` que Escape, así que el riesgo es
  bajo.
- **m5 (menor)** — `tasks.md > T6` deja dos casillas sin marcar: «tamaño < 80 %» (90 %, anotado en la
  bitácora; no pasa del máximo) y «Preview con Carlos» (le toca al leader antes de promover). No
  bloquean, pero el leader debe cerrar la de Preview.

## Veredicto

**OK** — 0 bloqueantes, 5 menores.
