import { getDb, type Giveaway } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body.twitchChannel || !body.giftId || !body.type || !body.date) {
    throw createError({
      statusCode: 400,
      message: 'Chaîne Twitch, cadeau, type et date sont requis',
    })
  }

  if (!['command', 'ticket'].includes(body.type)) {
    throw createError({
      statusCode: 400,
      message: 'Le type doit être "command" ou "ticket"',
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
    drawTime: body.drawTime || undefined,
    requireFollow: body.requireFollow ?? false,
    createdAt: new Date().toISOString(),
  }

  db.data.giveaways.push(giveaway)
  await db.write()

  return giveaway
})
