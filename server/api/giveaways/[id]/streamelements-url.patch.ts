import { getDb } from '../../../utils/db'
import { broadcastUpdate } from '../../../utils/sse'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'ID requis',
    })
  }

  if (typeof body.streamElementsUrl !== 'string') {
    throw createError({
      statusCode: 400,
      message: 'URL StreamElements requise',
    })
  }

  const db = await getDb()
  const giveaway = db.data.giveaways.find(g => g.id === id)

  if (!giveaway) {
    throw createError({
      statusCode: 404,
      message: 'Giveaway non trouvé',
    })
  }

  // Mettre à jour le type en streamelements si nécessaire
  giveaway.type = 'streamelements'
  giveaway.streamElementsUrl = body.streamElementsUrl
  await db.write()
  await broadcastUpdate()

  return giveaway
})
