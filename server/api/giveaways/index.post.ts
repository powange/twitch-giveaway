import { getDb, type Giveaway } from '../../utils/db'
import { broadcastUpdate } from '../../utils/sse'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body.twitchChannel || !body.giftId || !body.type || !body.date) {
    throw createError({
      statusCode: 400,
      message: 'Chaîne Twitch, cadeau, type et date sont requis',
    })
  }

  if (!['command', 'ticket', 'streamelements'].includes(body.type)) {
    throw createError({
      statusCode: 400,
      message: 'Le type doit être "command", "ticket" ou "streamelements"',
    })
  }

  if (body.type === 'streamelements' && !body.streamElementsUrl) {
    throw createError({
      statusCode: 400,
      message: 'L\'URL StreamElements est requise pour ce type',
    })
  }

  const db = await getDb()

  // Vérifier que le cadeau existe
  const giftExists = db.data.gifts.some(g => g.id === body.giftId)
  if (!giftExists) {
    throw createError({
      statusCode: 400,
      message: 'Cadeau non trouvé',
    })
  }

  const giveaway: Giveaway = {
    id: crypto.randomUUID(),
    twitchChannel: body.twitchChannel,
    date: body.date,
    giftId: body.giftId,
    type: body.type,
    streamElementsUrl: body.type === 'streamelements' ? body.streamElementsUrl : undefined,
    drawTime: body.drawTime || undefined,
    requireFollow: body.requireFollow ?? false,
    createdAt: new Date().toISOString(),
  }

  db.data.giveaways.push(giveaway)
  await db.write()
  await broadcastUpdate()

  return giveaway
})
