# SL-36 · T8.1 — guías de integraciones (backend_dev, 2026-10-25)

## Archivos

Creados:
- `docs/ayuda/oficina/configuracion-integraciones.md` — la pantalla: estados, marca, editar, probar, límite, token de verificación, desconectar. `pantalla: /configuracion/integraciones`, `roles: [maestro]`.
- `docs/ayuda/oficina/integracion-whatsapp.md`, `integracion-google-maps.md`, `integracion-optimizacion-rutas.md`, `integracion-asistente.md` — dónde entrar, qué crear, qué copiar, en qué campo pegarlo; terminan en «Lo que esta pantalla NO hace». Sin `pantalla:` (ver Desviaciones).
- `tests/unit/ayuda/guias-integraciones.test.ts` — R35.

Modificados (tests):
- `tests/unit/guards/ayuda-pantalla-ruta-existe.guardia.test.ts` — exención de `pantalla:` SOLO para las guías que enlaza `CATALOGO_INTEGRACIONES[s].guia` (derivada del catálogo), con caso ancla de las cuatro.
- Recuentos a mano 33→38 (oficina 18→23; maestro visible 23→28): `tests/components/AyudaLayout.test.tsx`, `tests/unit/ayuda/acotamiento-por-rol.test.ts`, `tests/unit/asistente/acotamiento-por-rol.test.ts`, `tests/unit/asistente/contexto-documental.test.ts`, `tests/unit/guards/asistente-sin-frontmatter.guardia.test.ts`, `tests/integration/asistente-route.test.ts`.

## R → test

| R | Test |
|---|---|
| R35 (mitad guía) | `tests/unit/ayuda/guias-integraciones.test.ts` › «cada guía del catálogo existe en docs/ayuda: %s» (+ «el catálogo enlaza las cuatro guías…», «la guía general…») |

## Salida

- `pnpm exec vitest run tests/unit/ayuda tests/unit/asistente <guardias de ayuda> tests/components/AyudaLayout.test.tsx tests/components/AyudaDocumentoPage.test.tsx tests/unit/types/integraciones-catalogo.test.ts tests/integration/asistente-route.test.ts` → 330 passed, 1 failed: `ayuda-pantalla-ruta-existe` › «toda `pantalla:` … EXISTE en app/» con `oficina/configuracion-integraciones.md -> /configuracion/integraciones` (la página es T7.2).
- `pnpm run test:guardias` → 4180 passed, 5 failed: el mismo de arriba + 4 de `dependencias-declaradas-presentes` (baseline).
- eslint de los dos tests nuevos/tocados: limpio. tsc: ningún error en archivos de esta tanda.
- Mutación: renombrar `integracion-whatsapp.md` → rojo en `guias-integraciones` (whatsapp) y en 3 casos de la guardia; restaurado → 6/6 verde.

## Pendiente T8.2 (revisión humana)

Pasos marcados «(verificar en la consola)» en las cuatro guías; detalle en el informe al leader.

Veredicto: T8.1 hecha; queda en rojo solo la ruta `/configuracion/integraciones`, que se cierra con T7.2.
