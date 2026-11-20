# SL-21 — Moneda e impuestos configurables por país · tasks

> Requisitos en `requirements.md`; el cómo, en `design.md`. Una task está hecha cuando pasa su criterio
> **y** `pnpm run typecheck` está en verde. `[P]` = puede ir en paralelo con las otras `[P]` de su bloque.

## Bloque 1 — Datos del país (R1–R4)

- [x] **T1.1** Migración `20261122120000_sl21_pais_moneda_impuesto` (`migration.sql` y `down.sql`).
  - Contenido: las 6 columnas, los 8 `CHECK`, la precondición de la fila CR y el `UPDATE` de CR
    (design §2.1).
  - Si al implementar ya hay migraciones con timestamp posterior en `dev`, se renombra al siguiente
    libre.
  - *Hecho:* `prisma migrate deploy` sobre una base desechable aplica; el `down.sql` revierte; subir
    otra vez aplica.
- [x] **T1.2** `db/schema.prisma`: los 6 campos de `Pais` con su comentario `///`.
  - *Hecho:* `prisma validate` y `prisma generate` en verde, y `prisma migrate diff` entre esquema y
    migraciones vacío.
- [x] **T1.3** Tests de base (depende de T1.1 y T1.2):
  - `tests/integration/db/migracion-sl21-ida-y-vuelta.test.ts` (R1, R3, R19);
  - `tests/integration/db/pais-moneda-impuesto.test.ts` (R2, R4).
  - `tests/fabricas/paises.ts > crearPaisDePrueba` acepta moneda e impuesto (NULL por defecto).
  - *Hecho:* los dos en verde con CR y `XA`.

## Bloque 2 — Formato (R8, R9)

- [x] **T2.1** [P] `lib/config/moneda.ts`: `FormatoMoneda`, `MONEDA_PLATAFORMA`,
  `MONEDA_DE_LOS_PLANES` y `formatearMontoEn`. Los 6 caminos de hoy delegan en él (design §3).
  - *Hecho:* `tests/unit/config/moneda-formato-pais.test.ts` en verde (R8), y los tests de dinero
    existentes sin cambiar ningún valor esperado.
- [x] **T2.2** Guardia 359 con el séptimo camino (depende de T2.1).
  - *Hecho:* `pnpm run test:guardias` en verde, con el recuento en 7 (R9).
- [x] **T2.3** Test «CR migrada = plataforma» en `moneda-formato-pais.test.ts`, como test de
  integración (depende de T1.1 y T2.1).
  - *Hecho:* en verde con `MONEDA_*` vacías.

## Bloque 3 — Puerto (R5–R7) (depende de los bloques 1 y 2)

- [x] **T3.1** `PaisDTO` (`moneda`, `impuestoNombre`) y `PaisRepository` (select y mapeo).
  - Se actualizan los fixtures de `PaisDTO` de los tests.
  - *Hecho:* typecheck en verde y el test de `pais-repositorio` con los campos nuevos.
- [x] **T3.2** Los errores `PaisSinMoneda` y `PaisSinImpuesto`, los métodos `moneda()` y
  `nombreImpuesto()` en `IReglasPaisEmpresa` y `ReglasPaisEmpresaService`, y la fábrica
  `reglasPaisFijas` con `MONEDA_DE_PRUEBA`.
  - Se completan los dobles escritos a mano.
  - *Hecho:* `reglas-pais-empresa-service.test.ts` con los casos de R5–R7 en verde.

## Bloque 4 — Lo que arma el servidor (depende del bloque 3)

- [ ] **T4.1** [P] Plantillas de WhatsApp (design §5.2): `usaMoneda`, `necesitaMoneda` y el cuarto
  argumento, en sus tres llamantes de servidor.
  - *Hecho:* `whatsapp-moneda-por-pais.test.ts` (R10, R11) en verde, y `plantilla-datos.test.ts` sin
    cambios en sus valores esperados (R16).
- [ ] **T4.2** [P] Informes (design §5.3): `ContextoInforme.moneda` perezosa,
  `EjecucionEnvioService`, y `transito/informe.ts`, `calculo.ts` y `pdf.ts`.
  - *Hecho:* `informe-moneda-por-pais.test.ts` (R12, R13) en verde, y los tests de cálculo y PDF del
    tránsito solo cambian la firma, no los textos esperados con CR (R16).
- [ ] **T4.3** [P] Etiquetas por API (design §5.4): el argumento `moneda?` en `etiquetas-dibujo.ts` y
  `etiquetas-pdf-lote.ts`, `reglasPais` en `EtiquetasLotePdfService` y sus 3 rutas.
  - *Hecho:* `etiquetas-lote-pdf-service.test.ts` (R14) y los tests de PDF de etiquetas existentes en
    verde, sin cambiar sus textos esperados (R16).
- [ ] **T4.4** [P] Facturas de planes (design §5.5): `resumen.ts`, `factura-emitida.ts` y
  `planes/mensajes.ts` con `MONEDA_DE_LOS_PLANES`.
  - *Hecho:* `factura-moneda-plataforma.test.ts` (R15) en verde, y los tests de factura existentes sin
    cambios (R16).
- [ ] **T4.5** [P] Alta de empresa (design §5.6).
  - *Hecho:* `organizacion-service-pais.test.ts` con «sin moneda» y «sin impuesto» (R17).
- [ ] **T4.6** [P] `tests/unit/utils/monto-cobrar-por-pais.test.ts` (R18).
  - *Hecho:* en verde, sin cambiar `lib/utils/monto-cobrar.ts`.

## Bloque 5 — Guardia, docs y cierre (depende del bloque 4)

- [ ] **T5.1** Guardia `pais-sin-literales` (design §7): el censo nuevo, las fichas `SLT-235`,
  `SLT-237` y `permanente`, la lista de excepciones con la salida real y el tope nuevo. Además, el
  comentario de `lib/constants/impuesto-rotulo.ts` pasa a decir SLT-235.
  - *Hecho:* `pnpm run test:guardias` en verde, y la autocomprobación caza «₡», `CRC`, `IVA` y un
    `import { money }` en fuentes inventadas (R20, R21).
- [ ] **T5.2** `docs/architecture.md`: un párrafo «Moneda e impuesto (SL-21)» junto al de SLT-42.
  Explica las columnas, el puerto, `formatearMontoEn`, `MONEDA_DE_LOS_PLANES` y la guardia.
  - *Hecho:* el reviewer lo encuentra y cuadra con el código.
- [ ] **T5.3** Cierre.
  - `./init.sh` en verde.
  - E2E en local del grupo `dinero` y de los que tocan etiquetas, plantillas y facturas
    (`docs/perfil-agentes.md > E2E en local antes del PR`), sobre una base desechable.
  - El mapa R → test va en `progress/impl_SL-21.md` (R22).
  - *Hecho:* todo verde y el mapa con los 22 requisitos.

## Archivos esperados

Producción:
- `db/schema.prisma`
- `db/migrations/20261122120000_sl21_pais_moneda_impuesto/migration.sql`
- `db/migrations/20261122120000_sl21_pais_moneda_impuesto/down.sql`
- `lib/types/pais.ts`
- `lib/repositories/PaisRepository.ts`
- `lib/interfaces/services/IReglasPaisEmpresa.ts`
- `lib/services/ReglasPaisEmpresaService.ts`
- `lib/db/errores-pais.ts`
- `lib/config/moneda.ts`
- `lib/constants/impuesto-rotulo.ts`
- `lib/facturas-plataforma/resumen.ts`
- `lib/services/email/plantillas/factura-emitida.ts`
- `lib/planes/mensajes.ts`
- `lib/types/plantilla-datos.ts`
- `lib/services/ChatWhatsappService.ts`
- `lib/actions/chat-whatsapp.ts`
- `lib/services/jobs/whatsapp-bienvenida-handler.ts`
- `lib/whatsapp-envios/informes/tipos.ts`
- `lib/services/EjecucionEnvioService.ts`
- `lib/whatsapp-envios/informes/transito/informe.ts`
- `lib/whatsapp-envios/informes/transito/calculo.ts`
- `lib/whatsapp-envios/informes/transito/pdf.ts`
- `lib/pdf/etiquetas-dibujo.ts`
- `lib/pdf/etiquetas-pdf-lote.ts`
- `lib/services/EtiquetasLotePdfService.ts`
- `app/api/ordenes/api-key/carga/route.ts`
- `app/api/ordenes/api-key/carga/[cargaId]/generate/route.ts`
- `app/api/ordenes/api-key/orden/[id]/generate/route.ts`
- `lib/services/OrganizacionService.ts`
- `docs/architecture.md`

Tests:
- `tests/fabricas/paises.ts`
- `tests/fabricas/reglas-pais.ts`
- `tests/integration/db/migracion-sl21-ida-y-vuelta.test.ts`
- `tests/integration/db/pais-moneda-impuesto.test.ts`
- `tests/integration/db/pais-repositorio.test.ts`
- `tests/unit/config/moneda-formato-pais.test.ts`
- `tests/unit/guards/dinero-centimos-cuando-existen.guardia.test.ts`
- `tests/unit/guards/pais-sin-literales.guardia.test.ts`
- `tests/unit/guards/_pais-sin-literales-excepciones.ts`
- `tests/unit/services/reglas-pais-empresa-service.test.ts`
- `tests/unit/services/whatsapp-moneda-por-pais.test.ts`
- `tests/unit/whatsapp-envios/informe-moneda-por-pais.test.ts`
- `tests/unit/whatsapp-envios/informe-transito-calculo.test.ts`
- `tests/unit/pdf/informe-transito-pdf.test.ts`
- `tests/unit/services/etiquetas-lote-pdf-service.test.ts`
- `tests/unit/planes/factura-moneda-plataforma.test.ts`
- `tests/unit/services/organizacion-service-pais.test.ts`
- `tests/unit/utils/monto-cobrar-por-pais.test.ts`
- `tests/unit/services/pais-service.test.ts`
- `tests/unit/actions/organizaciones-action.composition-root.test.ts`
- `tests/unit/components/geografia-plataforma-page.test.tsx`
- `tests/components/GeografiaPlataformaAltaPais.test.tsx`
- `tests/unit/services/usuario-service-cedula.test.ts`
- `tests/unit/services/usuario-service-pais.test.ts`
- `tests/unit/services/usuario-service-superadmin.test.ts`
- `tests/unit/services/cierres-filtro-folio.test.ts`
- `tests/unit/services/webhook-whatsapp-pais-incompleto.test.ts`

Los fixtures de `PaisDTO` y los dobles escritos a mano del puerto son los que hoy construyen el
objeto entero, según Grep del 2026-11-19. Si el typecheck señala otro, se añade aquí antes del PR.

## Tamaño

| | Archivos | Líneas (añadidas + borradas) |
|---|---|---|
| Producción | 30 | unas 500 |
| Tests | 27 | unas 1 300 |
| **Total** | **57** | |

Pasa el tope de 40 archivos (`gate.tamano_pr`). Lo aceptó el humano el 2026-11-20 (decisión
cerrada «¿Se parte la ficha?»). Las líneas quedan por debajo de sus dos topes (1000 de producción y
3000 de tests). El leader añade a `progress/features/SL-21.md` la línea
`<!-- tamano-pr-aceptado: 2026-11-20 · … -->` antes de la primera tanda.
