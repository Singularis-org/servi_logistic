# SLT-60 «Confirmación del pago a la plataforma por el superadmin»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-60 | confirmar-pago-plataforma | fullstack | high | feature/SLT-60-confirmar-pago-plataforma | Camilo | in_progress |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F2.6 — done. PR #151 mergeado en dev el 2026-11-17; tarjeta en Finalizado; worktree y rama
desmontados; grafo borrado.

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

<!-- tamano-pr-aceptado: 2026-11-13 · un solo PR por encima del tope (~67 archivos en el spec, 75 en el diff); el humano eligió «Aceptar PR sobre el tope» y luego «Sí, 55 en un PR», y aprobó el spec con 67 -->

## Tandas
- 2026-11-13 · T0–T9 (salvo T7.3 al CI y T9.2 al humano) · 67cde81e · typecheck 0, lint 0, guardias verdes salvo dependencias-declaradas-presentes (rojo previo); init.sh corta por cupo (geo en pausa). Review vuelta 1: APROBADO, 0 mayores y 5 menores.

## Modelos (overrides)

## Cierre
- 2026-11-17: PR https://github.com/Singularis-org/servi_logistic/pull/151 mergeado en dev (CI run 44107372846,
  `gate-completo` verde). Tarjeta movida a done y comentada con la URL del PR.
- Resumen: el superadmin confirma el pago a la plataforma y se reparte entre facturas cerradas (sin excedentes).
  Rechazo y estado en la wallet siguen en SLT-142; pago por fuera y anulación, en SLT-143.
- PR por encima del tope (aceptado por el humano el 2026-11-13).
- Al moverla a done, la tarjeta perdió el label `ruta:completa`; se repuso con `trello.mjs editar`.
- Baseline de rojos: el CI avisa que `tests/integration/db/454/retiro-estados-migration.test.ts` ya pasa.
  Pendiente: borrarlo de `tests/baseline-rojos.json` en un PR (no se hizo en #151).
- Métricas (`node scripts/metricas.mjs informe --key SLT-60`):
  - gate rápido: 4 corridas, mediana 21 s, p90 57 s, 100% en rojo (cupo geo en pausa).
  - tomar -> spec listo 1.2 h; espera de aprobación 0 h; implementación hasta el PR 3.9 h.
  - PR -> merge y ciclo completo: sin datos.
