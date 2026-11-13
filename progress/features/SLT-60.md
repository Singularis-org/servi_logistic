# SLT-60 «Confirmación del pago a la plataforma por el superadmin»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-60 | confirmar-pago-plataforma | fullstack | high | feature/SLT-60-confirmar-pago-plataforma | Camilo | pending |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.2 — spec_author escribiendo design.md y tasks.md sobre el requirements.md sembrado por
/afinar-feature (2026-11-11). Worktree sincronizado con origin/dev el 2026-11-13 (traía 281
commits de atraso, entre ellos SLT-118 ya mergeada).

## Evaluación
- zone `fullstack`: pantalla del superadmin (Plataforma > Empresas), estado en la wallet, contadores;
  y backend: confirmación, reparto entre facturas, contra-asientos, anulaciones.
- complexity `high`: toca wallet/caja, facturas de SLT-118 y pagos de SL-45; varias reglas de saldo.
- ruta `completa`: dinero y asientos contables (suelo de `docs/specs.md > Tres rutas`).
- Dependencias: SL-45 «Pago a la plataforma desde la wallet» done; SLT-118 «Planes: factura por empresa
  y período con la cuota y las órdenes» done.
- Cupo fullstack: 6 en vuelo con 5 de cupo; el exceso lo causan las fichas geo en pausa (aceptado por
  el humano el 2026-11-11). Fuera de geo, solo SLT-119 «Planes: pantallas de facturas para el
  superadmin y el maestro».
- `archivos-en-vuelo.mjs --candidata SLT-60` (2026-11-13): sin conflicto con 29 features en vuelo
  (repetir en F2.0, con tasks.md).

## Decisiones
Ver `specs/SLT-60-confirmar-pago-plataforma/requirements.md` (afinada 2026-11-11).
- 2026-11-13: spec_author devolvió BLOQUEADO por tamaño (~45 archivos, tope 32). El humano aceptó partirla en
  tres: SLT-60 (confirmar y repartir), SLT-142 «Rechazo del pago a la plataforma y su estado en la wallet» y
  SLT-143 «El superadmin registra un pago hecho por fuera y anula un pago confirmado». También cerró: solo se
  pagan facturas cerradas, sin excedentes (el tope de registro cambia), y en prod no hay pagos previos.
- 2026-11-13: segunda pasada de spec_author, otra vez BLOQUEADO (~46 archivos; ~13 tests existentes registran
  pagos sin factura cerrada y hay que sembrarles una). El humano **acepta un PR por encima del tope**
  (`docs/gate.md > Tamaño del PR`), opción «Aceptar PR sobre el tope», en vez de partir otra vez.
- Pendiente del humano: añadir en Trello el checklist «Depende de» (el script no lo edita): SLT-142 en
  SLT-132; SLT-60 y SLT-143 en SLT-121.

## Preguntas abiertas

## Tandas

## Modelos (overrides)

## Cierre
