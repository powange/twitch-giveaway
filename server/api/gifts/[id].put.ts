import { getDb } from '../../utils/db'

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

  const updatedGift = {
    ...db.data.gifts[giftIndex],
    title: body.title,
    image: body.image,
  }

  db.data.gifts[giftIndex] = updatedGift
  await db.write()

  return updatedGift
})
