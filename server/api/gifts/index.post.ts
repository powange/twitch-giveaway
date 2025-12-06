import { getDb } from '../../utils/db'
import { broadcastUpdate } from '../../utils/sse'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body.title || !body.image) {
    throw createError({
      statusCode: 400,
      message: 'Le titre et l\'image sont requis',
    })
  }

  const db = await getDb()

  const gift = {
    id: crypto.randomUUID(),
    title: body.title,
    image: body.image,
  }

  db.data.gifts.push(gift)
  await db.write()
  await broadcastUpdate()

  return gift
})
