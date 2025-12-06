import { getDb } from '../../utils/db'
import { broadcastUpdate } from '../../utils/sse'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'ID requis',
    })
  }

  const db = await getDb()

  const giftIndex = db.data.gifts.findIndex(g => g.id === id)

  if (giftIndex === -1) {
    throw createError({
      statusCode: 404,
      message: 'Cadeau non trouvé',
    })
  }

  // Vérifier si le cadeau est utilisé par un giveaway
  const isUsed = db.data.giveaways.some(giveaway => giveaway.giftIds.includes(id))
  if (isUsed) {
    throw createError({
      statusCode: 400,
      message: 'Ce cadeau est utilisé par un ou plusieurs giveaways',
    })
  }

  db.data.gifts.splice(giftIndex, 1)
  await db.write()
  await broadcastUpdate()

  return { success: true }
})
