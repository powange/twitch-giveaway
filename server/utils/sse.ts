import { getDb } from './db'

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
  const db = await getDb()
  notifySSEClients('update', {
    giveaways: db.data.giveaways,
    gifts: db.data.gifts,
  })
}

export function broadcastDrawAlert(channel: string) {
  notifySSEClients('draw-alert', { channel })
}

export function broadcastOrbeStream(channel: string) {
  notifySSEClients('orbe-stream', { channel })
}
