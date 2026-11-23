# impl SLT-250 «/ordenes: «Sin empresa en contexto para Pais.zonaHoraria» al cargar»

## Archivos creados/modificados
- `app/(app)/ordenes/page.tsx`: la puerta `notFound()` añade `esPlataforma(rol)`.
- `tests/components/OrdenesPageSuperadmin.test.tsx` (nuevo).
- `specs/SLT-250-ordenes-zona-horaria-sin-empresa/requirements.md`, `progress/features/SLT-250.md`.

## Mapa R → test
| Requisito | Test |
|---|---|
| R1820 | `tests/components/OrdenesPageSuperadmin.test.tsx` › «superadmin: notFound antes de leer la zona (R1820, R1821)» |
| R1821 | el mismo caso: `zonaDelBorde` sin llamadas |
| R1822 | `tests/components/OrdenesPageSuperadmin.test.tsx` › «roles de empresa: leen la zona y no hay notFound (R1822)» |

## Evidencia
- Sin el arreglo: 1 failed, 1 passed («expected EmpresaNoResuelta … to be Error: SLT-250:notFound»).
- Mutación (quitar solo la cláusula `esPlataforma`): ROJO, 1 failed. Restaurado: 2/2 en verde.
- Tests de la página (`OrdenesPage`, `OrdenesPageFiltros`, `OrdenesPageFranjaRetenidas` + el nuevo): 4 archivos, 38 casos en verde.
- `./init.sh` con la base `servi_slt250`: `INIT_EXIT=0` (rápido; typecheck, lint, tests relacionados y guardias en verde).
- E2E (H1 del review): ver `progress/features/SLT-250.md > Tandas`.

## Veredicto
Arreglo mínimo en la puerta por rol; el superadmin recibe 404 en `/ordenes` en vez de `EmpresaNoResuelta`.
