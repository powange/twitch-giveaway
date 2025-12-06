import { getDb, type Giveaway } from '../../utils/db'
import { broadcastUpdate } from '../../utils/sse'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'ID requis',
    })
  }

  // Support giftIds (array) ou giftId (string pour rétrocompatibilité)
  const giftIds: string[] = body.giftIds || (body.giftId ? [body.giftId] : [])

  if (!body.twitchChannel || !body.type || !body.date) {
    throw createError({
      statusCode: 400,
      message: 'Chaîne Twitch, type et date sont requis',
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

  const giveawayIndex = db.data.giveaways.findIndex(g => g.id === id)

  if (giveawayIndex === -1) {
    throw createError({
      statusCode: 404,
      message: 'Giveaway non trouvé',
    })
  }

  // Vérifier que tous les cadeaux existent
  for (const giftId of giftIds) {
    const giftExists = db.data.gifts.some(g => g.id === giftId)
    if (!giftExists) {
      throw createError({
        statusCode: 400,
        message: `Cadeau non trouvé: ${giftId}`,
      })
    }
  }

  const existing = db.data.giveaways[giveawayIndex]!
  const updatedGiveaway: Giveaway = {
    id: existing.id,
    createdAt: existing.createdAt,
    twitchChannel: body.twitchChannel,
    date: body.date,
    giftIds,
    type: body.type,
    command: body.type === 'command' ? body.command : undefined,
    streamElementsUrl: body.type === 'streamelements' ? body.streamElementsUrl : undefined,
    drawTime: body.drawTime || undefined,
    requireFollow: body.requireFollow ?? false,
    closed: body.closed ?? existing.closed ?? false,
  }

  db.data.giveaways[giveawayIndex] = updatedGiveaway
  await db.write()
  await broadcastUpdate()

  return updatedGiveaway
})
