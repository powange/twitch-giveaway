import { join } from 'path'
import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'

export interface Gift {
  id: string
  title: string
  image: string
}

export interface Giveaway {
  id: string
  twitchChannel: string
  date: string
  giftId: string
  type: 'command' | 'ticket' | 'streamelements'
  streamElementsUrl?: string
  drawTime?: string
  requireFollow: boolean
  createdAt: string
}

interface Database {
  gifts: Gift[]
  giveaways: Giveaway[]
}

const defaultData: Database = { gifts: [], giveaways: [] }

let db: Low<Database> | null = null

export async function getDb(): Promise<Low<Database>> {
  if (db) return db

  const file = join(process.cwd(), 'data', 'db.json')
  const adapter = new JSONFile<Database>(file)
  db = new Low(adapter, defaultData)

  await db.read()

  // S'assurer que tous les champs existent (migration)
  db.data.gifts = db.data.gifts || []
  db.data.giveaways = db.data.giveaways || []

  return db
}
