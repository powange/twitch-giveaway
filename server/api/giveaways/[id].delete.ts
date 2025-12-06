import { getDb } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'Giveaway ID is required'
    })
  }

  const db = await getDb()
  const index = db.data.giveaways.findIndex(g => g.id === id)

  if (index === -1) {
    throw createError({
      statusCode: 404,
      message: 'Giveaway not found'
    })
  }

  const deleted = db.data.giveaways.splice(index, 1)[0]
  await db.write()

  return deleted
})
