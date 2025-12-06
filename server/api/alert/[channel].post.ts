import { broadcastDrawAlert } from '../../utils/sse'

export default defineEventHandler((event) => {
  const channel = getRouterParam(event, 'channel')

  if (!channel) {
    throw createError({
      statusCode: 400,
      message: 'Channel requis',
    })
  }

  broadcastDrawAlert(channel)

  return { success: true, channel }
})
