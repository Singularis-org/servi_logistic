# Review SLT-51 «Zonas separadas de Tarifas»

Revisor: reviewer (Opus) · 2026-10-29 · rama `feature/SLT-51-zonas-separadas-de-tarifas` @ `7d4c7940`
Diff: `git diff origin/dev...HEAD` (58 archivos). MCP del grafo sin conexión: exploración con Grep/Read.

## Veredicto: APROBADO

Sin bloqueantes. Hay 5 menores y 1 pendiente (las capturas de T12).

## Verificación ejecutada por el revisor

| Qué | Resultado |
|---|---|
| 25 archivos de test de la feature (componentes, páginas, menú, esquema, servicio, integración contra `servi_slt51`, R15 `asimetria-sin-tarifa`, guardias `e2e-sin-saltos`, `modulos-reparto`, `superficie-de-uso`, `pwa-manifiesto-atajos`, `ayuda-pantalla-ruta-existe`) | **431 passed, 0 failed, 0 skipped** (con `DATABASE_URL` cargada: los `describeSiHayBase` corrieron) |
| `tsc --noEmit` (heap 8 GB) | EXIT 0. Hoy no aparecen los errores ajenos de SLT-56 |
| `eslint` sobre los .ts/.tsx tocados | 0 errores, 2 warnings que ya estaban en `origin/dev` (`normalizeName` sin usar en `ZonaRepository.ts:10`; `exhaustive-deps` en `CobroVehiculoTarifas.tsx:231`) |
| `./init.sh` (rápido, con `servi_slt51`) | **INIT_EXIT=0**: related 371 archivos (5081 passed, 26 skipped); guardias 321 archivos (4499 passed, 1 skipped) |
| Mutaciones de la excepción de `e2e-sin-saltos` (7, ver abajo) | 7/7 dan rojo; el árbol quedó limpio después |

### Mutaciones de la guardia `e2e-sin-saltos` (38 tests)

| Mutación | Resultado |
|---|---|
| M1: sin `hoy > ex.vence` (no vence nunca) | 1 failed / 37 passed |
| M2: sin la comprobación «el archivo ya no tiene fixme» | 1 failed |
| M3: la excepción cubre el `fixme` de cualquier archivo | 1 failed |
| M4: la excepción también tapa `skip`/`only` | 1 failed |
| M5: la lista real vence ayer (`2026-10-28`) | 1 failed (el test real usa `hoyIso()`) |
| M6: `zona-especial-dos-empresas.spec.ts` sin `test.fixme` | 1 failed (`excepcion-sin-fixme`) |
| M7: la entrada real apunta a otro archivo (`e2e/auth.spec.ts`) | 1 failed |

La excepción admite **solo** `e2e/zona-especial-dos-empresas.spec.ts`, **solo** el `fixme`, se pone roja
a partir del 2026-12-01 y también si el archivo pierde su `fixme` o deja de existir.

## Checklist

- [x] requirements.md con EARS R1–R16; P1/P2 cerradas en «Decisiones cerradas» (Carlos, 2026-10-29).
- [x] design.md abre con `## Lo que ya existe`, tiene contenido, y el diff no vuelve a crear nada de esa lista: los archivos se mudaron con `git mv` y en `tarifas/_components` no queda ninguna copia.
- [~] tasks.md: T1–T11 `[x]`; **T12 `[ ]`**, solo porque faltan las capturas (pendiente aceptado por el leader, ver P1).
- [x] Mapa `R → test` en `progress/impl_SLT-51.md` (consolidado). Lo comprobé abajo.
- [x] Typecheck y lint sin errores.
- [x] Sin dependencias nuevas, sin migraciones, sin tablas nuevas y sin secretos. Ningún literal nuevo de país o moneda en `app/` ni en `lib/`: el SINPE ya existía y viene en archivos mudados.
- [x] Autorización en el servidor: la página `/configuracion/zonas` hace `actor?.rol !== "maestro"` antes de cualquier carga (`zonas/page.tsx:22`), igual que Tarifas (`tarifas/page.tsx:18`). Las actions de `lib/actions/zonas.ts` pasan por `ZonaService`, que solo admite al maestro. `zonas-action.test.ts › SLT-51/R2` comprueba `forbidden` con 0 llamadas al repo para admin, mensajero, adminTienda, adminSatelite y apiKey.
- [x] Validación zod en el borde: `actualizarZonaSchema` tiene `cobroVehiculo` y `tarifas` opcionales, y si llega solo uno de los dos responde `validation_error` (R8).
- [x] El E2E nuevo `e2e/zonas-crear-sin-costos.spec.ts` está en el proyecto `aislamiento` de `playwright.config.ts:91`, y la guardia «cada spec en exactamente un proyecto» sale verde.
- [x] Rutas viejas: ni `app/`, ni `lib/`, ni `components/`, ni `tests/`, ni `e2e/`, ni `docs/` importan `ZonasTarifasModule` o `tarifas/_components/{CrearZonaForm,GeografiaSelector,DescargarCoberturaButton,cobertura-descarga-columnas}`.
- [x] Código sin montar: `CobroVehiculoTarifas` y `actualizarDistritosEspeciales` quedan anotados con `@sin-superficie … vuelve en SLT-54`, como fija design §T9. No es código muerto sin declarar.
- [x] Sin regresión en `/configuracion/tarifas`: `TarifasPage.test.tsx` (sin Cobertura, sin «Costos por zona», monta `TiendasModule` con las zonas) y `TarifasClaridadMontos` (19) en verde.

## Trazabilidad (comprobada, todos los tests pasan)

| R | Test |
|---|---|
| R1 | `tests/unit/auth/menu-visibility.test.ts` (subítem y primer destino sin cambios), `tests/components/Sidebar.test.tsx`, guardias `modulos-reparto` y `pwa-manifiesto-atajos` |
| R2 | `tests/unit/app/zonas/ZonasPage.test.tsx` (4 roles + sin sesión) + `tests/integration/actions/zonas-action.test.ts › SLT-51/R2` |
| R3 | `tests/components/ZonasModuleListado.test.tsx` + E2E |
| R4 | `tests/components/ZonaFormSinCostos.test.tsx`, `tests/components/ZonaDistritoEspecial.test.tsx` |
| R5 | `ZonaFormSinCostos.test.tsx` (payload literal) + `tests/integration/db/zona-guardado-conserva-costos.test.ts › R5` (Postgres) + E2E |
| R6/R7 | `zona-guardado-conserva-costos.test.ts › ⭑ R6/R7` (pagos, `cobro_vehiculo`, tarifa de zona, especiales, 0 filas 380) + `zona-schema`/`zona-service`/`zonas-action` |
| R8 | `tests/unit/types/zona-schema.test.ts`, `zonas-action.test.ts`, `zona-guardado-conserva-costos.test.ts › ⭑ R8` (foto antes = después) |
| R9 | `tests/integration/db/zona-pago-mensajero-rastro.test.ts` (sin cambios) + contraprueba R9 en `zona-guardado-conserva-costos` |
| R10 | `ZonaCentralConfirmacion.test.tsx`, `ZonaBorradoMotivo.test.tsx`, `ZonasModuleListado.test.tsx` (ningún texto con /central/i) |
| R11 | `tests/components/ZonaCentralConfirmacion.test.tsx` |
| R12 | `ZonasPage.test.tsx` (Cobertura antes del listado) + `tests/unit/app/tarifas/TarifasPage.test.tsx` (sin Cobertura) |
| R13 | `TarifasPage.test.tsx` |
| R14 | `tests/components/ZonaBorradoMotivo.test.tsx` |
| R15 | `tests/integration/asimetria-sin-tarifa.test.ts` (sin cambios, verde contra la base) |
| R16 | `ZonasPage.test.tsx` (árbol global sin tocar) + `tests/unit/components/geografia-selector-inactivos.test.tsx` |

## Hallazgos

### Bloqueantes
Ninguno.

### Menores
1. **menor — encabezado «Zonas de reparto» sin ancla.** `app/(app)/configuracion/zonas/_components/ZonasModule.tsx:97`. Ni requirements, ni design, ni ningún test o E2E fija este texto. No contradice nada: la ayuda (`configuracion-zonas.md:16`) dice «zonas de reparto» y el E2E solo afirma el `h1` «Zonas». Pero el cambio desde «Costos por zona» quedó sin decidir por escrito. *Corrección:* anotarlo en design.md (§ textos) o fijarlo en `ZonasModuleListado.test.tsx` con `getByRole("heading", { name: "Zonas de reparto" })`.
2. **menor — comentarios que siguen diciendo «Costos por zona» en Tarifas.** `app/(app)/configuracion/tarifas/_components/tarifas-labels.ts:2` («TEXTOS de la pantalla «Costos por zona» (`/configuracion/tarifas`)») y `TiendasModule.tsx:73` («se editan en "Costos por zona"»). Esa pantalla ya no existe. *Corrección:* reescribirlos para que digan dónde viven hoy esos costos: sin editor hasta SLT-54.
3. **menor (heredado) — `docs/ayuda/oficina/configuracion-tarifas.md:5` declara `roles: [maestro, admin]`.** La página solo admite al `maestro` (`tarifas/page.tsx:18`), así que el asistente puede ofrecerle esta ayuda a un `admin` que no llega a la pantalla. Viene de antes de esta ficha. *Corrección:* `roles: [maestro]`, aquí o en una ficha aparte.
4. **menor — `CobroVehiculoTarifas.tsx:143-148`: dos bloques JSDoc seguidos** (la descripción del componente y la marca `@sin-superficie`). Funciona, pero un solo bloque con la marca al final se lee mejor. *Corrección:* unirlos.
5. **menor — warning previo `normalizeName` sin usar en `lib/repositories/ZonaRepository.ts:10`.** La ficha tocó el archivo y no lo limpió. *Corrección:* quitar el import, si se vuelve a tocar el archivo.

### Pendiente (no bloqueante, por decisión del leader)
- **P1 — Capturas de T12.** Faltan las de `/configuracion/zonas` (listado + formulario de crear) y `/configuracion/tarifas`. Por eso T12 sigue `[ ]` en `specs/SLT-51-zonas-separadas-de-tarifas/tasks.md:77`. Hay que tomarlas antes del PR o anotarlas en el cierre de la ficha.

## Lo que NO es hallazgo (decisiones del humano)
- `/configuracion/zonas` sin /design (traslada componentes existentes).
- `e2e/zona-especial-dos-empresas.spec.ts` en `fixme` con la excepción que vence el 2026-11-30.
- Choque de archivos con SLT-58 en `menu-visibility.ts`, `reparto.ts` y Sidebar.
