const SEA_OF_THIEVES_GAME_ID = '490377'

interface TwitchTokenResponse {
  access_token: string
  expires_in: number
  token_type: string
}

interface TwitchStream {
  id: string
  user_id: string
  user_login: string
  user_name: string
  game_id: string
  game_name: string
  type: string
  title: string
  viewer_count: number
  started_at: string
  language: string
  thumbnail_url: string
}

interface TwitchStreamsResponse {
  data: TwitchStream[]
  pagination: { cursor?: string }
}

// Cache du token pour éviter de le redemander à chaque requête
let cachedToken: { token: string, expiresAt: number } | null = null

// Cache des résultats de streams (30 secondes)
const STREAMS_CACHE_TTL = 30 * 1000
let cachedStreams: { data: unknown[], cachedAt: number } | null = null

async function getAppAccessToken(clientId: string, clientSecret: string): Promise<string> {
  // Vérifier si on a un token en cache encore valide (avec 5 min de marge)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 300000) {
    return cachedToken.token
  }

  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials'
    })
  })

  if (!response.ok) {
    throw new Error(`Failed to get Twitch token: ${response.status}`)
  }

  const data = await response.json() as TwitchTokenResponse

  // Mettre en cache
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000
  }

  return data.access_token
}

async function fetchAllStreams(
  clientId: string,
  accessToken: string,
  gameId: string
): Promise<TwitchStream[]> {
  const allStreams: TwitchStream[] = []
  let cursor: string | undefined

  // Pagination pour récupérer tous les streams (max 100 par requête)
  do {
    const url = new URL('https://api.twitch.tv/helix/streams')
    url.searchParams.set('game_id', gameId)
    url.searchParams.set('first', '100')
    if (cursor) {
      url.searchParams.set('after', cursor)
    }

    const response = await fetch(url.toString(), {
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${accessToken}`
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch streams: ${response.status}`)
    }

    const data = await response.json() as TwitchStreamsResponse
    allStreams.push(...data.data)
    cursor = data.pagination.cursor

    // Limite de sécurité : max 500 streams
    if (allStreams.length >= 500) break
  } while (cursor)

  return allStreams
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)

  if (!config.twitchClientId || !config.twitchClientSecret) {
    throw createError({
      statusCode: 500,
      message: 'Twitch credentials not configured'
    })
  }

  // Vérifier le cache
  if (cachedStreams && Date.now() - cachedStreams.cachedAt < STREAMS_CACHE_TTL) {
    return cachedStreams.data
  }

  try {
    // Obtenir le token
    const accessToken = await getAppAccessToken(
      config.twitchClientId,
      config.twitchClientSecret
    )

    // Récupérer tous les streams Sea of Thieves
    const streams = await fetchAllStreams(
      config.twitchClientId,
      accessToken,
      SEA_OF_THIEVES_GAME_ID
    )

    // Filtrer ceux qui contiennent "giveaway" dans le titre (insensible à la casse)
    const giveawayStreams = streams.filter(stream =>
      stream.title.toLowerCase().includes('giveaway')
    )

    // Formater la réponse
    const result = giveawayStreams.map(stream => ({
      url: `https://twitch.tv/${stream.user_login}`,
      title: stream.title,
      viewerCount: stream.viewer_count,
      streamerName: stream.user_name,
      startedAt: stream.started_at,
      thumbnail: stream.thumbnail_url.replace('{width}', '320').replace('{height}', '180')
    }))

    // Mettre en cache
    cachedStreams = { data: result, cachedAt: Date.now() }

    return result
  } catch (error) {
    console.error('Twitch API error:', error)
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Failed to fetch Twitch streams'
    })
  }
})
