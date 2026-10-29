# SLT-43 «Geografía jerárquica: modelo y migración»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-43 | geo-jerarquica-modelo | backend | high | feature/SLT-43-geo-jerarquica-modelo | Camilo | in_progress |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.0 hecho (2026-10-29): tomada en Trello (member + En curso), worktree creado.
F1.4 hecho (2026-10-29): spec aprobado por Camilo por escrito («aprobado»), registrado en la tarjeta. Siguiente: F2, implementer — bloqueado hasta resolver el PR #29.

## Evaluación
- zone `backend` y complexity `high`, de los labels de la tarjeta: migraciones, triggers de
  sincronía, script de datos por lotes y ensayo sobre una copia de producción.
- Dependencia SL-20: `done` (PR #26, cerrada el 2026-10-29).
- Cupo backend de Camilo: 2/3 con esta (SL-24 en vuelo).

## Decisiones
- 2026-10-29 · Integración en `dev` (Camilo: «dale normal con merge a dev»). Se probó una rama épica
  `epic/GEO-geografia-jerarquica` y se descartó el mismo día: un PR por tarjeta a `dev`, como manda el
  arnés. R38 queda retirado; no hace falta tocar `gate.yml`.
- 2026-10-29 · Verificaciones previas que pide la tarjeta, confirmadas por Camilo:
  - los previews de Vercel no apuntan a la base de producción;
  - Supabase de producción tiene el backup activo.
- Pendiente antes de la primera migración: mergear el PR #29 (guardia de migraciones destructivas).
- 2026-10-29 · `/afinar-feature`: alcance y decisiones cerradas en
  `specs/SLT-43-geo-jerarquica-modelo/requirements.md`.
- 2026-10-29 · T1.3 (Camilo, opción (a)): `tipo_nivel_geografico.pais_id → pais` con `ON DELETE CASCADE`.
  Motivo: el tipo es parte del país y no vive sin él; servi_app no tiene DELETE sobre pais. Los nodos
  siguen con RESTRICT. Origen: la limpieza `DELETE FROM pais` de `geografia-superadmin-sin-empresa` (SL-20)
  fallaba con 23503; el test de SL-20 no se toca. Enmienda en design §2.1.
- 2026-10-29 · Guardia `migraciones-destructivas` roja en `dev` por `20261028120000_modulo_wallet_nucleo`
  (ajena): no se arregla en esta rama; el leader la resuelve con un PR aparte.
- 2026-10-29 · T3.2 (Camilo, opción (a)), excepción explícita a R36: en `carga-division.test.ts`, solo el caso
  «decision 4: dos homónimos normalizados bajo el mismo padre» desactiva el trigger de sincronía al armar sus
  datos, dentro de su transacción revertida; aserciones sin cambios. Motivo: estado imposible en el modelo
  nuevo (R9/R14) y ninguna vía de la app lo crea. Ningún otro test de SL-20 se toca. Enmienda en design (R36).

## Modelos (overrides)

## Cierre
