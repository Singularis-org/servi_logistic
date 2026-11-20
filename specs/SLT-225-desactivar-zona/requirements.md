# SLT-225 «Desactivar zona: sacarla del trabajo nuevo sin borrar su historia» — requirements

> Ruta completa, zona fullstack, complejidad medium. Rango reservado: **R1740–R1769** (se usan
> R1740–R1761). Lleva migración (columna nueva en `zona`, dos triggers y dos valores del enum del
> historial). El grafo de código no indexa este worktree: todo se leyó con Grep/Read.

## Preguntas abiertas (para Carlos, máximo 3)

> **Resueltas (Carlos, 2026-11-19): las tres según la recomendación.** P1 sí sigue en los filtros
> de consulta; P2 sí bloquea un usuario dado de baja; P3 sí bloquean devolviendo/por devolver a tienda.

1. **¿La zona desactivada sigue en los filtros de consulta?** (listado de órdenes, entregas,
   analítica). La ficha dice «deja de aparecer en filtros», pero esos filtros son para buscar
   historia: «GAM Kevin (Alajuéla)» tiene unas 150 órdenes viejas y, si se quita del filtro, ya no
   hay forma de listarlas por zona. Es lo mismo que se decidió con la geografía retirada (FICHA 374).
   **Recomiendo: sí, sigue en los filtros de consulta, sin cambios**, y se quita solo donde se crea o
   se asigna trabajo (usuarios, tarifas, distritos). R1758 está escrito con esa recomendación; si
   Carlos dice que no, R1758 pasa a «no la ofrece» y se toca `ZonaRepository.listLite`.
2. **¿Un usuario dado de baja también bloquea la desactivación?** **Recomiendo: sí, cuenta
   cualquier usuario que tenga la zona asignada, sea cual sea su estado.** Si no contara, al
   reactivar a esa persona quedaría trabajando en una zona desactivada. Cambiarle la zona a un
   usuario dado de baja se hace desde el mismo formulario de usuarios. R1743 está escrito así.
3. **¿Bloquean las órdenes que van «devolviendo a tienda» o están «por devolver a tienda»?** No
   están terminadas: el paquete todavía no ha vuelto a la tienda. Si las 41 «en devolución a tienda»
   de la ficha están en alguno de esos dos estados, la zona no se podrá desactivar hasta que
   lleguen a «devuelta a tienda». **Recomiendo: sí, bloquean.** Son paquetes que todavía se están
   moviendo, y la definición de «orden sin terminar» ya existe en el repo
   (`ESTADOS_TERMINALES`: entregado, devuelta a tienda, incidente). R1742 está escrito así.

## Alcance

Problema real (producción, 2026-11-19). San Rafael (Alajuela) se movió a «GAM». Ahora el cliente
quiere eliminar la zona «GAM Kevin (Alajuéla)», pero el borrado físico (`ZonaRepository.hardDelete`)
falla. Lo frena la FK RESTRICT desde `orden`: 109 entregadas, 41 en devolución a tienda y 3
`en_bodega_central` con un distrito que no tiene zona. Además la zona tiene 6 usuarios asignados.
Borrarla obligaría a reescribir la historia.

La salida es **desactivar**. La zona sale del trabajo nuevo y todo lo que ya pasó en ella se queda
como está. Solo se puede desactivar cuando ya no tiene trabajo vivo. Si lo tiene, el sistema dice
qué hay que mover antes. También se puede reactivar.

**Entra:**
- marca «activa» en la zona y migración que deja activas todas las zonas que ya existen;
- desactivar y reactivar desde `/configuracion/zonas`, con confirmación y con la lista de lo que
  impide desactivar;
- la zona desactivada no se edita, no recibe distritos y no se asigna a usuarios (en el servidor y
  en la base);
- no se ofrece en el formulario de usuarios ni en la pantalla de Tarifas;
- rastro en el historial de acciones (`zona_desactivada`, `zona_reactivada`);
- el aviso de «Eliminar» rechazado por historia ofrece desactivar.

**Lo que NO entra:**
- **No se borra ni se cambia nada de la historia.** Órdenes, cierres, tarifas, grupos de distritos,
  saldos de satélites, analítica y el historial siguen apuntando a la zona y mostrándola con su
  nombre.
- **No se mueven órdenes ni usuarios automáticamente.** Moverlos lo hace la persona, con lo que ya
  existe: quitar distritos editando la zona (SLT-198 «Cerrar una bodega: dejar una zona sin
  distritos»), cambiar la zona de cada usuario y dejar que las órdenes terminen su flujo.
- La pantalla **SINPE por bodega** y el informe de tránsito de **Envíos WhatsApp** no se tocan. Una
  zona desactivada no tiene órdenes vivas ni usuarios, así que en esas pantallas no cambia nada.
- El filtro de bodegas de **Cierres** no se toca. Ya deja fuera a toda zona que no sea la central y
  no tenga un admin de satélite en pie, y una zona desactivada no tiene usuarios.
- Pantalla nueva: ninguna. Todo va en la pantalla de zonas de hoy, con sus componentes.

## Decisiones cerradas (no reabrir)

| # | Decisión | Fuente | R |
|---|---|---|---|
| D1 | Se desactiva, no se borra. La historia queda intacta. | Ficha (Carlos, 2026-11-19) | R1741 |
| D2 | Solo se puede desactivar sin órdenes vivas ni usuarios asignados. Si los hay, el sistema dice cuáles. | Ficha | R1742, R1743, R1746, R1760 |
| D3 | Deja de aparecer para trabajo nuevo: selectores y asignación de distritos. | Ficha | R1753–R1757 |
| D4 | «Orden viva» = no eliminada y con estado fuera de `ESTADOS_TERMINALES`. Es la definición que ya usa el retiro de geografía (FICHA 374). No se usa el corte de `reconciliar-zona-ordenes.ts`, que responde otra pregunta. | spec_author, sobre el código | R1742 |
| D5 | Con distritos asignados también se rechaza: así una zona desactivada nunca puede recibir órdenes nuevas. | spec_author | R1744, R1754 |
| D6 | Se puede reactivar (precedentes: geografía, API keys, módulos). | spec_author | R1747 |
| D7 | No se puede desactivar la zona de bodega principal. | spec_author (precedente 376/R10) | R1745 |

## Requisitos (EARS)

### Estado de la zona

- **R1740** — El sistema DEBE guardar por cada zona si está activa o desactivada. Toda zona que ya
  existía al migrar y toda zona creada después DEBE quedar activa.
- **R1741** — CUANDO un `maestro` desactiva una zona activa que no tiene impedimentos (R1742–R1745),
  el sistema DEBE marcarla como desactivada. NO DEBE borrar ni modificar ninguna orden, usuario,
  tarifa, grupo de distritos, cierre ni fila del historial que la referencie.

### Lo que impide desactivar

- **R1742** — SI la zona tiene órdenes vivas (no eliminadas y con un estado distinto de entregado,
  devuelta a tienda e incidente), ENTONCES el sistema DEBE rechazar la desactivación. La respuesta
  DEBE traer el total, el conteo por estado y la guía (o la remisión, si no tiene guía) de hasta 20
  de esas órdenes.
- **R1743** — SI hay usuarios con esa zona asignada, del estado que sean, ENTONCES el sistema DEBE
  rechazar la desactivación y devolver el nombre, el rol y el estado de cada uno.
- **R1744** — SI la zona tiene distritos asignados, ENTONCES el sistema DEBE rechazar la
  desactivación y devolver cuántos son.
- **R1745** — SI la zona es la zona de bodega principal, ENTONCES el sistema DEBE rechazar la
  desactivación con ese motivo propio.
- **R1746** — CUANDO se rechaza una desactivación, el sistema DEBE devolver todos los impedimentos
  que tenga la zona en la misma respuesta, no solo el primero. NO DEBE escribir nada: ni la marca ni
  ninguna fila de historial.

### Reactivar y repetir

- **R1747** — CUANDO un `maestro` reactiva una zona desactivada, el sistema DEBE marcarla como
  activa. NO DEBE devolverle distritos ni usuarios.
- **R1748** — SI se pide desactivar una zona que ya está desactivada, o reactivar una que ya está
  activa, ENTONCES el sistema DEBE responder con ese motivo sin cambiar nada y sin escribir historial.

### Rastro

- **R1749** — CUANDO una zona se desactiva, el sistema DEBE escribir, en la misma transacción, una
  fila `zona_desactivada` en el historial de acciones. La fila lleva entidad `zona`, el nombre de la
  zona como etiqueta, quién lo hizo y la categoría «hace desaparecer algo».
- **R1750** — CUANDO una zona se reactiva, el sistema DEBE escribir, en la misma transacción, una
  fila `zona_reactivada` con la misma forma que en R1749.

### Permisos y empresa

- **R1751** — SI quien pide desactivar o reactivar no es `maestro`, ENTONCES el sistema DEBE
  rechazar la petición como prohibida sin leer ni escribir nada.
- **R1752** — El sistema DEBE contar los impedimentos y cambiar la marca solo con datos de la
  empresa de la sesión. Una zona de otra empresa DEBE responder «no existe», y las órdenes y
  usuarios de otra empresa NO DEBEN contar como impedimento.

### Fuera del trabajo nuevo

- **R1753** — MIENTRAS una zona está desactivada, el sistema DEBE rechazar todo guardado de esa zona
  (nombre, distritos, marca de bodega principal) con el mensaje «Esta zona está desactivada.
  Reactívala para editarla.», y no escribir nada.
- **R1754** — MIENTRAS una zona está desactivada, la base de datos DEBE rechazar que se le asigne un
  distrito, venga de donde venga la escritura. Eso incluye la escritura que compite con la
  desactivación en el mismo instante.
- **R1755** — MIENTRAS una zona está desactivada, el sistema DEBE rechazar que se asigne a un usuario
  (al crearlo o al cambiarle la zona) con el mensaje «Esa zona está desactivada; elige otra». No
  rechaza al usuario que ya la tenía y no la cambia. La base de datos DEBE rechazarlo también.
- **R1756** — El formulario de usuarios NO DEBE ofrecer zonas desactivadas en el selector de zona,
  salvo la que el usuario editado ya tiene.
- **R1757** — La pantalla de Tarifas NO DEBE ofrecer zonas desactivadas. SI la dirección de la
  pantalla pide una zona desactivada, ENTONCES DEBE mostrar la primera zona activa, como ya hace hoy
  con una zona que no existe.
- **R1758** — Los filtros de consulta (órdenes, entregas, analítica) DEBEN seguir ofreciendo la zona
  desactivada. *(Pregunta 1 resuelta: sí.)*

### Pantalla de zonas

- **R1759** — La pantalla de zonas DEBE listar primero las zonas activas y después las
  desactivadas, cada grupo por nombre. Cada zona desactivada DEBE llevar la marca «Desactivada» y
  ofrecer «Reactivar» y «Eliminar», pero no «Editar» ni «Desactivar». Cada zona activa DEBE ofrecer
  «Editar», «Desactivar» y «Eliminar».
- **R1760** — CUANDO se pulsa «Desactivar», la pantalla DEBE pedir confirmación. SI el servidor la
  rechaza por impedimentos, ENTONCES la confirmación DEBE seguir abierta y mostrar, por cada
  impedimento, qué hay que mover primero: los usuarios por nombre, las órdenes por estado y por guía,
  cuántos distritos hay o el motivo de bodega principal. CUANDO la desactivación sale bien, DEBE
  avisar y refrescar el listado. «Reactivar» DEBE comportarse igual: pide confirmación, avisa y
  refresca.
- **R1761** — CUANDO «Eliminar» se rechaza porque la zona está en uso, el aviso DEBE decir que la
  zona tiene historia (órdenes o usuarios) y que se puede desactivar en su lugar. El rechazo por
  bodega principal conserva su texto de hoy.
