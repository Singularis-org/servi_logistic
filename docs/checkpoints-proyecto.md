<!-- perfil: revisado=2026-10-21 por=Carlos Restrepo -->
# docs/checkpoints-proyecto.md — Criterios de "hecho" propios del proyecto

> Perfil del proyecto. Complementa `CHECKPOINTS.md` (genérico). El reviewer recorre los dos.

## Calidad de código
- [ ] `pnpm run typecheck` sin errores.
- [ ] `pnpm run lint` sin errores.
- [ ] `./init.sh` en verde en el worktree de la feature.

## Flujos críticos (exigen E2E)
Una feature que toque uno de estos flujos deja un E2E en `e2e/` que lo recorre:
- [ ] Login y sesión (`e2e/auth.spec.ts`).
- [ ] Asignación y recepción de órdenes (`mis-asignaciones`, `asignacion-satelite`,
      `recepcion-satelite`).
- [ ] Cierres de día y su revisión (`cierre-dia`, `cierres-admin*`, `cierre-bodega-satelite`,
      `reglas-bloqueos-cierre`).
- [ ] Dinero: wallet y liquidación de mensajeros (`wallet*`, `mi-wallet`).
- [ ] Devoluciones, reintentos y reprogramación (`devolucion-origen`, `reintentos-escalado`,
      `reprogramacion-liberacion`).
- [ ] Rastreo público (`rastreo-publico`).

> ABIERTO: el alta de empresa y el aislamiento entre empresas se añaden a esta lista cuando se
> especifique la fase 2 de `docs/plan-saas.md`.

## Datos y seguridad
- [ ] Toda tabla nueva tiene RLS y `organizacion_id` (`docs/architecture.md > Multi-empresa`).
- [ ] Toda query nueva sobre datos de negocio filtra por `organizacion_id`, y hay un test de
      integración que lo prueba con dos empresas.
- [ ] Toda migración nueva trae `down.sql` y no edita una migración ya aplicada.
- [ ] Ningún recurso de Ordenex (Supabase, Vercel, llaves, dominio de Ordenex) en el diff.
- [ ] Ningún `console.log` de secretos o PII.

## Arquitectura (capas o módulos)
- [ ] La lógica de negocio vive en `lib/services/`; el acceso a datos, en `lib/repositories/`;
      las mutaciones internas, en Server Actions (`lib/actions/`).
- [ ] Toda entrada externa se valida con zod en el borde.
- [ ] País, moneda, impuestos y métodos de pago salen de configuración, no de literales.

## Permisos
- [ ] La autorización se valida en el servidor (Server Action, route handler o Server Component),
      no solo ocultando el botón en el menú.
- [ ] Un módulo apagado para la empresa se rechaza en la action o el job, no solo en
      `lib/auth/menu-visibility.ts`.

### Por qué
servi_logistic mueve dinero de mensajeros y datos de varias empresas en una sola base: un `WHERE`
de menos filtra datos de otra empresa o cobra mal, y un menú oculto no es un permiso.
