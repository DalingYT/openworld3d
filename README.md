# OpenWorld3D

Un mundo 3D multijugador para explorar con tu Bloquito desde el navegador, en PC o en móvil. Juega con tus amigos en la misma partida o abre una partida en tu red local.

**[Jugar OpenWorld3D](https://dalingyt.github.io/openworld3d/)**

## Qué puedes hacer

- Explorar un mundo procedural que se genera por zonas, con montañas, playa y una ciudad costera. El agua reduce la velocidad al caminar y al conducir.
- Sacar tu carro con **Sacar carro**. Toma el color de tu Bloquito, lleva tu apodo encima y solo tú puedes conducirlo. Puedes volver a sacarlo en otro sitio. Los carros rebotan y se empujan al chocar.
- Abrir **Tienda** y equiparte gratis una gorra, un sombrero vaquero, un gorro o un sombrero de copa. El navegador recuerda tu elección.
- Usar el chat de frases rápidas y lanzar confeti con **¡Fiesta!**. El ciclo de día y noche dura ocho minutos y se sincroniza entre jugadores.
- Consultar **X, Y y Z** en la esquina superior izquierda. Puedes ocultarlas en **Configuración**.

## Controles

- En **PC**, usa `WASD` para caminar o dirigir el carro, `Shift` para correr a pie y `Espacio` para saltar. Pulsa `T` para cambiar la cámara, `C` para abrir el chat y `E` para subir o bajar del carro. En primera persona, haz clic en el juego para mirar y usa `Esc` para soltar el cursor. En tercera persona, gira la cámara manteniendo el clic derecho.
- En **móvil**, usa el joystick para moverte o conducir y arrastra el escenario con otro dedo para mirar. Toca **Saltar**, **Correr** y **3.ª persona** según necesites. Acércate a tu carro y toca **Subir al carro**.

## Jugar en LAN

Usa Node.js 24, la versión que utiliza el flujo de publicación. Ejecuta estos comandos desde la carpeta del proyecto.

```sh
npm ci
npm run dev
```

En la PC anfitriona, abre la dirección **Local** que imprime Vite. En otro dispositivo de la misma red, abre la dirección **Network**. En ambos casos, introduce un apodo para entrar. Usa `npm run build` para comprobar la compilación de producción.

## Publicar por Internet

GitHub Pages entrega el juego al navegador. Render ejecuta el servidor que comparte jugadores, chat, sombreros y carros.

1. En Render, crea el servicio desde `render.yaml` con **New → Blueprint**. Configura `PAGES_ORIGIN` con el origen HTTPS de tu sitio, por ejemplo `https://dalingyt.github.io`. Usa el dominio, sin la ruta `/openworld3d/`.
2. Comprueba que la URL del servicio seguida de `/health` responda `ok`. El flujo usa `https://openworld3d-game.onrender.com` por defecto. Si despliegas en otra dirección, configura `VITE_MULTIPLAYER_URL` en las variables de GitHub Actions.
3. En GitHub, abre **Settings → Pages** y elige **GitHub Actions** como fuente. El flujo **Publicar OpenWorld3D** se ejecuta al subir cambios a `main` o manualmente desde **Actions**.
4. En Render, comprueba **Settings → Auto-Deploy → On Commit** si el servicio está conectado a GitHub. Si un cambio de servidor queda pendiente, usa **Manual Deploy → Deploy latest commit** y espera a que aparezca **Live**. Luego recarga el juego.

Si la web ya cambió pero falta **Sacar carro** o **Administrador** después de desbloquearlo, comprueba que Render haya desplegado el mismo commit que Pages. El plan gratuito puede tardar alrededor de un minuto en despertar tras estar inactivo.

[Guía de GitHub Pages con Vite](https://vite.dev/guide/static-deploy#github-pages) · [Despliegues en Render](https://render.com/docs/deploys) · [Plan gratuito de Render](https://render.com/docs/free)

## Administrador

En local, crea `.env.local` con `ADMIN_CODE=` seguido de tu código privado de ocho dígitos y reinicia Vite. Git excluye ese archivo. En Render, añade `ADMIN_CODE` en **Environment** o vincula al servicio el grupo que lo contiene, y despliega el servidor.

Entra a **Configuración → Administrador** e introduce el código. Aparecerá **Administrador** junto a **Configuración**. Selecciona un jugador y usa los botones del panel o escribe:

- `/kick` para expulsarlo de su sesión actual.
- `/rename nuevo apodo` para cambiarle el nombre en vivo.

El servidor valida el permiso al ejecutar cada acción. El acceso termina cuando te desconectas.

## Tecnología

- El cliente usa TypeScript, Three.js y Vite.
- El servidor funciona con Node.js y comunica a los jugadores mediante HTTP y eventos del servidor (SSE).
- GitHub Actions publica el cliente en GitHub Pages y Render aloja el servidor.
