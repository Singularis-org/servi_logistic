-- SL-41 (R38, design §16.1): cuando el usuario fijo SU contrasena por ultima vez.
--
-- La pantalla «Empresas» oculta «Reenviar bienvenida» si el primer maestro ya creo la suya. Sin
-- esta marca no hay forma de saberlo: el alta le pone una contrasena aleatoria y el hash no dice
-- de donde salio.
--
-- Nulable y sin relleno a proposito: en las filas que ya existen no se puede saber si la
-- contrasena es la aleatoria del alta, y NULL deja para ellas el boton como estaba (R29).
ALTER TABLE "usuario" ADD COLUMN "contrasena_definida_at" TIMESTAMP(3);
