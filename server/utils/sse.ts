const clients = new Set<ReadableStreamDefaultController>()

export function addSSEClient(controller: ReadableStreamDefaultController) {
  clients.add(controller)
}

export function removeSSEClient(controller: ReadableStreamDefaultController) {
  clients.delete(controller)
}

export function notifySSEClients(event: string, data: unknown) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const controller of clients) {
    try {
      controller.enqueue(new TextEncoder().encode(message))
    }
    catch {
      clients.delete(controller)
    }
  }
}

export async function broadcastUpdate() {
  const { getDb } = await import('./db')
  const db = await getDb()
  notifySSEClients('update', {
    giveaways: db.data.giveaways,
    gifts: db.data.gifts,
  })
}
