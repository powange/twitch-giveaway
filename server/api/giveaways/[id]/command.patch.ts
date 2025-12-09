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

  if (typeof body.command !== 'string') {
    throw createError({
      statusCode: 400,
      message: 'Commande requise',
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

  if (giveaway.type !== 'command' && giveaway.type !== 'ticket') {
    throw createError({
      statusCode: 400,
      message: 'Ce giveaway n\'est pas de type commande ou ticket',
    })
  }

  giveaway.command = body.command
  await db.write()
  await broadcastUpdate()

  return giveaway
})
