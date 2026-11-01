# SLT-75 «Un distrito no puede quedar en dos zonas» (hotfix)

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-75 | distrito-zona-unica | fullstack | medium | hotfix/SLT-75-distrito-zona-unica | Carlos Restrepo | spec |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.2: spec en `specs/SLT-75-distrito-zona-unica/`. HOTFIX: rama desde `origin/prod`, worktree
`.worktrees/SLT-75-hotfix`. Corre en paralelo a SLT-73 (también hotfix; su migración es
20261031140x): las migraciones de esta van con fecha posterior (20261101…).

## Síntoma (prod, 2026-10-31)
En /configuracion/tarifas, el maestro añade distritos a una zona, guarda («Zona actualizada») y al
recargar algunos salen desmarcados. Al volver a guardar se borran de verdad.

## Evidencia (prod, solo lectura, 2026-10-31; sin datos personales)
- `zona_distrito`: 128 filas, 127 distritos, 1 empresa. 1 distrito en dos zonas de la misma empresa
  («Aguacaliente o San Francisco», cantón Cartago: zonas GAM y GAM (Alajuéla)-(Cartago)). 1 orden
  de ese distrito, con zona GAM.
- No hay rastro en `historial_accion` de altas/bajas de distritos en una zona: no se puede saber si
  se perdieron otros antes.
- Un distrito (Sánchez, Curridabat) sin zona con 1 orden: preguntado a Carlos si debe tener zona.

## Causa (auditoría de solo lectura, código = prod)
- Nada impide un distrito en dos zonas: `zona_distrito` solo tiene `@@unique([zonaId, distritoId])`;
  `ZonaService.prepararDatos` solo dedup + existencia; `ZonaRepository.create/update` insertan sin
  validar. La R20 de la feature 24 («distrito ya en otra zona → conflict») se perdió al pasar a N:M
  (20260711210000) y nunca se reimplementó.
- `GeografiaSelector` deja marcar distritos con «(zona: X)»; con ≥2 zonas no muestra etiqueta.
- `GeoRepository.listArbol` (ficha 374) colapsa ≥2 zonas a `zonaId: null`; `ZonasTarifasModule.abrirEditar`
  deriva los distritos de `d.zonaId === full.id` → desmarcado en ambas → el siguiente guardado
  (`deleteMany`+`createMany`) lo borra y la reconciliación 366 puede mover órdenes en silencio.
- «un distrito ya está asignado» en `CrearZonaForm.mensajeDeError` es código muerto (P2002 crudo →
  INTERNAL → «Ocurrió un error inesperado»).
- Hipótesis secundaria: `onSaved` no espera `refetch`; reabrir «Editar» con el árbol viejo.
- Otros efectos de un duplicado: alta/cotización/corrección rechazan con «no tiene zona asignada»;
  reconciliación 366 hace `continue`; `distritosCount` lo cuenta dos veces.

## Decisiones
- 2026-10-31 (Carlos): HOTFIX urgente.
- 2026-10-31 (Carlos): un distrito que ya tiene otra zona queda BLOQUEADO para seleccionarse en otra.
- 2026-10-31 (Carlos): al intentar guardar con un distrito que ya tiene otra zona, aviso de error
  (no se guarda).
- 2026-10-31 (Carlos): Aguacaliente o San Francisco se QUITA de las dos zonas (queda sin zona).

## Preguntas abiertas
- ¿Sánchez (Curridabat) debe estar en alguna zona? (no bloquea)

## Tandas

## Modelos (overrides)

## Cierre

- 2026-10-31 (Carlos): spec APROBADO, «Aprobado, implementa». Rastro en historial → ficha aparte (Q1).
