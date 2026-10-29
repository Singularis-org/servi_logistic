# DESTRUCTIVA — 20261028120000_modulo_wallet_nucleo

Feature: SL-23 (ajuste de núcleo sin SDD, PR #28)
Qué se elimina: las filas de `organizacion_modulo` con `modulo = 'wallet'` (una por empresa que tuviera Wallet encendido) y el valor `wallet` del enum `modulo_apagable` (RENAME del tipo viejo, ALTER COLUMN … TYPE y DROP TYPE).
Por qué: Wallet pasa al núcleo, siempre activo, sin fila que encender. Postgres no borra valores de un enum, así que no hay camino aditivo: hay que recrear el tipo, y el cambio de tipo falla mientras queden filas `wallet`.
Backup: las filas solo encienden el módulo, no llevan datos propios; `down.sql` recrea el enum con `wallet` y reinserta una fila por empresa (Wallet encendido para todas). Lo que no recupera: una empresa que tuviera Wallet apagado antes de la ida volvería encendida. El rastro en `historial_accion` y `jobs.last_error` es texto y no se toca.
Aprobó: Camilo, 2026-10-29 (registrado después de mergear #28, al entrar la guardia del PR #29)
