-- DOWN (SL-41, R38): quita la marca. Solo se pierde cuando cada usuario fijo su contrasena.
ALTER TABLE "usuario" DROP COLUMN "contrasena_definida_at";
