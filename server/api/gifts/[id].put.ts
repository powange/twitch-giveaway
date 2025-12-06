import { getDb, type Gift } from '../../utils/db'
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

  if (!body.title || !body.image) {
    throw createError({
      statusCode: 400,
      message: 'Le titre et l\'image sont requis',
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

  const updatedGift: Gift = {
    id: db.data.gifts[giftIndex]!.id,
    title: body.title,
    image: body.image,
  }

  db.data.gifts[giftIndex] = updatedGift
  await db.write()
  await broadcastUpdate()

  return updatedGift
})
