import { getDb } from '../utils/db'
import { addSSEClient, removeSSEClient } from '../utils/sse'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Content-Type', 'text/event-stream')
  setResponseHeader(event, 'Cache-Control', 'no-cache')
  setResponseHeader(event, 'Connection', 'keep-alive')

  const db = await getDb()

  const stream = new ReadableStream({
    start(controller) {
      addSSEClient(controller)

      // Envoyer les données initiales
      const initialData = {
        giveaways: db.data.giveaways,
        gifts: db.data.gifts,
      }
      controller.enqueue(
        new TextEncoder().encode(`event: init\ndata: ${JSON.stringify(initialData)}\n\n`),
      )

      // Heartbeat pour maintenir la connexion
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(': heartbeat\n\n'))
        }
        catch {
          clearInterval(heartbeat)
          removeSSEClient(controller)
        }
      }, 30000)

      // Cleanup quand le client se déconnecte
      event.node.req.on('close', () => {
        clearInterval(heartbeat)
        removeSSEClient(controller)
        controller.close()
      })
    },
  })

  return new Response(stream)
})
