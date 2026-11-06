# SLT-81 — Datos del país: pantalla del superadmin y formularios · tasks

> `requirements.md` (R1–R25) y `design.md` (§ citados). `[P]` = paralelizable con las otras `[P]`
> del mismo bloque. Cada task cierra con `pnpm run typecheck`, lint de lo tocado y
> `pnpm exec vitest related --run <archivos>`; las de integración, contra una base de test
> desechable (nunca la de desarrollo ni producción). Un commit por task (`docs/conventions.md`).

## Antes de empezar

- [ ] **T0.0 — Preguntas abiertas.** Confirmar con el leader la respuesta del humano a las cuatro
  preguntas abiertas de `requirements.md`. Si alguna cambia el design, el spec se corrige antes de
  seguir. T3.6 depende de la pregunta 1; T1.1/T1.3 (`zonaConocidaPorLaBase`) de la 2.
  **Hecho:** las cuatro con respuesta escrita en `requirements.md`, o el leader dice cuáles quedan
  abiertas y cómo se sigue.

## Bloque 1 — Datos y backend

- [ ] **T1.1 — Migración de los enums del historial** (design §2.1, §2.2).
  `db/migrations/20261108120000_slt81_historial_datos_pais/{migration,down}.sql` (renombrar si `dev`
  trae una posterior) y `db/schema.prisma`.
  **Hecho:** `prisma validate` ok; `tests/integration/db/migracion-slt81-ida-y-vuelta.test.ts` sube,
  baja y vuelve a subir; el `down` aborta si una fila usa un valor nuevo.
- [ ] **T1.2 [P] — Tipos, schemas y zonas** (§4.1, §5). `lib/types/pais.ts` (schemas nuevos,
  `crearPaisSchema` ampliado, `PaisParaAltaDTO`) y `lib/utils/zonas-iana.ts`.
  **Hecho:** `tests/unit/utils/zonas-iana.test.ts` verde (R8); los tests de SL-20 que construyen
  `crearPaisSchema` ajustados con los campos nuevos.
- [ ] **T1.3 — Repositorio** (§4.3; depende de T1.1). `IPaisRepository`, `PaisRepository`.
  **Hecho:** `tests/integration/db/pais-datos-plataforma.test.ts` con R4, R6, R8 (base), R15
  (concurrencia), R16, R17; `pais-repositorio.test.ts` sigue verde; guardia
  `sql-a-mano-por-empresa` verde o decisión del leader anotada.
- [ ] **T1.4 — Servicio** (§4.2; depende de T1.2, T1.3). `IPaisService`, `PaisService`.
  **Hecho:** `tests/unit/services/pais-service-datos.test.ts` con R1, R5, R7–R11, R13, R15;
  `pais-service.test.ts` verde.
- [ ] **T1.5 — Actions** (§4.4; depende de T1.4). `lib/actions/geografia-plataforma.ts`,
  `lib/actions/_shared/paises-plataforma.ts`.
  **Hecho:** `geografia-plataforma-action.test.ts` con los casos de R1 (sin sesión, rol de empresa);
  `geografia-plataforma.composition-root.test.ts` verde.
- [ ] **T1.6 — R12 y R14 de punta a punta** (depende de T1.3, T1.4).
  **Hecho:** los casos «R12» y «R14» de `pais-datos-plataforma.test.ts` verdes con
  `ReglasPaisEmpresaService` y `UsuarioService` reales, dos empresas (CR y `XA`).

## Bloque 2 — Pantalla del superadmin (depende del Bloque 1)

- [ ] **T2.1 — Sección «Datos del país»** (§6). `page.tsx` de Geografía, `GeografiaPlataformaModule`,
  `_components/DatosDelPais.tsx`.
  **Hecho:** `tests/components/GeografiaDatosDelPais.test.tsx` (R2, R3, R8 selector, R10 segundo
  paso, R13 sin borrar, R15 el switch vuelve); `geografia-plataforma-page.test.tsx` verde.
- [ ] **T2.2 — «Nuevo país» con sus datos** (§5, §6). `NuevoPaisDialog`.
  **Hecho:** `GeografiaPlataformaAltaPais.test.tsx` cubre los campos nuevos, la sugerencia de
  prefijo y los errores por campo (R5).

## Bloque 3 — Formularios (depende de T1.5)

- [ ] **T3.1 — Prefijo en el portal** (§7.1). `app/(app)/layout.tsx`, `PaisService.paisDeLaEmpresaParaUi`,
  `providers/PaisDeLaEmpresaProvider.tsx`, `hooks/use-telefono-del-pais.ts`,
  `components/shared/PrefijoTelefonico.tsx`.
  **Hecho:** `tests/components/PrefijoTelefonico.test.tsx` (R23); el test del layout, si existe,
  verde; `etiquetas-geograficas-sin-literal.guardia` verde.
- [ ] **T3.2 [P] — Usuario** (§7.2; depende de T3.1). `UsuarioForm.tsx` y, si hace falta, el DTO de
  edición. **Hecho:** `usuario-form.test.tsx` con R16, R18, R23.
- [ ] **T3.3 [P] — Alta de empresa** (§7.4). `plataforma/empresas/page.tsx`, `EmpresasModule.tsx`.
  **Hecho:** `empresas-module.test.tsx` con R20; los `EmpresasModule*.test.tsx` verdes con la prop
  nueva.
- [ ] **T3.4 [P] — Corregir datos del cliente** (§7.5; depende de T3.1).
  **Hecho:** `CorregirDatosCliente.ordenes.test.tsx` con R21; `corregir-datos-sin-rastro.guardia`
  verde.
- [ ] **T3.5 [P] — Destinatarios de WhatsApp** (§7.6; depende de T3.1).
  **Hecho:** `tests/components/DestinatariosField.test.tsx` con R22.
- [ ] **T3.6 — Postulación** (§7.3; depende de T0.0, pregunta 1). `app/postulacion/page.tsx`,
  `PostulacionForm.tsx`. **Hecho:** `postulacion-page.test.tsx` con R19 (dentro de `conEmpresa`) y
  el caso sin empresa según lo que decida el humano; `PostulacionForm.test.tsx` verde.
- [ ] **T3.7 — Guardia de R24** (§7.7; después de T3.2–T3.6).
  **Hecho:** `formularios-pais-sin-literales.guardia.test.ts` y `tipos-documento-sin-borrado.guardia.test.ts`
  verdes, y cada una falla si se le reintroduce el literal o un `delete` (comprobado a mano una vez).

## Bloque 4 — E2E y cierre

- [ ] **T4.1 — E2E** (§11.1; depende de los Bloques 2 y 3). `e2e/datos-pais-superadmin.spec.ts` y su
  entrada en `playwright.config.ts` (proyecto `aislamiento`).
  **Hecho:** dos corridas seguidas sobre la misma base local, 0 failed / 0 skipped / 0 flaky;
  `e2e-sin-saltos.guardia` verde. En CI, el check `e2e` verde.
- [ ] **T4.2 — Documentación.** `docs/architecture.md > País por empresa` (escritura de los datos
  del país, confirmación por número de empresas, lista de zonas) y, si el humano decidió la
  pregunta 3, `_pais-sin-literales-excepciones.ts`.
  **Hecho:** el párrafo nombra los archivos nuevos y la guardia nueva.
- [ ] **T4.3 — Gate y trazabilidad.** `./init.sh` verde; `progress/impl_SLT-81.md` con el mapa
  R1–R25 → test (design §11) y la salida de cada comando.
  **Hecho:** cada R con al menos un test que corre y pasa.

## Archivos esperados

- `db/migrations/20261108120000_slt81_historial_datos_pais/migration.sql`
- `db/migrations/20261108120000_slt81_historial_datos_pais/down.sql`
- `db/schema.prisma`
- `lib/types/pais.ts`
- `lib/utils/zonas-iana.ts`
- `lib/interfaces/repositories/IPaisRepository.ts`
- `lib/repositories/PaisRepository.ts`
- `lib/interfaces/services/IPaisService.ts`
- `lib/services/PaisService.ts`
- `lib/actions/geografia-plataforma.ts`
- `lib/actions/_shared/paises-plataforma.ts`
- `lib/interfaces/repositories/IUserRepository.ts`
- `lib/repositories/UserRepository.ts`
- `app/(app)/layout.tsx`
- `providers/PaisDeLaEmpresaProvider.tsx`
- `hooks/use-telefono-del-pais.ts`
- `components/shared/PrefijoTelefonico.tsx`
- `app/(app)/plataforma/geografia/page.tsx`
- `app/(app)/plataforma/geografia/_components/GeografiaPlataformaModule.tsx`
- `app/(app)/plataforma/geografia/_components/DatosDelPais.tsx`
- `app/(app)/configuracion/_components/UsuarioForm.tsx`
- `app/postulacion/page.tsx`
- `app/postulacion/_components/PostulacionForm.tsx`
- `app/(app)/plataforma/empresas/page.tsx`
- `app/(app)/plataforma/empresas/_components/EmpresasModule.tsx`
- `app/(app)/ordenes/_components/CorregirDatosClienteModal.tsx`
- `app/(app)/configuracion/envios-whatsapp/_components/DestinatariosField.tsx`
- `tests/integration/db/migracion-slt81-ida-y-vuelta.test.ts`
- `tests/integration/db/pais-datos-plataforma.test.ts`
- `tests/integration/db/pais-repositorio.test.ts`
- `tests/unit/utils/zonas-iana.test.ts`
- `tests/unit/services/pais-service-datos.test.ts`
- `tests/unit/services/pais-service.test.ts`
- `tests/unit/actions/geografia-plataforma-action.test.ts`
- `tests/unit/components/geografia-plataforma-page.test.tsx`
- `tests/components/GeografiaDatosDelPais.test.tsx`
- `tests/components/GeografiaPlataformaAltaPais.test.tsx`
- `tests/components/PrefijoTelefonico.test.tsx`
- `tests/unit/components/usuario-form.test.tsx`
- `tests/components/empresas-module.test.tsx`
- `tests/components/EmpresasModuleCobro.test.tsx`
- `tests/components/EmpresasModuleCobroPorcentual.test.tsx`
- `tests/components/EmpresasModulePeriodo.test.tsx`
- `tests/components/EmpresasModulePlan.test.tsx`
- `tests/components/CorregirDatosCliente.ordenes.test.tsx`
- `tests/components/DestinatariosField.test.tsx`
- `tests/integration/postulacion-page.test.tsx`
- `tests/components/PostulacionForm.test.tsx`
- `tests/unit/guards/formularios-pais-sin-literales.guardia.test.ts`
- `tests/unit/guards/tipos-documento-sin-borrado.guardia.test.ts`
- `tests/fabricas/paises.ts`
- `e2e/datos-pais-superadmin.spec.ts`
- `playwright.config.ts`
- `docs/architecture.md`
