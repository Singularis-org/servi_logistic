# Review SLT-176 «Sacar de CierreBodegaService las lecturas de cifras de presentación del cierre»

reviewer · 2026-11-16 · ruta completa · diff `origin/dev...818c39e3` (PR #185) · código de dinero.
MCP del grafo: no usado (worktree sin indexar); Grep/Read y ejecución.

## Checklist

- [x] **Trazabilidad R690-R705**: cada R tiene test que falla si se rompe (mapa en `progress/impl_SLT-176.md`; verificado abajo).
- [~] **Tasks**: 19 `[x]`; quedan `[ ]` `tasks.md:93` (`./init.sh`) y `tasks.md:94` (E2E locales), delegados por el leader (gate local) y a CI. Ver m1.
- [x] **Tamaño**: `node scripts/tamano-pr.mjs` → 13/40 archivos, 279/1000 producción, 346/3000 tests.
- [x] **`design.md > ## Lo que ya existe`**: presente y con contenido; el diff no re-crea nada de la lista (mueve un método, no duplica).
- [x] **Sin `db/`, `CierresAdminService.ts`, `ICierresAdminService.ts`** (R703, R704): `git diff --name-only origin/dev...HEAD` sin coincidencias.
- [x] **Typecheck** `tsc --noEmit -p .` → exit 0, 0 errores.
- [x] **Lint** de los 13 `.ts` tocados → 0 errores, 1 warning previo (`deudas-d39-d40-modelo-nuevo.test.ts:206`, ajeno).
- [x] **Tests** (9 archivos, con `servi_slt176_desechable`): `Test Files 9 passed · Tests 104 passed`, 0 saltados; 23 `✓` de integración contra Postgres.
- [x] **checkpoints-proyecto**: sin tablas, queries, migraciones, literales de país/moneda, Ordenex ni dependencias nuevas; lógica en `lib/services/`, borde zod sin cambios.
- [~] **E2E de dinero** (`perfil-agentes.md:78`): no corridos en local; en PR #185 `e2e (dinero)` y `e2e (aislamiento)` estaban `pending` al revisar, `e2e (reparto)` pass. Ver m1.

## Verificación propia

1. **Descarga de la satélite idéntica.** Comparé línea a línea el método antiguo
   (`origin/dev:lib/services/CierreBodegaService.ts:516-560`) con `CierresBodegaSateliteDescargaService.ts:79-124`:
   mismo guard de rol, misma zona, mismos filtros (`filtrosParaRepo(…, zonaPerezosa(reglasPais, op))` = antiguo
   `this.filtrosRepo`), mismo tope `MAX_FILAS`, misma rama R384, misma lectura en lote con `{ lectura: "zona", zonaId }`
   y mismo `anularEmpresaSiNoCentral` (R480). Solo cambia el texto de `OPERACION` (aviso declarado en requirements).
   Las columnas no se tocan (registro de descargas y pantalla fuera del diff). Los literales a mano siguen:
   `cierre-bodega-solicitados-modelo-nuevo-service.test.ts:158-169` (5 claves `null`, `gestiones: 1`,
   `pagosAjustados: 0`, sin `pagoEntregado`) y `:129-142` (importes del cálculo).
2. **R705**: `git diff -U0` de `tests/` (sin la guardia): ninguna línea `expect` cambia salvo en
   `cierre-bodega-cifras-cableado.test.ts`, que es el test de R698 (4 args, `argsSatelite` vacío). En
   `consolidacion-completo.test.ts` `servicioSeis` monta los mismos dobles que `servicio` (`:252-265`).
3. **Solo lectura de verdad.** Constructor (`CierresBodegaSateliteDescargaService.ts:34-45`): `Pick<…,"findCierresBodegaByZona">`,
   `Pick<…,"findUsuarioZonaId">`, `Pick<…,"zonaHoraria">` y `ICifrasBodegaLoteLectura` (interfaz de un solo método,
   `leerCierresDiaDeBodegas`). Imports de valor: `descargaConfig`, `zona-de-la-empresa`, `cifras-bodega-descarga`,
   `CierresAdminService`; ninguno es repositorio, `lib/db`, `@prisma/client` ni servicio de dinero de R631. Ver m2.
4. **Guardia R631**: `EXCEPCIONES = []`, `TOPE_EXCEPCIONES = 0`, aserción con literal `toBe(0)`.
   **Mutación transitiva propia** (3 saltos, no la del implementer): primera línea de `lib/utils/folio-cierre.ts`
   `import { cifrasDelCierre as _mutRev } from "@/lib/utils/cifras-cierre"; void _mutRev;` → guardia ROJA, 6 fallos,
   con `camino a modulo prohibido (lib/services/CierreBodegaService.ts:5): lib/services/CierreBodegaService.ts →
   lib/services/zona-de-la-empresa.ts → lib/utils/folio-cierre.ts → lib/utils/cifras-cierre.ts` (y los de
   CobroTienda, Liquidacion y RechazoTienda). Restaurada con `git checkout -- lib/utils/folio-cierre.ts`;
   `git status --porcelain` vacío después. Sin `git stash`.
5. **Desviación R701 caso 3** (`design.md:111` decía «exactamente un error»; el test `guardia.test.ts:474` afirma dos):
   correcta. Al importar el servicio de solo lectura, `CierreBodegaService` llega a DOS módulos prohibidos
   (`→ CierresAdminService → cifras-cierre` y `→ cifras-bodega-descarga → cifras-cierre-bodega`) y el barrido anota
   cada uno; las dos cadenas están escritas a mano. Lo que importa de R701 (rojo con la cadena entera, sin par que
   lo tape) se cumple. Declarada en la bitácora; el design no se actualizó (m3).

## Hallazgos

Ninguno mayor / BLOQUEANTE.

- **m1 (menor, condición de merge)** — `tasks.md:93-94` sin marcar: `./init.sh` y E2E locales. El leader los
  delegó (gate local suyo, E2E en CI), pero `docs/perfil-agentes.md:78` pide constancia de los E2E afectados en un
  PR de dinero. Antes del merge: `./init.sh` verde del leader y `e2e (dinero)` + `e2e (aislamiento)` verdes en
  PR #185 (pendientes al revisar), y marcar las dos tasks.
- **m2 (menor)** — `CierresBodegaSateliteDescargaService.ts:18` importa por valor `CierresAdminService`, que a su vez
  importa `@prisma/client` (`CierresAdminService.ts:1`) y servicios de escritura (`CierreDiaService`,
  `liberacion-al-aprobar-cierre`). R697 solo exige imports directos y el spec lo acepta (CierresAdminService fuera de
  alcance por SLT-125); el constructor sin puertos de escritura hace la solo-lectura efectiva. Cuando SLT-125 libere el
  archivo, mover `anularEmpresaSiNoCentral` a un util puro cerraría el camino de módulo.
- **m3 (menor)** — `design.md:111` sigue diciendo «exactamente un error» para el caso 3 de R701; el test afirma dos
  (correcto). Alinear el texto del design o dejar la nota de la bitácora como única fuente.

## Veredicto

**OK** — sin bloqueantes. Condición de merge: m1 (init.sh del leader y E2E de CI en verde).
