export interface Player {
  id: string
  name: string
  points: number
}

export interface Room {
  id: string
  name: string
  players: Player[]
}
