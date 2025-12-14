import { broadcastOrbeStream } from '../../utils/sse'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body.channel || typeof body.channel !== 'string') {
    throw createError({
      statusCode: 400,
      message: 'Channel is required'
    })
  }

  // Nettoyer le channel (extraire le nom du streamer si c'est une URL)
  let channel = body.channel.trim().toLowerCase()

  // Extraire le nom du streamer d'une URL Twitch
  const urlMatch = channel.match(/(?:https?:\/\/)?(?:www\.)?twitch\.tv\/(\w+)/i)
  if (urlMatch && urlMatch[1]) {
    channel = urlMatch[1].toLowerCase()
  }

  // Vérifier que c'est un nom de channel valide
  if (!/^\w+$/.test(channel)) {
    throw createError({
      statusCode: 400,
      message: 'Invalid channel name'
    })
  }

  // Broadcaster à tous les clients
  broadcastOrbeStream(channel)

  return { success: true, channel }
})
