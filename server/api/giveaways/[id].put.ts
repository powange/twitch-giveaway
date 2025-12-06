import { getDb, type Giveaway } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'ID requis',
    })
  }

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

  const giveawayIndex = db.data.giveaways.findIndex(g => g.id === id)

  if (giveawayIndex === -1) {
    throw createError({
      statusCode: 404,
      message: 'Giveaway non trouvé',
    })
  }

  // Vérifier que le cadeau existe
  const giftExists = db.data.gifts.some(g => g.id === body.giftId)
  if (!giftExists) {
    throw createError({
      statusCode: 400,
      message: 'Cadeau non trouvé',
    })
  }

  const updatedGiveaway: Giveaway = {
    ...db.data.giveaways[giveawayIndex],
    twitchChannel: body.twitchChannel,
    date: body.date,
    giftId: body.giftId,
    type: body.type,
    streamElementsUrl: body.type === 'streamelements' ? body.streamElementsUrl : undefined,
    drawTime: body.drawTime || undefined,
    requireFollow: body.requireFollow ?? false,
  }

  db.data.giveaways[giveawayIndex] = updatedGiveaway
  await db.write()

  return updatedGiveaway
})
