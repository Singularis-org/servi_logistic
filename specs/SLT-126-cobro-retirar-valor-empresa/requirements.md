# SLT-126 — cobro-retirar-valor-empresa · requirements.md

> **Zona** fullstack · **Complejidad** medium · **Ruta** completa (migración, `.prisma`, `.sql` y dinero) ·
> **depends_on** ninguno · **Rama** `feature/SLT-126-cobro-retirar-valor-empresa`
>
> **Alcance.** En Plataforma > Empresas el superadmin ya no puede fijar un cobro por orden propio de cada
> empresa. El cobro por orden sale solo del plan de la empresa o del valor global.
> - Quitar el editor de la fila de Empresas («Cambiar», «Usar el global») y la action
>   `fijarCobroEmpresaAction` con su repositorio y schema.
> - La celda sigue mostrando el cobro vigente y su fuente (del plan / global); desaparece la fuente «propio».
> - Migración que borra `organizacion.cobro_plataforma_por_orden` y ajusta las funciones SQL de costeo:
>   precedencia plan > global.
> - Antes del deploy: contar en prod las empresas con valor propio e informar; desde el deploy cobran lo de
>   su plan o el global. Las órdenes ya creadas conservan su importe (congelado).
>
> **Lo que NO entra.** El valor global y su bloque «Cobro por orden» (se quedan, salvo el texto de ayuda de
> R4). El costo por orden del plan (SLT-66, SLT-83). La traza de facturación (SLT-85): sus filas históricas
> no se tocan. Una pantalla que muestre la fuente de los movimientos históricos (hoy no existe ninguna).
>
> Pedido del humano el 2026-11-11 (vía leader). El bloque de Alcance y la tabla de «Decisiones cerradas»
> son del humano; `spec_author` no los reabre.

## Lo que ya existe

Grafo de código: el proyecto de este worktree no está indexado en `codebase-memory-mcp` (2026-11-11); la
búsqueda se hizo con Grep/Read. Buscado `cobro_plataforma_por_orden`, `cobroPorOrden`, `fijarDeEmpresa`,
`fijarCobroEmpresa`, fuente `"empresa"`, «propio» y «Usar el global» en `feature_list.json`, `specs/` y el
código: ninguna ficha ni spec previo retira el valor propio. SL-40 lo creó; SLT-66 (precedencia valor propio
> plan > global), SLT-83 R7 y SLT-85 R9 lo dan por vigente; SL-43 R19 lo usa en la demo. Detalle en
`design.md > Lo que ya existe`.

## Decisiones cerradas (no reabrir)

| Fecha | Decisión | Cubierta por |
|---|---|---|
| 2026-11-11 | El superadmin no puede cambiar el cobro por orden de una empresa; se quitan el editor de la fila, la action, su repositorio y su schema. | R1, R2 |
| 2026-11-11 | El cobro por orden sale solo del plan de la empresa o del valor global: precedencia plan > global (> 0,00 sin configurar). | R5, R6, R7, R11 |
| 2026-11-11 | La celda sigue mostrando el cobro vigente y su fuente; desaparece la fuente «propio». | R3, R11 |
| 2026-11-11 | Borrar la columna `organizacion.cobro_plataforma_por_orden` con migración (no dejar dato muerto). Ruta completa. | R10, R12 |
| 2026-11-11 | Las órdenes ya creadas conservan su importe congelado. | R8, R9 |
| 2026-11-11 | Antes del deploy: contar en prod las empresas con valor propio e informar. Es un paso de despliegue, no un requisito de código. | Paso de despliegue D1 (sin `R<n>`, por decisión del humano) |
| 2026-11-11 | (P0) Una sola ficha y un solo PR, sin partir. La tarjeta lleva `tamano-pr-aceptado` y `ruta:completa`. | Todos (sin rebanadas) |
| 2026-11-11 | (P1) Texto de ayuda del valor global: «Se aplica a cada orden de las empresas cuyo plan no fija un cobro por orden. Las órdenes ya creadas conservan su importe.» | R4 |
| 2026-11-11 | (P2) La receta de la demo crea o reutiliza un plan con costo por orden fijo de 100 y se lo asigna a las empresas demo. | R13 |
| 2026-11-11 | (P3) Sin copia de los importes antes de borrar la columna; el informe del paso D1 es el registro. | R12, D1 |

## Requisitos (EARS)

> Escritos por `spec_author` el 2026-11-11 y ajustados con las respuestas de P0–P3 el mismo día.
> «Valor propio» es el cobro por orden fijado a una empresa concreta (hoy
> `organizacion.cobro_plataforma_por_orden`, fuente `empresa`). «Regla vigente» es la que decide el cobro
> de una orden nueva (hoy `cobro_plataforma_tarifa_de`, SLT-66 R12 y SLT-83 R7). «Movimiento» es una
> fila de `cobro_plataforma_movimiento` (SL-40); «traza», una de `cobro_plataforma_traza` (SLT-85).

### La pantalla y el servidor

- **R1** — La pantalla Plataforma > Empresas NO DEBE ofrecer, en ninguna fila, un control para fijar,
  cambiar o quitar el cobro por orden de esa empresa: ni el botón «Cambiar», ni «Usar el global», ni un
  campo de importe en la fila.
- **R2** — El sistema NO DEBE tener ninguna operación de servidor que fije o quite un valor propio de una
  empresa. Las únicas operaciones del cobro por orden que DEBEN quedar son leer y fijar el valor global, y
  las dos DEBEN seguir respondiendo `forbidden` a un actor que no sea de la plataforma (SL-40 R6).
- **R3** — Cada fila de Plataforma > Empresas DEBE mostrar el cobro vigente de la empresa (fijo con su
  importe, o porcentual con su porcentaje y mínimo, SLT-83 R22) y su fuente: «del plan» si sale del plan,
  y «global» si sale del valor global o del global sin configurar. NO DEBE mostrar nunca «propio».
- **R4** — El bloque del valor global DEBE mostrar como ayuda exactamente: «Se aplica a cada orden de las
  empresas cuyo plan no fija un cobro por orden. Las órdenes ya creadas conservan su importe.»

### La regla del cobro

- **R5** — CUANDO se crea una orden, el sistema DEBE decidir su cobro solo con el plan de la empresa y el
  valor global, en este orden:
  - SI el plan de la empresa es porcentual, ENTONCES DEBE congelar sus condiciones y cobrar como SLT-83;
  - SI el plan fija un costo por orden, ENTONCES DEBE cargar ese importe con fuente `plan`;
  - SI la empresa no tiene plan o su plan no fija costo por orden, ENTONCES DEBE cargar el valor global
    con fuente `global`;
  - SI además no hay valor global, ENTONCES DEBE cargar `0.00` con fuente `sin_configurar`.
- **R6** — Desde la migración, el sistema NO DEBE registrar ningún cargo con fuente `empresa` para una
  orden creada después de la migración.
- **R7** — SI una empresa tenía valor propio antes de la migración, ENTONCES sus órdenes nuevas DEBEN
  cobrarse por R5 igual que las de una empresa que nunca lo tuvo: por su plan (fijo o porcentual) o por
  el valor global.

### Lo que ya está cobrado

- **R8** — SI una orden creada antes de la migración tiene un cargo con fuente `empresa`, ENTONCES:
  - CUANDO se anula, el reverso DEBE llevar el mismo importe y la misma fuente que ese cargo;
  - CUANDO se recupera después de anulada, el cargo nuevo DEBE llevar el mismo importe y la misma fuente
    que el anterior.
  La fila de traza de esos movimientos DEBE llevar también la fuente `empresa` y ese importe (SLT-85 R9).
- **R9** — La migración NO DEBE crear, cambiar ni borrar ningún movimiento ni ninguna traza: el número de
  movimientos y de trazas, su suma por empresa y la deuda con la plataforma de cada empresa (SL-45 R13)
  DEBEN ser los mismos antes y después de aplicarla.

### La base

- **R10** — Después de la migración, la base NO DEBE guardar un cobro por orden a nivel de empresa: la
  columna `organizacion.cobro_plataforma_por_orden` y su CHECK NO DEBEN existir, y ninguna función ni
  trigger DEBE leerla. El valor `empresa` del tipo de fuente DEBE seguir existiendo, para que los
  movimientos y trazas históricos que lo llevan sigan siendo válidos.
- **R11** — La lectura del cobro vigente de una empresa —el listado de Plataforma > Empresas, el detalle de
  empresa del superadmin y «Mi plan» de la empresa— DEBE salir de la misma regla de R5, y NO DEBE devolver
  nunca la fuente `empresa`. «Mi plan» NO DEBE mostrar «precio acordado para tu empresa» y el detalle del
  superadmin NO DEBE mostrar «excepción de la empresa».
- **R12** — CUANDO se revierte la migración (`down.sql`), el sistema DEBE volver a tener la columna con su
  CHECK, vacía (NULL) en todas las empresas, y la regla vigente anterior (valor propio > plan > global > 0).
  Los importes borrados NO DEBEN volver: no se guarda copia (P3).

### La demo de QA

- **R13** — CUANDO la demo de QA termina, cada empresa demo DEBE tener asignado un plan con costo por orden
  fijo de `100.00` desde antes de su primera orden, y cada orden creada DEBE tener su cargo de la
  plataforma de `100.00` con fuente `plan` (SL-43 R19, con el plan en lugar del valor propio), además del
  pago a la plataforma registrado.

## Paso de despliegue (sin requisito de código)

- **D1** — Antes de aplicar la migración en producción: contar las empresas con
  `cobro_plataforma_por_orden IS NOT NULL`, listar empresa e importe e informar al humano. Ese informe es
  el único registro de los importes (P3). Lo ejecuta quien tenga acceso de lectura a producción; queda
  anotado en `progress/features/SLT-126.md`.

## Preguntas abiertas

Ninguna. P0–P3 cerradas el 2026-11-11 (tabla de arriba).
