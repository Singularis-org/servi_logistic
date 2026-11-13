# Review SLT-119 «Planes: pantallas de facturas para el superadmin y el maestro» · vuelta 1

Rama `feature/SLT-119-planes-pantallas-facturas` (HEAD `6001f679`), PR borrador #146 contra `dev`. Ruta completa
(fullstack, medium; toca dinero y permisos: la ruta completa es la correcta). Revisado el 2026-11-12.

## Verificación ejecutada por el reviewer

- `pnpm run typecheck` (8 GB): sin errores.
- `pnpm exec eslint` sobre los `.ts/.tsx` añadidos o modificados del diff: sin errores ni avisos.
- `vitest run` de los 8 tests del diff + `MiPlanCambioDePlan.test.tsx` + guardias `cobro-plataforma-solo-por-trigger`
  y `mi-plan-solo-maestro`: 11 archivos, 228 pasados.
- `vitest run tests/integration/db/factura-plataforma-detalle.test.ts` (base local): 6 pasados.
- `pnpm run test:guardias`: 343 archivos verdes; 4 rojos en `dependencias-declaradas-presentes`, que está en
  `tests/baseline-rojos.json` (no es hallazgo).
- `node scripts/tamano-pr.mjs`: **rojo**, 27/40 archivos y **3027/1000 líneas**.
- `./init.sh`: no corrido; el leader informa rojo por el validador de features (cupo backend 6/5, geo en pausa
  aceptada por el humano). No es hallazgo de esta feature.
- E2E: no corridos por el reviewer (los corre el CI); revisada la constancia del implementer.

## Checklist

### CHECKPOINTS.md
- [x] Ruta completa, acorde al suelo (dinero y permisos).
- [x] `requirements.md` con R1–R19 en EARS.
- [x] `design.md` con alternativas descartadas y su porqué (§10).
- [x] `tasks.md`: todas `[x]`.
- [x] `design.md > ## Lo que ya existe` presente y con contenido; el diff reutiliza `deLaEmpresa`,
      `deEmpresaParaPlataforma`, `money`, `fechaCortaEnZona`, `ZONA_CR`, `Sheet`, `Table`, `Tabs`, `TEXTOS_TIPO_COBRO`;
      no re-crea nada de la lista.
- [ ] **Tamaño del PR**: 3027/1000 líneas sin `tamano-pr-aceptado` en `progress/features/SLT-119.md` → B1.
- [x] Equipo: assignee corregido al reimportar el board (según `progress/features/SLT-119.md`).
- [x] Trazabilidad R1–R19 → test (tabla abajo) y mapa en `progress/impl_SLT-119.md`.
- [x] Typecheck y lint sin errores.
- [ ] `gate-completo` en CI: pendiente (PR borrador). No bloquea esta review; bloquea el merge.
- [x] Flujo crítico de dinero con E2E (`e2e/facturas-plataforma.spec.ts`), salida local en la bitácora.
- [x] Sin dependencias nuevas.
- [x] Sin secretos, sin webhooks, nada de entorno hardcodeado.
- [ ] `./init.sh` verde: rojo solo por el board (contexto aceptado, ver arriba).

### docs/checkpoints-proyecto.md
- [x] Sin tablas ni migraciones nuevas.
- [x] Query nueva sobre `cobro_plataforma_traza`: la acota la extensión de empresa y la RLS; probada con dos
      empresas con líneas en el mismo intervalo (R12: el superadmin de A ve solo las 2 líneas de A; R14: A no ve
      las facturas de B, y B no ve las de A desde el superadmin).
- [x] Sin recursos de Ordenex. Sin `console.log` de secretos o PII (los `console.error` registran el error).
- [x] Capas: servicio con la autorización, repositorio con la lectura, action en `lib/actions/`.
- [x] zod en el borde (`detalleFacturaSchema`, `detalleFacturaEmpresaSchema`, `facturasDeEmpresaSchema`).
- [x] Sin literales de país ni moneda: `money()`, `ZONA_CR` vía constante.
- [x] Autorización en el servidor (servicio, antes de leer la base); módulo núcleo (`reparto.ts`).

### docs/perfil-agentes.md > reviewer
- [x] Sin `organizacion_id` faltante, sin tabla sin RLS, sin migración, sin literales de país, sin Ordenex.
- [x] Sin dependencia nueva.
- [x] Comentarios: explican el porqué (aislamiento, dos sentencias, `repeatable read`, ligado de la empresa).
- [ ] **E2E afectados corridos en local**: faltan los del proyecto `aislamiento` que recorren las pantallas tocadas → B2.

## Trazabilidad R → test (verificada leyendo los tests)

| R | Test | Comentario |
|---|---|---|
| R1 | `FacturasDeLaEmpresa.test.tsx`, `mi-plan-page.test.tsx`, `MiPlanModule.test.tsx`; orden en `factura-plataforma-service.test.ts` | ok |
| R2 | `facturas-vista.test.ts`, `FacturasDeLaEmpresa.test.tsx`, `DetalleDeFactura.test.tsx` (`en_curso` y `por_cerrar`) | ok |
| R3, R4 | `facturas-vista.test.ts` (los cuatro ejemplos; «N.º 7») | ok |
| R5 | `FacturasDeLaEmpresa.test.tsx`, `facturas-vista.test.ts` (suma en céntimos) | ok |
| R6, R9 | `DetalleDeFactura.test.tsx` | ok |
| R7, R8 | `factura-plataforma-detalle.test.ts` (orden por instante e id, Σ = `total_ordenes`, número = `movimientos`, reverso del 17 solo en la 2.ª) | ok |
| R10 | `factura-plataforma-detalle.test.ts` (100/100/30/0/0, sin repetir ni saltar) y `DetalleDeFactura.test.tsx` | ok |
| R11 | `factura-plataforma-detalle.test.ts` | ok |
| R12 | `factura-plataforma-detalle.test.ts` (superadmin = maestro, también en `comoPlataforma`), `plataforma-empresa-detalle-page.test.tsx` | ok |
| R13 | `factura-plataforma-service.test.ts` (repositorio que lanza), `facturas-plataforma.test.ts` | ok |
| R14 | `factura-plataforma-detalle.test.ts` (dos empresas), `factura-plataforma-service.test.ts` | ok |
| R15 | `factura-plataforma-service.test.ts` | ok |
| R16 | componentes (solo abrir, cerrar, paginar), `facturas-plataforma.test.ts` (solo dos actions), guardia `cobro-plataforma-solo-por-trigger` | ok |
| R17 | `mi-plan-page.test.tsx`, `plataforma-empresa-detalle-page.test.tsx`, `DetalleDeFactura.test.tsx`, `FacturasDeLaEmpresa.test.tsx` | ok |
| R18 | `FacturasDeLaEmpresa.test.tsx` | ok |
| R19 | `e2e/facturas-plataforma.spec.ts` (proyecto `dinero`; 4 tests, sin `waitForTimeout`) | ok |

## Desvíos declarados por el implementer

1. **`deEmpresa` con `organizacionId` no uuid lanza en vez de `validation_error`.** **Aceptado.** Design §3 define
   `FacturasResult` sin `validation_error` y R15 solo habla de la petición del detalle. El id sale de la URL, la
   página lo aísla en «No se pudieron cargar las facturas» (R17) y el `parse` va antes de leer la base; hay test
   («R15 (lista): …lanza sin leer la base»).
2. **`errores: Record<string, string>`.** **Aceptado.** Es literalmente el tipo de design §3; la frase «siguen los
   de `PlanesService`» del design era imprecisa. Sin consumidor que dependa de `string[]`.
3. **`MiPlanModule` con prop opcional `facturas: { lista, cargarDetalle }`.** **Aceptado** como menor (m1): la
   página siempre la pasa y `mi-plan-page.test.tsx` lo prueba, pero un olvido futuro escondería la sección en
   silencio.
4. **Archivo extra `tests/components/_facturas-plataforma.ts`.** **Aceptado** (fixtures de test; 27/40 archivos
   según `tamano-pr.mjs`). El problema de tamaño es de líneas, no de archivos (B1).

## Seguimiento m5 de SLT-118 «Planes: factura por empresa y período con la cuota y las órdenes»

**Cerrado.** `FacturaPlataformaService.deEmpresa` y `detalleDeEmpresa` exigen `esPlataforma(actor.rol)` antes de
validar y de leer; la action toma el actor de la sesión y la empresa ligada en el servidor (`bind`), no la del
cliente. Tests: `factura-plataforma-service.test.ts` («R13: … por su id → forbidden sin leer la base», con el
maestro, el admin y sin sesión) y `facturas-plataforma.test.ts` (forbidden con repositorio que lanza; la empresa
del `input` no cuenta).

## Hallazgos

### B1 · BLOQUEANTE — Tamaño del PR por encima del máximo sin aceptación humana
`node scripts/tamano-pr.mjs`: 3027/1000 líneas (27/40 archivos). `progress/features/SLT-119.md` no lleva
`<!-- tamano-pr-aceptado: … -->`. `tasks.md` solo midió archivos («27 rutas… 32 de 40») y no las líneas.
`./init.sh` y el CI lo marcan rojo. **Qué falta:** que el humano acepte el tamaño y el leader anote la línea en
`progress/features/SLT-119.md` (como en SLT-100/101/102/104 con la regla «no partir»), o partir la feature
(`docs/gate.md > Tamaño del PR`).

### B2 · BLOQUEANTE — Sin constancia de los E2E afectados del proyecto `aislamiento` corridos en local
El diff cambia `/mi-plan` (sección nueva al final) y el detalle de empresa (todo lo de hoy pasa dentro de `Tabs`).
La bitácora deja constancia de `facturas-plataforma`, `planes-superadmin`, `superadmin-empresas` y
`--project=dinero`, pero no de estos, que recorren esas pantallas y no están en `dinero`:
- `e2e/mi-plan-cambiar-plan.spec.ts` (abre `/mi-plan`).
- `e2e/planes-costeo.spec.ts` (abre `/plataforma/empresas/<id>#plan`; design §6.3 lo nombra como afectado).
- `e2e/cobro-plataforma-sl40.spec.ts` y `e2e/pago-plataforma-sl45.spec.ts` (Plataforma > Empresas; design §6.3
  nombra el primero).
- `e2e/dos-empresas-humo.spec.ts` (`docs/checkpoints-proyecto.md`: una feature que añade una lectura de datos de
  negocio lo corre).
`docs/perfil-agentes.md > reviewer` lo hace bloqueante. **Qué falta:** correrlos en base desechable (como hizo con
`dinero`, con `AUTH_RISK_THRESHOLD=50`) y anotar la salida real en `progress/impl_SLT-119.md`. Si alguno cae por
el cambio, arreglarlo.

### m1 · menor — Prop `facturas` opcional en `MiPlanModule`
Ver desvío 3. Si `MiPlanModule` gana otro llamador, la sección desaparece sin aviso. Aceptable; anotarlo si se
reutiliza el módulo.

### m2 · menor — `tasks.md` T7.3 marca «`./init.sh` verde» y no lo está
Rojo por el validador del board (contexto aceptado por el humano), y además lo estará por B1. Al cerrar, dejar el
estado real en la bitácora en vez de dar el «Hecho» por cumplido.

### m3 · menor — Nota de entorno `AUTH_RISK_THRESHOLD=1000` en el `.env` local
La propuesta del implementer para `docs/verification.md > En local` es útil, pero no es de esta ficha: llevarla por
`/afinar-regla` o a `progress/deudas.md`.

## Veredicto

**RECHAZADO** — 2 bloqueantes (B1 tamaño sin aceptación; B2 E2E afectados de `aislamiento` sin correr en local),
3 menores. El código, la autorización, el aislamiento y la trazabilidad R1–R19 están bien; los cuatro desvíos
declarados se aceptan y el m5 de SLT-118 queda cerrado.
