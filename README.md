# Equipo de agentes: Orquestador · Develop · Testing

Tres agentes de IA que trabajan juntos para modificar una web de ejemplo (una panadería con dos páginas y un CSS):

1. **Orquestador**: recibe la petición (p. ej. *«Añade una página de contacto a esta web»*), la divide en 2–5 tareas con **criterios de aceptación** y **comprobaciones automáticas**, y se las va asignando a Develop.
2. **Develop**: programa cada tarea y devuelve los archivos completos que crea o cambia.
3. **Testing**: comprueba el trabajo de Develop y, si algo falla, se lo devuelve con la lista de fallos. Se repite hasta que pasa (máximo 3 intentos por tarea).

En pantalla se ve en directo qué hace cada agente (Trabajando / En espera / Terminado), un tablero con el estado de cada tarea (Pendiente → Desarrollo → Pruebas → Hecho, con «Cambios pedidos» cuando Testing devuelve algo), la conversación entre agentes y una vista previa de la web resultante con su código.

## Cómo funciona por dentro

```
POST /api/runs            crea la ejecución y copia la web de partida en la BD
POST /api/runs/:id/tick   avanza UN paso (una llamada a un agente)
GET  /api/runs/:id        estado completo (agentes, tareas, eventos, archivos)
GET  /api/runs/:id/site/* sirve la web generada para la vista previa
```

- **Un paso por petición.** Cada `tick` hace una sola llamada a un agente y guarda el resultado en la base de datos. Así ninguna función de Vercel supera el límite de tiempo del plan gratuito, y la interfaz puede enseñar el estado entre paso y paso. El panel de la ejecución llama a `tick` en bucle mientras está abierto; si se cierra, la ejecución se queda en pausa y continúa al volver a abrirla.
- **Bloqueo en la BD.** Un `UPDATE … WHERE lock_until < now` garantiza que solo se ejecuta un paso a la vez aunque haya varias pestañas abiertas.
- **Testing en dos capas.** Primero comprobaciones deterministas (las que definió el Orquestador para la tarea + revisión de toda la web: HTML bien cerrado, enlaces internos que existen, `<title>`, `lang`, cada campo de formulario con su `<label>`). Si todo eso pasa, la IA revisa los criterios de aceptación. Así los fallos que vuelven a Develop son concretos y verificables.
- **Seguridad.** Las rutas de archivo que devuelve la IA se validan (sin `..` ni rutas absolutas, solo html/css/js/svg/json/txt). La vista previa va en un `iframe` con `sandbox`. Ninguna clave está en el código: todo va por variables de entorno.
- **Modo simulado.** Sin clave de IA (o eligiéndolo en el formulario) los agentes son deterministas y Develop comete errores a propósito en el primer intento, para que se vea el ciclo Develop ⇄ Testing sin gastar nada.

### Estructura

```
src/lib/engine.ts            máquina de estados (planificar → desarrollar → probar → …)
src/lib/agents/orchestrator.ts
src/lib/agents/develop.ts
src/lib/agents/testing.ts
src/lib/agents/checks.ts     comprobaciones automáticas de Testing
src/lib/agents/mock.ts       agentes simulados
src/lib/llm.ts               Vercel AI Gateway / Gemini / Claude / API compatible con OpenAI (fetch, sin SDK)
src/lib/db.ts, store.ts      Turso (libSQL) y acceso a datos
src/app/runs/[id]/RunDashboard.tsx   panel en directo
src/proxy.ts                 usuario y contraseña opcionales
```

## Puesta en marcha en local

```bash
npm install
cp .env.example .env.local   # opcional: sin nada funciona en modo simulado con SQLite local
npm run dev
```

## Publicación gratuita

1. **Base de datos (Turso, gratis)**: en [turso.tech](https://turso.tech) crea una base de datos y copia la URL (`libsql://…`) y un token. Las tablas se crean solas en el primer uso.
2. **IA (gratis)**: una clave de [Vercel AI Gateway](https://vercel.com/ai-gateway) (`AI_GATEWAY_API_KEY`, con crédito gratuito mensual), o una clave en [Google AI Studio](https://aistudio.google.com/apikey) (`GEMINI_API_KEY`) o en [Groq](https://console.groq.com) (`OPENAI_API_KEY` + `OPENAI_BASE_URL=https://api.groq.com/openai/v1`).
3. **Vercel**: importa el repositorio de GitHub y añade en *Settings → Environment Variables*:
   - `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`
   - `AI_GATEWAY_API_KEY` o `GEMINI_API_KEY` (o la alternativa)
   - `BASIC_AUTH_USER`, `BASIC_AUTH_PASSWORD` (opcional, para que nadie más gaste la cuota)
4. Despliega. Ninguna clave se sube al repositorio (`.env*` está en `.gitignore`).

## Variables de entorno

Ver [`.env.example`](.env.example).
