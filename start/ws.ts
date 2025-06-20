import { Server } from 'socket.io'
import server from '@adonisjs/core/services/server'
import app from '@adonisjs/core/services/app'
import { DISNEY_WORDS } from '../app/constants/index.js'

interface Player {
  id: string
  name: string
  score: number
  isDrawing: boolean
  hasGuessed: boolean
  isCreator: boolean
}

interface Room {
  id: string
  players: Map<string, Player>
  currentWord: string
  currentDrawer: string
  gameStarted: boolean
  round: number
  maxRounds: number
  roundStartTime: number
  roundDuration: number
  guessedPlayers: Set<string>
  currentRoundDrawers: string[]
  currentDrawerIndex: number
  roundTimer: NodeJS.Timeout | null
}

const rooms = new Map<string, Room>()

export default async function startSocketServer() {
  const io = new Server(server.getNodeServer(), {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  })

  io.on('connection', (socket) => {
    socket.on('join-room', (data) => {
      const { roomId, playerName } = data

      if (!roomId || !playerName) return

      socket.join(roomId)

      // Créer la room si elle n'existe pas
      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          id: roomId,
          players: new Map(),
          currentWord: '',
          currentDrawer: '',
          gameStarted: false,
          round: 0,
          maxRounds: 5,
          roundStartTime: 0,
          roundDuration: 60000,
          guessedPlayers: new Set(),
          currentRoundDrawers: [],
          currentDrawerIndex: 0,
          roundTimer: null,
        })
      }

      const room = rooms.get(roomId)!

      // Ajouter le joueur à la room
      const isFirstPlayer = room.players.size === 0
      room.players.set(socket.id, {
        id: socket.id,
        name: playerName,
        score: 0,
        isDrawing: false,
        hasGuessed: false,
        isCreator: isFirstPlayer, // <-- AJOUT
      })

      // Envoyer la liste des joueurs
      const playersList = Array.from(room.players.values())
      io.to(roomId).emit('players-updated', playersList)

      // Envoyer les informations de la room
      socket.emit('room-info', {
        roomId: roomId,
        gameStarted: room.gameStarted,
        round: room.round,
        maxRounds: room.maxRounds,
      })
    })

    socket.on('start-game', (roomId) => {
      const room = rooms.get(roomId)
      if (!room || room.players.size < 2) return

      room.gameStarted = true

      room.currentRoundDrawers = Array.from(room.players.keys())
      room.currentDrawerIndex = 0
      room.round = 1
      startNewRound(room, io)
    })

    socket.on('drawing', (data) => {
      const { roomId, drawingData } = data
      socket.to(roomId).emit('drawing', drawingData)
    })

    socket.on('guess', (data) => {
      const { roomId, guess } = data
      const room = rooms.get(roomId)
      if (!room) return

      const player = room.players.get(socket.id)
      if (!player || player.isDrawing || player.hasGuessed) return

      // Vérifier si la réponse est correcte
      if (guess.toLowerCase() === room.currentWord.toLowerCase()) {
        player.hasGuessed = true
        room.guessedPlayers.add(socket.id)

        // Calculer les points
        const timeElapsed = Date.now() - room.roundStartTime
        const timeBonus = Math.max(0, Math.floor((room.roundDuration - timeElapsed) / 1000))
        const points = 100 + timeBonus
        player.score += points

        // Points pour le dessinateur
        const drawer = room.players.get(room.currentDrawer)
        if (drawer) {
          drawer.score += 50
        }

        io.to(roomId).emit('correct-guess', {
          playerName: player.name,
          word: room.currentWord,
          points: points,
        })

        // Vérifier si tous les joueurs ont trouvé
        const nonDrawingPlayers = Array.from(room.players.values()).filter((p) => !p.isDrawing)
        if (room.guessedPlayers.size === nonDrawingPlayers.length) {
          endRound(room, io)
        }
      } else {
        // Diffuser la tentative aux autres joueurs
        io.to(roomId).emit('chat-message', {
          playerName: player.name,
          message: guess,
          isGuess: true,
        })
      }

      // Mettre à jour les joueurs
      const playersList = Array.from(room.players.values())
      io.to(roomId).emit('players-updated', playersList)
    })

    socket.on('chat-message', (data) => {
      const { roomId, message } = data
      const room = rooms.get(roomId)
      if (!room) return

      const player = room.players.get(socket.id)
      if (!player) return

      io.to(roomId).emit('chat-message', {
        playerName: player.name,
        message: message,
        isGuess: false,
      })
    })

    socket.on('clear-canvas', (roomId) => {
      socket.to(roomId).emit('clear-canvas')
    })

    socket.on('disconnect', () => {
      // Retirer le joueur de toutes les rooms
      for (const [roomId, room] of rooms.entries()) {
        if (room.players.has(socket.id)) {
          room.players.delete(socket.id)
          room.guessedPlayers.delete(socket.id)

          // Si c'était le dessinateur, passer au suivant
          if (room.currentDrawer === socket.id && room.gameStarted) {
            endRound(room, io)
          }

          // Mettre à jour les joueurs
          const playersList = Array.from(room.players.values())
          io.to(roomId).emit('players-updated', playersList)

          // Supprimer la room si elle est vide
          if (room.players.size === 0) {
            rooms.delete(roomId)
          }

          break
        }
      }
    })
  })

  // eslint-disable-next-line @typescript-eslint/no-shadow
  function startNewRound(room: Room, io: Server) {
    room.players.forEach((player) => {
      player.isDrawing = false
      player.hasGuessed = false
    })
    room.guessedPlayers.clear()

    // Prend le dessinateur courant
    room.currentDrawer = room.currentRoundDrawers[room.currentDrawerIndex]

    const drawer = room.players.get(room.currentDrawer)!
    drawer.isDrawing = true

    // Choisir un mot aléatoire
    room.currentWord = DISNEY_WORDS[Math.floor(Math.random() * DISNEY_WORDS.length)]
    room.roundStartTime = Date.now()

    // Informer tous les joueurs
    io.to(room.id).emit('round-start', {
      round: room.round,
      drawer: drawer.name,
      word: room.currentWord,
      isDrawing: false,
      duration: room.roundDuration / 1000,
    })

    // Informer le dessinateur du mot
    io.to(room.currentDrawer).emit('round-start', {
      round: room.round,
      drawer: drawer.name,
      word: room.currentWord,
      isDrawing: true,
      duration: room.roundDuration / 1000,
    })

    // Effacer le canvas
    io.to(room.id).emit('clear-canvas')

    // Timer pour la fin du round
    room.roundTimer = setTimeout(() => {
      if (rooms.has(room.id)) {
        endRound(room, io)
      }
    }, room.roundDuration)
  }

  // eslint-disable-next-line @typescript-eslint/no-shadow
  function endRound(room: Room, io: Server) {
    // Arrêter le timer du round s'il existe
    if (room.roundTimer) {
      clearTimeout(room.roundTimer)
      room.roundTimer = null
    }

    // Récupère les scores de la manche
    const roundScores = Array.from(room.players.values()).map((p) => ({
      name: p.name,
      score: p.score,
    }))

    io.to(room.id).emit('round-end', {
      word: room.currentWord,
      scores: roundScores,
    })

    const lastDrawer = room.currentDrawer

    room.currentDrawerIndex++
    if (room.currentDrawerIndex >= room.currentRoundDrawers.length) {
      room.round++
      if (room.round > room.maxRounds) {
        endGame(room, io)
      } else {
        room.currentRoundDrawers = shuffle(Array.from(room.players.keys()))

        if (room.currentRoundDrawers.length > 1 && room.currentRoundDrawers[0] === lastDrawer) {
          const randomIndex = 1 + Math.floor(Math.random() * (room.currentRoundDrawers.length - 1))
          ;[room.currentRoundDrawers[0], room.currentRoundDrawers[randomIndex]] = [
            room.currentRoundDrawers[randomIndex],
            room.currentRoundDrawers[0],
          ]
        }

        room.currentDrawerIndex = 0
        setTimeout(() => {
          if (rooms.has(room.id)) startNewRound(room, io)
        }, 3000)
      }
    } else {
      setTimeout(() => {
        if (rooms.has(room.id)) startNewRound(room, io)
      }, 3000)
    }
  }

  function shuffle(array: string[]) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[array[i], array[j]] = [array[j], array[i]]
    }
    return array
  }

  // eslint-disable-next-line @typescript-eslint/no-shadow
  function endGame(room: Room, io: Server) {
    const finalScores = Array.from(room.players.values())
      .sort((a, b) => b.score - a.score)
      .map((p) => ({ name: p.name, score: p.score }))

    io.to(room.id).emit('game-end', {
      winner: finalScores[0],
      scores: finalScores,
    })

    // Réinitialiser la room
    room.gameStarted = false
    room.round = 0
    room.currentDrawer = ''
    room.currentWord = ''
    room.players.forEach((player) => {
      player.score = 0
      player.isDrawing = false
      player.hasGuessed = false
    })
    room.guessedPlayers.clear()

    // Supprimer la room pour empêcher de continuer
    rooms.delete(room.id)
  }
}

// Démarrer le serveur Socket.IO
await app.ready(async () => {
  await startSocketServer()
})
