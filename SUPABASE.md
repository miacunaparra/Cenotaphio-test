# Configurar inicio de sesión y respaldo

La aplicación deja Inicio y Explorar disponibles sin iniciar sesión. En la publicación de prueba de Gruta, **Mi altar** también se puede usar sin cuenta y guarda los cambios en el almacenamiento local de ese navegador. Fuera de ese modo, la sección solicita una cuenta mediante Supabase Auth y respalda los altares en una fila JSON privada por usuario. Los ejemplos incluidos en la página son de solo lectura y no se copian al respaldo personal.

## Modo de prueba de Gruta

En `https://miacunaparra.github.io/gruta/`, Mi altar funciona sin iniciar sesión y los perfiles se guardan solo en el navegador actual; no se sincronizan con Supabase ni con otros dispositivos. Para volver a empezar, borra los datos del sitio en el navegador. En desarrollo local, activa el mismo comportamiento agregando `?modo=pruebas` a la URL.

## Preparar el proyecto

1. Crea un proyecto en Supabase.
2. En **SQL Editor**, ejecuta el contenido de `supabase-schema.sql`. La tabla activa RLS y solo permite a cada cuenta leer y modificar su propia fila. La función `get_public_memories()` permite que Explorar lea exclusivamente los recuerdos de altares no privados y solo devuelve el nombre del altar, nombre y tipo del recuerdo, fecha, descripción, historia y foto; no da acceso público a la tabla ni a los respaldos completos.
3. En **Authentication → URL Configuration**, configura la URL del sitio y agrega las URLs de desarrollo que utilizarás a la lista de redirecciones permitidas.
4. En **Authentication → Providers → Email**, habilita correo y contraseña. La confirmación de correo puede requerir configurar SMTP para el dominio de producción.
5. Copia la **Project URL** y la **publishable key** (o la `anon` key heredada) a `supabase-config.js`, en `url` y `anonKey`.
6. Publica el contenido de `mixi-app/` en HTTPS y prueba registro, confirmación, inicio de sesión, recuperación de contraseña y aislamiento entre dos cuentas.

La clave publishable/anon se usa en el navegador; nunca pongas una `service_role` o clave secreta en este archivo. La protección de los datos depende de las políticas RLS del esquema.

Explorar presenta como publicados todos los recuerdos de perfiles cuyo campo `privado` no sea `true`. Cambiar esa opción excluye sus recuerdos de la consulta pública. Si ya tenías el esquema instalado, vuelve a ejecutar el SQL actualizado para crear la función RPC.

## Datos guardados anteriormente en este navegador

Los datos del prototipo anterior permanecen en `localStorage` y no se importan automáticamente: este navegador puede ser compartido, y asignarlos a la primera cuenta que inicie sesión podría exponerlos a la persona equivocada. Si hay datos anteriores, después de iniciar sesión puedes elegir **Importar datos de este navegador**; se te pedirá confirmación y se copiarán a la cuenta actual sin borrar la copia local. Los perfiles de ejemplo incluidos en ese respaldo también se copiarán como altares editables de la cuenta.
